ALTER TABLE exams ADD COLUMN IF NOT EXISTS max_leaves SMALLINT NOT NULL DEFAULT 3 CHECK (max_leaves BETWEEN 1 AND 20);
ALTER TABLE batch_students ADD COLUMN IF NOT EXISTS code_locked_until TIMESTAMP;

ALTER TABLE attempts ALTER COLUMN submit_type TYPE VARCHAR(20);
ALTER TABLE attempts DROP CONSTRAINT IF EXISTS attempts_submit_type_check;
ALTER TABLE attempts ADD CONSTRAINT attempts_submit_type_check CHECK (submit_type IN ('MANUAL','AUTO_TIME','TEACHER','AUTO_LEAVES'));

CREATE TABLE IF NOT EXISTS batch_alerts (
  id SERIAL PRIMARY KEY,
  batch_id INT NOT NULL REFERENCES exam_batches(id) ON DELETE CASCADE,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  alert_type VARCHAR(20) NOT NULL CHECK (alert_type IN ('TAB_HIDDEN','FULLSCREEN_EXIT','WRONG_CODES','AUTO_SUBMITTED')),
  detail TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exam_warnings (
  id SERIAL PRIMARY KEY,
  attempt_id INT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  message VARCHAR(200) NOT NULL,
  sent_by INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  seen_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_batch_alerts_batch ON batch_alerts(batch_id, id);
CREATE INDEX IF NOT EXISTS idx_exam_warnings_attempt ON exam_warnings(attempt_id);

-- =============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================

ALTER TABLE batch_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_alerts FORCE ROW LEVEL SECURITY;

ALTER TABLE exam_warnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_warnings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS batch_alerts_access_policy ON batch_alerts;
CREATE POLICY batch_alerts_access_policy ON batch_alerts
FOR ALL
USING (
    current_setting('app.current_role', true) IN ('TEACHER', 'ADMIN', 'SUPERADMIN')
    OR (
        current_setting('app.current_role', true) = 'STUDENT'
        AND student_id IN (
            SELECT s.id FROM students s
            WHERE s.user_id = NULLIF(current_setting('app.current_user_id', true), '')::INT
        )
    )
);

DROP POLICY IF EXISTS exam_warnings_access_policy ON exam_warnings;
CREATE POLICY exam_warnings_access_policy ON exam_warnings
FOR ALL
USING (
    current_setting('app.current_role', true) IN ('TEACHER', 'ADMIN', 'SUPERADMIN')
    OR (
        current_setting('app.current_role', true) = 'STUDENT'
        AND attempt_id IN (
            SELECT a.id FROM attempts a
            WHERE a.student_id IN (
                SELECT s.id FROM students s
                WHERE s.user_id = NULLIF(current_setting('app.current_user_id', true), '')::INT
            )
        )
    )
);

