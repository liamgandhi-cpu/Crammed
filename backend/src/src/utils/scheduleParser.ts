import Anthropic from "@anthropic-ai/sdk";
import type { NewScheduleItem } from "../models/schedule";

const client = new Anthropic();

const YEAR = new Date().getFullYear();

const PROMPT = `You are a schedule parser for a student planner app. Parse the following text into structured schedule items.

Rules:
- For recurring classes (e.g. "MWF 9-10am", "Tue/Thu 11am-12:30pm"):
  - Create ONE item per day so "MWF" becomes 3 separate items
  - Set day_of_week (0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun)
  - Set start_time and end_time as "HH:MM" (24h format)
  - Set due_date to null
- For assignments/deadlines (e.g. "Essay due Friday", "HW 3 due March 15"):
  - Set due_date as "YYYY-MM-DD" (assume year ${YEAR} if not given)
  - day_of_week, start_time, end_time can be null
- For exams (e.g. "Midterm March 20 2-4pm"):
  - Set due_date and start_time/end_time if given, day_of_week null

Category rules:
- "class" for lectures, labs, discussions, sections, office hours
- "assignment" for homework, essays, problem sets, readings
- "exam" for midterms, finals, quizzes, tests
- "project" for projects, group work, presentations
- "activity" for clubs, sports, gym, extracurriculars
- "study" for study sessions, review, tutoring
- "other" for anything else

Color per category: class="#f97316", assignment="#f43f5e", exam="#ef4444", project="#a855f7", activity="#38bdf8", study="#22c55e", other="#6366f1"

Return ONLY a JSON array, no markdown, no explanation. Example:
[{"title":"CS 301","category":"class","day_of_week":0,"start_time":"09:00","end_time":"10:15","due_date":null,"location":"Room 204","notes":null,"color":"#f97316"},{"title":"CS 301","category":"class","day_of_week":2,"start_time":"09:00","end_time":"10:15","due_date":null,"location":"Room 204","notes":null,"color":"#f97316"},{"title":"Essay 1","category":"assignment","day_of_week":null,"start_time":null,"end_time":null,"due_date":"${YEAR}-02-14","location":null,"notes":"5 pages","color":"#f43f5e"}]

Schedule text to parse:
`;

function extractJSON(raw: string): unknown[] {
  let s = raw.trim();
  s = s.replace(/^` + "```" + `(?:json)?\s*/i, "").replace(/\s*` + "```" + `\s*$/, "");
  const match = s.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON array in AI response");
  return JSON.parse(match[0]) as unknown[];
}

export async function parseScheduleWithAI(text: string): Promise<NewScheduleItem[]> {
  const call = async (strict = false) => {
    const content = strict
      ? `${PROMPT}${text}\n\nIMPORTANT: Return ONLY the raw JSON array.`
      : `${PROMPT}${text}`;
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{ role: "user", content }],
    });
    const block = msg.content[0];
    if (block.type !== "text") throw new Error("Unexpected AI response type");
    return block.text;
  };

  let raw: unknown[];
  try {
    raw = extractJSON(await call(false));
  } catch {
    raw = extractJSON(await call(true));
  }

  return raw
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => ({
      title:       String(r.title ?? "Untitled").slice(0, 255),
      category:    (["class","activity","assignment","study","other","exam","project"].includes(r.category as string)
                     ? r.category : "other") as NewScheduleItem["category"],
      day_of_week: typeof r.day_of_week === "number" ? r.day_of_week : null,
      start_time:  typeof r.start_time === "string"  ? r.start_time  : null,
      end_time:    typeof r.end_time   === "string"  ? r.end_time    : null,
      due_date:    typeof r.due_date   === "string"  ? r.due_date    : null,
      color:       typeof r.color      === "string"  ? r.color       : "#6366f1",
      location:    typeof r.location   === "string"  ? r.location    : null,
      notes:       typeof r.notes      === "string"  ? r.notes       : null,
      source:      null,
      source_id:   null,
      source_file: null,
    }));
}
