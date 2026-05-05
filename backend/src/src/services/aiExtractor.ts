import Anthropic from "@anthropic-ai/sdk";
import { ICSEvent } from "../utils/fileExtractor";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

// ── Types ──────────────────────────────────────────────────

export interface ParsedScheduleItem {
  title: string;
  category: "class" | "assignment" | "exam" | "project" | "activity" | "other";
  dayOfWeek?: number | null;   // 0=Mon…6=Sun
  startTime?: string | null;   // "HH:MM" 24h
  endTime?: string | null;     // "HH:MM" 24h
  dueDate?: string | null;     // "YYYY-MM-DD"
  location?: string | null;
  notes?: string | null;
  recurring?: boolean;
  color: string;
  sourceFile?: string;
}

// ── Prompt ─────────────────────────────────────────────────

const YEAR = new Date().getFullYear();

function buildPrompt(fileName: string): string {
  return `You are a schedule extraction assistant. Analyze the following document from a file called "${fileName}" and extract ALL schedule-relevant items.

Extract every:
- Class meeting times (recurring weekly — include day of week and time)
- Assignment due dates (with specific date)
- Exam / test dates
- Project deadlines
- Office hours
- Any other scheduled events

For each item return these fields:
- title: concise name (e.g. "CS 301 Lecture", "Midterm Exam", "Essay 2 Due")
- category: one of "class" | "assignment" | "exam" | "project" | "activity" | "other"
- For recurring weekly events: dayOfWeek (0=Monday…6=Sunday), startTime ("HH:MM" 24h), endTime ("HH:MM" 24h), recurring: true
- For one-time dated events: dueDate ("YYYY-MM-DD"), and optionally startTime/endTime if a specific time is given
- location: room/building if mentioned
- notes: relevant context (point value, instructions, etc.)
- color:
  - class      → "#f97316"
  - assignment → "#f43f5e"
  - exam       → "#ef4444"
  - project    → "#a855f7"
  - activity   → "#38bdf8"
  - other      → "#22c55e"

Current year is ${YEAR}. Dates without a year → assume ${YEAR}. Spring semester = Jan–May. Fall semester = Aug–Dec.

Return ONLY a valid JSON array. No markdown, no explanation, no code fences. Example:
[
  {"title":"CS 301 Lecture","category":"class","dayOfWeek":0,"startTime":"09:00","endTime":"10:15","recurring":true,"location":"Room 204","color":"#f97316"},
  {"title":"Midterm Exam","category":"exam","dueDate":"${YEAR}-03-15","startTime":"09:00","endTime":"10:15","notes":"Chapters 1-6","color":"#ef4444"},
  {"title":"Essay 1 Due","category":"assignment","dueDate":"${YEAR}-02-14","notes":"5 pages, MLA","color":"#f43f5e"}
]`;
}

// ── JSON parsing helper ────────────────────────────────────

function extractJSON(raw: string): ParsedScheduleItem[] {
  let s = raw.trim();
  // Strip markdown fences if present
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const match = s.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON array in AI response");
  return JSON.parse(match[0]) as ParsedScheduleItem[];
}

// ── Text extraction ────────────────────────────────────────

export async function extractScheduleFromText(
  text: string,
  fileName: string
): Promise<ParsedScheduleItem[]> {
  const prompt = `${buildPrompt(fileName)}\n\nDocument text:\n\n${text.slice(0, 30_000)}`;

  const call = async (strict = false) => {
    const content = strict
      ? `${prompt}\n\nIMPORTANT: Return ONLY the JSON array — absolutely no other text.`
      : prompt;
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content }],
    });
    const block = msg.content[0];
    if (block.type !== "text") throw new Error("Unexpected AI response type");
    return block.text;
  };

  // First attempt; retry once with stricter prompt if JSON parse fails
  try {
    return extractJSON(await call(false));
  } catch {
    return extractJSON(await call(true));
  }
}

// ── Image extraction (vision) ──────────────────────────────

export async function extractScheduleFromImage(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  fileName: string
): Promise<ParsedScheduleItem[]> {
  const textPrompt = `${buildPrompt(fileName)}\n\nExtract all schedule items visible in this image. Return ONLY the JSON array.`;

  const call = async () => {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageBase64 },
            },
            { type: "text", text: textPrompt },
          ],
        },
      ],
    });
    const block = msg.content[0];
    if (block.type !== "text") throw new Error("Unexpected AI response type");
    return block.text;
  };

  try {
    return extractJSON(await call());
  } catch {
    return extractJSON(await call());
  }
}

// ── ICS → ParsedScheduleItem (no AI needed) ───────────────

const CATEGORY_HINTS: [RegExp, ParsedScheduleItem["category"], string][] = [
  [/exam|midterm|final|quiz/i,      "exam",       "#ef4444"],
  [/assignment|homework|\bhw\b|due/i,"assignment", "#f43f5e"],
  [/project/i,                       "project",    "#a855f7"],
  [/lecture|lab|discussion|class|section/i, "class", "#f97316"],
  [/office.?hour/i,                  "activity",   "#38bdf8"],
];

export function convertICSToScheduleItems(
  events: ICSEvent[],
  fileName: string
): ParsedScheduleItem[] {
  const now = new Date();
  return events
    .filter((e) => {
      try { return new Date(e.start) > now; } catch { return false; }
    })
    .map((e): ParsedScheduleItem => {
      const startDate = new Date(e.start);

      let category: ParsedScheduleItem["category"] = "other";
      let color = "#22c55e";
      for (const [re, cat, col] of CATEGORY_HINTS) {
        if (re.test(e.title)) { category = cat; color = col; break; }
      }

      const pad = (n: number) => String(n).padStart(2, "0");
      const startTime = e.isAllDay
        ? null
        : `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`;
      const endTime =
        !e.isAllDay && e.end
          ? (() => {
              const d = new Date(e.end);
              return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
            })()
          : null;

      return {
        title: e.title,
        category,
        dayOfWeek: null,
        startTime,
        endTime,
        dueDate: e.start.slice(0, 10),
        location: e.location ?? null,
        notes: e.description ?? null,
        recurring: false,
        color,
        sourceFile: fileName,
      };
    });
}
