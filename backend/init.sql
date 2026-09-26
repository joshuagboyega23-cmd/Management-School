-- Idempotent schema initialization for Neon PostgreSQL (Preserves existing data)

-- 1. Create enum type safely if it does not exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'class_level') THEN 
        CREATE TYPE class_level AS ENUM ('JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'); 
    END IF; 
END $$;

-- 2. Users Table (Authentication & Core Identity)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'STUDENT' CHECK (role IN ('STUDENT', 'TEACHER', 'ADMIN', 'SUPERADMIN', 'PARENT')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (email, role)
);

-- Migration: Update users table unique constraint to composite (email, role)
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_key') THEN 
        ALTER TABLE users DROP CONSTRAINT users_email_key; 
    END IF; 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_role_key') THEN 
        ALTER TABLE users ADD CONSTRAINT users_email_role_key UNIQUE (email, role); 
    END IF; 
END $$;

-- 3. Teachers Table
CREATE TABLE IF NOT EXISTS teachers (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    staff_id VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    date_of_birth DATE NOT NULL,
    email VARCHAR(255) NOT NULL,
    subjects_taught TEXT[] DEFAULT '{}',
    invite_accepted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Idempotent column additions and constraint updates for existing teachers table
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS email VARCHAR(255);
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teachers_email_key') THEN 
        ALTER TABLE teachers DROP CONSTRAINT teachers_email_key; 
    END IF; 
END $$;

-- 4. Classes Table
CREATE TABLE IF NOT EXISTS classes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE, -- e.g. 'JSS1A'
    level class_level NOT NULL,
    arm VARCHAR(20),
    academic_session VARCHAR(50) NOT NULL, -- e.g. '2026/2027'
    homeroom_teacher_id INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Students Table
-- user_id is nullable: pre-loaded upon roster import, claimed when student self-registers
CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    admission_number VARCHAR(50) UNIQUE NOT NULL,
    class_id INT REFERENCES classes(id) ON DELETE SET NULL,
    date_of_birth DATE NOT NULL,
    guardian_phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Parent-Student Links Table (One parent can link multiple children)
CREATE TABLE IF NOT EXISTS parent_student_links (
    id SERIAL PRIMARY KEY,
    parent_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    relationship VARCHAR(50) DEFAULT 'parent',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (parent_user_id, student_id)
);

-- 7. Registration Attempts Table (Audit trail against admission guessing/impersonation)
CREATE TABLE IF NOT EXISTS registration_attempts (
    id SERIAL PRIMARY KEY,
    admission_number_entered VARCHAR(100),
    dob_entered DATE,
    matched BOOLEAN NOT NULL DEFAULT FALSE,
    attempted_role VARCHAR(50),
    ip_address VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Report Cards Table
CREATE TABLE IF NOT EXISTS report_cards (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    subject VARCHAR(100) NOT NULL,
    term VARCHAR(50) NOT NULL,
    ca_score NUMERIC(5,2) DEFAULT 0,
    exam_score NUMERIC(5,2) DEFAULT 0,
    total_score NUMERIC(5,2) DEFAULT 0,
    grade VARCHAR(5),
    remark VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Fee Payments Table (Paystack Integration)
CREATE TABLE IF NOT EXISTS fee_payments (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    reference VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    term VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Staff Payroll Table
CREATE TABLE IF NOT EXISTS payroll (
    id SERIAL PRIMARY KEY,
    staff_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    month_year VARCHAR(20) NOT NULL,
    is_paid BOOLEAN DEFAULT TRUE,
    paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE students FORCE ROW LEVEL SECURITY;

ALTER TABLE report_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_cards FORCE ROW LEVEL SECURITY;

ALTER TABLE fee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_payments FORCE ROW LEVEL SECURITY;

ALTER TABLE parent_student_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_student_links FORCE ROW LEVEL SECURITY;

-- 1. Students Table Access Policy (Fail-Closed)
DROP POLICY IF EXISTS students_access_policy ON students;
CREATE POLICY students_access_policy ON students
FOR ALL
USING (
    current_setting('app.current_role', true) IN ('TEACHER', 'ADMIN', 'SUPERADMIN')
    OR (
        current_setting('app.current_role', true) = 'STUDENT'
        AND user_id = NULLIF(current_setting('app.current_user_id', true), '')::INT
    )
    OR (
        current_setting('app.current_role', true) = 'PARENT'
        AND id IN (
            SELECT psl.student_id 
            FROM parent_student_links psl 
            WHERE psl.parent_user_id = NULLIF(current_setting('app.current_user_id', true), '')::INT
        )
    )
);

-- 2. Report Cards Table Access Policy (Fail-Closed)
DROP POLICY IF EXISTS report_cards_access_policy ON report_cards;
CREATE POLICY report_cards_access_policy ON report_cards
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

-- 3. Fee Payments Table Access Policy (Fail-Closed)
DROP POLICY IF EXISTS fee_payments_access_policy ON fee_payments;
CREATE POLICY fee_payments_access_policy ON fee_payments
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

-- 4. Parent-Student Links Table Access Policy (Fail-Closed)
DROP POLICY IF EXISTS parent_student_links_access_policy ON parent_student_links;
CREATE POLICY parent_student_links_access_policy ON parent_student_links
FOR ALL
USING (
    current_setting('app.current_role', true) IN ('ADMIN', 'SUPERADMIN')
    OR (
        current_setting('app.current_role', true) = 'PARENT'
        AND parent_user_id = NULLIF(current_setting('app.current_user_id', true), '')::INT
    )
    OR (
        current_setting('app.current_role', true) = 'STUDENT'
        AND student_id IN (
            SELECT s.id FROM students s
            WHERE s.user_id = NULLIF(current_setting('app.current_user_id', true), '')::INT
        )
    )
);

-- =============================================================
-- SEED DEFAULT SUPERADMIN (if not exists)
-- =============================================================
INSERT INTO users (full_name, email, password_hash, role)
VALUES (
    'System Administrator',
    'admin@pinnacleheights.edu.ng',
    '$2a$10$tH72EqO56.22mtWfR0u0quoxrs0sNs6ulN1Y0T/zKIUcbbFLREbEW',
    'SUPERADMIN'
)
ON CONFLICT (email) DO NOTHING;