import Anthropic from "@anthropic-ai/sdk";
import { query } from "../config/db";
import { randomUUID } from "crypto";
import { isSummerSession, SUMMER_PLANNING_GUIDANCE, type SummerMode } from "../utils/season";

const anthropic = new Anthropic();

export interface PlanBlock {
  id: string;
  startTime: string;
  endTime: string;
  title: string;
  type: "class" | "study" | "assignment" | "break" | "prep" | "exam" | "free" | "meal";
  color: string;
  description?: string;
  priority: "high" | "medium" | "low";
  completed: boolean;
}

export interface DailyPlanStats {
  classHours: number;
  studyHours: number;
  freeHours: number;
  assignmentsDueToday: number;
  assignmentsDueThisWeek: number;
  upcomingExams: { title: string; daysUntil: number }[];
}

export interface DailyPlan {
  date: string;
  blocks: PlanBlock[];
  summary: string;
  motivational: string;
  warnings: string[];
  stats: DailyPlanStats;
  generatedAt?: string;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function generateDailyPlan(
  userId: string,
  date: string,
  forceRegenerate = false
): Promise<DailyPlan> {
  // Parse date as local to avoid UTC offset shifting the day
  const [y, m, d] = date.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  const jsDay = dateObj.getDay(); // 0=Sun
  const adjustedDay = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon..6=Sun

  // 1. Get user preferences (with defaults)
  const prefsResult = await query("SELECT * FROM user_preferences WHERE user_id = $1", [userId]);
  const prefs = prefsResult.rows[0] ?? {
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
  };
  const wakeTime = String(prefs.wake_time).slice(0, 5);
  const sleepTime = String(prefs.sleep_time).slice(0, 5);

  // 2. Check cache (skip if force regenerate)
  if (!forceRegenerate) {
    const cached = await query(
      `SELECT * FROM daily_plans
       WHERE user_id = $1 AND plan_date = $2::date
         AND generated_at > now() - INTERVAL '4 hours'`,
      [userId, date]
    );
    if (cached.rows.length > 0) {
      const p = cached.rows[0];
      return {
        date: String(p.plan_date).slice(0, 10),
        blocks: p.blocks as PlanBlock[],
        summary: p.summary,
        motivational: p.motivational,
        warnings: p.warnings as string[],
        stats: p.stats as DailyPlanStats,
        generatedAt: p.generated_at,
      };
    }
  }

  // 3. Get today's classes
  const classesResult = await query(
    `SELECT * FROM schedule_items
     WHERE user_id = $1 AND category = 'class'
       AND start_time IS NOT NULL AND end_time IS NOT NULL
       AND (
         (day_of_week = $2 AND due_date IS NULL)
         OR due_date = $3::date
       )
     ORDER BY start_time`,
    [userId, adjustedDay, date]
  );

  // 3b. Get today's activities (non-class items with fixed times, e.g. clubs, sports)
  const activitiesResult = await query(
    `SELECT * FROM schedule_items
     WHERE user_id = $1 AND category NOT IN ('class','assignment','exam','project','study')
       AND start_time IS NOT NULL AND end_time IS NOT NULL
       AND (
         (day_of_week = $2 AND due_date IS NULL)
         OR due_date = $3::date
       )
     ORDER BY start_time`,
    [userId, adjustedDay, date]
  );

  // 4. Get upcoming assignments/exams (next 14 days) — exclude completed
  const upcomingResult = await query(
    `SELECT * FROM schedule_items
     WHERE user_id = $1
       AND due_date IS NOT NULL
       AND due_date >= $2::date
       AND due_date <= ($2::date + INTERVAL '14 days')
       AND category IN ('assignment','exam','project')
       AND completed = false
     ORDER BY due_date ASC`,
    [userId, date]
  );

  // 5. Due today — exclude completed
  const dueTodayResult = await query(
    `SELECT * FROM schedule_items
     WHERE user_id = $1 AND due_date = $2::date AND completed = false`,
    [userId, date]
  );

  // 5b. Already-completed blocks from today's cached plan (for regenerate context)
  const completedBlocksResult = await query(
    `SELECT blocks FROM daily_plans WHERE user_id = $1 AND plan_date = $2::date`,
    [userId, date]
  );
  const completedBlockTitles: string[] = [];
  if (completedBlocksResult.rows.length > 0) {
    const existingBlocks = completedBlocksResult.rows[0].blocks as PlanBlock[];
    existingBlocks
      .filter((b) => b.completed)
      .forEach((b) => completedBlockTitles.push(b.title));
  }

  const todaysClasses = classesResult.rows;
  const todaysActivities = activitiesResult.rows;
  const dueToday = dueTodayResult.rows;

  // Pre-compute free time windows between wake/sleep and fixed blocks
  function timeToMins(t: string): number {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }
  function minsToTime(m: number): string {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }

  // Combine classes + activities as fixed blocks, sorted by start time
  const allFixedBlocks = [
    ...todaysClasses.map((c: Record<string, unknown>) => ({
      title: String(c.title),
      start: String(c.start_time).slice(0, 5),
      end: String(c.end_time).slice(0, 5),
      kind: "class",
    })),
    ...todaysActivities.map((a: Record<string, unknown>) => ({
      title: String(a.title),
      start: String(a.start_time).slice(0, 5),
      end: String(a.end_time).slice(0, 5),
      kind: String(a.category),
    })),
  ].sort((a, b) => a.start.localeCompare(b.start));

  // Compute free windows (gaps between fixed blocks, accounting for commute)
  const commuteMins = Number(prefs.commute_minutes ?? 0);
  const wakeMin = timeToMins(wakeTime);
  const sleepMin = timeToMins(sleepTime);

  interface FreeWindow { from: string; to: string; minutes: number }
  const freeWindows: FreeWindow[] = [];

  if (allFixedBlocks.length === 0) {
    // Entire day is free
    freeWindows.push({ from: wakeTime, to: sleepTime, minutes: sleepMin - wakeMin });
  } else {
    // Before first block
    const firstStart = timeToMins(allFixedBlocks[0].start) - commuteMins;
    if (firstStart > wakeMin) {
      freeWindows.push({ from: wakeTime, to: minsToTime(firstStart), minutes: firstStart - wakeMin });
    }
    // Between blocks
    for (let i = 0; i < allFixedBlocks.length - 1; i++) {
      const gapStart = timeToMins(allFixedBlocks[i].end) + commuteMins;
      const gapEnd = timeToMins(allFixedBlocks[i + 1].start) - commuteMins;
      if (gapEnd > gapStart) {
        freeWindows.push({ from: minsToTime(gapStart), to: minsToTime(gapEnd), minutes: gapEnd - gapStart });
      }
    }
    // After last block
    const lastEnd = timeToMins(allFixedBlocks[allFixedBlocks.length - 1].end) + commuteMins;
    if (sleepMin > lastEnd) {
      freeWindows.push({ from: minsToTime(lastEnd), to: sleepTime, minutes: sleepMin - lastEnd });
    }
  }

  const totalFreeMin = freeWindows.reduce((s, w) => s + w.minutes, 0);
  const totalFreeHrs = (totalFreeMin / 60).toFixed(1);
  const freeWindowsStr = freeWindows.length === 0
    ? "No free windows (fully booked)"
    : freeWindows.map((w) => `${w.from}–${w.to} (${Math.floor(w.minutes / 60)}h${w.minutes % 60 ? `${w.minutes % 60}m` : ""})`).join(", ");

  // How many study minutes are available today (cap at max_study_hours)
  const maxStudyMin = Number(prefs.max_study_hours ?? 6) * 60;
  const availableStudyMin = Math.min(totalFreeMin - 90, maxStudyMin); // reserve ~90 min for meals/transitions
  const availableStudyHrs = Math.max(0, availableStudyMin / 60).toFixed(1);

  // 6. Get grade context for AI
  const gradesResult = await query(
    `SELECT g.course_name,
            AVG(CASE WHEN g.max_score > 0 THEN g.score / g.max_score * 100 END) AS avg_pct,
            c.target_grade
     FROM grades g
     LEFT JOIN courses c ON c.user_id = g.user_id AND c.name = g.course_name
     WHERE g.user_id = $1 AND g.score IS NOT NULL AND g.max_score IS NOT NULL
     GROUP BY g.course_name, c.target_grade
     ORDER BY g.course_name`,
    [userId]
  );

  function pctToLetter(p: number): string {
    if (p >= 93) return "A"; if (p >= 90) return "A-";
    if (p >= 87) return "B+"; if (p >= 83) return "B"; if (p >= 80) return "B-";
    if (p >= 77) return "C+"; if (p >= 73) return "C"; if (p >= 70) return "C-";
    if (p >= 67) return "D+"; if (p >= 63) return "D"; if (p >= 60) return "D-";
    return "F";
  }
  function letterMin(l: string | null): number {
    const m: Record<string, number> = { "A+":97,A:93,"A-":90,"B+":87,B:83,"B-":80,"C+":77,C:73,"C-":70,"D+":67,D:63,"D-":60,F:0 };
    return m[l ?? ""] ?? 0;
  }

  // Grade lookup map: course_name → { avg, target, below }
  const gradeMap = new Map<string, { avg: number; letter: string; target: string | null; below: boolean }>();
  for (const g of gradesResult.rows) {
    const avg = parseFloat(String(g.avg_pct));
    const target = g.target_grade ?? null;
    gradeMap.set(String(g.course_name), {
      avg,
      letter: pctToLetter(avg),
      target,
      below: target != null && avg < letterMin(target),
    });
  }

  const gradeLines = gradesResult.rows.length === 0
    ? "No grades recorded yet."
    : gradesResult.rows.map((g) => {
        const avg = parseFloat(String(g.avg_pct));
        const letter = pctToLetter(avg);
        const target = g.target_grade ?? null;
        const below = target != null && avg < letterMin(target);
        return `- ${g.course_name}: ${avg.toFixed(1)}% (${letter})${target ? ` — target ${target}` : ""}${below ? " ⚠️ BELOW TARGET — prioritize this course" : ""}`;
      }).join("\n");

  // 7b. Pre-compute urgency scores per upcoming item
  function urgencyScore(item: Record<string, unknown>, daysUntil: number): number {
    const urgencyFromDue = 1 / Math.max(daysUntil, 0.5);
    const categoryMultiplier = item.category === "exam" ? 2.0 : item.category === "project" ? 1.4 : 1.0;
    const courseGrade = gradeMap.get(String(item.title).split(" ")[0]);
    const gradeMultiplier = courseGrade?.below ? 1.5 : 1.0;
    return urgencyFromDue * categoryMultiplier * gradeMultiplier;
  }

  function effortHint(category: string, daysUntil: number, estimatedMinutes?: number | null): string {
    if (category === "exam") {
      const totalMins = estimatedMinutes ?? (daysUntil <= 1 ? 180 : daysUntil <= 3 ? 120 : daysUntil <= 7 ? 60 : 30);
      const hrs = totalMins >= 60
        ? `${Math.floor(totalMins / 60)}h${totalMins % 60 ? `${totalMins % 60}m` : ""}`
        : `${totalMins}min`;
      // Spread total study time across remaining days (roughly equal sessions)
      const daysLeft = Math.max(daysUntil, 1);
      const todayMins = Math.ceil(totalMins / daysLeft);
      const todayHrs = todayMins >= 60
        ? `${Math.floor(todayMins / 60)}h${todayMins % 60 ? `${todayMins % 60}m` : ""}`
        : `${todayMins}min`;
      if (daysUntil <= 1) return `URGENT — ${hrs} study needed TODAY (all remaining prep)`;
      return `${hrs} total prep — schedule ~${todayHrs} TODAY, spread rest over ${daysLeft - 1} remaining day(s)`;
    }
    if (category === "project") {
      if (estimatedMinutes && estimatedMinutes > 0) {
        const hrs = estimatedMinutes >= 60 ? `${Math.floor(estimatedMinutes / 60)}h${estimatedMinutes % 60 ? `${estimatedMinutes % 60}m` : ""}` : `${estimatedMinutes}min`;
        if (daysUntil <= 1) return `URGENT — ~${hrs} needed TODAY to finish`;
        return `~${hrs} total work remaining`;
      }
      if (daysUntil <= 1) return "URGENT — finish today";
      if (daysUntil <= 3) return "~2 hrs work today";
      return "~1 hr progress today";
    }
    // assignment — use user's estimate if set, otherwise default ranges
    if (estimatedMinutes && estimatedMinutes > 0) {
      const hrs = estimatedMinutes >= 60 ? `${Math.floor(estimatedMinutes / 60)}h${estimatedMinutes % 60 ? `${estimatedMinutes % 60}m` : ""}` : `${estimatedMinutes}min`;
      if (daysUntil <= 1) return `URGENT — ~${hrs} to complete TODAY`;
      return `~${hrs} to complete`;
    }
    if (daysUntil <= 1) return "URGENT — complete today (~1-1.5 hrs)";
    if (daysUntil <= 3) return "~45-90 min";
    return "~30-60 min";
  }

  // Sort upcoming by urgency desc
  const upcomingWithUrgency = upcomingResult.rows.map((a: Record<string, unknown> & { title: string; category: string; due_date: string; notes?: string }) => {
    const daysUntil = Math.ceil(
      (new Date(String(a.due_date)).getTime() - dateObj.getTime()) / 86400000
    );
    return { ...a, daysUntil, urgency: urgencyScore(a, daysUntil) };
  }).sort((a, b) => b.urgency - a.urgency);

  // Split into tiers
  const critical = upcomingWithUrgency.filter((a) => a.daysUntil <= 1);
  const highPrio  = upcomingWithUrgency.filter((a) => a.daysUntil > 1 && a.daysUntil <= 4);
  const medium    = upcomingWithUrgency.filter((a) => a.daysUntil > 4 && a.daysUntil <= 10);
  const low       = upcomingWithUrgency.filter((a) => a.daysUntil > 10);

  function formatItem(a: Record<string, unknown> & { daysUntil: number }): string {
    const estMins = a.estimated_minutes != null ? Number(a.estimated_minutes) : null;
    const effort = effortHint(String(a.category), a.daysUntil, estMins);
    return `  - [${a.category}] ${a.title} — due in ${a.daysUntil}d | effort: ${effort}${a.notes ? ` | notes: ${a.notes}` : ""}`;
  }

  // 8. Build prompt
  const summer = isSummerSession(date, (prefs.summer_mode as SummerMode) ?? "auto");

  const prompt = `You are an expert academic scheduler. Build a precise, conflict-free daily plan.

TODAY: ${date} (${DAY_NAMES[jsDay]})

═══ STUDENT PREFERENCES ═══
- Wake: ${wakeTime} | Sleep: ${sleepTime}
- Study style: ${prefs.study_style} → ${
  prefs.study_style === "early_bird" ? "schedule hardest work BEFORE noon; lighter tasks in afternoon"
  : prefs.study_style === "night_owl" ? "schedule hardest tasks AFTER 4 PM; mornings are light"
  : prefs.study_style === "pomodoro" ? "use 25-min work blocks + 5-min breaks throughout"
  : "distribute work evenly across the day"}
- Preferred focus block: ${prefs.preferred_block_length ?? 60} min | Break: ${prefs.break_duration} min after every ${prefs.break_frequency} min of work
- Max study/work today: ${prefs.max_study_hours} hrs | Commute: ${commuteMins} min each way
- Semester load: ${prefs.semester_load ?? "moderate"} → ${
  prefs.semester_load === "heavy" ? "pack every free window with study; minimal leisure"
  : prefs.semester_load === "light" ? "light study load; generous free/leisure blocks"
  : "balanced — roughly equal study and downtime"}${prefs.hard_subjects ? `\n- Hard subjects (add 50% extra time for these): ${prefs.hard_subjects}` : ""}${prefs.notes ? `\n- Extra notes: ${prefs.notes}` : ""}

${summer ? `\n${SUMMER_PLANNING_GUIDANCE}\n` : ""}
═══ FIXED BLOCKS (do NOT overlap or modify these) ═══
${
  allFixedBlocks.length === 0
    ? "No fixed commitments today."
    : allFixedBlocks.map((c) =>
        `- [${c.kind}] ${c.title}: ${c.start}–${c.end}${commuteMins > 0 ? ` (add ${commuteMins}-min travel before AND after)` : ""}`
      ).join("\n")
}

═══ FREE TIME WINDOWS (slots available for scheduling) ═══
Available windows: ${freeWindowsStr}
Total schedulable time: ${totalFreeHrs} hrs
Available for study/work (after meals & transitions): ~${availableStudyHrs} hrs

═══ CURRENT GRADES (use to prioritize subjects) ═══
${gradeLines}

═══ WORK QUEUE (sorted by urgency — highest urgency first) ═══

🔴 CRITICAL — due TODAY, must finish:
${critical.length === 0 ? "  None" : critical.map(formatItem).join("\n")}

🟠 HIGH PRIORITY — due in 1–4 days, schedule significant time:
${highPrio.length === 0 ? "  None" : highPrio.map(formatItem).join("\n")}

🟡 MEDIUM — due in 5–10 days, at least one block today:
${medium.length === 0 ? "  None" : medium.map(formatItem).join("\n")}

🟢 LOW — due in 10+ days, only if free time remains:
${low.length === 0 ? "  None" : low.map(formatItem).join("\n")}
${
  completedBlockTitles.length > 0
    ? `\n═══ ALREADY COMPLETED TODAY — do NOT re-schedule ═══\n${completedBlockTitles.map((t) => `  - ${t}`).join("\n")}`
    : ""
}

═══ SCHEDULING RULES (follow all of these) ═══
1. NEVER let any two blocks overlap — check every pair of consecutive blocks
2. Cover the ENTIRE day from ${wakeTime} to ${sleepTime} — no unexplained time gaps
3. Every minute must be accounted for: class, study, assignment, break, meal, free, or travel
4. Commute: add a "Travel to [class]" block (type="free", ${commuteMins} min) BEFORE each fixed block; add "Travel home" AFTER if needed
5. Urgency order: 🔴 gets time first → 🟠 → 🟡 → 🟢. Never skip a red item
6. EXAMS → use type="study", title="Study: <exam name>". Schedule exactly the TODAY portion from the effort hint. type="exam" is ONLY for the actual exam event
7. ASSIGNMENTS/PROJECTS → use type="assignment", schedule a block of EXACTLY the length in the effort hint
8. Max single-subject focus: ${prefs.preferred_block_length ?? 60} min, then take a ${prefs.break_duration}-min break or switch subjects
9. Total study + assignment work: cap at ${prefs.max_study_hours} hrs
10. Meals: breakfast ~${wakeTime}–${minsToTime(wakeMin + 30)}, lunch ~12:30–13:00, dinner ~18:30–19:00
11. Leave at least 60 min of free/leisure time somewhere in the day
12. Grades: if a course is marked "⚠️ BELOW TARGET", prioritize its study blocks
13. Study style "${prefs.study_style}": apply the style directive above when ordering work blocks

Return ONLY valid JSON with NO markdown fences:
{
  "blocks": [
    {"startTime":"07:00","endTime":"07:30","title":"Breakfast","type":"meal","color":"#22c55e","description":"","priority":"low"},
    {"startTime":"09:00","endTime":"10:15","title":"CS 301","type":"class","color":"#f97316","description":"Attend class","priority":"high"}
  ],
  "summary": "Concise 1-sentence overview of the day",
  "motivational": "A short, specific, encouraging message referencing today's actual tasks",
  "warnings": ["Only flag real issues: overlap risks, impossible workload, insufficient exam prep"]
}

Block type → color mapping (use exactly):
class=#f97316 | study=#38bdf8 | assignment=#f43f5e | break=#94a3b8 | prep=#a855f7 | exam=#ef4444 | free=#6b7280 | meal=#22c55e
Priority: high=due today/tomorrow | medium=due this week | low=everything else
IMPORTANT: blocks must be sorted chronologically by startTime. Every block must have a non-empty title.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected AI response type");

  let jsonStr = content.text.trim();
  // Strip any markdown code fences
  jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  // Extract the first complete JSON object
  const match = jsonStr.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`No JSON in AI response. Got: ${jsonStr.slice(0, 200)}`);
  }

  const plan = JSON.parse(match[0]) as {
    blocks: Omit<PlanBlock, "id" | "completed">[];
    summary: string;
    motivational: string;
    warnings: string[];
  };

  // Sort blocks chronologically and detect/fix overlaps
  const sortedRawBlocks = (plan.blocks ?? []).sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
  );

  // Fix overlaps: if block N's start < block N-1's end, push block N's start forward
  for (let i = 1; i < sortedRawBlocks.length; i++) {
    const prev = sortedRawBlocks[i - 1];
    const curr = sortedRawBlocks[i];
    const prevEndMin = timeToMins(prev.endTime);
    const currStartMin = timeToMins(curr.startTime);
    if (currStartMin < prevEndMin) {
      // Push the current block forward and preserve its duration
      const currEndMin = timeToMins(curr.endTime);
      const duration = Math.max(currEndMin - currStartMin, 0);
      sortedRawBlocks[i] = {
        ...curr,
        startTime: minsToTime(prevEndMin),
        endTime: minsToTime(prevEndMin + duration),
      };
    }
  }

  // Add id + completed to each block, preserving completion state from previous plan
  const completedTitleSet = new Set(completedBlockTitles);
  const blocks: PlanBlock[] = sortedRawBlocks.map((b) => ({
    ...b,
    id: randomUUID(),
    completed: completedTitleSet.has(b.title),
  }));

  // Calculate stats
  const blockMinutes = (b: PlanBlock) => {
    const [sh, sm] = b.startTime.split(":").map(Number);
    const [eh, em] = b.endTime.split(":").map(Number);
    return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
  };

  const stats: DailyPlanStats = {
    classHours: Math.round(
      (blocks.filter((b) => b.type === "class").reduce((s, b) => s + blockMinutes(b), 0) / 60) * 10
    ) / 10,
    studyHours: Math.round(
      (blocks.filter((b) => b.type === "study" || b.type === "assignment").reduce((s, b) => s + blockMinutes(b), 0) / 60) * 10
    ) / 10,
    freeHours: Math.round(
      (blocks.filter((b) => b.type === "free" || b.type === "break").reduce((s, b) => s + blockMinutes(b), 0) / 60) * 10
    ) / 10,
    assignmentsDueToday: dueToday.length,
    assignmentsDueThisWeek: upcomingWithUrgency.filter((a) => a.daysUntil <= 7).length,
    upcomingExams: upcomingWithUrgency
      .filter((a) => a.category === "exam")
      .map((a) => ({ title: String(a.title), daysUntil: a.daysUntil })),
  };

  // Upsert to database
  await query(
    `INSERT INTO daily_plans (user_id, plan_date, blocks, summary, motivational, warnings, stats, model_used, tokens_used)
     VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id, plan_date) DO UPDATE SET
       blocks = EXCLUDED.blocks, summary = EXCLUDED.summary,
       motivational = EXCLUDED.motivational, warnings = EXCLUDED.warnings,
       stats = EXCLUDED.stats, model_used = EXCLUDED.model_used,
       tokens_used = EXCLUDED.tokens_used, generated_at = now()`,
    [
      userId, date,
      JSON.stringify(blocks),
      plan.summary,
      plan.motivational,
      JSON.stringify(plan.warnings ?? []),
      JSON.stringify(stats),
      "claude-sonnet-4-6",
      response.usage.input_tokens + response.usage.output_tokens,
    ]
  );

  // Get the generated_at timestamp
  const savedResult = await query(
    "SELECT generated_at FROM daily_plans WHERE user_id = $1 AND plan_date = $2::date",
    [userId, date]
  );

  return {
    date,
    blocks,
    summary: plan.summary,
    motivational: plan.motivational,
    warnings: plan.warnings ?? [],
    stats,
    generatedAt: savedResult.rows[0]?.generated_at,
  };
}
