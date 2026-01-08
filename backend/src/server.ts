/**
 * Backend Express Server
 * Handles optional server-side audio processing and encoding
 */

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import compression from "compression";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import ytdl from "ytdl-core";
import axios from "axios";

const app = express();

// Middleware
app.use(compression());
app.use(cors());
app.use(express.json({ limit: "50mb" }));
/**
 * Report bug endpoint
 * POST /api/report-bug
 * Body: { title: string, description: string, email?: string, meta?: any }
 * Persists to data/bug-reports.json (appended array)
 */
app.post("/api/report-bug", async (req: Request, res: Response) => {
  try {
    const { title, description, email, meta } = req.body || {};
    const t = typeof title === "string" ? title.trim() : "";
    const d = typeof description === "string" ? description.trim() : "";
    const e = typeof email === "string" ? email.trim() : "";
    if (!t || !d) {
      return res
        .status(400)
        .json({ error: "title and description are required" });
    }

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: t.slice(0, 200),
      description: d.slice(0, 5000),
      email: e.slice(0, 200) || undefined,
      meta: meta || {},
      userAgent: req.get("user-agent") || "",
      ip: req.ip,
      ts: new Date().toISOString(),
    };

    const dataDir = path.resolve(process.cwd(), "data");
    const reportFile = path.join(dataDir, "bug-reports.json");
    await fs.mkdir(dataDir, { recursive: true });

    let list: any[] = [];
    try {
      const existing = await fs.readFile(reportFile, "utf-8");
      list = JSON.parse(existing);
      if (!Array.isArray(list)) list = [];
    } catch {}

    list.unshift(entry);
    await fs.writeFile(reportFile, JSON.stringify(list, null, 2));

    res.json({ ok: true, id: entry.id });
  } catch (err) {
    console.error("report-bug error", err);
    res.status(500).json({ error: "failed to save bug report" });
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    const allowed = ["audio/mpeg", "audio/wav", "audio/aac", "audio/ogg"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file format"));
    }
  },
});

// ============= REQUEST TYPES =============

interface ProcessingRequest extends Request {
  file?: Express.Multer.File;
}

// ============= ENDPOINTS =============

/**
 * Health check endpoint
 */
app.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * Fetch audio from YouTube or Spotify URL
 * POST /api/audio/fetch-url
 * Body: { url: string }
 */
app.post("/api/audio/fetch-url", async (req: Request, res: Response) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    // Detect platform
    const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
    const isSpotify = url.includes("spotify.com");

    if (isYouTube) {
      // Validate YouTube URL
      if (!ytdl.validateURL(url)) {
        return res.status(400).json({ error: "Invalid YouTube URL" });
      }

      // Get video info
      const info = await ytdl.getInfo(url);
      const title = info.videoDetails.title;
      const duration = parseInt(info.videoDetails.lengthSeconds);

      // Check duration limit (1 hour max)
      if (duration > 3600) {
        return res.status(400).json({ error: "Video too long (max 1 hour)" });
      }

      // Stream audio
      const audioStream = ytdl(url, {
        quality: "highestaudio",
        filter: "audioonly",
      });

      res.setHeader("Content-Type", "audio/webm");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${title}.webm"`
      );
      res.setHeader("X-Audio-Title", encodeURIComponent(title));
      res.setHeader("X-Audio-Duration", duration.toString());

      audioStream.pipe(res);

      audioStream.on("error", (error) => {
        console.error("YouTube stream error:", error);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to stream audio" });
        }
      });
    } else if (isSpotify) {
      return res.status(501).json({
        error: "Spotify support coming soon",
        message:
          "Spotify requires authentication and has playback restrictions. Use YouTube for now.",
      });
    } else {
      return res.status(400).json({
        error: "Unsupported URL. Please use YouTube or Spotify links.",
      });
    }
  } catch (error) {
    console.error("URL fetch error:", error);
    res.status(500).json({
      error: "Failed to fetch audio from URL",
      details: (error as Error).message,
    });
  }
});

// ============= ERROR HANDLING =============

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Server error:", error);
  res.status(500).json({
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "production"
        ? "An error occurred"
        : error.message,
  });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// ============= WORKER SETUP =============
// Note: Background job processing can be added here using Bull or similar
// For now, processing is handled client-side via Web Audio API

// ============= HELPER FUNCTIONS =============

async function decodeAudio(buffer: Buffer): Promise<Float32Array> {
  // Use FFmpeg or Web Audio API equivalent
  // For now, return placeholder
  return new Float32Array(44100 * 60); // 1 minute of silence
}

async function processAudio(
  buffer: Float32Array,
  config: any
): Promise<Float32Array> {
  // Import and use the audio DSP engine
  // This would call the compiled audio-engine functions
  return buffer;
}

async function encodeAudio(
  buffer: Float32Array,
  format: string,
  bitrate: number
): Promise<Buffer> {
  // Use FFmpeg for encoding
  // ffmpeg -i input.wav -b:a 192k output.mp3
  return Buffer.from(new Uint8Array()); // Placeholder
}

// ============= SERVER START =============

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🎵 SlowedLab API Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  process.exit(0);
});

export default app;
