/**
 * Server-side daily cap on model calls.
 *
 * The cap has to live here rather than in the component that triggers a
 * generation: a counter held in React state is reset by a page refresh, and is
 * bypassed entirely by anyone calling the endpoint directly. This module is the
 * limit; the UI only reports it.
 *
 * `consumeAiCall` increments and reads in one statement, so two concurrent
 * requests from the same user cannot both observe the pre-increment value.
 */

import { query } from "../config/db";
import { logger } from "../logger";

/** Generations allowed per user per day. Override with DAILY_AI_CALL_LIMIT. */
export const DAILY_AI_CALL_LIMIT = (() => {
  const parsed = parseInt(process.env.DAILY_AI_CALL_LIMIT ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
})();

export interface AiUsage {
  /** False when this call put the user over the cap. */
  allowed: boolean;
  /** Calls recorded today, after this one. Can exceed `limit`. */
  calls: number;
  limit: number;
  /** Never negative — for display. */
  remaining: number;
}

/**
 * Count one generation against today's cap.
 *
 * Call this *before* the model call. If the model call then fails, call
 * `refundAiCall` so a server-side error doesn't cost the student a generation.
 */
export async function consumeAiCall(
  userId: string,
  limit: number = DAILY_AI_CALL_LIMIT
): Promise<AiUsage> {
  const result = await query(
    `INSERT INTO ai_usage (user_id, day, calls)
     VALUES ($1, current_date, 1)
     ON CONFLICT (user_id, day) DO UPDATE SET calls = ai_usage.calls + 1
     RETURNING calls`,
    [userId]
  );

  const calls = Number(result.rows[0].calls);
  return {
    allowed: calls <= limit,
    calls,
    limit,
    remaining: Math.max(0, limit - calls),
  };
}

/**
 * Give back a call consumed for a generation that never produced anything.
 *
 * Best-effort: a failure to refund is logged, not thrown, because it always
 * runs inside the error path of something that already failed and must not
 * replace that error with this one.
 */
export async function refundAiCall(userId: string): Promise<void> {
  try {
    await query(
      `UPDATE ai_usage SET calls = GREATEST(calls - 1, 0)
       WHERE user_id = $1 AND day = current_date`,
      [userId]
    );
  } catch (err) {
    logger.warn("Failed to refund AI call", { userId, err });
  }
}

/** Today's usage without consuming anything. */
export async function readAiUsage(
  userId: string,
  limit: number = DAILY_AI_CALL_LIMIT
): Promise<AiUsage> {
  const result = await query(
    "SELECT calls FROM ai_usage WHERE user_id = $1 AND day = current_date",
    [userId]
  );
  const calls = Number(result.rows[0]?.calls ?? 0);
  return {
    allowed: calls < limit,
    calls,
    limit,
    remaining: Math.max(0, limit - calls),
  };
}
