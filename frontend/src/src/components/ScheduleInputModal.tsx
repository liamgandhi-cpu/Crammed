import { useState, useEffect, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Sparkles, Save, Loader2, AlertCircle, MapPin, Clock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, type NewScheduleItem, type ScheduleItem, type Category, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useFocusRestore } from "@/hooks/useFocusRestore";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (items: ScheduleItem[]) => void;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const CATEGORY_LABELS: Record<string, string> = {
  class: "Class",
  activity: "Activity",
  assignment: "Assignment",
  study: "Study",
  other: "Other",
  exam: "Exam",
  project: "Project",
};

const CATEGORY_COLORS: Record<string, string> = {
  class: "#6366f1",
  activity: "#10b981",
  assignment: "#f59e0b",
  study: "#3b82f6",
  exam: "#ef4444",
  project: "#8b5cf6",
  other: "#6b7280",
};

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${String(m).padStart(2, "0")} ${period}`;
}

const EXAMPLE_TEXT = `CS 301 - MWF 9:00-10:15 AM, Room 204
MATH 210 - Tue/Thu 11:00 AM-12:30 PM
Gym - Mon/Wed/Fri 6:00-7:00 PM
Midterm Exam - March 15
Essay 2 due March 22
Study group Tuesday 3:00-5:00 PM, Library`;

// ── Quick Add Form ────────────────────────────────────────────────────────────

interface QuickAddFormProps {
  onSaved: (items: ScheduleItem[]) => void;
  onClose: () => void;
}

function QuickAddForm({ onSaved, onClose }: QuickAddFormProps) {
  const { token } = useAuth();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("assignment");
  const [dueDate, setDueDate] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (!token || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const item: NewScheduleItem = {
        title: title.trim(),
        category,
        color: CATEGORY_COLORS[category] ?? "#6b7280",
        due_date: dueDate || null,
        estimated_minutes: estimatedMinutes ? parseInt(estimatedMinutes, 10) : null,
        notes: notes.trim() || null,
        day_of_week: null,
        start_time: null,
        end_time: null,
        location: null,
        source: null,
        source_id: null,
        source_file: null,
      };
      const { item: saved } = await api.createScheduleItem(token, item);
      onSaved([saved]);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }, [token, title, category, dueDate, estimatedMinutes, notes, onSaved, onClose]);

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <label htmlFor="quick-title" className="block text-sm font-medium mb-1.5 text-foreground">
          Title <span className="text-destructive">*</span>
        </label>
        <input id="quick-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Calc homework, History essay…"
          className="w-full rounded-xl bg-muted/30 border border-border px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
        />
      </div>

      {/* Category */}
      <div>
        <span id="quick-category-label" className="block text-sm font-medium mb-1.5 text-foreground">Category</span>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="quick-category-label">
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setCategory(key as Category)}
              aria-pressed={category === key}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
              style={
                category === key
                  ? {
                      backgroundColor: `${CATEGORY_COLORS[key]}25`,
                      borderColor: `${CATEGORY_COLORS[key]}60`,
                      color: CATEGORY_COLORS[key],
                    }
                  : {}
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Due date + Estimated time */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="quick-due-date" className="block text-sm font-medium mb-1.5 text-foreground">Due date</label>
          <input
            id="quick-due-date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-xl bg-muted/30 border border-border px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
          />
        </div>
        <div>
          <label htmlFor="quick-est-time" className="block text-sm font-medium mb-1.5 text-foreground">Est. time (min)</label>
          <input id="quick-est-time"
            type="number"
            value={estimatedMinutes}
            onChange={(e) => setEstimatedMinutes(e.target.value)}
            placeholder="e.g. 45"
            min="1"
            className="w-full rounded-xl bg-muted/30 border border-border px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="quick-notes" className="block text-sm font-medium mb-1.5 text-foreground">Notes (optional)</label>
        <textarea id="quick-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional details…"
          rows={2}
          className="w-full rounded-xl bg-muted/30 border border-border px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 resize-none transition-all"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-1">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!title.trim() || saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" />
              Add
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function ScheduleInputModal({ isOpen, onClose, onSaved }: Props) {
  const { token } = useAuth();
  const [tab, setTab] = useState<"quick" | "ai">("quick");
  const [text, setText] = useState("");
  const [parsedItems, setParsedItems] = useState<NewScheduleItem[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCloseAutoFocus = useFocusRestore(isOpen);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setTab("quick");
      setText("");
      setParsedItems(null);
      setError(null);
    }
  }, [isOpen]);

  const handleParse = useCallback(async () => {
    if (!token || !text.trim()) return;
    setParsing(true);
    setError(null);
    try {
      const { items } = await api.parseSchedule(token, text);
      if (items.length === 0) {
        setError("No schedule items could be parsed. Check the format and try again.");
      } else {
        setParsedItems(items);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to parse schedule.");
    } finally {
      setParsing(false);
    }
  }, [token, text]);

  const handleRemoveItem = useCallback((index: number) => {
    setParsedItems((prev) => prev?.filter((_, i) => i !== index) ?? null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!token || !parsedItems || parsedItems.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const { items } = await api.createScheduleBulk(token, parsedItems);
      onSaved(items);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save schedule.");
    } finally {
      setSaving(false);
    }
  }, [token, parsedItems, onSaved, onClose]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        {/* Backdrop */}
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[3px] animate-fade-in" />

        {/* Panel */}
        <div className="dialog-stage fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <Dialog.Content
            onCloseAutoFocus={handleCloseAutoFocus}
            className="dialog-surface pointer-events-auto bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-dialog-in">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <Dialog.Title className="font-display text-lg font-bold">Add Assignment</Dialog.Title>
                  <Dialog.Description className="text-xs text-muted-foreground">Quick form or AI text paste</Dialog.Description>
                </div>
              </div>
              <Dialog.Close
                aria-label="Close"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border px-6">
              <button
                onClick={() => { setTab("quick"); setParsedItems(null); setError(null); }}
                className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors mr-6 ${
                  tab === "quick"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Quick Add
              </button>
              <button
                onClick={() => { setTab("ai"); setError(null); }}
                className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  tab === "ai"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                AI Parse
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* ── Quick Add tab ── */}
              {tab === "quick" && (
                <QuickAddForm onSaved={onSaved} onClose={onClose} />
              )}

              {/* ── AI Parse tab ── */}
              {tab === "ai" && (
                <div className="space-y-5">
                  {!parsedItems && (
                    <>
                      <div>
                        <label htmlFor="ai-paste" className="block text-sm font-medium mb-2 text-foreground">
                          Paste your schedule
                        </label>
                        <textarea id="ai-paste"
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          placeholder={EXAMPLE_TEXT}
                          rows={8}
                          className="w-full rounded-xl bg-muted/30 border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 resize-none font-mono transition-all"
                        />
                      </div>
                      <div className="rounded-xl bg-muted/20 border border-border/50 p-4 text-xs text-muted-foreground space-y-1">
                        <p className="font-semibold text-foreground/70 mb-2">Format examples:</p>
                        {EXAMPLE_TEXT.split("\n").map((line, i) => (
                          <p key={i} className="font-mono">{line}</p>
                        ))}
                      </div>
                    </>
                  )}

                  {parsedItems && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">
                          {parsedItems.length} item{parsedItems.length !== 1 ? "s" : ""} parsed
                        </p>
                        <button
                          onClick={() => { setParsedItems(null); setError(null); }}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          ← Edit text
                        </button>
                      </div>
                      <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                        {parsedItems.map((item, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 rounded-xl p-3 border transition-all animate-fade-slide-up"
                            style={{
                              backgroundColor: `${item.color}18`,
                              borderColor: `${item.color}40`,
                              animationDelay: `${i * 40}ms`,
                            }}
                          >
                            <div
                              className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: item.color }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm truncate">{item.title}</span>
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded-md font-medium flex-shrink-0"
                                  style={{
                                    backgroundColor: `${item.color}25`,
                                    color: item.color,
                                  }}
                                >
                                  {CATEGORY_LABELS[item.category] ?? item.category}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                                {item.day_of_week != null && item.start_time && item.end_time ? (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {DAYS[item.day_of_week]} · {formatTime(item.start_time)}–{formatTime(item.end_time)}
                                  </span>
                                ) : item.due_date ? (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Due {new Date(item.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  </span>
                                ) : null}
                                {item.location && (
                                  <span className="flex items-center gap-1 truncate">
                                    <MapPin className="h-3 w-3 flex-shrink-0" />
                                    {item.location}
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveItem(i)}
                              className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      {error}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-1">
                    <Button variant="ghost" onClick={onClose} disabled={parsing || saving}>
                      Cancel
                    </Button>
                    {!parsedItems ? (
                      <Button onClick={handleParse} disabled={!text.trim() || parsing}>
                        {parsing ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Parsing…
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            Parse Schedule
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button onClick={handleSave} disabled={parsedItems.length === 0 || saving}>
                        {saving ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving…
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Save {parsedItems.length} item{parsedItems.length !== 1 ? "s" : ""}
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
