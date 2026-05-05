import StudentVue from "studentvue";
import type { Schedule, ClassInfo, ClassScheduleInfo } from "studentvue";
import type { NewScheduleItem } from "../models/schedule";
import { logger } from "../logger";

// ── Period-based default bell schedule (FCPS / generic) ────
// Used when a class's time isn't available from today's schedule.
const PERIOD_DEFAULTS: Record<number, { start: string; end: string }> = {
  1: { start: "07:25", end: "08:55" },
  2: { start: "09:00", end: "10:30" },
  3: { start: "10:35", end: "12:05" },
  4: { start: "12:40", end: "14:10" },
  5: { start: "14:15", end: "15:45" },
  6: { start: "08:00", end: "09:30" },
  7: { start: "09:35", end: "11:05" },
  8: { start: "11:10", end: "12:40" },
};

function padTime(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function dateToHHMM(d: Date): string {
  return padTime(d.getHours(), d.getMinutes());
}

/** Build period → time map from today's ClassScheduleInfo entries */
function buildTimeMap(
  todayClasses: ClassScheduleInfo[]
): Map<number, { start: string; end: string }> {
  const map = new Map<number, { start: string; end: string }>();
  for (const c of todayClasses) {
    if (c.time?.start && c.time?.end) {
      map.set(c.period, {
        start: dateToHHMM(new Date(c.time.start)),
        end: dateToHHMM(new Date(c.time.end)),
      });
    }
  }
  return map;
}

function classColor(period: number): string {
  const COLORS = [
    "#f97316", // orange
    "#38bdf8", // blue
    "#a855f7", // purple
    "#22c55e", // green
    "#f43f5e", // rose
    "#eab308", // yellow
    "#06b6d4", // cyan
    "#ec4899", // pink
  ];
  return COLORS[(period - 1) % COLORS.length];
}

/**
 * Login to StudentVUE and return the client.
 * Throws on bad credentials.
 */
export async function loginStudentVue(
  districtUrl: string,
  username: string,
  password: string
) {
  const client = await StudentVue.login(districtUrl, { username, password });
  return client;
}

/**
 * Fetch and convert schedule → NewScheduleItem[].
 * Each class gets one item per weekday (Mon–Fri, 0–4).
 */
export async function fetchStudentVueSchedule(
  districtUrl: string,
  username: string,
  password: string
): Promise<NewScheduleItem[]> {
  const client = await loginStudentVue(districtUrl, username, password);

  let schedule: Schedule;
  try {
    schedule = await client.schedule();
  } catch (err) {
    logger.warn("StudentVUE: schedule() failed", err);
    throw new Error(
      "Could not retrieve schedule from your district. Try the manual entry option instead."
    );
  }

  if (schedule.error) {
    throw new Error(`StudentVUE schedule error: ${schedule.error}`);
  }

  // Build time map from today's schedule info
  const todayClasses: ClassScheduleInfo[] = schedule.today.flatMap(
    (s) => s.classes
  );
  const timeMap = buildTimeMap(todayClasses);

  const items: NewScheduleItem[] = [];

  for (const cls of schedule.classes as ClassInfo[]) {
    // Get times: prefer today's actual times, fall back to period defaults
    let times = timeMap.get(cls.period);
    if (!times) {
      times = PERIOD_DEFAULTS[cls.period] ?? { start: "08:00", end: "09:00" };
    }

    const color = classColor(cls.period);
    const location = cls.room || null;

    // Create one item per weekday (Mon–Fri)
    for (let day = 0; day <= 4; day++) {
      items.push({
        title: cls.name,
        category: "class",
        day_of_week: day,
        start_time: times.start,
        end_time: times.end,
        color,
        location,
        notes: cls.teacher?.name ? `Teacher: ${cls.teacher.name}` : null,
        source: "studentvue",
        source_id: cls.sectionGu ?? null,
        source_file: null,
        due_date: null,
      } as NewScheduleItem & { source: string; source_id: string | null; due_date: null });
    }
  }

  return items;
}

/**
 * Fetch assignments from gradebook → NewScheduleItem[].
 * Each assignment gets a block on its due date.
 */
export async function fetchStudentVueAssignments(
  districtUrl: string,
  username: string,
  password: string
): Promise<(NewScheduleItem & { source: string; source_id: string | null; due_date: string | null })[]> {
  const client = await loginStudentVue(districtUrl, username, password);

  const gradebook = await client.gradebook().catch((err) => {
    logger.warn("StudentVUE: gradebook() failed", err);
    return null;
  });

  if (!gradebook) return [];

  const seen = new Set<string>(); // deduplicate by gradebookId
  const items: (NewScheduleItem & { source: string; source_id: string | null; due_date: string | null })[] = [];

  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 1, 1); // past month

  for (const course of gradebook.courses) {
    for (const mark of course.marks) {
      for (const assignment of mark.assignments) {
        if (seen.has(assignment.gradebookId)) continue;
        seen.add(assignment.gradebookId);

        const dueDate = assignment.date?.due
          ? new Date(assignment.date.due)
          : null;

        // Skip very old assignments
        if (dueDate && dueDate < cutoff) continue;

        const dayOfWeek = dueDate ? dueDate.getDay() : 0; // 0=Sunday in JS
        // Convert JS day (0=Sun) to our day (0=Mon)
        const day = dueDate ? (dayOfWeek === 0 ? 6 : dayOfWeek - 1) : 0;

        const dueDateStr = dueDate
          ? dueDate.toISOString().split("T")[0]
          : null;

        items.push({
          title: assignment.name,
          category: "assignment",
          day_of_week: day,
          start_time: "23:00",
          end_time: "23:59",
          color: "#f43f5e",
          location: null,
          notes: course.title ? `${course.title}` : null,
          source: "studentvue",
          source_id: assignment.gradebookId,
          source_file: null,
          due_date: dueDateStr,
        });
      }
    }
  }

  return items;
}
