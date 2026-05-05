import { query } from "../config/db";
import bcrypt from "bcryptjs";

export interface User {
  id: string;
  email: string;
  password_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

export type SafeUser = Omit<User, "password_hash">;

const SALT_ROUNDS = 12;

export async function createUser(
  email: string,
  password: string
): Promise<SafeUser> {
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const result = await query(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     RETURNING id, email, created_at, updated_at`,
    [email.toLowerCase().trim(), hash]
  );
  return result.rows[0];
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await query("SELECT * FROM users WHERE email = $1", [
    email.toLowerCase().trim(),
  ]);
  return result.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<SafeUser | null> {
  const result = await query(
    "SELECT id, email, created_at, updated_at FROM users WHERE id = $1",
    [id]
  );
  return result.rows[0] ?? null;
}

export async function verifyPassword(
  plaintext: string,
  hash: string | null
): Promise<boolean> {
  if (!hash) return false; // Google-only account, no password
  return bcrypt.compare(plaintext, hash);
}

// Find user by email, or create one for Google OAuth (no password)
export async function findOrCreateGoogleUser(
  email: string
): Promise<SafeUser> {
  const existing = await findUserByEmail(email);
  if (existing) {
    const { password_hash: _, ...safe } = existing;
    return safe;
  }
  const result = await query(
    `INSERT INTO users (email) VALUES ($1)
     RETURNING id, email, created_at, updated_at`,
    [email.toLowerCase().trim()]
  );
  return result.rows[0];
}
