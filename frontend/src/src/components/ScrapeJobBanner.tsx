import { Loader2, CheckCircle2, XCircle, X } from "lucide-react";
import { useScrapeJob } from "@/context/ScrapeJobContext";

const PROVIDER_LABELS: Record<string, string> = {
  studentvue: "StudentVUE",
  schoology: "Schoology",
  ion: "Ion",
};

export default function ScrapeJobBanner() {
  const { activeJob, dismiss } = useScrapeJob();

  if (!activeJob) return null;

  const providerLabel = PROVIDER_LABELS[activeJob.provider] ?? activeJob.provider;

  const { status, result } = activeJob;

  // Build the result summary line
  let resultLine = "";
  if (status === "done" && result) {
    const parts: string[] = [];
    if (result.classCount != null) parts.push(`${result.classCount} class${result.classCount !== 1 ? "es" : ""}`);
    if (result.assignmentCount != null) parts.push(`${result.assignmentCount} assignment${result.assignmentCount !== 1 ? "s" : ""}`);
    if (parts.length === 0 && result.imported != null) parts.push(`${result.imported} item${result.imported !== 1 ? "s" : ""}`);
    resultLine = parts.join(" and ") + " imported";
  }

  return (
    <div
      className="fixed bottom-5 right-5 z-[100] w-80 rounded-xl border shadow-xl backdrop-blur-sm transition-all animate-fade-slide-up"
      style={{
        background: "hsl(var(--card))",
        borderColor:
          status === "done"
            ? "rgba(34,197,94,0.3)"
            : status === "failed"
            ? "rgba(239,68,68,0.3)"
            : "hsl(var(--border))",
      }}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Icon */}
        <div
          className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
          style={{
            background:
              status === "done"
                ? "rgba(34,197,94,0.1)"
                : status === "failed"
                ? "rgba(239,68,68,0.1)"
                : "rgba(var(--primary-rgb, 249,115,22),0.1)",
          }}
        >
          {status === "running" && (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
          {status === "done" && (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          )}
          {status === "failed" && (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          {status === "running" && (
            <>
              <p className="text-sm font-semibold">Syncing {providerLabel}…</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                You can navigate freely — we'll let you know when it's done.
              </p>
            </>
          )}
          {status === "done" && (
            <>
              <p className="text-sm font-semibold text-green-500">Sync complete!</p>
              {resultLine && (
                <p className="mt-0.5 text-xs text-muted-foreground">{resultLine}</p>
              )}
            </>
          )}
          {status === "failed" && (
            <>
              <p className="text-sm font-semibold text-destructive">Sync failed</p>
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                {activeJob.error ?? "Something went wrong. Please try again."}
              </p>
            </>
          )}
        </div>

        {/* Dismiss — only when job is finished */}
        {status !== "running" && (
          <button
            onClick={dismiss}
            className="flex-shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Progress bar for running state */}
      {status === "running" && (
        <div className="h-0.5 w-full overflow-hidden rounded-b-xl bg-muted">
          <div className="h-full w-full animate-[progress_2s_ease-in-out_infinite] bg-primary/60" />
        </div>
      )}
    </div>
  );
}
