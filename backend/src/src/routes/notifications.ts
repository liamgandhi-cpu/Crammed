import { Router } from "express";
import { z } from "zod";
import { query } from "../config/db";
import { authenticate } from "../middleware/auth";
import { logger } from "../logger";

const router = Router();
router.use(authenticate);

const prefsSchema = z.object({
  enabled: z.boolean().optional(),
  assignment_reminders: z.boolean().optional(),
  daily_plan_ready: z.boolean().optional(),
  study_reminders: z.boolean().optional(),
  exam_warnings: z.boolean().optional(),
  weekly_summary_email: z.boolean().optional(),
  reminder_minutes_before: z.number().int().min(1).max(1440).optional(),
});

const DEFAULTS = {
  enabled: true,
  assignment_reminders: true,
  daily_plan_ready: true,
  study_reminders: true,
  exam_warnings: true,
  weekly_summary_email: true,
  reminder_minutes_before: 15,
};

// GET /api/notifications/preferences
router.get("/preferences", async (req, res) => {
  const userId = req.user!.userId;
  try {
    const result = await query(
      "SELECT * FROM notification_preferences WHERE user_id = $1",
      [userId]
    );
    res.json({ preferences: result.rows[0] ?? DEFAULTS });
  } catch (err) {
    logger.error("Get notification prefs error", err);
    res.status(500).json({ error: "Failed to fetch notification preferences" });
  }
});

// PUT /api/notifications/preferences
router.put("/preferences", async (req, res) => {
  const userId = req.user!.userId;
  const parsed = prefsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  try {
    const result = await query(
      `INSERT INTO notification_preferences
         (user_id, enabled, assignment_reminders, daily_plan_ready, study_reminders,
          exam_warnings, weekly_summary_email, reminder_minutes_before)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (user_id) DO UPDATE SET
         enabled                 = COALESCE($2, notification_preferences.enabled),
         assignment_reminders    = COALESCE($3, notification_preferences.assignment_reminders),
         daily_plan_ready        = COALESCE($4, notification_preferences.daily_plan_ready),
         study_reminders         = COALESCE($5, notification_preferences.study_reminders),
         exam_warnings           = COALESCE($6, notification_preferences.exam_warnings),
         weekly_summary_email    = COALESCE($7, notification_preferences.weekly_summary_email),
         reminder_minutes_before = COALESCE($8, notification_preferences.reminder_minutes_before),
         updated_at              = now()
       RETURNING *`,
      [
        userId,
        d.enabled ?? true,
        d.assignment_reminders ?? true,
        d.daily_plan_ready ?? true,
        d.study_reminders ?? true,
        d.exam_warnings ?? true,
        d.weekly_summary_email ?? true,
        d.reminder_minutes_before ?? 15,
      ]
    );
    res.json({ preferences: result.rows[0] });
  } catch (err) {
    logger.error("Update notification prefs error", err);
    res.status(500).json({ error: "Failed to update notification preferences" });
  }
});

export default router;
