import { query } from "../config/db";
import { percentToLetter, letterToGpa } from "../routes/grades";
import type { WeeklySummaryData } from "./emailService";

function letterToMinPct(letter: string | null): number {
  const map: Record<string, number> = {
    "A+": 97, A: 93, "A-": 90,
    "B+": 87, B: 83, "B-": 80,
    "C+": 77, C: 73, "C-": 70,
    "D+": 67, D: 63, "D-": 60, F: 0,
  };
  return map[letter ?? ""] ?? 0;
}

export async function buildWeeklySummary(
  userId: string,
  email: string
): Promise<WeeklySummaryData> {
  const now = new Date();

  // Week Monday → Sunday
  const weekStart = new Date(now);
  const dow = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - (dow === 0 ? 6 : dow - 1));
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const startStr = weekStart.toISOString().slice(0, 10);
  const endStr = weekEnd.toISOString().slice(0, 10);

  const monthFmt = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" });
  const weekRange = `${monthFmt.format(weekStart)}–${weekEnd.getDate()}`;
  const firstName = email.split("@")[0];

  const [classRes, assignRes, examRes, gradeRes, focusCurRes, streakRes] =
    await Promise.all([
      // Classes this week (Mon–Fri, day_of_week 0–4 in our system)
      query(
        `SELECT COUNT(*) AS cnt FROM schedule_items
         WHERE user_id = $1 AND category = 'class'
           AND day_of_week BETWEEN 0 AND 4`,
        [userId]
      ),
      // Assignments due this week
      query(
        `SELECT COUNT(*) AS cnt FROM schedule_items
         WHERE user_id = $1 AND category IN ('assignment','project')
           AND due_date BETWEEN $2::DATE AND $3::DATE`,
        [userId, startStr, endStr]
      ),
      // Upcoming exams (next 14 days)
      query(
        `SELECT title, due_date FROM schedule_items
         WHERE user_id = $1 AND category = 'exam'
           AND due_date >= $2::DATE
           AND due_date <= ($2::DATE + INTERVAL '14 days')
         ORDER BY due_date`,
        [userId, startStr]
      ),
      // Grade averages per course
      query(
        `SELECT g.course_name,
                AVG(CASE WHEN g.max_score > 0 THEN g.score / g.max_score * 100 END) AS avg,
                c.target_grade
         FROM grades g
         LEFT JOIN courses c ON c.user_id = g.user_id AND c.name = g.course_name
         WHERE g.user_id = $1 AND g.score IS NOT NULL AND g.max_score IS NOT NULL
         GROUP BY g.course_name, c.target_grade
         ORDER BY g.course_name`,
        [userId]
      ),
      // Focus time last 7 days
      query(
        `SELECT COALESCE(SUM(duration_seconds), 0) AS total
         FROM focus_sessions
         WHERE user_id = $1 AND session_type = 'focus' AND completed = true
           AND started_at >= (now() - INTERVAL '7 days')`,
        [userId]
      ),
      // Streak calculation
      query(
        `SELECT DISTINCT DATE(started_at) AS d
         FROM focus_sessions
         WHERE user_id = $1 AND session_type = 'focus' AND completed = true
         ORDER BY d DESC LIMIT 30`,
        [userId]
      ),
    ]);

  const exams = examRes.rows.map((e) => ({
    title: String(e.title),
    daysUntil: Math.max(
      1,
      Math.ceil(
        (new Date(e.due_date).getTime() - now.getTime()) / 86_400_000
      )
    ),
  }));

  const courses = gradeRes.rows.map((c) => {
    const avg = c.avg !== null ? parseFloat(String(c.avg)) : null;
    const letterGrade = avg !== null ? percentToLetter(avg) : null;
    const targetGrade = c.target_grade ?? null;
    const onTrack =
      avg !== null && targetGrade ? avg >= letterToMinPct(targetGrade) : true;
    return {
      name: String(c.course_name),
      average: avg !== null ? Math.round(avg * 10) / 10 : null,
      letterGrade,
      targetGrade,
      onTrack,
    };
  });

  const totalSeconds = parseInt(String(focusCurRes.rows[0].total));
  const streakDates = streakRes.rows.map((r) => String(r.d).slice(0, 10));
  let streak = 0;
  for (let i = 0; i < streakDates.length; i++) {
    const expected = new Date(Date.now() - i * 86_400_000)
      .toISOString()
      .slice(0, 10);
    if (streakDates[i] === expected) streak++;
    else break;
  }

  // Suppress unused import warning
  void letterToGpa;

  return {
    firstName,
    weekRange,
    classCount: parseInt(String(classRes.rows[0].cnt)),
    assignmentCount: parseInt(String(assignRes.rows[0].cnt)),
    exams,
    courses,
    focusStats: { totalSeconds, streak },
  };
}
