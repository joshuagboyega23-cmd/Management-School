const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const pool = require('./db');
const { cloudinary, cloudinaryConfigured } = require('./cloudinary');

// =============================================================
// AUTH & PERMISSION MIDDLEWARES
// =============================================================

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Neon Cloud terminates idle TCP connections; the pool may hold a dead client.
    // Retry pool.connect() with progressive backoff on connection-type errors.
    let client;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        client = await pool.connect();
        break;
      } catch (connErr) {
        if (attempt === 3) throw connErr;
        console.error(`verifyToken: pool.connect() failed (attempt ${attempt}), retrying in ${attempt * 500}ms...`, connErr.message);
        await new Promise((r) => setTimeout(r, attempt * 500));
      }
    }
    req.db = client;

    await client.query('BEGIN');
    await client.query(
      "SELECT set_config('app.current_user_id', $1, true), set_config('app.current_role', $2, true)",
      [String(decoded.id), String(decoded.role)]
    );

    let released = false;
    const cleanup = async () => {
      if (released) return;
      released = true;
      if (req.dbTransactionCommitted) {
        client.release();
        return;
      }
      try {
        if (res.statusCode >= 400) {
          await client.query('ROLLBACK');
        } else {
          await client.query('COMMIT');
        }
      } catch (err) {
      } finally {
        client.release();
      }
    };

    res.on('finish', cleanup);
    res.on('close', cleanup);

    next();
  } catch (error) {
    console.error('verifyToken error in cbt.js:', error);
    if (req.db) {
      try {
        await req.db.query('ROLLBACK');
        req.db.release();
      } catch (e) {}
    }
    if (!req.user) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
    }
    return res.status(500).json({ success: false, message: 'Database service temporarily unavailable. Please retry.' });
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized action for your role.' });
    }
    next();
  };
};

async function logCbtActivity(req, targetDescription) {
  try {
    await req.db.query('SAVEPOINT cbt_activity_log');
    await req.db.query(
      `INSERT INTO activity_log (actor_id, actor_name, actor_role, action, target_description)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.user.id,
        req.user.email || (['ADMIN', 'SUPERADMIN'].includes(req.user.role) ? 'Administrator' : 'Teacher'),
        req.user.role,
        'CBT',
        targetDescription
      ]
    );
    await req.db.query('RELEASE SAVEPOINT cbt_activity_log');
  } catch (err) {
    console.error('CBT activity log error:', err);
    try {
      await req.db.query('ROLLBACK TO SAVEPOINT cbt_activity_log');
      await req.db.query('RELEASE SAVEPOINT cbt_activity_log');
    } catch (e) {}
  }
}

// Authentication middleware for all CBT routes
router.use(verifyToken);

// Role gate: /student/* and /my-attempts/* routes require STUDENT role; other CBT routes require TEACHER, ADMIN, or SUPERADMIN
router.use((req, res, next) => {
  if (req.path.startsWith('/student') || req.path.startsWith('/my-attempts')) {
    if (!req.user || req.user.role !== 'STUDENT') {
      return res.status(403).json({ success: false, message: 'Access denied. Student portal only.' });
    }
    return next();
  }
  // Staff CBT routes
  if (!req.user || !['TEACHER', 'ADMIN', 'SUPERADMIN'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Unauthorized action for your role.' });
  }
  next();
});

// Helper: Check teacher/admin permissions on an exam
async function checkExamAccess(req, examId) {
  const result = await req.db.query(
    `SELECT e.*, c.name AS class_name, c.level AS class_level, c.homeroom_teacher_id
     FROM exams e
     JOIN classes c ON c.id = e.class_id
     WHERE e.id = $1`,
    [Number(examId)]
  );

  if (result.rows.length === 0) {
    return { error: { status: 404, message: 'Exam not found.' } };
  }

  const exam = result.rows[0];
  const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(req.user.role);

  if (!isAdmin) {
    // Teacher ownership check
    if (Number(exam.created_by) !== Number(req.user.id)) {
      return { error: { status: 403, message: 'Access denied: You can only manage your own exams.' } };
    }
  }

  return { exam };
}

// =============================================================
// FILE UPLOAD HELPERS & SIGNATURE VALIDATION
// =============================================================

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 } // 2 MB
});

function verifyXlsxSignature(buffer) {
  if (!buffer || buffer.length < 4) return false;
  // ZIP / XLSX magic bytes: 0x50, 0x4B, 0x03, 0x04
  return buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;
}

function verifyImageSignature(buffer) {
  if (!buffer || buffer.length < 12) return null;
  // JPEG: 0xFF, 0xD8, 0xFF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'jpg';
  }
  // PNG: 0x89, 0x50, 0x4E, 0x47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'png';
  }
  // WebP: RIFF (bytes 0..3) + WEBP (bytes 8..11)
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

const uploadToCloudinary = (buffer, folder, publicId) => new Promise((resolve, reject) => {
  cloudinary.uploader.upload_stream(
    { folder, public_id: publicId, resource_type: 'image' },
    (error, result) => error ? reject(error) : resolve(result)
  ).end(buffer);
});

// =============================================================
// 1. EXAM CRUD ROUTES
// =============================================================

// Download Excel Template for Questions (Must precede /:id)
router.get('/exams/template', (req, res) => {
  try {
    const templateData = [
      {
        'Question': 'What is 2 + 2?',
        'Type': 'MCQ',
        'Option A': '3',
        'Option B': '4',
        'Option C': '5',
        'Option D': '6',
        'Correct': 'B'
      },
      {
        'Question': 'The sun rises in the east.',
        'Type': 'TF',
        'Option A': 'True',
        'Option B': 'False',
        'Option C': '',
        'Option D': '',
        'Correct': 'A'
      },
      {
        'Question': 'Solve for x: x^2 - 4 = 0',
        'Type': 'MCQ',
        'Option A': 'x = 2 or x = -2',
        'Option B': 'x = 4',
        'Option C': 'x = 0',
        'Option D': 'No solution',
        'Correct': 'A'
      }
    ];

    const worksheet = xlsx.utils.json_to_sheet(templateData, {
      header: ['Question', 'Type', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct']
    });

    worksheet['!cols'] = [
      { wch: 45 },
      { wch: 10 },
      { wch: 25 },
      { wch: 25 },
      { wch: 25 },
      { wch: 25 },
      { wch: 12 }
    ];

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Questions');

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="cbt_exam_template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (error) {
    console.error('Template generation error:', error);
    return res.status(500).json({ success: false, message: 'Could not generate template file.' });
  }
});

// Create an Exam (while status is DRAFT)
router.post('/exams', async (req, res) => {
  try {
    const { title, subject, term, class_id, duration_minutes, total_marks, shuffle, max_leaves } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, message: 'Exam title is required.' });
    }
    if (!subject || !String(subject).trim()) {
      return res.status(400).json({ success: false, message: 'Subject is required.' });
    }
    if (!term || !String(term).trim()) {
      return res.status(400).json({ success: false, message: 'Term is required.' });
    }
    const classId = Number(class_id);
    if (!classId || !Number.isInteger(classId) || classId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid class_id is required.' });
    }

    const duration = Number(duration_minutes);
    if (!duration || duration < 5 || duration > 240) {
      return res.status(400).json({ success: false, message: 'Duration must be between 5 and 240 minutes.' });
    }

    const marks = total_marks !== undefined ? Number(total_marks) : 60;
    if (isNaN(marks) || marks <= 0 || marks > 1000) {
      return res.status(400).json({ success: false, message: 'Total marks must be a positive number.' });
    }

    const shuffleVal = shuffle !== undefined ? Boolean(shuffle) : true;

    let maxLeavesVal = 3;
    if (max_leaves !== undefined) {
      const parsedLeaves = Number(max_leaves);
      if (!Number.isInteger(parsedLeaves) || parsedLeaves < 1 || parsedLeaves > 20) {
        return res.status(400).json({ success: false, message: 'max_leaves must be an integer between 1 and 20.' });
      }
      maxLeavesVal = parsedLeaves;
    }

    // Validate class existence
    const classResult = await req.db.query(
      'SELECT id, name, homeroom_teacher_id FROM classes WHERE id = $1',
      [classId]
    );
    if (classResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Selected class does not exist.' });
    }

    const insertResult = await req.db.query(
      `INSERT INTO exams (title, subject, term, class_id, created_by, duration_minutes, total_marks, shuffle, max_leaves, status, questions_locked)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'DRAFT', FALSE)
       RETURNING *`,
      [
        String(title).trim(),
        String(subject).trim(),
        String(term).trim(),
        classId,
        req.user.id,
        duration,
        marks,
        shuffleVal,
        maxLeavesVal
      ]
    );

    await logCbtActivity(
      req,
      `Created exam: ${String(subject).trim()} — ${String(term).trim()} — ${classResult.rows[0].name} (${String(title).trim()})`
    );

    return res.status(201).json({
      success: true,
      message: 'Exam created successfully in DRAFT mode.',
      data: insertResult.rows[0]
    });
  } catch (error) {
    console.error('Create exam error:', error);
    return res.status(500).json({ success: false, message: 'Could not create exam.' });
  }
});

// List Exams (Scoped by teacher / admin)
router.get('/exams', async (req, res) => {
  try {
    const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(req.user.role);
    let query;
    let params = [];

    if (isAdmin) {
      query = `
        SELECT e.*, c.name AS class_name, c.level AS class_level,
               u.full_name AS creator_name,
               (SELECT COUNT(*)::int FROM questions q WHERE q.exam_id = e.id) AS question_count,
               (SELECT COUNT(*)::int FROM attempts a WHERE a.exam_id = e.id) AS attempt_count
        FROM exams e
        JOIN classes c ON c.id = e.class_id
        JOIN users u ON u.id = e.created_by
        ORDER BY e.created_at DESC
      `;
    } else {
      query = `
        SELECT e.*, c.name AS class_name, c.level AS class_level,
               (SELECT COUNT(*)::int FROM questions q WHERE q.exam_id = e.id) AS question_count,
               (SELECT COUNT(*)::int FROM attempts a WHERE a.exam_id = e.id) AS attempt_count
        FROM exams e
        JOIN classes c ON c.id = e.class_id
        WHERE e.created_by = $1
        ORDER BY e.created_at DESC
      `;
      params = [req.user.id];
    }

    const result = await req.db.query(query, params);
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List exams error:', error);
    return res.status(500).json({ success: false, message: 'Could not fetch exams list.' });
  }
});

// View Exam Details (including questions, options, and answer keys for staff)
router.get('/exams/:id', async (req, res) => {
  try {
    const { error, exam } = await checkExamAccess(req, req.params.id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    // Fetch questions + answer keys (only staff access this route)
    const questionsResult = await req.db.query(
      `SELECT q.id, q.exam_id, q.position, q.type, q.body_text, q.image_url, q.image_public_id,
              qk.correct_label
       FROM questions q
       LEFT JOIN question_keys qk ON qk.question_id = q.id
       WHERE q.exam_id = $1
       ORDER BY q.position ASC`,
      [exam.id]
    );

    const questionIds = questionsResult.rows.map((q) => q.id);
    let optionsByQuestion = {};

    if (questionIds.length > 0) {
      const optionsResult = await req.db.query(
        `SELECT qo.id, qo.question_id, qo.label, qo.option_text, qo.image_url
         FROM question_options qo
         WHERE qo.question_id = ANY($1::int[])
         ORDER BY qo.label ASC`,
        [questionIds]
      );

      optionsResult.rows.forEach((opt) => {
        if (!optionsByQuestion[opt.question_id]) {
          optionsByQuestion[opt.question_id] = [];
        }
        optionsByQuestion[opt.question_id].push(opt);
      });
    }

    const questions = questionsResult.rows.map((q) => ({
      ...q,
      options: optionsByQuestion[q.id] || []
    }));

    return res.json({
      success: true,
      data: {
        ...exam,
        questions
      }
    });
  } catch (error) {
    console.error('View exam error:', error);
    return res.status(500).json({ success: false, message: 'Could not fetch exam details.' });
  }
});

// Edit Exam Details (while status is DRAFT)
router.put('/exams/:id', async (req, res) => {
  try {
    const { error, exam } = await checkExamAccess(req, req.params.id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    if (exam.status !== 'DRAFT') {
      return res.status(400).json({ success: false, message: 'Only DRAFT exams can be edited.' });
    }

    const { title, subject, term, class_id, duration_minutes, total_marks, shuffle, max_leaves } = req.body;

    let targetClassId = exam.class_id;
    if (class_id !== undefined) {
      const parsedClassId = Number(class_id);
      if (!parsedClassId || !Number.isInteger(parsedClassId) || parsedClassId <= 0) {
        return res.status(400).json({ success: false, message: 'Valid class_id is required.' });
      }

      const classResult = await req.db.query(
        'SELECT id, name, homeroom_teacher_id FROM classes WHERE id = $1',
        [parsedClassId]
      );
      if (classResult.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Selected class does not exist.' });
      }

      targetClassId = parsedClassId;
    }

    let targetDuration = exam.duration_minutes;
    if (duration_minutes !== undefined) {
      const parsedDuration = Number(duration_minutes);
      if (!parsedDuration || parsedDuration < 5 || parsedDuration > 240) {
        return res.status(400).json({ success: false, message: 'Duration must be between 5 and 240 minutes.' });
      }
      targetDuration = parsedDuration;
    }

    let targetMarks = exam.total_marks;
    if (total_marks !== undefined) {
      const parsedMarks = Number(total_marks);
      if (isNaN(parsedMarks) || parsedMarks <= 0 || parsedMarks > 1000) {
        return res.status(400).json({ success: false, message: 'Total marks must be a positive number.' });
      }
      targetMarks = parsedMarks;
    }

    let targetMaxLeaves = exam.max_leaves !== undefined ? exam.max_leaves : 3;
    if (max_leaves !== undefined) {
      const parsedLeaves = Number(max_leaves);
      if (!Number.isInteger(parsedLeaves) || parsedLeaves < 1 || parsedLeaves > 20) {
        return res.status(400).json({ success: false, message: 'max_leaves must be an integer between 1 and 20.' });
      }
      targetMaxLeaves = parsedLeaves;
    }

    const targetTitle = title !== undefined ? String(title).trim() : exam.title;
    const targetSubject = subject !== undefined ? String(subject).trim() : exam.subject;
    const targetTerm = term !== undefined ? String(term).trim() : exam.term;
    const targetShuffle = shuffle !== undefined ? Boolean(shuffle) : exam.shuffle;

    if (!targetTitle) {
      return res.status(400).json({ success: false, message: 'Exam title cannot be empty.' });
    }
    if (!targetSubject) {
      return res.status(400).json({ success: false, message: 'Subject cannot be empty.' });
    }
    if (!targetTerm) {
      return res.status(400).json({ success: false, message: 'Term cannot be empty.' });
    }

    const updated = await req.db.query(
      `UPDATE exams
       SET title = $1,
           subject = $2,
           term = $3,
           class_id = $4,
           duration_minutes = $5,
           total_marks = $6,
           shuffle = $7,
           max_leaves = $8
       WHERE id = $9
       RETURNING *`,
      [targetTitle, targetSubject, targetTerm, targetClassId, targetDuration, targetMarks, targetShuffle, targetMaxLeaves, exam.id]
    );

    return res.json({
      success: true,
      message: 'Exam updated successfully.',
      data: updated.rows[0]
    });
  } catch (error) {
    console.error('Update exam error:', error);
    return res.status(500).json({ success: false, message: 'Could not update exam.' });
  }
});

// Delete Exam
router.delete('/exams/:id', async (req, res) => {
  try {
    const { error, exam } = await checkExamAccess(req, req.params.id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(req.user.role);
    if (exam.status !== 'DRAFT') {
      if (!isAdmin) {
        return res.status(403).json({ success: false, message: 'Only an administrator can delete a published exam.' });
      }

      const liveBatchResult = await req.db.query(
        `SELECT 1 FROM exam_batches WHERE exam_id = $1 AND status = 'LIVE' LIMIT 1`,
        [exam.id]
      );
      if (liveBatchResult.rows.length > 0) {
        return res.status(409).json({ success: false, message: 'This exam has a live batch. End the batch before deleting the exam.' });
      }

    }

    const attemptCountResult = await req.db.query(
      'SELECT COUNT(*)::int AS attempt_count FROM attempts WHERE exam_id = $1',
      [exam.id]
    );
    const attemptCount = Number(attemptCountResult.rows[0].attempt_count);
    await logCbtActivity(
      req,
      `Deleted ${exam.status === 'DRAFT' ? 'draft' : 'published'} exam: ${exam.title}; ${attemptCount} student attempts`
    );

    await req.db.query('DELETE FROM exams WHERE id = $1', [exam.id]);
    return res.json({ success: true, message: 'Exam deleted successfully.' });
  } catch (error) {
    console.error('Delete exam error:', error);
    return res.status(500).json({ success: false, message: 'Could not delete exam.' });
  }
});

// =============================================================
// 2. EXCEL QUESTIONS UPLOAD
// =============================================================

router.post('/exams/:id/upload-questions', memoryUpload.single('file'), async (req, res) => {
  try {
    const { error, exam } = await checkExamAccess(req, req.params.id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    if (exam.status !== 'DRAFT') {
      return res.status(400).json({ success: false, message: 'Questions can only be uploaded to DRAFT exams.' });
    }

    if (exam.questions_locked) {
      return res.status(400).json({ success: false, message: 'Questions are locked for this exam and cannot be modified.' });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'Please upload an Excel (.xlsx) file.' });
    }

    // Verify file signature for .xlsx (ZIP magic bytes)
    if (!verifyXlsxSignature(req.file.buffer)) {
      return res.status(400).json({ success: false, message: 'Invalid file format. Please upload a valid .xlsx file.' });
    }

    let workbook;
    try {
      workbook = xlsx.read(req.file.buffer, { type: 'buffer', raw: false });
    } catch (parseErr) {
      return res.status(400).json({ success: false, message: 'Failed to parse Excel file. The file may be corrupted.' });
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ success: false, message: 'The uploaded Excel workbook contains no sheets.' });
    }

    const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false });
    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({ success: false, message: 'The Excel sheet is empty. Please add questions.' });
    }

    if (rawRows.length > 60) {
      return res.status(400).json({
        success: false,
        message: `Maximum 60 questions allowed per exam. The uploaded sheet contains ${rawRows.length} rows.`
      });
    }

    // Row-by-row validation
    const rowErrors = [];
    const sanitizedQuestions = [];

    rawRows.forEach((row, index) => {
      const rowNum = index + 2; // Excel row 1 is header

      // Case-insensitive key normalizer
      const getVal = (colNames) => {
        for (const name of colNames) {
          for (const key of Object.keys(row)) {
            if (key.trim().toLowerCase() === name.toLowerCase()) {
              const val = row[key];
              return val !== undefined && val !== null ? String(val).trim() : '';
            }
          }
        }
        return '';
      };

      const questionText = getVal(['Question', 'Question Text', 'Body']);
      const rawType = getVal(['Type', 'Question Type']).toUpperCase();
      const rawCorrect = getVal(['Correct', 'Correct Answer', 'Answer Key', 'Key']).toUpperCase();
      const optionA = getVal(['Option A', 'Option_A', 'A']);
      const optionB = getVal(['Option B', 'Option_B', 'B']);
      const optionC = getVal(['Option C', 'Option_C', 'C']);
      const optionD = getVal(['Option D', 'Option_D', 'D']);

      if (!questionText) {
        rowErrors.push(`Row ${rowNum}: Question text is required.`);
        return;
      }

      const type = rawType === 'TF' || rawType === 'TRUE/FALSE' || rawType === 'TRUE FALSE' ? 'TF' : (rawType === 'MCQ' ? 'MCQ' : '');
      if (!type) {
        rowErrors.push(`Row ${rowNum}: Type must be 'MCQ' or 'TF' (got '${rawType || 'empty'}').`);
        return;
      }

      if (type === 'MCQ') {
        if (!['A', 'B', 'C', 'D'].includes(rawCorrect)) {
          rowErrors.push(`Row ${rowNum}: Correct answer for MCQ must be A, B, C, or D.`);
        }
        if (!optionA || !optionB || !optionC || !optionD) {
          rowErrors.push(`Row ${rowNum}: MCQ questions require all four options (Option A, Option B, Option C, Option D).`);
        }
        sanitizedQuestions.push({
          position: index + 1,
          type: 'MCQ',
          body_text: questionText,
          correct: rawCorrect,
          options: [
            { label: 'A', text: optionA },
            { label: 'B', text: optionB },
            { label: 'C', text: optionC },
            { label: 'D', text: optionD }
          ]
        });
      } else if (type === 'TF') {
        if (!['A', 'B'].includes(rawCorrect)) {
          rowErrors.push(`Row ${rowNum}: Correct answer for True/False must be A (True) or B (False).`);
        }
        sanitizedQuestions.push({
          position: index + 1,
          type: 'TF',
          body_text: questionText,
          correct: rawCorrect,
          options: [
            { label: 'A', text: optionA || 'True' },
            { label: 'B', text: optionB || 'False' }
          ]
        });
      }
    });

    // If any row is bad, save nothing and reject with clear row-numbered errors
    if (rowErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed for one or more rows. No questions were saved.',
        errors: rowErrors
      });
    }

    // Atomic replacement: delete old questions, then insert everything in a few batched queries.
    await req.db.query('DELETE FROM questions WHERE exam_id = $1', [exam.id]);

    // 1) All questions in a single query
    const qRes = await req.db.query(
      `INSERT INTO questions (exam_id, position, type, body_text)
       SELECT $1::int, u.pos, u.qtype, u.body
       FROM unnest($2::int[], $3::text[], $4::text[]) AS u(pos, qtype, body)
       RETURNING id, position`,
      [
        exam.id,
        sanitizedQuestions.map((q) => q.position),
        sanitizedQuestions.map((q) => q.type),
        sanitizedQuestions.map((q) => q.body_text)
      ]
    );
    const idByPosition = new Map(qRes.rows.map((r) => [Number(r.position), r.id]));

    // 2) Collect all options and answer keys
    const optQuestionIds = [];
    const optLabels = [];
    const optTexts = [];
    const keyQuestionIds = [];
    const keyLabels = [];
    for (const q of sanitizedQuestions) {
      const questionId = idByPosition.get(q.position);
      for (const opt of q.options) {
        optQuestionIds.push(questionId);
        optLabels.push(opt.label);
        optTexts.push(opt.text);
      }
      keyQuestionIds.push(questionId);
      keyLabels.push(q.correct);
    }

    // 3) All options in one query
    await req.db.query(
      `INSERT INTO question_options (question_id, label, option_text)
       SELECT u.qid, u.lbl, u.txt
       FROM unnest($1::int[], $2::text[], $3::text[]) AS u(qid, lbl, txt)`,
      [optQuestionIds, optLabels, optTexts]
    );

    // 4) All answer keys in one query
    await req.db.query(
      `INSERT INTO question_keys (question_id, correct_label)
       SELECT u.qid, u.lbl
       FROM unnest($1::int[], $2::text[]) AS u(qid, lbl)`,
      [keyQuestionIds, keyLabels]
    );

    await logCbtActivity(
      req,
      `Uploaded ${sanitizedQuestions.length} questions: ${exam.subject} — ${exam.term} — ${exam.class_name}`
    );

    await req.db.query('COMMIT');
    req.dbTransactionCommitted = true;

    return res.status(201).json({
      success: true,
      message: `Successfully imported ${sanitizedQuestions.length} questions.`,
      count: sanitizedQuestions.length
    });
  } catch (error) {
    console.error('Questions upload error:', error);
    return res.status(500).json({ success: false, message: 'Could not process questions file.' });
  }
});

// =============================================================
// 3. EDIT QUESTION OR OPTION TEXT
// =============================================================

// Edit single question text
router.patch('/questions/:questionId', async (req, res) => {
  try {
    const questionId = Number(req.params.questionId);
    const qResult = await req.db.query(
      `SELECT q.*, e.created_by, e.status, e.questions_locked, c.homeroom_teacher_id
       FROM questions q
       JOIN exams e ON e.id = q.exam_id
       JOIN classes c ON c.id = e.class_id
       WHERE q.id = $1`,
      [questionId]
    );

    if (qResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Question not found.' });
    }

    const question = qResult.rows[0];
    const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(req.user.role);

    if (!isAdmin && Number(question.created_by) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Access denied: You can only edit questions for your own exams.' });
    }

    if (question.questions_locked) {
      return res.status(400).json({ success: false, message: 'Questions are locked for this exam and cannot be edited.' });
    }

    const { body_text } = req.body;
    if (!body_text || !String(body_text).trim()) {
      return res.status(400).json({ success: false, message: 'Question text cannot be empty.' });
    }

    const updated = await req.db.query(
      `UPDATE questions
       SET body_text = $1
       WHERE id = $2
       RETURNING *`,
      [String(body_text).trim(), questionId]
    );

    return res.json({
      success: true,
      message: 'Question updated successfully.',
      data: updated.rows[0]
    });
  } catch (error) {
    console.error('Edit question error:', error);
    return res.status(500).json({ success: false, message: 'Could not update question.' });
  }
});

// Edit single option text
router.patch('/options/:optionId', async (req, res) => {
  try {
    const optionId = Number(req.params.optionId);
    const optResult = await req.db.query(
      `SELECT qo.*, q.exam_id, e.created_by, e.status, e.questions_locked, c.homeroom_teacher_id
       FROM question_options qo
       JOIN questions q ON q.id = qo.question_id
       JOIN exams e ON e.id = q.exam_id
       JOIN classes c ON c.id = e.class_id
       WHERE qo.id = $1`,
      [optionId]
    );

    if (optResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Option not found.' });
    }

    const option = optResult.rows[0];
    const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(req.user.role);

    if (!isAdmin && Number(option.created_by) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Access denied: You can only edit options for your own exams.' });
    }

    if (option.questions_locked) {
      return res.status(400).json({ success: false, message: 'Questions and options are locked for this exam.' });
    }

    const { option_text } = req.body;
    if (!option_text || !String(option_text).trim()) {
      return res.status(400).json({ success: false, message: 'Option text cannot be empty.' });
    }

    const updated = await req.db.query(
      `UPDATE question_options
       SET option_text = $1
       WHERE id = $2
       RETURNING *`,
      [String(option_text).trim(), optionId]
    );

    return res.json({
      success: true,
      message: 'Option updated successfully.',
      data: updated.rows[0]
    });
  } catch (error) {
    console.error('Edit option error:', error);
    return res.status(500).json({ success: false, message: 'Could not update option text.' });
  }
});

// =============================================================
// 4. IMAGE UPLOAD FOR QUESTION OR OPTION
// =============================================================

// Question image upload
router.post('/questions/:questionId/image', memoryUpload.single('image'), async (req, res) => {
  try {
    const questionId = Number(req.params.questionId);
    const qResult = await req.db.query(
      `SELECT q.*, e.created_by, e.status, e.questions_locked, c.homeroom_teacher_id
       FROM questions q
       JOIN exams e ON e.id = q.exam_id
       JOIN classes c ON c.id = e.class_id
       WHERE q.id = $1`,
      [questionId]
    );

    if (qResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Question not found.' });
    }

    const question = qResult.rows[0];
    const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(req.user.role);

    if (!isAdmin && Number(question.created_by) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Access denied: You can only upload images for your own exams.' });
    }

    if (question.questions_locked) {
      return res.status(400).json({ success: false, message: 'Questions are locked for this exam.' });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'Please provide an image file.' });
    }

    const format = verifyImageSignature(req.file.buffer);
    if (!format || !['jpg', 'png', 'webp'].includes(format)) {
      return res.status(400).json({ success: false, message: 'Invalid image format. Only JPG, PNG, and WebP are allowed.' });
    }

    if (!cloudinaryConfigured) {
      return res.status(503).json({ success: false, message: 'Image uploads are not configured.' });
    }

    const publicId = `cbt-q-${questionId}-${crypto.randomUUID()}`;
    const uploadResult = await uploadToCloudinary(req.file.buffer, 'cbt-questions', publicId);

    // Optionally cleanup old Cloudinary image
    if (question.image_public_id) {
      try {
        await cloudinary.uploader.destroy(question.image_public_id);
      } catch (cleanupErr) {
        console.error('Failed to remove old question image from Cloudinary:', cleanupErr.message);
      }
    }

    const updated = await req.db.query(
      `UPDATE questions
       SET image_url = $1, image_public_id = $2
       WHERE id = $3
       RETURNING id, image_url, image_public_id`,
      [uploadResult.secure_url, uploadResult.public_id, questionId]
    );

    return res.json({
      success: true,
      message: 'Question image uploaded successfully.',
      data: updated.rows[0]
    });
  } catch (error) {
    console.error('Question image upload error:', error);
    return res.status(500).json({ success: false, message: 'Could not upload question image.' });
  }
});

// Option image upload
router.post('/options/:optionId/image', memoryUpload.single('image'), async (req, res) => {
  try {
    const optionId = Number(req.params.optionId);
    const optResult = await req.db.query(
      `SELECT qo.*, q.exam_id, e.created_by, e.status, e.questions_locked, c.homeroom_teacher_id
       FROM question_options qo
       JOIN questions q ON q.id = qo.question_id
       JOIN exams e ON e.id = q.exam_id
       JOIN classes c ON c.id = e.class_id
       WHERE qo.id = $1`,
      [optionId]
    );

    if (optResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Option not found.' });
    }

    const option = optResult.rows[0];
    const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(req.user.role);

    if (!isAdmin && Number(option.created_by) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Access denied: You can only upload images for your own exams.' });
    }

    if (option.questions_locked) {
      return res.status(400).json({ success: false, message: 'Questions and options are locked for this exam.' });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'Please provide an image file.' });
    }

    const format = verifyImageSignature(req.file.buffer);
    if (!format || !['jpg', 'png', 'webp'].includes(format)) {
      return res.status(400).json({ success: false, message: 'Invalid image format. Only JPG, PNG, and WebP are allowed.' });
    }

    if (!cloudinaryConfigured) {
      return res.status(503).json({ success: false, message: 'Image uploads are not configured.' });
    }

    const publicId = `cbt-opt-${optionId}-${crypto.randomUUID()}`;
    const uploadResult = await uploadToCloudinary(req.file.buffer, 'cbt-options', publicId);

    const updated = await req.db.query(
      `UPDATE question_options
       SET image_url = $1
       WHERE id = $2
       RETURNING id, question_id, label, image_url`,
      [uploadResult.secure_url, optionId]
    );

    return res.json({
      success: true,
      message: 'Option image uploaded successfully.',
      data: updated.rows[0]
    });
  } catch (error) {
    console.error('Option image upload error:', error);
    return res.status(500).json({ success: false, message: 'Could not upload option image.' });
  }
});

// =============================================================
// 5. PREVIEW (Exactly as students will see it — NO answer keys)
// =============================================================

router.get('/exams/:id/preview', async (req, res) => {
  try {
    const { error, exam } = await checkExamAccess(req, req.params.id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    // Fetch questions WITHOUT joining question_keys
    const questionsResult = await req.db.query(
      `SELECT q.id, q.exam_id, q.position, q.type, q.body_text, q.image_url
       FROM questions q
       WHERE q.exam_id = $1
       ORDER BY q.position ASC`,
      [exam.id]
    );

    const questionIds = questionsResult.rows.map((q) => q.id);
    let optionsByQuestion = {};

    if (questionIds.length > 0) {
      const optionsResult = await req.db.query(
        `SELECT qo.id, qo.question_id, qo.label, qo.option_text, qo.image_url
         FROM question_options qo
         WHERE qo.question_id = ANY($1::int[])
         ORDER BY qo.label ASC`,
        [questionIds]
      );

      optionsResult.rows.forEach((opt) => {
        if (!optionsByQuestion[opt.question_id]) {
          optionsByQuestion[opt.question_id] = [];
        }
        optionsByQuestion[opt.question_id].push(opt);
      });
    }

    const questions = questionsResult.rows.map((q) => ({
      id: q.id,
      position: q.position,
      type: q.type,
      body_text: q.body_text,
      image_url: q.image_url,
      options: optionsByQuestion[q.id] || []
    }));

    return res.json({
      success: true,
      data: {
        id: exam.id,
        title: exam.title,
        subject: exam.subject,
        term: exam.term,
        class_id: exam.class_id,
        class_name: exam.class_name,
        duration_minutes: exam.duration_minutes,
        total_marks: exam.total_marks,
        shuffle: exam.shuffle,
        status: exam.status,
        question_count: questions.length,
        questions
      }
    });
  } catch (error) {
    console.error('Exam preview error:', error);
    return res.status(500).json({ success: false, message: 'Could not generate exam preview.' });
  }
});

// =============================================================
// 6. PUBLISH EXAM (DRAFT -> PUBLISHED, requires >= 1 question)
// =============================================================

router.post('/exams/:id/publish', async (req, res) => {
  try {
    const { error, exam } = await checkExamAccess(req, req.params.id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    if (exam.status !== 'DRAFT') {
      return res.status(400).json({ success: false, message: 'Only DRAFT exams can be published.' });
    }

    const qCountResult = await req.db.query(
      'SELECT COUNT(*)::int AS count FROM questions WHERE exam_id = $1',
      [exam.id]
    );
    const count = qCountResult.rows[0].count;

    if (count === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot publish exam: At least 1 question is required.'
      });
    }

    // Verify all questions have answer keys and options
    const incompleteResult = await req.db.query(
      `SELECT q.id, q.position
       FROM questions q
       LEFT JOIN question_keys qk ON qk.question_id = q.id
       WHERE q.exam_id = $1 AND qk.correct_label IS NULL`,
      [exam.id]
    );

    if (incompleteResult.rows.length > 0) {
      const missingPositions = incompleteResult.rows.map((r) => r.position).join(', ');
      return res.status(400).json({
        success: false,
        message: `Cannot publish exam: Questions at positions [${missingPositions}] are missing answer keys.`
      });
    }

    const updated = await req.db.query(
      `UPDATE exams
       SET status = 'PUBLISHED',
           questions_locked = TRUE
       WHERE id = $1
       RETURNING *`,
      [exam.id]
    );

    await logCbtActivity(
      req,
      `Published exam: ${exam.subject} — ${exam.term} — ${exam.class_name}`
    );

    return res.json({
      success: true,
      message: 'Exam published successfully and questions are locked.',
      data: updated.rows[0]
    });
  } catch (error) {
    console.error('Publish exam error:', error);
    return res.status(500).json({ success: false, message: 'Could not publish exam.' });
  }
});

// =============================================================
// 7. ANSWER KEY CORRECTION & RE-MARKING ATTEMPTS
// =============================================================

router.post('/questions/:questionId/correct-key', async (req, res) => {
  try {
    const questionId = Number(req.params.questionId);
    const { new_label, reason } = req.body;

    if (!new_label || !String(new_label).trim()) {
      return res.status(400).json({ success: false, message: 'New correct label is required.' });
    }
    const label = String(new_label).trim().toUpperCase();

    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ success: false, message: 'A reason for correcting the answer key is required.' });
    }

    const qResult = await req.db.query(
      `SELECT q.*, e.id AS exam_id, e.created_by, e.total_marks, e.subject, e.term, c.name AS class_name, c.homeroom_teacher_id
       FROM questions q
       JOIN exams e ON e.id = q.exam_id
       JOIN classes c ON c.id = e.class_id
       WHERE q.id = $1`,
      [questionId]
    );

    if (qResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Question not found.' });
    }

    const question = qResult.rows[0];
    const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(req.user.role);

    if (!isAdmin && Number(question.created_by) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Access denied: You can only correct keys for your own exams.' });
    }

    // Validate label against question type
    if (question.type === 'TF' && !['A', 'B'].includes(label)) {
      return res.status(400).json({ success: false, message: "For True/False questions, the key must be 'A' or 'B'." });
    }
    if (question.type === 'MCQ' && !['A', 'B', 'C', 'D'].includes(label)) {
      return res.status(400).json({ success: false, message: "For MCQ questions, the key must be 'A', 'B', 'C', or 'D'." });
    }

    // Verify option exists
    const optionCheck = await req.db.query(
      'SELECT 1 FROM question_options WHERE question_id = $1 AND label = $2',
      [questionId, label]
    );
    if (optionCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: `Option '${label}' does not exist for this question.` });
    }

    // Current key lookup
    const keyResult = await req.db.query(
      'SELECT correct_label FROM question_keys WHERE question_id = $1',
      [questionId]
    );
    const oldLabel = keyResult.rows.length > 0 ? keyResult.rows[0].correct_label : null;

    if (oldLabel === label) {
      return res.status(400).json({ success: false, message: `The answer key is already set to '${label}'.` });
    }

    // 1. Upsert question_keys
    await req.db.query(
      `INSERT INTO question_keys (question_id, correct_label)
       VALUES ($1, $2)
       ON CONFLICT (question_id)
       DO UPDATE SET correct_label = EXCLUDED.correct_label`,
      [questionId, label]
    );

    // 2. Log in key_changes
    const changeLog = await req.db.query(
      `INSERT INTO key_changes (question_id, old_label, new_label, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [questionId, oldLabel || label, label, req.user.id, String(reason).trim()]
    );

    // 3. Re-mark every submitted attempt for this exam
    const totalQResult = await req.db.query(
      'SELECT COUNT(*)::int AS count FROM questions WHERE exam_id = $1',
      [question.exam_id]
    );
    const totalQuestions = totalQResult.rows[0].count;
    const totalMarks = Number(question.total_marks);

    // Find all submitted attempts for this exam
    const attemptsResult = await req.db.query(
      `SELECT a.id,
              COUNT(CASE WHEN ans.selected_label = qk.correct_label THEN 1 END)::int AS correct_count
       FROM attempts a
       LEFT JOIN attempt_answers ans ON ans.attempt_id = a.id
       LEFT JOIN question_keys qk ON qk.question_id = ans.question_id
       WHERE a.exam_id = $1 AND a.submitted_at IS NOT NULL
       GROUP BY a.id`,
      [question.exam_id]
    );

    let remarkedCount = 0;
    for (const att of attemptsResult.rows) {
      const correctCount = att.correct_count;
      const score = totalQuestions > 0 ? (correctCount / totalQuestions) * totalMarks : 0;
      const roundedScore = Number(score.toFixed(2));

      await req.db.query(
        `UPDATE attempts
         SET correct_count = $1,
             score = $2
         WHERE id = $3`,
        [correctCount, roundedScore, att.id]
      );
      remarkedCount++;
    }

    await logCbtActivity(
      req,
      `Corrected answer key Q${question.position} (${oldLabel || 'unset'} to ${label}): ${question.subject} — ${question.term} — ${question.class_name}`
    );

    return res.json({
      success: true,
      message: `Answer key updated to '${label}'. ${remarkedCount} submitted attempts were re-marked.`,
      key_change: changeLog.rows[0],
      remarked_attempts_count: remarkedCount
    });
  } catch (error) {
    console.error('Answer key correction error:', error);
    return res.status(500).json({ success: false, message: 'Could not correct answer key.' });
  }
});

// =============================================================
// HELPER: CHECK BATCH ACCESS
// =============================================================

async function checkBatchAccess(req, batchId) {
  const result = await req.db.query(
    `SELECT b.*, e.id AS exam_id, e.title AS exam_title, e.class_id, e.created_by, e.status AS exam_status,
            c.name AS class_name, c.homeroom_teacher_id
     FROM exam_batches b
     JOIN exams e ON e.id = b.exam_id
     JOIN classes c ON c.id = e.class_id
     WHERE b.id = $1`,
    [Number(batchId)]
  );

  if (result.rows.length === 0) {
    return { error: { status: 404, message: 'Exam batch not found.' } };
  }

  const batch = result.rows[0];
  const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(req.user.role);

  if (!isAdmin) {
    if (Number(batch.created_by) !== Number(req.user.id)) {
      return { error: { status: 403, message: 'Access denied: You can only manage batches for your own exams.' } };
    }
  }

  return { batch };
}

// Helper: Check teacher/admin permissions on an attempt
async function checkAttemptStaffAccess(req, attemptId) {
  const result = await req.db.query(
    `SELECT a.*, e.created_by, e.class_id, c.homeroom_teacher_id
     FROM attempts a
     JOIN exams e ON e.id = a.exam_id
     JOIN classes c ON c.id = e.class_id
     WHERE a.id = $1`,
    [Number(attemptId)]
  );

  if (result.rows.length === 0) {
    return { error: { status: 404, message: 'Exam attempt not found.' } };
  }

  const attempt = result.rows[0];
  const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(req.user.role);

  if (!isAdmin) {
    if (Number(attempt.created_by) !== Number(req.user.id)) {
      return { error: { status: 403, message: 'Access denied: You can only manage attempts for your own exams.' } };
    }
  }

  return { attempt };
}

// =============================================================
// BATCH ROUTES
// =============================================================

// 1. GET students of the exam's class with live status for the current batch + tab-leave counts
const getExamStudentsHandler = async (req, res) => {
  try {
    const examId = Number(req.params.id);
    const { exam, error } = await checkExamAccess(req, examId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    // Look for the current batch (prefer LIVE, otherwise most recent)
    const batchResult = await req.db.query(
      `SELECT * FROM exam_batches
       WHERE exam_id = $1
       ORDER BY (CASE WHEN status = 'LIVE' THEN 0 ELSE 1 END), id DESC
       LIMIT 1`,
      [examId]
    );

    const currentBatch = batchResult.rows.length > 0 ? batchResult.rows[0] : null;
    const currentBatchId = currentBatch ? currentBatch.id : 0;

    // Fetch all students in the exam's class with live batch status & tab leaves
    const studentsResult = await req.db.query(
      `SELECT
         s.id AS student_id,
         s.full_name,
         s.admission_number,
         s.class_id,
         bs.id AS batch_student_id,
         bs.batch_id,
         COALESCE(bs.status, 'WAITING') AS status,
         bs.status AS batch_status,
         COALESCE(bs.code_attempts, 0)::int AS code_attempts,
         COALESCE(bs.added_late, false) AS added_late,
         att.id AS attempt_id,
         att.started_at AS attempt_started_at,
         att.submitted_at AS attempt_submitted_at,
         att.score,
         att.correct_count,
         att.submit_type,
         COALESCE(er.released_at IS NOT NULL, false) AS is_released,
         COALESCE(ev.tab_leave_count, 0)::int AS tab_leave_count
       FROM students s
       LEFT JOIN batch_students bs ON bs.student_id = s.id AND bs.batch_id = $2
       LEFT JOIN attempts att ON att.exam_id = $1 AND att.student_id = s.id
       LEFT JOIN exam_releases er ON er.exam_id = $1 AND er.student_id = s.id
       LEFT JOIN (
         SELECT attempt_id, COUNT(*) AS tab_leave_count
         FROM attempt_events
         WHERE event_type IN ('TAB_HIDDEN', 'FULLSCREEN_EXIT')
         GROUP BY attempt_id
       ) ev ON ev.attempt_id = att.id
       WHERE s.class_id = $3
       ORDER BY s.full_name ASC`,
      [examId, currentBatchId, exam.class_id]
    );

    return res.json({
      success: true,
      exam_id: examId,
      class_id: exam.class_id,
      current_batch: currentBatch ? {
        id: currentBatch.id,
        access_code: currentBatch.access_code,
        status: currentBatch.status,
        started_at: currentBatch.started_at,
        ended_at: currentBatch.ended_at
      } : null,
      data: studentsResult.rows
    });
  } catch (error) {
    console.error('Get exam batch students error:', error);
    return res.status(500).json({ success: false, message: 'Could not fetch students for this exam batch.' });
  }
};

router.get('/exams/:id/students', getExamStudentsHandler);
router.get('/exams/:id/batch-students', getExamStudentsHandler);

// 2. POST start batch
const startBatchHandler = async (req, res) => {
  try {
    const examId = Number(req.params.id);
    const { exam, error } = await checkExamAccess(req, examId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    if (exam.status !== 'PUBLISHED') {
      return res.status(400).json({ success: false, message: 'Exam must be PUBLISHED before starting a batch.' });
    }

    const { student_ids } = req.body;
    if (!Array.isArray(student_ids) || student_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one student must be selected to start a batch.' });
    }

    // Convert and deduplicate student IDs
    const cleanStudentIds = [...new Set(student_ids.map(Number).filter((id) => !isNaN(id) && id > 0))];
    if (cleanStudentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Valid student IDs are required.' });
    }

    // Verify all students belong to the exam's class
    const validStudents = await req.db.query(
      `SELECT id FROM students WHERE id = ANY($1::int[]) AND class_id = $2`,
      [cleanStudentIds, exam.class_id]
    );

    if (validStudents.rows.length !== cleanStudentIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more selected students do not belong to this exam's class."
      });
    }

    // Check if there is already an active LIVE batch for this exam
    const activeBatchCheck = await req.db.query(
      `SELECT id FROM exam_batches WHERE exam_id = $1 AND status = 'LIVE'`,
      [examId]
    );
    if (activeBatchCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: `An active batch (#${activeBatchCheck.rows[0].id}) is currently LIVE for this exam. Please end it before starting a new batch.`
      });
    }

    // Generate random 6-digit code using crypto.randomInt(0, 1000000) padded with leading zeros
    const accessCode = String(crypto.randomInt(0, 1000000)).padStart(6, '0');

    // Create batch
    const batchResult = await req.db.query(
      `INSERT INTO exam_batches (exam_id, access_code, status, started_by, started_at)
       VALUES ($1, $2, 'LIVE', $3, CURRENT_TIMESTAMP)
       RETURNING *`,
      [examId, accessCode, req.user.id]
    );
    const newBatch = batchResult.rows[0];

    // Create batch_students rows
    for (const sId of cleanStudentIds) {
      await req.db.query(
        `INSERT INTO batch_students (batch_id, student_id, status, added_late)
         VALUES ($1, $2, 'WAITING', false)`,
        [newBatch.id, sId]
      );
    }

    // Ensure questions are locked
    await req.db.query(
      `UPDATE exams SET questions_locked = true WHERE id = $1`,
      [examId]
    );

    await logCbtActivity(
      req,
      `Started exam batch (${cleanStudentIds.length} students): ${exam.subject} — ${exam.term} — ${exam.class_name}`
    );

    return res.status(201).json({
      success: true,
      message: 'Batch started successfully.',
      data: {
        batch_id: newBatch.id,
        exam_id: examId,
        access_code: accessCode,
        status: 'LIVE',
        student_count: cleanStudentIds.length,
        started_at: newBatch.started_at
      }
    });
  } catch (error) {
    console.error('Start batch error:', error);
    return res.status(500).json({ success: false, message: 'Could not start exam batch.' });
  }
};

router.post('/exams/:id/batches', startBatchHandler);
router.post('/exams/:id/start-batch', startBatchHandler);

// 3. POST add a late student to a running batch
const addLateStudentHandler = async (req, res) => {
  try {
    let batchId = Number(req.params.batchId);

    // If route called via /exams/:id/add-student without batchId param
    if (!batchId && req.params.id) {
      const examId = Number(req.params.id);
      const { exam, error } = await checkExamAccess(req, examId);
      if (error) return res.status(error.status).json({ success: false, message: error.message });

      const liveBatchRes = await req.db.query(
        `SELECT id FROM exam_batches WHERE exam_id = $1 AND status = 'LIVE' ORDER BY id DESC LIMIT 1`,
        [examId]
      );
      if (liveBatchRes.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'No active LIVE batch found for this exam.' });
      }
      batchId = liveBatchRes.rows[0].id;
    }

    const { batch, error } = await checkBatchAccess(req, batchId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    if (batch.status !== 'LIVE') {
      return res.status(400).json({ success: false, message: 'Cannot add student: This batch is not currently LIVE.' });
    }

    const inputStudents = Array.isArray(req.body.student_ids)
      ? req.body.student_ids
      : (req.body.student_id ? [req.body.student_id] : []);

    const cleanStudentIds = [...new Set(inputStudents.map(Number).filter((id) => !isNaN(id) && id > 0))];
    if (cleanStudentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one valid student ID is required.' });
    }

    // Verify all students belong to the batch's class
    const validStudents = await req.db.query(
      `SELECT id FROM students WHERE id = ANY($1::int[]) AND class_id = $2`,
      [cleanStudentIds, batch.class_id]
    );

    if (validStudents.rows.length !== cleanStudentIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more selected students do not belong to this exam's class."
      });
    }

    // Check if any student is already enrolled in this batch
    const existingCheck = await req.db.query(
      `SELECT student_id FROM batch_students WHERE batch_id = $1 AND student_id = ANY($2::int[])`,
      [batchId, cleanStudentIds]
    );
    if (existingCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Student (ID ${existingCheck.rows[0].student_id}) is already enrolled in this batch.`
      });
    }

    // Insert late students
    const insertedStudents = [];
    for (const sId of cleanStudentIds) {
      const insRes = await req.db.query(
        `INSERT INTO batch_students (batch_id, student_id, status, added_late)
         VALUES ($1, $2, 'WAITING', true)
         RETURNING *`,
        [batchId, sId]
      );
      insertedStudents.push(insRes.rows[0]);
    }

    return res.status(201).json({
      success: true,
      message: 'Late student(s) added to batch successfully.',
      data: {
        batch_id: batchId,
        access_code: batch.access_code,
        added_students: insertedStudents
      }
    });
  } catch (error) {
    console.error('Add late student error:', error);
    return res.status(500).json({ success: false, message: 'Could not add student to batch.' });
  }
};

router.post('/batches/:batchId/add-student', addLateStudentHandler);
router.post('/exams/:id/batches/:batchId/add-student', addLateStudentHandler);
router.post('/exams/:id/add-student', addLateStudentHandler);

// 4. POST end batch
const endBatchHandler = async (req, res) => {
  try {
    let batchId = Number(req.params.batchId);

    // If called via /exams/:id/end-batch without batchId in params
    if (!batchId && req.params.id) {
      const examId = Number(req.params.id);
      const { exam, error } = await checkExamAccess(req, examId);
      if (error) return res.status(error.status).json({ success: false, message: error.message });

      const liveBatchRes = await req.db.query(
        `SELECT id FROM exam_batches WHERE exam_id = $1 AND status = 'LIVE' ORDER BY id DESC LIMIT 1`,
        [examId]
      );
      if (liveBatchRes.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'No active LIVE batch found for this exam.' });
      }
      batchId = liveBatchRes.rows[0].id;
    }

    const { batch, error } = await checkBatchAccess(req, batchId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    if (batch.status === 'ENDED') {
      return res.status(400).json({ success: false, message: 'Batch has already been ended.' });
    }

    const updated = await req.db.query(
      `UPDATE exam_batches
       SET status = 'ENDED', ended_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [batchId]
    );

    return res.json({
      success: true,
      message: 'Batch ended successfully.',
      data: {
        batch_id: batchId,
        exam_id: batch.exam_id,
        status: 'ENDED',
        ended_at: updated.rows[0].ended_at
      }
    });
  } catch (error) {
    console.error('End batch error:', error);
    return res.status(500).json({ success: false, message: 'Could not end exam batch.' });
  }
};

router.post('/batches/:batchId/end', endBatchHandler);
router.post('/exams/:id/batches/:batchId/end', endBatchHandler);
router.post('/exams/:id/end-batch', endBatchHandler);

// 5. POST unlock a LOCKED_OUT student by adding them to a new batch
const unlockStudentHandler = async (req, res) => {
  try {
    let examId = Number(req.params.id);

    // If called via /batches/:batchId/unlock-student
    if (!examId && req.params.batchId) {
      const { batch, error } = await checkBatchAccess(req, req.params.batchId);
      if (error) return res.status(error.status).json({ success: false, message: error.message });
      examId = batch.exam_id;
    }

    const { exam, error } = await checkExamAccess(req, examId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const studentId = Number(req.body.student_id);
    if (!studentId || isNaN(studentId)) {
      return res.status(400).json({ success: false, message: 'A valid student_id is required.' });
    }

    // Verify student belongs to this exam's class
    const studentCheck = await req.db.query(
      `SELECT id, full_name, admission_number FROM students WHERE id = $1 AND class_id = $2`,
      [studentId, exam.class_id]
    );
    if (studentCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: "Student does not belong to this exam's class." });
    }

    let targetBatch;

    // If teacher provided a specific batch_id to add into
    if (req.body.batch_id) {
      const bRes = await req.db.query(
        `SELECT * FROM exam_batches WHERE id = $1 AND exam_id = $2`,
        [Number(req.body.batch_id), examId]
      );
      if (bRes.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Specified batch was not found for this exam.' });
      }
      targetBatch = bRes.rows[0];
      if (targetBatch.status !== 'LIVE') {
        return res.status(400).json({ success: false, message: 'Specified batch is not LIVE.' });
      }
    } else {
      // Create a new batch for this unlocked student
      const newCode = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      const newBatchRes = await req.db.query(
        `INSERT INTO exam_batches (exam_id, access_code, status, started_by, started_at)
         VALUES ($1, $2, 'LIVE', $3, CURRENT_TIMESTAMP)
         RETURNING *`,
        [examId, newCode, req.user.id]
      );
      targetBatch = newBatchRes.rows[0];
    }

    // Check if student is already enrolled in targetBatch
    const existingEnrollment = await req.db.query(
      `SELECT id, status FROM batch_students WHERE batch_id = $1 AND student_id = $2`,
      [targetBatch.id, studentId]
    );

    let batchStudent;
    if (existingEnrollment.rows.length > 0) {
      // Reset status to WAITING and clear code_attempts
      const resetRes = await req.db.query(
        `UPDATE batch_students
         SET status = 'WAITING', code_attempts = 0
         WHERE id = $1
         RETURNING *`,
        [existingEnrollment.rows[0].id]
      );
      batchStudent = resetRes.rows[0];
    } else {
      const insRes = await req.db.query(
        `INSERT INTO batch_students (batch_id, student_id, status, added_late, code_attempts)
         VALUES ($1, $2, 'WAITING', false, 0)
         RETURNING *`,
        [targetBatch.id, studentId]
      );
      batchStudent = insRes.rows[0];
    }

    // If student already has an attempt record, link it to the new batch_student
    await req.db.query(
      `UPDATE attempts
       SET batch_student_id = $1
       WHERE exam_id = $2 AND student_id = $3`,
      [batchStudent.id, examId, studentId]
    );

    return res.json({
      success: true,
      message: 'Student unlocked successfully and enrolled in batch.',
      data: {
        student_id: studentId,
        student_name: studentCheck.rows[0].full_name,
        batch_id: targetBatch.id,
        access_code: targetBatch.access_code,
        status: 'WAITING'
      }
    });
  } catch (error) {
    console.error('Unlock student error:', error);
    return res.status(500).json({ success: false, message: 'Could not unlock student.' });
  }
};

router.post('/exams/:id/unlock-student', unlockStudentHandler);
router.post('/batches/:batchId/unlock-student', unlockStudentHandler);

// 6. GET live alerts for a batch (TEACHER, ADMIN, SUPERADMIN)
const getBatchAlertsHandler = async (req, res) => {
  try {
    const batchId = Number(req.params.batchId);
    if (!batchId || !Number.isInteger(batchId) || batchId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid batchId is required.' });
    }

    const { batch, error } = await checkBatchAccess(req, batchId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const since = req.query.since ? Math.max(0, parseInt(req.query.since, 10) || 0) : 0;

    const alertsRes = await req.db.query(
      `SELECT ba.id, ba.batch_id, ba.student_id, ba.alert_type, ba.detail, ba.created_at,
              s.full_name AS student_name,
              COALESCE(leaves.leave_count, 0)::int AS leave_count
       FROM batch_alerts ba
       JOIN students s ON s.id = ba.student_id
       LEFT JOIN attempts att ON att.exam_id = $2 AND att.student_id = ba.student_id
       LEFT JOIN (
         SELECT attempt_id, COUNT(*) AS leave_count
         FROM attempt_events
         WHERE event_type IN ('TAB_HIDDEN', 'FULLSCREEN_EXIT')
         GROUP BY attempt_id
       ) leaves ON leaves.attempt_id = att.id
       WHERE ba.batch_id = $1 AND ba.id > $3
       ORDER BY ba.id ASC
       LIMIT 100`,
      [batchId, batch.exam_id, since]
    );

    return res.json({
      success: true,
      batch_id: batchId,
      exam_id: batch.exam_id,
      data: alertsRes.rows
    });
  } catch (error) {
    console.error('Get batch alerts error:', error);
    return res.status(500).json({ success: false, message: 'Could not fetch batch alerts.' });
  }
};

router.get('/batches/:batchId/alerts', getBatchAlertsHandler);

// 7. POST send warning to an attempt (TEACHER, ADMIN, SUPERADMIN)
const warnAttemptHandler = async (req, res) => {
  try {
    const attemptId = Number(req.params.attemptId);
    if (!attemptId || !Number.isInteger(attemptId) || attemptId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid attemptId is required.' });
    }

    const { attempt, error } = await checkAttemptStaffAccess(req, attemptId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const message = req.body.message ? String(req.body.message).trim() : '';
    if (!message || message.length < 1 || message.length > 200) {
      return res.status(400).json({
        success: false,
        message: 'Warning message is required and must be between 1 and 200 characters.'
      });
    }

    const warnRes = await req.db.query(
      `INSERT INTO exam_warnings (attempt_id, message, sent_by, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       RETURNING id, attempt_id, message, sent_by, created_at, seen_at`,
      [attempt.id, message, req.user.id]
    );

    return res.status(201).json({
      success: true,
      message: 'Warning sent successfully.',
      data: warnRes.rows[0]
    });
  } catch (error) {
    console.error('Warn attempt error:', error);
    return res.status(500).json({ success: false, message: 'Could not send warning.' });
  }
};

router.post('/attempts/:attemptId/warn', warnAttemptHandler);

// 8. GET attempt details (for results review: student answers vs correct keys, leave events)
const getAttemptDetailsHandler = async (req, res) => {
  try {
    const attemptId = Number(req.params.attemptId);
    if (!attemptId || !Number.isInteger(attemptId) || attemptId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid attemptId is required.' });
    }

    const { attempt, error } = await checkAttemptStaffAccess(req, attemptId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    // Fetch student info
    const studentRes = await req.db.query(
      `SELECT s.id, s.full_name, s.admission_number, c.name AS class_name
       FROM students s
       JOIN classes c ON c.id = s.class_id
       WHERE s.id = $1`,
      [attempt.student_id]
    );

    // Fetch exam info
    const examRes = await req.db.query(
      `SELECT id, title, subject, term, total_marks, duration_minutes, max_leaves FROM exams WHERE id = $1`,
      [attempt.exam_id]
    );

    // Fetch questions and keys
    const questionsRes = await req.db.query(
      `SELECT q.id, q.question_number, q.question_text, q.image_url, q.type,
              qk.correct_label,
              ans.selected_label,
              ans.answered_at
       FROM questions q
       LEFT JOIN question_keys qk ON qk.question_id = q.id
       LEFT JOIN attempt_answers ans ON ans.attempt_id = $1 AND ans.question_id = q.id
       WHERE q.exam_id = $2
       ORDER BY q.question_number ASC`,
      [attempt.id, attempt.exam_id]
    );

    const questionIds = questionsRes.rows.map((q) => q.id);
    let optionsByQuestion = {};
    if (questionIds.length > 0) {
      const optRes = await req.db.query(
        `SELECT id, question_id, label, option_text, image_url
         FROM question_options
         WHERE question_id = ANY($1::int[])
         ORDER BY label ASC`,
        [questionIds]
      );
      optRes.rows.forEach((opt) => {
        if (!optionsByQuestion[opt.question_id]) optionsByQuestion[opt.question_id] = [];
        optionsByQuestion[opt.question_id].push(opt);
      });
    }

    const questions = questionsRes.rows.map((q) => ({
      ...q,
      is_correct: q.selected_label && q.correct_label ? q.selected_label === q.correct_label : false,
      options: optionsByQuestion[q.id] || []
    }));

    // Fetch leave events
    const eventsRes = await req.db.query(
      `SELECT id, event_type, occurred_at
       FROM attempt_events
       WHERE attempt_id = $1
       ORDER BY occurred_at ASC`,
      [attempt.id]
    );

    return res.json({
      success: true,
      data: {
        attempt,
        student: studentRes.rows[0] || null,
        exam: examRes.rows[0] || null,
        questions,
        leave_events: eventsRes.rows
      }
    });
  } catch (error) {
    console.error('Get attempt details error:', error);
    return res.status(500).json({ success: false, message: 'Could not fetch attempt details.' });
  }
};

router.get('/attempts/:attemptId/details', getAttemptDetailsHandler);

// 9. POST release questions for students
const releaseQuestionsHandler = async (req, res) => {
  try {
    const examId = Number(req.params.id);
    const { exam, error } = await checkExamAccess(req, examId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const { student_ids, release } = req.body;
    if (!Array.isArray(student_ids) || student_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'student_ids array is required.' });
    }

    const validStudentIds = student_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    const doRelease = release !== false;

    if (doRelease) {
      for (const sid of validStudentIds) {
        await req.db.query(
          `INSERT INTO exam_releases (exam_id, student_id, released_by, released_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT (exam_id, student_id)
           DO UPDATE SET released_at = CURRENT_TIMESTAMP`,
          [examId, sid, req.user.id]
        );
      }
    } else {
      await req.db.query(
        `DELETE FROM exam_releases WHERE exam_id = $1 AND student_id = ANY($2::int[])`,
        [examId, validStudentIds]
      );
    }

    if (doRelease) {
      await logCbtActivity(
        req,
        `Released questions to ${validStudentIds.length} students: ${exam.subject} — ${exam.term} — ${exam.class_name}`
      );
    }

    return res.json({
      success: true,
      message: doRelease
        ? `Questions released to ${validStudentIds.length} student(s).`
        : `Questions unreleased for ${validStudentIds.length} student(s).`,
      count: validStudentIds.length
    });
  } catch (error) {
    console.error('Release questions error:', error);
    return res.status(500).json({ success: false, message: 'Could not update question release settings.' });
  }
};

router.post('/exams/:id/release-questions', releaseQuestionsHandler);

// =============================================================
// STUDENT HELPER FUNCTIONS
// =============================================================

function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a.trim());
  const bufB = Buffer.from(b.trim());
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function getStudentFromUser(req) {
  const result = await req.db.query(
    'SELECT * FROM students WHERE user_id = $1',
    [Number(req.user.id)]
  );
  if (result.rows.length === 0) {
    return { error: { status: 404, message: 'Student profile not found for this account.' } };
  }
  return { student: result.rows[0] };
}

// Auto-submit helper: marks score on server and sets status to SUBMITTED
async function autoSubmitAttempt(dbOrPool, attemptId, submitType = 'AUTO_TIME') {
  const isPool = typeof dbOrPool.release !== 'function' && typeof dbOrPool.connect === 'function';
  const client = isPool ? await dbOrPool.connect() : dbOrPool;

  try {
    if (isPool) await client.query('BEGIN');

    const attRes = await client.query(
      `SELECT a.id, a.exam_id, a.student_id, a.batch_student_id, a.submitted_at, a.deadline_at, e.total_marks
       FROM attempts a
       JOIN exams e ON e.id = a.exam_id
       WHERE a.id = $1`,
      [attemptId]
    );
    if (attRes.rows.length === 0) {
      if (isPool) await client.query('COMMIT');
      return null;
    }

    const att = attRes.rows[0];
    if (att.submitted_at) {
      if (isPool) await client.query('COMMIT');
      return att;
    }

    const totalQRes = await client.query(
      'SELECT COUNT(*)::int AS total FROM questions WHERE exam_id = $1',
      [att.exam_id]
    );
    const totalQuestions = totalQRes.rows[0].total;

    // Temporarily elevate role setting to SUPERADMIN to allow reading question_keys under RLS
    const prevRoleRes = await client.query("SELECT current_setting('app.current_role', true) AS role");
    const prevRole = prevRoleRes.rows[0]?.role || 'STUDENT';
    await client.query("SELECT set_config('app.current_role', 'SUPERADMIN', true)");

    const correctRes = await client.query(
      `SELECT COUNT(*)::int AS correct
       FROM attempt_answers aa
       JOIN question_keys qk ON qk.question_id = aa.question_id
       WHERE aa.attempt_id = $1 AND aa.selected_label = qk.correct_label`,
      [attemptId]
    );
    const correctCount = correctRes.rows[0].correct;

    if (!isPool) {
      await client.query("SELECT set_config('app.current_role', $1, true)", [prevRole]);
    }

    const totalMarks = Number(att.total_marks) || 60;
    const score = totalQuestions > 0 ? Number(((correctCount / totalQuestions) * totalMarks).toFixed(2)) : 0;

    await client.query(
      `UPDATE attempts
       SET submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP),
           submit_type = $1,
           correct_count = $2,
           score = $3
       WHERE id = $4 AND submitted_at IS NULL`,
      [submitType, correctCount, score, attemptId]
    );

    if (att.batch_student_id) {
      await client.query(
        `UPDATE batch_students
         SET status = 'SUBMITTED'
         WHERE id = $1`,
        [att.batch_student_id]
      );
    }

    if (isPool) await client.query('COMMIT');
    return { id: attemptId, score, correctCount, finalized: true };
  } catch (err) {
    if (isPool) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    throw err;
  } finally {
    if (isPool) client.release();
  }
}

// Background auto-submit sweep every 30 seconds
const autoSubmitSweep = async () => {
  try {
    const expiredRes = await pool.query(
      `SELECT id FROM attempts
       WHERE submitted_at IS NULL
         AND deadline_at <= CURRENT_TIMESTAMP`
    );
    for (const row of expiredRes.rows) {
      await autoSubmitAttempt(pool, row.id, 'AUTO_TIME');
    }
  } catch (err) {
    console.error('CBT Auto-submit sweep error:', err.message);
  }
};

const sweepInterval = setInterval(autoSubmitSweep, 30000);
if (sweepInterval.unref) {
  sweepInterval.unref();
}

// =============================================================
// STUDENT CBT ROUTES (STUDENT role only)
// =============================================================

// 1. GET my available exams: only exams where I am in a LIVE batch. Return no questions.
const getStudentAvailableExamsHandler = async (req, res) => {
  try {
    const { student, error } = await getStudentFromUser(req);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    // Auto-submit any expired attempt for this student before returning
    const studentExpiredAttempts = await req.db.query(
      `SELECT id FROM attempts
       WHERE student_id = $1
         AND submitted_at IS NULL
         AND deadline_at <= CURRENT_TIMESTAMP`,
      [student.id]
    );
    for (const exp of studentExpiredAttempts.rows) {
      await autoSubmitAttempt(req.db, exp.id, 'AUTO_TIME');
    }

    // Query exams where student has an active batch_students entry in a LIVE batch
    const examsResult = await req.db.query(
      `SELECT
         e.id AS exam_id,
         e.title,
         e.subject,
         e.term,
         e.duration_minutes,
         e.total_marks,
         eb.id AS batch_id,
         eb.status AS batch_status,
         bs.id AS batch_student_id,
         bs.status AS student_status,
         bs.code_attempts,
         att.id AS attempt_id,
         att.started_at AS attempt_started_at,
         att.deadline_at AS attempt_deadline_at,
         att.submitted_at AS attempt_submitted_at
       FROM batch_students bs
       JOIN exam_batches eb ON eb.id = bs.batch_id
       JOIN exams e ON e.id = eb.exam_id
       LEFT JOIN attempts att ON att.exam_id = e.id AND att.student_id = bs.student_id
       WHERE bs.student_id = $1
         AND eb.status = 'LIVE'
         AND e.status = 'PUBLISHED'
       ORDER BY eb.started_at DESC`,
      [student.id]
    );

    return res.json({
      success: true,
      data: examsResult.rows
    });
  } catch (error) {
    console.error('Get student available exams error:', error);
    return res.status(500).json({ success: false, message: 'Could not fetch available exams.' });
  }
};

router.get('/student/exams', getStudentAvailableExamsHandler);
router.get('/student/available-exams', getStudentAvailableExamsHandler);

const getStudentReleasedQuestionsHandler = async (req, res) => {
  try {
    const { student, error } = await getStudentFromUser(req);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const questionsResult = await req.db.query(
      `SELECT e.id AS exam_id, e.title, e.subject, e.term,
              q.id AS question_id, q.position, q.type, q.body_text,
              q.image_url AS question_image_url,
              qo.id AS option_id, qo.label, qo.option_text,
              qo.image_url AS option_image_url
       FROM exam_releases er
       JOIN exams e ON e.id = er.exam_id
       JOIN questions q ON q.exam_id = e.id
       LEFT JOIN question_options qo ON qo.question_id = q.id
       WHERE er.student_id = $1
         AND er.released_at IS NOT NULL
       ORDER BY er.released_at DESC, e.id DESC, q.position ASC, qo.label ASC`,
      [student.id]
    );

    const exams = new Map();
    for (const row of questionsResult.rows) {
      if (!exams.has(row.exam_id)) {
        exams.set(row.exam_id, {
          exam_id: row.exam_id,
          title: row.title,
          subject: row.subject,
          term: row.term,
          questions: []
        });
      }

      const exam = exams.get(row.exam_id);
      let question = exam.questions[exam.questions.length - 1];
      if (!question || question.id !== row.question_id) {
        question = {
          id: row.question_id,
          position: row.position,
          type: row.type,
          body_text: row.body_text,
          image_url: row.question_image_url,
          options: []
        };
        exam.questions.push(question);
      }

      if (row.option_id !== null) {
        question.options.push({
          id: row.option_id,
          label: row.label,
          option_text: row.option_text,
          image_url: row.option_image_url
        });
      }
    }

    return res.json({ success: true, data: Array.from(exams.values()) });
  } catch (error) {
    console.error('Get student released questions error:', error);
    return res.status(500).json({ success: false, message: 'Could not fetch released questions.' });
  }
};

router.get('/student/released-questions', getStudentReleasedQuestionsHandler);

// 2. POST enter code: compare with batch code (timing-safe).
// 5 wrong attempts sets code_locked_until = now + 30s and inserts a batch_alerts row.
// Correct code sets CODE_ENTERED and resets code_attempts to 0.
const studentEnterCodeHandler = async (req, res) => {
  try {
    const { student, error } = await getStudentFromUser(req);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const code = req.body.code ? String(req.body.code).trim() : '';
    if (!code) {
      return res.status(400).json({ success: false, message: 'Batch access code is required.' });
    }

    const examId = req.params.id ? Number(req.params.id) : (req.body.exam_id ? Number(req.body.exam_id) : null);
    const batchId = req.body.batch_id ? Number(req.body.batch_id) : null;

    // Find the live batch_students record for this student
    const bsResult = await req.db.query(
      `SELECT bs.*, 
              EXTRACT(EPOCH FROM (bs.code_locked_until - CURRENT_TIMESTAMP))::int AS lock_remaining_seconds,
              eb.access_code, eb.status AS batch_status, e.id AS exam_id, e.title AS exam_title
       FROM batch_students bs
       JOIN exam_batches eb ON eb.id = bs.batch_id
       JOIN exams e ON e.id = eb.exam_id
       WHERE bs.student_id = $1
         AND ($2::int IS NULL OR e.id = $2)
         AND ($3::int IS NULL OR eb.id = $3)
         AND eb.status = 'LIVE'
       ORDER BY eb.id DESC
       LIMIT 1`,
      [student.id, examId, batchId]
    );

    if (bsResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No live exam batch found for your account.' });
    }

    const batchStudent = bsResult.rows[0];

    // While code_locked_until is in the future, refuse ALL code attempts, even a correct one
    const lockRemaining = Number(batchStudent.lock_remaining_seconds || 0);
    if (lockRemaining > 0) {
      return res.status(429).json({
        success: false,
        message: 'Please wait before trying again.',
        retryAfterSeconds: lockRemaining
      });
    }

    if (batchStudent.status === 'LOCKED_OUT') {
      return res.status(403).json({
        success: false,
        message: 'You have been locked out. Please contact your invigilator.',
        status: 'LOCKED_OUT'
      });
    }

    if (batchStudent.status === 'SUBMITTED') {
      return res.status(400).json({ success: false, message: 'You have already submitted this exam.' });
    }

    // Compare entered code with batch access code using timing-safe comparison
    const isMatch = timingSafeCompare(code, batchStudent.access_code);

    if (!isMatch) {
      const newAttempts = Number(batchStudent.code_attempts || 0) + 1;
      if (newAttempts >= 5) {
        await req.db.query(
          `UPDATE batch_students
           SET code_attempts = 0,
               code_locked_until = CURRENT_TIMESTAMP + INTERVAL '30 seconds'
           WHERE id = $1`,
          [batchStudent.id]
        );

        await req.db.query(
          `INSERT INTO batch_alerts (batch_id, student_id, alert_type, detail)
           VALUES ($1, $2, 'WRONG_CODES', 'Several wrong codes in a row')`,
          [batchStudent.batch_id, student.id]
        );

        await req.db.query('COMMIT');
        req.dbTransactionCommitted = true;

        return res.status(429).json({
          success: false,
          message: 'Please wait before trying again.',
          retryAfterSeconds: 30
        });
      } else {
        await req.db.query(
          `UPDATE batch_students
           SET code_attempts = $1
           WHERE id = $2`,
          [newAttempts, batchStudent.id]
        );
        await req.db.query('COMMIT');
        req.dbTransactionCommitted = true;

        return res.status(400).json({
          success: false,
          message: 'Incorrect access code.'
        });
      }
    }

    // Code is correct: update status to CODE_ENTERED and reset code_attempts
    await req.db.query(
      `UPDATE batch_students
       SET status = 'CODE_ENTERED', code_attempts = 0, code_locked_until = NULL
       WHERE id = $1`,
      [batchStudent.id]
    );
    await req.db.query('COMMIT');
    req.dbTransactionCommitted = true;

    // Questions are intentionally NOT returned here
    return res.json({
      success: true,
      message: 'Code accepted. You may now start your exam.',
      status: 'CODE_ENTERED',
      exam_id: batchStudent.exam_id,
      batch_id: batchStudent.batch_id
    });
  } catch (error) {
    console.error('Student enter code error:', error);
    return res.status(500).json({ success: false, message: 'Could not process batch code.' });
  }
};

router.post('/student/enter-code', studentEnterCodeHandler);
router.post('/student/exams/:id/enter-code', studentEnterCodeHandler);

// 3. POST start: only if CODE_ENTERED. Create attempt with deadline_at = now() + duration, random device_token, and shuffle_map. Return questions and options with images, NEVER correct answers. Calling start again after a refresh returns the same order and same deadline.
const studentStartExamHandler = async (req, res) => {
  try {
    const { student, error } = await getStudentFromUser(req);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const examId = Number(req.params.id || req.body.exam_id);
    if (!examId || isNaN(examId)) {
      return res.status(400).json({ success: false, message: 'A valid exam_id is required.' });
    }

    // Look up student's batch entry for this exam
    const bsResult = await req.db.query(
      `SELECT bs.*, eb.status AS batch_status, e.title, e.subject, e.duration_minutes, e.total_marks, e.shuffle
       FROM batch_students bs
       JOIN exam_batches eb ON eb.id = bs.batch_id
       JOIN exams e ON e.id = eb.exam_id
       WHERE bs.student_id = $1 AND e.id = $2
       ORDER BY bs.id DESC
       LIMIT 1`,
      [student.id, examId]
    );

    if (bsResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'You are not enrolled in a batch for this exam.' });
    }

    const batchStudent = bsResult.rows[0];

    if (batchStudent.status === 'LOCKED_OUT') {
      return res.status(403).json({ success: false, message: 'You are locked out of this exam. Please contact your invigilator.' });
    }

    if (batchStudent.status === 'SUBMITTED') {
      return res.status(400).json({ success: false, message: 'You have already submitted this exam.' });
    }

    // Check if an attempt already exists (One attempt per student per exam)
    const existingAttemptRes = await req.db.query(
      `SELECT * FROM attempts WHERE exam_id = $1 AND student_id = $2`,
      [examId, student.id]
    );

    let attempt;

    if (existingAttemptRes.rows.length > 0) {
      // Refresh / resume existing attempt
      attempt = existingAttemptRes.rows[0];

      if (attempt.submitted_at) {
        return res.status(400).json({ success: false, message: 'You have already submitted this exam.' });
      }

      // Check if deadline has expired
      if (new Date() >= new Date(attempt.deadline_at)) {
        await autoSubmitAttempt(req.db, attempt.id, 'AUTO_TIME');
        await req.db.query('COMMIT');
        req.dbTransactionCommitted = true;
        return res.status(400).json({ success: false, message: 'Time expired. Your exam has been automatically submitted.' });
      }
    } else {
      // Must have entered code before starting
      if (batchStudent.status !== 'CODE_ENTERED') {
        return res.status(400).json({
          success: false,
          message: 'You must enter the batch access code before starting the exam.'
        });
      }

      // Generate server deadline
      const deadlineAt = new Date(Date.now() + batchStudent.duration_minutes * 60 * 1000);
      const deviceToken = crypto.randomBytes(32).toString('hex');

      // Fetch all questions for this exam
      const questionsRes = await req.db.query(
        `SELECT id FROM questions WHERE exam_id = $1 ORDER BY id ASC`,
        [examId]
      );

      const allQuestionIds = questionsRes.rows.map((q) => q.id);
      const questionOrder = batchStudent.shuffle ? shuffleArray(allQuestionIds) : allQuestionIds;

      // Fetch options for all questions
      const optionsRes = await req.db.query(
        `SELECT id, question_id FROM question_options WHERE question_id = ANY($1::int[]) ORDER BY question_id, id ASC`,
        [allQuestionIds]
      );

      const optionsByQuestion = {};
      for (const qId of allQuestionIds) {
        const qOptions = optionsRes.rows.filter((o) => o.question_id === qId);
        optionsByQuestion[qId] = batchStudent.shuffle ? shuffleArray(qOptions.map((o) => o.id)) : qOptions.map((o) => o.id);
      }

      const shuffleMap = {
        question_ids: questionOrder,
        options_by_question: optionsByQuestion
      };

      // Create new attempt
      const newAttRes = await req.db.query(
        `INSERT INTO attempts (
           exam_id, student_id, batch_student_id, started_at, deadline_at, shuffle_map, device_token
         )
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6)
         RETURNING *`,
        [examId, student.id, batchStudent.id, deadlineAt, shuffleMap, deviceToken]
      );
      attempt = newAttRes.rows[0];

      // Update student batch status to WRITING
      await req.db.query(
        `UPDATE batch_students SET status = 'WRITING' WHERE id = $1`,
        [batchStudent.id]
      );
    }

    // Load questions (NEVER correct_label) and assemble response according to shuffle_map
    const fullQuestionsRes = await req.db.query(
      `SELECT id, exam_id, type, body_text, image_url
       FROM questions
       WHERE exam_id = $1`,
      [examId]
    );

    const questionMap = new Map(fullQuestionsRes.rows.map((q) => [q.id, q]));
    const qIds = fullQuestionsRes.rows.map((q) => q.id);

    const fullOptionsRes = await req.db.query(
      `SELECT id, question_id, label, option_text, image_url
       FROM question_options
       WHERE question_id = ANY($1::int[])`,
      [qIds]
    );

    const optionMap = new Map(fullOptionsRes.rows.map((o) => [o.id, o]));

    // Query any previously saved answers for this attempt (for refresh support)
    const savedAnswersRes = await req.db.query(
      `SELECT question_id, selected_label FROM attempt_answers WHERE attempt_id = $1`,
      [attempt.id]
    );
    const answersMap = {};
    for (const ans of savedAnswersRes.rows) {
      answersMap[ans.question_id] = ans.selected_label;
    }

    const shuffleMap = attempt.shuffle_map || {};
    const orderedQuestionIds = shuffleMap.question_ids || fullQuestionsRes.rows.map((q) => q.id);
    const optionsOrder = shuffleMap.options_by_question || {};

    const formattedQuestions = [];
    for (const qId of orderedQuestionIds) {
      const q = questionMap.get(qId);
      if (!q) continue;

      const orderedOptionIds = optionsOrder[qId] || [];
      const formattedOptions = [];

      for (const optId of orderedOptionIds) {
        const opt = optionMap.get(optId);
        if (opt) {
          formattedOptions.push({
            id: opt.id,
            label: opt.label,
            option_text: opt.option_text,
            body_text: opt.option_text,
            image_url: opt.image_url
          });
        }
      }

      // If any options were not captured in shuffle_map, append them
      const includedOptIds = new Set(orderedOptionIds);
      for (const opt of fullOptionsRes.rows) {
        if (opt.question_id === qId && !includedOptIds.has(opt.id)) {
          formattedOptions.push({
            id: opt.id,
            label: opt.label,
            option_text: opt.option_text,
            body_text: opt.option_text,
            image_url: opt.image_url
          });
        }
      }

      formattedQuestions.push({
        id: q.id,
        type: q.type,
        body_text: q.body_text,
        image_url: q.image_url,
        options: formattedOptions,
        saved_answer: answersMap[q.id] || null
      });
    }

    return res.json({
      success: true,
      data: {
        attempt_id: attempt.id,
        exam_id: examId,
        title: batchStudent.title,
        duration_minutes: batchStudent.duration_minutes,
        started_at: attempt.started_at,
        deadline_at: attempt.deadline_at,
        device_token: attempt.device_token,
        questions: formattedQuestions,
        answers: answersMap
      }
    });
  } catch (error) {
    console.error('Student start exam error:', error);
    return res.status(500).json({ success: false, message: 'Could not start exam attempt.' });
  }
};

router.post('/student/exams/:id/start', studentStartExamHandler);
router.post('/student/start', studentStartExamHandler);

// 4. PUT save answer (single question): reject if past deadline or from a different device_token.
const studentSaveAnswerHandler = async (req, res) => {
  try {
    const { student, error } = await getStudentFromUser(req);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    let attemptId = Number(req.params.attemptId);

    // If route called via /student/exams/:id/answer
    if (!attemptId && req.params.id) {
      const examId = Number(req.params.id);
      const attLookup = await req.db.query(
        `SELECT id FROM attempts WHERE exam_id = $1 AND student_id = $2`,
        [examId, student.id]
      );
      if (attLookup.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Active exam attempt not found.' });
      }
      attemptId = attLookup.rows[0].id;
    }

    const { question_id, selected_label } = req.body;
    if (!question_id || !selected_label) {
      return res.status(400).json({ success: false, message: 'question_id and selected_label are required.' });
    }

    const label = String(selected_label).trim().toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(label)) {
      return res.status(400).json({ success: false, message: 'selected_label must be A, B, C, or D.' });
    }

    const attemptRes = await req.db.query(
      `SELECT a.*, e.id AS exam_id
       FROM attempts a
       JOIN exams e ON e.id = a.exam_id
       WHERE a.id = $1 AND a.student_id = $2`,
      [attemptId, student.id]
    );

    if (attemptRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Attempt not found or access denied.' });
    }

    const attempt = attemptRes.rows[0];

    if (attempt.submitted_at) {
      return res.status(400).json({ success: false, message: 'Exam has already been submitted.' });
    }

    // Verify device token
    const clientToken = req.headers['x-device-token'] || req.body.device_token;
    if (!clientToken || !timingSafeCompare(String(clientToken), attempt.device_token)) {
      return res.status(403).json({
        success: false,
        message: 'Invalid device token. You cannot submit answers from a different browser or device.'
      });
    }

    // Verify deadline
    if (new Date() >= new Date(attempt.deadline_at)) {
      await autoSubmitAttempt(req.db, attempt.id, 'AUTO_TIME');
      await req.db.query('COMMIT');
      req.dbTransactionCommitted = true;
      return res.status(400).json({
        success: false,
        message: 'Time expired. Your exam has been automatically submitted.'
      });
    }

    // Verify question belongs to this exam
    const qCheck = await req.db.query(
      `SELECT id FROM questions WHERE id = $1 AND exam_id = $2`,
      [Number(question_id), attempt.exam_id]
    );
    if (qCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Question does not belong to this exam.' });
    }

    // Save answer atomically
    await req.db.query(
      `INSERT INTO attempt_answers (attempt_id, question_id, selected_label, answered_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (attempt_id, question_id)
       DO UPDATE SET selected_label = EXCLUDED.selected_label, answered_at = EXCLUDED.answered_at`,
      [attempt.id, Number(question_id), label]
    );

    return res.json({
      success: true,
      message: 'Answer saved successfully.',
      question_id: Number(question_id),
      selected_label: label
    });
  } catch (error) {
    console.error('Save answer error:', error);
    return res.status(500).json({ success: false, message: 'Could not save answer.' });
  }
};

router.put('/student/attempts/:attemptId/answer', studentSaveAnswerHandler);
router.put('/student/exams/:id/answer', studentSaveAnswerHandler);

const lastLeaveEventByAttempt = new Map();

// 5. POST leave event (TAB_HIDDEN or FULLSCREEN_EXIT)
const studentLeaveEventHandler = async (req, res) => {
  try {
    const { student, error } = await getStudentFromUser(req);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    let attemptId = Number(req.params.attemptId);

    // If route called via /student/exams/:id/event
    if (!attemptId && req.params.id) {
      const examId = Number(req.params.id);
      const attLookup = await req.db.query(
        `SELECT id FROM attempts WHERE exam_id = $1 AND student_id = $2`,
        [examId, student.id]
      );
      if (attLookup.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Active attempt not found.' });
      }
      attemptId = attLookup.rows[0].id;
    }

    const { event_type } = req.body;
    if (!['TAB_HIDDEN', 'FULLSCREEN_EXIT'].includes(event_type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event_type. Must be 'TAB_HIDDEN' or 'FULLSCREEN_EXIT'."
      });
    }

    const attemptRes = await req.db.query(
      `SELECT a.id, a.exam_id, a.student_id, a.batch_student_id, a.submitted_at, 
              COALESCE(e.max_leaves, 3)::int AS max_leaves,
              COALESCE(bs.batch_id, (SELECT eb.id FROM exam_batches eb JOIN batch_students bs2 ON bs2.batch_id = eb.id WHERE bs2.student_id = a.student_id AND eb.exam_id = a.exam_id ORDER BY eb.id DESC LIMIT 1)) AS batch_id
       FROM attempts a
       JOIN exams e ON e.id = a.exam_id
       LEFT JOIN batch_students bs ON bs.id = a.batch_student_id
       WHERE a.id = $1 AND a.student_id = $2`,
      [attemptId, student.id]
    );
    if (attemptRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Attempt not found or access denied.' });
    }

    const attempt = attemptRes.rows[0];
    const maxLeaves = Number(attempt.max_leaves) || 3;

    // Ignore events for attempts already submitted
    if (attempt.submitted_at) {
      const currentLeavesRes = await req.db.query(
        `SELECT COUNT(*)::int AS count FROM attempt_events WHERE attempt_id = $1`,
        [attemptId]
      );
      await req.db.query('COMMIT');
      req.dbTransactionCommitted = true;
      return res.json({
        leaves: currentLeavesRes.rows[0].count,
        maxLeaves,
        autoSubmitted: true
      });
    }

    // Ignore new event if the same attempt already has an event in the last 2 seconds.
    const lastEventTime = lastLeaveEventByAttempt.get(attemptId);
    let isDebounced = false;
    if (lastEventTime && (Date.now() - lastEventTime) < 2000) {
      isDebounced = true;
    }

    if (isDebounced) {
      const currentLeavesRes = await req.db.query(
        `SELECT COUNT(*)::int AS count FROM attempt_events WHERE attempt_id = $1`,
        [attemptId]
      );
      await req.db.query('COMMIT');
      req.dbTransactionCommitted = true;
      return res.json({
        leaves: currentLeavesRes.rows[0].count,
        maxLeaves,
        autoSubmitted: false
      });
    }

    // Save the event with clock_timestamp()
    await req.db.query(
      `INSERT INTO attempt_events (attempt_id, event_type, occurred_at)
       VALUES ($1, $2, clock_timestamp())`,
      [attemptId, event_type]
    );

    // Get current leave count so far
    const countRes = await req.db.query(
      `SELECT COUNT(*)::int AS count FROM attempt_events WHERE attempt_id = $1`,
      [attemptId]
    );
    const n = countRes.rows[0].count;

    // Insert a batch_alerts row for that student's batch with detail 'Leave #n'
    if (attempt.batch_id) {
      await req.db.query(
        `INSERT INTO batch_alerts (batch_id, student_id, alert_type, detail)
         VALUES ($1, $2, $3, $4)`,
        [attempt.batch_id, student.id, event_type, `Leave #${n}`]
      );
    }

    // If the count is greater than or equal to the exam's max_leaves, auto-submit
    if (n >= maxLeaves) {
      lastLeaveEventByAttempt.delete(attemptId);
      await autoSubmitAttempt(req.db, attempt.id, 'AUTO_LEAVES');

      if (attempt.batch_student_id) {
        await req.db.query(
          `UPDATE batch_students SET status = 'SUBMITTED' WHERE id = $1`,
          [attempt.batch_student_id]
        );
      }

      if (attempt.batch_id) {
        await req.db.query(
          `INSERT INTO batch_alerts (batch_id, student_id, alert_type, detail)
           VALUES ($1, $2, 'AUTO_SUBMITTED', $3)`,
          [attempt.batch_id, student.id, `Auto-submitted after leaving the exam page ${n} times`]
        );
      }

      await req.db.query('COMMIT');
      req.dbTransactionCommitted = true;

      return res.json({
        leaves: n,
        maxLeaves,
        autoSubmitted: true
      });
    }

    await req.db.query('COMMIT');
    req.dbTransactionCommitted = true;

    // Record timestamp after successful commit so rapid subsequent requests are debounced
    lastLeaveEventByAttempt.set(attemptId, Date.now());

    return res.json({
      leaves: n,
      maxLeaves,
      autoSubmitted: false
    });
  } catch (error) {
    console.error('Record leave event error:', error);
    return res.status(500).json({ success: false, message: 'Could not record event.' });
  }
};

router.post('/student/attempts/:attemptId/event', studentLeaveEventHandler);
router.post('/student/exams/:id/event', studentLeaveEventHandler);

// 6. GET warnings for an attempt (STUDENT only, only their own attempt)
const getMyAttemptWarningsHandler = async (req, res) => {
  try {
    const { student, error } = await getStudentFromUser(req);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    let attemptId = Number(req.params.attemptId);
    if (!attemptId && req.params.id) {
      const examId = Number(req.params.id);
      const attLookup = await req.db.query(
        `SELECT id FROM attempts WHERE exam_id = $1 AND student_id = $2`,
        [examId, student.id]
      );
      if (attLookup.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Active attempt not found.' });
      }
      attemptId = attLookup.rows[0].id;
    }

    if (!attemptId || !Number.isInteger(attemptId) || attemptId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid attemptId is required.' });
    }

    // Verify attempt belongs to this student
    const attCheck = await req.db.query(
      `SELECT id FROM attempts WHERE id = $1 AND student_id = $2`,
      [attemptId, student.id]
    );
    if (attCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Attempt not found or access denied.' });
    }

    // Fetch unseen warnings
    const warningsRes = await req.db.query(
      `SELECT id, attempt_id, message, sent_by, created_at, seen_at
       FROM exam_warnings
       WHERE attempt_id = $1 AND seen_at IS NULL
       ORDER BY id ASC`,
      [attemptId]
    );

    // Mark warnings as seen
    if (warningsRes.rows.length > 0) {
      await req.db.query(
        `UPDATE exam_warnings
         SET seen_at = CURRENT_TIMESTAMP
         WHERE attempt_id = $1 AND seen_at IS NULL`,
        [attemptId]
      );
      await req.db.query('COMMIT');
      req.dbTransactionCommitted = true;
    }

    return res.json({
      success: true,
      data: warningsRes.rows
    });
  } catch (error) {
    console.error('Get attempt warnings error:', error);
    return res.status(500).json({ success: false, message: 'Could not fetch exam warnings.' });
  }
};

router.get('/my-attempts/:attemptId/warnings', getMyAttemptWarningsHandler);
router.get('/student/attempts/:attemptId/warnings', getMyAttemptWarningsHandler);
router.get('/student/exams/:id/warnings', getMyAttemptWarningsHandler);

// 6. POST submit: mark on the server, store correct_count and score (scaled to total_marks), set status SUBMITTED. Return only { success: true, message: 'Exam submitted successfully' }. The student must never receive a score.
const studentSubmitExamHandler = async (req, res) => {
  try {
    const { student, error } = await getStudentFromUser(req);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    let attemptId = Number(req.params.attemptId);

    // If route called via /student/exams/:id/submit
    if (!attemptId && req.params.id) {
      const examId = Number(req.params.id);
      const attLookup = await req.db.query(
        `SELECT id FROM attempts WHERE exam_id = $1 AND student_id = $2`,
        [examId, student.id]
      );
      if (attLookup.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Active attempt not found.' });
      }
      attemptId = attLookup.rows[0].id;
    }

    const attemptRes = await req.db.query(
      `SELECT a.* FROM attempts a WHERE a.id = $1 AND a.student_id = $2`,
      [attemptId, student.id]
    );
    if (attemptRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Attempt not found or access denied.' });
    }

    const attempt = attemptRes.rows[0];

    // If device_token provided, verify it
    const clientToken = req.headers['x-device-token'] || req.body.device_token;
    if (clientToken && !timingSafeCompare(String(clientToken), attempt.device_token)) {
      return res.status(403).json({
        success: false,
        message: 'Invalid device token. You cannot submit from an unauthorized device.'
      });
    }

    // Auto-mark and submit attempt on server
    await autoSubmitAttempt(req.db, attempt.id, 'MANUAL');
    await req.db.query('COMMIT');
    req.dbTransactionCommitted = true;

    // Return strictly generic success message — NEVER send score to student
    return res.json({
      success: true,
      message: 'Exam submitted successfully'
    });
  } catch (error) {
    console.error('Student exam submit error:', error);
    return res.status(500).json({ success: false, message: 'Could not submit exam.' });
  }
};

router.post('/student/attempts/:attemptId/submit', studentSubmitExamHandler);
router.post('/student/exams/:id/submit', studentSubmitExamHandler);

module.exports = router;
