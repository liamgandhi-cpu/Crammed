import { Resend } from "resend";
import { logger } from "../logger";

export interface WeeklySummaryData {
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

export async function sendWeeklySummary(
  email: string,
  data: WeeklySummaryData
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const resend = new Resend(apiKey);

  const { firstName, weekRange, classCount, assignmentCount, exams, courses, focusStats } = data;

  const focusH = Math.floor(focusStats.totalSeconds / 3600);
  const focusM = Math.floor((focusStats.totalSeconds % 3600) / 60);
  const focusText = focusH > 0 ? `${focusH}h ${focusM}m` : `${focusM}m`;

  const examRows = exams
    .map(
      (e) =>
        `<li style="padding:4px 0;color:${
          e.daysUntil <= 3 ? "#f87171" : e.daysUntil <= 7 ? "#fb923c" : "#94a3b8"
        };font-size:14px;">⏰ <strong>${e.title}</strong> in ${e.daysUntil} day${
          e.daysUntil === 1 ? "" : "s"
        }</li>`
    )
    .join("");

  const courseRows = courses
    .map((c) => {
      const avg = c.average !== null ? `${c.average}%` : "No grades yet";
      const grade = c.letterGrade ?? "—";
      const status = c.targetGrade
        ? c.onTrack
          ? `✅ On track for ${c.targetGrade}`
          : `⚠️ Below ${c.targetGrade} target`
        : "";
      return `<tr>
        <td style="padding:8px 0;color:#e2e8f0;font-size:14px;">${c.name}</td>
        <td style="padding:8px 0;color:#94a3b8;font-size:14px;">${avg} (${grade})</td>
        <td style="padding:8px 0;color:#94a3b8;font-size:13px;">${status}</td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Your Week Ahead</title></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:32px 24px;">

  <div style="text-align:center;margin-bottom:32px;">
    <div style="display:inline-block;background:#1e293b;border:1px solid #334155;border-radius:12px;padding:10px 20px;">
      <span style="color:#f97316;font-size:18px;">📅</span>
      <span style="color:#f1f5f9;font-weight:700;font-size:16px;margin-left:8px;">AutoPlanner</span>
    </div>
  </div>

  <h1 style="color:#f1f5f9;font-size:24px;font-weight:700;margin:0 0 8px;">Hey ${firstName}! 👋</h1>
  <p style="color:#94a3b8;font-size:15px;margin:0 0 28px;">
    Here's your week at a glance: <strong style="color:#e2e8f0;">${weekRange}</strong>
  </p>

  <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
    <tr>
      <td style="padding:0 6px 0 0;width:33%;">
        <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;text-align:center;">
          <div style="color:#f97316;font-size:28px;font-weight:800;">${classCount}</div>
          <div style="color:#94a3b8;font-size:12px;margin-top:4px;">Classes</div>
        </div>
      </td>
      <td style="padding:0 6px;width:33%;">
        <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;text-align:center;">
          <div style="color:#38bdf8;font-size:28px;font-weight:800;">${assignmentCount}</div>
          <div style="color:#94a3b8;font-size:12px;margin-top:4px;">Assignments due</div>
        </div>
      </td>
      <td style="padding:0 0 0 6px;width:33%;">
        <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;text-align:center;">
          <div style="color:#a855f7;font-size:28px;font-weight:800;">${focusText}</div>
          <div style="color:#94a3b8;font-size:12px;margin-top:4px;">Focused last week</div>
        </div>
      </td>
    </tr>
  </table>

  ${
    exams.length > 0
      ? `<div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;margin-bottom:20px;">
      <h2 style="color:#f1f5f9;font-size:16px;font-weight:600;margin:0 0 12px;">📌 Upcoming Exams</h2>
      <ul style="margin:0;padding:0;list-style:none;">${examRows}</ul>
    </div>`
      : ""
  }

  ${
    courses.length > 0
      ? `<div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;margin-bottom:20px;">
      <h2 style="color:#f1f5f9;font-size:16px;font-weight:600;margin:0 0 12px;">📊 Your Grades</h2>
      <table style="width:100%;border-collapse:collapse;"><tbody>${courseRows}</tbody></table>
    </div>`
      : ""
  }

  <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;margin-bottom:28px;">
    <h2 style="color:#f1f5f9;font-size:16px;font-weight:600;margin:0 0 12px;">🎯 Focus Stats</h2>
    <p style="color:#94a3b8;font-size:14px;margin:0 0 6px;">Focused last week: <strong style="color:#e2e8f0;">${focusText}</strong></p>
    ${
      focusStats.streak > 0
        ? `<p style="color:#94a3b8;font-size:14px;margin:0;">Streak: <strong style="color:#f97316;">${focusStats.streak} day${
            focusStats.streak === 1 ? "" : "s"
          } 🔥</strong></p>`
        : ""
    }
  </div>

  <div style="text-align:center;margin-bottom:28px;">
    <a href="https://myautoplanner.vercel.app/today"
       style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">
      Open AutoPlanner →
    </a>
  </div>

  <p style="color:#475569;font-size:12px;text-align:center;margin:0;">
    AutoPlanner · <a href="https://myautoplanner.vercel.app" style="color:#475569;">myautoplanner.vercel.app</a>
  </p>
</div>
</body>
</html>`;

  const from = process.env.RESEND_FROM ?? "AutoPlanner <onboarding@resend.dev>";
  const subject = `Your Week Ahead — ${weekRange}`;

  const { error } = await resend.emails.send({ from, to: email, subject, html });
  if (error) throw new Error(`Resend error: ${error.message}`);

  logger.info(`Weekly summary email sent to ${email}`);
}
