/**
 * StudentVUE / Synergy SOAP API client for FCPS.
 *
 * All grade data comes from a single SOAP call — no Puppeteer / browser needed.
 * Endpoint: https://sisstudent.fcps.edu/SVUE/Service/PXPCommunication.asmx
 * Method:   ProcessWebServiceRequest  (methodName = "Gradebook")
 *
 * Response XML structure:
 *   Gradebook > Courses > Course > Marks > Mark
 *                                         > GradeCalculationSummary > AssignmentGradeCalc
 *                                         > Assignments > Assignment
 */

import { logger } from "../logger";

function soapUrl(districtUrl: string): string {
  const base = districtUrl.replace(/\/$/, "");
  return `${base}/Service/PXPCommunication.asmx`;
}

// ── Public types ────────────────────────────────────────────

export type FcpsCourseType = "standard" | "ap" | "honors" | "ib" | "de" | "av";

export interface SoapAssignment {
  title: string;
  category: string;   // raw Type from XML, e.g. "summative", "formative", "hw formative"
  score: number | null;
  maxScore: number | null;
  gradedAt: string | null;  // YYYY-MM-DD
  notes: string | null;
}

export interface SoapCategoryWeight {
  type: string;
  weight: number;       // e.g. 70 or 30
  points: number;
  pointsPossible: number;
}

export interface SoapCourseGrade {
  courseName: string;
  period: number;
  teacher: string;
  room: string;
  markName: string;               // e.g. "MP2"
  gradePct: number | null;        // calculated score raw (e.g. 97.5)
  letterGrade: string | null;     // e.g. "A"
  courseType: FcpsCourseType;
  assignments: SoapAssignment[];
  categoryWeights: SoapCategoryWeight[];
}

// ── Helpers ─────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Extract all attribute key="value" pairs from a single XML opening tag string. */
function parseAttrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Match both double-quoted and single-quoted attribute values
  const re = /(\w+)="([^"]*)"|(\w+)='([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag)) !== null) {
    if (m[1]) out[m[1]] = m[2];
    else if (m[3]) out[m[3]] = m[4];
  }
  return out;
}

/** Parse "MM/DD/YYYY" → "YYYY-MM-DD", return null on failure. */
function parseDate(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/**
 * Parse "45.00 / 50.0000" → { score: 45, maxScore: 50 }.
 * Returns nulls for non-numeric / "Not Graded" values.
 */
function parsePoints(raw: string): { score: number | null; maxScore: number | null } {
  if (!raw || /not\s*graded|n\/a/i.test(raw)) return { score: null, maxScore: null };
  const slash = raw.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (slash) return { score: parseFloat(slash[1]), maxScore: parseFloat(slash[2]) };
  const single = raw.match(/^(\d+(?:\.\d+)?)$/);
  if (single) return { score: parseFloat(single[1]), maxScore: null };
  return { score: null, maxScore: null };
}

function detectCourseType(name: string): FcpsCourseType {
  if (/\bAP\b/.test(name)) return "ap";
  if (/\bIB\b/.test(name)) return "ib";
  if (/\bDE\b|Dual Enrollment/i.test(name)) return "de";
  if (/\bHN\b|\bHonors?\b/i.test(name)) return "honors";
  if (/\bAV\b/.test(name)) return "av";
  return "standard";
}

// ── XML parser ──────────────────────────────────────────────

function parseGradebook(xml: string): SoapCourseGrade[] {
  const courses: SoapCourseGrade[] = [];

  // Match every <Course ...>...</Course> block
  const courseRe = /<Course\s([^>]*)>([\s\S]*?)<\/Course>/g;
  let cm: RegExpExecArray | null;

  while ((cm = courseRe.exec(xml)) !== null) {
    const ca = parseAttrs(cm[1]);
    const courseBody = cm[2];

    const courseName = ca.Title ?? "";
    if (!courseName) continue;

    const period = parseInt(ca.Period ?? "0", 10);
    const teacher = ca.Staff ?? "";
    const room = ca.Room ?? "";

    // Grab the *first* <Mark> block (current marking period)
    const markRe = /<Mark\s([^>]*)>([\s\S]*?)<\/Mark>/;
    const mm = markRe.exec(courseBody);

    let markName = "MP";
    let gradePct: number | null = null;
    let letterGrade: string | null = null;
    const assignments: SoapAssignment[] = [];
    const categoryWeights: SoapCategoryWeight[] = [];

    if (mm) {
      const ma = parseAttrs(mm[1]);
      markName = ma.MarkName ?? "MP";
      letterGrade = ma.CalculatedScoreString || null;
      const raw = parseFloat(ma.CalculatedScoreRaw ?? "");
      if (!isNaN(raw)) gradePct = raw;

      const markBody = mm[2];

      // Category weights
      const calcRe = /<AssignmentGradeCalc\s([^>]*?)\s*\/?>/g;
      let calc: RegExpExecArray | null;
      while ((calc = calcRe.exec(markBody)) !== null) {
        const a = parseAttrs(calc[1]);
        categoryWeights.push({
          type: a.Type ?? "",
          weight: parseFloat(a.Weight ?? "0"),
          points: parseFloat(a.Points ?? "0"),
          pointsPossible: parseFloat(a.PointsPossible ?? "0"),
        });
      }

      // Individual assignments
      const assignRe = /<Assignment\s([^>]*?)\s*\/?>/g;
      let ar: RegExpExecArray | null;
      while ((ar = assignRe.exec(markBody)) !== null) {
        const a = parseAttrs(ar[1]);

        const { score, maxScore } = parsePoints(a.Points ?? "");
        // Skip completely unscored entries
        if (score === null && maxScore === null) continue;
        // Skip assignments with max = 0 (prevent divide-by-zero)
        if (maxScore !== null && maxScore === 0) continue;

        // Preserve the raw Type value so callers can see "HW Formative", etc.
        const category = (a.Type ?? "other").trim() || "other";

        const dateStr =
          parseDate(a.Date ?? "") ??
          parseDate(a.DueDate ?? "") ??
          null;

        assignments.push({
          title: (a.Measure ?? "Assignment").trim().slice(0, 250),
          category,
          score,
          maxScore,
          gradedAt: dateStr,
          notes: a.Notes?.trim() || null,
        });
      }
    }

    courses.push({
      courseName,
      period,
      teacher,
      room,
      markName,
      gradePct,
      letterGrade,
      courseType: detectCourseType(courseName),
      assignments,
      categoryWeights,
    });
  }

  logger.info(`StudentVUE SOAP: parsed ${courses.length} courses`);
  return courses;
}

// ── Public API ──────────────────────────────────────────────

export async function getStudentVueGradebook(
  districtUrl: string,
  username: string,
  password: string
): Promise<SoapCourseGrade[]> {
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ProcessWebServiceRequest xmlns="http://edupoint.com/webservices/">
      <userID>${escapeXml(username)}</userID>
      <password>${escapeXml(password)}</password>
      <parentID>0</parentID>
      <webServiceHandleName>PXPWebServices</webServiceHandleName>
      <methodName>Gradebook</methodName>
      <paramStr>&lt;Parms&gt;&lt;/Parms&gt;</paramStr>
    </ProcessWebServiceRequest>
  </soap:Body>
</soap:Envelope>`;

  logger.info(`StudentVUE SOAP: requesting gradebook for ${username}`);

  const res = await fetch(soapUrl(districtUrl), {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": "http://edupoint.com/webservices/ProcessWebServiceRequest",
    },
    body: soapEnvelope,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`SOAP request failed: ${res.status} ${res.statusText}`);
  }

  const soapText = await res.text();

  // Pull the escaped XML out of <ProcessWebServiceRequestResult>
  const match = soapText.match(
    /<ProcessWebServiceRequestResult>([\s\S]*?)<\/ProcessWebServiceRequestResult>/
  );
  if (!match) throw new Error("Unexpected SOAP response — no result element found");

  const innerXml = match[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Detect auth failure
  if (
    innerXml.includes("<RT>ERROR</RT>") ||
    /login\s+unsuccessful|invalid\s+credentials/i.test(innerXml)
  ) {
    throw new Error(
      "Invalid StudentVUE credentials — check your Student ID and password."
    );
  }

  return parseGradebook(innerXml);
}
