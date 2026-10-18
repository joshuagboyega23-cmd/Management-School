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

// All CBT routes require staff access
router.use(verifyToken, requireRole('TEACHER', 'ADMIN', 'SUPERADMIN'));

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
    // Class homeroom check (if assigned)
    if (exam.homeroom_teacher_id && Number(exam.homeroom_teacher_id) !== Number(req.user.id)) {
      return { error: { status: 403, message: 'Access denied: You can only manage exams for classes you teach.' } };
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
    const { title, subject, term, class_id, duration_minutes, total_marks, shuffle } = req.body;

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

    // Validate class existence & teacher assignment
    const classResult = await req.db.query(
      'SELECT id, name, homeroom_teacher_id FROM classes WHERE id = $1',
      [classId]
    );
    if (classResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Selected class does not exist.' });
    }

    const classRow = classResult.rows[0];
    const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(req.user.role);
    if (!isAdmin && classRow.homeroom_teacher_id && Number(classRow.homeroom_teacher_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Access denied: You can only create exams for classes you teach.' });
    }

    const insertResult = await req.db.query(
      `INSERT INTO exams (title, subject, term, class_id, created_by, duration_minutes, total_marks, shuffle, status, questions_locked)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'DRAFT', FALSE)
       RETURNING *`,
      [
        String(title).trim(),
        String(subject).trim(),
        String(term).trim(),
        classId,
        req.user.id,
        duration,
        marks,
        shuffleVal
      ]
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

    const { title, subject, term, class_id, duration_minutes, total_marks, shuffle } = req.body;

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

      const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(req.user.role);
      const classRow = classResult.rows[0];
      if (!isAdmin && classRow.homeroom_teacher_id && Number(classRow.homeroom_teacher_id) !== Number(req.user.id)) {
        return res.status(403).json({ success: false, message: 'Access denied: You can only assign exams to classes you teach.' });
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
           shuffle = $7
       WHERE id = $8
       RETURNING *`,
      [targetTitle, targetSubject, targetTerm, targetClassId, targetDuration, targetMarks, targetShuffle, exam.id]
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

// Delete Exam (while status is DRAFT)
router.delete('/exams/:id', async (req, res) => {
  try {
    const { error, exam } = await checkExamAccess(req, req.params.id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    if (exam.status !== 'DRAFT') {
      return res.status(400).json({ success: false, message: 'Only DRAFT exams can be deleted.' });
    }

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

    // Atomic replacement: Delete old questions for this exam and insert new ones
    await req.db.query('DELETE FROM questions WHERE exam_id = $1', [exam.id]);

    for (const q of sanitizedQuestions) {
      const qRes = await req.db.query(
        `INSERT INTO questions (exam_id, position, type, body_text)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [exam.id, q.position, q.type, q.body_text]
      );
      const questionId = qRes.rows[0].id;

      for (const opt of q.options) {
        await req.db.query(
          `INSERT INTO question_options (question_id, label, option_text)
           VALUES ($1, $2, $3)`,
          [questionId, opt.label, opt.text]
        );
      }

      await req.db.query(
        `INSERT INTO question_keys (question_id, correct_label)
         VALUES ($1, $2)`,
        [questionId, q.correct]
      );
    }

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
      `SELECT q.*, e.id AS exam_id, e.created_by, e.total_marks, c.homeroom_teacher_id
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

module.exports = router;
