import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { logger } from "../logger";
import type { NewScheduleItem } from "../models/schedule";

// ── Browser launch ─────────────────────────────────────────

const LOCAL_CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const SERVERLESS_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-blink-features=AutomationControlled",
  "--single-process",
];

async function launchBrowser(): Promise<Browser> {
  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (isServerless) {
    // Use @sparticuz/chromium-min for serverless environments (Vercel, Lambda)
    const { default: chromium } = await import("@sparticuz/chromium-min");
    const executablePath = await chromium.executablePath(
      process.env.CHROMIUM_PACK_URL ??
        "https://github.com/Sparticuz/chromium/releases/download/v133.0.0/chromium-v133.0.0-pack.tar"
    );
    return puppeteer.launch({
      executablePath,
      headless: true,
      defaultViewport: { width: 1280, height: 900 },
      args: [
        ...chromium.args,
        "--disable-blink-features=AutomationControlled",
        "--blink-settings=imagesEnabled=false",  // skip image loading → less memory
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--no-first-run",
      ],
    });
  }

  return puppeteer.launch({
    executablePath: LOCAL_CHROME,
    headless: "new" as unknown as boolean,
    defaultViewport: { width: 1280, height: 900 },
    args: SERVERLESS_ARGS,
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── TJ Block Schedule ──────────────────────────────────────
// Source: old.sites.tjhsst.edu/abouttj/bellschedule/index.html
//
// Monday   = Anchor day: all periods 1-7, short blocks
// Tue/Thu  = Blue day:   periods 1-4, long blocks
// Wed/Fri  = Red day:    periods 5-7, long blocks

type DayType = "anchor" | "blue" | "red";

const TJ_TIMES: Record<DayType, Record<number, { start: string; end: string }>> = {
  anchor: {   // Monday — all 7 periods
    1: { start: "08:40", end: "09:30" },
    2: { start: "09:40", end: "10:25" },
    3: { start: "10:35", end: "11:20" },
    4: { start: "11:30", end: "12:15" },
    // Lunch 12:15–13:25
    5: { start: "13:25", end: "14:10" },
    6: { start: "14:20", end: "15:05" },
    7: { start: "15:15", end: "16:00" },
  },
  blue: {     // Tuesday (day 1) & Thursday (day 3) — periods 1-4
    1: { start: "08:40", end: "10:15" },
    2: { start: "10:25", end: "12:00" },
    // Lunch 12:00–12:40
    3: { start: "12:40", end: "14:15" },
    4: { start: "14:25", end: "16:00" },
  },
  red: {      // Wednesday (day 2) & Friday (day 4) — periods 5-7
    5: { start: "08:40", end: "10:15" },
    6: { start: "10:25", end: "12:00" },
    // Lunch 12:00–12:40
    7: { start: "12:40", end: "14:15" },
    // 8A 14:30–15:10, 8B 15:20–16:00 (advisory/TA)
  },
};

// day_of_week: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri
const PERIOD_DAYS: Record<number, Array<{ day: number; type: DayType }>> = {
  1: [{ day: 0, type: "anchor" }, { day: 1, type: "blue" }, { day: 3, type: "blue" }],
  2: [{ day: 0, type: "anchor" }, { day: 1, type: "blue" }, { day: 3, type: "blue" }],
  3: [{ day: 0, type: "anchor" }, { day: 1, type: "blue" }, { day: 3, type: "blue" }],
  4: [{ day: 0, type: "anchor" }, { day: 1, type: "blue" }, { day: 3, type: "blue" }],
  5: [{ day: 0, type: "anchor" }, { day: 2, type: "red" }, { day: 4, type: "red" }],
  6: [{ day: 0, type: "anchor" }, { day: 2, type: "red" }, { day: 4, type: "red" }],
  7: [{ day: 0, type: "anchor" }, { day: 2, type: "red" }, { day: 4, type: "red" }],
};

function parseTimeString(raw: string): string | null {
  const match = raw.trim().match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const period = match[3]?.toLowerCase();
  if (period === "pm" && h !== 12) h += 12;
  if (period === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function classColor(period: number): string {
  const COLORS = [
    "#f97316", "#38bdf8", "#a855f7", "#22c55e",
    "#f43f5e", "#eab308", "#06b6d4", "#ec4899",
  ];
  return COLORS[(period - 1) % COLORS.length];
}

export type ImportedItem = NewScheduleItem & {
  source: string;
  source_id: string | null;
  due_date: string | null;
};

// ── StudentVUE grade result types ──────────────────────────

export type FcpsCourseType = "standard" | "ap" | "honors" | "ib" | "de" | "av";

export interface CourseGradeResult {
  courseName: string;
  period: number;
  gradePct: number | null;
  letterGrade: string | null;
  courseType: FcpsCourseType;
}

/** Detect FCPS course type from name (AP, HN, IB, DE, AV) */
function detectCourseType(name: string): FcpsCourseType {
  if (/\bAP\b/.test(name)) return "ap";
  if (/\bIB\b/.test(name)) return "ib";
  if (/\bDE\b|Dual Enrollment/i.test(name)) return "de";
  if (/\bHN\b|\bHonors?\b/i.test(name)) return "honors";
  if (/\bAV\b/.test(name)) return "av";
  return "standard";
}

// ── StudentVUE scraper ─────────────────────────────────────
// FCPS uses a custom override login page (PXP2_Login_Student_OVR.aspx) with
// non-standard ASP.NET field IDs. All other Synergy districts use the standard
// PXP2_Login_Student.aspx page with #txtUserName / #txtPassword / #btnLogin.

function isFcps(districtUrl: string): boolean {
  return districtUrl.includes("fcps.edu");
}

function svueLoginUrl(districtUrl: string): string {
  const base = districtUrl.replace(/\/$/, "");
  const page = isFcps(districtUrl)
    ? "PXP2_Login_Student_OVR.aspx"
    : "PXP2_Login_Student.aspx";
  return `${base}/${page}?regenerateSessionId=True`;
}

function svueGradebookUrl(districtUrl: string): string {
  const base = districtUrl.replace(/\/$/, "");
  return `${base}/PXP2_Gradebook.aspx`;
}

function svueClassScheduleUrl(districtUrl: string): string {
  const base = districtUrl.replace(/\/$/, "");
  return `${base}/PXP2_ClassSchedule.aspx?AGU=0`;
}

// Fills the StudentVUE login form and submits.
// All Synergy districts (FCPS OVR page and standard PXP2_Login_Student.aspx)
// use the same ctl00_MainContent_* field IDs.
async function loginToSvuePage(
  page: import("puppeteer-core").Page,
  _districtUrl: string,
  username: string,
  password: string
): Promise<void> {
  await page.waitForSelector("#ctl00_MainContent_username", { timeout: 15_000 });
  await page.click("#ctl00_MainContent_username", { clickCount: 3 });
  await page.type("#ctl00_MainContent_username", username, { delay: 40 });
  await page.click("#ctl00_MainContent_password", { clickCount: 3 });
  await page.type("#ctl00_MainContent_password", password, { delay: 40 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 }),
    page.click("#ctl00_MainContent_Submit1"),
  ]);
}

// ── StudentVUE login test (no scraping, no saves) ──────────

export async function testStudentVueLogin(
  districtUrl: string,
  username: string,
  password: string
): Promise<{ studentName: string }> {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  try {
    await page.goto(svueLoginUrl(districtUrl), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await sleep(1000);

    await loginToSvuePage(page, districtUrl, username, password);

    const errorText = await page
      .$eval("#ctl00_MainContent_ErrorLabel, #divisionError, .error-message, .alert-danger", (el: Element) =>
        el.textContent?.trim()
      )
      .catch(() => null);
    if (errorText && errorText.length > 0 && errorText.length < 300) {
      throw new Error(`Invalid credentials: ${errorText}`);
    }

    if (page.url().toLowerCase().includes("login")) {
      throw new Error("Invalid credentials: still on login page. Check your Student ID and password.");
    }

    // Try to get the student's name from the page header
    const studentName = await page
      .evaluate(() => {
        const candidates = [
          document.querySelector(".student-name"),
          document.querySelector(".user-name"),
          document.querySelector("#studentName"),
          document.querySelector("[class*='student'] [class*='name']"),
        ];
        for (const el of candidates) {
          const text = (el as HTMLElement | null)?.innerText?.trim();
          if (text) return text;
        }
        // Fall back to page title — often "StudentVUE - Firstname Lastname"
        const title = document.title ?? "";
        const match = title.match(/[-–]\s*(.+)$/);
        return match ? match[1].trim() : "";
      })
      .catch(() => "");

    logger.info(`StudentVUE test login: success for ${username}, name="${studentName}"`);
    return { studentName };
  } finally {
    await browser.close();
  }
}

export async function scrapeStudentVue(
  districtUrl: string,
  username: string,
  password: string
): Promise<ImportedItem[]> {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  try {
    // ── Login ──────────────────────────────────────────────
    logger.info("StudentVUE: navigating to login page");
    await page.goto(svueLoginUrl(districtUrl), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await sleep(1000);

    await loginToSvuePage(page, districtUrl, username, password);

    // Check for login error
    const errorText = await page
      .$eval("#ctl00_MainContent_ErrorLabel, #divisionError, .error-message, .alert-danger", (el: Element) =>
        el.textContent?.trim()
      )
      .catch(() => null);
    if (errorText && errorText.length > 0 && errorText.length < 300) {
      throw new Error(`Login failed: ${errorText}`);
    }

    // Confirm we left the login page
    if (page.url().toLowerCase().includes("login")) {
      throw new Error("Login failed: still on login page. Check your student ID and password.");
    }

    logger.info("StudentVUE: login successful, at " + page.url());

    // Single page load — scrape both classes and assignments from gradebook
    const items = await scrapeGradebookPage(page, districtUrl);
    logger.info(`StudentVUE: ${items.length} total items scraped`);
    return items;
  } finally {
    await browser.close();
  }
}

// ── Scrape grades from StudentVUE gradebook ───────────────
// Returns the current course grade (%) and letter for each class.
// FCPS StudentVUE (Synergy) shows grades on PXP2_Gradebook.aspx.

export async function scrapeStudentVueGrades(
  districtUrl: string,
  username: string,
  password: string
): Promise<CourseGradeResult[]> {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  try {
    // ── Login ──────────────────────────────────────────────
    logger.info("StudentVUE grades: logging in");
    await page.goto(svueLoginUrl(districtUrl), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await sleep(1000);

    await loginToSvuePage(page, districtUrl, username, password);

    if (page.url().toLowerCase().includes("login")) {
      throw new Error("Invalid credentials");
    }

    // ── Navigate to gradebook ─────────────────────────────
    logger.info("StudentVUE grades: loading gradebook");
    await page.goto(svueGradebookUrl(districtUrl), {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await sleep(2500);

    // ── Extract course grades ─────────────────────────────
    const rawCourses = await page.evaluate((): Array<{
      period: number;
      courseName: string;
      gradePct: number | null;
      letterGrade: string | null;
    }> => {
      const results: Array<{
        period: number;
        courseName: string;
        gradePct: number | null;
        letterGrade: string | null;
      }> = [];

      // ── DOM approach: look for table rows or course containers ──
      const extractFromDom = (): boolean => {
        // Synergy renders each course in a row; grades are often in a <span> or <td>
        // Try common selectors across Synergy versions
        const rows = Array.from(
          document.querySelectorAll(
            ".gb_MarkingPeriod, [class*='course-row'], table.sg-asp-table tr, " +
            ".sg-content-grid tr, table[class*='gb'] tr, .pxp-grid-row"
          )
        );

        for (const row of rows) {
          const text = (row as HTMLElement).innerText ?? "";
          // Period: look for "N:" or standalone digit at start
          const periodMatch = text.match(/\b(\d{1,2}):/);
          if (!periodMatch) continue;
          const period = parseInt(periodMatch[1], 10);
          if (period < 1 || period > 10) continue;

          // Grade: look for percentage (0–100.0)
          const pctMatch = text.match(/\b(\d{1,3}(?:\.\d{1,2})?)\s*%?\s*([A-F][+-]?)?/);
          const letterMatch = text.match(/\b([A-F][+-]?)\s+(\d{1,3}(?:\.\d{1,2})?)/);

          let gradePct: number | null = null;
          let letterGrade: string | null = null;

          if (letterMatch) {
            letterGrade = letterMatch[1];
            const n = parseFloat(letterMatch[2]);
            if (n >= 0 && n <= 100) gradePct = n;
          } else if (pctMatch) {
            const n = parseFloat(pctMatch[1]);
            if (n >= 0 && n <= 100) {
              gradePct = n;
              if (pctMatch[2]) letterGrade = pctMatch[2];
            }
          }

          // Course name: the longest text segment that doesn't look like a number
          const parts = text.split(/\n|\t/).map((s) => s.trim()).filter((s) => s.length > 3);
          const courseName = parts.find(
            (p) => !p.match(/^\d/) && !p.includes("Room:") && p.length < 200
          ) ?? "";
          if (!courseName) continue;

          results.push({ period, courseName, gradePct, letterGrade });
        }
        return results.length > 0;
      };

      if (extractFromDom()) return results;

      // ── Text-based fallback: parse innerText line-by-line ──
      const lines = (document.body.innerText ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      // "N: Course Name" starts a course block
      for (let i = 0; i < lines.length; i++) {
        const courseMatch = lines[i].match(/^(\d{1,2}):\s*(.+)/);
        if (!courseMatch) continue;
        const period = parseInt(courseMatch[1], 10);
        if (period < 1 || period > 10) continue;
        const courseName = courseMatch[2].trim();

        let gradePct: number | null = null;
        let letterGrade: string | null = null;

        // Scan the next 15 lines for a grade-like value
        for (let j = i + 1; j < Math.min(i + 16, lines.length); j++) {
          const line = lines[j];
          // Stop at next course header
          if (/^\d{1,2}:\s+\S/.test(line)) break;
          // Skip teacher / room line
          if (line.includes("Room:")) continue;

          // "A 97.5" or "A- 91.2"
          const m1 = line.match(/^([A-F][+-]?)\s+(\d{1,3}(?:\.\d{1,2})?)%?$/);
          if (m1) {
            letterGrade = m1[1];
            gradePct = parseFloat(m1[2]);
            break;
          }
          // "97.5 A" or "97.5% A-" or just "97.5"
          const m2 = line.match(/^(\d{1,3}(?:\.\d{1,2})?)%?\s*([A-F][+-]?)?$/);
          if (m2) {
            const n = parseFloat(m2[1]);
            if (n >= 0 && n <= 100) {
              gradePct = n;
              if (m2[2]) letterGrade = m2[2];
              break;
            }
          }
          // "Grade: A (97.5)" style
          const m3 = line.match(/Grade:\s*([A-F][+-]?)\s*\(?(\d{1,3}(?:\.\d{1,2})?)/i);
          if (m3) {
            letterGrade = m3[1];
            gradePct = parseFloat(m3[2]);
            break;
          }
        }

        results.push({ period, courseName, gradePct, letterGrade });
      }

      return results;
    });

    logger.info(`StudentVUE grades: found ${rawCourses.length} courses`);

    return rawCourses.map((c) => ({
      ...c,
      courseType: detectCourseType(c.courseName),
    }));
  } finally {
    await browser.close();
  }
}

// ── Scrape gradebook for classes + assignments ────────────
// Page text structure:
//   "N: Course Name\nTeacher Name  Room: ROOM\n..."  (course headers)
//   "Assignment Name\nTeacher, F Course Name(N)\nDue Date: MM/DD/YYYY\nScore: ..."

async function scrapeGradebookPage(page: Page, districtUrl: string): Promise<ImportedItem[]> {
  // Use the Class Schedule page — cleaner structure than the gradebook
  logger.info("StudentVUE: loading class schedule");
  await page.goto(svueClassScheduleUrl(districtUrl), {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  await sleep(1500);

  const { courses } = await page.evaluate((): {
    courses: Array<{ period: number; name: string; teacher: string; room: string }>;
  } => {
    // Split page text into clean lines
    const lines = (document.body.innerText ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const courses: Array<{ period: number; name: string; teacher: string; room: string }> = [];

    // ── Parse courses ─────────────────────────────────────────────────────────
    // Class Schedule format (PXP2_ClassSchedule.aspx):
    //   "01: 2219T1 Ancnt & Clas Civ TJ HN - 2219T1-02"
    //   "Yi, Haywon"         ← teacher (separate line, may be a link)
    //   "Room: 239"          ← room (separate line)
    for (let i = 0; i < lines.length; i++) {
      const courseMatch = lines[i].match(/^(\d{1,2}):\s*(.+)/);
      if (!courseMatch) continue;
      const period = parseInt(courseMatch[1], 10);
      if (period < 1 || period > 10) continue;

      // Strip trailing section code " - XXXX-NN" to get a clean display name
      const rawName = courseMatch[2].trim();
      const name = rawName.replace(/\s+-\s+[\w-]+$/, "").trim() || rawName;

      // Next line is the teacher name; the line after may be "Room: X"
      // Handle both "Teacher  Room: X" (same line) and separate-line formats
      let teacher = "";
      let room = "";

      const next1 = lines[i + 1] ?? "";
      const next2 = lines[i + 2] ?? "";

      // Same-line format: "Last, First  Room: 239"
      const sameLine = next1.match(/^(.+?)\s{2,}Room:\s*(\S+)/);
      if (sameLine) {
        teacher = sameLine[1].trim();
        room = sameLine[2].trim();
      } else {
        // Separate-line format
        if (!next1.startsWith("Room:") && !next1.match(/^\d{1,2}:/)) {
          teacher = next1;
        }
        const roomLine = next1.startsWith("Room:") ? next1 : next2;
        const roomMatch = roomLine.match(/Room:\s*(\S+)/);
        if (roomMatch) room = roomMatch[1].trim();
      }

      courses.push({ period, name, teacher, room });
    }

    return { courses };
  });

  logger.info(`StudentVUE: ${courses.length} courses`);

  const items: ImportedItem[] = [];

  // ── Classes (TJ block schedule) ──────────────────────────
  // Periods 1–4: Monday (anchor) + Tuesday + Thursday (blue)
  // Periods 5–7: Monday (anchor) + Wednesday + Friday (red)
  for (const c of courses) {
    const occurrences = PERIOD_DAYS[c.period] ?? [];
    for (const { day, type } of occurrences) {
      const times = TJ_TIMES[type][c.period];
      if (!times) continue;
      items.push({
        title: c.name,
        category: "class",
        day_of_week: day,
        start_time: times.start,
        end_time: times.end,
        color: classColor(c.period),
        location: c.room || null,
        notes: c.teacher ? `Teacher: ${c.teacher}` : null,
        source: "studentvue",
        source_id: `${c.name}-p${c.period}-d${day}`,
        source_file: null,
        due_date: null,
      });
    }
  }

  return items;
}

// ── Schoology / Google SSO scraper ─────────────────────────
// Navigates to lms.fcps.edu, automates Google SSO login,
// then scrapes upcoming assignments.

export async function scrapeSchoology(
  host: string,
  username: string,
  password: string
): Promise<ImportedItem[]> {
  // ── Global timeout: Vercel maxDuration is 300 s — bail at 270 s ──
  const scrapeWithTimeout = async (): Promise<ImportedItem[]> => {
    const browser = await launchBrowser();
    // Use `let` so we can reassign when ClassLink opens a new tab
    let page = await browser.newPage();

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    // Register new-tab collector VERY EARLY — before any click that might open a tab.
    // On Vercel the targetcreated event can fire before a late-registered listener.
    const allNewTabs: import("puppeteer-core").Page[] = [];
    let newTabResolve: ((p: import("puppeteer-core").Page) => void) | null = null;
    const newTabPromise = new Promise<import("puppeteer-core").Page>((resolve) => {
      newTabResolve = resolve;
    });
    browser.on("targetcreated", async (target) => {
      const p = await target.page();
      if (p) {
        allNewTabs.push(p);
        if (newTabResolve) { newTabResolve(p); newTabResolve = null; }
      }
    });

    try {
      if (host.includes("lcps.org")) {
        // ── LCPS: ClassLink → Schoology → Microsoft OAuth ────────────
        // Step 1: Login to ClassLink portal
        logger.info("Schoology: LCPS — navigating to ClassLink");
        await Promise.race([
          page.goto("https://login.classlink.com/my/loudoun", { waitUntil: "domcontentloaded", timeout: 45_000 }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("ClassLink goto timeout")), 50_000)),
        ]);
        logger.info(`Schoology: ClassLink page at ${page.url()}`);

        // Wait for the Angular-rendered login form (may take a moment after DOMContentLoaded)
        await page.waitForSelector("#username", { timeout: 20_000 }).catch(async () => {
          // If still not found, try renavigating with networkidle2 and waiting longer
          logger.info(`Schoology: #username not found after domcontentloaded, retrying with networkidle2`);
          await page.goto("https://login.classlink.com/my/loudoun", { waitUntil: "networkidle2", timeout: 45_000 });
          await page.waitForSelector("#username", { timeout: 20_000 });
        });
        logger.info(`Schoology: ClassLink page ready, url=${page.url()}`);

        // Find and fill username field (no @lcps.org domain for ClassLink)
        const clUser = username.split("@")[0];
        const unSel = await page.evaluate(() => {
          if (document.querySelector("#username")) return "#username";
          if (document.querySelector("input[name='username']")) return "input[name='username']";
          if (document.querySelector("input[type='text']")) return "input[type='text']";
          if (document.querySelector("input[type='email']")) return "input[type='email']";
          return null;
        });
        if (!unSel) throw new Error("ClassLink: username field not found on page");
        logger.info(`Schoology: ClassLink username selector=${unSel}`);
        await page.type(unSel, clUser, { delay: 50 });

        const clPwdEl = await page.$("input[type='password']");
        if (clPwdEl) await clPwdEl.type(password, { delay: 50 });
        logger.info(`Schoology: ClassLink credentials filled (user=${clUser})`);

        // Click Sign In and wait for launchpad navigation
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => {}),
          page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll("button, input[type='submit']")).find(
              b => /sign.?in|log.?in/i.test((b as HTMLElement).innerText || (b as HTMLInputElement).value || "")
            ) as HTMLElement | null;
            if (btn) btn.click();
          }),
        ]);
        await sleep(2000);
        logger.info(`Schoology: after ClassLink login, url=${page.url()}`);

        // Step 2: Click Schoology tile — ClassLink opens it in a NEW TAB
        // Wait for launchpad tiles to fully render before clicking.
        // After login ClassLink may redirect through /oauth?code=... before landing on /home,
        // so wait for the URL to settle on /home first.
        for (let w = 0; w < 10; w++) {
          const cu = page.url();
          if (cu.includes("/home")) break;
          logger.info(`Schoology: waiting for launchpad /home, url=${cu}`);
          await sleep(1500);
          // If still on oauth redirect, wait for next navigation
          if (cu.includes("/oauth")) {
            await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10_000 }).catch(() => {});
          }
        }
        logger.info(`Schoology: launchpad ready, url=${page.url()}`);

        // Wait for Angular-rendered app tiles — try broader selector set with more time on Vercel
        const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
        const tileSelectorTimeout = isServerless ? 30_000 : 20_000;
        await page.waitForSelector(
          "[aria-label*='schoology' i], [title*='schoology' i], a[href*='schoology'], img[alt*='schoology' i], [aria-label='schoology'], img[alt='schoology']",
          { timeout: tileSelectorTimeout }
        ).catch(() => {
          logger.info("Schoology: tile selector wait timed out, attempting click anyway");
        });
        // Extra sleep on serverless to let SPA fully hydrate
        await sleep(isServerless ? 3000 : 1000);

        // Attempt tile click — retry up to 3 times with increasing wait if not found
        let clickedSchoology: string | false = false;
        for (let attempt = 0; attempt < 3 && !clickedSchoology; attempt++) {
          if (attempt > 0) {
            logger.info(`Schoology: tile click attempt ${attempt + 1}, waiting 3s for SPA render`);
            await sleep(3000);
          }
          clickedSchoology = await page.evaluate(() => {
            // Try clickable elements first (a, button, role=button)
            const el = Array.from(document.querySelectorAll("a, button, [role='button']")).find(e => {
              const text = ((e as HTMLElement).textContent ?? "").toLowerCase();
              const aria = (e.getAttribute("aria-label") ?? "").toLowerCase();
              const title = (e.getAttribute("title") ?? "").toLowerCase();
              const href = (e.getAttribute("href") ?? "").toLowerCase();
              return text.includes("schoology") || aria.includes("schoology") || title.includes("schoology") || href.includes("schoology");
            });
            if (el) { (el as HTMLElement).click(); return "link"; }
            // Fallback: any element (including custom elements like <application>) with Schoology text/aria
            const any = Array.from(document.querySelectorAll("*")).find(e =>
              ((e as HTMLImageElement).alt ?? "").toLowerCase().includes("schoology") ||
              (e.getAttribute("title") ?? "").toLowerCase().includes("schoology") ||
              (e.getAttribute("aria-label") ?? "").toLowerCase().includes("schoology")
            );
            if (any) { (any as HTMLElement).click(); return "fallback-aria"; }
            return false;
          }) as string | false;
        }
        logger.info(`Schoology: ClassLink Schoology clicked=${clickedSchoology}`);

        // Wait up to 15 s for the new tab (or pick one already captured by the early listener)
        let newTab: import("puppeteer-core").Page | null = allNewTabs[0] ?? null;
        if (!newTab) {
          newTab = await Promise.race([
            newTabPromise,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000)),
          ]);
        }

        if (newTab) {
          logger.info(`Schoology: new tab opened, url=${newTab.url()}`);
          page = newTab;
          await page.bringToFront();
          await sleep(2000);
          logger.info(`Schoology: switched to new tab, url=${page.url()}`);
        } else {
          logger.info(`Schoology: no new tab, still on ${page.url()}`);
          // Fallback: if the tile click didn't open a new tab and we're still
          // on the ClassLink launchpad, navigate directly to the Schoology host.
          // ClassLink has set an auth session, so the host will SSO transparently.
          const currentPageUrl = page.url();
          if (currentPageUrl.includes("classlink.com") || currentPageUrl.includes("launchpad.com")) {
            logger.info(`Schoology: tile click fallback — navigating directly to https://${host}`);
            await Promise.race([
              page.goto(`https://${host}`, { waitUntil: "domcontentloaded", timeout: 30_000 }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("LCPS direct goto timeout (35 s)")), 35_000)
              ),
            ]);
            await sleep(1500);
            logger.info(`Schoology: fallback goto completed, url=${page.url()}`);
          }
        }

        // Step 3: Handle "Continue to website" and any other ClassLink intermediates.
        // IMPORTANT: after clicking "Continue to website" the page may do a same-page hash
        // navigation (#) before the real cross-origin redirect.  waitForNavigation will often
        // timeout on that hash change.  Instead we poll the URL ourselves with a short sleep.
        for (let i = 0; i < 10; i++) {
          const cu = page.url();
          logger.info(`Schoology: continue-loop ${i}: url=${cu}`);
          if (!cu.includes("classlink.com") && !cu.includes("launchpad.com")) break;
          const btnText = await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll("a, button, [role='button']")).find(
              b => /continue|website|launch|proceed|open/i.test((b as HTMLElement).innerText ?? "")
            );
            if (btn) { (btn as HTMLElement).click(); return (btn as HTMLElement).innerText.trim(); }
            return null;
          });
          if (btnText) {
            logger.info(`Schoology: continue-loop clicked "${btnText}"`);
            // Poll URL every 500 ms for up to 20 s instead of waitForNavigation
            // (hash-change redirects don't fire navigation events)
            const beforeUrl = page.url();
            for (let p2 = 0; p2 < 40; p2++) {
              await sleep(500);
              const afterUrl = page.url();
              if (afterUrl !== beforeUrl && !afterUrl.endsWith("#")) {
                logger.info(`Schoology: continue-loop URL changed to ${afterUrl}`);
                break;
              }
            }
            await sleep(500);
          } else {
            logger.info(`Schoology: continue-loop no button, waiting`);
            await sleep(2000);
          }
        }
        logger.info(`Schoology: ClassLink done, url=${page.url()}`);
        // Fall through — now on Microsoft OAuth or directly on Schoology

      } else {
        // ── Non-LCPS: navigate directly to host ──────────────────────
        logger.info(`Schoology: navigating to https://${host}`);
        await Promise.race([
          page.goto(`https://${host}`, { waitUntil: "domcontentloaded", timeout: 30_000 }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("page.goto hard timeout (35 s)")), 35_000)
          ),
        ]);
        logger.info(`Schoology: goto completed, url=${page.url()}`);
        await sleep(1500);
      }

      const ssoUrl = page.url();
      logger.info(`Schoology: at SSO check, url=${ssoUrl}`);

      // ── SSO login ─────────────────────────────────────────
      if (!page.url().includes(host)) {
        const currentUrl = page.url();
        logger.info(`Schoology: SSO page at ${currentUrl}`);

        if (currentUrl.includes("sso.fcps.edu")) {
          // ── FCPS SAML SSO ──────────────────────────────────
          await page.waitForSelector("#floatingLabelInput35, input[type='text']", { timeout: 10_000 });
          const userEl = await page.$("#floatingLabelInput35") ?? await page.$("input[type='text']");
          if (!userEl) throw new Error("Could not find username field on FCPS SSO page.");
          await userEl.click({ clickCount: 3 });
          await userEl.type(username, { delay: 40 });

          const passEl = await page.$("#floatingLabelInput40") ?? await page.$("input[type='password']");
          if (!passEl) throw new Error("Could not find password field on FCPS SSO page.");
          await passEl.click({ clickCount: 3 });
          await passEl.type(password, { delay: 40 });

          await Promise.all([
            page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {}),
            page.evaluate(function() {
              var btn =
                document.querySelector("#loginButton_0") ||
                document.querySelector("button[type='submit']") ||
                Array.from(document.querySelectorAll("button")).find(function(b) {
                  return (b as HTMLElement).innerText.trim().toLowerCase() === "login";
                });
            if (btn) (btn as HTMLElement).click();
          }),
        ]);
        await sleep(2000);

      } else if (currentUrl.includes("microsoftonline.com") || currentUrl.includes("login.windows.net") || currentUrl.includes("microsoft.com/adfs")) {
        // ── Microsoft two-step SSO ──────────────────────────
        // Microsoft uses a SPA — DOM nodes get replaced between steps, so we use
        // page.evaluate() to click by selector string in the browser context (no
        // stale ElementHandle references).

        // Step 1: email — use native setter + InputEvent so React registers the value
        // on both new and old headless (page.type() can double on old headless Chromium)
        logger.info("MS SSO step 1: waiting for email field");
        await page.waitForSelector("input[name='loginfmt']", { timeout: 15_000 });
        await sleep(500);
        await page.focus("input[name='loginfmt']");
        await page.evaluate((u: string) => {
          const el = document.querySelector("input[name='loginfmt']") as HTMLInputElement | null;
          if (!el) return;
          const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
          if (nativeSetter) nativeSetter.call(el, u); else el.value = u;
          el.dispatchEvent(new InputEvent("input",  { bubbles: true, data: u, inputType: "insertText" }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }, username);
        await sleep(300);
        const emailLen = await page.evaluate(() => {
          const el = document.querySelector("input[name='loginfmt']") as HTMLInputElement | null;
          return el ? el.value.length : -1;
        });
        logger.info(`MS SSO step 1: email set, field length=${emailLen}`);
        logger.info("MS SSO step 1: clicking Next");
        await page.waitForSelector("#idSIButton9", { timeout: 8_000 }).catch(() => {});
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {}),
          page.click("#idSIButton9"),
        ]);
        logger.info(`MS SSO step 1: after Next, url=${page.url()}`);

        // Step 2: password — wait for either the standard passwd field or a generic
        // password input (ADFS / older tenants may use a different name attribute)
        const passwdSel = "input[name='passwd'], input[type='password']";
        await page.waitForSelector(passwdSel, { timeout: 20_000, visible: true });
        logger.info(`MS SSO step 2: password field visible at ${page.url()}`);
        await sleep(500);

        // CDP focus — guaranteed to work in all headless modes
        const passwdActualSel = await page.evaluate(() =>
          document.querySelector("input[name='passwd']") ? "input[name='passwd']" : "input[type='password']"
        ) as string;
        await page.focus(passwdActualSel);
        await sleep(300);

        // Set the value via native setter + InputEvent (React ≥16 requires InputEvent,
        // not plain Event, to update its internal fiber state)
        await page.evaluate((p: string, sel: string) => {
          const el = document.querySelector(sel) as HTMLInputElement | null;
          if (!el) return;
          const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
          if (nativeSetter) nativeSetter.call(el, p); else el.value = p;
          el.dispatchEvent(new InputEvent("input",  { bubbles: true, data: p, inputType: "insertText" }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }, password, passwdActualSel);
        await sleep(300);

        const pwdLen = await page.evaluate((sel: string) => {
          const el = document.querySelector(sel) as HTMLInputElement | null;
          return el ? el.value.length : -1;
        }, passwdActualSel);
        logger.info(`MS SSO step 2: password set, field length=${pwdLen}`);

        // Fallback: if native setter didn't register, type character-by-character
        if (pwdLen !== password.length) {
          logger.info(`MS SSO step 2: length=${pwdLen} !== expected ${password.length}, falling back to keyboard.type`);
          await page.focus(passwdActualSel);
          await page.keyboard.down("Control");
          await page.keyboard.press("a");
          await page.keyboard.up("Control");
          await page.keyboard.press("Backspace");
          await sleep(100);
          await page.keyboard.type(password, { delay: 40 });
          await sleep(200);
          const pwdLen2 = await page.evaluate((sel: string) => {
            const el = document.querySelector(sel) as HTMLInputElement | null;
            return el ? el.value.length : -1;
          }, passwdActualSel);
          logger.info(`MS SSO step 2: after keyboard fallback, field length=${pwdLen2}`);
        }
        await sleep(400);

        // (c) Submit: click button (most reliable for Microsoft's SPA)
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {}),
          (async () => {
            await page.click("#idSIButton9").catch(() => {});
            await sleep(200);
            await page.keyboard.press("Enter");
          })(),
        ]);
        await sleep(2500);
        logger.info(`MS SSO step 2: after submit, url=${page.url()}`);

        // Step 3: Handle Microsoft intermediate pages after password submit.
        // Possible states (in order):
        //   (a) "Trying to sign you in" — auto-submit hidden form → just wait, do NOT click
        //   (b) KMSI "Stay signed in?"  — click No (#idBtn_Back) to skip
        //   (c) Already on Schoology    — done
        // We poll the URL every 500 ms for up to 30 s. Only click when we
        // confirm we are on the KMSI page (page text contains "Stay signed in").
        // Clicking #idBtn_Back on the "Trying to sign you in" page would Cancel
        // the redirect, so we must guard with the text check.
        for (let i = 0; i < 60; i++) {
          await sleep(500);
          const u = page.url();
          const onMs =
            u.includes("microsoftonline.com") ||
            u.includes("login.windows.net") ||
            u.includes("login.microsoft.com");
          if (!onMs) {
            logger.info(`MS SSO step 3: left Microsoft at poll ${i}, url=${u}`);
            break;
          }

          // Still on Microsoft: only interact if it's the KMSI page
          const txt = await page
            .evaluate(() => document.body?.innerText?.slice(0, 120) ?? "")
            .catch(() => "");
          logger.info(`MS SSO step 3 poll ${i}: url=${u} text="${txt.replace(/\n/g, " ").slice(0, 80)}"`);

          if (txt.includes("Stay signed in")) {
            // User confirmed: clicking Yes (Stay signed in) is required for LCPS redirect
            await page.evaluate(() => {
              const yes = document.querySelector("#idSIButton9") as HTMLElement | null;
              if (yes) yes.click();
            });
            logger.info("MS SSO step 3: clicked KMSI Yes");
            await sleep(800);
          }
          // "Trying to sign you in" or any other MS page → keep polling
        }
        await sleep(500);

      } else {
        // ── Generic SSO fallback ────────────────────────────
        await page.waitForSelector("input[type='email'], input[type='text'], input[type='password']", { timeout: 10_000 });
        const userEl = await page.$("input[type='email']") ?? await page.$("input[type='text']");
        if (userEl) {
          await userEl.click({ clickCount: 3 });
          await userEl.type(username, { delay: 40 });
        }
        const passEl = await page.$("input[type='password']");
        if (passEl) {
          await passEl.click({ clickCount: 3 });
          await passEl.type(password, { delay: 40 });
        }
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {}),
          page.evaluate(function() {
            var btn = document.querySelector("button[type='submit']") || document.querySelector("input[type='submit']");
            if (btn) (btn as HTMLElement).click();
          }),
        ]);
        await sleep(2000);
      }
    }

    // ── For LCPS: after Microsoft OAuth the redirect may bounce through
    //    ClassLink before arriving at Schoology.  Run the same continue-loop
    //    we used earlier to navigate past any "Continue to website" pages.
    if (host.includes("lcps.org")) {
      for (let i = 0; i < 10; i++) {
        const cu = page.url();
        if (!cu.includes("classlink.com") && !cu.includes("launchpad.com")) break;
        logger.info(`Schoology: post-OAuth continue-loop ${i}: url=${cu}`);
        const btnText = await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll("a, button, [role='button']")).find(
            b => /continue|website|launch|proceed|open/i.test(((b as HTMLElement).innerText ?? ""))
          );
          if (btn) { (btn as HTMLElement).click(); return (btn as HTMLElement).innerText.trim(); }
          return null;
        });
        if (btnText) {
          logger.info(`Schoology: post-OAuth continue-loop clicked "${btnText}"`);
          const beforeUrl = page.url();
          for (let p2 = 0; p2 < 40; p2++) {
            await sleep(500);
            const afterUrl = page.url();
            if (afterUrl !== beforeUrl && !afterUrl.endsWith("#")) {
              logger.info(`Schoology: post-OAuth URL changed to ${afterUrl}`);
              break;
            }
          }
          await sleep(500);
        } else {
          await sleep(2000);
        }
      }
    }

    // ── Confirm we've landed on Schoology ─────────────────
    await sleep(1500);
    const landedUrl = page.url();
    logger.info(`Schoology: landed at ${landedUrl}`);

    const onAuthPage =
      landedUrl.includes("sso.fcps.edu") ||
      landedUrl.includes("microsoftonline.com") ||
      landedUrl.includes("login.windows.net") ||
      // classlink.com means we never made it out of the SSO portal
      landedUrl.includes("classlink.com");

    const onSchoologyHost = landedUrl.includes(host) || landedUrl.includes("schoology.com");

    if (onAuthPage || !onSchoologyHost) {
      const pageText = await page
        .evaluate(() => document.body?.innerText?.slice(0, 300))
        .catch(() => "");
      throw new Error(
        `Login failed — check your username and password. (${pageText.slice(0, 200)})`
      );
    }

      logger.info("Schoology: login confirmed, scraping assignments");
      return await scrapeSchoologyAssignments(page, host);
    } finally {
      await browser.close();
    }
  };

  // Vercel maxDuration is 300 s — guarantee we fail fast at 270 s
  return Promise.race([
    scrapeWithTimeout(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("scrapeSchoology: 270 s global timeout — Chromium may be OOM")),
        270_000
      )
    ),
  ]);
}

async function scrapeSchoologyAssignments(
  page: Page,
  host: string
): Promise<ImportedItem[]> {
  await page.goto(`https://${host}/home`, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });
  await sleep(2500);

  // Each upcoming assignment lives in a span.event-title containing:
  //   Line 0: assignment name
  //   Line N: "Due [Day], [Month] [Date], [Year] at [Time]"
  //   Last line: course name
  const assignments = await page.evaluate((): Array<{
    title: string;
    course: string;
    dueDate: string;
  }> => {
    const results: Array<{ title: string; course: string; dueDate: string }> = [];

    const containers = Array.from(document.querySelectorAll("span.event-title"));
    for (const rawEl of containers) {
      const el = rawEl as HTMLElement;
      const lines = el.innerText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      // Find the "Due ..." line
      const dueLine = lines.find((l) => l.startsWith("Due "));
      if (!dueLine) continue;

      // "Due Wednesday, March 25, 2026 at 8:40 am" → "March 25, 2026"
      const dateMatch = dueLine.match(
        /Due \w+,\s*(\w+ \d{1,2},\s*\d{4})/
      );
      if (!dateMatch) continue;

      const title = lines[0];
      const course = lines[lines.length - 1] !== dueLine
        ? lines[lines.length - 1]
        : "";

      results.push({ title, course, dueDate: dateMatch[1] });
    }
    return results;
  });

  logger.info(`Schoology: found ${assignments.length} upcoming assignments`);

  const EXAM_KEYWORDS = /\b(test|quiz|exam|midterm|final|assessment)\b/i;

  const items: ImportedItem[] = [];
  const seen = new Set<string>();

  for (const a of assignments) {
    const key = `${a.title}-${a.dueDate}`.slice(0, 100);
    if (seen.has(key)) continue;
    seen.add(key);

    const dueDate = new Date(a.dueDate);
    if (isNaN(dueDate.getTime())) continue;

    const jsDay = dueDate.getDay();
    const day = jsDay === 0 ? 6 : jsDay - 1;

    // Auto-detect exams/quizzes from title keywords
    const category = EXAM_KEYWORDS.test(a.title) ? "exam" : "assignment";
    const color = category === "exam" ? "#ef4444" : "#f43f5e";

    items.push({
      title: a.title,
      category,
      day_of_week: day,
      start_time: "23:00",
      end_time: "23:59",
      color,
      location: null,
      notes: a.course || null,
      source: "schoology",
      source_id: key,
      source_file: null,
      due_date: dueDate.toISOString().split("T")[0],
    });
  }
  return items;
}
