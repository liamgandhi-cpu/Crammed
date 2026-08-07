const BASE_URL = import.meta.env.VITE_API_URL ?? "";

interface ApiOptions extends RequestInit {
  token?: string;
}

class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { token, ...fetchOpts } = opts;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...fetchOpts,
    headers,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      data?.error ?? `Request failed (${res.status})`,
      res.status,
      data?.details
    );
  }

  return data as T;
}

// ── Auth endpoints ─────────────────────────────────────────

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    created_at: string;
    updated_at: string;
  };
  token: string;
}

export interface MeResponse {
  user: AuthResponse["user"];
}

// ── Integration types ───────────────────────────────────────

export interface ConnectedAccount {
  id: string;
  user_id: string;
  provider: "studentvue" | "schoology" | "ion";
  district_url: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Schedule types ──────────────────────────────────────────

export type Category =
  | "class"
  | "activity"
  | "assignment"
  | "study"
  | "other"
  | "exam"
  | "project";

export interface ScheduleItem {
  id: string;
  user_id: string;
  title: string;
  category: Category;
  day_of_week: number | null;
  start_time: string | null; // "HH:MM" or "HH:MM:SS" from postgres
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

export type NewScheduleItem = Omit<ScheduleItem, "id" | "user_id" | "created_at" | "updated_at" | "completed"> & { completed?: boolean };

// ── File import types ───────────────────────────────────────

export interface ParsedScheduleItem {
  title: string;
  category: Category;
  dayOfWeek?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  dueDate?: string | null;
  location?: string | null;
  notes?: string | null;
  recurring?: boolean;
  color: string;
  sourceFile?: string;
}

export interface UploadResult {
  uploadId: string;
  filename: string;
  status: "completed" | "failed";
  error?: string;
}

// ── Daily planner types ─────────────────────────────────────

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

export interface DailyPlan {
  date: string;
  blocks: PlanBlock[];
  summary: string;
  motivational: string;
  warnings: string[];
  stats: {
    classHours: number;
    studyHours: number;
    freeHours: number;
    assignmentsDueToday: number;
    assignmentsDueThisWeek: number;
    upcomingExams: { title: string; daysUntil: number }[];
  };
  generatedAt?: string;
}

export interface UserPreferences {
  wake_time: string;
  sleep_time: string;
  study_style: "balanced" | "early_bird" | "night_owl" | "pomodoro";
  break_frequency: number;
  break_duration: number;
  max_study_hours: number;
  notes: string | null;
  commute_minutes: number;
  preferred_block_length: number;
  hard_subjects: string | null;
  semester_load: "light" | "moderate" | "heavy";
  summer_mode: "auto" | "on" | "off";
}

// ── Todo types ──────────────────────────────────────────────

export interface TodoItem {
  id: string;
  user_id: string;
  text: string;
  completed: boolean;
  created_at: string;
}

// ── Grade types ─────────────────────────────────────────────

export interface Grade {
  id: string;
  user_id: string;
  schedule_item_id: string | null;
  title: string;
  course_name: string;
  score: number | null;
  max_score: number | null;
  weight: number;
  category: string | null;
  graded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  user_id: string;
  name: string;
  full_name: string | null;
  credit_hours: number;
  grading_scale: string;
  target_grade: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface CourseStat {
  name: string;
  average: number | null;
  letterGrade: string | null;
  gpaPoints: number;
  creditHours: number;
  gradeCount: number;
  targetGrade: string | null;
  onTrack: boolean;
  color: string | null;
  fullName: string | null;
}

export interface GradeSummary {
  overallGPA: number | null;
  totalCredits: number;
  courses: CourseStat[];
  gpaHistory: { date: string; gpa: number }[];
}

// ── Focus types ─────────────────────────────────────────────

export interface FocusSession {
  id: string;
  user_id: string;
  plan_block_id: string | null;
  course_name: string | null;
  session_type: "focus" | "short_break" | "long_break";
  duration_seconds: number;
  completed: boolean;
  started_at: string;
  ended_at: string | null;
}

export interface FocusStats {
  today: { totalSeconds: number; sessionCount: number };
  week: { totalSeconds: number; sessionCount: number };
  streak: number;
}

// ── Notification preference types ───────────────────────────

export interface NotificationPreferences {
  enabled: boolean;
  assignment_reminders: boolean;
  daily_plan_ready: boolean;
  study_reminders: boolean;
  exam_warnings: boolean;
  weekly_summary_email: boolean;
  reminder_minutes_before: number;
}

// ── Weekly summary types ────────────────────────────────────

export interface WeeklySummary {
  firstName: string;
  weekRange: string;
  classCount: number;
  assignmentCount: number;
  exams: { title: string; daysUntil: number }[];
  courses: {
    name: string;
    average: number | null;
    letterGrade: string | null;
    targetGrade: string | null;
    onTrack: boolean;
  }[];
  focusStats: { totalSeconds: number; streak: number };
}

// ── Extracurricular plan types ──────────────────────────────

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

/** Today's generation count against the server-side daily cap. */
export interface AiUsage {
  allowed: boolean;
  calls: number;
  limit: number;
  remaining: number;
}

export interface EcPlanRequest {
  currentYear: number;
  interests: string;
  hoursPerWeek: number;
}

export const api = {
  signup(email: string, password: string, confirmPassword: string) {
    return request<AuthResponse>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, confirmPassword }),
    });
  },

  login(email: string, password: string) {
    return request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  googleAuth(accessToken: string) {
    return request<AuthResponse>("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ access_token: accessToken }),
    });
  },

  logout(token: string) {
    return request<{ message: string }>("/api/auth/logout", {
      method: "POST",
      token,
    });
  },

  me(token: string) {
    return request<MeResponse>("/api/me", { token });
  },

  // ── Schedule ──────────────────────────────────────────────

  getSchedule(token: string) {
    return request<{ items: ScheduleItem[] }>("/api/schedule", { token });
  },

  createScheduleItem(token: string, item: NewScheduleItem) {
    return request<{ item: ScheduleItem }>("/api/schedule", {
      method: "POST",
      token,
      body: JSON.stringify(item),
    });
  },

  createScheduleBulk(token: string, items: NewScheduleItem[]) {
    return request<{ items: ScheduleItem[] }>("/api/schedule/bulk", {
      method: "POST",
      token,
      body: JSON.stringify({ items }),
    });
  },

  parseSchedule(token: string, text: string) {
    return request<{ items: NewScheduleItem[] }>("/api/schedule/parse", {
      method: "POST",
      token,
      body: JSON.stringify({ text }),
    });
  },

  updateScheduleItem(token: string, id: string, updates: NewScheduleItem) {
    return request<{ item: ScheduleItem }>(`/api/schedule/${id}`, {
      method: "PUT",
      token,
      body: JSON.stringify(updates),
    });
  },

  deleteScheduleItem(token: string, id: string) {
    return request<{ deleted: boolean }>(`/api/schedule/${id}`, {
      method: "DELETE",
      token,
    });
  },

  toggleScheduleComplete(token: string, id: string, completed: boolean) {
    return request<{ item: ScheduleItem }>(`/api/schedule/${id}/complete`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ completed }),
    });
  },

  clearSchedule(token: string) {
    return request<{ deleted: number }>("/api/schedule", {
      method: "DELETE",
      token,
    });
  },

  // ── Integrations ───────────────────────────────────────────

  testStudentVue(token: string, districtUrl: string, username: string, password: string) {
    return request<{ success: boolean; message: string }>(
      "/api/integrations/studentvue/test",
      { method: "POST", token, body: JSON.stringify({ districtUrl, username, password }) }
    );
  },

  connectStudentVue(token: string, districtUrl: string, username: string, password: string) {
    return request<{ success: boolean; accountId: string; imported: number; classCount: number; assignmentCount: number }>(
      "/api/integrations/studentvue/connect",
      { method: "POST", token, body: JSON.stringify({ districtUrl, username, password }) }
    );
  },

  syncStudentVue(token: string) {
    return request<{ success: boolean; imported: number }>(
      "/api/integrations/studentvue/sync",
      { method: "POST", token }
    );
  },

  syncStudentVueGrades(token: string) {
    return request<{ synced: number; courses: string[]; message?: string }>(
      "/api/integrations/studentvue/sync-grades",
      { method: "POST", token }
    );
  },

  connectSchoology(token: string, host: string, username: string, password: string) {
    return request<{ success: boolean; accountId: string; imported: number }>(
      "/api/integrations/schoology/connect",
      { method: "POST", token, body: JSON.stringify({ host, username, password }) }
    );
  },

  syncSchoology(token: string) {
    return request<{ success: boolean; imported: number }>(
      "/api/integrations/schoology/sync",
      { method: "POST", token }
    );
  },

  getIonAuthUrl(token: string) {
    return request<{ url: string }>("/api/integrations/ion/auth-url", { token });
  },

  syncIon(token: string) {
    return request<{ imported: number; dates: number }>(
      "/api/integrations/ion/sync",
      { method: "POST", token }
    );
  },

  getJobStatus(token: string, jobId: string) {
    return request<{
      jobId: string;
      provider: string;
      status: "running" | "done" | "failed";
      result: { imported?: number; classCount?: number; assignmentCount?: number } | null;
      error: string | null;
      createdAt: string;
      completedAt: string | null;
    }>(`/api/integrations/jobs/${jobId}`, { token });
  },

  getIntegrations(token: string) {
    return request<{ accounts: ConnectedAccount[] }>("/api/integrations", { token });
  },

  deleteIntegration(token: string, id: string) {
    return request<{ deleted: boolean }>(`/api/integrations/${id}`, {
      method: "DELETE",
      token,
    });
  },

  // ── Todos ──────────────────────────────────────────────────

  getTodos(token: string) {
    return request<{ todos: TodoItem[] }>("/api/todos", { token });
  },

  createTodo(token: string, text: string) {
    return request<{ todo: TodoItem }>("/api/todos", {
      method: "POST",
      token,
      body: JSON.stringify({ text }),
    });
  },

  updateTodo(token: string, id: string, updates: { text?: string; completed?: boolean }) {
    return request<{ todo: TodoItem }>(`/api/todos/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(updates),
    });
  },

  deleteTodo(token: string, id: string) {
    return request<{ deleted: boolean }>(`/api/todos/${id}`, {
      method: "DELETE",
      token,
    });
  },

  // ── File import ────────────────────────────────────────────

  async uploadAndProcess(
    token: string,
    files: File[]
  ): Promise<{ uploads: UploadResult[]; parsedItems: ParsedScheduleItem[] }> {
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));

    const res = await fetch(`${BASE_URL}/api/upload/process`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      // No Content-Type — browser sets it with boundary for FormData
      body: formData,
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new ApiError(data?.error ?? "Upload failed", res.status);
    }
    return data as { uploads: UploadResult[]; parsedItems: ParsedScheduleItem[] };
  },

  confirmImport(
    token: string,
    items: ParsedScheduleItem[]
  ): Promise<{ items: ScheduleItem[]; count: number }> {
    return request(`/api/upload/confirm`, {
      method: "POST",
      token,
      body: JSON.stringify({ items }),
    });
  },

  getUploadHistory(token: string) {
    return request<{ uploads: unknown[] }>("/api/upload/history", { token });
  },

  // ── Grades ─────────────────────────────────────────────────

  getGrades(token: string) {
    return request<{ grades: Grade[]; grouped: Record<string, Grade[]> }>("/api/grades", { token });
  },

  createGrade(token: string, grade: Omit<Grade, "id" | "user_id" | "created_at" | "updated_at">) {
    return request<{ grade: Grade }>("/api/grades", {
      method: "POST", token, body: JSON.stringify(grade),
    });
  },

  updateGrade(token: string, id: string, updates: Partial<Grade>) {
    return request<{ grade: Grade }>(`/api/grades/${id}`, {
      method: "PUT", token, body: JSON.stringify(updates),
    });
  },

  deleteGrade(token: string, id: string) {
    return request<{ deleted: boolean }>(`/api/grades/${id}`, { method: "DELETE", token });
  },

  getGradeSummary(token: string) {
    return request<GradeSummary>("/api/grades/summary", { token });
  },

  // ── Courses ────────────────────────────────────────────────

  getCourses(token: string) {
    return request<{ courses: Course[] }>("/api/courses", { token });
  },

  createCourse(token: string, course: Partial<Course> & { name: string }) {
    return request<{ course: Course }>("/api/courses", {
      method: "POST", token, body: JSON.stringify(course),
    });
  },

  updateCourse(token: string, id: string, updates: Partial<Course>) {
    return request<{ course: Course }>(`/api/courses/${id}`, {
      method: "PUT", token, body: JSON.stringify(updates),
    });
  },

  deleteCourse(token: string, id: string) {
    return request<{ deleted: boolean }>(`/api/courses/${id}`, { method: "DELETE", token });
  },

  // ── Focus sessions ─────────────────────────────────────────

  startFocusSession(token: string, data: {
    plan_block_id?: string | null;
    course_name?: string | null;
    session_type: "focus" | "short_break" | "long_break";
    duration_seconds: number;
  }) {
    return request<{ session: FocusSession }>("/api/focus/start", {
      method: "POST", token, body: JSON.stringify(data),
    });
  },

  endFocusSession(token: string, id: string, data: { completed: boolean }) {
    return request<{ session: FocusSession }>(`/api/focus/${id}`, {
      method: "PATCH", token, body: JSON.stringify(data),
    });
  },

  getFocusStats(token: string) {
    return request<FocusStats>("/api/focus/stats", { token });
  },

  // ── Notifications ──────────────────────────────────────────

  getNotificationPreferences(token: string) {
    return request<{ preferences: NotificationPreferences }>("/api/notifications/preferences", { token });
  },

  updateNotificationPreferences(token: string, prefs: Partial<NotificationPreferences>) {
    return request<{ preferences: NotificationPreferences }>("/api/notifications/preferences", {
      method: "PUT", token, body: JSON.stringify(prefs),
    });
  },

  // ── Push notifications ─────────────────────────────────────

  pushSubscribe(token: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    return request<{ ok: boolean }>("/api/push/subscribe", {
      method: "POST", token, body: JSON.stringify(sub),
    });
  },

  pushUnsubscribe(token: string, endpoint: string) {
    return request<{ ok: boolean }>("/api/push/subscribe", {
      method: "DELETE", token, body: JSON.stringify({ endpoint }),
    });
  },

  // ── Weekly summary ─────────────────────────────────────────

  getWeeklySummary(token: string) {
    return request<{ summary: WeeklySummary }>("/api/summary/weekly", { token });
  },

  sendWeeklySummaryEmail(token: string) {
    return request<{ sent: boolean }>("/api/summary/send-email", { method: "POST", token });
  },

  // ── Daily planner ──────────────────────────────────────────

  getTodayPlan(token: string) {
    return request<{ plan?: DailyPlan; empty?: boolean; message?: string }>("/api/planner/today", { token });
  },

  getPlan(token: string, date: string) {
    return request<{ plan?: DailyPlan; empty?: boolean; message?: string }>(`/api/planner/${date}`, { token });
  },

  regeneratePlan(token: string, date?: string) {
    return request<{ plan: DailyPlan }>("/api/planner/regenerate", {
      method: "POST",
      token,
      body: JSON.stringify({ date }),
    });
  },

  toggleBlock(token: string, blockId: string, completed: boolean, date: string) {
    return request<{ ok: boolean }>(`/api/planner/block/${blockId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ completed, date }),
    });
  },

  getPreferences(token: string) {
    return request<{ preferences: UserPreferences }>("/api/planner/preferences", { token });
  },

  updatePreferences(token: string, prefs: Partial<UserPreferences>) {
    return request<{ preferences: UserPreferences }>("/api/planner/preferences", {
      method: "PUT",
      token,
      body: JSON.stringify(prefs),
    });
  },

  // ── Extracurricular plan ───────────────────────────────────

  getEcPlan(token: string) {
    return request<{ items: EcPlanItem[]; usage: AiUsage }>("/api/ec-plan", { token });
  },

  /** Replaces the saved plan. Throws ApiError with status 429 when over cap. */
  generateEcPlan(token: string, body: EcPlanRequest) {
    return request<{ items: EcPlanItem[]; usage: AiUsage }>("/api/ec-plan/generate", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
  },

  addEcPlanItem(token: string, item: Omit<EcPlanItem, "id" | "created_at">) {
    return request<{ item: EcPlanItem }>("/api/ec-plan/items", {
      method: "POST",
      token,
      body: JSON.stringify(item),
    });
  },

  updateEcPlanItem(token: string, id: string, patch: Partial<EcPlanItem>) {
    return request<{ item: EcPlanItem }>(`/api/ec-plan/items/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(patch),
    });
  },

  deleteEcPlanItem(token: string, id: string) {
    return request<{ ok: boolean }>(`/api/ec-plan/items/${id}`, {
      method: "DELETE",
      token,
    });
  },
};

export { ApiError };
