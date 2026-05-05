import { logger } from "../logger";
import type { NewScheduleItem } from "../models/schedule";

interface SchoologySection {
  id: string;
  course_title: string;
  section_title: string;
  building_name?: string;
  location?: string;
}

interface SchoologyAssignment {
  id: string;
  title: string;
  due?: number; // Unix timestamp
  grading_category?: string;
}

interface SchoologySectionsResponse {
  section?: SchoologySection[];
}

interface SchoologyAssignmentsResponse {
  assignment?: SchoologyAssignment[];
}

function schoologyHeaders(
  sessId: string,
  csrfKey: string,
  csrfToken: string
): Record<string, string> {
  return {
    Cookie: `SESS=${sessId}`,
    "X-Csrf-Key": csrfKey,
    "X-Csrf-Token": csrfToken,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function schoologyGet<T>(
  url: string,
  headers: Record<string, string>
): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Schoology API error ${res.status}: ${body.slice(0, 200)}`
    );
  }
  return res.json() as Promise<T>;
}

/**
 * Validate Schoology session by fetching the user endpoint.
 */
export async function validateSchoologySession(
  host: string,
  sessId: string,
  csrfKey: string,
  csrfToken: string,
  uid: string
): Promise<void> {
  const headers = schoologyHeaders(sessId, csrfKey, csrfToken);
  await schoologyGet(`https://${host}/v1/users/${uid}`, headers);
}

/**
 * Fetch assignments from all enrolled Schoology sections.
 */
export async function fetchSchoologyAssignments(
  host: string,
  sessId: string,
  csrfKey: string,
  csrfToken: string,
  uid: string
): Promise<(NewScheduleItem & { source: string; source_id: string | null; due_date: string | null })[]> {
  const headers = schoologyHeaders(sessId, csrfKey, csrfToken);
  const base = `https://${host}/v1`;

  // Get enrolled sections
  let sections: SchoologySection[] = [];
  try {
    const data = await schoologyGet<SchoologySectionsResponse>(
      `${base}/users/${uid}/sections`,
      headers
    );
    sections = data.section ?? [];
  } catch (err) {
    logger.warn("Schoology: failed to fetch sections", err);
    throw new Error(
      "Could not fetch courses from Schoology. Make sure your session credentials are correct."
    );
  }

  const items: (NewScheduleItem & { source: string; source_id: string | null; due_date: string | null })[] = [];
  const now = new Date();
  const cutoffTs = Math.floor(now.getTime() / 1000) - 30 * 24 * 3600; // 30 days ago

  for (const section of sections) {
    let assignments: SchoologyAssignment[] = [];
    try {
      const data = await schoologyGet<SchoologyAssignmentsResponse>(
        `${base}/sections/${section.id}/assignments?limit=50`,
        headers
      );
      assignments = data.assignment ?? [];
    } catch (err) {
      logger.warn(
        `Schoology: failed to fetch assignments for section ${section.id}`,
        err
      );
      continue;
    }

    for (const a of assignments) {
      if (!a.due) continue;
      if (a.due < cutoffTs) continue; // skip old

      const dueDate = new Date(a.due * 1000);
      const jsDay = dueDate.getDay(); // 0=Sunday
      const day = jsDay === 0 ? 6 : jsDay - 1; // convert to Mon=0
      const dueDateStr = dueDate.toISOString().split("T")[0];

      items.push({
        title: a.title,
        category: "assignment",
        day_of_week: day,
        start_time: "23:00",
        end_time: "23:59",
        color: "#f43f5e",
        location: null,
        notes: section.course_title || null,
        source: "schoology",
        source_id: a.id,
          source_file: null,
        due_date: dueDateStr,
      });
    }
  }

  return items;
}
