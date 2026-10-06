/**
 * Link import service — YouTube + SoundCloud via yt-dlp.
 *
 * Flow: POST /api/audio/resolve {url} -> metadata
 *       POST /api/audio/jobs {url}    -> {jobId} (queued)
 *       GET  /api/audio/jobs/:id      -> status + progress
 *       GET  /api/audio/file/:id      -> cached mp3 (range-capable)
 *
 * Spotify links are rejected: no legal full-track download path exists.
 * VM deploy needs yt-dlp + ffmpeg + a JS runtime (deno) on PATH.
 * Set YTDLP_COOKIES_FILE when YouTube serves bot-checks/403s.
 */

import { execFile, spawn } from "child_process";
import type { Express, Request, Response } from "express";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export type Platform = "youtube" | "soundcloud";

const YTDLP_BIN = process.env.YTDLP_BIN || "yt-dlp";
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

export function detectPlatform(rawUrl: string): Platform | "spotify" | null {
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
  try {
    const parsed = new URL(trimmed);
    if (platform === "youtube") {
      const params = parsed.searchParams;
      // Single video id from ?v=, youtu.be/<id>, /shorts/<id>, /embed/<id>, /live/<id>, /v/<id>
      let videoId: string | null = null;
      const v = params.get("v");
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) videoId = v;
      if (!videoId) {
        const host = parsed.hostname.toLowerCase();
        const parts = parsed.pathname.split("/").filter(Boolean);
        if ((host === "youtu.be" || host === "www.youtu.be") && parts[0]?.match(/^[A-Za-z0-9_-]{11}$/)) {
          videoId = parts[0];
        } else if (parts.length >= 2 && ["shorts", "embed", "live", "v"].includes(parts[0]) && /^[A-Za-z0-9_-]{11}$/.test(parts[1])) {
          videoId = parts[1];
        }
      }
      const hadPlaylistParams =
        params.has("list") || params.has("start_radio") || params.has("pp") || params.has("index");
      if (videoId) {
        return {
          url: `https://www.youtube.com/watch?v=${videoId}`,
          playlistStripped: hadPlaylistParams,
        };
      }
      // Playlist/mix/radio without a single video id — --no-playlist can't handle these.
      if (params.has("list")) {
        throw new Error(
          "Playlists, mixes and radio links aren't supported — open the mix, click the video title to get its single-video link, and paste that instead."
        );
      }
      return { url: trimmed, playlistStripped: false };
    }
    // SoundCloud: strip tracking query/hash, keep canonical path.
    if (platform === "soundcloud") {
      parsed.search = "";
      parsed.hash = "";
      return { url: parsed.toString(), playlistStripped: false };
    }
    return { url: trimmed, playlistStripped: false };
  } catch (err) {
    // Re-throw our own playlist guidance untouched; malformed URLs fall through.
    if (err instanceof Error && /Playlists, mixes/.test(err.message)) throw err;
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
    cookies: cookiesFile()
      ? { configured: true, source: "auto-detected" }
      : { configured: false, hint: "Drop a Netscape cookies.txt at backend/data/cookies.txt" },
  };
}

function cookieArgs(): string[] {
  const file = cookiesFile();
  return file ? ["--cookies", file] : [];
}

function extraArgs(): string[] {
  const raw = (process.env.YTDLP_EXTRA_ARGS || "").trim();
  return raw ? raw.split(/\s+/) : [];
}

const BOT_CHECK_RE = /sign in to confirm|not a bot|403|forbidden/i;
const DRM_RE = /drm protected/i;

/**
 * YouTube blocks datacenter IPs with a "sign in to confirm you're not a bot"
 * challenge; cookies are the only reliable fix. SoundCloud marks most streams
 * DRM-protected for third-party clients. Neither is the user's fault, so the
 * message says what happened and what still works.
 */
function friendlyError(rawTail: string, platform: Platform): string {
  if (DRM_RE.test(rawTail)) {
    return `That ${platform === "soundcloud" ? "SoundCloud" : ""} track is DRM-protected and can't be imported. Try another track or upload the audio file directly.`.replace(
      /\s+/g,
      " "
    );
  }
  if (BOT_CHECK_RE.test(rawTail)) {
    return "YouTube is blocking downloads from this server right now, so the link couldn't be read. Try again later, or upload the audio file directly.";
  }
  return `Could not read that link (${rawTail.slice(0, 160)})`;
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
        ...cookieArgs(),
        ...extraArgs(),
        url,
      ],
      { timeout: RESOLVE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const tail = String(stderr || err.message).slice(-500);
          if (BOT_CHECK_RE.test(tail)) {
            console.warn(
              `[link-import] ${platform} bot-check blocked by the provider. ` +
                `Serve cookies to recover: see README "YouTube bot-checks / 403s".`
            );
          }
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
        if (BOT_CHECK_RE.test(errTail) || DRM_RE.test(errTail)) {
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
    if (platform === "spotify") {
      return res.status(400).json({
        error: "Spotify links are not supported. Spotify offers no legal full-track download; paste a YouTube or SoundCloud link instead.",
      });
    }
    if (!platform) {
      return res.status(400).json({ error: "Only YouTube and SoundCloud links are supported." });
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
    if (platform === "spotify") {
      return res.status(400).json({
        error: "Spotify links are not supported. Spotify offers no legal full-track download; paste a YouTube or SoundCloud link instead.",
      });
    }
    if (!platform) {
      return res.status(400).json({ error: "Only YouTube and SoundCloud links are supported." });
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
