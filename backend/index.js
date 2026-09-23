const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('./db');
require('dotenv').config();

// ─── Startup Guard ────────────────────────────────────────────────────────────
// Refuse to boot if critical environment variables are missing.
if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET environment variable is not set. Server refusing to start.');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('❌ FATAL: DATABASE_URL environment variable is not set. Server refusing to start.');
  process.exit(1);
}

const app = express();

// Rate limiter for self-registration endpoints (defense against admission number enumeration)
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 attempts per IP per hour
  message: {
    success: false,
    message: 'Too many registration attempts from this IP. Please try again after an hour.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Security and Middleware Configuration
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));

// Express JSON middleware with raw body capture for Paystack Webhook verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// =============================================================
// HELPER FUNCTIONS & MIDDLEWARES
// =============================================================

// Helper: Calculate Letter Grade, Grade Point, and Remark
function calculateGradeAndRemark(totalScore) {
  if (totalScore >= 70) return { grade: 'A', remark: 'Excellent' };
  if (totalScore >= 60) return { grade: 'B', remark: 'Very Good' };
  if (totalScore >= 50) return { grade: 'C', remark: 'Credit' };
  if (totalScore >= 45) return { grade: 'D', remark: 'Fair' };
  if (totalScore >= 40) return { grade: 'E', remark: 'Pass' };
  return { grade: 'F', remark: 'Fail - Needs Improvement' };
}

// Middleware: Authenticate JWT Token & Establish PostgreSQL Row-Level Security (RLS) Context
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Check out dedicated client for the request transaction to apply RLS
    const client = await pool.connect();
    req.db = client;

    // Open transaction & set RLS local session variables
    await client.query('BEGIN');
    await client.query(
      "SELECT set_config('app.current_user_id', $1, true), set_config('app.current_role', $2, true)",
      [String(decoded.id), String(decoded.role)]
    );

    let released = false;
    const cleanup = async () => {
      if (released) return;
      released = true;
      try {
        if (res.statusCode >= 400) {
          await client.query('ROLLBACK');
        } else {
          await client.query('COMMIT');
        }
      } catch (err) {
        // Suppress cleanup error if transaction was already concluded
      } finally {
        client.release();
      }
    };

    res.on('finish', cleanup);
    res.on('close', cleanup);

    next();
  } catch (error) {
    if (req.db) {
      try {
        await req.db.query('ROLLBACK');
        req.db.release();
      } catch (e) {}
    }
    return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
  }
};

// Middleware: Role-Based Authorization
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized action for your role.' });
    }
    next();
  };
};


// =============================================================
// INPUT VALIDATION — ZOD SCHEMAS & MIDDLEWARE
// =============================================================
const { z } = require('zod');

// Reusable field definitions
const emailField = z.string().email('Must be a valid email address');
const passwordField = z.string().min(8, 'Password must be at least 8 characters');
const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

// Schemas
const schemas = {
  login: z.object({
    email: emailField,
    password: z.string().min(1, 'Password is required')
  }),

  adminRegister: z.object({
    full_name: z.string().min(2, 'Full name must be at least 2 characters'),
    email: emailField,
    password: passwordField,
    role: z.enum(['ADMIN', 'TEACHER'], { errorMap: () => ({ message: "Role must be 'ADMIN' or 'TEACHER'" }) })
  }),

  studentSelfRegister: z.object({
    fullName: z.string().min(2, 'Full name is required'),
    email: emailField,
    password: passwordField,
    admissionNumber: z.string().min(3, 'Admission number is required'),
    dateOfBirth: dateField
  }),

  parentSelfRegister: z.object({
    fullName: z.string().min(2, 'Full name is required'),
    email: emailField,
    password: passwordField,
    admissionNumber: z.string().min(3, 'Admission number is required'),
    dateOfBirth: dateField,
    relationship: z.string().optional()
  }),

  importStudents: z.array(
    z.object({
      fullName: z.string().min(2, 'Student full name is required'),
      dateOfBirth: dateField,
      className: z.string().min(1, 'Class name is required')
    })
  ).min(1, 'At least one student record is required'),

  gradeSubmit: z.object({
    studentId: z.number().int().positive('studentId must be a positive integer'),
    term: z.enum(['First Term', 'Second Term', 'Third Term'], {
      errorMap: () => ({ message: "Term must be 'First Term', 'Second Term', or 'Third Term'" })
    }),
    subject: z.string().min(2, 'Subject name is required'),
    caScore: z.number().min(0).max(40, 'CA score must be between 0 and 40'),
    examScore: z.number().min(0).max(60, 'Exam score must be between 0 and 60')
  }),

  paymentInit: z.object({
    studentId: z.number().int().positive('studentId must be a positive integer'),
    amount: z.number().positive('Amount must be a positive number'),
    email: emailField,
    term: z.string().min(1, 'Term is required')
  }),

  payrollProcess: z.object({
    staffId: z.number().int().positive('staffId must be a positive integer'),
    amount: z.number().positive('Amount must be a positive number').optional(),
    monthYear: z.string().regex(/^\d{4}-\d{2}$/, "monthYear must be in YYYY-MM format")
  })
};

/**
 * Middleware factory: validates req.body against a Zod schema.
 * On failure returns 400 with field-level error messages.
 */
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message
    }));
    return res.status(400).json({ success: false, message: 'Validation failed', errors });
  }
  req.body = result.data; // replace with coerced/safe data
  next();
};

// =============================================================
// HEALTH CHECK
// =============================================================
app.get('/', (req, res) => {
  res.json({
    status: 'Active',
    message: 'School Management System API is running smoothly.',
    timestamp: new Date()
  });
});

// =============================================================
// 1. AUTHENTICATION MODULE
// =============================================================

// Admin direct-create flow: restricted to ADMIN and TEACHER accounts only
app.post('/api/auth/register', verifyToken, requireRole('ADMIN', 'SUPERADMIN'), validate(schemas.adminRegister), async (req, res) => {
  const { full_name, email, password, role, staff_id, subjects_taught } = req.body;

  if (!full_name || !email || !password || !role) {
    return res.status(400).json({ success: false, message: 'full_name, email, password, and role are required.' });
  }

  if (!['ADMIN', 'TEACHER'].includes(role)) {
    return res.status(400).json({
      success: false,
      message: 'Direct account creation is restricted to ADMIN and TEACHER roles only. Students and parents must register using their admission number.'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userExists = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Email already registered.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, full_name, email, role, created_at`,
      [full_name, email, hashedPassword, role]
    );

    if (role === 'TEACHER') {
      const generatedStaffId = staff_id || `STF-${Date.now().toString().slice(-4)}`;
      await client.query(
        `INSERT INTO teachers (user_id, staff_id, subjects_taught)
         VALUES ($1, $2, $3)`,
        [newUser.rows[0].id, generatedStaffId, subjects_taught || []]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: `${role} account created successfully`,
      user: newUser.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// Admin-only: Import student roster pre-load (CSV or JSON Array)
app.post('/api/auth/admin/import-students', verifyToken, requireRole('ADMIN', 'SUPERADMIN'), validate(schemas.importStudents), async (req, res) => {
  let studentList = [];

  if (Array.isArray(req.body)) {
    studentList = req.body;
  } else if (Array.isArray(req.body?.students)) {
    studentList = req.body.students;
  } else if (typeof req.body === 'string' || req.body?.csv) {
    const csvContent = typeof req.body === 'string' ? req.body : req.body.csv;
    const lines = csvContent.trim().split(/\r?\n/);
    if (lines.length > 1) {
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',').map(v => v.trim());
        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx]; });
        studentList.push({
          fullName: row.fullname || row.name || values[0],
          dateOfBirth: row.dateofbirth || row.dob || values[1],
          className: row.classname || row.class || values[2]
        });
      }
    }
  }

  if (!studentList || studentList.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No student records provided. Please send a JSON array or CSV text with fullName, dateOfBirth, and className.'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const currentYear = new Date().getFullYear();

    // Query highest current sequence number for PHA-{year}-{sequence}
    const lastAdmission = await client.query(
      `SELECT admission_number FROM students 
       WHERE admission_number LIKE $1 
       ORDER BY id DESC LIMIT 1`,
      [`PHA-${currentYear}-%`]
    );

    let nextSeq = 1;
    if (lastAdmission.rows.length > 0) {
      const parts = lastAdmission.rows[0].admission_number.split('-');
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) nextSeq = lastNum + 1;
    }

    const imported = [];

    for (const item of studentList) {
      const fullName = item.fullName || item.full_name || item.name;
      const dateOfBirth = item.dateOfBirth || item.date_of_birth || item.dob;
      const className = item.className || item.class_name || item.class;

      if (!fullName || !dateOfBirth) {
        throw new Error(`Missing fullName or dateOfBirth for record: ${JSON.stringify(item)}`);
      }

      // Look up class_id by className
      let classId = null;
      if (className) {
        const classRes = await client.query(
          'SELECT id FROM classes WHERE LOWER(name) = LOWER($1)',
          [className.trim()]
        );
        if (classRes.rows.length > 0) {
          classId = classRes.rows[0].id;
        } else {
          const levelMatch = className.trim().toUpperCase().match(/^(JSS1|JSS2|JSS3|SS1|SS2|SS3)/);
          const level = levelMatch ? levelMatch[1] : 'JSS1';
          const newClass = await client.query(
            `INSERT INTO classes (name, level, academic_session) 
             VALUES ($1, $2, $3) 
             RETURNING id`,
            [className.trim().toUpperCase(), level, `${currentYear}/${currentYear + 1}`]
          );
          classId = newClass.rows[0].id;
        }
      }

      const admissionNumber = `PHA-${currentYear}-${String(nextSeq++).padStart(4, '0')}`;

      const inserted = await client.query(
        `INSERT INTO students (full_name, date_of_birth, class_id, admission_number)
         VALUES ($1, $2, $3, $4)
         RETURNING id, full_name, admission_number, class_id, date_of_birth`,
        [fullName.trim(), dateOfBirth, classId, admissionNumber]
      );

      imported.push(inserted.rows[0]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: `Successfully imported ${imported.length} student records.`,
      students: imported
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// Public: Student self-registration with Admission Number + DOB matching
app.post('/api/auth/register/student', registrationLimiter, validate(schemas.studentSelfRegister), async (req, res) => {
  const { fullName, email, password, admissionNumber, dateOfBirth } = req.body;
  const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';

  if (!email || !password || !admissionNumber || !dateOfBirth) {
    return res.status(400).json({
      success: false,
      message: 'Email, password, admissionNumber, and dateOfBirth are required.'
    });
  }

  const isValidDate = !isNaN(Date.parse(dateOfBirth));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Look up unclaimed student matching admission_number and date_of_birth
    const studentRes = await client.query(
      `SELECT * FROM students 
       WHERE LOWER(admission_number) = LOWER($1) 
         AND date_of_birth = $2 
         AND user_id IS NULL 
       FOR UPDATE`,
      [admissionNumber.trim(), dateOfBirth]
    );

    if (studentRes.rows.length === 0) {
      // Log attempt with matched=false
      await client.query(
        `INSERT INTO registration_attempts (admission_number_entered, dob_entered, matched, attempted_role, ip_address)
         VALUES ($1, $2, $3, $4, $5)`,
        [admissionNumber.trim(), isValidDate ? dateOfBirth : null, false, 'STUDENT', clientIp]
      );
      await client.query('COMMIT');
      return res.status(400).json({
        success: false,
        message: 'No matching record found. Please verify your admission details with the school administration.'
      });
    }

    const student = studentRes.rows[0];

    // Ensure email is not already taken
    const emailCheck = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Email is already registered.' });
    }

    // Create user account with role=STUDENT
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userRes = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'STUDENT')
       RETURNING id, full_name, email, role, created_at`,
      [fullName || student.full_name, email, hashedPassword]
    );
    const newUser = userRes.rows[0];

    // Link students row to the new user account
    await client.query(
      `UPDATE students SET user_id = $1 WHERE id = $2`,
      [newUser.id, student.id]
    );

    // Log successful attempt
    await client.query(
      `INSERT INTO registration_attempts (admission_number_entered, dob_entered, matched, attempted_role, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [admissionNumber.trim(), dateOfBirth, true, 'STUDENT', clientIp]
    );

    await client.query('COMMIT');

    const token = jwt.sign(
      { id: newUser.id, role: newUser.role, email: newUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(201).json({
      success: true,
      message: 'Student account registered successfully.',
      token,
      user: newUser
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// Public: Parent self-registration and child linking
app.post('/api/auth/register/parent', registrationLimiter, validate(schemas.parentSelfRegister), async (req, res) => {
  const { fullName, email, password, admissionNumber, dateOfBirth, relationship } = req.body;
  const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';

  if (!email || !admissionNumber || !dateOfBirth) {
    return res.status(400).json({
      success: false,
      message: 'Email, admission number, and date of birth are required.'
    });
  }

  const isValidDate = !isNaN(Date.parse(dateOfBirth));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify student exists with admission_number and date_of_birth
    const studentRes = await client.query(
      `SELECT * FROM students 
       WHERE LOWER(admission_number) = LOWER($1) 
         AND date_of_birth = $2`,
      [admissionNumber.trim(), dateOfBirth]
    );

    if (studentRes.rows.length === 0) {
      await client.query(
        `INSERT INTO registration_attempts (admission_number_entered, dob_entered, matched, attempted_role, ip_address)
         VALUES ($1, $2, $3, $4, $5)`,
        [admissionNumber.trim(), isValidDate ? dateOfBirth : null, false, 'PARENT', clientIp]
      );
      await client.query('COMMIT');
      return res.status(400).json({
        success: false,
        message: 'No matching record found. Please verify child admission details with the school administration.'
      });
    }

    const student = studentRes.rows[0];

    // Find or create parent user account
    let parentUser;
    const existingUser = await client.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      parentUser = existingUser.rows[0];
      if (password) {
        const isMatch = await bcrypt.compare(password, parentUser.password_hash);
        if (!isMatch) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Invalid password for existing parent account.' });
        }
      }
    } else {
      if (!password) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Password is required to create a new parent account.' });
      }
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const newUserRes = await client.query(
        `INSERT INTO users (full_name, email, password_hash, role)
         VALUES ($1, $2, $3, 'PARENT')
         RETURNING id, full_name, email, role, created_at`,
        [fullName || 'Parent', email, hashedPassword]
      );
      parentUser = newUserRes.rows[0];
    }

    // Connect parent to child in parent_student_links (idempotent ON CONFLICT)
    await client.query(
      `INSERT INTO parent_student_links (parent_user_id, student_id, relationship)
       VALUES ($1, $2, $3)
       ON CONFLICT (parent_user_id, student_id) DO NOTHING`,
      [parentUser.id, student.id, relationship || 'parent']
    );

    // Log successful attempt
    await client.query(
      `INSERT INTO registration_attempts (admission_number_entered, dob_entered, matched, attempted_role, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [admissionNumber.trim(), dateOfBirth, true, 'PARENT', clientIp]
    );

    await client.query('COMMIT');

    const token = jwt.sign(
      { id: parentUser.id, role: 'PARENT', email: parentUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(200).json({
      success: true,
      message: 'Child linked successfully to parent account.',
      token,
      user: {
        id: parentUser.id,
        full_name: parentUser.full_name,
        email: parentUser.email,
        role: 'PARENT'
      },
      linkedStudent: {
        id: student.id,
        fullName: student.full_name,
        admissionNumber: student.admission_number
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

app.post('/api/auth/login', validate(schemas.login), async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid email or password.' });
    }

    const user = userResult.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================
// 2. STUDENT & REPORT CARD MODULE
// =============================================================

app.get('/api/students', async (req, res) => {
  try {
    const students = await pool.query(
      `SELECT s.id, s.admission_number AS admission_no, 
              COALESCE(u.full_name, s.full_name) AS name, 
              u.email, 
              c.name AS class_name, 
              s.date_of_birth,
              s.guardian_phone, 
              s.user_id,
              s.created_at 
       FROM students s 
       LEFT JOIN users u ON s.user_id = u.id 
       LEFT JOIN classes c ON s.class_id = c.id
       ORDER BY s.id DESC`
    );
    res.json({ success: true, data: students.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/students', verifyToken, requireRole('ADMIN', 'SUPERADMIN'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { fullName, className, dateOfBirth, guardianPhone } = req.body;

    if (!fullName || !dateOfBirth) {
      return res.status(400).json({ success: false, message: 'fullName and dateOfBirth are required.' });
    }

    await client.query('BEGIN');

    const currentYear = new Date().getFullYear();

    const lastAdmission = await client.query(
      `SELECT admission_number FROM students 
       WHERE admission_number LIKE $1 
       ORDER BY id DESC LIMIT 1`,
      [`PHA-${currentYear}-%`]
    );

    let nextSeq = 1;
    if (lastAdmission.rows.length > 0) {
      const parts = lastAdmission.rows[0].admission_number.split('-');
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) nextSeq = lastNum + 1;
    }

    const admissionNo = `PHA-${currentYear}-${String(nextSeq).padStart(4, '0')}`;

    let classId = null;
    if (className) {
      const classRes = await client.query('SELECT id FROM classes WHERE LOWER(name) = LOWER($1)', [className.trim()]);
      if (classRes.rows.length > 0) {
        classId = classRes.rows[0].id;
      } else {
        const levelMatch = className.trim().toUpperCase().match(/^(JSS1|JSS2|JSS3|SS1|SS2|SS3)/);
        const level = levelMatch ? levelMatch[1] : 'JSS1';
        const newClass = await client.query(
          `INSERT INTO classes (name, level, academic_session) VALUES ($1, $2, $3) RETURNING id`,
          [className.trim().toUpperCase(), level, `${currentYear}/${currentYear + 1}`]
        );
        classId = newClass.rows[0].id;
      }
    }

    const studentResult = await client.query(
      `INSERT INTO students (full_name, admission_number, class_id, date_of_birth, guardian_phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, admission_number AS admission_no, date_of_birth, class_id;`,
      [fullName.trim(), admissionNo, classId, dateOfBirth, guardianPhone || 'N/A']
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Student pre-enrolled successfully in roster. Student/parent may now self-register using admission number.',
      student: {
        ...studentResult.rows[0],
        name: studentResult.rows[0].full_name,
        class_name: className
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

app.post('/api/report-cards', verifyToken, requireRole('TEACHER', 'ADMIN', 'SUPERADMIN'), validate(schemas.gradeSubmit), async (req, res) => {
  const { studentId, term, subject, caScore, examScore } = req.body;

  const ca = parseFloat(caScore) || 0;
  const exam = parseFloat(examScore) || 0;

  if (ca > 40 || exam > 60) {
    return res.status(400).json({
      success: false,
      message: 'Continuous Assessment (CA) cannot exceed 40 and Exam score cannot exceed 60'
    });
  }

  const totalScore = ca + exam;
  const { grade, remark } = calculateGradeAndRemark(totalScore);

  try {
    const reportCard = await (req.db || pool).query(
      `INSERT INTO report_cards (student_id, term, subject, ca_score, exam_score, total_score, grade)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [studentId, term, subject, ca, exam, totalScore, grade]
    );

    res.status(201).json({
      success: true,
      message: 'Subject grade recorded successfully',
      reportCard: { ...reportCard.rows[0], remark }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/report-cards/student/:studentId', verifyToken, async (req, res) => {
  const { studentId } = req.params;

  try {
    // If requester is a PARENT, verify they are linked to this student
    if (req.user.role === 'PARENT') {
      const linkCheck = await (req.db || pool).query(
        'SELECT 1 FROM parent_student_links WHERE parent_user_id = $1 AND student_id = $2',
        [req.user.id, studentId]
      );
      if (linkCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You are not authorized to view report cards for this student.'
        });
      }
    } else if (req.user.role === 'STUDENT') {
      const studentCheck = await (req.db || pool).query(
        'SELECT 1 FROM students WHERE id = $1 AND user_id = $2',
        [studentId, req.user.id]
      );
      if (studentCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You can only view your own report card.'
        });
      }
    }

    const grades = await (req.db || pool).query(
      `SELECT id, subject, term, ca_score, exam_score, total_score, grade, created_at
       FROM report_cards
       WHERE student_id = $1
       ORDER BY created_at DESC`,
      [studentId]
    );

    const formattedData = grades.rows.map(row => ({
      ...row,
      remark: calculateGradeAndRemark(row.total_score).remark
    }));

    res.json({ success: true, data: formattedData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================
// PARENT DATA ACCESS MODULE
// =============================================================

// GET /api/parent/children: returns all children linked to parent with report card summary & payment history
app.get('/api/parent/children', verifyToken, requireRole('PARENT'), async (req, res) => {
  try {
    const parentUserId = req.user.id;

    const childrenQuery = await (req.db || pool).query(
      `SELECT s.id, s.full_name, s.admission_number, s.date_of_birth, s.guardian_phone,
              c.name AS class_name, c.level AS class_level,
              psl.relationship, psl.created_at AS linked_at
       FROM parent_student_links psl
       JOIN students s ON psl.student_id = s.id
       LEFT JOIN classes c ON s.class_id = c.id
       WHERE psl.parent_user_id = $1
       ORDER BY s.id ASC`,
      [parentUserId]
    );

    const children = childrenQuery.rows;

    const childrenWithDetails = await Promise.all(
      children.map(async (child) => {
        // Report cards
        const reportCardsRes = await (req.db || pool).query(
          `SELECT id, subject, term, ca_score, exam_score, total_score, grade, created_at
           FROM report_cards
           WHERE student_id = $1
           ORDER BY created_at DESC`,
          [child.id]
        );

        const reportCards = reportCardsRes.rows.map(rc => ({
          ...rc,
          remark: calculateGradeAndRemark(rc.total_score).remark
        }));

        const totalSubjects = reportCards.length;
        const totalMarks = reportCards.reduce((acc, curr) => acc + parseFloat(curr.total_score || 0), 0);
        const averageScore = totalSubjects > 0 ? (totalMarks / totalSubjects).toFixed(2) : 0;

        // Payment history
        const paymentsRes = await (req.db || pool).query(
          `SELECT id, amount, reference, status, term, created_at
           FROM fee_payments
           WHERE student_id = $1
           ORDER BY created_at DESC`,
          [child.id]
        );

        return {
          ...child,
          reportCardsSummary: {
            totalSubjects,
            averageScore: parseFloat(averageScore),
            grades: reportCards
          },
          paymentHistory: paymentsRes.rows
        };
      })
    );

    res.json({
      success: true,
      count: childrenWithDetails.length,
      data: childrenWithDetails
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================
// 3. PAYSTACK PAYMENTS MODULE
// =============================================================

// GET single student payment history (with PARENT link check)
app.get('/api/payments/student/:studentId', verifyToken, async (req, res) => {
  const { studentId } = req.params;

  try {
    if (req.user.role === 'PARENT') {
      const linkCheck = await (req.db || pool).query(
        'SELECT 1 FROM parent_student_links WHERE parent_user_id = $1 AND student_id = $2',
        [req.user.id, studentId]
      );
      if (linkCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You are not authorized to view payment records for this student.'
        });
      }
    } else if (req.user.role === 'STUDENT') {
      const studentCheck = await (req.db || pool).query(
        'SELECT 1 FROM students WHERE id = $1 AND user_id = $2',
        [studentId, req.user.id]
      );
      if (studentCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You can only view your own payment records.'
        });
      }
    }

    const payments = await (req.db || pool).query(
      `SELECT id, amount, reference, status, term, created_at
       FROM fee_payments
       WHERE student_id = $1
       ORDER BY created_at DESC`,
      [studentId]
    );

    res.json({ success: true, data: payments.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/payments/initialize', verifyToken, validate(schemas.paymentInit), async (req, res) => {
  try {
    const { studentId, amount, email, term } = req.body;

    // Verify parent is linked to student before initializing payment
    if (req.user.role === 'PARENT') {
      const linkCheck = await (req.db || pool).query(
        'SELECT 1 FROM parent_student_links WHERE parent_user_id = $1 AND student_id = $2',
        [req.user.id, studentId]
      );
      if (linkCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You can only initialize payments for your linked children.'
        });
      }
    }

    const reference = `FEE-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Create pending record
    await (req.db || pool).query(
      `INSERT INTO fee_payments (student_id, amount, reference, status, term) VALUES ($1, $2, $3, $4, $5)`,
      [studentId, amount, reference, 'PENDING', term]
    );

    // Call Paystack API
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount: Math.round(amount * 100), // Paystack receives amount in kobo/cents
        reference,
        callback_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/payments/verify`
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({
      success: true,
      paymentUrl: response.data.data.authorization_url,
      reference
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.message || err.message });
  }
});

app.get('/api/payments/verify/:reference', verifyToken, async (req, res) => {
  try {
    const { reference } = req.params;

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
      }
    );

    if (response.data.data.status === 'success') {
      const result = await (req.db || pool).query(
        `UPDATE fee_payments SET status = 'SUCCESS' WHERE reference = $1 RETURNING *`,
        [reference]
      );
      return res.json({ success: true, payment: result.rows[0] });
    }

    res.status(400).json({ success: false, message: 'Payment verification failed or pending.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.message || err.message });
  }
});

// Paystack Webhook Handler (Automated status sync)
app.post('/api/payments/webhook', async (req, res) => {
  try {
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(req.rawBody)
      .digest('hex');

    if (hash === req.headers['x-paystack-signature']) {
      const event = req.body;
      if (event.event === 'charge.success') {
        const reference = event.data.reference;
        await pool.query(
          `UPDATE fee_payments SET status = 'SUCCESS' WHERE reference = $1`,
          [reference]
        );
      }
      return res.sendStatus(200);
    }
    return res.status(400).send('Invalid Signature');
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get('/api/payments/history', verifyToken, async (req, res) => {
  try {
    const payments = await (req.db || pool).query(
      `SELECT fp.id, fp.amount, fp.reference, fp.status, fp.term, fp.created_at,
              s.admission_number, u.full_name AS student_name
       FROM fee_payments fp
       JOIN students s ON fp.student_id = s.id
       JOIN users u ON s.user_id = u.id
       ORDER BY fp.created_at DESC`
    );
    res.json({ success: true, data: payments.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================
// 4. HR & PAYROLL MODULE
// =============================================================

app.post('/api/payroll/process', verifyToken, requireRole('ADMIN', 'SUPERADMIN'), validate(schemas.payrollProcess), async (req, res) => {
  try {
    const { staffId, amount, monthYear } = req.body;

    if (!staffId || !monthYear) {
      return res.status(400).json({ success: false, message: 'Staff ID and Month/Year are required.' });
    }

    const payrollAmount = amount || 150000.00;

    const result = await (req.db || pool).query(
      `INSERT INTO payroll (staff_id, amount, month_year, is_paid, paid_at)
       VALUES ($1, $2, $3, TRUE, NOW()) 
       RETURNING *`,
      [staffId, payrollAmount, monthYear]
    );

    res.status(201).json({
      success: true,
      message: 'Payroll processed successfully',
      data: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/payroll/history', verifyToken, requireRole('ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const payroll = await (req.db || pool).query(
      `SELECT p.id, p.amount, p.month_year, p.is_paid, p.paid_at, u.full_name AS staff_name, u.email
       FROM payroll p
       JOIN users u ON p.staff_id = u.id
       ORDER BY p.paid_at DESC`
    );
    res.json({ success: true, data: payroll.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start Express Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running smoothly on http://localhost:${PORT}`);
});