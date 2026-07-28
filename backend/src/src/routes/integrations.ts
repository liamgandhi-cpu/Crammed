import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { encrypt, decrypt } from "../utils/crypto";
import { sendPush } from "../utils/webPush";
import type webpush from "web-push";
import {
  upsertConnectedAccount,
  getConnectedAccounts,
  getConnectedAccount,
  deleteConnectedAccount,
  clearItemsBySource,
  touchLastSynced,
} from "../models/integration";
import { scrapeStudentVue, scrapeSchoology, testStudentVueLogin } from "../services/scraper";
import { getStudentVueGradebook } from "../services/studentVueSoap";
import { query } from "../config/db";
import { logger } from "../logger";
import { toClientError, internalDetail } from "../utils/errors";

const router = Router();
router.use(authenticate);

// ── Rate limit ─────────────────────────────────────────────
const connectLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a minute and try again." },
});

// ── Insert helper ──────────────────────────────────────────

type ImportedItem = {
  title: string;
  category: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  color: string;
  location: string | null;
  notes: string | null;
  source: string;
  source_id: string | null;
  due_date: string | null;
};

async function insertImportedItems(
  userId: string,
  items: ImportedItem[]
): Promise<{ count: number; newItems: ImportedItem[] }> {
  if (items.length === 0) return { count: 0, newItems: [] };
  let count = 0;
  const newItems: ImportedItem[] = [];
  for (const item of items) {
    const { rows } = await query(
      `INSERT INTO schedule_items
         (user_id, title, category, day_of_week, start_time, end_time,
          color, location, notes, source, source_id, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        userId, item.title, item.category, item.day_of_week,
        item.start_time, item.end_time, item.color, item.location,
        item.notes, item.source, item.source_id, item.due_date,
      ]
    );
    count++;
    if (rows.length > 0) newItems.push(item); // actually inserted (not a duplicate)
  }
  return { count, newItems };
}

async function pushNewSchoologyItems(userId: string, newItems: ImportedItem[]): Promise<void> {
  // Only notify for future assignments (due today or later)
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = newItems.filter(
    (i) => i.due_date && i.due_date >= today && i.category === "assignment"
  );
  if (upcoming.length === 0) return;

  // Get user's push subscriptions
  const { rows: subs } = await query(
    "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1",
    [userId]
  );
  if (subs.length === 0) return;

  for (const item of upcoming) {
    const daysUntil = Math.ceil(
      (new Date(item.due_date!).getTime() - new Date(today).getTime()) / 86400000
    );
    const course = item.notes ? ` · ${item.notes}` : "";
    const body = daysUntil === 0
      ? `Due today${course}`
      : daysUntil === 1
      ? `Due tomorrow${course}`
      : `Due in ${daysUntil} days${course}`;

    for (const sub of subs) {
      try {
        await sendPush(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } } as webpush.PushSubscription,
          {
            title: `New: ${item.title}`,
            body,
            tag: `new-schoology-${item.source_id ?? item.title}`,
            url: "/dashboard",
          }
        );
      } catch { /* expired subscription */ }
    }
  }
}

// ── Schemas ────────────────────────────────────────────────

const studentVueSchema = z.object({
  districtUrl: z.string().url(),
  username:    z.string().min(1).max(100),
  password:    z.string().min(1).max(200),
});

const schoologySchema = z.object({
  host:     z.string().min(1).max(255),
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

// ── POST /api/integrations/studentvue/test ─────────────────

router.post(
  "/studentvue/test",
  connectLimiter,
  validate(studentVueSchema),
  async (req, res) => {
    const { districtUrl, username, password } = req.body as z.infer<typeof studentVueSchema>;
    req.socket.setTimeout(120_000);
    try {
      logger.info(`StudentVUE test: verifying credentials for ${username}`);
      const { studentName } = await testStudentVueLogin(districtUrl, username, password);
      res.json({ success: true, studentName });
    } catch (err) {
      const { status, message } = toClientError(err, "We couldn't sign in to StudentVUE. Check your Student ID and password, then try again.", 401);
      logger.error("StudentVUE test error", internalDetail(err));
      res.status(status).json({ error: message });
    }
  }
);

// ── Job helpers ────────────────────────────────────────────

async function createJob(userId: string, provider: string): Promise<string> {
  const { rows } = await query(
    `INSERT INTO scrape_jobs (user_id, provider, status) VALUES ($1, $2, 'running') RETURNING id`,
    [userId, provider]
  );
  return rows[0].id as string;
}

async function completeJob(jobId: string, result: Record<string, unknown>): Promise<void> {
  await query(
    `UPDATE scrape_jobs SET status='done', result=$1, completed_at=now() WHERE id=$2`,
    [JSON.stringify(result), jobId]
  );
}

async function failJob(jobId: string, error: string): Promise<void> {
  await query(
    `UPDATE scrape_jobs SET status='failed', error=$1, completed_at=now() WHERE id=$2`,
    [error, jobId]
  );
}

// ── POST /api/integrations/studentvue/connect ──────────────

router.post(
  "/studentvue/connect",
  connectLimiter,
  validate(studentVueSchema),
  async (req, res) => {
    const { districtUrl, username, password } = req.body as z.infer<typeof studentVueSchema>;
    const userId = req.user!.userId;

    req.socket.setTimeout(120_000);

    const jobId = await createJob(userId, "studentvue");

    try {
      logger.info(`StudentVUE connect: starting for user ${userId}`);
      const items = await scrapeStudentVue(districtUrl, username, password);

      const encryptedCreds = encrypt(JSON.stringify({ username, password }));
      const account = await upsertConnectedAccount(userId, "studentvue", encryptedCreds, districtUrl);

      await clearItemsBySource(userId, "studentvue");
      const { count: imported } = await insertImportedItems(userId, items as ImportedItem[]);
      await touchLastSynced(account.id);

      const classCount = new Set(
        items.filter((i) => i.category === "class").map((i) => i.title)
      ).size;
      const assignmentCount = items.filter((i) => i.category === "assignment").length;

      await completeJob(jobId, { imported, classCount, assignmentCount });
      res.json({ success: true, jobId, accountId: account.id, imported, classCount, assignmentCount });
    } catch (err) {
      const { status, message } = toClientError(err, "We couldn't import from StudentVUE. Check your district and sign-in details, then try again.", 400);
      logger.error("StudentVUE connect error", internalDetail(err));
      await failJob(jobId, message);
      res.status(status).json({ error: message, jobId });
    }
  }
);

// ── POST /api/integrations/studentvue/sync ─────────────────

router.post("/studentvue/sync", async (req, res) => {
  const userId = req.user!.userId;
  req.socket.setTimeout(120_000);

  const jobId = await createJob(userId, "studentvue");

  try {
    const accounts = await getConnectedAccounts(userId);
    const account = accounts.find((a) => a.provider === "studentvue");
    if (!account) {
      await failJob(jobId, "StudentVUE not connected");
      res.status(404).json({ error: "StudentVUE not connected", jobId });
      return;
    }

    const creds = JSON.parse(decrypt(account.encrypted_credentials)) as {
      username: string; password: string;
    };

    const items = await scrapeStudentVue(account.district_url!, creds.username, creds.password);

    await clearItemsBySource(userId, "studentvue");
    const { count: imported } = await insertImportedItems(userId, items as ImportedItem[]);
    await touchLastSynced(account.id);

    await completeJob(jobId, { imported });
    res.json({ success: true, jobId, imported });
  } catch (err) {
    const { status, message } = toClientError(err, "We couldn't sync your StudentVUE schedule. Try again in a moment.", 400);
    logger.error("StudentVUE sync error", internalDetail(err));
    await failJob(jobId, message);
    res.status(status).json({ error: message, jobId });
  }
});

// ── POST /api/integrations/studentvue/sync-grades ─────────
// Logs into StudentVUE, scrapes current course grades,
// and upserts them into the grades + courses tables.

router.post("/studentvue/sync-grades", async (req, res) => {
  const userId = req.user!.userId;
  req.socket.setTimeout(180_000);

  try {
    const accounts = await getConnectedAccounts(userId);
    const account = accounts.find((a) => a.provider === "studentvue");
    if (!account) {
      res.status(404).json({ error: "StudentVUE not connected. Connect it first in Schedule → Connect School." });
      return;
    }

    const creds = JSON.parse(decrypt(account.encrypted_credentials)) as {
      username: string; password: string;
    };

    logger.info(`StudentVUE sync-grades: starting for user ${userId}`);
    const courseGrades = await getStudentVueGradebook(account.district_url ?? "https://sisstudent.fcps.edu/SVUE", creds.username, creds.password);

    if (courseGrades.length === 0) {
      res.json({ synced: 0, courses: [], message: "No grades found on StudentVUE gradebook." });
      return;
    }

    // Map FCPS course type → grading_scale value
    const scaleMap: Record<string, string> = {
      ap: "ap", ib: "ib", de: "de", av: "av", honors: "honors", standard: "standard",
    };

    // Convert raw FCPS type → "sv:<slug>" DB category key.
    // e.g. "HW Formative" → "sv:hw_formative", "Summative" → "sv:summative"
    // All sv: prefixed entries can be deleted on re-sync with `category LIKE 'sv:%'`.
    const toSvCategory = (rawType: string): string =>
      "sv:" + rawType.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "sv:other";

    let synced = 0;
    const courseNames: string[] = [];

    // Wipe ALL previously synced grades before re-importing so stale courses don't persist
    await query(
      `DELETE FROM grades WHERE user_id = $1 AND (category = 'studentvue_sync' OR category LIKE 'sv:%')`,
      [userId]
    );

    for (const cg of courseGrades) {
      const gradingScale = scaleMap[cg.courseType] ?? "standard";

      // Upsert course with correct weighting scale
      await query(
        `INSERT INTO courses (user_id, name, grading_scale)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, name) DO UPDATE SET
           grading_scale = EXCLUDED.grading_scale,
           updated_at    = now()`,
        [userId, cg.courseName, gradingScale]
      );

      if (cg.assignments.length > 0) {
        // Sync individual assignments
        for (const a of cg.assignments) {
          if (a.score === null && a.maxScore === null) continue;
          await query(
            `INSERT INTO grades (user_id, title, course_name, score, max_score, weight, category, graded_at)
             VALUES ($1, $2, $3, $4, $5, 1.0, $6, $7)`,
            [
              userId,
              a.title.slice(0, 255),
              cg.courseName,
              a.score,
              a.maxScore,
              toSvCategory(a.category),
              a.gradedAt,
            ]
          );
        }
        synced++;
        courseNames.push(cg.courseName);
      } else if (cg.gradePct !== null) {
        // Fallback: store overall grade if no individual assignments
        await query(
          `INSERT INTO grades (user_id, title, course_name, score, max_score, weight, category, graded_at)
           VALUES ($1, 'Current Grade', $2, $3, 100, 1.0, 'studentvue_sync', CURRENT_DATE)`,
          [userId, cg.courseName, Math.round(cg.gradePct * 10) / 10]
        );
        synced++;
        courseNames.push(cg.courseName);
      }
    }

    await touchLastSynced(account.id);
    logger.info(`StudentVUE sync-grades: synced ${synced} courses for user ${userId}`);
    res.json({ synced, courses: courseNames });
  } catch (err) {
    const { status, message } = toClientError(err, "We couldn't sync your grades from StudentVUE. Try again in a moment.", 400);
    logger.error("StudentVUE sync-grades error", internalDetail(err));
    res.status(status).json({ error: message });
  }
});

// ── POST /api/integrations/schoology/connect ──────────────

router.post(
  "/schoology/connect",
  connectLimiter,
  validate(schoologySchema),
  async (req, res) => {
    const { host, username, password } = req.body as z.infer<typeof schoologySchema>;
    const userId = req.user!.userId;

    req.socket.setTimeout(120_000);

    const jobId = await createJob(userId, "schoology");

    try {
      logger.info(`Schoology connect: starting for user ${userId}`);
      const items = await scrapeSchoology(host, username, password);

      const encryptedCreds = encrypt(JSON.stringify({ host, username, password }));
      const account = await upsertConnectedAccount(userId, "schoology", encryptedCreds, `https://${host}`);

      await clearItemsBySource(userId, "schoology");
      const { count: imported, newItems } = await insertImportedItems(userId, items as ImportedItem[]);
      await touchLastSynced(account.id);

      // Fire push for newly discovered assignments (non-blocking)
      pushNewSchoologyItems(userId, newItems).catch((e) => logger.error("push new schoology items error", e));

      await completeJob(jobId, { imported });
      res.json({ success: true, jobId, accountId: account.id, imported });
    } catch (err) {
      const { status, message } = toClientError(err, "We couldn't import from Schoology. Check your district and sign-in details, then try again.", 400);
      logger.error("Schoology connect error", internalDetail(err));
      await failJob(jobId, message);
      res.status(status).json({ error: message, jobId });
    }
  }
);

// ── POST /api/integrations/schoology/sync ─────────────────

router.post("/schoology/sync", async (req, res) => {
  const userId = req.user!.userId;
  req.socket.setTimeout(120_000);

  const jobId = await createJob(userId, "schoology");

  try {
    const accounts = await getConnectedAccounts(userId);
    const account = accounts.find((a) => a.provider === "schoology");
    if (!account) {
      await failJob(jobId, "Schoology not connected");
      res.status(404).json({ error: "Schoology not connected", jobId });
      return;
    }

    const creds = JSON.parse(decrypt(account.encrypted_credentials)) as {
      host: string; username: string; password: string;
    };

    const items = await scrapeSchoology(creds.host, creds.username, creds.password);

    await clearItemsBySource(userId, "schoology");
    const { count: imported, newItems } = await insertImportedItems(userId, items as ImportedItem[]);
    await touchLastSynced(account.id);

    // Fire push for newly discovered assignments (non-blocking)
    pushNewSchoologyItems(userId, newItems).catch((e) => logger.error("push new schoology items error", e));

    await completeJob(jobId, { imported });
    res.json({ success: true, jobId, imported });
  } catch (err) {
    const { status, message } = toClientError(err, "We couldn't sync from Schoology. Try again in a moment.", 400);
    logger.error("Schoology sync error", internalDetail(err));
    await failJob(jobId, message);
    res.status(status).json({ error: message, jobId });
  }
});

// ── GET /api/integrations/jobs/:jobId ─────────────────────

router.get("/jobs/:jobId", async (req, res) => {
  const userId = req.user!.userId;
  try {
    const { rows } = await query(
      `SELECT id, provider, status, result, error, created_at, completed_at
       FROM scrape_jobs WHERE id = $1 AND user_id = $2`,
      [req.params.jobId, userId]
    );
    if (rows.length === 0) { res.status(404).json({ error: "Job not found" }); return; }
    const j = rows[0];
    res.json({
      jobId: j.id,
      provider: j.provider,
      status: j.status,
      result: j.result ?? null,
      error: j.error ?? null,
      createdAt: j.created_at,
      completedAt: j.completed_at ?? null,
    });
  } catch (err) {
    logger.error("Failed to get job status", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/integrations ──────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const accounts = await getConnectedAccounts(req.user!.userId);
    const safe = accounts.map(({ encrypted_credentials: _ec, ...rest }) => rest);
    res.json({ accounts: safe });
  } catch (err) {
    logger.error("Failed to get integrations", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /api/integrations/:id ──────────────────────────

router.delete("/:id", async (req, res) => {
  const userId = req.user!.userId;
  try {
    const account = await getConnectedAccount(req.params.id, userId);
    if (!account) { res.status(404).json({ error: "Account not found" }); return; }

    await clearItemsBySource(userId, account.provider);
    await deleteConnectedAccount(req.params.id, userId);

    res.json({ deleted: true });
  } catch (err) {
    logger.error("Failed to delete integration", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
