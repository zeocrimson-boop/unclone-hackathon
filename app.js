import express from "express";
import helmet from "helmet";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import { fileURLToPath } from "node:url";
import {
  analyzeVoice,
  voiceFailure,
  voiceConfigured,
} from "./services/detectifai.js";
import { analyzeTranscript } from "./services/scam-analysis.js";
import {
  createCommunityStore,
  CATEGORIES,
  CommunityError,
} from "./services/community.js";
import {
  MAX_AUDIO_BYTES,
  validateAudio,
  validateTranscript,
} from "./services/validation.js";

export function createApp({
  voiceAnalyzer = analyzeVoice,
  trustProxyHops = 0,
  textAnalyzer = analyzeTranscript,
  communityStore = createCommunityStore(),
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  if (trustProxyHops) app.set("trust proxy", trustProxyHops);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "media-src": ["'self'", "blob:"],
          "script-src": ["'self'"],
          "upgrade-insecure-requests": null,
        },
      },
    }),
  );
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get("/api/health", (_req, res) =>
    res.json({
      status: "ok",
      voice: voiceConfigured() ? "configured" : "unavailable",
      community: communityStore.configured ? "configured" : "unavailable",
      transcriptAnalysis: "available",
    }),
  );
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 20,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, res) =>
        res.status(429).json({
          status: "error",
          code: "RATE_LIMIT",
          message: "Too many requests. Wait a minute and try again.",
        }),
    }),
  );
  app.use(express.json({ limit: "64kb" }));
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 0, parts: 1 },
  });
  app.post("/api/transcript-analysis", (req, res) => {
    const error = validateTranscript(req.body?.transcript);
    if (error)
      return res.status(400).json({ status: "invalid", message: error });
    return res.json({
      status: "success",
      scam: textAnalyzer(req.body.transcript.trim()),
      voice: {
        status: "unavailable",
        message: "Transcript-only analysis does not assess voice authenticity.",
      },
    });
  });
  for (const route of ["/api/audio/upload", "/api/voice-detection"]) {
    app.post(route, upload.single("audio"), async (req, res) => {
      try {
        const error = validateAudio(req.file);
        if (error)
          return res.status(400).json({ status: "invalid", message: error });
        if (route === "/api/audio/upload")
          return res.json({
            status: "success",
            message:
              "Audio header and size accepted. This is not a full decode or voice assessment.",
            size: req.file.size,
          });
        let voice;
        try {
          const idempotencyKey = req.get("Idempotency-Key");
          if (idempotencyKey && !/^[a-zA-Z0-9-]{1,128}$/.test(idempotencyKey))
            return res.status(400).json({
              status: "invalid",
              message: "Invalid retry identifier.",
            });
          voice = await voiceAnalyzer(
            req.file,
            idempotencyKey ? { idempotencyKey } : undefined,
          );
        } catch (error) {
          voice = voiceFailure(error);
        }
        return res.status(voice.status === "error" ? 502 : 200).json({
          status: voice.status,
          voice,
          scam: {
            status: "unavailable",
            message: "Paste a transcript for a separate scam-risk assessment.",
          },
        });
      } finally {
        // No disk writes. Release and overwrite the request-scoped audio buffer.
        req.file?.buffer?.fill(0);
        if (req.file) req.file.buffer = null;
      }
    });
  }
  app.get("/api/community/categories", (_req, res) =>
    res.json({ categories: CATEGORIES }),
  );
  app.get("/api/community/search", async (req, res, next) => {
    try {
      res.json({
        status: "success",
        ...(await communityStore.search(req.query.phone)),
      });
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/community/reports", async (req, res, next) => {
    try {
      const result = await communityStore.submit(req.body, req.ip);
      res
        .status(result.duplicate ? 200 : 201)
        .json({ status: "success", ...result });
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/community/review", async (req, res, next) => {
    try {
      res.status(201).json({
        status: "success",
        ...(await communityStore.flag(req.body, req.ip)),
      });
    } catch (error) {
      next(error);
    }
  });
  app.use("/api/community", (error, _req, res, next) => {
    if (error instanceof SyntaxError || error.type === "entity.too.large")
      return next(error);
    const known = error instanceof CommunityError;
    res.status(known ? error.status : 503).json({
      status: "error",
      code: known ? error.code : "COMMUNITY_UNAVAILABLE",
      message: known
        ? error.message
        : "Community service is currently unavailable. No search or report result is available. Try again later.",
    });
  });
  app.use(express.static(fileURLToPath(new URL("./public", import.meta.url))));
  app.use((_req, res) =>
    res.status(404).json({ status: "error", message: "Route not found." }),
  );
  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError)
      return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
        status: "invalid",
        message:
          error.code === "LIMIT_FILE_SIZE"
            ? "The recording must be 10 MB or smaller."
            : "Upload exactly one file in the audio field, with no extra fields.",
      });
    if (error.type === "entity.too.large")
      return res
        .status(413)
        .json({ status: "invalid", message: "Request is too large." });
    if (error instanceof SyntaxError)
      return res.status(400).json({
        status: "invalid",
        message: "Request must contain valid JSON.",
      });
    return res.status(500).json({
      status: "error",
      message: "The request could not be processed. Please try again.",
    });
  });
  return app;
}
