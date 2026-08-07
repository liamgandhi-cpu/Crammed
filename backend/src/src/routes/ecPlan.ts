import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { query, getClient } from "../config/db";
import { logger } from "../logger";
import { toClientError, internalDetail } from "../utils/errors";
import {
  consumeAiCall,
  refundAiCall,
  readAiUsage,
  type AiUsage,
} from "../utils/aiUsage";
import { generateEcPlan, EC_CATEGORIES, type EcPlanItem } from "../services/ecPlanner";

const router = Router();
router.use(authenticate);

/**
 * Every query here is scoped by user_id. That scoping is the whole of the
 * ownership check — the table has no RLS (see migrations/run.ts), so a query
 * that forgets the user_id predicate is a data leak rather than a policy
 * violation the database will catch.
 */

/**
 * pg returns SMALLINT as a number but NUMERIC as a *string* — `hours_per_week`
 * arrives as "2.0", not 2. Every row leaving this module goes through here, so
 * a client can add the field up without getting string concatenation.
 *
 * Returning a raw row from one endpoint and a converted row from another is
 * how that bug got in: the list was converted, the insert and update were not.
 */
function toItem(row: Record<string, unknown>): EcPlanItem {
  return {
    ...(row as unknown as EcPlanItem),
    year: Number(row.year),
    hours_per_week: row.hours_per_week === null ? null : Number(row.hours_per_week),
  };
}

async function listItems(userId: string): Promise<EcPlanItem[]> {
  const result = await query(
    `SELECT id, title, year, category, why, first_step, hours_per_week, created_at
     FROM ec_plan_items
     WHERE user_id = $1
     ORDER BY year, created_at`,
    [userId]
  );
  return result.rows.map(toItem);
}

// ── GET /api/ec-plan ───────────────────────────────────────

router.get("/", async (req: Request, res: Response) => {
  try {
    const [items, usage] = await Promise.all([
      listItems(req.user!.userId),
      readAiUsage(req.user!.userId),
    ]);
    res.json({ items, usage });
  } catch (err) {
    logger.error("Failed to load EC plan", internalDetail(err));
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/ec-plan/generate ─────────────────────────────

const generateSchema = z.object({
  currentYear: z.number().int().min(9).max(12),
  interests: z.string().min(10).max(2000),
  hoursPerWeek: z.number().min(1).max(40),
});

router.post("/generate", validate(generateSchema), async (req: Request, res: Response) => {
  const opts = req.body as z.infer<typeof generateSchema>;
  const userId = req.user!.userId;

  let usage: AiUsage;
  try {
    usage = await consumeAiCall(userId);
  } catch (err) {
    logger.error("Failed to record AI usage", internalDetail(err));
    res.status(500).json({ error: "Internal server error" });
    return;
  }

  // Over cap: the call is already counted, which is deliberate — repeated
  // attempts past the limit shouldn't be free to make.
  if (!usage.allowed) {
    res.status(429).json({
      error: `You've used all ${usage.limit} plan generations for today. They reset at midnight UTC.`,
      usage,
    });
    return;
  }

  try {
    const generated = await generateEcPlan(userId, opts);

    // Replace the saved plan in one transaction: a generation that fails
    // partway must not leave the student with half of two different plans.
    const client = await getClient();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM ec_plan_items WHERE user_id = $1", [userId]);
      for (const item of generated) {
        await client.query(
          `INSERT INTO ec_plan_items
             (user_id, title, year, category, why, first_step, hours_per_week)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            userId,
            item.title,
            item.year,
            item.category,
            item.why,
            item.first_step,
            item.hours_per_week,
          ]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    res.json({ items: await listItems(userId), usage });
  } catch (err) {
    // The generation produced nothing, so it shouldn't cost a generation.
    await refundAiCall(userId);

    // Never forward the raw message: this path calls the Anthropic SDK, whose
    // errors describe our configuration rather than the student's problem.
    const { status, message } = toClientError(
      err,
      "We couldn't build your plan just now. Try again in a moment.",
      500
    );
    logger.error("Failed to generate EC plan", internalDetail(err));
    res.status(status).json({ error: message });
  }
});

// ── POST /api/ec-plan/items ────────────────────────────────

const itemSchema = z.object({
  title: z.string().min(1).max(255),
  year: z.number().int().min(9).max(12),
  category: z.enum(EC_CATEGORIES),
  why: z.string().max(2000).nullable().optional(),
  first_step: z.string().max(2000).nullable().optional(),
  hours_per_week: z.number().min(0).max(40).nullable().optional(),
});

router.post("/items", validate(itemSchema), async (req: Request, res: Response) => {
  const item = req.body as z.infer<typeof itemSchema>;
  try {
    const result = await query(
      `INSERT INTO ec_plan_items
         (user_id, title, year, category, why, first_step, hours_per_week)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, title, year, category, why, first_step, hours_per_week, created_at`,
      [
        req.user!.userId,
        item.title,
        item.year,
        item.category,
        item.why ?? null,
        item.first_step ?? null,
        item.hours_per_week ?? null,
      ]
    );
    res.status(201).json({ item: toItem(result.rows[0]) });
  } catch (err) {
    logger.error("Failed to add EC plan item", internalDetail(err));
    res.status(500).json({ error: "Couldn't add that item. Try again." });
  }
});

// ── PATCH /api/ec-plan/items/:id ───────────────────────────

const patchSchema = itemSchema.partial();

router.patch("/items/:id", validate(patchSchema), async (req: Request, res: Response) => {
  const p = req.body as z.infer<typeof patchSchema>;
  try {
    const result = await query(
      `UPDATE ec_plan_items SET
         title          = COALESCE($3, title),
         year           = COALESCE($4, year),
         category       = COALESCE($5, category),
         why            = COALESCE($6, why),
         first_step     = COALESCE($7, first_step),
         hours_per_week = COALESCE($8, hours_per_week)
       WHERE id = $1 AND user_id = $2
       RETURNING id, title, year, category, why, first_step, hours_per_week, created_at`,
      [
        req.params.id,
        req.user!.userId,
        p.title ?? null,
        p.year ?? null,
        p.category ?? null,
        p.why ?? null,
        p.first_step ?? null,
        p.hours_per_week ?? null,
      ]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    res.json({ item: toItem(result.rows[0]) });
  } catch (err) {
    logger.error("Failed to update EC plan item", internalDetail(err));
    res.status(500).json({ error: "Couldn't save that change. Try again." });
  }
});

// ── DELETE /api/ec-plan/items/:id ──────────────────────────

router.delete("/items/:id", async (req: Request, res: Response) => {
  try {
    const result = await query(
      "DELETE FROM ec_plan_items WHERE id = $1 AND user_id = $2 RETURNING id",
      [req.params.id, req.user!.userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error("Failed to delete EC plan item", internalDetail(err));
    res.status(500).json({ error: "Couldn't delete that item. Try again." });
  }
});

export default router;
