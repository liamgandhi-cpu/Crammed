import { Router } from "express";
import { z } from "zod";
import { query } from "../config/db";
import { authenticate } from "../middleware/auth";
import { logger } from "../logger";

export const gradesRouter = Router();
export const coursesRouter = Router();

gradesRouter.use(authenticate);
coursesRouter.use(authenticate);

// ── Helpers ────────────────────────────────────────────────

// FCPS grading scale (2025-26: D- eliminated, D = 60–66)
export function percentToLetter(pct: number): string {
  if (pct >= 92.5) return "A";
  if (pct >= 89.5) return "A-";
  if (pct >= 86.5) return "B+";
  if (pct >= 82.5) return "B";
  if (pct >= 79.5) return "B-";
  if (pct >= 76.5) return "C+";
  if (pct >= 72.5) return "C";
  if (pct >= 69.5) return "C-";
  if (pct >= 66.5) return "D+";
  if (pct >= 59.5) return "D";  // FCPS: D range is 60–66
  return "F";
}

export function letterToGpa(letter: string): number {
  const map: Record<string, number> = {
    A: 4.0, "A-": 3.7,
    "B+": 3.3, B: 3.0, "B-": 2.7,
    "C+": 2.3, C: 2.0, "C-": 1.7,
    "D+": 1.3, D: 1.0,  // no D- in FCPS
    F: 0.0,
  };
  return map[letter] ?? 0.0;
}

/**
 * FCPS weighted GPA bonus:
 *   AP / IB / AV / DE  → +1.0
 *   Honors (HN)        → +0.5
 *   Standard           →  0.0
 */
export function courseTypeBonus(gradingScale: string): number {
  switch ((gradingScale ?? "").toLowerCase()) {
    case "ap":
    case "ib":
    case "av":
    case "de":
      return 1.0;
    case "honors":
    case "hn":
      return 0.5;
    default:
      return 0.0;
  }
}

function letterToMinPct(letter: string | null): number {
  const map: Record<string, number> = {
    "A+": 97, A: 93, "A-": 90,
    "B+": 87, B: 83, "B-": 80,
    "C+": 77, C: 73, "C-": 70,
    "D+": 67, D: 63, "D-": 60,
    F: 0,
  };
  return map[letter ?? ""] ?? 0;
}

// ── Schemas ────────────────────────────────────────────────

const gradeSchema = z.object({
  title: z.string().min(1).max(255),
  course_name: z.string().min(1).max(255),
  score: z.number().nullable().optional(),
  max_score: z.number().positive().nullable().optional(),
  weight: z.number().positive().optional().default(1.0),
  category: z.string().max(100).nullable().optional(),
  graded_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  schedule_item_id: z.string().uuid().nullable().optional(),
});

const courseSchema = z.object({
  name: z.string().min(1).max(255),
  full_name: z.string().max(500).nullable().optional(),
  credit_hours: z.number().positive().optional().default(3.0),
  grading_scale: z.string().max(50).optional().default("standard"),
  target_grade: z.string().max(2).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
});

// ── GET /api/grades/summary (MUST be before /:id) ──────────

gradesRouter.get("/summary", async (req, res) => {
  const userId = req.user!.userId;
  try {
    const [coursesRes, gradesRes] = await Promise.all([
      query("SELECT * FROM courses WHERE user_id = $1 ORDER BY name", [userId]),
      query(
        "SELECT * FROM grades WHERE user_id = $1 ORDER BY course_name, graded_at",
        [userId]
      ),
    ]);
    const allGrades = gradesRes.rows;
    const allCourses = coursesRes.rows;

    // Group grades by course
    const byCourseName = new Map<string, typeof allGrades>();
    for (const g of allGrades) {
      const arr = byCourseName.get(g.course_name) ?? [];
      arr.push(g);
      byCourseName.set(g.course_name, arr);
    }

    interface CourseStat {
      name: string;
      average: number | null;
      letterGrade: string | null;
      gpaPoints: number;
      creditHours: number;
      gradeCount: number;
      targetGrade: string | null;
      onTrack: boolean;
      color: string | null;
      fullName: string | null;
    }

    const courseStats: CourseStat[] = [];
    let weightedGpaSum = 0;
    let totalCredits = 0;

    // All course names (including configured courses with no grades yet)
    const allCourseNames = new Set([
      ...byCourseName.keys(),
      ...allCourses.map((c) => String(c.name)),
    ]);

    for (const courseName of allCourseNames) {
      const courseConfig = allCourses.find((c) => c.name === courseName);
      const creditHours = parseFloat(String(courseConfig?.credit_hours ?? 3.0));
      const targetGrade = courseConfig?.target_grade ?? null;
      const grades = byCourseName.get(courseName) ?? [];
      const scored = grades.filter(
        (g) =>
          g.score !== null &&
          g.max_score !== null &&
          parseFloat(String(g.max_score)) > 0
      );

      if (scored.length === 0) {
        courseStats.push({
          name: courseName,
          average: null,
          letterGrade: null,
          gpaPoints: 0,
          creditHours,
          gradeCount: grades.length,
          targetGrade,
          onTrack: true,
          color: courseConfig?.color ?? null,
          fullName: courseConfig?.full_name ?? null,
        });
        continue;
      }

      // FCPS 70/30 weighting: any sv:*summative* category → 70%, any sv:*formative* → 30%.
      // This handles "sv:summative", "sv:hw_formative", "sv:formative", etc.
      const isSvCat = (cat: string | null) => (cat ?? "").startsWith("sv:");
      const hasFcpsCategories = scored.some((g) => isSvCat(g.category));

      let average: number;
      if (hasFcpsCategories) {
        const summative = scored.filter((g) => (g.category ?? "").includes("summative"));
        const formative = scored.filter((g) => (g.category ?? "").includes("formative"));
        const calcPts = (gs: typeof scored) => {
          const pts = gs.reduce((s, g) => s + parseFloat(String(g.score)), 0);
          const max = gs.reduce((s, g) => s + parseFloat(String(g.max_score)), 0);
          return max > 0 ? (pts / max) * 100 : null;
        };
        const sAvg = calcPts(summative);
        const fAvg = calcPts(formative);
        if (sAvg !== null && fAvg !== null) {
          average = 0.7 * sAvg + 0.3 * fAvg;
        } else {
          average = sAvg ?? fAvg ?? 0;
        }
      } else {
        let wSum = 0, wTotal = 0;
        for (const g of scored) {
          const pct =
            (parseFloat(String(g.score)) / parseFloat(String(g.max_score))) * 100;
          const w = parseFloat(String(g.weight ?? 1));
          wSum += pct * w;
          wTotal += w;
        }
        average = wTotal > 0 ? wSum / wTotal : 0;
      }
      const letterGrade = percentToLetter(average);
      // FCPS weighted GPA: base quality points + course type bonus
      const bonus = courseTypeBonus(courseConfig?.grading_scale ?? "standard");
      const gpaPoints = Math.min(5.0, letterToGpa(letterGrade) + bonus);
      const threshold = letterToMinPct(targetGrade);
      const onTrack = average >= threshold;

      courseStats.push({
        name: courseName,
        average: Math.round(average * 10) / 10,
        letterGrade,
        gpaPoints,
        creditHours,
        gradeCount: scored.length,
        targetGrade,
        onTrack,
        color: courseConfig?.color ?? null,
        fullName: courseConfig?.full_name ?? null,
      });

      weightedGpaSum += gpaPoints * creditHours;
      totalCredits += creditHours;
    }

    const overallGPA =
      totalCredits > 0
        ? Math.round((weightedGpaSum / totalCredits) * 100) / 100
        : null;

    // GPA history: monthly snapshots based on graded_at
    const gpaHistory: { date: string; gpa: number }[] = [];
    const datedGrades = allGrades.filter(
      (g) => g.graded_at && g.score !== null && g.max_score !== null
    );

    if (datedGrades.length > 1) {
      const months = [
        ...new Set(datedGrades.map((g) => String(g.graded_at).slice(0, 7))),
      ].sort();

      for (const month of months) {
        const upTo = datedGrades.filter(
          (g) => String(g.graded_at).slice(0, 7) <= month
        );
        const tempBy = new Map<string, typeof upTo>();
        for (const g of upTo) {
          const arr = tempBy.get(g.course_name) ?? [];
          arr.push(g);
          tempBy.set(g.course_name, arr);
        }
        let tw = 0,
          tc = 0;
        for (const [cn, cg] of tempBy) {
          const sc = cg.filter(
            (g) => g.max_score !== null && parseFloat(String(g.max_score)) > 0
          );
          if (!sc.length) continue;
          let ws = 0,
            wt = 0;
          for (const g of sc) {
            ws +=
              (parseFloat(String(g.score)) / parseFloat(String(g.max_score))) *
              100 *
              parseFloat(String(g.weight ?? 1));
            wt += parseFloat(String(g.weight ?? 1));
          }
          const avg = ws / wt;
          const cc = allCourses.find((c) => c.name === cn);
          const cr = parseFloat(String(cc?.credit_hours ?? 3));
          const cc2 = allCourses.find((c) => c.name === cn);
          const bonus2 = courseTypeBonus(cc2?.grading_scale ?? "standard");
          tw += Math.min(5.0, letterToGpa(percentToLetter(avg)) + bonus2) * cr;
          tc += cr;
        }
        if (tc > 0) {
          gpaHistory.push({
            date: `${month}-01`,
            gpa: Math.round((tw / tc) * 100) / 100,
          });
        }
      }
    }

    res.json({ overallGPA, totalCredits, courses: courseStats, gpaHistory });
  } catch (err) {
    logger.error("Grade summary error", err);
    res.status(500).json({ error: "Failed to fetch grade summary" });
  }
});

// ── GET /api/grades ────────────────────────────────────────

gradesRouter.get("/", async (req, res) => {
  const userId = req.user!.userId;
  try {
    const result = await query(
      "SELECT * FROM grades WHERE user_id = $1 ORDER BY course_name, graded_at DESC NULLS LAST, created_at DESC",
      [userId]
    );
    const grouped: Record<string, unknown[]> = {};
    for (const row of result.rows) {
      if (!grouped[row.course_name]) grouped[row.course_name] = [];
      grouped[row.course_name].push(row);
    }
    res.json({ grades: result.rows, grouped });
  } catch (err) {
    logger.error("Get grades error", err);
    res.status(500).json({ error: "Failed to fetch grades" });
  }
});

// ── POST /api/grades ───────────────────────────────────────

gradesRouter.post("/", async (req, res) => {
  const userId = req.user!.userId;
  const parsed = gradeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  try {
    const result = await query(
      `INSERT INTO grades (user_id, schedule_item_id, title, course_name, score, max_score, weight, category, graded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        userId,
        d.schedule_item_id ?? null,
        d.title,
        d.course_name,
        d.score ?? null,
        d.max_score ?? null,
        d.weight ?? 1.0,
        d.category ?? null,
        d.graded_at ?? null,
      ]
    );
    // Auto-create course row if it doesn't exist
    await query(
      `INSERT INTO courses (user_id, name) VALUES ($1, $2) ON CONFLICT (user_id, name) DO NOTHING`,
      [userId, d.course_name]
    );
    res.status(201).json({ grade: result.rows[0] });
  } catch (err) {
    logger.error("Create grade error", err);
    res.status(500).json({ error: "Failed to create grade" });
  }
});

// ── PUT /api/grades/:id ────────────────────────────────────

gradesRouter.put("/:id", async (req, res) => {
  const userId = req.user!.userId;
  const parsed = gradeSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  try {
    const result = await query(
      `UPDATE grades SET
         title      = COALESCE($3, title),
         course_name = COALESCE($4, course_name),
         score      = COALESCE($5::DECIMAL, score),
         max_score  = COALESCE($6::DECIMAL, max_score),
         weight     = COALESCE($7::DECIMAL, weight),
         category   = COALESCE($8, category),
         graded_at  = COALESCE($9::DATE, graded_at),
         updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [
        req.params.id,
        userId,
        d.title ?? null,
        d.course_name ?? null,
        d.score ?? null,
        d.max_score ?? null,
        d.weight ?? null,
        d.category ?? null,
        d.graded_at ?? null,
      ]
    );
    if (!result.rowCount) {
      res.status(404).json({ error: "Grade not found" });
      return;
    }
    res.json({ grade: result.rows[0] });
  } catch (err) {
    logger.error("Update grade error", err);
    res.status(500).json({ error: "Failed to update grade" });
  }
});

// ── DELETE /api/grades/:id ─────────────────────────────────

gradesRouter.delete("/:id", async (req, res) => {
  const userId = req.user!.userId;
  try {
    const result = await query(
      "DELETE FROM grades WHERE id = $1 AND user_id = $2 RETURNING id",
      [req.params.id, userId]
    );
    if (!result.rowCount) {
      res.status(404).json({ error: "Grade not found" });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    logger.error("Delete grade error", err);
    res.status(500).json({ error: "Failed to delete grade" });
  }
});

// ── Courses CRUD ────────────────────────────────────────────

coursesRouter.get("/", async (req, res) => {
  const userId = req.user!.userId;
  try {
    const result = await query(
      "SELECT * FROM courses WHERE user_id = $1 ORDER BY name",
      [userId]
    );
    res.json({ courses: result.rows });
  } catch (err) {
    logger.error("Get courses error", err);
    res.status(500).json({ error: "Failed to fetch courses" });
  }
});

coursesRouter.post("/", async (req, res) => {
  const userId = req.user!.userId;
  const parsed = courseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  try {
    const result = await query(
      `INSERT INTO courses (user_id, name, full_name, credit_hours, grading_scale, target_grade, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id, name) DO UPDATE SET
         full_name     = EXCLUDED.full_name,
         credit_hours  = EXCLUDED.credit_hours,
         grading_scale = EXCLUDED.grading_scale,
         target_grade  = EXCLUDED.target_grade,
         color         = EXCLUDED.color,
         updated_at    = now()
       RETURNING *`,
      [
        userId,
        d.name,
        d.full_name ?? null,
        d.credit_hours ?? 3.0,
        d.grading_scale ?? "standard",
        d.target_grade ?? null,
        d.color ?? null,
      ]
    );
    res.status(201).json({ course: result.rows[0] });
  } catch (err) {
    logger.error("Create course error", err);
    res.status(500).json({ error: "Failed to create course" });
  }
});

coursesRouter.put("/:id", async (req, res) => {
  const userId = req.user!.userId;
  const parsed = courseSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  try {
    const result = await query(
      `UPDATE courses SET
         full_name     = COALESCE($3, full_name),
         credit_hours  = COALESCE($4::DECIMAL, credit_hours),
         grading_scale = COALESCE($5, grading_scale),
         target_grade  = COALESCE($6, target_grade),
         color         = COALESCE($7, color),
         updated_at    = now()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [
        req.params.id,
        userId,
        d.full_name ?? null,
        d.credit_hours ?? null,
        d.grading_scale ?? null,
        d.target_grade ?? null,
        d.color ?? null,
      ]
    );
    if (!result.rowCount) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    res.json({ course: result.rows[0] });
  } catch (err) {
    logger.error("Update course error", err);
    res.status(500).json({ error: "Failed to update course" });
  }
});

coursesRouter.delete("/:id", async (req, res) => {
  const userId = req.user!.userId;
  try {
    const result = await query(
      "DELETE FROM courses WHERE id = $1 AND user_id = $2 RETURNING id",
      [req.params.id, userId]
    );
    if (!result.rowCount) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    logger.error("Delete course error", err);
    res.status(500).json({ error: "Failed to delete course" });
  }
});
