import "dotenv/config";
import pool from "../config/db";
import { logger } from "../logger";

const UP = `
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";

  CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Auto-update updated_at on row change
  CREATE OR REPLACE FUNCTION update_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS set_updated_at ON users;
  CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

  -- Index for email lookups
  CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

  -- ── Schedule items ────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS schedule_items (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       VARCHAR(255) NOT NULL,
    category    VARCHAR(50)  NOT NULL CHECK (category IN ('class','activity','assignment','study','other')),
    day_of_week INTEGER      NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time  TIME         NOT NULL,
    end_time    TIME         NOT NULL,
    color       VARCHAR(20)  NOT NULL,
    location    VARCHAR(255),
    notes       TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
  );

  DROP TRIGGER IF EXISTS set_updated_at_schedule ON schedule_items;
  CREATE TRIGGER set_updated_at_schedule
    BEFORE UPDATE ON schedule_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

  CREATE INDEX IF NOT EXISTS idx_schedule_items_user_id ON schedule_items (user_id);

  -- Allow Google OAuth users (no password)
  ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

  -- Phase 3: new columns on schedule_items
  ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS source     VARCHAR(50);
  ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS source_id  VARCHAR(255);
  ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS due_date   DATE;

  -- ── Connected accounts ────────────────────────────────────
  CREATE TABLE IF NOT EXISTS connected_accounts (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider              VARCHAR(50) NOT NULL,
    district_url          VARCHAR(500),
    encrypted_credentials TEXT        NOT NULL,
    last_synced_at        TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, provider)
  );

  DROP TRIGGER IF EXISTS set_updated_at_connected_accounts ON connected_accounts;
  CREATE TRIGGER set_updated_at_connected_accounts
    BEFORE UPDATE ON connected_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

  CREATE INDEX IF NOT EXISTS idx_connected_accounts_user_id ON connected_accounts (user_id);

  -- ── To-do items ───────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS todos (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text       TEXT        NOT NULL,
    completed  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos (user_id);

  -- ── File import: relax NOT NULL so assignments can omit grid columns ──────────
  ALTER TABLE schedule_items ALTER COLUMN day_of_week DROP NOT NULL;
  ALTER TABLE schedule_items ALTER COLUMN start_time  DROP NOT NULL;
  ALTER TABLE schedule_items ALTER COLUMN end_time    DROP NOT NULL;

  ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS source_file VARCHAR(255);

  -- Assignment completion tracking
  ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT FALSE;

  -- Expand category enum to include exam and project
  ALTER TABLE schedule_items DROP CONSTRAINT IF EXISTS schedule_items_category_check;
  ALTER TABLE schedule_items ADD CONSTRAINT schedule_items_category_check
    CHECK (category IN ('class','activity','assignment','study','other','exam','project'));

  -- How long a task is expected to take, in minutes. Written by
  -- createScheduleItem/updateScheduleItem and read by the daily planner to
  -- size study blocks. This column was live in the deployed database but was
  -- never added here, so every database built from this file 500'd on the
  -- first schedule-item insert.
  ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER;

  -- ── File uploads tracking ─────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS file_uploads (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename       VARCHAR(255) NOT NULL,
    mimetype       VARCHAR(100) NOT NULL,
    size_bytes     INTEGER      NOT NULL,
    extracted_text TEXT,
    ai_response    TEXT,
    items_created  INTEGER      DEFAULT 0,
    status         VARCHAR(50)  DEFAULT 'processing',
    error_message  TEXT,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_file_uploads_user_id ON file_uploads (user_id);

  -- ── Daily AI plans ────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS daily_plans (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_date     DATE NOT NULL,
    blocks        JSONB NOT NULL DEFAULT '[]',
    summary       TEXT,
    motivational  TEXT,
    warnings      JSONB DEFAULT '[]',
    stats         JSONB DEFAULT '{}',
    model_used    VARCHAR(100),
    tokens_used   INTEGER,
    generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_plans_user_date ON daily_plans(user_id, plan_date);

  -- ── User preferences for AI planning ─────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS user_preferences (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wake_time        TIME DEFAULT '07:00',
    sleep_time       TIME DEFAULT '23:00',
    study_style      VARCHAR(50) DEFAULT 'balanced',
    break_frequency  INTEGER DEFAULT 90,
    break_duration   INTEGER DEFAULT 15,
    max_study_hours  INTEGER DEFAULT 6,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  DROP TRIGGER IF EXISTS set_updated_at_user_preferences ON user_preferences;
  CREATE TRIGGER set_updated_at_user_preferences
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

  -- New preference fields for richer AI planning
  ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS commute_minutes     INTEGER DEFAULT 0;
  ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS preferred_block_length INTEGER DEFAULT 60;
  ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS hard_subjects        TEXT;
  ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS semester_load        VARCHAR(20) DEFAULT 'moderate';

  -- Summer session handling: 'auto' derives from the calendar date, 'on'/'off'
  -- let a student on a different academic calendar override it.
  ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS summer_mode          VARCHAR(10) DEFAULT 'auto';
  ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_summer_mode_check;
  ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_summer_mode_check
    CHECK (summer_mode IN ('auto','on','off'));

  -- ── Courses ────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS courses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          VARCHAR(255) NOT NULL,
    full_name     VARCHAR(500),
    credit_hours  DECIMAL(3,1) DEFAULT 3.0,
    grading_scale VARCHAR(50) DEFAULT 'standard',
    target_grade  VARCHAR(2),
    color         VARCHAR(20),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, name)
  );

  DROP TRIGGER IF EXISTS set_updated_at_courses ON courses;
  CREATE TRIGGER set_updated_at_courses
    BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

  -- ── Grades ──────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS grades (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    schedule_item_id UUID REFERENCES schedule_items(id) ON DELETE SET NULL,
    title            VARCHAR(255) NOT NULL,
    course_name      VARCHAR(255) NOT NULL,
    score            DECIMAL(6,2),
    max_score        DECIMAL(6,2),
    weight           DECIMAL(5,2) DEFAULT 1.0,
    category         VARCHAR(100),
    graded_at        DATE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  DROP TRIGGER IF EXISTS set_updated_at_grades ON grades;
  CREATE TRIGGER set_updated_at_grades
    BEFORE UPDATE ON grades
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

  CREATE INDEX IF NOT EXISTS idx_grades_user   ON grades(user_id);
  CREATE INDEX IF NOT EXISTS idx_grades_course ON grades(user_id, course_name);

  -- ── Focus sessions ──────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS focus_sessions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_block_id    VARCHAR(255),
    course_name      VARCHAR(255),
    session_type     VARCHAR(50) NOT NULL DEFAULT 'focus',
    duration_seconds INTEGER NOT NULL,
    completed        BOOLEAN DEFAULT false,
    started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at         TIMESTAMPTZ
  );

  CREATE INDEX IF NOT EXISTS idx_focus_user ON focus_sessions(user_id, started_at);

  -- ── Notification preferences ─────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS notification_preferences (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enabled                 BOOLEAN DEFAULT true,
    assignment_reminders    BOOLEAN DEFAULT true,
    daily_plan_ready        BOOLEAN DEFAULT true,
    study_reminders         BOOLEAN DEFAULT true,
    exam_warnings           BOOLEAN DEFAULT true,
    weekly_summary_email    BOOLEAN DEFAULT true,
    reminder_minutes_before INTEGER DEFAULT 15,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  DROP TRIGGER IF EXISTS set_updated_at_notif_prefs ON notification_preferences;
  CREATE TRIGGER set_updated_at_notif_prefs
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

  -- ── Push subscriptions ────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

  -- ── Scrape jobs ───────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS scrape_jobs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider     VARCHAR(50) NOT NULL,
    status       VARCHAR(20) NOT NULL DEFAULT 'running',
    result       JSONB,
    error        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
  );

  CREATE INDEX IF NOT EXISTS idx_scrape_jobs_user ON scrape_jobs(user_id, created_at DESC);

  -- ── Extracurricular plan ──────────────────────────────────────────────────
  -- Adapted from a schema written against Supabase. This project is plain
  -- Postgres behind the Express API, so two things from that version are gone:
  -- the foreign key targets public.users (there is no auth.users schema here),
  -- and the four RLS policies are omitted because auth.uid() does not exist and
  -- the API connects as a single role — enabling RLS would evaluate auth.uid()
  -- to NULL and lock every row out for everyone. Ownership is enforced in the
  -- route layer, which scopes each query by req.user.userId, as every other
  -- table here already does.
  CREATE TABLE IF NOT EXISTS ec_plan_items (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title          VARCHAR(255) NOT NULL,
    year           SMALLINT NOT NULL CHECK (year BETWEEN 9 AND 12),
    category       VARCHAR(50) NOT NULL,
    why            TEXT,
    first_step     TEXT,
    hours_per_week NUMERIC(4,1),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_ec_plan_items_user_year ON ec_plan_items (user_id, year);

  -- ── Daily AI generation cap ───────────────────────────────────────────────
  -- Read and incremented server-side before each model call, in one atomic
  -- statement (see utils/aiUsage.ts). A counter in React state is decoration,
  -- not a limit. No stored procedure: the upsert is a single statement, so it
  -- is already atomic, and this codebase keeps its logic in TypeScript rather
  -- than in plpgsql.
  --
  -- The day column uses current_date, which resolves in the database's
  -- timezone (UTC on most hosts), so the cap resets at UTC midnight rather
  -- than at the student's local midnight.
  CREATE TABLE IF NOT EXISTS ai_usage (
    user_id UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day     DATE    NOT NULL DEFAULT current_date,
    calls   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
  );

`;

async function migrate() {
  logger.info("Running migrations…");
  try {
    await pool.query(UP);
    logger.info("Migrations complete ✓");
  } catch (err) {
    logger.error("Migration failed", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
