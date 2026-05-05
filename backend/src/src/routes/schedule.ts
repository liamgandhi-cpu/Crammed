import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  getScheduleItems,
  createScheduleItem,
  createScheduleItemsBulk,
  updateScheduleItem,
  toggleScheduleItemComplete,
  deleteScheduleItem,
  clearScheduleItems,
  type NewScheduleItem,
} from "../models/schedule";
import { parseScheduleWithAI } from "../utils/scheduleParser";
import { logger } from "../logger";

const router = Router();

// All routes require auth
router.use(authenticate);

// ── Schemas ────────────────────────────────────────────────

const ALL_CATEGORIES = ["class", "activity", "assignment", "study", "other", "exam", "project"] as const;

const itemSchema = z.object({
  title:       z.string().min(1).max(255),
  category:    z.enum(ALL_CATEGORIES),
  day_of_week: z.number().int().min(0).max(6).nullable().optional(),
  start_time:  z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  end_time:    z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/),
  location:    z.string().max(255).nullable().optional(),
  notes:       z.string().nullable().optional(),
  source:      z.string().nullable().optional(),
  source_id:   z.string().nullable().optional(),
  source_file:        z.string().nullable().optional(),
  due_date:           z.string().nullable().optional(),
  estimated_minutes:  z.number().int().min(1).max(1440).nullable().optional(),
});

const bulkSchema = z.object({
  items: z.array(itemSchema).min(1).max(200),
});

const parseSchema = z.object({
  text: z.string().min(1).max(10000),
});

// ── GET /api/schedule ──────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const items = await getScheduleItems(req.user!.userId);
    res.json({ items });
  } catch (err) {
    logger.error("Failed to get schedule", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/schedule/parse ───────────────────────────────

router.post("/parse", validate(parseSchema), async (req, res) => {
  try {
    const { text } = req.body as { text: string };
    const items = await parseScheduleWithAI(text);
    res.json({ items });
  } catch (err) {
    logger.error("Failed to parse schedule", err);
    res.status(500).json({ error: "Failed to parse schedule. Please try again." });
  }
});

// ── POST /api/schedule/bulk ────────────────────────────────

router.post("/bulk", validate(bulkSchema), async (req, res) => {
  try {
    const { items: rawItems } = req.body as z.infer<typeof bulkSchema>;
    const items: NewScheduleItem[] = rawItems.map((i) => ({
      title:       i.title,
      category:    i.category,
      day_of_week: i.day_of_week ?? null,
      start_time:  i.start_time  ?? null,
      end_time:    i.end_time    ?? null,
      color:       i.color,
      location:    i.location    ?? null,
      notes:       i.notes       ?? null,
      source:      i.source      ?? null,
      source_id:   i.source_id   ?? null,
      source_file: i.source_file ?? null,
      due_date:    i.due_date    ?? null,
    }));
    const created = await createScheduleItemsBulk(req.user!.userId, items);
    res.status(201).json({ items: created });
  } catch (err) {
    logger.error("Failed to bulk-create schedule items", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/schedule ─────────────────────────────────────

router.post("/", validate(itemSchema), async (req, res) => {
  try {
    const item = await createScheduleItem(req.user!.userId, req.body);
    res.status(201).json({ item });
  } catch (err) {
    logger.error("Failed to create schedule item", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/schedule/:id ──────────────────────────────────

router.put("/:id", validate(itemSchema), async (req, res) => {
  try {
    const item = await updateScheduleItem(req.params.id, req.user!.userId, req.body);
    if (!item) {
      res.status(404).json({ error: "Schedule item not found" });
      return;
    }
    res.json({ item });
  } catch (err) {
    logger.error("Failed to update schedule item", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /api/schedule/:id/complete ──────────────────────

router.patch("/:id/complete", async (req, res) => {
  const { completed } = req.body;
  if (typeof completed !== "boolean") {
    res.status(400).json({ error: "completed must be a boolean" });
    return;
  }
  try {
    const item = await toggleScheduleItemComplete(req.params.id, req.user!.userId, completed);
    if (!item) { res.status(404).json({ error: "Schedule item not found" }); return; }
    res.json({ item });
  } catch (err) {
    logger.error("Failed to toggle schedule item complete", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /api/schedule (clear all) ──────────────────────

router.delete("/", async (req, res) => {
  try {
    const count = await clearScheduleItems(req.user!.userId);
    res.json({ deleted: count });
  } catch (err) {
    logger.error("Failed to clear schedule", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /api/schedule/:id ───────────────────────────────

router.delete("/:id", async (req, res) => {
  try {
    const deleted = await deleteScheduleItem(req.params.id, req.user!.userId);
    if (!deleted) {
      res.status(404).json({ error: "Schedule item not found" });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    logger.error("Failed to delete schedule item", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
