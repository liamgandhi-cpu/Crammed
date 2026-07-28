/**
 * Error plumbing that keeps internal diagnostics out of API responses.
 *
 * Routes previously did `res.status(500).json({ error: err.message })`, which
 * forwarded whatever the exception happened to say straight to the browser.
 * In practice that surfaced things like:
 *
 *   "Could not resolve authentication method. Expected either apiKey or
 *    authToken to be set..."          (Anthropic SDK internals, shown as UI copy)
 *   "RESEND_API_KEY is not configured"  (infrastructure state)
 *   "No JSON in AI response. Got: ..."  (200 chars of raw model output)
 *   "SOAP request failed: 500 ..."      (upstream protocol detail)
 *
 * None of those are actionable for a user, and several disclose more than they
 * should. The rule here is: a message only reaches the client if it was written
 * for a user. Everything else is logged and replaced.
 */

/**
 * An error whose message was deliberately written to be read by a user.
 * Only these are forwarded verbatim.
 */
export class UserFacingError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "UserFacingError";
    this.status = status;
  }
}

/**
 * Decide what the client is allowed to see.
 *
 * @param err       the caught value, of unknown type
 * @param fallback  user-facing copy for unexpected failures. Write it as
 *                  what happened + what to do, not as a diagnosis.
 * @param fallbackStatus status to use when `err` is not user-facing
 */
export function toClientError(
  err: unknown,
  fallback: string,
  fallbackStatus = 500
): { status: number; message: string } {
  if (err instanceof UserFacingError) {
    return { status: err.status, message: err.message };
  }
  return { status: fallbackStatus, message: fallback };
}

/** The real detail, for the server log only — never for a response body. */
export function internalDetail(err: unknown): { error: string; stack?: string } {
  if (err instanceof Error) return { error: err.message, stack: err.stack };
  return { error: String(err) };
}
