import { useState, useCallback, useRef, useEffect } from "react";
import {
  X,
  FileUp,
  FileText,
  Image,
  Calendar,
  Check,
  Loader2,
  Pencil,
  Trash2,
  FileSpreadsheet,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { api, type ParsedScheduleItem } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────

type ModalState = "upload" | "processing" | "preview" | "success";

interface FileEntry {
  id: string;
  file: File;
}

interface PreviewItem extends ParsedScheduleItem {
  _id: string;
  _selected: boolean;
  _editing: boolean;
  _titleDraft: string;
}

// ── Helpers ────────────────────────────────────────────────

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const CATEGORY_LABEL: Record<string, string> = {
  class: "Class",
  assignment: "Assignment",
  exam: "Exam",
  project: "Project",
  activity: "Activity",
  study: "Study",
  other: "Other",
};

const CATEGORY_COLOR: Record<string, string> = {
  class: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  assignment: "bg-rose-500/15 text-rose-400 border-rose-500/25",
  exam: "bg-red-500/15 text-red-400 border-red-500/25",
  project: "bg-purple-500/15 text-purple-400 border-purple-500/25",
  activity: "bg-sky-500/15 text-sky-400 border-sky-500/25",
  study: "bg-teal-500/15 text-teal-400 border-teal-500/25",
  other: "bg-green-500/15 text-green-400 border-green-500/25",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileIcon(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (file.type.startsWith("image/")) return <Image className="h-4 w-4 text-blue-400" />;
  if (ext === "pdf") return <FileText className="h-4 w-4 text-red-400" />;
  if (ext === "ics") return <Calendar className="h-4 w-4 text-green-400" />;
  if (ext === "csv") return <FileSpreadsheet className="h-4 w-4 text-teal-400" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

function itemDateLabel(item: ParsedScheduleItem): string {
  if (item.recurring && item.dayOfWeek != null) {
    const day = DAYS[item.dayOfWeek] ?? "?";
    const time = item.startTime ? ` · ${item.startTime}–${item.endTime ?? "?"}` : "";
    return `Every ${day}${time}`;
  }
  if (item.dueDate) {
    const d = new Date(item.dueDate + "T00:00:00");
    const days = Math.round(
      (d.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000
    );
    const label =
      days === 0 ? "Today" : days === 1 ? "Tomorrow" : days < 0 ? `${Math.abs(days)}d ago` :
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return label;
  }
  return "";
}

// ── Sub-components ─────────────────────────────────────────

function PreviewItemCard({
  item,
  onChange,
  onRemove,
}: {
  item: PreviewItem;
  onChange: (id: string, patch: Partial<PreviewItem>) => void;
  onRemove: (id: string) => void;
}) {
  const dateLabel = itemDateLabel(item);
  const catStyle = CATEGORY_COLOR[item.category] ?? CATEGORY_COLOR.other;

  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-all ${
        item._selected
          ? "bg-card/60 border-white/[0.08]"
          : "bg-card/20 border-white/[0.04] opacity-50"
      }`}
      style={{ borderLeft: `3px solid ${item.color}` }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={item._selected}
        onChange={(e) => onChange(item._id, { _selected: e.target.checked })}
        className="h-3.5 w-3.5 rounded accent-primary flex-shrink-0"
      />

      {/* Color dot */}
      <span
        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: item.color }}
      />

      {/* Title */}
      <div className="flex-1 min-w-0">
        {item._editing ? (
          <input
            autoFocus
            value={item._titleDraft}
            onChange={(e) => onChange(item._id, { _titleDraft: e.target.value })}
            onBlur={() =>
              onChange(item._id, {
                title: item._titleDraft.trim() || item.title,
                _editing: false,
              })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                onChange(item._id, {
                  title: item._titleDraft.trim() || item.title,
                  _editing: false,
                });
              }
            }}
            className="w-full bg-transparent border-b border-primary text-sm text-foreground outline-none"
          />
        ) : (
          <p className="text-sm font-medium leading-tight truncate">{item.title}</p>
        )}
        {dateLabel && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{dateLabel}</p>
        )}
      </div>

      {/* Category badge */}
      <span
        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border flex-shrink-0 hidden sm:block ${catStyle}`}
      >
        {CATEGORY_LABEL[item.category] ?? item.category}
      </span>

      {/* Edit / Remove */}
      <button
        onClick={() =>
          onChange(item._id, { _editing: !item._editing, _titleDraft: item.title })
        }
        className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all flex-shrink-0"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        onClick={() => onRemove(item._id)}
        className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all flex-shrink-0"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

// ── Main Modal ─────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImported: (count: number) => void;
}

const ACCEPTED = ".pdf,.docx,.txt,.csv,.ics,.jpg,.jpeg,.png,.webp";

const PROCESS_MESSAGES = [
  "Reading your files…",
  "Extracting text and images…",
  "Analyzing with AI…",
  "Finding classes and assignments…",
  "Almost done…",
];

export default function FileImportModal({ isOpen, onClose, onImported }: Props) {
  const { token } = useAuth();
  const [state, setState] = useState<ModalState>("upload");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [processMsgIdx, setProcessMsgIdx] = useState(0);
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processMsgTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(() => {
    if (state === "processing") return; // don't close during processing
    onClose();
    setTimeout(() => {
      setState("upload");
      setFiles([]);
      setPreview([]);
      setError(null);
      setImportedCount(0);
    }, 200);
  }, [state, onClose]);

  // Cycle through processing messages
  useEffect(() => {
    if (state !== "processing") {
      if (processMsgTimer.current) clearInterval(processMsgTimer.current);
      return;
    }
    setProcessMsgIdx(0);
    processMsgTimer.current = setInterval(() => {
      setProcessMsgIdx((i) => Math.min(i + 1, PROCESS_MESSAGES.length - 1));
    }, 2500);
    return () => { if (processMsgTimer.current) clearInterval(processMsgTimer.current); };
  }, [state]);

  const addFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const newEntries: FileEntry[] = [];
    Array.from(fileList).forEach((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      const ok = ["pdf","docx","txt","csv","ics","jpg","jpeg","png","webp"].includes(ext);
      if (!ok) return;
      if (files.some((e) => e.file.name === f.name && e.file.size === f.size)) return;
      newEntries.push({ id: Math.random().toString(36).slice(2), file: f });
    });
    setFiles((prev) => [...prev, ...newEntries].slice(0, 5));
  }, [files]);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  // ── Process ──────────────────────────────────────────────
  const handleProcess = useCallback(async () => {
    if (!token || files.length === 0) return;
    setState("processing");
    setError(null);

    try {
      const { parsedItems, uploads } = await api.uploadAndProcess(
        token,
        files.map((f) => f.file)
      );

      const failed = uploads.filter((u) => u.status === "failed");
      if (failed.length === uploads.length) {
        throw new Error(
          failed[0]?.error ?? "All files failed to process. Check the file formats."
        );
      }

      if (parsedItems.length === 0) {
        throw new Error(
          "No schedule items found in the uploaded files. Try a syllabus, assignment sheet, or calendar file."
        );
      }

      const previewItems: PreviewItem[] = parsedItems.map((item) => ({
        ...item,
        _id: Math.random().toString(36).slice(2),
        _selected: true,
        _editing: false,
        _titleDraft: item.title,
      }));

      setPreview(previewItems);
      if (failed.length > 0) {
        setError(
          `${failed.length} file(s) failed to process: ${failed.map((f) => f.filename).join(", ")}`
        );
      }
      setState("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("upload");
    }
  }, [token, files]);

  // ── Preview mutations ────────────────────────────────────
  const updateItem = useCallback((id: string, patch: Partial<PreviewItem>) => {
    setPreview((prev) =>
      prev.map((item) => (item._id === id ? { ...item, ...patch } : item))
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setPreview((prev) => prev.filter((item) => item._id !== id));
  }, []);

  // ── Import ───────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    if (!token) return;
    const selected = preview.filter((p) => p._selected);
    if (selected.length === 0) return;

    setState("processing");
    try {
      const { count } = await api.confirmImport(token, selected);
      setImportedCount(count);
      setState("success");
      onImported(count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save items.");
      setState("preview");
    }
  }, [token, preview, onImported]);

  if (!isOpen) return null;

  const selectedCount = preview.filter((p) => p._selected).length;
  const classItems = preview.filter((p) => p._selected && (p.recurring || p.dayOfWeek != null));
  const eventItems = preview.filter((p) => p._selected && !(p.recurring || p.dayOfWeek != null));
  const unselectedCount = preview.filter((p) => !p._selected).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Modal */}
      <div className="relative z-10 bg-card border border-border rounded-xl w-full max-w-2xl flex flex-col animate-fade-slide-up max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <FileUp className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold">Import Files</h2>
              <p className="text-xs text-muted-foreground">
                {state === "upload" && "Upload syllabi, calendars, or assignment sheets"}
                {state === "processing" && "Processing your files…"}
                {state === "preview" && `Found ${preview.length} items — review before importing`}
                {state === "success" && `Successfully imported ${importedCount} items`}
              </p>
            </div>
          </div>
          {state !== "processing" && (
            <button
              onClick={handleClose}
              className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">

          {/* ── State: UPLOAD ── */}
          {state === "upload" && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center gap-3 py-10 px-6"
                style={{
                  borderColor: dragging ? "hsl(var(--primary))" : "hsl(var(--border))",
                  backgroundColor: dragging ? "hsl(var(--primary) / 0.05)" : "hsl(var(--card) / 0.3)",
                }}
              >
                <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <FileUp className="h-6 w-6 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">
                    Drop your files here
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF, Word, images, .ics, .csv, .txt — up to 5 files, 20 MB each
                  </p>
                </div>
                <Button variant="outline" size="sm" className="pointer-events-none">
                  Browse Files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED}
                  multiple
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
              </div>

              {/* File chips */}
              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-3 bg-muted/30 border border-border rounded-xl px-3 py-2.5"
                    >
                      <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        {fileIcon(entry.file)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{entry.file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatSize(entry.file.size)}
                        </p>
                      </div>
                      <button
                        onClick={() => removeFile(entry.id)}
                        className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ── State: PROCESSING ── */}
          {state === "processing" && (
            <div className="flex flex-col items-center justify-center py-12 gap-6">
              <div className="relative h-16 w-16">
                <div className="absolute inset-0 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                </div>
              </div>
              <div className="text-center space-y-2">
                <p className="font-display font-semibold">
                  {PROCESS_MESSAGES[processMsgIdx]}
                </p>
                <p className="text-sm text-muted-foreground">
                  This usually takes 5–20 seconds
                </p>
              </div>
              {/* File list with pulse */}
              <div className="w-full max-w-sm space-y-2">
                {files.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 bg-muted/30 border border-border rounded-lg px-3 py-2"
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" />
                    <span className="text-xs text-muted-foreground truncate flex-1">
                      {entry.file.name}
                    </span>
                    <Loader2 className="h-3 w-3 text-muted-foreground animate-spin flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── State: PREVIEW ── */}
          {state === "preview" && (
            <div className="space-y-5">
              {/* Summary pills */}
              <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                {classItems.length > 0 && (
                  <span className="bg-orange-500/10 border border-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full font-medium">
                    {classItems.length} recurring classes
                  </span>
                )}
                {eventItems.length > 0 && (
                  <span className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full font-medium">
                    {eventItems.length} assignments / exams
                  </span>
                )}
                {unselectedCount > 0 && (
                  <span className="bg-muted border border-border px-2 py-0.5 rounded-full">
                    {unselectedCount} deselected
                  </span>
                )}
              </div>

              {/* Warning from partial failures */}
              {error && (
                <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-xs text-yellow-400">
                  ⚠ {error}
                </div>
              )}

              {/* Recurring classes */}
              {preview.filter((p) => p.recurring || p.dayOfWeek != null).length > 0 && (
                <div>
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="h-5 w-5 rounded-md bg-muted border border-border flex items-center justify-center">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <span className="text-xs font-semibold text-foreground">
                      Recurring Classes
                    </span>
                    <div className="flex-1 h-px bg-border/60" />
                  </div>
                  <div className="space-y-1.5">
                    {preview
                      .filter((p) => p.recurring || p.dayOfWeek != null)
                      .map((item) => (
                        <PreviewItemCard
                          key={item._id}
                          item={item}
                          onChange={updateItem}
                          onRemove={removeItem}
                        />
                      ))}
                  </div>
                </div>
              )}

              {/* Assignments & Exams */}
              {preview.filter((p) => !(p.recurring || p.dayOfWeek != null)).length > 0 && (
                <div>
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="h-5 w-5 rounded-md bg-muted border border-border flex items-center justify-center">
                      <FileText className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <span className="text-xs font-semibold text-foreground">
                      Assignments &amp; Exams
                    </span>
                    <div className="flex-1 h-px bg-border/60" />
                  </div>
                  <div className="space-y-1.5">
                    {preview
                      .filter((p) => !(p.recurring || p.dayOfWeek != null))
                      .map((item) => (
                        <PreviewItemCard
                          key={item._id}
                          item={item}
                          onChange={updateItem}
                          onRemove={removeItem}
                        />
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── State: SUCCESS ── */}
          {state === "success" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="h-16 w-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
                <CheckCircle2 className="h-9 w-9 text-green-400" />
              </div>
              <div className="text-center">
                <p className="font-display font-bold text-lg">
                  {importedCount} items imported!
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your schedule has been updated. Classes and assignments are now
                  visible on the calendar.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border flex-shrink-0">
          {state === "upload" && (
            <>
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleProcess}
                disabled={files.length === 0}
              >
                <FileUp className="h-4 w-4 mr-1.5" />
                Extract Schedule
              </Button>
            </>
          )}

          {state === "preview" && (
            <>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setState("upload");
                    setError(null);
                  }}
                >
                  Back
                </Button>
                {preview.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const allSelected = preview.every((p) => p._selected);
                      setPreview((prev) =>
                        prev.map((p) => ({ ...p, _selected: !allSelected }))
                      );
                    }}
                  >
                    {preview.every((p) => p._selected) ? "Deselect all" : "Select all"}
                  </Button>
                )}
              </div>
              <Button
                onClick={handleImport}
                disabled={selectedCount === 0}
              >
                <Check className="h-4 w-4 mr-1.5" />
                {selectedCount === preview.length
                  ? `Import All (${selectedCount})`
                  : `Import Selected (${selectedCount})`}
              </Button>
            </>
          )}

          {state === "success" && (
            <Button className="ml-auto" onClick={handleClose}>
              View Schedule
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
