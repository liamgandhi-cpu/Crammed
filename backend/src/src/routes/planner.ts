import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { generateDailyPlan } from "../services/dailyPlanner";
import { query } from "../config/db";
import { logger } from "../logger";
import { toClientError, internalDetail } from "../utils/errors";

const router = Router();
router.use(authenticate);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Preferences routes FIRST (before /:date wildcard) ──────

router.get("/preferences", async (req: Request, res: Response) => {
  try {
    const result = await query(
      "SELECT * FROM user_preferences WHERE user_id = $1",
      [req.user!.userId]
    );
    const defaults = {
      wake_time: "07:00",
      sleep_time: "23:00",
      study_style: "balanced",
      break_frequency: 90,
      break_duration: 15,
      max_study_hours: 6,
      notes: null,
      commute_minutes: 0,
      preferred_block_length: 60,
      hard_subjects: null,
      semester_load: "moderate",
      summer_mode: "auto",
    };
    const row = result.rows[0];
    if (row) {
      // Normalize TIME columns to HH:MM
      if (row.wake_time) row.wake_time = String(row.wake_time).slice(0, 5);
      if (row.sleep_time) row.sleep_time = String(row.sleep_time).slice(0, 5);
    }
    res.json({ preferences: row ? { ...defaults, ...row } : defaults });
  } catch (err) {
    logger.error("Failed to get preferences", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const prefsSchema = z.object({
  wake_time:             z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  sleep_time:            z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  study_style:           z.enum(["balanced", "early_bird", "night_owl", "pomodoro"]).optional(),
  break_frequency:       z.number().int().min(15).max(180).optional(),
  break_duration:        z.number().int().min(5).max(60).optional(),
  max_study_hours:       z.number().int().min(1).max(16).optional(),
  notes:                 z.string().max(2000).nullable().optional(),
  commute_minutes:       z.number().int().min(0).max(120).optional(),
  preferred_block_length: z.number().int().min(25).max(120).optional(),
  hard_subjects:         z.string().max(500).nullable().optional(),
  semester_load:         z.enum(["light", "moderate", "heavy"]).optional(),
  summer_mode:           z.enum(["auto", "on", "off"]).optional(),
});

router.put("/preferences", validate(prefsSchema), async (req: Request, res: Response) => {
  const p = req.body as z.infer<typeof prefsSchema>;
  try {
    // Normalize HH:MM:SS → HH:MM before saving
    const wakeTime  = p.wake_time  ? String(p.wake_time).slice(0, 5)  : null;
    const sleepTime = p.sleep_time ? String(p.sleep_time).slice(0, 5) : null;

    await query(
      `INSERT INTO user_preferences
         (user_id, wake_time, sleep_time, study_style, break_frequency, break_duration,
          max_study_hours, notes, commute_minutes, preferred_block_length, hard_subjects, semester_load,
          summer_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (user_id) DO UPDATE SET
         wake_time              = COALESCE($2,  user_preferences.wake_time),
         sleep_time             = COALESCE($3,  user_preferences.sleep_time),
         study_style            = COALESCE($4,  user_preferences.study_style),
         break_frequency        = COALESCE($5,  user_preferences.break_frequency),
         break_duration         = COALESCE($6,  user_preferences.break_duration),
         max_study_hours        = COALESCE($7,  user_preferences.max_study_hours),
         notes                  = COALESCE($8,  user_preferences.notes),
         commute_minutes        = COALESCE($9,  user_preferences.commute_minutes),
         preferred_block_length = COALESCE($10, user_preferences.preferred_block_length),
         hard_subjects          = COALESCE($11, user_preferences.hard_subjects),
         semester_load          = COALESCE($12, user_preferences.semester_load),
         summer_mode            = COALESCE($13, user_preferences.summer_mode),
         updated_at             = now()`,
      [
        req.user!.userId,
        wakeTime,
        sleepTime,
        p.study_style           ?? null,
        p.break_frequency        ?? null,
        p.break_duration         ?? null,
        p.max_study_hours        ?? null,
        p.notes !== undefined    ? p.notes : null,
        p.commute_minutes        ?? null,
        p.preferred_block_length ?? null,
        p.hard_subjects !== undefined ? p.hard_subjects : null,
        p.semester_load          ?? null,
        p.summer_mode            ?? null,
      ]
    );
    const result = await query("SELECT * FROM user_preferences WHERE user_id = $1", [req.user!.userId]);
    res.json({ preferences: result.rows[0] });
  } catch (err) {
    logger.error("Failed to update preferences", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/planner/regenerate ───────────────────────────

const regenerateSchema = z.object({ date: z.string().regex(DATE_RE).optional() });

router.post("/regenerate", validate(regenerateSchema), async (req: Request, res: Response) => {
  const date = (req.body as { date?: string }).date ?? todayString();
  try {
    const plan = await generateDailyPlan(req.user!.userId, date, true);
    res.json({ plan });
  } catch (err) {
    // Never forward the raw message: plan generation calls the Anthropic
    // SDK, whose errors describe our configuration, not the user's problem.
    const { status, message } = toClientError(err, "We couldn't rebuild your plan just now. Try again in a moment.", 500);
    logger.error("Failed to regenerate plan", internalDetail(err));
    res.status(status).json({ error: message });
  }
});

// ── PATCH /api/planner/block/:blockId ─────────────────────

const toggleSchema = z.object({
  completed: z.boolean(),
  date: z.string().regex(DATE_RE),
});

router.patch("/block/:blockId", validate(toggleSchema), async (req: Request, res: Response) => {
  const { blockId } = req.params;
  const { completed, date } = req.body as { completed: boolean; date: string };
  try {
    await query(
      `UPDATE daily_plans
       SET blocks = (
         SELECT jsonb_agg(
           CASE WHEN (elem->>'id') = $1
             THEN jsonb_set(elem, '{completed}', $2::jsonb)
             ELSE elem
           END
         )
         FROM jsonb_array_elements(blocks) AS elem
       )
       WHERE user_id = $3 AND plan_date = $4::date`,
      [blockId, JSON.stringify(completed), req.user!.userId, date]
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error("Failed to toggle block", err);
    res.status(500).json({ error: "Failed to update block." });
  }
});

// ── GET /api/planner/today ─────────────────────────────────

router.get("/today", async (req: Request, res: Response) => {
  try {
    const check = await query("SELECT COUNT(*) FROM schedule_items WHERE user_id = $1", [req.user!.userId]);
    if (parseInt(check.rows[0].count, 10) === 0) {
      res.json({ empty: true, message: "Add your classes and assignments first." });
      return;
    }
    const plan = await generateDailyPlan(req.user!.userId, todayString());
    res.json({ plan });
  } catch (err) {
    // Never forward the raw message: plan generation calls the Anthropic
    // SDK, whose errors describe our configuration, not the user's problem.
    const { status, message } = toClientError(err, "We couldn't build today's plan just now. Try again in a moment.", 500);
    logger.error("Failed to generate today's plan", internalDetail(err));
    res.status(status).json({ error: message });
  }
});

// ── GET /api/planner/:date ─────────────────────────────────
// NOTE: this wildcard must come LAST among GET routes

router.get("/:date", async (req: Request, res: Response) => {
  const { date } = req.params;
  if (!DATE_RE.test(date)) {
    res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
    return;
  }
  try {
    const check = await query("SELECT COUNT(*) FROM schedule_items WHERE user_id = $1", [req.user!.userId]);
    if (parseInt(check.rows[0].count, 10) === 0) {
      res.json({ empty: true, message: "Add your classes and assignments first." });
      return;
    }
    const plan = await generateDailyPlan(req.user!.userId, date);
    res.json({ plan });
  } catch (err) {
    // Never forward the raw message: plan generation calls the Anthropic
    // SDK, whose errors describe our configuration, not the user's problem.
    const { status, message } = toClientError(err, "We couldn't build your plan for that day. Try again in a moment.", 500);
    logger.error("Failed to generate plan", internalDetail(err));
    res.status(status).json({ error: message });
  }
});

export default router;
