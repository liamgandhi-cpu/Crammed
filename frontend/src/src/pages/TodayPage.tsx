import { useState, useEffect, useCallback, useRef } from "react";
import {
  CalendarRange, LogOut, ChevronLeft, ChevronRight,
  RefreshCw, Settings, Brain, AlertTriangle, BookOpen,
  Clock, Zap, Coffee, Calendar, Sunrise, Sun, Moon,
  Plus, CheckSquare, Square, X, ListTodo, Award, Bell, Mail, Play,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function getGreeting(name: string): string {
  const h = new Date().getHours();
  if (h < 5) return `Still up, ${name}? 🌙`;
  if (h < 12) return `Good morning, ${name} ☀️`;
  if (h < 17) return `Good afternoon, ${name} 👋`;
  if (h < 21) return `Good evening, ${name} 🌆`;
  return `Good night, ${name} 🌙`;
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
  const r = (size / 2) - 7;
  const circ = 2 * Math.PI * r;
  const cx = size / 2;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${pct * circ} ${circ}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cx})`}
          />
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold leading-none" style={{ color }}>
            {value}
          </span>
          <span className="text-[9px] text-muted-foreground leading-none mt-0.5">/{max}</span>
        </span>
      </div>
      <span className="text-[10px] text-muted-foreground text-center leading-tight">{label}</span>
    </div>
  );
}

// ── Stats sidebar ──────────────────────────────────────────

function StatsCard({ plan }: { plan: DailyPlan }) {
  const total = plan.blocks.length;
  const done = plan.blocks.filter((b) => b.completed).length;

  return (
    <div className="surface-raised p-5 space-y-5">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Zap className="h-3.5 w-3.5 text-primary" />
        </div>
        <h2 className="font-display text-sm font-semibold">Today's Stats</h2>
      </div>

      {/* Progress ring */}
      <div className="flex justify-center">
        <RingChart value={done} max={total} color="hsl(var(--primary))" label="Blocks done" size={88} />
      </div>

      {/* Stat rows */}
      {[
        { icon: BookOpen, label: "Class hours",   value: `${plan.stats.classHours}h`,                   color: "#f97316" },
        { icon: Brain,    label: "Study hours",   value: `${plan.stats.studyHours}h`,                   color: "#60a5fa" },
        { icon: Coffee,   label: "Free + breaks", value: `${plan.stats.freeHours}h`,                    color: "#22c55e" },
        { icon: Calendar, label: "Due today",      value: String(plan.stats.assignmentsDueToday),        color: "#f43f5e" },
        { icon: Clock,    label: "Due this week",  value: String(plan.stats.assignmentsDueThisWeek),     color: "#a855f7" },
      ].map((s) => (
        <div key={s.label} className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <s.icon className="h-3.5 w-3.5" style={{ color: s.color }} />
            {s.label}
          </div>
          <span className="text-xs font-bold" style={{ color: s.color }}>{s.value}</span>
        </div>
      ))}

      {/* Upcoming exams */}
      {plan.stats.upcomingExams.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-border">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Upcoming Exams</p>
          {plan.stats.upcomingExams.slice(0, 4).map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="text-xs text-foreground truncate">{e.title}</span>
              <span className={`text-[11px] font-bold flex-shrink-0 ${
                e.daysUntil <= 2 ? "text-red-400" : e.daysUntil <= 7 ? "text-yellow-400" : "text-muted-foreground"
              }`}>
                {e.daysUntil === 0 ? "Today!" : e.daysUntil === 1 ? "Tomorrow" : `${e.daysUntil}d`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Mobile stats pills ─────────────────────────────────────

function StatsPills({ plan }: { plan: DailyPlan }) {
  const total = plan.blocks.length;
  const done = plan.blocks.filter((b) => b.completed).length;
  const pills = [
    { label: `${done}/${total} done`,              color: "hsl(var(--primary))" },
    { label: `${plan.stats.classHours}h class`,    color: "#f97316" },
    { label: `${plan.stats.studyHours}h study`,    color: "#38bdf8" },
    { label: `${plan.stats.assignmentsDueToday} due today`, color: "#f43f5e" },
  ];
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
      {pills.map((p) => (
        <span
          key={p.label}
          className="flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full border"
          style={{ color: p.color, borderColor: `${p.color}40`, backgroundColor: `${p.color}12` }}
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

export default function TodayPage() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [dateStr, setDateStr] = useState(toDateStr(new Date()));
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [todoInput, setTodoInput] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [nowH, setNowH] = useState(() => {
    const n = new Date();
    return n.getHours() + n.getMinutes() / 60;
  });
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
  const initials = (user?.email?.[0] ?? "U").toUpperCase();

  // ── Closure components ──────────────────────────────────

  function WeeklySummaryCard() {
    if (!weeklySummary) return null;
    return (
      <div className="surface-raised p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-muted flex items-center justify-center">
            <Award className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <h2 className="font-display text-sm font-semibold">Weekly Summary</h2>
          <span className="text-[10px] text-muted-foreground ml-auto">{weeklySummary.weekRange}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Classes", value: weeklySummary.classCount },
            { label: "Assignments", value: weeklySummary.assignmentCount },
            { label: "Focus hrs", value: `${Math.round(weeklySummary.focusStats.totalSeconds / 3600)}h` },
            { label: "Streak", value: `${weeklySummary.focusStats.streak}d` },
          ].map((s) => (
            <div key={s.label} className="bg-muted/30 rounded-xl p-2.5 text-center">
              <div className="text-sm font-bold text-foreground">{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-full h-7 text-xs gap-1.5"
          disabled={sendingEmail}
          onClick={async () => {
            if (!token) return;
            setSendingEmail(true);
            try { await api.sendWeeklySummaryEmail(token); } catch {}
            setSendingEmail(false);
          }}
        >
          <Mail className="h-3 w-3" />
          {sendingEmail ? "Sending…" : "Email me this summary"}
        </Button>
      </div>
    );
  }

  function DueTodayCard() {
    if (classesToday.length === 0 && dueTodayItems.length === 0) return null;
    return (
      <div className="surface-raised p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-muted flex items-center justify-center">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <h2 className="font-display text-sm font-semibold">Today's Focus</h2>
        </div>
        {classesToday.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Classes</p>
            {classesToday.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                <span className="text-xs truncate flex-1">{c.title}</span>
                {c.start_time && (
                  <span className="text-[10px] text-muted-foreground flex-shrink-0 font-mono">
                    {formatTime12(c.start_time)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {dueTodayItems.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Due Today</p>
            {dueTodayItems.map((a) => (
              <div key={a.id} className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleAssignment(a.id, !a.completed)}
                  className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
                >
                  {a.completed
                    ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                    : <Square className="h-3.5 w-3.5" />}
                </button>
                <span className={`text-xs truncate ${a.completed ? "line-through text-muted-foreground" : ""}`}>{a.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function TodoListCard() {
    const completedCount = todos.filter((t) => t.completed).length;
    return (
      <div className="surface-raised p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ListTodo className="h-3.5 w-3.5 text-primary" />
          </div>
          <h2 className="font-display text-sm font-semibold">To-Do</h2>
          {todos.length > 0 && (
            <span className="text-[10px] text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded-full ml-auto">
              {completedCount}/{todos.length}
            </span>
          )}
        </div>
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
          className={`flex gap-2 rounded-xl p-1 transition-all ${isDragOver ? "ring-2 ring-primary/60 bg-primary/[0.07]" : ""}`}
        >
          <Input
            value={todoInput}
            onChange={(e) => setTodoInput(e.target.value)}
            placeholder={isDragOver ? "Drop here…" : "Add a task…"}
            className="flex-1 h-8 text-xs"
          />
          <Button type="submit" size="sm" className="h-8 px-2.5" disabled={!todoInput.trim()}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </form>
        {todos.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">No tasks yet. Add one above.</p>
        ) : (
          <ul className="space-y-0.5 max-h-64 overflow-y-auto">
            {todos.map((todo) => (
              <li key={todo.id} className="flex items-center gap-2 group rounded-lg px-1 py-1.5 hover:bg-muted/40 transition-colors">
                <button onClick={() => handleToggleTodo(todo.id, !todo.completed)} className="flex-shrink-0">
                  {todo.completed
                    ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                    : <Square className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground" />}
                </button>
                <span className={`flex-1 text-xs leading-snug ${todo.completed ? "line-through text-muted-foreground/50" : ""}`}>
                  {todo.text}
                </span>
                <button
                  onClick={() => handleDeleteTodo(todo.id)}
                  className="opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-destructive transition-all rounded-md hover:bg-destructive/10"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">

      {/* Nav */}
      <nav className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <CalendarRange className="h-4 w-4 text-primary" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight hidden sm:block">AutoPlanner</span>
          </Link>

          {/* Tab bar */}
          <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1 border border-border/50">
            <button
              onClick={() => navigate("/today")}
              aria-current="page"
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-card border border-border/60 text-foreground shadow-sm"
            >
              Today's Plan
            </button>
            <button
              onClick={() => navigate("/dashboard")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all text-muted-foreground hover:text-foreground"
            >
              Schedule
            </button>
            <button
              onClick={() => navigate("/grades")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all text-muted-foreground hover:text-foreground"
            >
              Grades
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-muted border border-border flex items-center justify-center">
              <span className="text-xs font-bold text-primary">{initials}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={logout} className="gap-1.5">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">

        {/* Greeting + date nav */}
        <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
          <div>
            {isToday && (
              <p className="text-xl sm:text-2xl font-display font-bold mb-0.5">
                {getGreeting(firstName)}
              </p>
            )}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => navigateDate(-1)}
                aria-label="Previous day"
                className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {/* The page's h1: always rendered, and it identifies which day
                  is shown. The greeting above is larger but decorative, and
                  only appears for today — it can't carry the heading. */}
              <h1 className="font-display text-base sm:text-lg font-semibold text-muted-foreground">
                {formatDisplayDate(dateStr)}
              </h1>
              <button
                onClick={() => navigateDate(1)}
                aria-label="Next day"
                className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              {!isToday && (
                <button
                  onClick={() => setDateStr(toDateStr(new Date()))}
                  className="ml-1 text-xs text-primary hover:underline"
                >
                  Today →
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {plan?.generatedAt && (
              <span className="text-xs text-muted-foreground hidden sm:block">
                {formatRelativeTime(plan.generatedAt)}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => setPrefsOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={regenerating || loading}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${regenerating ? "animate-spin" : ""}`} />
              {regenerating ? "Generating…" : "Regenerate"}
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 bg-card border border-destructive/30 rounded-xl p-4 flex items-center gap-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
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
          <div className="mb-4 surface-raised border-l-4 border-l-blue-500 px-4 py-3 flex items-center gap-3">
            <Bell className="h-4 w-4 text-blue-400 flex-shrink-0" />
            <span className="text-xs text-muted-foreground flex-1">
              Enable notifications for reminders about classes, assignments, and study blocks.
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5 flex-shrink-0"
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
              className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground rounded flex-shrink-0"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Empty state */}
        {empty && !loading && (
          <div className="surface-raised p-10 text-center max-w-md mx-auto">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
              <Brain className="h-7 w-7 text-primary" />
            </div>
            <h2 className="font-display text-xl font-bold mb-2">No schedule yet</h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Add your classes and assignments first — the AI will build your personalized daily plan automatically.
            </p>
            <div className="space-y-2">
              <Button className="w-full" onClick={() => navigate("/dashboard")}>
                Go to Schedule
              </Button>
              <Button variant="ghost" className="w-full text-muted-foreground text-xs" onClick={handleRegenerate} disabled={regenerating}>
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
                <div className="bg-card border border-border border-l-4 border-l-amber-500 rounded-xl px-4 py-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      {plan.warnings.slice(0, 3).map((w, i) => (
                        <p key={i} className="text-xs text-muted-foreground leading-relaxed">{w}</p>
                      ))}
                      {plan.warnings.length > 3 && (
                        <p className="text-xs text-muted-foreground/60">and {plan.warnings.length - 3} more…</p>
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
                      return (
                        <div
                          key={exam.id}
                          className="flex-shrink-0 bg-card px-3.5 py-2.5 rounded-xl border flex flex-col gap-0.5 min-w-[110px] max-w-[160px]"
                          style={{
                            borderColor: urgent ? "#ef444444" : warn ? "#eab30844" : undefined,
                            backgroundColor: urgent ? "#ef44440a" : warn ? "#eab3080a" : undefined,
                          }}
                        >
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider"
                            style={{ color: urgent ? "#f87171" : warn ? "#facc15" : "#94a3b8" }}
                          >
                            ⏰ {daysUntil === 0 ? "Today!" : daysUntil === 1 ? "Tomorrow" : `${daysUntil}d`}
                          </span>
                          <span className="text-xs font-medium leading-snug line-clamp-2">{exam.title}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* AI summary */}
              {!loading && plan && (
                <div className="py-1">
                  <p className="text-sm text-muted-foreground leading-snug">{plan.summary}</p>
                  {plan.motivational && (
                    <p className="text-xs text-muted-foreground/50 italic mt-0.5 leading-relaxed">
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
                        <div className="flex items-center gap-2 mb-3">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
                          <span className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-widest">
                            {label}
                          </span>
                          <div className="flex-1 h-px bg-border/40" />
                        </div>

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
                                    className="absolute bottom-2 right-2 opacity-0 group-hover/focus:opacity-100 transition-opacity h-6 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 border"
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

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-lg">
        <div className="flex items-center justify-around h-14 max-w-md mx-auto px-4">
          {[
            { icon: CalendarRange, label: "Today", path: "/today" },
            { icon: Calendar,      label: "Schedule", path: "/dashboard" },
          ].map(({ icon: Icon, label, path }) => {
            const active = path === "/today";
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      {/* Bottom padding for mobile nav */}
      <div className="lg:hidden h-14" />

    </div>
  );
}
