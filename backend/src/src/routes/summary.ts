import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { buildWeeklySummary } from "../services/weeklySummary";
import { sendWeeklySummary } from "../services/emailService";
import { logger } from "../logger";

const router = Router();
router.use(authenticate);

// GET /api/summary/weekly
router.get("/weekly", async (req, res) => {
  const { userId, email } = req.user!;
  try {
    const summary = await buildWeeklySummary(userId, email);
    res.json({ summary });
  } catch (err) {
    logger.error("Weekly summary build error", err);
    res.status(500).json({ error: "Failed to build weekly summary" });
  }
});

// POST /api/summary/send-email
router.post("/send-email", async (req, res) => {
  const { userId, email } = req.user!;
  if (!process.env.RESEND_API_KEY) {
    res.status(503).json({ error: "Email sending is not configured on this server." });
    return;
  }
  try {
    const summary = await buildWeeklySummary(userId, email);
    await sendWeeklySummary(email, summary);
    res.json({ sent: true });
  } catch (err) {
    logger.error("Send weekly summary email error", err);
    res.status(500).json({ error: "Failed to send weekly summary email" });
  }
});

export default router;
