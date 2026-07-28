import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import rateLimit from "express-rate-limit";
import { authenticate } from "../middleware/auth";
import { query } from "../config/db";
import { extractFileContent } from "../utils/fileExtractor";
import {
  extractScheduleFromText,
  extractScheduleFromImage,
  convertICSToScheduleItems,
  type ParsedScheduleItem,
} from "../services/aiExtractor";
import { logger } from "../logger";
import { toClientError, internalDetail } from "../utils/errors";

const router = Router();
router.use(authenticate);

// ── Rate limit: 10 uploads / hour per user ─────────────────
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req: Request) => req.user?.userId ?? "anon",
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many uploads. Please wait before trying again." },
});

// ── Accepted file types ────────────────────────────────────
const ACCEPTED_MIMETYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
  "text/calendar",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ACCEPTED_EXTS = new Set([
  ".pdf", ".docx", ".txt", ".csv", ".ics",
  ".jpg", ".jpeg", ".png", ".webp",
]);

// ── Multer ─────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, "/tmp"),
  filename: (_req, _file, cb) =>
    cb(null, `upload_${Date.now()}_${randomUUID().slice(0, 8)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ACCEPTED_MIMETYPES.has(file.mimetype) || ACCEPTED_EXTS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${path.extname(file.originalname)}`));
    }
  },
});

// ── Helpers ────────────────────────────────────────────────

async function cleanupFile(filePath: string) {
  try { await fs.unlink(filePath); } catch { /* already gone */ }
}

async function createUploadRecord(
  userId: string,
  file: Express.Multer.File
): Promise<string> {
  const result = await query(
    `INSERT INTO file_uploads (user_id, filename, mimetype, size_bytes, status)
     VALUES ($1, $2, $3, $4, 'processing') RETURNING id`,
    [userId, file.originalname, file.mimetype, file.size]
  );
  return result.rows[0].id as string;
}

async function updateUploadRecord(
  id: string,
  data: {
    extractedText?: string;
    aiResponse?: string;
    itemsCreated?: number;
    status: "completed" | "failed";
    errorMessage?: string;
  }
) {
  await query(
    `UPDATE file_uploads
     SET extracted_text = COALESCE($2, extracted_text),
         ai_response    = COALESCE($3, ai_response),
         items_created  = COALESCE($4, items_created),
         status         = $5,
         error_message  = COALESCE($6, error_message)
     WHERE id = $1`,
    [
      id,
      data.extractedText ?? null,
      data.aiResponse    ?? null,
      data.itemsCreated  ?? null,
      data.status,
      data.errorMessage  ?? null,
    ]
  );
}

// ── POST /api/upload/process ───────────────────────────────
// Accepts multipart/form-data with field name "files"
// Returns preview items — does NOT save to schedule_items yet

router.post(
  "/process",
  uploadLimiter,
  (req: Request, res: Response, next: NextFunction) => {
    upload.array("files", 5)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        const msg =
          err.code === "LIMIT_FILE_SIZE"
            ? "File too large. Maximum size is 20 MB."
            : err.code === "LIMIT_FILE_COUNT"
            ? "Too many files. Maximum is 5 files at once."
            // Any other multer failure is about our config, not the upload.
            : "We couldn't accept that upload. Try a different file.";
        res.status(400).json({ error: msg });
        return;
      }
      if (err) {
        logger.error("Upload middleware error", internalDetail(err));
        res.status(400).json({ error: "We couldn't accept that upload. Try again." });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files uploaded." });
      return;
    }

    const uploadResults: Array<{
      uploadId: string;
      filename: string;
      status: string;
      error?: string;
    }> = [];
    const allParsedItems: ParsedScheduleItem[] = [];

    // Process all files in parallel
    await Promise.all(
      files.map(async (file) => {
        let uploadId: string | null = null;
        try {
          uploadId = await createUploadRecord(userId, file);

          const extracted = await extractFileContent(
            file.path,
            file.mimetype,
            file.originalname
          );

          let items: ParsedScheduleItem[];

          // ICS: skip AI — convert directly
          if (extracted.type === "ics" && extracted.icsEvents) {
            items = convertICSToScheduleItems(extracted.icsEvents, file.originalname);

          // Image: vision API
          } else if (
            extracted.type === "image" &&
            extracted.imageBase64 &&
            extracted.imageMediaType
          ) {
            const timeout = new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("AI timed out after 55s")),
                55_000
              )
            );
            items = await Promise.race([
              extractScheduleFromImage(
                extracted.imageBase64,
                extracted.imageMediaType,
                file.originalname
              ),
              timeout,
            ]);

          // Text-based: text API
          } else {
            const timeout = new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("AI timed out after 55s")),
                55_000
              )
            );
            items = await Promise.race([
              extractScheduleFromText(extracted.text, file.originalname),
              timeout,
            ]);
          }

          // Tag every item with source file
          items = items.map((item) => ({
            ...item,
            sourceFile: file.originalname,
          }));

          allParsedItems.push(...items);

          await updateUploadRecord(uploadId, {
            extractedText: extracted.text.slice(0, 10_000),
            aiResponse: JSON.stringify(items).slice(0, 10_000),
            itemsCreated: items.length,
            status: "completed",
          });

          uploadResults.push({
            uploadId,
            filename: file.originalname,
            status: "completed",
          });
        } catch (err) {
          // Extraction runs the file through the AI pipeline; its errors quote
          // model output and SDK internals, so they must not reach the client
          // or be persisted into the upload record the client reads back.
          const { message: msg } = toClientError(
            err,
            "We couldn't read this file. Try a PDF, DOCX, CSV, ICS or image.",
            400
          );
          logger.error(`Upload processing error for ${file.originalname}`, internalDetail(err));
          if (uploadId) {
            await updateUploadRecord(uploadId, {
              status: "failed",
              errorMessage: msg,
            }).catch(() => {});
          }
          uploadResults.push({
            uploadId: uploadId ?? "unknown",
            filename: file.originalname,
            status: "failed",
            error: msg,
          });
        } finally {
          await cleanupFile(file.path);
        }
      })
    );

    res.json({ uploads: uploadResults, parsedItems: allParsedItems });
  }
);

// ── POST /api/upload/confirm ───────────────────────────────
// Receives user-reviewed items and saves them to schedule_items

const VALID_CATEGORIES = new Set([
  "class", "activity", "assignment", "study", "other", "exam", "project",
]);

router.post("/confirm", async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { items } = req.body as { items: ParsedScheduleItem[] };

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "No items provided." });
    return;
  }
  if (items.length > 500) {
    res.status(400).json({ error: "Too many items (max 500)." });
    return;
  }

  try {
    const created = [];

    for (const item of items) {
      const category = VALID_CATEGORIES.has(item.category)
        ? item.category
        : "other";

      // Validate dayOfWeek if provided
      const dayOfWeek =
        item.dayOfWeek != null &&
        Number.isInteger(item.dayOfWeek) &&
        item.dayOfWeek >= 0 &&
        item.dayOfWeek <= 6
          ? item.dayOfWeek
          : null;

      const result = await query(
        `INSERT INTO schedule_items
           (user_id, title, category, day_of_week, start_time, end_time,
            color, location, notes, source, source_file, due_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'file_import',$10,$11)
         RETURNING *`,
        [
          userId,
          (item.title ?? "Untitled").slice(0, 255),
          category,
          dayOfWeek,
          item.startTime ?? null,
          item.endTime   ?? null,
          item.color     ?? "#f97316",
          item.location?.slice(0, 255) ?? null,
          item.notes?.slice(0, 1000)   ?? null,
          item.sourceFile?.slice(0, 255) ?? null,
          item.dueDate   ?? null,
        ]
      );
      created.push(result.rows[0]);
    }

    res.json({ items: created, count: created.length });
  } catch (err) {
    logger.error("Failed to confirm import", err);
    res.status(500).json({ error: "Failed to save items." });
  }
});

// ── GET /api/upload/history ────────────────────────────────

router.get("/history", async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, filename, mimetype, size_bytes, items_created, status,
              error_message, created_at
       FROM file_uploads
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user!.userId]
    );
    res.json({ uploads: result.rows });
  } catch (err) {
    logger.error("Failed to get upload history", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
