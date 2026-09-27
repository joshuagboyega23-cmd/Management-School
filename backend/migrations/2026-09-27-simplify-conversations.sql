DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'conversations'
      AND column_name = 'recipient_type'
  ) THEN
    ALTER TABLE conversations
      DROP CONSTRAINT IF EXISTS conversations_recipient_type_check;

    ALTER TABLE conversations
      ADD COLUMN target_role VARCHAR(20),
      ADD COLUMN target_user_id INT REFERENCES users(id) ON DELETE SET NULL;

    UPDATE conversations
    SET target_role = CASE
      WHEN recipient_type = 'TEACHER' THEN 'TEACHER'
      ELSE 'ADMIN'
    END;

    UPDATE conversations c
    SET target_user_id = t.user_id
    FROM teachers t
    WHERE c.recipient_type = 'TEACHER'
      AND c.recipient_teacher_id = t.id;

    ALTER TABLE conversations
      ALTER COLUMN target_role SET NOT NULL,
      ADD CONSTRAINT conversations_target_role_check
        CHECK (target_role IN ('ADMIN', 'PARENT', 'TEACHER'));

    ALTER TABLE conversations
      DROP COLUMN recipient_type,
      DROP COLUMN recipient_teacher_id;
  END IF;
END $$;
