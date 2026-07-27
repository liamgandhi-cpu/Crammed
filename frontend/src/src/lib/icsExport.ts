import type { ScheduleItem } from "./api";

// ── Helpers ────────────────────────────────────────────────

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}@myautoplanner`;
}

function icsDate(dateStr: string): string {
  // "2026-03-26" → "20260326"
  return dateStr.replace(/-/g, "");
}

function icsDateTime(dateStr: string, timeStr: string): string {
  // "2026-03-26", "14:30" → "20260326T143000"
  const t = timeStr.slice(0, 5).replace(":", "");
  return `${icsDate(dateStr)}T${t}00`;
}

function escape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// day_of_week: 0=Mon … 6=Sun → iCal BYDAY
const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

// Return the date string (YYYY-MM-DD) of the next occurrence of a given
// day_of_week (0=Mon) on or after today.
function nextOccurrence(dayOfWeek: number): string {
  const today = new Date();
  const todayDow = today.getDay() === 0 ? 6 : today.getDay() - 1; // 0=Mon
  const diff = (dayOfWeek - todayDow + 7) % 7;
  const d = new Date(today);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

// ── Main export ─────────────────────────────────────────────

export function generateICS(items: ScheduleItem[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AutoPlanner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:AutoPlanner Schedule",
    "X-WR-TIMEZONE:America/New_York",
  ];

  const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";

  for (const item of items) {
    if (item.category === "class" && item.day_of_week !== null && item.start_time && item.end_time) {
      // ── Recurring class ───────────────────────────────────
      const startDate = nextOccurrence(item.day_of_week);
      const dtStart = icsDateTime(startDate, item.start_time);
      const dtEnd   = icsDateTime(startDate, item.end_time);
      const byday   = BYDAY[item.day_of_week];

      const eventLines = [
        "BEGIN:VEVENT",
        `UID:${uid()}`,
        `DTSTAMP:${now}`,
        `DTSTART;TZID=America/New_York:${dtStart}`,
        `DTEND;TZID=America/New_York:${dtEnd}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${byday}`,
        `SUMMARY:${escape(item.title)}`,
        item.location ? `LOCATION:${escape(item.location)}` : "",
        item.notes    ? `DESCRIPTION:${escape(item.notes)}` : "",
        "END:VEVENT",
      ].filter((l): l is string => l !== "");
      lines.push(...eventLines);

    } else if (item.due_date && item.category !== "class") {
      // ── Due-date event (all-day) ───────────────────────────
      const label =
        item.category === "exam"    ? `Exam: ${item.title}` :
        item.category === "project" ? `Project due: ${item.title}` :
        `Due: ${item.title}`;

      const dueLines = [
        "BEGIN:VEVENT",
        `UID:${uid()}`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${icsDate(item.due_date)}`,
        `DTEND;VALUE=DATE:${icsDate(item.due_date)}`,
        `SUMMARY:${escape(label)}`,
        item.notes ? `DESCRIPTION:${escape(item.notes)}` : "",
        `CATEGORIES:${item.category.toUpperCase()}`,
        "END:VEVENT",
      ].filter((l): l is string => l !== "");
      lines.push(...dueLines);
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadICS(items: ScheduleItem[], filename = "autoplanner.ics"): void {
  const content = generateICS(items);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
