-- Idempotent schema initialization for Neon PostgreSQL
-- Drop existing tables & types in reverse dependency order
DROP TABLE IF EXISTS registration_attempts CASCADE;
DROP TABLE IF EXISTS parent_student_links CASCADE;
DROP TABLE IF EXISTS report_cards CASCADE;
DROP TABLE IF EXISTS fee_payments CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS payroll CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS teachers CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS class_level CASCADE;

-- 1. Users Table (Authentication & Core Identity)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'STUDENT' CHECK (role IN ('STUDENT', 'TEACHER', 'ADMIN', 'SUPERADMIN', 'PARENT')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Teachers Table
CREATE TABLE teachers (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    staff_id VARCHAR(50) UNIQUE NOT NULL,
    subjects_taught TEXT[] DEFAULT '{}',
    invite_accepted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Class Level Enum & Classes Table
CREATE TYPE class_level AS ENUM ('JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3');

CREATE TABLE classes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE, -- e.g. 'JSS1A'
    level class_level NOT NULL,
    arm VARCHAR(20),
    academic_session VARCHAR(50) NOT NULL, -- e.g. '2026/2027'
    homeroom_teacher_id INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Students Table
-- user_id is nullable: pre-loaded upon roster import, claimed when student self-registers
CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    admission_number VARCHAR(50) UNIQUE NOT NULL,
    class_id INT REFERENCES classes(id) ON DELETE SET NULL,
    date_of_birth DATE NOT NULL,
    guardian_phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Parent-Student Links Table (One parent can link multiple children)
CREATE TABLE parent_student_links (
    id SERIAL PRIMARY KEY,
    parent_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    relationship VARCHAR(50) DEFAULT 'parent',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (parent_user_id, student_id)
);

-- 6. Registration Attempts Table (Audit trail against admission guessing/impersonation)
CREATE TABLE registration_attempts (
    id SERIAL PRIMARY KEY,
    admission_number_entered VARCHAR(100),
    dob_entered DATE,
    matched BOOLEAN NOT NULL DEFAULT FALSE,
    attempted_role VARCHAR(50),
    ip_address VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Report Cards Table
CREATE TABLE report_cards (
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

-- 8. Fee Payments Table (Paystack Integration)
CREATE TABLE fee_payments (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    reference VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    term VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Staff Payroll Table
CREATE TABLE payroll (
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

-- 1. Students Table Access Policy
DROP POLICY IF EXISTS students_access_policy ON students;
CREATE POLICY students_access_policy ON students
FOR ALL
USING (
    current_setting('app.current_role', true) IS NULL
    OR current_setting('app.current_role', true) = ''
    OR current_setting('app.current_role', true) IN ('TEACHER', 'ADMIN', 'SUPERADMIN')
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

-- 2. Report Cards Table Access Policy
DROP POLICY IF EXISTS report_cards_access_policy ON report_cards;
CREATE POLICY report_cards_access_policy ON report_cards
FOR ALL
USING (
    current_setting('app.current_role', true) IS NULL
    OR current_setting('app.current_role', true) = ''
    OR current_setting('app.current_role', true) IN ('TEACHER', 'ADMIN', 'SUPERADMIN')
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

-- 3. Fee Payments Table Access Policy
DROP POLICY IF EXISTS fee_payments_access_policy ON fee_payments;
CREATE POLICY fee_payments_access_policy ON fee_payments
FOR ALL
USING (
    current_setting('app.current_role', true) IS NULL
    OR current_setting('app.current_role', true) = ''
    OR current_setting('app.current_role', true) IN ('TEACHER', 'ADMIN', 'SUPERADMIN')
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

-- 4. Parent-Student Links Table Access Policy
DROP POLICY IF EXISTS parent_student_links_access_policy ON parent_student_links;
CREATE POLICY parent_student_links_access_policy ON parent_student_links
FOR ALL
USING (
    current_setting('app.current_role', true) IS NULL
    OR current_setting('app.current_role', true) = ''
    OR current_setting('app.current_role', true) IN ('ADMIN', 'SUPERADMIN')
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