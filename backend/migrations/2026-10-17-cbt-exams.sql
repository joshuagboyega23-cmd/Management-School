-- 1. EXAMS (one per subject, class and term)
CREATE TABLE IF NOT EXISTS exams (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    term VARCHAR(50) NOT NULL,
    class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    created_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    duration_minutes INT NOT NULL CHECK (duration_minutes BETWEEN 5 AND 240),
    total_marks NUMERIC(5,2) NOT NULL DEFAULT 60,
    shuffle BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(12) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','CLOSED')),
    questions_locked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. QUESTIONS (maximum 60 per exam)
CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    exam_id INT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 60),
    type VARCHAR(3) NOT NULL CHECK (type IN ('MCQ','TF')),
    body_text TEXT NOT NULL,
    image_url TEXT,
    image_public_id VARCHAR(255),
    UNIQUE (exam_id, position)
);

-- 3. OPTIONS (A-D for MCQ; A=True, B=False for TF)
CREATE TABLE IF NOT EXISTS question_options (
    id SERIAL PRIMARY KEY,
    question_id INT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    label CHAR(1) NOT NULL CHECK (label IN ('A','B','C','D')),
    option_text TEXT,
    image_url TEXT,
    UNIQUE (question_id, label),
    CHECK (option_text IS NOT NULL OR image_url IS NOT NULL)
);

-- 4. ANSWER KEYS (kept apart so they are never selected by accident)
CREATE TABLE IF NOT EXISTS question_keys (
    question_id INT PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
    correct_label CHAR(1) NOT NULL CHECK (correct_label IN ('A','B','C','D'))
);

-- 5. KEY CORRECTION LOG
CREATE TABLE IF NOT EXISTS key_changes (
    id SERIAL PRIMARY KEY,
    question_id INT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    old_label CHAR(1) NOT NULL,
    new_label CHAR(1) NOT NULL,
    changed_by INT NOT NULL REFERENCES users(id),
    reason TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. BATCHES
CREATE TABLE IF NOT EXISTS exam_batches (
    id SERIAL PRIMARY KEY,
    exam_id INT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    access_code VARCHAR(8) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'LIVE' CHECK (status IN ('LIVE','ENDED')),
    started_by INT NOT NULL REFERENCES users(id),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP
);

-- 7. STUDENTS IN A BATCH
CREATE TABLE IF NOT EXISTS batch_students (
    id SERIAL PRIMARY KEY,
    batch_id INT NOT NULL REFERENCES exam_batches(id) ON DELETE CASCADE,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    status VARCHAR(12) NOT NULL DEFAULT 'WAITING'
        CHECK (status IN ('WAITING','CODE_ENTERED','WRITING','SUBMITTED','LOCKED_OUT')),
    code_attempts SMALLINT NOT NULL DEFAULT 0,
    added_late BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (batch_id, student_id)
);

-- 8. ATTEMPTS (one per student per exam)
CREATE TABLE IF NOT EXISTS attempts (
    id SERIAL PRIMARY KEY,
    exam_id INT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    batch_student_id INT NOT NULL REFERENCES batch_students(id) ON DELETE CASCADE,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deadline_at TIMESTAMP NOT NULL,
    submitted_at TIMESTAMP,
    submit_type VARCHAR(10) CHECK (submit_type IN ('MANUAL','AUTO_TIME','TEACHER')),
    shuffle_map JSONB,
    device_token VARCHAR(64) NOT NULL,
    correct_count INT,
    score NUMERIC(5,2),
    UNIQUE (exam_id, student_id)
);

-- 9. ANSWERS
CREATE TABLE IF NOT EXISTS attempt_answers (
    attempt_id INT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    question_id INT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    selected_label CHAR(1) CHECK (selected_label IN ('A','B','C','D')),
    answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (attempt_id, question_id)
);

-- 10. LEAVE-PAGE LOG
CREATE TABLE IF NOT EXISTS attempt_events (
    id SERIAL PRIMARY KEY,
    attempt_id INT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('TAB_HIDDEN','FULLSCREEN_EXIT')),
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. QUESTION RELEASE
CREATE TABLE IF NOT EXISTS exam_releases (
    exam_id INT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    released_by INT NOT NULL REFERENCES users(id),
    released_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (exam_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attempts_exam ON attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_batch_students_batch ON batch_students(batch_id);
CREATE INDEX IF NOT EXISTS idx_events_attempt ON attempt_events(attempt_id);

-- =============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR CBT TABLES
-- =============================================================

ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts FORCE ROW LEVEL SECURITY;

ALTER TABLE attempt_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempt_answers FORCE ROW LEVEL SECURITY;

ALTER TABLE question_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_keys FORCE ROW LEVEL SECURITY;

-- 1. Attempts Table Access Policy (Fail-Closed)
DROP POLICY IF EXISTS attempts_access_policy ON attempts;
CREATE POLICY attempts_access_policy ON attempts
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
    OR (
        current_setting('app.current_role', true) = 'PARENT'
        AND student_id IN (
            SELECT psl.student_id 
            FROM parent_student_links psl 
            WHERE psl.parent_user_id = NULLIF(current_setting('app.current_user_id', true), '')::INT
        )
    )
);

-- 2. Attempt Answers Table Access Policy (Fail-Closed)
DROP POLICY IF EXISTS attempt_answers_access_policy ON attempt_answers;
CREATE POLICY attempt_answers_access_policy ON attempt_answers
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
    OR (
        current_setting('app.current_role', true) = 'PARENT'
        AND attempt_id IN (
            SELECT a.id FROM attempts a
            WHERE a.student_id IN (
                SELECT psl.student_id 
                FROM parent_student_links psl 
                WHERE psl.parent_user_id = NULLIF(current_setting('app.current_user_id', true), '')::INT
            )
        )
    )
);

-- 3. Question Keys Table Access Policy (Fail-Closed, Staff Only)
DROP POLICY IF EXISTS question_keys_access_policy ON question_keys;
CREATE POLICY question_keys_access_policy ON question_keys
FOR ALL
USING (
    current_setting('app.current_role', true) IN ('TEACHER', 'ADMIN', 'SUPERADMIN')
);

