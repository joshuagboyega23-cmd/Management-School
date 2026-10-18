-- Migration: Fix TIMESTAMP columns that need timezone awareness in Neon Cloud
-- Neon PgBouncer connections can have different session timezones, so storing
-- timestamps as TIMESTAMP WITHOUT TIME ZONE causes comparison bugs across connections.
-- This migration changes the relevant columns to TIMESTAMPTZ (TIMESTAMP WITH TIME ZONE).

ALTER TABLE attempt_events
  ALTER COLUMN occurred_at TYPE TIMESTAMPTZ
  USING occurred_at AT TIME ZONE 'UTC';

ALTER TABLE batch_alerts
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
  USING created_at AT TIME ZONE 'UTC';

ALTER TABLE exam_warnings
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
  USING created_at AT TIME ZONE 'UTC';

