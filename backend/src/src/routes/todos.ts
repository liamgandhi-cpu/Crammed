import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { query } from "../config/db";
import { logger } from "../logger";

const router = Router();
router.use(authenticate);

// GET /api/todos
router.get("/", async (req, res) => {
  try {
    const result = await query(
      "SELECT * FROM todos WHERE user_id = $1 ORDER BY created_at ASC",
      [req.user!.userId]
    );
    res.json({ todos: result.rows });
  } catch (err) {
    logger.error("Failed to get todos", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/todos
const createSchema = z.object({ text: z.string().min(1).max(500) });

router.post("/", validate(createSchema), async (req, res) => {
  try {
    const result = await query(
      "INSERT INTO todos (user_id, text) VALUES ($1, $2) RETURNING *",
      [req.user!.userId, req.body.text]
    );
    res.json({ todo: result.rows[0] });
  } catch (err) {
    logger.error("Failed to create todo", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/todos/:id
const updateSchema = z.object({
  text: z.string().min(1).max(500).optional(),
  completed: z.boolean().optional(),
});

router.patch("/:id", validate(updateSchema), async (req, res) => {
  const { text, completed } = req.body as z.infer<typeof updateSchema>;
  const sets: string[] = [];
  const vals: unknown[] = [req.params.id, req.user!.userId];

  if (text !== undefined) { vals.push(text); sets.push(`text=$${vals.length}`); }
  if (completed !== undefined) { vals.push(completed); sets.push(`completed=$${vals.length}`); }
  if (sets.length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }

  try {
    const result = await query(
      `UPDATE todos SET ${sets.join(",")} WHERE id=$1 AND user_id=$2 RETURNING *`,
      vals
    );
    if (!result.rows[0]) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ todo: result.rows[0] });
  } catch (err) {
    logger.error("Failed to update todo", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/todos/:id
router.delete("/:id", async (req, res) => {
  try {
    await query("DELETE FROM todos WHERE id=$1 AND user_id=$2", [req.params.id, req.user!.userId]);
    res.json({ deleted: true });
  } catch (err) {
    logger.error("Failed to delete todo", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
