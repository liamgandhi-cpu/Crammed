/**
 * Summer session detection.
 *
 * The daily planner is built around term time: it joins recurring `class`
 * items on `day_of_week` and layers assignments and exams on top. Over summer
 * that query returns nothing, so the generated plan collapses to whatever
 * one-off items happen to exist — the page is technically working and
 * practically empty.
 *
 * Summer mode tells the planner to stop scaffolding around a class timetable
 * that isn't there and to plan the day around self-directed work instead.
 */

export type SummerMode = "auto" | "on" | "off";

/** Inclusive month/day bounds for the default (northern-hemisphere) break. */
const SUMMER_START = { month: 6, day: 15 }; // 15 June
const SUMMER_END = { month: 8, day: 25 }; // 25 August

/**
 * `date` is a local calendar date, not an instant — callers pass the same
 * `YYYY-MM-DD` the planner is generating for, so no timezone conversion is
 * involved and none should be introduced.
 */
export function isSummerSession(date: string, mode: SummerMode = "auto"): boolean {
  if (mode === "on") return true;
  if (mode === "off") return false;

  const [, m, d] = date.split("-").map(Number);
  if (!m || !d) return false;

  const after = m > SUMMER_START.month || (m === SUMMER_START.month && d >= SUMMER_START.day);
  const before = m < SUMMER_END.month || (m === SUMMER_END.month && d <= SUMMER_END.day);
  return after && before;
}

/**
 * Planner guidance for a summer day. Kept beside the detection so the two
 * can't drift: if the window changes, the copy describing it is right here.
 *
 * Deliberately does NOT tell the model "there are no classes" — a student
 * taking summer courses still has real `class` items, and those are passed
 * in as fixed blocks. It says the *default* is no fixed timetable, and to
 * treat whatever fixed blocks do exist as authoritative.
 */
export const SUMMER_PLANNING_GUIDANCE = `
═══ SUMMER SESSION ═══
School is out, so there is usually no recurring class timetable to build
around. Any fixed blocks listed above are real (summer courses, a job,
practice) — respect them exactly as you would during term.

Plan the rest of the day differently from a school day:
- Lead with the student's own projects, prep work, reading and skill-building
  rather than homework due tomorrow.
- Use longer, less fragmented focus blocks — there is no bell schedule to
  work around.
- Protect genuine downtime. A summer day that reads like a school day is a
  worse plan, not a more productive one.
- If there is little or nothing scheduled, say so plainly and suggest one or
  two concrete things worth doing, rather than padding the day with filler.
`.trim();
