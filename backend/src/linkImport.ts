/**
 * Link import service — SoundCloud via yt-dlp.
 *
 * Flow: POST /api/audio/resolve {url} -> metadata
 *       POST /api/audio/stream  {url} -> direct media URL for browser fetch
 *       POST /api/audio/jobs {url}    -> {jobId} (queued server download)
 *       GET  /api/audio/jobs/:id      -> status + progress
 *       GET  /api/audio/file/:id      -> cached mp3 (range-capable)
 *
 * Two download paths: browsers fetch the minted stream URL directly, falling
 * back to the server-side job queue. YouTube is not supported (see below).
 *
 * Spotify links are rejected: no legal full-track download path exists.
 * YouTube links are rejected: YouTube blocks datacenter IPs at the media CDN
 * level, so server-side YouTube downloads cannot work from typical hosts.
 * VM deploy needs yt-dlp + ffmpeg + a JS runtime (deno) on PATH.
 */

import { execFile, spawn } from "child_process";
import type { Express, Request, Response } from "express";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export type Platform = "soundcloud";

// YouTube hostnames are recognized only to reject them with a clear message
// (see routes below). They are never passed to yt-dlp.

const YTDLP_BIN = process.env.YTDLP_BIN || "yt-dlp";
// Optional egress override for link import. Passed as yt-dlp --proxy for
// metadata, stream-minting and download calls. Never logged.
const YTDLP_PROXY = process.env.YTDLP_PROXY || process.env.LINKIMPORT_PROXY || "";
const CACHE_DIR = path.resolve(process.cwd(), "data", "audio-cache");
const DEFAULT_COOKIES_FILE = path.resolve(process.cwd(), "data", "cookies.txt");
const MAX_MINUTES = Number(process.env.MAX_AUDIO_MINUTES || 15);
const MAX_CONCURRENT = Number(process.env.LINKIMPORT_CONCURRENCY || 2);
const MAX_CACHE_MB = Number(process.env.AUDIO_CACHE_MB || 1024);
const MAX_CACHE_FILES = Number(process.env.AUDIO_CACHE_FILES || 100);
const RESOLVE_TIMEOUT_MS = 45_000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const SOUNDCLOUD_HOSTS = new Set([
  "soundcloud.com",
  "www.soundcloud.com",
  "m.soundcloud.com",
  "on.soundcloud.com",
  "snd.sc",
]);

export function detectPlatform(rawUrl: string): Platform | "spotify" | "youtube" | null {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (YOUTUBE_HOSTS.has(host)) return "youtube";
  if (SOUNDCLOUD_HOSTS.has(host)) return "soundcloud";
  if (host === "open.spotify.com" || host.endsWith(".spotify.com")) return "spotify";
  return null;
}

export interface CanonicalLink {
  url: string;
  playlistStripped: boolean;
}

export interface ResolvedMeta {
  platform: Platform;
  id: string;
  title: string;
  duration: number;
  uploader?: string;
  thumbnail?: string;
}

export function canonicalizeLink(rawUrl: string, platform: Platform): CanonicalLink {
  const trimmed = rawUrl.trim();
  // SoundCloud: strip tracking query/hash, keep canonical path.
  try {
    const parsed = new URL(trimmed);
    parsed.search = "";
    parsed.hash = "";
    return { url: parsed.toString(), playlistStripped: false };
  } catch {
    return { url: trimmed, playlistStripped: false };
  }
}

function sanitizeTitle(title: string): string {
  return (
    title
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "track"
  );
}

/**
 * Cookies are optional. YTDLP_COOKIES_FILE wins when set; otherwise a
 * cookies.txt sitting next to the cache (backend/data/cookies.txt) is picked
 * up automatically, so dropping the file in needs no restart or compose edit.
 * Returns undefined when no usable cookie file exists — passing a missing
 * --cookies path would make yt-dlp fail outright.
 */
function cookiesFile(): string | undefined {
  const configured = process.env.YTDLP_COOKIES_FILE;
  if (configured) {
    return existsSync(configured) ? configured : undefined;
  }
  return existsSync(DEFAULT_COOKIES_FILE) ? DEFAULT_COOKIES_FILE : undefined;
}

export function linkImportDiagnostics() {
  return {
    ytDlp: YTDLP_BIN,
    proxy: YTDLP_PROXY ? { configured: true } : { configured: false },
    cookies: cookiesFile()
      ? { configured: true, source: "auto-detected" }
      : { configured: false, hint: "Drop a Netscape cookies.txt at backend/data/cookies.txt" },
  };
}

function proxyArgs(): string[] {
  return YTDLP_PROXY ? ["--proxy", YTDLP_PROXY] : [];
}

function cookieArgs(): string[] {
  const file = cookiesFile();
  return file ? ["--cookies", file] : [];
}

function extraArgs(): string[] {
  const raw = (process.env.YTDLP_EXTRA_ARGS || "").trim();
  return raw ? raw.split(/\s+/) : [];
}

const DRM_RE = /drm protected/i;

/**
 * SoundCloud marks some streams DRM-protected for third-party clients.
 * Not the user's fault, so the message says what happened and what works.
 */
function friendlyError(rawTail: string, platform: Platform): string {
  if (DRM_RE.test(rawTail)) {
    return "That SoundCloud track is DRM-protected and can't be imported. Try another track or upload the audio file directly.";
  }
  return `Could not read that link (${rawTail.slice(0, 160)})`;
}

interface PickedStream {
  url: string;
  ext: string;
  mime: string;
  formatId?: string;
}

/**
 * Pick a browser-downloadable stream from dump-json formats. Browsers can only
 * fetch progressive HTTP(S) bytes — HLS/DASH playlists (m3u8, segmented) need
 * a streaming client the app doesn't ship, and decodeAudioData rejects them
 * with EncodingError. So: audio-only progressive first, then any progressive
 * format carrying audio, never playlists. Returns null when only segmented
 * streams exist (caller falls back to the server job queue, where ffmpeg
 * handles HLS natively).
 */
function pickStreamUrl(info: any): PickedStream | null {
  const formats = Array.isArray(info?.formats) ? info.formats : [];
  const isProgressive = (f: any) =>
    typeof f?.url === "string" &&
    f.url.startsWith("http") &&
    typeof f?.protocol === "string" &&
    /^(https?|http)$/.test(f.protocol);
  const progressive = formats.filter(isProgressive);
  if (!progressive.length) return null;
  const hasAudio = (f: any) => f.acodec && f.acodec !== "none";
  const audioOnly = progressive
    .filter((f: any) => hasAudio(f) && (!f.vcodec || f.vcodec === "none"))
    .sort((a: any, b: any) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0));
  const withAudio = progressive
    .filter((f: any) => hasAudio(f))
    .sort((a: any, b: any) => (a.filesize || a.filesize_approx || Infinity) - (b.filesize || b.filesize_approx || Infinity));
  const chosen = audioOnly[0] || withAudio[0];
  if (!chosen) return null;
  const ext = String(chosen.ext || "mp4");
  const mime =
    ext === "webm" ? "audio/webm" : ext === "mp3" ? "audio/mpeg" : "audio/mp4";
  return { url: chosen.url, ext, mime, formatId: chosen.format_id };
}

async function ytDlpJson(url: string, platform: Platform): Promise<any> {
  return new Promise((resolve, reject) => {
    execFile(
      YTDLP_BIN,
      [
        "--no-playlist",
        "--no-download",
        "--dump-json",
        "--no-warnings",
        "--socket-timeout",
        "20",
        ...proxyArgs(),
        ...cookieArgs(),
        ...extraArgs(),
        url,
      ],
      { timeout: RESOLVE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const tail = String(stderr || err.message).slice(-500);
          return reject(new Error(friendlyError(tail, platform)));
        }
        try {
          resolve(JSON.parse(String(stdout).split("\n").find((l) => l.trim()) || "{}"));
        } catch {
          reject(new Error("Could not parse link metadata."));
        }
      }
    );
  });
}

// ---------- job queue ----------

interface Job {
  id: string;
  url: string;
  platform: Platform;
  meta: ResolvedMeta;
  status: "queued" | "working" | "done" | "error";
  progress: number;
  error?: string;
  fileName?: string;
  createdAt: number;
}

const jobs = new Map<string, Job>();
let activeCount = 0;

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Simple per-IP sliding-window limiter (ponytail: in-memory, single instance only)
const hits = new Map<string, number[]>();
function rateLimited(ip: string, key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const k = `${key}:${ip}`;
  const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(k, arr);
  return arr.length > max;
}

async function evictCache(): Promise<void> {
  try {
    const entries = await fs.readdir(CACHE_DIR);
    if (!entries.length) return;
    const stats = await Promise.all(
      entries.map(async (name) => {
        const p = path.join(CACHE_DIR, name);
        try {
          const s = await fs.stat(p);
          return { name, path: p, size: s.size, mtime: s.mtimeMs };
        } catch {
          return null;
        }
      })
    );
    const valid = stats.filter(Boolean) as { name: string; path: string; size: number; mtime: number }[];
    valid.sort((a, b) => a.mtime - b.mtime);
    let totalBytes = valid.reduce((n, f) => n + f.size, 0);
    const maxBytes = MAX_CACHE_MB * 1024 * 1024;
    for (const f of valid) {
      if (totalBytes <= maxBytes && valid.length <= MAX_CACHE_FILES) break;
      await fs.unlink(f.path).catch(() => {});
      totalBytes -= f.size;
      valid.splice(valid.indexOf(f), 1);
    }
  } catch {
    // cache dir missing — created on first download
  }
}

function pumpQueue(): void {
  if (activeCount >= MAX_CONCURRENT) return;
  const next = [...jobs.values()].find((j) => j.status === "queued");
  if (!next) return;
  activeCount += 1;
  next.status = "working";
  runDownload(next)
    .catch((err: Error) => {
      next.status = "error";
      next.error = err.message;
    })
    .finally(() => {
      activeCount -= 1;
      evictCache().catch(() => {});
      pumpQueue();
    });
}

function runDownload(job: Job): Promise<void> {
  return new Promise((resolve, reject) => {
    const outTemplate = path.join(CACHE_DIR, `${job.id}.%(ext)s`);
    const args = [
      "--no-playlist",
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "--newline",
      "--progress",
      "--no-warnings",
      "--socket-timeout",
      "20",
      "-o",
      outTemplate,
      ...proxyArgs(),
      ...cookieArgs(),
      ...extraArgs(),
      job.url,
    ];
    const child = spawn(YTDLP_BIN, args, { timeout: DOWNLOAD_TIMEOUT_MS });
    let errTail = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Download timed out after 10 minutes."));
    }, DOWNLOAD_TIMEOUT_MS + 5_000);

    child.stderr.on("data", (d: Buffer) => {
      const text = d.toString();
      errTail = (errTail + text).slice(-2000);
      const m = text.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
      if (m) job.progress = Math.min(99, Math.round(Number(m[1])));
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          err.message.includes("ENOENT")
            ? "yt-dlp is not installed on the server (YTDLP_BIN)."
            : err.message
        )
      );
    });
    child.on("close", async (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        if (DRM_RE.test(errTail)) {
          return reject(new Error(friendlyError(errTail, job.platform)));
        }
        return reject(new Error(`Download failed (${errTail.slice(-180) || `exit ${code}`})`));
      }
      try {
        await fs.mkdir(CACHE_DIR, { recursive: true });
        const filePath = path.join(CACHE_DIR, `${job.id}.mp3`);
        await fs.stat(filePath);
        job.fileName = `${sanitizeTitle(job.meta.title)}.mp3`;
        job.progress = 100;
        job.status = "done";
        resolve();
      } catch {
        reject(new Error("Download finished but no audio file was produced."));
      }
    });
  });
}

// prune finished job records after 2h (files stay under cache policy)
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if ((job.status === "done" || job.status === "error") && now - job.createdAt > 2 * 3600_000) {
      jobs.delete(id);
    }
  }
}, 30 * 60_000).unref?.();

// ---------- routes ----------

export function registerLinkImportRoutes(app: Express): void {
  app.post("/api/audio/resolve", async (req: Request, res: Response) => {
    const ip = req.ip || "unknown";
    if (rateLimited(ip, "resolve", 30, 60_000)) {
      return res.status(429).json({ error: "Too many requests. Slow down." });
    }
    const { url } = req.body || {};
    if (typeof url !== "string" || !url.trim()) {
      return res.status(400).json({ error: "URL is required." });
    }
    const platform = detectPlatform(url.trim());
    if (platform === "youtube") {
      return res.status(400).json({
        error: "YouTube links are no longer supported — paste a SoundCloud link or upload the audio file directly.",
      });
    }
    if (platform === "spotify") {
      return res.status(400).json({
        error: "Spotify links are not supported. Spotify offers no legal full-track download; paste a SoundCloud link instead.",
      });
    }
    if (!platform) {
      return res.status(400).json({ error: "Only SoundCloud links are supported." });
    }
    let canonical: CanonicalLink;
    try {
      canonical = canonicalizeLink(url.trim(), platform);
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
    try {
      const info = await ytDlpJson(canonical.url, platform);
      const duration = Math.round(Number(info.duration || 0));
      if (duration > MAX_MINUTES * 60) {
        return res.status(400).json({ error: `Track too long (max ${MAX_MINUTES} minutes).` });
      }
      const meta: ResolvedMeta = {
        platform,
        id: String(info.id || newId()),
        title: String(info.title || "Untitled"),
        duration,
        uploader: info.uploader || info.channel || undefined,
        thumbnail: info.thumbnail || undefined,
      };
      res.json({ ok: true, meta, canonicalUrl: canonical.url, playlistStripped: canonical.playlistStripped });
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  // Direct browser-fetch endpoint. Mints a short-lived media URL (from the
  // same dump-json call used for metadata) so the *visitor's* browser can
  // pull the bytes directly — fastest path with no server bandwidth or cache
  // involved. Never logs the URL: it carries a per-track signature. Falls
  // back to the server job queue when the browser can't fetch.
  app.post("/api/audio/stream", async (req: Request, res: Response) => {
    const ip = req.ip || "unknown";
    if (rateLimited(ip, "stream", 30, 60_000)) {
      return res.status(429).json({ error: "Too many requests. Slow down." });
    }
    const { url } = req.body || {};
    if (typeof url !== "string" || !url.trim()) {
      return res.status(400).json({ error: "URL is required." });
    }
    const platform = detectPlatform(url.trim());
    if (platform === "youtube") {
      return res.status(400).json({
        error: "YouTube links are no longer supported — paste a SoundCloud link or upload the audio file directly.",
      });
    }
    if (platform === "spotify") {
      return res.status(400).json({
        error: "Spotify links are not supported. Spotify offers no legal full-track download; paste a SoundCloud link instead.",
      });
    }
    if (!platform) {
      return res.status(400).json({ error: "Only SoundCloud links are supported." });
    }
    let canonical: CanonicalLink;
    try {
      canonical = canonicalizeLink(url.trim(), platform);
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
    try {
      const info = await ytDlpJson(canonical.url, platform);
      const duration = Math.round(Number(info.duration || 0));
      if (duration > MAX_MINUTES * 60) {
        return res.status(400).json({ error: `Track too long (max ${MAX_MINUTES} minutes).` });
      }
      const picked = pickStreamUrl(info);
      if (!picked) {
        return res.status(502).json({
          error: "No playable audio stream was found for that link. Try another link or upload the audio file directly.",
        });
      }
      let expiresAt: number | undefined;
      try {
        const exp = new URL(picked.url).searchParams.get("expire");
        if (exp) expiresAt = Number(exp) * 1000;
      } catch {
        // Non-URL stream — leave expiresAt unset; the client uses it promptly.
      }
      const title = String(info.title || "Untitled");
      res.json({
        ok: true,
        streamUrl: picked.url,
        expiresAt,
        fileName: `${sanitizeTitle(title)}.${picked.ext}`,
        mime: picked.mime,
        meta: {
          platform,
          id: String(info.id || newId()),
          title,
          duration,
          uploader: info.uploader || info.channel || undefined,
          thumbnail: info.thumbnail || undefined,
        },
      });
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  app.post("/api/audio/jobs", async (req: Request, res: Response) => {
    const ip = req.ip || "unknown";
    if (rateLimited(ip, "job", 6, 60_000)) {
      return res.status(429).json({ error: "Too many downloads. Wait a minute." });
    }
    const { url } = req.body || {};
    if (typeof url !== "string" || !url.trim()) {
      return res.status(400).json({ error: "URL is required." });
    }
    const platform = detectPlatform(url.trim());
    if (platform === "youtube") {
      return res.status(400).json({
        error: "YouTube links are no longer supported — paste a SoundCloud link or upload the audio file directly.",
      });
    }
    if (platform === "spotify") {
      return res.status(400).json({
        error: "Spotify links are not supported. Spotify offers no legal full-track download; paste a SoundCloud link instead.",
      });
    }
    if (!platform) {
      return res.status(400).json({ error: "Only SoundCloud links are supported." });
    }
    let canonical: CanonicalLink;
    try {
      canonical = canonicalizeLink(url.trim(), platform);
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
    const activeForIp = [...jobs.values()].filter(
      (j) => (j.status === "queued" || j.status === "working")
    ).length;
    if (activeForIp >= MAX_CONCURRENT * 2) {
      return res.status(429).json({ error: "Download queue is full. Try again shortly." });
    }
    try {
      const info = await ytDlpJson(canonical.url, platform);
      const duration = Math.round(Number(info.duration || 0));
      if (duration > MAX_MINUTES * 60) {
        return res.status(400).json({ error: `Track too long (max ${MAX_MINUTES} minutes).` });
      }
      const job: Job = {
        id: newId(),
        url: canonical.url,
        platform,
        meta: {
          platform,
          id: String(info.id || ""),
          title: String(info.title || "Untitled"),
          duration,
          uploader: info.uploader || info.channel || undefined,
          thumbnail: info.thumbnail || undefined,
        },
        status: "queued",
        progress: 0,
        createdAt: Date.now(),
      };
      jobs.set(job.id, job);
      await fs.mkdir(CACHE_DIR, { recursive: true });
      pumpQueue();
      res.status(202).json({ ok: true, jobId: job.id, meta: job.meta });
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  app.get("/api/audio/jobs/:id", (req: Request, res: Response) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found." });
    res.json({
      ok: true,
      job: {
        id: job.id,
        status: job.status,
        progress: job.progress,
        error: job.error,
        meta: job.meta,
        fileUrl: job.status === "done" ? `/api/audio/file/${job.id}` : undefined,
        fileName: job.fileName,
      },
    });
  });

  app.get("/api/audio/file/:id", async (req: Request, res: Response) => {
    const job = jobs.get(req.params.id);
    const filePath = path.join(CACHE_DIR, `${req.params.id}.mp3`);
    try {
      await fs.stat(filePath);
    } catch {
      return res.status(404).json({ error: "Audio file not found or expired." });
    }
    res.setHeader("Content-Type", "audio/mpeg");
    if (job?.fileName) {
      res.setHeader("Content-Disposition", `inline; filename="${job.fileName.replace(/"/g, "")}"`);
    }
    res.sendFile(filePath);
  });
}
