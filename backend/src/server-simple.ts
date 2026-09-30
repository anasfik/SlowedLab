/**
 * Backend Express Server - Simplified for URL Fetching
 * Handles YouTube/Spotify URL audio extraction
 */

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import compression from "compression";
import fs from "fs/promises";
import path from "path";
import { registerLinkImportRoutes } from "./linkImport";

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

// ============= ENDPOINTS =============

/**
 * Health check endpoint
 */
app.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * Legacy single-shot fetch endpoint — replaced by the job flow below
 * (POST /api/audio/resolve + POST /api/audio/jobs). Kept as a shim
 * so old clients get a pointer instead of a hang.
 */
app.post("/api/audio/fetch-url", (_req: Request, res: Response) => {
  return res.status(410).json({
    error: "This endpoint is retired. Use POST /api/audio/resolve then POST /api/audio/jobs.",
  });
});

registerLinkImportRoutes(app);

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

// ============= SERVER START =============

const PORT = process.env.PORT || 4001;

app.listen(PORT, () => {
  console.log(`🎵 SlowedLab API Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`✅ Link import enabled (YouTube + SoundCloud via yt-dlp)`);
  console.log(`📡 Ready to accept requests at http://localhost:${PORT}`);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  process.exit(0);
});

export default app;
