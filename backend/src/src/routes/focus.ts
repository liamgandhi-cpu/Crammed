import { Router } from "express";
import { z } from "zod";
import { query } from "../config/db";
import { authenticate } from "../middleware/auth";
import { logger } from "../logger";

const router = Router();
router.use(authenticate);

const startSchema = z.object({
  plan_block_id: z.string().nullable().optional(),
  course_name: z.string().max(255).nullable().optional(),
  session_type: z.enum(["focus", "short_break", "long_break"]).default("focus"),
  duration_seconds: z.number().int().positive(),
});

const endSchema = z.object({
  completed: z.boolean().default(false),
  ended_at: z.string().optional(),
});

// GET /api/focus/stats (MUST be before /:id)
router.get("/stats", async (req, res) => {
  const userId = req.user!.userId;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

    const [todayRes, weekRes, streakRes] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(duration_seconds),0) AS total_seconds, COUNT(*) AS session_count
         FROM focus_sessions
         WHERE user_id = $1 AND session_type = 'focus' AND completed = true
           AND DATE(started_at) = $2::DATE`,
        [userId, today]
      ),
      query(
        `SELECT COALESCE(SUM(duration_seconds),0) AS total_seconds, COUNT(*) AS session_count
         FROM focus_sessions
         WHERE user_id = $1 AND session_type = 'focus' AND completed = true
           AND started_at >= $2::DATE`,
        [userId, weekAgo]
      ),
      query(
        `SELECT DISTINCT DATE(started_at) AS focus_date
         FROM focus_sessions
         WHERE user_id = $1 AND session_type = 'focus' AND completed = true
         ORDER BY focus_date DESC
         LIMIT 30`,
        [userId]
      ),
    ]);

    // Calculate consecutive-day streak
    const dates = streakRes.rows.map((r) => String(r.focus_date).slice(0, 10));
    let streak = 0;
    for (let i = 0; i < dates.length; i++) {
      const expected = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      if (dates[i] === expected) streak++;
      else break;
    }

    res.json({
      today: {
        totalSeconds: parseInt(String(todayRes.rows[0].total_seconds)),
        sessionCount: parseInt(String(todayRes.rows[0].session_count)),
      },
      week: {
        totalSeconds: parseInt(String(weekRes.rows[0].total_seconds)),
        sessionCount: parseInt(String(weekRes.rows[0].session_count)),
      },
      streak,
    });
  } catch (err) {
    logger.error("Focus stats error", err);
    res.status(500).json({ error: "Failed to fetch focus stats" });
  }
});

// POST /api/focus/start
router.post("/start", async (req, res) => {
  const userId = req.user!.userId;
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  try {
    const result = await query(
      `INSERT INTO focus_sessions (user_id, plan_block_id, course_name, session_type, duration_seconds)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [
        userId,
        d.plan_block_id ?? null,
        d.course_name ?? null,
        d.session_type,
        d.duration_seconds,
      ]
    );
    res.status(201).json({ session: result.rows[0] });
  } catch (err) {
    logger.error("Start focus session error", err);
    res.status(500).json({ error: "Failed to start session" });
  }
});

// PATCH /api/focus/:id
router.patch("/:id", async (req, res) => {
  const userId = req.user!.userId;
  const parsed = endSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  try {
    const result = await query(
      `UPDATE focus_sessions SET
         completed = $3,
         ended_at  = COALESCE($4::TIMESTAMPTZ, now())
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, userId, d.completed, d.ended_at ?? null]
    );
    if (!result.rowCount) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ session: result.rows[0] });
  } catch (err) {
    logger.error("End focus session error", err);
    res.status(500).json({ error: "Failed to end session" });
  }
});

export default router;
