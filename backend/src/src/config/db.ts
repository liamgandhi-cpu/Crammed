import { Pool } from "pg";
import { logger } from "../logger";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err) => {
  logger.error("Unexpected database pool error", err);
  if (!process.env.VERCEL) process.exit(-1);
});

export async function query(text: string, params?: unknown[]) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  logger.debug(`Query executed in ${duration}ms: ${text.substring(0, 80)}…`);
  return result;
}

export async function getClient() {
  return pool.connect();
}

export default pool;
