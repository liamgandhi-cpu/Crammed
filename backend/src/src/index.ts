import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import authRoutes from "./routes/auth";
import scheduleRoutes from "./routes/schedule";
import integrationRoutes from "./routes/integrations";
import todoRoutes from "./routes/todos";
import uploadRoutes from "./routes/upload";
import plannerRoutes from "./routes/planner";
import ecPlanRoutes from "./routes/ecPlan";
import { gradesRouter, coursesRouter } from "./routes/grades";
import focusRoutes from "./routes/focus";
import notificationsRoutes from "./routes/notifications";
import summaryRoutes from "./routes/summary";
import pushRoutes from "./routes/push";
import ionRoutes from "./routes/ion";
import { logger } from "./logger";

const app = express();
// Trust Vercel's proxy so express-rate-limit gets real client IPs
app.set("trust proxy", 1);
const PORT = parseInt(process.env.PORT ?? "4000", 10);

// ── Middleware ──────────────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL ?? "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "25mb" }));

// Request logging
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ── Routes ─────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/schedule", scheduleRoutes);
// Ion routes MUST be mounted before the generic integrations router because
// /api/integrations/* is guarded by authenticate, but /ion/callback is a
// public OAuth redirect handler that must not require a Bearer token.
app.use("/api/integrations/ion", ionRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/api/todos", todoRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/planner", plannerRoutes);
app.use("/api/ec-plan", ecPlanRoutes);
app.use("/api/grades", gradesRouter);
app.use("/api/courses", coursesRouter);
app.use("/api/focus", focusRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/summary", summaryRoutes);
app.use("/api/push", pushRoutes);

// GET /api/me is mounted inside auth routes as /me,
// but the spec wants it at /api/me — add an alias:
import { authenticate } from "./middleware/auth";
import { findUserById } from "./models/user";
app.get("/api/me", authenticate, async (req, res) => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ user });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Optional: serve the built SPA from this same process ───
// Off unless SERVE_STATIC=1. In production the frontend and backend are
// two separate Vercel projects (the frontend has its own deployment and
// SPA rewrites), so this must never engage there — it exists purely so a
// local run can be a single process on a single port.
if (process.env.SERVE_STATIC === "1" && !process.env.VERCEL) {
  const distDir = path.resolve(__dirname, "../../../frontend/src/dist");

  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    logger.warn(
      `SERVE_STATIC=1 but no build found at ${distDir} — run \`npm run build\` in frontend/src. Serving API only.`
    );
  } else {
    app.use(express.static(distDir));

    // SPA fallback: any non-/api GET that isn't a real file returns index.html
    // so client-side routes (/dashboard, /today) survive a hard refresh.
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });

    logger.info(`📦 Serving SPA from ${distDir}`);
  }
}

// 404 catch-all
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    logger.error("Unhandled error", { message: err.message, stack: err.stack });
    res.status(500).json({ error: "Internal server error" });
  }
);

// ── Start (skip in Vercel serverless) ──────────────────────
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    logger.info(`🚀 AutoPlanner API running on http://localhost:${PORT}`);
  });
}

export default app;
