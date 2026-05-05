import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import { query } from "../config/db";
import { sendPush } from "../utils/webPush";
import { logger } from "../logger";
import type webpush from "web-push";

const router = Router();

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

// ── GET /api/push/vapid-public-key ─────────────────────────
// Public — no auth
router.get("/vapid-public-key", (_req, res) => {
  res.json({ publicKey: (process.env.VAPID_PUBLIC_KEY ?? "").trim() });
});

// ── POST /api/push/send-reminders (cron) ────────────────────
// No user auth — uses CRON_SECRET. Must be BEFORE router.use(authenticate).
router.post("/send-reminders", async (req, res) => {
  const secret = (req.headers["x-cron-secret"] as string ?? "").trim()
    || (req.headers.authorization ?? "").replace("Bearer ", "").trim();
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected || secret !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
    // day_of_week: 0=Mon…6=Sun; JS getDay: 0=Sun
    const jsDay = now.getDay();
    const todayDow = jsDay === 0 ? 6 : jsDay - 1;
    let sent = 0;

    // ── Daily Briefing (one per user) ─────────────────────
    // Get all users with push subscriptions
    const { rows: userRows } = await query(
      `SELECT DISTINCT user_id FROM push_subscriptions`
    );

    for (const { user_id } of userRows) {
      try {
        // Today's classes
        const { rows: classes } = await query(
          `SELECT title, start_time, end_time FROM schedule_items
           WHERE user_id = $1 AND category = 'class' AND day_of_week = $2
             AND start_time IS NOT NULL
           ORDER BY start_time`,
          [user_id, todayDow]
        );

        // Due today
        const { rows: dueToday } = await query(
          `SELECT title FROM schedule_items
           WHERE user_id = $1 AND due_date::date = $2
             AND category IN ('assignment','project','exam') AND completed = false`,
          [user_id, todayStr]
        );

        // Next upcoming deadline (after today)
        const { rows: upcoming } = await query(
          `SELECT title, category, due_date FROM schedule_items
           WHERE user_id = $1 AND due_date > $2::date
             AND category IN ('assignment','project','exam') AND completed = false
           ORDER BY due_date ASC LIMIT 1`,
          [user_id, todayStr]
        );

        // Build notification body
        const lines: string[] = [];

        if (classes.length > 0) {
          const fmt = (t: string) => {
            const [h, m] = t.slice(0, 5).split(":").map(Number);
            const p = h >= 12 ? "PM" : "AM";
            return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${p}`;
          };
          lines.push(classes.map((c) => `${c.title} ${fmt(c.start_time)}–${fmt(c.end_time)}`).join(", "));
        } else {
          lines.push("No classes today");
        }

        if (dueToday.length > 0) {
          lines.push(`Due today: ${dueToday.map((d) => d.title).join(", ")}`);
        }

        if (upcoming.length > 0) {
          const u = upcoming[0];
          const days = Math.ceil((new Date(u.due_date).getTime() - new Date(todayStr).getTime()) / 86400000);
          lines.push(`Next: ${u.title} in ${days}d`);
        }

        if (classes.length === 0 && dueToday.length === 0 && upcoming.length === 0) continue;

        // Get subscriptions for this user
        const { rows: subs } = await query(
          `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
          [user_id]
        );

        for (const sub of subs) {
          try {
            await sendPush(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } } as webpush.PushSubscription,
              {
                title: "📅 Your day at a glance",
                body: lines.join(" · "),
                tag: `daily-briefing-${todayStr}`,
                url: "/today",
              }
            );
            sent++;
          } catch { /* expired subscription */ }
        }
      } catch { /* skip this user */ }
    }

    // ── Due TODAY ─────────────────────────────────────────
    const { rows: todayRows } = await query(`
      SELECT si.title, si.category, si.notes, si.source, ps.endpoint, ps.p256dh, ps.auth
      FROM schedule_items si
      JOIN push_subscriptions ps ON ps.user_id = si.user_id
      WHERE si.due_date::date = $1
        AND si.category IN ('assignment','project')
        AND si.completed = false
    `, [todayStr]);

    for (const row of todayRows) {
      try {
        const course = row.source === "schoology" && row.notes ? ` · ${row.notes}` : "";
        await sendPush(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } } as webpush.PushSubscription,
          { title: `Due today: ${row.title}`, body: `Don't forget to complete it today.${course}`, tag: `due-today-${row.title}`, url: "/" }
        );
        sent++;
      } catch { /* expired subscription */ }
    }

    // ── Due TOMORROW ──────────────────────────────────────
    const { rows: tomorrowRows } = await query(`
      SELECT si.title, si.category, si.notes, si.source, ps.endpoint, ps.p256dh, ps.auth
      FROM schedule_items si
      JOIN push_subscriptions ps ON ps.user_id = si.user_id
      WHERE si.due_date::date = $1
        AND si.category IN ('assignment','project','exam')
        AND si.completed = false
    `, [tomorrowStr]);

    for (const row of tomorrowRows) {
      try {
        const course = row.source === "schoology" && row.notes ? ` · ${row.notes}` : "";
        await sendPush(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } } as webpush.PushSubscription,
          {
            title: row.category === "exam" ? `Exam tomorrow: ${row.title}` : `Due tomorrow: ${row.title}`,
            body: (row.category === "exam" ? "Make sure you're prepared!" : "Plan time for it today.") + course,
            tag: `due-tomorrow-${row.title}`,
            url: "/",
          }
        );
        sent++;
      } catch { /* expired subscription */ }
    }

    res.json({ ok: true, sent });
  } catch (err) {
    logger.error("send-reminders cron error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── All routes below require user auth ──────────────────────
router.use(authenticate);

// ── POST /api/push/subscribe ─────────────────────────────────
router.post("/subscribe", async (req, res) => {
  const parsed = subscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid subscription object" });
    return;
  }
  const { endpoint, keys } = parsed.data;
  const userId = req.user!.userId;
  try {
    await query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, p256dh = $3, auth = $4`,
      [userId, endpoint, keys.p256dh, keys.auth]
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error("push subscribe error", err);
    res.status(500).json({ error: "Failed to save subscription" });
  }
});

// ── DELETE /api/push/subscribe ───────────────────────────────
router.delete("/subscribe", async (req, res) => {
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) { res.status(400).json({ error: "endpoint required" }); return; }
  try {
    await query("DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2",
      [endpoint, req.user!.userId]);
    res.json({ ok: true });
  } catch (err) {
    logger.error("push unsubscribe error", err);
    res.status(500).json({ error: "Failed to remove subscription" });
  }
});

export default router;
