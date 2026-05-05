import { promises as fs } from "fs";
import path from "path";

export interface ExtractedContent {
  text: string;
  type: "pdf" | "docx" | "image" | "ics" | "csv" | "text";
  icsEvents?: ICSEvent[];
  imageBase64?: string;
  imageMediaType?: "image/jpeg" | "image/png" | "image/webp";
}

export interface ICSEvent {
  title: string;
  start: string;       // ISO string or YYYY-MM-DD
  end: string | null;
  description?: string;
  location?: string;
  isAllDay: boolean;
}

// ── Main entry point ───────────────────────────────────────

export async function extractFileContent(
  filePath: string,
  mimetype: string,
  originalName: string
): Promise<ExtractedContent> {
  const ext = path.extname(originalName).toLowerCase();

  // ── PDF ───────────────────────────────────────────────────
  if (mimetype === "application/pdf" || ext === ".pdf") {
    // pdfjs-dist (used internally by pdf-parse) references DOMMatrix which is
    // browser-only. Polyfill before requiring so it doesn't throw in Node.js/Vercel.
    if (typeof (globalThis as Record<string, unknown>).DOMMatrix === "undefined") {
      (globalThis as Record<string, unknown>).DOMMatrix = class DOMMatrix {};
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (
      buf: Buffer
    ) => Promise<{ text: string }>;
    const buffer = await fs.readFile(filePath);
    const data = await pdfParse(buffer);
    return { text: data.text.slice(0, 50_000), type: "pdf" };
  }

  // ── DOCX ──────────────────────────────────────────────────
  if (
    mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === ".docx"
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return { text: result.value.slice(0, 50_000), type: "docx" };
  }

  // ── ICS calendar ──────────────────────────────────────────
  if (mimetype === "text/calendar" || ext === ".ics") {
    const content = await fs.readFile(filePath, "utf-8");
    const events = parseICSContent(content);
    const textSummary = events
      .map(
        (e) =>
          `Event: ${e.title}\nDate: ${e.start}${e.end ? " – " + e.end : ""}${
            e.location ? "\nLocation: " + e.location : ""
          }${e.description ? "\nDetails: " + e.description : ""}`
      )
      .join("\n\n");
    return {
      text: textSummary || content.slice(0, 20_000),
      type: "ics",
      icsEvents: events,
    };
  }

  // ── Images ────────────────────────────────────────────────
  if (mimetype.startsWith("image/")) {
    const sharp = (await import("sharp")).default;
    const resized = await sharp(filePath)
      .resize({ width: 1500, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return {
      text: "[IMAGE]",
      type: "image",
      imageBase64: resized.toString("base64"),
      imageMediaType: "image/jpeg",
    };
  }

  // ── CSV / plain text ──────────────────────────────────────
  const content = await fs.readFile(filePath, "utf-8");
  const type =
    mimetype === "text/csv" || ext === ".csv" ? "csv" : "text";
  return { text: content.slice(0, 50_000), type };
}

// ── ICS parser (RFC 5545, no external library) ─────────────

function parseICSContent(raw: string): ICSEvent[] {
  // Unfold continuation lines
  const content = raw
    .replace(/\r\n[ \t]/g, "")
    .replace(/\n[ \t]/g, "");

  const events: ICSEvent[] = [];
  const veventRe = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let match: RegExpExecArray | null;

  while ((match = veventRe.exec(content)) !== null) {
    const block = match[1];

    const prop = (name: string): string | null => {
      const re = new RegExp(
        `(?:^|\\n)${name}(?:;[^:]*)?:([^\\r\\n]*)`,
        "i"
      );
      const m = block.match(re);
      return m ? m[1].trim() : null;
    };

    const unescape = (s: string) =>
      s
        .replace(/\\n/gi, "\n")
        .replace(/\\,/g, ",")
        .replace(/\\;/g, ";")
        .replace(/\\\\/g, "\\");

    const summary = prop("SUMMARY");
    if (!summary) continue;

    const dtstart = prop("DTSTART");
    if (!dtstart) continue;

    const dtend = prop("DTEND");
    const description = prop("DESCRIPTION");
    const location = prop("LOCATION");
    const isAllDay = /^\d{8}$/.test(dtstart);

    events.push({
      title: unescape(summary),
      start: formatICSDate(dtstart),
      end: dtend ? formatICSDate(dtend) : null,
      description: description ? unescape(description) : undefined,
      location: location ?? undefined,
      isAllDay,
    });
  }

  return events;
}

function formatICSDate(dt: string): string {
  // Pure date: YYYYMMDD → YYYY-MM-DD
  if (/^\d{8}$/.test(dt)) {
    return `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`;
  }
  // Datetime: YYYYMMDDTHHMMSS[Z] → YYYY-MM-DDTHH:MM:SS[Z]
  if (/^\d{8}T\d{6}/.test(dt)) {
    const y = dt.slice(0, 4),
      mo = dt.slice(4, 6),
      d = dt.slice(6, 8);
    const h = dt.slice(9, 11),
      mi = dt.slice(11, 13),
      s = dt.slice(13, 15);
    return `${y}-${mo}-${d}T${h}:${mi}:${s}${dt.endsWith("Z") ? "Z" : ""}`;
  }
  return dt;
}
