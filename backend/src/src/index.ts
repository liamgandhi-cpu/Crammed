import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth";
import scheduleRoutes from "./routes/schedule";
import integrationRoutes from "./routes/integrations";
import todoRoutes from "./routes/todos";
import uploadRoutes from "./routes/upload";
import plannerRoutes from "./routes/planner";
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
