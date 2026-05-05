import "dotenv/config";
import { createUser } from "../models/user";
import { logger } from "../logger";
import pool from "../config/db";

async function seed() {
  logger.info("Seeding database…");
  try {
    await createUser("demo@autoplanner.dev", "password123");
    logger.info("Seed user created: demo@autoplanner.dev / password123");
  } catch (err: any) {
    if (err.code === "23505") {
      logger.info("Seed user already exists, skipping");
    } else {
      throw err;
    }
  } finally {
    await pool.end();
  }
}

seed();
