import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  CalendarRange, Plus, Clock, BookOpen,
  Trash2, X, MapPin, StickyNote, RefreshCw, GraduationCap,
  Pencil, CheckSquare, Square, ListTodo, FileUp, Link2,
  ChevronDown, AlertTriangle, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AppNav, { APP_CONTAINER, MobileNavSpacer } from "@/components/AppNav";
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
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="font-display text-base font-bold leading-tight text-ink-1">{item.title}</span>
          <button
            onClick={onClose}
            aria-label="Close details"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-4 transition-colors hover:bg-surface-3 hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-2 text-sm text-ink-3">
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
      {/* Was 10px title over 9px metadata. A grid cell is tight, but 9px is
          below the point where the text is doing any work at all. */}
      <p className="truncate text-[0.6875rem] font-bold leading-tight" style={{ color: item.color }}>
        {item.title}
      </p>
      {height > 30 && (
        <p className="mt-0.5 truncate font-mono text-[0.625rem] leading-tight text-ink-3">
          {formatTime(item.start_time)}
        </p>
      )}
      {height > 52 && item.location && (
        <p className="truncate text-[0.625rem] leading-tight text-ink-4">
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
  const { token } = useAuth();
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

  /**
   * One row for both the exam list and the assignment list.
   *
   * These were two ~40-line blocks that had been copied and then drifted:
   * "due soon" meant ≤3 days in one and ≤2 in the other, the estimate chip was
   * purple in one and blue in the other, and the urgent badge was `bg-cat-due`
   * in one and `bg-cat-warn` in the other — differences nobody chose. The
   * thresholds are now explicit props and the colours come from tokens.
   */
  function AssignmentRow({
    item, dueSoonDays, estPrefix, estSuffix, estTone,
  }: {
    item: ScheduleItem;
    dueSoonDays: number;
    estPrefix: string;
    estSuffix: string;
    estTone: string;
  }) {
    const due = new Date(item.due_date!.split("T")[0] + "T00:00:00");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
    const overdue = diffDays < 0;
    const dueSoon = diffDays <= dueSoonDays && !overdue;
    const est = item.estimated_minutes;
    const estLabel = est
      ? est >= 60
        ? `${estPrefix}${Math.floor(est / 60)}h${est % 60 ? `${est % 60}m` : ""}${estSuffix}`
        : `${estPrefix}${est}m${estSuffix}`
      : null;

    return (
      <div
        draggable
        onDragStart={(e) => e.dataTransfer.setData("text/plain", item.title)}
        className={`group flex cursor-grab items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 transition-all hover:border-ink-4/40 hover:shadow-elev-1 active:cursor-grabbing ${
          item.completed ? "opacity-55" : ""
        }`}
        onClick={(e) => handleSelectBlock(item, e.currentTarget)}
      >
        <button
          onClick={(e) => { e.stopPropagation(); handleToggleAssignment(item.id, !item.completed); }}
          aria-pressed={item.completed}
          aria-label={`Mark "${item.title}" ${item.completed ? "not done" : "done"}`}
          className="shrink-0 rounded-sm text-ink-4 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {item.completed
            ? <CheckSquare className="h-4 w-4 text-primary" aria-hidden="true" />
            : <Square className="h-4 w-4" aria-hidden="true" />}
        </button>

        <span
          className="h-9 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: item.color }}
          aria-hidden="true"
        />

        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-medium ${item.completed ? "text-ink-4 line-through" : "text-ink-1"}`}>
            {item.title}
          </p>
          {item.notes && <p className="mt-0.5 truncate text-micro text-ink-3">{item.notes}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {estLabel && (
            <span className={`rounded-full px-2 py-0.5 text-micro font-medium ${estTone}`}>
              {estLabel}
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-micro font-semibold ${
              overdue ? "bg-destructive/15 text-destructive"
              : dueSoon ? "bg-cat-due/15 text-cat-due"
              : "bg-muted text-ink-3"
            }`}
          >
            {overdue ? `${Math.abs(diffDays)}d late`
              : diffDays === 0 ? "Today"
              : diffDays === 1 ? "Tomorrow"
              : due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }}
            aria-label={`Delete "${item.title}"`}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-4 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  // ── TodoList component (shared) ─────────────────────────
  function TodoList() {
    return (
      <div className="rounded-xl border border-border bg-surface-2 p-4">
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
          className={`mb-3 flex gap-2 rounded-lg transition-colors ${
            todoDragOver ? "bg-primary/[0.07] outline outline-2 outline-primary/60" : ""
          }`}
        >
          <label htmlFor="dashboard-todo-input" className="sr-only">Add a task</label>
          <Input
            id="dashboard-todo-input"
            value={todoInput}
            onChange={(e) => setTodoInput(e.target.value)}
            placeholder={todoDragOver ? "Drop to add task…" : "Add a task…"}
            className="h-9 flex-1"
          />
          <Button type="submit" size="sm" className="h-9 w-9 shrink-0 px-0" disabled={!todoInput.trim()} aria-label="Add task">
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </form>
        {todos.length === 0 ? (
          <p className="py-3 text-sm leading-relaxed text-ink-3">
            Nothing on the list. Drag an assignment in, or type one above.
          </p>
        ) : (
          <ul className="ruled">
            {todos.map((todo) => (
              <li key={todo.id} className="group flex items-center gap-1">
                <button
                  onClick={() => handleToggleTodo(todo.id, !todo.completed)}
                  aria-pressed={todo.completed}
                  className="flex flex-1 items-center gap-2.5 rounded-md px-1 py-2.5 text-left transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {todo.completed
                    ? <CheckSquare className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    : <Square className="h-4 w-4 shrink-0 text-ink-4" aria-hidden="true" />}
                  <span className={`flex-1 text-sm leading-snug ${todo.completed ? "text-ink-4 line-through" : "text-ink-2"}`}>
                    {todo.text}
                  </span>
                </button>
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
      </div>
    );
  }

  /* Kicker over a rule. The icon chip is gone: it was a 24px tinted square
     repeated at the head of every section, carrying no information the title
     didn't already carry, and it capped these headings at 14px so no section
     on the page could out-rank another. */
  function SectionHeader({ icon: Icon, title, count }: { icon: React.ElementType; title: string; count?: string | number }) {
    return (
      <div className="kicker-rule mb-3.5">
        <Icon className="h-3.5 w-3.5 shrink-0 text-ink-4" aria-hidden="true" />
        <h2 className="shrink-0">{title}</h2>
        {count !== undefined && (
          <span className="shrink-0 text-ink-4" data-numeric>{count}</span>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">

      <AppNav />

      <main className={`${APP_CONTAINER} py-8`}>

        {/* Header */}
        <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="kicker mb-2.5">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <h1 className="font-display text-display-3 text-ink-1">Your schedule</h1>
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
        </header>

        {/* Stats pills */}
        {hasItems && (
          /* Figures on rules, not pills. Four bordered capsules in a row is the
             same "everything is a chip" flattening the sidebar had — and the
             numbers, which are the point, were set at 12px inside them. */
          <div className="mb-8 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-[hsl(var(--rule))] py-5 sm:flex sm:gap-10">
            {[
              { icon: BookOpen, label: "classes", value: uniqueClasses, tone: "text-cat-class" },
              { icon: Clock, label: "hrs / week", value: hoursScheduled, tone: "text-ink-2" },
              { icon: CalendarRange, label: "assignments", value: assignments.length, tone: "text-cat-study" },
              todos.length > 0 ? { icon: ListTodo, label: "tasks done", value: `${completedTodos}/${todos.length}`, tone: "text-cat-free" } : null,
            ].filter(Boolean).map((s) => {
              const Icon = s!.icon;
              return (
                <div key={s!.label}>
                  <p className={`figure text-2xl ${s!.tone}`}>{s!.value}</p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-micro text-ink-3">
                    <Icon className="h-3.5 w-3.5 text-ink-4" aria-hidden="true" />
                    {s!.label}
                  </p>
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
            <div className="-mx-1 mb-6 flex items-center gap-2.5 overflow-x-auto px-1 pb-1 scrollbar-hide">
              <span className="kicker shrink-0">Exams</span>
              {exams.map((exam) => {
                const daysUntil = Math.ceil(
                  (new Date(exam.due_date!).getTime() - new Date(today).getTime()) / 86_400_000
                );
                const urgent = daysUntil <= 2;
                const warn = daysUntil <= 7;
                const tone = urgent
                  ? "border-cat-due/35 bg-cat-due/[0.07] text-cat-due"
                  : warn
                  ? "border-cat-warn/35 bg-cat-warn/[0.07] text-cat-warn"
                  : "border-border text-ink-3";
                return (
                  <span
                    key={exam.id}
                    className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-micro font-semibold ${tone}`}
                  >
                    {exam.title} · {daysUntil === 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : `${daysUntil}d`}
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
                <div key={acct.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 text-sm">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cat-free" aria-hidden="true" />
                    <GraduationCap className="h-4 w-4 shrink-0 text-ink-4" aria-hidden="true" />
                    <span className="font-medium text-ink-1">{providerName}</span>
                    {acct.last_synced_at && (
                      <span className="truncate text-micro text-ink-3">
                        synced {new Date(acct.last_synced_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => handleSync(acct.provider)}
                      disabled={syncing === acct.provider}
                      aria-label={`Re-sync ${providerName}`}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink-1 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${syncing === acct.provider ? "animate-spin" : ""}`} aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => handleDisconnect(acct.id, providerName)}
                      className="rounded-md px-2 py-1.5 text-micro font-medium text-ink-3 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
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
          <div className="mb-8 max-w-lg py-12">
            <span className="accent-bar mb-6" />
            <h2 className="text-balance font-display text-display-3 text-ink-1">
              Let's get your week in.
            </h2>
            <p className="mt-3 max-w-measure text-pretty leading-relaxed text-ink-3">
              Three ways in, and none of them is typing out a timetable by hand.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button onClick={() => setModalOpen(true)}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />Paste a schedule
              </Button>
              <Button variant="outline" onClick={() => setImportModalOpen(true)}>
                <FileUp className="mr-2 h-4 w-4" aria-hidden="true" />Import a file
              </Button>
              <Button variant="ghost" onClick={() => setConnectModalOpen(true)}>
                <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />Connect your school
              </Button>
            </div>
          </div>
        )}

        {/* Schedule grid */}
        {(loading || hasItems) && (
          <div className="mb-8 overflow-hidden rounded-xl border border-border bg-surface-1">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-2 sm:hidden">
              <span className="kicker">Weekly schedule</span>
              <span className="text-micro text-ink-4">swipe to scroll</span>
            </div>
            <div className="grid min-w-[640px] grid-cols-[52px_repeat(7,1fr)] border-b border-border">
              <div className="p-2" />
              {DAYS.map((day, idx) => (
                <div key={day} className={`border-l border-border p-2.5 text-center ${
                  idx === todayIdx ? "bg-primary/[0.08] text-primary" : "text-ink-3"
                }`}>
                  <span className="block text-kicker uppercase">{day}</span>
                  <span className="mt-1 block text-micro text-ink-4" data-numeric>
                    {parseInt(weekDates[idx]?.slice(8) ?? "0", 10)}
                  </span>
                  {idx === todayIdx && <span className="mx-auto mt-1.5 block h-0.5 w-5 rounded-full bg-primary" />}
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-[52px_repeat(7,1fr)]" style={{ height: `${TOTAL_HEIGHT}px` }}>
                  <div className="relative">
                    {HOURS.map((hour, i) => (
                      <div key={hour}
                        className="absolute right-0 flex w-full items-start justify-end border-b border-border/30 pr-2 pt-1 font-mono text-[0.625rem] text-ink-4"
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
                {upcomingExams.map((a) => (
                  <AssignmentRow
                    key={a.id}
                    item={a}
                    dueSoonDays={3}
                    estPrefix=""
                    estSuffix=" prep"
                    estTone="bg-cat-week/15 text-cat-week"
                  />
                ))}
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
                <p className="rounded-xl border border-dashed border-[hsl(var(--rule))] px-4 py-8 text-center text-sm text-ink-3">
                  Nothing due. Add assignments and they'll queue up here.
                </p>
              ) : (
                <div className="space-y-2">
                  {upcomingAssignments.map((a) => (
                    <AssignmentRow
                      key={a.id}
                      item={a}
                      dueSoonDays={2}
                      estPrefix="~"
                      estSuffix=""
                      estTone="bg-cat-study/15 text-cat-study"
                    />
                  ))}
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

      <MobileNavSpacer />

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
