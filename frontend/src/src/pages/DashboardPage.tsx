import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  CalendarRange, LogOut, Plus, Clock, BookOpen, Sparkles,
  Trash2, X, MapPin, StickyNote, RefreshCw, GraduationCap,
  Pencil, CheckSquare, Square, ListTodo, FileUp, Link2,
  ChevronDown, AlertTriangle, Download,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import {
  api, type ScheduleItem, type NewScheduleItem,
  type ConnectedAccount, type TodoItem, ApiError,
} from "@/lib/api";
import ScheduleInputModal from "@/components/ScheduleInputModal";
import ConnectAccountModal from "@/components/ConnectAccountModal";
import EditItemModal from "@/components/EditItemModal";
import FileImportModal from "@/components/FileImportModal";
import { downloadICS } from "@/lib/icsExport";

// ── Constants ──────────────────────────────────────────────
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7 AM – 8 PM
const GRID_START = 7;
const ROW_HEIGHT = 60;
const TOTAL_HEIGHT = HOURS.length * ROW_HEIGHT;

function getTodayIdx(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function timeToMins(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h - GRID_START) * 60 + m;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${String(m).padStart(2, "0")} ${period}`;
}

function blockTop(s: string): number {
  return Math.max(0, (timeToMins(s) / 60) * ROW_HEIGHT);
}

function blockHeight(s: string, e: string): number {
  const dur = Math.max(15, timeToMins(e) - timeToMins(s));
  return (dur / 60) * ROW_HEIGHT;
}

function totalScheduledHours(items: ScheduleItem[]): number {
  const total = items.reduce((sum, item) => {
    if (!item.start_time || !item.end_time) return sum;
    const [sh, sm] = item.start_time.split(":").map(Number);
    const [eh, em] = item.end_time.split(":").map(Number);
    return sum + Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
  }, 0);
  return Math.round((total / 60) * 10) / 10;
}

// ── Block popover ──────────────────────────────────────────

interface BlockPopoverProps {
  item: ScheduleItem;
  pos: { top: number; left: number };
  onClose: () => void;
  onDelete: (id: string) => void;
  onEdit: (item: ScheduleItem) => void;
}

function BlockPopover({ item, pos, onClose, onDelete, onEdit }: BlockPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mouseHandler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    setTimeout(() => {
      document.addEventListener("mousedown", mouseHandler);
      window.addEventListener("keydown", keyHandler);
    }, 0);
    return () => {
      document.removeEventListener("mousedown", mouseHandler);
      window.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  const clampedTop = Math.max(8, Math.min(pos.top, window.innerHeight - 280));
  const clampedLeft = Math.max(8, Math.min(pos.left, window.innerWidth - 276));

  return (
    <div
      ref={ref}
      className="fixed z-50 w-64 rounded-2xl border shadow-2xl animate-fade-slide-up overflow-hidden"
      style={{
        top: clampedTop,
        left: clampedLeft,
        backgroundColor: "hsl(var(--card))",
        borderColor: `${item.color}40`,
        boxShadow: `0 8px 32px hsl(0 0% 0% / 0.5), 0 0 0 1px ${item.color}20`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="h-1" style={{ background: `linear-gradient(90deg, ${item.color}, ${item.color}80)` }} />
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold text-sm leading-tight">{item.title}</span>
          <button onClick={onClose} className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-1.5 text-xs text-muted-foreground">
          {item.day_of_week != null && item.start_time && item.end_time && (
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 flex-shrink-0" />
              {DAYS[item.day_of_week]} · {formatTime(item.start_time)} – {formatTime(item.end_time)}
            </div>
          )}
          {item.due_date && (
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 flex-shrink-0" />
              Due {new Date(item.due_date.split("T")[0] + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          )}
          {item.location && (
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
              {item.location}
            </div>
          )}
          {item.notes && (
            <div className="flex items-start gap-2">
              <StickyNote className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              {item.notes}
            </div>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => { onClose(); onEdit(item); }}>
            <Pencil className="h-3.5 w-3.5 mr-1" />Edit
          </Button>
          <Button variant="destructive" size="sm" className="flex-1 h-8 text-xs" onClick={() => onDelete(item.id)}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Schedule block (grid cell) ─────────────────────────────

function ScheduleBlock({ item, index, onSelect }: {
  item: ScheduleItem;
  index: number;
  onSelect: (item: ScheduleItem, anchor: HTMLElement) => void;
}) {
  if (!item.start_time || !item.end_time) return null;
  const top = blockTop(item.start_time);
  const height = blockHeight(item.start_time, item.end_time);

  return (
    <button
      type="button"
      /* Was a <div onClick>: not focusable, not keyboard-operable, so the
         primary interaction on this screen was mouse-only. It also had no
         focus state for the depth treatment to respond to. */
      /* Focus ring is an outline, not Tailwind's ring-* (a box-shadow):
         this element sets `overflow: hidden` and sits inside transformed,
         scrollable ancestors, where a shadow-drawn ring is liable to be
         clipped. outline + outline-offset survives both. */
      className="schedule-block depth-tilt absolute left-0.5 right-0.5 rounded-lg px-1.5 py-1 text-left cursor-pointer overflow-hidden border shadow-elev-2 hover:brightness-125 hover:shadow-elev-4 hover:z-10 focus-visible:z-20 focus-visible:shadow-elev-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))] active:scale-[0.98]"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        background: `linear-gradient(160deg, ${item.color}35, ${item.color}18)`,
        borderColor: `${item.color}50`,
        animationDelay: `${index * 25}ms`,
      }}
      onClick={(e) => onSelect(item, e.currentTarget)}
    >
      <p className="text-[10px] font-bold leading-tight truncate" style={{ color: item.color }}>
        {item.title}
      </p>
      {height > 30 && (
        <p className="text-[9px] text-muted-foreground leading-tight truncate mt-0.5">
          {formatTime(item.start_time)}
        </p>
      )}
      {height > 52 && item.location && (
        <p className="text-[9px] text-muted-foreground leading-tight truncate">
          {item.location}
        </p>
      )}
    </button>
  );
}

// ── More menu ──────────────────────────────────────────────

function MoreMenu({ onClear, onConnect }: { onClear: () => void; onConnect: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)} aria-label="More options">
        <ChevronDown className="h-4 w-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-48 bg-card border border-border rounded-xl py-1 z-20 shadow-lg animate-fade-slide-up">
          <button
            onClick={() => { onConnect(); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors"
          >
            <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
            Connect School
          </button>
          <div className="h-px bg-border/60 my-1" />
          <button
            onClick={() => { onClear(); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-destructive/10 text-destructive transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear all items
          </button>
        </div>
      )}
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────

export default function DashboardPage() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ScheduleItem | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const [editItem, setEditItem] = useState<ScheduleItem | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [todoInput, setTodoInput] = useState("");
  const [todoDragOver, setTodoDragOver] = useState(false);
  const todayIdx = getTodayIdx();

  const fetchSchedule = useCallback(() => {
    if (!token) return Promise.resolve();
    return api.getSchedule(token)
      .then(({ items: fetched }) => setItems(fetched))
      .catch((err) => { if (!(err instanceof ApiError && err.status === 401)) console.error(err); });
  }, [token]);

  const fetchAccounts = useCallback(() => {
    if (!token) return Promise.resolve();
    return api.getIntegrations(token).then(({ accounts: a }) => setAccounts(a)).catch(() => {});
  }, [token]);

  const fetchTodos = useCallback(() => {
    if (!token) return Promise.resolve();
    return api.getTodos(token).then(({ todos: t }) => setTodos(t)).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    Promise.all([fetchSchedule(), fetchAccounts(), fetchTodos()]).finally(() => setLoading(false));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSync = useCallback(async (provider: "studentvue" | "schoology" | "ion") => {
    if (!token) return;
    setSyncing(provider);
    try {
      if (provider === "studentvue") await api.syncStudentVue(token);
      else if (provider === "schoology") await api.syncSchoology(token);
      else await api.syncIon(token);
      await Promise.all([fetchSchedule(), fetchAccounts()]);
    } catch (err) { console.error("Sync failed", err); }
    finally { setSyncing(null); }
  }, [token, fetchSchedule, fetchAccounts]);

  const handleDisconnect = useCallback(async (id: string, providerName: string) => {
    if (!token) return;
    if (!window.confirm(`Disconnect ${providerName}? This will remove all imported schedule items from this account.`)) return;
    try {
      await api.deleteIntegration(token, id);
      await Promise.all([fetchSchedule(), fetchAccounts()]);
    } catch { /* ignore */ }
  }, [token, fetchSchedule, fetchAccounts]);

  const handleDeleteItem = useCallback(async (id: string) => {
    if (!token) return;
    setSelectedItem(null); setPopoverPos(null);
    setItems((prev) => prev.filter((i) => i.id !== id));
    try { await api.deleteScheduleItem(token, id); }
    catch { fetchSchedule(); }
  }, [token, fetchSchedule]);

  const handleClearAll = useCallback(async () => {
    if (!token) return;
    try {
      await api.clearSchedule(token);
      setItems([]);
    } catch { /* ignore */ }
    finally { setClearConfirm(false); }
  }, [token]);

  const handleEditSave = useCallback(async (id: string, updates: NewScheduleItem) => {
    if (!token) return;
    const { item: updated } = await api.updateScheduleItem(token, id, updates);
    setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
  }, [token]);

  const handleAddTodo = useCallback(async () => {
    if (!token || !todoInput.trim()) return;
    const text = todoInput.trim();
    setTodoInput("");
    const { todo } = await api.createTodo(token, text);
    setTodos((prev) => [...prev, todo]);
  }, [token, todoInput]);

  const handleAddTodoFromText = useCallback(async (text: string) => {
    if (!token || !text.trim()) return;
    const { todo } = await api.createTodo(token, text.trim());
    setTodos((prev) => [...prev, todo]);
  }, [token]);

  const handleToggleTodo = useCallback(async (id: string, completed: boolean) => {
    if (!token) return;
    setTodos((prev) => prev.map((t) => t.id === id ? { ...t, completed } : t));
    try { await api.updateTodo(token, id, { completed }); }
    catch { setTodos((prev) => prev.map((t) => t.id === id ? { ...t, completed: !completed } : t)); }
  }, [token]);

  const handleToggleAssignment = useCallback(async (id: string, completed: boolean) => {
    if (!token) return;
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, completed } : i));
    try { await api.toggleScheduleComplete(token, id, completed); }
    catch { setItems((prev) => prev.map((i) => i.id === id ? { ...i, completed: !completed } : i)); }
  }, [token]);

  const handleDeleteTodo = useCallback(async (id: string) => {
    if (!token) return;
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try { await api.deleteTodo(token, id); } catch { fetchTodos(); }
  }, [token, fetchTodos]);

  const handleSelectBlock = useCallback((item: ScheduleItem, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    setSelectedItem(item);
    setPopoverPos({
      top: Math.max(8, Math.min(rect.top, window.innerHeight - 280)),
      left: Math.max(8, Math.min(rect.right + 8, window.innerWidth - 276)),
    });
  }, []);

  // ── Stats ───────────────────────────────────────────────
  const classItems = items.filter((i) => i.category === "class");
  const uniqueClasses = new Set(classItems.map((i) => i.title)).size;
  const assignments = items.filter((i) => ["assignment", "exam", "project"].includes(i.category));
  const hoursScheduled = totalScheduledHours(classItems);
  const hasItems = items.length > 0;
  const completedTodos = todos.filter((t) => t.completed).length;

  const upcomingAssignments = [...assignments]
    .filter((a) => a.due_date && a.category !== "exam")
    .sort((a, b) => (a.due_date! > b.due_date! ? 1 : -1));

  const upcomingExams = [...assignments]
    .filter((a) => a.due_date && a.category === "exam")
    .sort((a, b) => (a.due_date! > b.due_date! ? 1 : -1));

  // Dates for each column (Mon–Sun) of the current week, used to match
  // date-pinned Ion items (which have day_of_week=null, due_date=YYYY-MM-DD)
  const weekDates = useMemo(() => {
    const today = new Date();
    const jsDay = today.getDay();
    const daysSinceMonday = jsDay === 0 ? 6 : jsDay - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysSinceMonday);
    monday.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
  }, []);

  const itemsByDay = useCallback((day: number) => {
    const dateStr = weekDates[day];
    const ionItems = items.filter((i) =>
      i.day_of_week == null &&
      i.due_date?.slice(0, 10) === dateStr &&
      i.source === "ion"
    );
    if (ionItems.length > 0) {
      // No-school sentinel — Ion told us there are no classes today
      if (ionItems.some((i) => i.title === "__no_school__")) return [];
      // Otherwise show real Ion blocks (excluding the sentinel just in case)
      return ionItems.filter((i) =>
        i.title !== "__no_school__" && i.start_time && i.end_time &&
        !["assignment", "exam", "project"].includes(i.category)
      );
    }
    // No Ion data for this date — fall back to StudentVUE recurring items
    return items.filter((i) =>
      i.day_of_week === day && i.start_time && i.end_time &&
      !["assignment", "exam", "project"].includes(i.category)
    );
  }, [items, weekDates]);

  const initials = (user?.email?.[0] ?? "U").toUpperCase();

  // ── TodoList component (shared) ─────────────────────────
  function TodoList() {
    return (
      <div className="bg-card border border-border rounded-xl p-4">
        <form
          onSubmit={(e) => { e.preventDefault(); handleAddTodo(); }}
          onDragOver={(e) => { e.preventDefault(); setTodoDragOver(true); }}
          onDragLeave={() => setTodoDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setTodoDragOver(false);
            const text = e.dataTransfer.getData("text/plain");
            if (text) handleAddTodoFromText(text);
          }}
          className={`flex gap-2 mb-3 rounded-xl p-1 transition-all ${todoDragOver ? "ring-2 ring-primary/60 bg-primary/[0.07]" : ""}`}
        >
          <Input value={todoInput} onChange={(e) => setTodoInput(e.target.value)}
            placeholder={todoDragOver ? "Drop to add task…" : "Add a task…"} className="flex-1 h-9 text-sm" />
          <Button type="submit" size="sm" className="h-9 px-3" disabled={!todoInput.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </form>
        {todos.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No tasks yet. Add one above.</p>
        ) : (
          <ul className="space-y-0.5">
            {todos.map((todo) => (
              <li key={todo.id} className="flex items-center gap-2.5 group rounded-lg px-2 py-2 hover:bg-muted/40 transition-colors">
                <button onClick={() => handleToggleTodo(todo.id, !todo.completed)} className="flex-shrink-0">
                  {todo.completed
                    ? <CheckSquare className="h-4 w-4 text-primary" />
                    : <Square className="h-4 w-4 text-muted-foreground/50 hover:text-muted-foreground" />}
                </button>
                <span className={`flex-1 text-sm leading-snug ${todo.completed ? "line-through text-muted-foreground/50" : ""}`}>
                  {todo.text}
                </span>
                <button onClick={() => handleDeleteTodo(todo.id)}
                  className="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-destructive transition-all rounded-md hover:bg-destructive/10">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  function SectionHeader({ icon: Icon, title, count }: { icon: React.ElementType; title: string; count?: string | number }) {
    return (
      <div className="flex items-center gap-2.5 mb-3">
        <div className="h-6 w-6 rounded-md bg-muted border border-border flex items-center justify-center">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <h2 className="font-display text-sm font-semibold">{title}</h2>
        {count !== undefined && (
          <span className="text-[11px] text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded-full leading-none">
            {count}
          </span>
        )}
        <div className="flex-1 h-px bg-border/60" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">

      {/* Nav */}
      <nav className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <CalendarRange className="h-4 w-4 text-primary" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight hidden sm:block">AutoPlanner</span>
          </Link>

          <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1 border border-border/50">
            <button onClick={() => navigate("/today")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all text-muted-foreground hover:text-foreground">
              Today's Plan
            </button>
            <button onClick={() => navigate("/dashboard")}
              aria-current="page"
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-card border border-border/60 text-foreground shadow-sm">
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
              <span className="text-xs font-bold text-foreground">{initials}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={logout} className="gap-1.5">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h1 className="font-display text-2xl font-bold">Your Schedule</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportModalOpen(true)}>
              <FileUp className="h-4 w-4 mr-1.5" />
              Import Files
            </Button>
            {hasItems && (
              <Button variant="outline" size="sm" onClick={() => downloadICS(items)}>
                <Download className="h-4 w-4 mr-1.5" />
                Export .ics
              </Button>
            )}
            <Button size="sm" onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Classes
            </Button>
            {hasItems ? (
              <MoreMenu onClear={() => setClearConfirm(true)} onConnect={() => setConnectModalOpen(true)} />
            ) : (
              <Button variant="outline" size="sm" onClick={() => setConnectModalOpen(true)}>
                <Link2 className="h-4 w-4 mr-1.5" />
                Connect School
              </Button>
            )}
          </div>
        </div>

        {/* Stats pills */}
        {hasItems && (
          <div className="flex items-center gap-2 flex-wrap mb-5">
            {[
              { icon: BookOpen, label: "classes", value: uniqueClasses, color: "text-primary", bg: "bg-primary/10 border-primary/20" },
              { icon: Clock, label: "hrs / week", value: hoursScheduled, color: "text-muted-foreground", bg: "bg-muted border-border" },
              { icon: CalendarRange, label: "assignments", value: assignments.length, color: "text-primary", bg: "bg-primary/10 border-primary/20" },
              todos.length > 0 ? { icon: ListTodo, label: "tasks done", value: `${completedTodos}/${todos.length}`, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" } : null,
            ].filter(Boolean).map((s) => {
              const Icon = s!.icon;
              return (
                <div key={s!.label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${s!.bg}`}>
                  <Icon className={`h-3.5 w-3.5 ${s!.color}`} />
                  <span className={`font-bold ${s!.color}`}>{s!.value}</span>
                  <span className="text-muted-foreground">{s!.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Exam countdown banner */}
        {(() => {
          const today = new Date().toISOString().slice(0, 10);
          const exams = items
            .filter((i) => i.category === "exam" && i.due_date && i.due_date >= today)
            .sort((a, b) => (a.due_date! > b.due_date! ? 1 : -1))
            .slice(0, 4);
          if (exams.length === 0) return null;
          return (
            <div className="flex items-center gap-3 overflow-x-auto pb-1 mb-5 -mx-1 px-1 scrollbar-hide">
              <span className="text-[11px] text-muted-foreground font-semibold flex-shrink-0">⏰ Exams:</span>
              {exams.map((exam) => {
                const daysUntil = Math.ceil(
                  (new Date(exam.due_date!).getTime() - new Date(today).getTime()) / 86_400_000
                );
                const urgent = daysUntil <= 2;
                const warn = daysUntil <= 7;
                return (
                  <span
                    key={exam.id}
                    className="flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full border"
                    style={{
                      color: urgent ? "#f87171" : warn ? "#facc15" : "#94a3b8",
                      borderColor: urgent ? "#ef444440" : warn ? "#eab30840" : "#94a3b840",
                      backgroundColor: urgent ? "#ef44440a" : warn ? "#eab3080a" : "transparent",
                    }}
                  >
                    {exam.title} · {daysUntil === 0 ? "Today!" : daysUntil === 1 ? "Tomorrow" : `${daysUntil}d`}
                  </span>
                );
              })}
            </div>
          );
        })()}

        {/* Connected accounts */}
        {accounts.length > 0 && (
          <div className="flex flex-col gap-2 mb-5">
            {accounts.map((acct) => {
              const providerName = acct.provider === "studentvue" ? "StudentVUE" : acct.provider === "schoology" ? "Schoology" : "Ion (TJHSST)";
              return (
                <div key={acct.id} className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                    <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{providerName}</span>
                    {acct.last_synced_at && (
                      <span className="text-muted-foreground">
                        · synced {new Date(acct.last_synced_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleSync(acct.provider)} disabled={syncing === acct.provider}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors" title="Re-sync">
                      <RefreshCw className={`h-3 w-3 ${syncing === acct.provider ? "animate-spin" : ""}`} />
                    </button>
                    <button onClick={() => handleDisconnect(acct.id, providerName)}
                      className="text-muted-foreground hover:text-destructive transition-colors font-medium" title="Disconnect">
                      Disconnect
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state — shown instead of grid */}
        {!loading && !hasItems && (
          <div className="flex flex-col items-center justify-center py-16 mb-8">
            <div className="bg-card border border-border rounded-xl p-10 text-center max-w-sm w-full">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <h2 className="font-display text-xl font-bold mb-2">No classes yet</h2>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                Paste your schedule, upload a file, or connect your school account to get started.
              </p>
              <div className="space-y-2">
                <Button className="w-full" onClick={() => setModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />Add Your Schedule
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setImportModalOpen(true)}>
                  <FileUp className="h-4 w-4 mr-2" />Import a File
                </Button>
                <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setConnectModalOpen(true)}>
                  <Link2 className="h-4 w-4 mr-2" />Connect School Account
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Schedule grid */}
        {(loading || hasItems) && (
          <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 sm:hidden">
              <span className="text-[11px] text-muted-foreground">Weekly schedule</span>
              <span className="text-[11px] text-muted-foreground">← swipe to scroll →</span>
            </div>
            <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-border min-w-[640px]">
              <div className="p-2" />
              {DAYS.map((day, idx) => (
                <div key={day} className={`p-2.5 text-center border-l border-border ${
                  idx === todayIdx ? "bg-primary/[0.08] text-primary" : "text-muted-foreground"
                }`}>
                  <span className="text-[11px] font-bold uppercase tracking-wider block">{day}</span>
                  <span className="text-[10px] font-normal block opacity-60">{parseInt(weekDates[idx]?.slice(8) ?? "0", 10)}</span>
                  {idx === todayIdx && <span className="block h-0.5 w-5 bg-primary mx-auto mt-1 rounded-full" />}
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-[52px_repeat(7,1fr)]" style={{ height: `${TOTAL_HEIGHT}px` }}>
                  <div className="relative">
                    {HOURS.map((hour, i) => (
                      <div key={hour}
                        className="absolute right-0 pr-2 text-[10px] font-mono text-muted-foreground/60 border-b border-border/30 flex items-start justify-end pt-1 w-full"
                        style={{ top: `${i * ROW_HEIGHT}px`, height: `${ROW_HEIGHT}px` }}>
                        {hour % 12 === 0 ? 12 : hour % 12}{hour < 12 ? "a" : "p"}
                      </div>
                    ))}
                  </div>
                  {DAYS.map((day, dayIdx) => (
                    <div key={day}
                      className={`depth-stage relative border-l border-border/50 ${dayIdx === todayIdx ? "bg-primary/[0.025]" : ""}`}
                      style={{ height: `${TOTAL_HEIGHT}px` }}>
                      {HOURS.map((_, i) => (
                        <div key={i} className="absolute left-0 right-0 border-b border-border/20"
                          style={{ top: `${i * ROW_HEIGHT}px`, height: `${ROW_HEIGHT}px` }} />
                      ))}
                      {loading && dayIdx < 5 && (
                        <div className="absolute inset-1 space-y-2 pt-2">
                          {Array.from({ length: (dayIdx % 3) + 1 }).map((_, i) => (
                            <div key={i} className="skeleton rounded-lg"
                              style={{ height: `${ROW_HEIGHT * 1.5}px`, animationDelay: `${(dayIdx + i) * 0.08}s` }} />
                          ))}
                        </div>
                      )}
                      {!loading && itemsByDay(dayIdx).map((item, blockIdx) => (
                        <ScheduleBlock key={item.id} item={item} index={blockIdx} onSelect={handleSelectBlock} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Assignments + Todos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upcoming Exams */}
          {(hasItems || loading) && upcomingExams.length > 0 && (
            <div>
              <SectionHeader icon={GraduationCap} title="Upcoming Exams" count={upcomingExams.length} />
              <div className="space-y-2">
                {upcomingExams.map((a) => {
                  const due = new Date(a.due_date!.split("T")[0] + "T00:00:00");
                  const today = new Date(); today.setHours(0, 0, 0, 0);
                  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
                  const overdue = diffDays < 0;
                  const dueSoon = diffDays <= 3 && !overdue;
                  const estMins = a.estimated_minutes;
                  const estLabel = estMins
                    ? estMins >= 60
                      ? `${Math.floor(estMins / 60)}h${estMins % 60 ? `${estMins % 60}m` : ""} prep`
                      : `${estMins}m prep`
                    : null;
                  return (
                    <div key={a.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", a.title)}
                      className={`bg-card border border-border rounded-xl hover:-translate-y-px transition-transform px-4 py-3 flex items-center gap-3 group cursor-grab active:cursor-grabbing ${a.completed ? "opacity-50" : ""}`}
                      onClick={(e) => handleSelectBlock(a, e.currentTarget)}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleAssignment(a.id, !a.completed); }}
                        className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
                      >
                        {a.completed ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                      </button>
                      <div className="h-8 w-1 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${a.completed ? "line-through text-muted-foreground" : ""}`}>{a.title}</p>
                        {a.notes && <p className="text-xs text-muted-foreground truncate mt-0.5">{a.notes}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {estLabel && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-medium">
                            {estLabel}
                          </span>
                        )}
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          overdue ? "bg-destructive/15 text-destructive" :
                          dueSoon ? "bg-red-500/15 text-red-400" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {overdue ? `${Math.abs(diffDays)}d late` :
                           diffDays === 0 ? "Today" :
                           diffDays === 1 ? "Tomorrow" :
                           due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteItem(a.id); }}
                          className="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-destructive transition-all rounded-md hover:bg-destructive/10"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upcoming Assignments */}
          {(hasItems || loading) && (
            <div>
              <SectionHeader icon={BookOpen} title="Upcoming Assignments" count={upcomingAssignments.length} />
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-2xl" style={{ animationDelay: `${i * 0.08}s` }} />)}
                </div>
              ) : upcomingAssignments.length === 0 ? (
                <div className="bg-card border border-border rounded-xl px-4 py-8 text-center text-sm text-muted-foreground">
                  No upcoming assignments
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingAssignments.map((a) => {
                    const due = new Date(a.due_date!.split("T")[0] + "T00:00:00");
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
                    const overdue = diffDays < 0;
                    const dueSoon = diffDays <= 2 && !overdue;
                    const estMins = a.estimated_minutes;
                    const estLabel = estMins
                      ? estMins >= 60
                        ? `~${Math.floor(estMins / 60)}h${estMins % 60 ? `${estMins % 60}m` : ""}`
                        : `~${estMins}m`
                      : null;
                    return (
                      <div key={a.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", a.title)}
                        className={`bg-card border border-border rounded-xl hover:-translate-y-px transition-transform px-4 py-3 flex items-center gap-3 group cursor-grab active:cursor-grabbing ${a.completed ? "opacity-50" : ""}`}
                        onClick={(e) => handleSelectBlock(a, e.currentTarget)}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleAssignment(a.id, !a.completed); }}
                          className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
                        >
                          {a.completed
                            ? <CheckSquare className="h-4 w-4 text-primary" />
                            : <Square className="h-4 w-4" />}
                        </button>
                        <div className="h-8 w-1 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${a.completed ? "line-through text-muted-foreground" : ""}`}>{a.title}</p>
                          {a.notes && <p className="text-xs text-muted-foreground truncate mt-0.5">{a.notes}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {estLabel && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-medium">
                              {estLabel}
                            </span>
                          )}
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            overdue ? "bg-destructive/15 text-destructive" :
                            dueSoon ? "bg-yellow-500/15 text-yellow-400" :
                            "bg-muted text-muted-foreground"
                          }`}>
                            {overdue ? `${Math.abs(diffDays)}d late` :
                             diffDays === 0 ? "Today" :
                             diffDays === 1 ? "Tomorrow" :
                             due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteItem(a.id); }}
                            className="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-destructive transition-all rounded-md hover:bg-destructive/10"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Todos */}
          <div>
            <SectionHeader icon={ListTodo} title="To-Do"
              count={todos.length > 0 ? `${completedTodos}/${todos.length}` : undefined} />
            <TodoList />
          </div>
        </div>
      </main>

      {/* Block detail popover */}
      {selectedItem && popoverPos && (
        <BlockPopover
          item={selectedItem}
          pos={popoverPos}
          onClose={() => { setSelectedItem(null); setPopoverPos(null); }}
          onDelete={handleDeleteItem}
          onEdit={(item) => { setSelectedItem(null); setPopoverPos(null); setEditItem(item); }}
        />
      )}

      {editItem && (
        <EditItemModal item={editItem} onClose={() => setEditItem(null)} onSave={handleEditSave} />
      )}
      <ScheduleInputModal isOpen={modalOpen} onClose={() => setModalOpen(false)}
        onSaved={(newItems) => setItems((prev) => [...prev, ...newItems])} />
      <ConnectAccountModal isOpen={connectModalOpen} onClose={() => setConnectModalOpen(false)}
        onImported={() => { fetchSchedule(); fetchAccounts(); }} />
      <FileImportModal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)}
        onImported={() => fetchSchedule()} />

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 lg:hidden border-t border-border bg-background flex">
        {[
          { to: "/today",     icon: CalendarRange, label: "Today" },
          { to: "/dashboard", icon: BookOpen,      label: "Schedule" },
        ].map(({ to, icon: Icon, label }) => (
          <Link key={to} to={to} className={`flex-1 flex flex-col items-center py-3 gap-0.5 text-[10px] transition-colors ${
            to === "/dashboard" ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}>
            <Icon className="h-5 w-5" />{label}
          </Link>
        ))}
      </nav>
      <div className="lg:hidden h-14" />

      {/* Clear confirmation — bottom banner */}
      {clearConfirm && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-destructive/30 bg-background/95 backdrop-blur-md p-4 flex items-center justify-between gap-4 animate-fade-slide-up">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
            <span>This will permanently delete all schedule items.</span>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setClearConfirm(false)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={handleClearAll}>Clear All</Button>
          </div>
        </div>
      )}
    </div>
  );
}
