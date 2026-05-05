import { query } from "../config/db";

export type Category = "class" | "activity" | "assignment" | "study" | "other" | "exam" | "project";

export interface ScheduleItem {
  id: string;
  user_id: string;
  title: string;
  category: Category;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  color: string;
  location: string | null;
  notes: string | null;
  source: string | null;
  source_id: string | null;
  source_file: string | null;
  due_date: string | null;
  estimated_minutes?: number | null;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export type NewScheduleItem = Omit<ScheduleItem, "id" | "user_id" | "created_at" | "updated_at" | "completed"> & { completed?: boolean; estimated_minutes?: number | null };

export async function getScheduleItems(userId: string): Promise<ScheduleItem[]> {
  const result = await query(
    "SELECT * FROM schedule_items WHERE user_id = $1 ORDER BY day_of_week NULLS LAST, start_time NULLS LAST, due_date NULLS LAST",
    [userId]
  );
  return result.rows as ScheduleItem[];
}

export async function createScheduleItem(
  userId: string,
  item: NewScheduleItem
): Promise<ScheduleItem> {
  const result = await query(
    `INSERT INTO schedule_items
       (user_id, title, category, day_of_week, start_time, end_time, color, location, notes, source, source_id, source_file, due_date, estimated_minutes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      userId,
      item.title,
      item.category,
      item.day_of_week ?? null,
      item.start_time  ?? null,
      item.end_time    ?? null,
      item.color,
      item.location    ?? null,
      item.notes       ?? null,
      item.source      ?? null,
      item.source_id   ?? null,
      item.source_file ?? null,
      item.due_date    ?? null,
      item.estimated_minutes ?? null,
    ]
  );
  return result.rows[0] as ScheduleItem;
}

export async function createScheduleItemsBulk(
  userId: string,
  items: NewScheduleItem[]
): Promise<ScheduleItem[]> {
  if (items.length === 0) return [];
  const created: ScheduleItem[] = [];
  for (const item of items) {
    created.push(await createScheduleItem(userId, item));
  }
  return created;
}

export async function updateScheduleItem(
  id: string,
  userId: string,
  item: NewScheduleItem
): Promise<ScheduleItem | null> {
  const result = await query(
    `UPDATE schedule_items
     SET title=$3, category=$4, day_of_week=$5, start_time=$6, end_time=$7,
         color=$8, location=$9, notes=$10, source=$11, source_id=$12, source_file=$13, due_date=$14,
         estimated_minutes=$15
     WHERE id=$1 AND user_id=$2
     RETURNING *`,
    [
      id,
      userId,
      item.title,
      item.category,
      item.day_of_week ?? null,
      item.start_time  ?? null,
      item.end_time    ?? null,
      item.color,
      item.location    ?? null,
      item.notes       ?? null,
      item.source      ?? null,
      item.source_id   ?? null,
      item.source_file ?? null,
      item.due_date    ?? null,
      item.estimated_minutes ?? null,
    ]
  );
  return (result.rows[0] as ScheduleItem) ?? null;
}

export async function toggleScheduleItemComplete(
  id: string,
  userId: string,
  completed: boolean
): Promise<ScheduleItem | null> {
  const result = await query(
    "UPDATE schedule_items SET completed=$3, updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *",
    [id, userId, completed]
  );
  return (result.rows[0] as ScheduleItem) ?? null;
}

export async function deleteScheduleItem(
  id: string,
  userId: string
): Promise<boolean> {
  const result = await query(
    "DELETE FROM schedule_items WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function clearScheduleItems(userId: string): Promise<number> {
  const result = await query(
    "DELETE FROM schedule_items WHERE user_id = $1",
    [userId]
  );
  return result.rowCount ?? 0;
}
