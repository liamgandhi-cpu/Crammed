import { useCallback, useEffect, useRef } from "react";
import type { ScheduleItem, PlanBlock } from "@/lib/api";

export type NotifPermission = "default" | "granted" | "denied" | "unsupported";

export function getPermission(): NotifPermission {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export async function requestPermission(): Promise<NotifPermission> {
  if (typeof Notification === "undefined") return "unsupported";
  const result = await Notification.requestPermission();
  return result;
}

function fireNotif(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  new Notification(title, { body, icon: "/favicon.ico" });
}

interface ScheduleNotifOptions {
  scheduleItems: ScheduleItem[];
  planBlocks: PlanBlock[];
  reminderMinutesBefore: number;
  enabled: {
    assignment_reminders: boolean;
    study_reminders: boolean;
    exam_warnings: boolean;
  };
}

/** Schedule in-session browser notifications for the current day. */
export function useScheduleNotifications({
  scheduleItems,
  planBlocks,
  reminderMinutesBefore,
  enabled,
}: ScheduleNotifOptions) {
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  useEffect(() => {
    if (getPermission() !== "granted") return;

    clearTimers();
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);

    // ── Assignment reminders ──────────────────────────────
    if (enabled.assignment_reminders) {
      scheduleItems
        .filter((i) => i.due_date?.startsWith(today) && ["assignment", "project"].includes(i.category))
        .forEach((item) => {
          // Notify at 8 AM if before 8 AM, else immediately if not already shown
          const notifyAt = new Date(today + "T08:00:00");
          const delay = notifyAt.getTime() - now;
          if (delay > 0) {
            timersRef.current.push(
              setTimeout(() => {
                fireNotif(`📝 Due today: ${item.title}`, "Don't forget — make time for it in your plan.");
              }, delay)
            );
          }
        });
    }

    // ── Exam warnings ─────────────────────────────────────
    if (enabled.exam_warnings) {
      scheduleItems
        .filter((i) => i.category === "exam" && i.due_date && i.due_date >= today)
        .forEach((item) => {
          const daysUntil = Math.ceil(
            (new Date(item.due_date!).getTime() - new Date(today).getTime()) / 86_400_000
          );
          if (daysUntil === 1) {
            const notifyAt = new Date(today + "T09:00:00");
            const delay = notifyAt.getTime() - now;
            if (delay > 0) {
              timersRef.current.push(
                setTimeout(() => {
                  fireNotif(`⏰ Exam tomorrow: ${item.title}`, "Make sure you're prepared!");
                }, delay)
              );
            }
          } else if (daysUntil === 3) {
            const notifyAt = new Date(today + "T10:00:00");
            const delay = notifyAt.getTime() - now;
            if (delay > 0) {
              timersRef.current.push(
                setTimeout(() => {
                  fireNotif(`📌 Exam in 3 days: ${item.title}`, "Start reviewing your notes.");
                }, delay)
              );
            }
          }
        });
    }

    // ── Study/plan block reminders ────────────────────────
    if (enabled.study_reminders) {
      planBlocks
        .filter((b) => ["study", "assignment", "exam"].includes(b.type) && !b.completed)
        .forEach((block) => {
          const [h, m] = block.startTime.split(":").map(Number);
          const blockTime = new Date();
          blockTime.setHours(h, m, 0, 0);
          const notifyAt = new Date(blockTime.getTime() - reminderMinutesBefore * 60_000);
          const delay = notifyAt.getTime() - now;
          if (delay > 0) {
            timersRef.current.push(
              setTimeout(() => {
                fireNotif(
                  `📚 Starting in ${reminderMinutesBefore}min: ${block.title}`,
                  `Scheduled for ${block.startTime}`
                );
              }, delay)
            );
          }
        });
    }

    return clearTimers;
  }, [scheduleItems, planBlocks, reminderMinutesBefore, enabled, clearTimers]);
}
