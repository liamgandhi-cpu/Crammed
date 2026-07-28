import { Router, Request, Response } from "express";
import { z } from "zod";
import https from "https";
import { validate } from "../middleware/validate";
import { authenticate, signToken } from "../middleware/auth";
import {
  createUser,
  findUserByEmail,
  verifyPassword,
  findUserById,
  findOrCreateGoogleUser,
} from "../models/user";
import { logger } from "../logger";

const GOOGLE_TOKENINFO_URL = "https://www.googleapis.com/oauth2/v3/tokeninfo";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

/**
 * Assert that a Google OAuth access token was actually minted for *our* OAuth
 * client, and not for some unrelated application.
 *
 * Why this exists: the `userinfo` endpoint happily accepts ANY valid access
 * token carrying the right scopes, no matter which OAuth client it was issued
 * to. Without an audience check, an attacker holding a token that a victim
 * granted to some other site could POST it to /api/auth/google and be handed a
 * session as that victim (access-token substitution / confused deputy).
 * `tokeninfo` is the only way to recover the issuing client for an *access*
 * token — the implicit flow used by the frontend never produces an ID token,
 * so OAuth2Client.verifyIdToken() is not applicable here.
 *
 * FAIL CLOSED: every failure path below throws. If the audience cannot be
 * positively established — client ID not configured, Google unreachable,
 * non-2xx, unparseable body, missing/blank `aud` — we reject the sign-in.
 * There is deliberately no branch that falls through to trusting the token.
 */
async function assertTokenIssuedToUs(accessToken: string): Promise<void> {
  const expectedClientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!expectedClientId) {
    // Misconfiguration must never downgrade to "skip the check".
    throw new Error(
      "GOOGLE_CLIENT_ID is not configured; refusing to accept Google access tokens"
    );
  }

  let res: globalThis.Response;
  try {
    res = await fetch(
      `${GOOGLE_TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`
    );
  } catch (err) {
    // Network/DNS/TLS failure — cannot verify, so reject.
    throw new Error(
      `Google tokeninfo request failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // tokeninfo answers 400 for expired/revoked/garbage tokens.
  if (!res.ok) {
    throw new Error(`Google tokeninfo rejected the access token (HTTP ${res.status})`);
  }

  let data: { aud?: unknown };
  try {
    data = (await res.json()) as { aud?: unknown };
  } catch {
    throw new Error("Google tokeninfo returned a malformed (non-JSON) response");
  }

  const aud = typeof data.aud === "string" ? data.aud.trim() : "";
  if (!aud) {
    throw new Error("Google tokeninfo response contained no audience (aud) claim");
  }
  if (aud !== expectedClientId) {
    // The token is valid, just not ours. This is the attack being blocked.
    // `aud` is a public OAuth client ID, not a secret — safe to log.
    throw new Error(
      `Google access token audience mismatch: issued to OAuth client "${aud}"`
    );
  }
}

async function getGoogleEmail(accessToken: string): Promise<string> {
  // Audience first: never call userinfo with a token we have not tied to our
  // own OAuth client.
  await assertTokenIssuedToUs(accessToken);

  const res = await fetch(
    GOOGLE_USERINFO_URL,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error("Failed to verify Google token");
  const data = await res.json() as { email?: string; email_verified?: boolean };
  if (!data.email || !data.email_verified) throw new Error("Google account has no verified email");
  return data.email;
}

// Exported for tests: exercises the audience check without booting the server.
export { getGoogleEmail as __getGoogleEmailForTests };

const router = Router();

// ── Schemas ────────────────────────────────────────────────

const signupSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// ── POST /api/auth/signup ──────────────────────────────────

router.post(
  "/signup",
  validate(signupSchema),
  async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      const existing = await findUserByEmail(email);
      if (existing) {
        res.status(409).json({ error: "An account with this email already exists" });
        return;
      }

      const user = await createUser(email, password);
      const token = signToken({ userId: user.id, email: user.email });

      logger.info(`New user registered: ${user.email}`);
      res.status(201).json({ user, token });
    } catch (err) {
      logger.error("Signup error", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ── POST /api/auth/login ───────────────────────────────────

router.post(
  "/login",
  validate(loginSchema),
  async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      const user = await findUserByEmail(email);
      if (!user) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const token = signToken({ userId: user.id, email: user.email });
      const { password_hash, ...safeUser } = user;

      logger.info(`User logged in: ${user.email}`);
      res.json({ user: safeUser, token });
    } catch (err) {
      logger.error("Login error", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ── POST /api/auth/google ──────────────────────────────────

const googleSchema = z.object({ access_token: z.string().min(1) });

router.post(
  "/google",
  validate(googleSchema),
  async (req: Request, res: Response) => {
    try {
      const { access_token } = req.body as { access_token: string };
      const email = await getGoogleEmail(access_token);
      const user = await findOrCreateGoogleUser(email);
      const token = signToken({ userId: user.id, email: user.email });
      logger.info(`Google auth: ${user.email}`);
      res.json({ user, token });
    } catch (err) {
      logger.error("Google auth error", err);
      res.status(401).json({ error: "Google sign-in failed. Please try again." });
    }
  }
);

// ── POST /api/auth/logout ──────────────────────────────────

router.post("/logout", authenticate, (_req: Request, res: Response) => {
  // Stateless JWT — client discards token.
  // Placeholder for future token-blocklist / refresh-token revocation.
  res.json({ message: "Logged out successfully" });
});

// ── GET /api/me ────────────────────────────────────────────

router.get("/me", authenticate, async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ user });
  } catch (err) {
    logger.error("Fetch user error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
