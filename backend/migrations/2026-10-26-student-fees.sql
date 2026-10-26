CREATE TABLE IF NOT EXISTS student_fees (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    term VARCHAR(50) NOT NULL CHECK (term IN ('First Term','Second Term','Third Term')),
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    updated_by INT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (student_id, term)
);
