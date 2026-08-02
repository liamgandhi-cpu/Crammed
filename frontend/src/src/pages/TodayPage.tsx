import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronLeft, ChevronRight,
  RefreshCw, Settings, Brain, AlertTriangle, BookOpen,
  Clock, Coffee, Calendar, Sunrise, Sun, Moon,
  Plus, CheckSquare, Square, X, Bell, Mail, Play,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AppNav, { APP_CONTAINER, MobileNavSpacer } from "@/components/AppNav";
import { useAuth } from "@/context/AuthContext";
import {
  api,
  type DailyPlan, type PlanBlock as PlanBlockType,
  type ScheduleItem, type TodoItem, type WeeklySummary,
} from "@/lib/api";
import PlanBlock from "@/components/PlanBlock";
import PreferencesModal from "@/components/PreferencesModal";
import { useTimer } from "@/context/TimerContext";
import {
  getPermission, requestPermission, useScheduleNotifications,
} from "@/hooks/useNotifications";

// ── Helpers ────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDisplayDate(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function formatRelativeTime(isoStr: string): string {
  const mins = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function parseHM(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h + m / 60;
}

function formatTime12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${String(m).padStart(2, "0")} ${period}`;
}

/* No emoji. The greeting is now set as a kicker — uppercase and letterspaced —
   and emoji in that treatment read as noise rather than warmth. The wording
   carries the time of day on its own. */
function getGreeting(name: string): string {
  const h = new Date().getHours();
  if (h < 5) return `Still up, ${name}`;
  if (h < 12) return `Good morning, ${name}`;
  if (h < 17) return `Good afternoon, ${name}`;
  if (h < 21) return `Good evening, ${name}`;
  return `Good night, ${name}`;
}

type Section = "morning" | "afternoon" | "evening";

function getSection(block: PlanBlockType): Section {
  const h = parseHM(block.startTime);
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

const SECTION_META: Record<Section, { label: string; Icon: React.FC<{ className?: string }> }> = {
  morning:   { label: "Morning",   Icon: Sunrise },
  afternoon: { label: "Afternoon", Icon: Sun },
  evening:   { label: "Evening",   Icon: Moon },
};

// ── Progress ring ──────────────────────────────────────────

function RingChart({
  value, max, color, label, size = 72,
}: {
  value: number; max: number; color: string; label: string; size?: number;
}) {
  const pct = max === 0 ? 0 : Math.min(1, value / max);
  const r = (size / 2) - 5;
  const circ = 2 * Math.PI * r;
  const cx = size / 2;
  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* The count used to be printed inside the ring at 14px with a 9px "/max"
          under it — unreadable, and duplicated wherever the ring was used.
          The ring is now purely the gauge; the number is set beside it at
          display size by the caller. */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${value} of ${max} blocks done`}
      >
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
        <circle
          cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${pct * circ} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ transition: "stroke-dasharray 400ms cubic-bezier(0,0,0.2,1)" }}
        />
      </svg>
      {label && <span className="text-micro leading-tight text-ink-3">{label}</span>}
    </div>
  );
}

// ── Stats sidebar ──────────────────────────────────────────

/**
 * Sidebar section wrapper.
 *
 * All four sidebar cards previously opened with the same construction: a
 * 24px tinted icon chip, then `font-display text-sm font-semibold`. Four of
 * those stacked vertically is the single most template-like thing on this
 * page — the chips carried no information and the titles never rose above
 * 14px, so nothing in the column ranked against anything else. A kicker over
 * a rule labels the section for free and leaves the weight for the data.
 */
function SidebarSection({
  title, action, children,
}: {
  title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="surface-raised p-4">
      <div className="mb-3.5 flex items-center gap-3 border-b border-[hsl(var(--rule))] pb-2.5">
        <h2 className="kicker">{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function StatsCard({ plan }: { plan: DailyPlan }) {
  const total = plan.blocks.length;
  const done = plan.blocks.filter((b) => b.completed).length;

  /* Categorical tokens, not the loose hex set this used to carry
     (#f97316 / #60a5fa / #22c55e / #f43f5e / #a855f7) — five values that
     appeared nowhere else and drifted from the pills a few lines below,
     where "study" was #38bdf8 rather than #60a5fa for no reason. */
  const rows = [
    { icon: BookOpen, label: "Class hours",   value: `${plan.stats.classHours}h`,               tone: "text-cat-class" },
    { icon: Brain,    label: "Study hours",   value: `${plan.stats.studyHours}h`,               tone: "text-cat-study" },
    { icon: Coffee,   label: "Free + breaks", value: `${plan.stats.freeHours}h`,                tone: "text-cat-free" },
    { icon: Calendar, label: "Due today",     value: String(plan.stats.assignmentsDueToday),    tone: "text-cat-due" },
    { icon: Clock,    label: "Due this week", value: String(plan.stats.assignmentsDueThisWeek), tone: "text-cat-week" },
  ];

  return (
    <SidebarSection title="Today">
      <div className="mb-4 flex items-center gap-4">
        <RingChart value={done} max={total} color="hsl(var(--primary))" label="" size={64} />
        <div className="min-w-0">
          <p className="figure text-3xl">
            {done}
            <span className="text-ink-4">/{total}</span>
          </p>
          <p className="mt-1 text-micro text-ink-3">blocks done</p>
        </div>
      </div>

      <dl className="ruled">
        {rows.map((s) => (
          <div key={s.label} className="flex items-center justify-between py-2">
            <dt className="flex items-center gap-2 text-sm text-ink-3">
              <s.icon className={`h-4 w-4 ${s.tone}`} aria-hidden="true" />
              {s.label}
            </dt>
            <dd className={`text-sm font-bold ${s.tone}`} data-numeric>{s.value}</dd>
          </div>
        ))}
      </dl>

      {plan.stats.upcomingExams.length > 0 && (
        <div className="mt-4 border-t border-[hsl(var(--rule))] pt-3">
          <p className="kicker mb-2">Upcoming exams</p>
          <ul className="space-y-1.5">
            {plan.stats.upcomingExams.slice(0, 4).map((e, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-ink-2">{e.title}</span>
                <span
                  className={`shrink-0 text-micro font-bold ${
                    e.daysUntil <= 2 ? "text-cat-due" : e.daysUntil <= 7 ? "text-cat-warn" : "text-ink-4"
                  }`}
                >
                  {e.daysUntil === 0 ? "Today" : e.daysUntil === 1 ? "Tomorrow" : `${e.daysUntil}d`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SidebarSection>
  );
}

// ── Mobile stats pills ─────────────────────────────────────

function StatsPills({ plan }: { plan: DailyPlan }) {
  const total = plan.blocks.length;
  const done = plan.blocks.filter((b) => b.completed).length;
  const pills = [
    { label: `${done}/${total} done`, tone: "text-primary border-primary/35 bg-primary/10" },
    { label: `${plan.stats.classHours}h class`, tone: "text-cat-class border-cat-class/35 bg-cat-class/10" },
    { label: `${plan.stats.studyHours}h study`, tone: "text-cat-study border-cat-study/35 bg-cat-study/10" },
    { label: `${plan.stats.assignmentsDueToday} due today`, tone: "text-cat-due border-cat-due/35 bg-cat-due/10" },
  ];
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
      {pills.map((p) => (
        <span
          key={p.label}
          className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-micro font-semibold ${p.tone}`}
        >
          {p.label}
        </span>
      ))}
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────

function PlanSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="skeleton rounded-2xl"
          style={{ height: "76px", animationDelay: `${i * 0.08}s` }}
        />
      ))}
    </div>
  );
}

// ── Today page ─────────────────────────────────────────────

/** Mirrors backend/src/src/utils/season.ts — keep the window in sync. */
function isSummerSession(dateStr: string, mode: string | null | undefined): boolean {
  if (mode === "on") return true;
  if (mode === "off") return false;
  const [, m, d] = dateStr.split("-").map(Number);
  if (!m || !d) return false;
  return (m > 6 || (m === 6 && d >= 15)) && (m < 8 || (m === 8 && d <= 25));
}

export default function TodayPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [dateStr, setDateStr] = useState(toDateStr(new Date()));
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [summerMode, setSummerMode] = useState<string | null>(null);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [todoInput, setTodoInput] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const isSummer = isSummerSession(dateStr, summerMode);

  const [nowH, setNowH] = useState(() => {
    const n = new Date();
    return n.getHours() + n.getMinutes() / 60;
  });

  // summer_mode drives the seasonal treatment; re-read when preferences close
  // so toggling the override applies without a reload.
  useEffect(() => {
    if (!token || prefsOpen) return;
    api.getPreferences(token)
      .then(({ preferences }) => setSummerMode(preferences.summer_mode ?? "auto"))
      .catch(() => setSummerMode("auto"));
  }, [token, prefsOpen]);
  const currentBlockRef = useRef<HTMLDivElement>(null);

  // Timer + notifications
  const { startTimer } = useTimer();
  const [notifPermission, setNotifPermission] = useState<string>(() => getPermission());
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(
    () => localStorage.getItem("notif-banner-dismissed") === "1"
  );
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Tick every minute — update current time + auto-advance day at midnight
  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setNowH(n.getHours() + n.getMinutes() / 60);
      // Auto-advance to next day at midnight if user is viewing "today"
      setDateStr((prev) => {
        const today = toDateStr(new Date());
        if (prev !== today && prev === toDateStr(new Date(Date.now() - 86400000))) {
          return today;
        }
        return prev;
      });
    };
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);

  const fetchPlan = useCallback(async (date: string) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setEmpty(false);
    try {
      const res = await api.getPlan(token, date);
      if (res.empty) {
        setEmpty(true);
        setPlan(null);
      } else if (res.plan) {
        setPlan(res.plan);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load plan. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchPlan(dateStr); }, [dateStr, fetchPlan]);

  useEffect(() => {
    if (!token) return;
    api.getSchedule(token).then(({ items }) => setScheduleItems(items)).catch(() => {});
    api.getTodos(token).then(({ todos: t }) => setTodos(t)).catch(() => {});
    api.getWeeklySummary(token).then(({ summary }) => setWeeklySummary(summary)).catch(() => {});
  }, [token]);

  useScheduleNotifications({
    scheduleItems,
    planBlocks: plan?.blocks ?? [],
    reminderMinutesBefore: 15,
    enabled: { assignment_reminders: true, study_reminders: true, exam_warnings: true },
  });

  const handleRegenerate = async () => {
    if (!token) return;
    setRegenerating(true);
    setError(null);
    try {
      const { plan: p } = await api.regeneratePlan(token, dateStr);
      setPlan(p);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to regenerate plan.";
      setError(msg);
    } finally {
      setRegenerating(false);
    }
  };

  const handleToggle = useCallback(async (blockId: string, completed: boolean) => {
    if (!token || !plan) return;
    setPlan((prev) => prev ? {
      ...prev,
      blocks: prev.blocks.map((b) => b.id === blockId ? { ...b, completed } : b),
    } : prev);
    try {
      await api.toggleBlock(token, blockId, completed, dateStr);
    } catch {
      setPlan((prev) => prev ? {
        ...prev,
        blocks: prev.blocks.map((b) => b.id === blockId ? { ...b, completed: !completed } : b),
      } : prev);
    }
  }, [token, plan, dateStr]);

  const handleAddTodo = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? todoInput).trim();
    if (!token || !text) return;
    if (!overrideText) setTodoInput("");
    const { todo } = await api.createTodo(token, text);
    setTodos((prev) => [...prev, todo]);
  }, [token, todoInput]);

  const handleToggleTodo = useCallback(async (id: string, completed: boolean) => {
    if (!token) return;
    setTodos((prev) => prev.map((t) => t.id === id ? { ...t, completed } : t));
    try { await api.updateTodo(token, id, { completed }); }
    catch { setTodos((prev) => prev.map((t) => t.id === id ? { ...t, completed: !completed } : t)); }
  }, [token]);

  const handleToggleAssignment = useCallback(async (id: string, completed: boolean) => {
    if (!token) return;
    setScheduleItems((prev) => prev.map((i) => i.id === id ? { ...i, completed } : i));
    try { await api.toggleScheduleComplete(token, id, completed); }
    catch { setScheduleItems((prev) => prev.map((i) => i.id === id ? { ...i, completed: !completed } : i)); }
  }, [token]);

  const handleDeleteTodo = useCallback(async (id: string) => {
    if (!token) return;
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try { await api.deleteTodo(token, id); }
    catch { api.getTodos(token).then(({ todos: t }) => setTodos(t)).catch(() => {}); }
  }, [token]);

  const navigateDate = (delta: number) => {
    const d = parseLocalDate(dateStr);
    d.setDate(d.getDate() + delta);
    setDateStr(toDateStr(d));
  };

  const isToday = dateStr === toDateStr(new Date());

  const adjustedDow = (() => {
    const jsDay = parseLocalDate(dateStr).getDay();
    return jsDay === 0 ? 6 : jsDay - 1;
  })();
  const dueTodayItems = scheduleItems.filter(
    (i) => i.due_date?.startsWith(dateStr) && ["assignment", "exam", "project"].includes(i.category)
  );
  const classesToday = scheduleItems.filter(
    (i) => i.day_of_week === adjustedDow && i.category === "class" && i.start_time && i.end_time
  ).sort((a, b) => (a.start_time! > b.start_time! ? 1 : -1));

  // Scroll to current block after plan loads
  useEffect(() => {
    if (!plan || !isToday) return;
    const timer = setTimeout(() => {
      currentBlockRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
    return () => clearTimeout(timer);
  }, [plan, isToday]);

  const isBlockCurrent = (b: PlanBlockType) =>
    isToday && parseHM(b.startTime) <= nowH && parseHM(b.endTime) > nowH;
  const isBlockPast = (b: PlanBlockType) =>
    isToday && parseHM(b.endTime) <= nowH;

  // Group blocks by section
  const grouped = plan?.blocks.reduce<Record<Section, PlanBlockType[]>>((acc, b) => {
    const s = getSection(b);
    if (!acc[s]) acc[s] = [];
    acc[s].push(b);
    return acc;
  }, { morning: [], afternoon: [], evening: [] });

  const firstName = user?.email?.split("@")[0] ?? "there";

  // ── Closure components ──────────────────────────────────

  function WeeklySummaryCard() {
    if (!weeklySummary) return null;
    const stats = [
      { label: "Classes", value: String(weeklySummary.classCount) },
      { label: "Assignments", value: String(weeklySummary.assignmentCount) },
      { label: "Focus hrs", value: `${Math.round(weeklySummary.focusStats.totalSeconds / 3600)}h` },
      { label: "Streak", value: `${weeklySummary.focusStats.streak}d` },
    ];
    return (
      <SidebarSection
        title="This week"
        action={<span className="text-micro text-ink-4">{weeklySummary.weekRange}</span>}
      >
        {/* Figures at display size on a plain 2×2, rather than four 14px
            numbers each boxed in its own rounded tile. The number is the
            content here; the tile was chrome around nothing. */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="figure text-2xl">{s.value}</p>
              <p className="mt-1 text-micro text-ink-3">{s.label}</p>
            </div>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="mt-4 w-full gap-1.5"
          disabled={sendingEmail}
          onClick={async () => {
            if (!token) return;
            setSendingEmail(true);
            try { await api.sendWeeklySummaryEmail(token); } catch {}
            setSendingEmail(false);
          }}
        >
          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
          {sendingEmail ? "Sending…" : "Email me this summary"}
        </Button>
      </SidebarSection>
    );
  }

  function DueTodayCard() {
    if (classesToday.length === 0 && dueTodayItems.length === 0) return null;
    return (
      <SidebarSection title="Today's focus">
        {classesToday.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-micro font-semibold text-ink-4">Classes</p>
            <ul className="space-y-2">
              {classesToday.map((c) => (
                <li key={c.id} className="flex items-center gap-2.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color }}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate text-sm text-ink-2">{c.title}</span>
                  {c.start_time && (
                    <time className="shrink-0 font-mono text-micro text-ink-4">
                      {formatTime12(c.start_time)}
                    </time>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {dueTodayItems.length > 0 && (
          <div>
            <p className="mb-2 text-micro font-semibold text-ink-4">Due today</p>
            <ul className="space-y-1">
              {dueTodayItems.map((a) => (
                <li key={a.id}>
                  {/* The whole row is the control now. It used to be a bare
                      14px icon — well under the 24px minimum target, and with
                      no accessible name at all. */}
                  <button
                    onClick={() => handleToggleAssignment(a.id, !a.completed)}
                    aria-pressed={a.completed}
                    className="flex w-full items-center gap-2.5 rounded-md py-1.5 text-left transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {a.completed
                      ? <CheckSquare className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      : <Square className="h-4 w-4 shrink-0 text-ink-4" aria-hidden="true" />}
                    <span className={`truncate text-sm ${a.completed ? "text-ink-4 line-through" : "text-ink-2"}`}>
                      {a.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SidebarSection>
    );
  }

  function TodoListCard() {
    const completedCount = todos.filter((t) => t.completed).length;
    return (
      <SidebarSection
        title="To-do"
        action={
          todos.length > 0 ? (
            <span className="text-micro text-ink-4" data-numeric>
              {completedCount}/{todos.length}
            </span>
          ) : undefined
        }
      >
        <form
          onSubmit={(e) => { e.preventDefault(); handleAddTodo(); }}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            const text = e.dataTransfer.getData("text/plain");
            if (text) handleAddTodo(text);
          }}
          className={`flex gap-2 rounded-lg transition-colors ${
            isDragOver ? "bg-primary/[0.07] outline outline-2 outline-primary/60" : ""
          }`}
        >
          <label htmlFor="todo-input" className="sr-only">Add a task</label>
          <Input
            id="todo-input"
            value={todoInput}
            onChange={(e) => setTodoInput(e.target.value)}
            placeholder={isDragOver ? "Drop here…" : "Add a task…"}
            className="h-9 flex-1"
          />
          <Button type="submit" size="sm" className="h-9 w-9 shrink-0 px-0" disabled={!todoInput.trim()} aria-label="Add task">
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </form>

        {todos.length === 0 ? (
          /* Encouraging, and it says what the section is for — the old copy
             ("No tasks yet. Add one above.") only restated the emptiness. */
          <p className="py-3 text-sm leading-relaxed text-ink-3">
            Nothing on the list. Anything that isn't a class or an assignment
            goes here.
          </p>
        ) : (
          <ul className="ruled -mx-1 mt-3 max-h-64 overflow-y-auto">
            {todos.map((todo) => (
              <li key={todo.id} className="group flex items-center gap-1">
                <button
                  onClick={() => handleToggleTodo(todo.id, !todo.completed)}
                  aria-pressed={todo.completed}
                  className="flex flex-1 items-center gap-2.5 rounded-md px-1 py-2 text-left transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {todo.completed
                    ? <CheckSquare className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    : <Square className="h-4 w-4 shrink-0 text-ink-4" aria-hidden="true" />}
                  <span className={`flex-1 text-sm leading-snug ${todo.completed ? "text-ink-4 line-through" : "text-ink-2"}`}>
                    {todo.text}
                  </span>
                </button>
                {/* Was `opacity-0 group-hover:opacity-100` — invisible and
                    unreachable for keyboard and touch users alike. It now also
                    reveals on focus, and carries a name. */}
                <button
                  onClick={() => handleDeleteTodo(todo.id)}
                  aria-label={`Delete task: ${todo.text}`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-4 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </SidebarSection>
    );
  }

  return (
    <div className="min-h-screen bg-background">

      <AppNav />

      {/* Main */}
      <main className={`${APP_CONTAINER} py-8 ${isSummer ? "summer-surface" : ""}`}>

        {/* Masthead.
            The old header had this inverted: an `text-2xl` greeting that was
            explicitly decorative sat on top, while the actual <h1> — the date,
            the one thing identifying what you're looking at — was rendered at
            text-base in muted grey underneath it. The greeting is now the
            kicker it always was, and the date gets the display size. */}
        <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            {isToday && (
              <p className="kicker mb-2.5">{getGreeting(firstName)}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
              <h1 className="font-display text-display-3 text-ink-1">
                {formatDisplayDate(dateStr)}
              </h1>
              {isSummer && (
                <span className="summer-chip rounded-full border px-2.5 py-1 text-kicker uppercase">
                  Summer
                </span>
              )}
            </div>

            <div className="mt-3 flex items-center gap-1">
              <button
                onClick={() => navigateDate(-1)}
                aria-label="Previous day"
                className="flex h-8 w-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                onClick={() => navigateDate(1)}
                aria-label="Next day"
                className="flex h-8 w-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
              {!isToday && (
                <button
                  onClick={() => setDateStr(toDateStr(new Date()))}
                  className="ml-1.5 rounded-sm text-sm font-medium text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Back to today
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {plan?.generatedAt && (
              <span className="hidden text-micro text-ink-4 sm:block">
                Updated {formatRelativeTime(plan.generatedAt)}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => setPrefsOpen(true)} aria-label="Preferences">
              <Settings className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={regenerating || loading}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${regenerating ? "animate-spin" : ""}`} aria-hidden="true" />
              {regenerating ? "Generating…" : "Regenerate"}
            </Button>
          </div>
        </header>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="mb-6 flex items-center gap-3 rounded-xl border border-destructive/35 bg-destructive/[0.08] p-4 text-sm text-destructive"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {/* Mobile stats pills */}
        {plan && !loading && (
          <div className="lg:hidden mb-4">
            <StatsPills plan={plan} />
          </div>
        )}

        {/* Notification permission banner */}
        {notifPermission !== "granted" && notifPermission !== "unsupported" && !notifBannerDismissed && (
          <div className="surface-raised mb-6 flex items-center gap-3 border-l-2 border-l-cat-study px-4 py-3">
            <Bell className="h-4 w-4 shrink-0 text-cat-study" aria-hidden="true" />
            <span className="flex-1 text-sm text-ink-2">
              Get reminded before classes, assignments and study blocks.
            </span>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={async () => {
                const result = await requestPermission();
                setNotifPermission(result);
                setNotifBannerDismissed(true);
                localStorage.setItem("notif-banner-dismissed", "1");
              }}
            >
              Enable
            </Button>
            <button
              onClick={() => {
                setNotifBannerDismissed(true);
                localStorage.setItem("notif-banner-dismissed", "1");
              }}
              aria-label="Dismiss notification prompt"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-4 transition-colors hover:bg-surface-3 hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Empty state */}
        {empty && !loading && (
          <div className="mx-auto max-w-lg py-16">
            <span className="accent-bar mb-6" />
            <h2 className="text-balance font-display text-display-3 text-ink-1">
              Nothing to plan yet.
            </h2>
            <p className="mt-3 max-w-measure text-pretty leading-relaxed text-ink-3">
              Add your classes and what's due, and this page fills itself in —
              study blocks sized to the work, breaks included, conflicts flagged.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button onClick={() => navigate("/dashboard")}>
                <Brain className="mr-2 h-4 w-4" aria-hidden="true" />
                Add your schedule
              </Button>
              <Button variant="ghost" onClick={handleRegenerate} disabled={regenerating}>
                {regenerating ? "Generating…" : "Try generating anyway"}
              </Button>
            </div>
          </div>
        )}

        {/* Plan content */}
        {!empty && (
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Main column */}
            <div className="flex-1 min-w-0 space-y-4">

              {/* Warnings (compact) */}
              {!loading && plan && plan.warnings.length > 0 && (
                <div className="rounded-xl border border-cat-warn/30 border-l-2 border-l-cat-warn bg-cat-warn/[0.06] px-4 py-3.5">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-cat-warn" aria-hidden="true" />
                    <div className="space-y-1.5">
                      {plan.warnings.slice(0, 3).map((w, i) => (
                        <p key={i} className="text-sm leading-relaxed text-ink-2">{w}</p>
                      ))}
                      {plan.warnings.length > 3 && (
                        <p className="text-micro text-ink-4">and {plan.warnings.length - 3} more…</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Exam countdown strip */}
              {!loading && (() => {
                const today = toDateStr(new Date());
                const upcomingExams = scheduleItems
                  .filter((i) => i.category === "exam" && i.due_date && i.due_date >= today)
                  .sort((a, b) => (a.due_date! > b.due_date! ? 1 : -1))
                  .slice(0, 6);
                if (upcomingExams.length === 0) return null;
                return (
                  <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                    {upcomingExams.map((exam) => {
                      const daysUntil = Math.ceil(
                        (new Date(exam.due_date!).getTime() - new Date(today).getTime()) / 86_400_000
                      );
                      const urgent = daysUntil <= 2;
                      const warn = daysUntil <= 7;
                      /* Was five raw hex literals with 8-digit alpha suffixes
                         (#ef444444, #eab3080a …). Same three states, on tokens. */
                      const tone = urgent
                        ? "border-cat-due/35 bg-cat-due/[0.07]"
                        : warn
                        ? "border-cat-warn/35 bg-cat-warn/[0.07]"
                        : "border-border bg-surface-2";
                      const label = urgent ? "text-cat-due" : warn ? "text-cat-warn" : "text-ink-3";
                      return (
                        <div
                          key={exam.id}
                          className={`flex min-w-[130px] max-w-[180px] shrink-0 flex-col gap-1 rounded-xl border px-3.5 py-2.5 ${tone}`}
                        >
                          <span className={`text-kicker uppercase ${label}`}>
                            {daysUntil === 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : `${daysUntil} days`}
                          </span>
                          <span className="line-clamp-2 text-sm font-medium leading-snug text-ink-2">
                            {exam.title}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* AI summary */}
              {!loading && plan && (
                /* The day's summary is the first prose on the page — it was
                   set at 14px in the same grey as every label around it. */
                <div className="border-l-2 border-primary/40 py-1 pl-4">
                  <p className="max-w-measure text-pretty text-base leading-relaxed text-ink-2">
                    {plan.summary}
                  </p>
                  {plan.motivational && (
                    <p className="mt-1.5 max-w-measure text-pretty text-sm italic leading-relaxed text-ink-4">
                      {plan.motivational.replace(/[\u{1F300}-\u{1FAFF}]/gu, "").trim()}
                    </p>
                  )}
                </div>
              )}

              {/* Mobile: due today + todos + weekly summary */}
              {!loading && plan && (
                <div className="lg:hidden space-y-4">
                  <DueTodayCard />
                  <TodoListCard />
                  <WeeklySummaryCard />
                </div>
              )}

              {/* Timeline */}
              {loading ? (
                <PlanSkeleton />
              ) : plan && grouped ? (
                <div className="space-y-5">
                  {(["morning", "afternoon", "evening"] as Section[]).map((section) => {
                    const blocks = grouped[section];
                    if (!blocks || blocks.length === 0) return null;
                    const { label, Icon } = SECTION_META[section];
                    return (
                      <div key={section}>
                        {/* Section separator */}
                        <h2 className="kicker-rule mb-3.5">
                          <Icon className="h-3.5 w-3.5 shrink-0 text-ink-4" aria-hidden="true" />
                          <span className="shrink-0">{label}</span>
                        </h2>

                        {/* Blocks */}
                        <div className="space-y-2">
                          {blocks.map((block) => {
                            const current = isBlockCurrent(block);
                            const canFocus = ["study", "assignment", "exam"].includes(block.type) && !block.completed;
                            return (
                              <div key={block.id} ref={current ? currentBlockRef : undefined} className="relative group/focus">
                                <PlanBlock
                                  block={block}
                                  onToggle={handleToggle}
                                  isPast={isBlockPast(block)}
                                  isCurrent={current}
                                />
                                {canFocus && (
                                  <button
                                    onClick={() => startTimer({ blockId: block.id, courseName: block.title, blockTitle: block.title })}
                                    className="absolute bottom-2 right-2 opacity-0 group-hover/focus:opacity-100 transition-opacity h-6 px-2 rounded-lg text-micro font-semibold flex items-center gap-1 border"
                                    style={{
                                      backgroundColor: `${block.color}18`,
                                      borderColor: `${block.color}44`,
                                      color: block.color,
                                    }}
                                  >
                                    <Play className="h-2.5 w-2.5" />
                                    Focus
                                  </button>
                                )}
                              </div>
                            );
                          })}

                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {/* Stats sidebar — desktop only */}
            <div className="hidden lg:block lg:w-60 xl:w-64 flex-shrink-0">
              {loading ? (
                <div className="surface-raised p-5 space-y-3">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="skeleton h-5 rounded-lg" style={{ animationDelay: `${i * 0.08}s` }} />
                  ))}
                </div>
              ) : plan ? (
                <div className="space-y-4 sticky top-6">
                  <StatsCard plan={plan} />
                  <DueTodayCard />
                  <TodoListCard />
                  <WeeklySummaryCard />
                </div>
              ) : null}
            </div>
          </div>
        )}
      </main>

      <PreferencesModal
        isOpen={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        onSaved={() => { setPrefsOpen(false); handleRegenerate(); }}
      />

      {/* The mobile bar itself now lives in AppNav — this page's old copy
          listed only Today and Schedule, so Grades was unreachable from here
          on a phone. */}
      <MobileNavSpacer />

    </div>
  );
}
