CREATE TABLE IF NOT EXISTS class_fees (
    id SERIAL PRIMARY KEY,
    class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    term VARCHAR(50) NOT NULL CHECK (term IN ('First Term','Second Term','Third Term')),
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    updated_by INT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (class_id, term)
);
