import { Router } from "express";
import jwt from "jsonwebtoken";
import { authenticate } from "../middleware/auth";
import { encrypt, decrypt } from "../utils/crypto";
import { upsertConnectedAccount, touchLastSynced } from "../models/integration";
import { query } from "../config/db";
import { logger } from "../logger";

const router = Router();

const ION_CLIENT_ID = process.env.ION_CLIENT_ID ?? "";
const ION_CLIENT_SECRET = process.env.ION_CLIENT_SECRET ?? "";
const ION_REDIRECT_URI =
  "https://backend-xi-rouge.vercel.app/api/integrations/ion/callback";
const FRONTEND_URL =
  (process.env.FRONTEND_URL ?? "https://myautoplanner.vercel.app")
    .split(",")[0]
    .trim();

// ── Ion period colours ──────────────────────────────────────
const ION_COLOR = "#7c3aed"; // purple — visually distinct from other sources

// ── Helpers ────────────────────────────────────────────────

function toHHMM(timeStr: string): string {
  // Ion returns "H:MM" or "HH:MM" or "HH:MM:SS" — normalise to "HH:MM"
  const [h, m] = timeStr.split(":").map(Number);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

interface IonCourse {
  id?: string;
  name: string;
  teacher?: { username?: string; last_name?: string; full_name?: string } | string;
  room?: string;
}

interface IonBlock {
  id?: number | string;
  order?: number;
  name: string;
  start: string;
  end: string;
  courses?: IonCourse[];
}

interface IonDayType {
  name: string;
  special?: boolean;
  blocks?: IonBlock[];
}

interface IonDay {
  date: string;
  day?: string;
  cancelled?: boolean;
  day_type?: IonDayType;
  blocks?: IonBlock[];
}

async function fetchSchedule(
  accessToken: string,
  date: string
): Promise<{ day: IonDay | null; raw: unknown }> {
  // Use path-based URL: /api/schedule/YYYY-MM-DD/ returns that specific day directly
  const url = `https://ion.tjhsst.edu/api/schedule/${date}/?format=json`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    logger.info("Ion schedule fetch", { status: res.status, date });
    return { day: null, raw: { status: res.status } };
  }

  const data = await res.json() as IonDay | { count: number; results: IonDay[] };
  logger.info("Ion schedule raw response", { date, data: JSON.stringify(data).slice(0, 300) });

  if ("results" in data && Array.isArray(data.results)) {
    const day = data.results.find((d) => d.date === date) ?? null;
    return { day, raw: data };
  }
  if ("date" in data) return { day: data as IonDay, raw: data };
  return { day: null, raw: data };
}

async function refreshAccessToken(
  refreshToken: string
): Promise<{ access_token: string; refresh_token: string } | null> {
  const res = await fetch("https://ion.tjhsst.edu/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: ION_CLIENT_ID,
      client_secret: ION_CLIENT_SECRET,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
  };
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
  };
}

// ── Routes ──────────────────────────────────────────────────

// GET /api/integrations/ion/auth-url
// Returns the Ion OAuth authorization URL; passes JWT as state so we can
// identify the user when Ion redirects back.
router.get("/auth-url", authenticate, (req, res) => {
  // Encode the user JWT as state (the token is already signed with JWT_SECRET)
  const authHeader = req.headers.authorization ?? "";
  const userJwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: ION_CLIENT_ID,
    redirect_uri: ION_REDIRECT_URI,
    scope: "read",
    state: userJwt,
  });
  res.json({ url: `https://ion.tjhsst.edu/oauth/authorize/?${params}` });
});

// GET /api/integrations/ion/callback
// Ion redirects here after the user authorises the app.
router.get("/callback", async (req, res) => {
  const { code, state: userJwt } = req.query as {
    code?: string;
    state?: string;
  };

  if (!code || !userJwt) {
    res.redirect(`${FRONTEND_URL}/today?ion=error`);
    return;
  }

  // Verify the JWT to get the userId — this is the only way to identify who
  // authorised since this endpoint is a public redirect handler.
  let userId: string;
  try {
    const payload = jwt.verify(
      userJwt,
      process.env.JWT_SECRET!
    ) as { userId: string };
    userId = payload.userId;
  } catch {
    res.redirect(`${FRONTEND_URL}/today?ion=error`);
    return;
  }

  try {
    // Exchange authorisation code for tokens
    const tokenRes = await fetch("https://ion.tjhsst.edu/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: ION_CLIENT_ID,
        client_secret: ION_CLIENT_SECRET,
        redirect_uri: ION_REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      logger.error("Ion token exchange failed", { status: tokenRes.status, body });
      res.redirect(`${FRONTEND_URL}/today?ion=error&reason=${encodeURIComponent(body.slice(0, 100))}`);
      return;
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token: string;
    };

    const encryptedCreds = encrypt(
      JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? "",
      })
    );

    await upsertConnectedAccount(userId, "ion", encryptedCreds);

    res.redirect(`${FRONTEND_URL}/today?ion=connected`);
  } catch (err) {
    logger.error("Ion OAuth callback error", { error: err });
    res.redirect(`${FRONTEND_URL}/today?ion=error`);
  }
});

// POST /api/integrations/ion/sync
// Fetches today's (and optionally the rest of this week's) Ion schedule and
// upserts the blocks as schedule_items.
router.post("/sync", authenticate, async (req, res) => {
  const userId = req.user!.userId;

  const { rows: accountRows } = await query(
    "SELECT * FROM connected_accounts WHERE user_id = $1 AND provider = 'ion'",
    [userId]
  );

  if (accountRows.length === 0) {
    res.status(404).json({ error: "Ion account not connected" });
    return;
  }

  const account = accountRows[0];
  let creds: { access_token: string; refresh_token: string };

  try {
    creds = JSON.parse(decrypt(account.encrypted_credentials));
  } catch {
    res.status(500).json({ error: "Failed to decrypt Ion credentials" });
    return;
  }

  // Sync Mon–Fri of current week + next week so that no-school sentinels
  // are inserted for days earlier in the week (e.g. Teacher Work Day on Mon).
  const today = new Date();
  const jsDay = today.getDay(); // 0=Sun, 1=Mon…6=Sat
  const daysSinceMonday = jsDay === 0 ? 6 : jsDay - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysSinceMonday);
  monday.setHours(0, 0, 0, 0);

  const dates: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    dates.push(d.toISOString().slice(0, 10));
  }

  let accessToken = creds.access_token;
  let tokenRefreshed = false;
  let totalImported = 0;
  const debugInfo: unknown[] = [];

  // Clear all existing Ion schedule items for this user
  await query(
    "DELETE FROM schedule_items WHERE user_id = $1 AND source = 'ion'",
    [userId]
  );

  // Build period-number → StudentVUE class map from ALL days (not just one day).
  // Ion block names are the period number ("1"–"7"); source_id is "{title}-p{N}-d{day}"
  // so we extract period N and map it to the right course title regardless of which
  // rotation day the class appears on.
  const svAllResult = await query(
    `SELECT DISTINCT title, notes, source_id FROM schedule_items
     WHERE user_id = $1 AND source = 'studentvue' AND category = 'class'
       AND source_id IS NOT NULL`,
    [userId]
  );
  const periodToClass = new Map<number, { title: string; notes: string | null }>();
  for (const row of svAllResult.rows as { title: string; notes: string | null; source_id: string }[]) {
    const m = row.source_id?.match(/-p(\d+)-d\d+$/);
    if (m) {
      const pNum = parseInt(m[1], 10);
      if (!periodToClass.has(pNum)) {
        periodToClass.set(pNum, { title: row.title, notes: row.notes });
      }
    }
  }
  logger.info("Ion sync: periodToClass map", {
    svRowCount: svAllResult.rows.length,
    sampleSourceIds: (svAllResult.rows as { source_id: string }[]).slice(0, 5).map(r => r.source_id),
    periods: Object.fromEntries(periodToClass.entries()),
  });

  // Named non-class blocks shown as-is (Lunch, Advisory, etc.)
  const NAMED_BLOCKS = new Set(["lunch", "advisory", "flex"]);

  for (const date of dates) {
    let { day, raw } = await fetchSchedule(accessToken, date);
    debugInfo.push({ date, raw });

    // If no data returned, try refreshing the token once
    if (!day && !tokenRefreshed) {
      const refreshed = await refreshAccessToken(creds.refresh_token);
      if (!refreshed) {
        await query(
          "DELETE FROM connected_accounts WHERE user_id = $1 AND provider = 'ion'",
          [userId]
        );
        res.status(401).json({ error: "Ion session expired. Please reconnect.", debug: debugInfo });
        return;
      }
      accessToken = refreshed.access_token;
      tokenRefreshed = true;

      const encryptedCreds = encrypt(JSON.stringify(refreshed));
      await upsertConnectedAccount(userId, "ion", encryptedCreds);

      const retry = await fetchSchedule(accessToken, date);
      day = retry.day;
      debugInfo[debugInfo.length - 1] = { date, raw: retry.raw };
    }

    // Blocks may be at day.blocks or day.day_type.blocks
    const blocks = day?.day_type?.blocks ?? day?.blocks ?? [];

    // No school day (cancelled, holiday, teacher work day) — insert a sentinel
    // so the frontend knows to suppress StudentVUE recurring items for this date.
    if (!day || blocks.length === 0 || day.cancelled) {
      await query(
        `INSERT INTO schedule_items
           (user_id, title, category, day_of_week, start_time, end_time,
            color, notes, source, source_id, due_date)
         VALUES ($1,'__no_school__','other',NULL,'00:00','00:00','#000000',NULL,'ion',$2,$3)
         ON CONFLICT DO NOTHING`,
        [userId, `${date}:no_school`, date]
      );
      continue;
    }

    // Strip HTML from day type name (e.g. "Red Day<br>2hr Early Release")
    const dayLabel = day.day_type?.name?.replace(/<[^>]+>/g, " ").trim() ?? null;

    for (const block of blocks) {
      if (!block.start || !block.end) continue;

      const start = toHHMM(block.start);
      const end = toHHMM(block.end);
      const rawName = block.name?.trim() ?? "";
      const isNamedBlock = NAMED_BLOCKS.has(rawName.toLowerCase());
      // Ion block names can be bare "1" or prefixed "Period 1" — handle both
      const periodMatch = rawName.match(/^(?:Period\s+)?(\d+)$/i);
      const periodNum = periodMatch ? parseInt(periodMatch[1], 10) : null;

      // Title resolution
      let title = rawName;
      let notes: string | null = dayLabel;

      if (!isNamedBlock) {
        // 1. Use Ion's own course name if the API provided it
        const ionCourseName = block.courses?.[0]?.name?.trim();
        if (ionCourseName) {
          title = ionCourseName;
          const t = block.courses?.[0]?.teacher;
          const teacher = !t ? null : typeof t === "string" ? t : (t.full_name ?? t.last_name ?? null);
          notes = teacher ? `Teacher: ${teacher}${dayLabel ? ` · ${dayLabel}` : ""}` : dayLabel;
        } else if (periodNum !== null) {
          // 2. Match period number → StudentVUE class (works across all rotation days)
          const svClass = periodToClass.get(periodNum);
          if (svClass) {
            title = svClass.title;
            notes = svClass.notes ? `${svClass.notes}${dayLabel ? ` · ${dayLabel}` : ""}` : dayLabel;
          } else {
            // No class found for this period — it's a free period, skip it
            continue;
          }
        }
        // Non-numeric named blocks (JLC, 8A, 8B, etc.) keep their Ion name as-is
      }

      await query(
        `INSERT INTO schedule_items
           (user_id, title, category, day_of_week, start_time, end_time,
            color, location, notes, source, source_id, due_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT DO NOTHING`,
        [
          userId,
          title,
          "class",
          null, // no recurring day_of_week — pinned by due_date only
          start,
          end,
          ION_COLOR,
          block.courses?.[0]?.room ?? null,
          notes,
          "ion",
          `${date}:${block.name}:${start}`,
          date,
        ]
      );
      totalImported++;
    }
  }

  await touchLastSynced(account.id);

  logger.info("Ion sync complete", { userId, imported: totalImported, dates: dates.length, debug: JSON.stringify(debugInfo).slice(0, 1000) });
  res.json({ imported: totalImported, dates: dates.length, debug: debugInfo });
});

export default router;
