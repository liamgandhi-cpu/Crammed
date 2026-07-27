import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// ── Types ──────────────────────────────────────────────────

export type JobStatus = "running" | "done" | "failed";

export interface ScrapeJob {
  jobId: string;
  provider: string;
  status: JobStatus;
  result?: { imported?: number; classCount?: number; assignmentCount?: number } | null;
  error?: string | null;
}

interface ScrapeJobContextValue {
  activeJob: ScrapeJob | null;
  /** Call when kicking off a scrape. Pass the in-flight promise and a callback to run on success. */
  startJob: (
    provider: string,
    fetchPromise: Promise<{ jobId?: string; imported?: number; classCount?: number; assignmentCount?: number }>,
    onDone: () => void
  ) => void;
  dismiss: () => void;
}

// ── Storage helpers ────────────────────────────────────────

const STORAGE_KEY = "autoplanner_scrape_job";

function saveJob(job: ScrapeJob) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(job));
}

function loadJob(): ScrapeJob | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ScrapeJob) : null;
  } catch {
    return null;
  }
}

function clearJob() {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Context ────────────────────────────────────────────────

const ScrapeJobContext = createContext<ScrapeJobContextValue>({
  activeJob: null,
  startJob: () => {},
  dismiss: () => {},
});

export function ScrapeJobProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [activeJob, setActiveJob] = useState<ScrapeJob | null>(null);
  const onDoneRef = useRef<(() => void) | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop polling helper
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Mark job as done/failed and stop polling
  const resolveJob = useCallback(
    (job: ScrapeJob) => {
      stopPolling();
      setActiveJob(job);
      saveJob(job);
      if (job.status === "done" && onDoneRef.current) {
        onDoneRef.current();
        onDoneRef.current = null;
      }
    },
    [stopPolling]
  );

  // Poll backend for job status (used after page refresh)
  const startPolling = useCallback(
    (jobId: string, provider: string) => {
      stopPolling();
      if (!token) return;

      pollIntervalRef.current = setInterval(async () => {
        try {
          const data = await api.getJobStatus(token, jobId);
          if (data.status !== "running") {
            resolveJob({
              jobId,
              provider,
              status: data.status,
              result: data.result,
              error: data.error,
            });
          }
        } catch {
          // ignore transient polling errors
        }
      }, 3000);
    },
    [token, resolveJob, stopPolling]
  );

  // On mount: check localStorage for a job that was running before a page refresh
  useEffect(() => {
    const saved = loadJob();
    if (!saved) return;

    if (saved.status === "running") {
      // Resume polling
      setActiveJob(saved);
      if (token) startPolling(saved.jobId, saved.provider);
    } else {
      // Show the completed result once then clear
      setActiveJob(saved);
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up polling on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  const startJob = useCallback(
    (
      provider: string,
      fetchPromise: Promise<{ jobId?: string; imported?: number; classCount?: number; assignmentCount?: number }>,
      onDone: () => void
    ) => {
      onDoneRef.current = onDone;
      const tempJob: ScrapeJob = { jobId: "pending", provider, status: "running" };
      setActiveJob(tempJob);
      saveJob(tempJob);

      fetchPromise
        .then((res) => {
          const jobId = res.jobId ?? "unknown";
          resolveJob({
            jobId,
            provider,
            status: "done",
            result: {
              imported: res.imported,
              classCount: res.classCount,
              assignmentCount: res.assignmentCount,
            },
          });
        })
        .catch((err: Error) => {
          resolveJob({
            jobId: "unknown",
            provider,
            status: "failed",
            error: err?.message ?? "Unknown error",
          });
        });
    },
    [resolveJob]
  );

  const dismiss = useCallback(() => {
    stopPolling();
    setActiveJob(null);
    clearJob();
    onDoneRef.current = null;
  }, [stopPolling]);

  return (
    <ScrapeJobContext.Provider value={{ activeJob, startJob, dismiss }}>
      {children}
    </ScrapeJobContext.Provider>
  );
}

export function useScrapeJob() {
  return useContext(ScrapeJobContext);
}
