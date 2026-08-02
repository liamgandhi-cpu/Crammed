import Anthropic from "@anthropic-ai/sdk";
import { query } from "../config/db";
import { UserFacingError } from "../utils/errors";

const anthropic = new Anthropic();

const MODEL = "claude-opus-5";

export const EC_CATEGORIES = [
  "leadership",
  "service",
  "research",
  "arts",
  "athletics",
  "work",
  "competition",
  "project",
] as const;

export type EcCategory = (typeof EC_CATEGORIES)[number];

export interface EcPlanItem {
  id: string;
  title: string;
  year: number;
  category: EcCategory;
  why: string | null;
  first_step: string | null;
  hours_per_week: number | null;
  created_at: string;
}

/** What the model is asked to produce, before it gets an id or a row. */
interface GeneratedItem {
  title: string;
  year: number;
  category: EcCategory;
  why: string;
  first_step: string;
  hours_per_week: number;
}

export interface GenerateOptions {
  /** Grade the student is in now. Years before this are omitted from the plan. */
  currentYear: number;
  /** Free text: what they care about, what they've already done. */
  interests: string;
  /** Realistic weekly budget across all activities. */
  hoursPerWeek: number;
}

/**
 * Structured output schema. Using `output_config.format` rather than asking for
 * JSON in the prompt and regex-matching the reply means a malformed plan is not
 * a failure mode we have to handle.
 */
const PLAN_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          year: { type: "integer", enum: [9, 10, 11, 12] },
          category: { type: "string", enum: [...EC_CATEGORIES] },
          why: { type: "string" },
          first_step: { type: "string" },
          hours_per_week: { type: "number" },
        },
        required: ["title", "year", "category", "why", "first_step", "hours_per_week"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

/** Courses and existing activities, so the plan builds on what's already there. */
async function loadContext(userId: string): Promise<string> {
  const [courses, activities] = await Promise.all([
    query(
      "SELECT name, target_grade FROM courses WHERE user_id = $1 ORDER BY name",
      [userId]
    ),
    query(
      `SELECT DISTINCT title FROM schedule_items
       WHERE user_id = $1 AND category = 'activity'
       ORDER BY title
       LIMIT 25`,
      [userId]
    ),
  ]);

  const courseLines =
    courses.rows.length === 0
      ? "No courses recorded."
      : courses.rows
          .map(
            (c) =>
              `- ${c.name}${c.target_grade ? ` (target ${c.target_grade})` : ""}`
          )
          .join("\n");

  const activityLines =
    activities.rows.length === 0
      ? "None recorded."
      : activities.rows.map((a) => `- ${a.title}`).join("\n");

  return `═══ COURSES ═══\n${courseLines}\n\n═══ ACTIVITIES ALREADY ON THEIR SCHEDULE ═══\n${activityLines}`;
}

/**
 * Ask the model for a four-year extracurricular plan.
 *
 * Returns the items without writing them — the caller decides whether to
 * persist, so a generation the student rejects never touches their saved plan.
 */
export async function generateEcPlan(
  userId: string,
  opts: GenerateOptions
): Promise<GeneratedItem[]> {
  const context = await loadContext(userId);
  const remainingYears = [9, 10, 11, 12].filter((y) => y >= opts.currentYear);

  const prompt = `You are an experienced high school counselor building a realistic extracurricular plan.

THE STUDENT
- Currently in grade ${opts.currentYear}
- Has about ${opts.hoursPerWeek} hours a week for extracurriculars, in total
- In their words: ${opts.interests}

${context}

WHAT TO PRODUCE
A plan covering grades ${remainingYears.join(", ")} — 2 to 4 activities per grade.

RULES
1. Total hours_per_week within a single grade must not exceed ${opts.hoursPerWeek}.
2. Build depth, not a list. Something started in an earlier grade should reappear
   later with more responsibility, rather than being replaced by something new.
3. Ground it in what they already do and study. Do not invent achievements or
   assume resources they haven't mentioned.
4. "first_step" is one concrete action they could take in the next two weeks —
   a person to email, a meeting to show up to, a thing to make. Not "research
   opportunities" or "consider joining".
5. "why" is one sentence on what this builds toward for this specific student.
6. Titles are specific ("Tutor algebra at the public library"), not generic
   ("Volunteering").
7. Do not promise admissions outcomes; this is a plan for how to spend time.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema: PLAN_SCHEMA } },
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal") {
    throw new UserFacingError(
      "We couldn't build a plan from that description. Try rewording what you're interested in.",
      422
    );
  }

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error(`No text block in plan response (stop_reason: ${response.stop_reason})`);
  }

  // output_config.format guarantees the text is JSON matching PLAN_SCHEMA.
  const parsed = JSON.parse(block.text) as { items: GeneratedItem[] };
  const items = parsed.items ?? [];

  if (items.length === 0) {
    throw new UserFacingError(
      "The plan came back empty. Try adding a bit more detail about your interests.",
      422
    );
  }

  // The schema constrains shape but not the cross-item hours rule, so clamp
  // years defensively and drop anything before the student's current grade.
  return items
    .filter((i) => i.year >= opts.currentYear && i.year <= 12)
    .map((i) => ({
      ...i,
      hours_per_week: Math.max(0, Math.min(Number(i.hours_per_week) || 0, 40)),
    }));
}
