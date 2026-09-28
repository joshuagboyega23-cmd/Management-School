const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const axios = require('axios');
const sendAnnouncementEmails = require('./announcementEmails');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const pool = require('./db');
const { cloudinary, cloudinaryConfigured } = require('./cloudinary');
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

const materialUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (file.mimetype !== 'application/pdf') {
      return callback(new Error('Only PDF files are allowed.'));
    }
    callback(null, true);
  }
}).single('file');

const parseMaterialUpload = (req, res, next) => {
  materialUploadMiddleware(req, res, (error) => {
    if (error) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({ success: false, message: error.message });
    }
    next();
  });
};

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

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  handler: (req, res) => res.status(200).json({
    success: true,
    message: 'If an account matches, a reset link has been sent to that email.'
  }),
  standardHeaders: true,
  legacyHeaders: false
});

// Security and Middleware Configuration
app.use(helmet());

// Allow multiple origins: local dev, Vercel preview URLs, and the configured production client URL
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  ...(process.env.CLIENT_URL ? [process.env.CLIENT_URL] : []),
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    // Allow any Vercel deployment URL for this project
    if (origin.endsWith('.vercel.app') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

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
const emailField = z.string().trim().toLowerCase().email('Must be a valid email address');
const passwordField = z.string().min(8, 'Password must be at least 8 characters');
const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

// Schemas
const schemas = {
  login: z.object({
    email: emailField,
    password: z.string().min(1, 'Password is required'),
    admissionNumber: z.string().trim().optional(),
    portal: z.enum(['student', 'parent', 'teacher', 'admin'], {
      error: "Portal must be 'student', 'parent', 'teacher', or 'admin'"
    })
  }),

  forgotPassword: z.object({
    email: emailField,
    portal: z.enum(['student', 'parent', 'teacher', 'admin']),
    admissionNumber: z.string().trim().optional()
  }),

  resetPassword: z.object({
    token: z.string().min(1, 'Reset token is required'),
    newPassword: passwordField
  }),

  adminRegister: z.object({
    full_name: z.string().min(2, 'Full name must be at least 2 characters'),
    email: emailField,
    password: passwordField,
    role: z.enum(['ADMIN'], { error: "Role must be 'ADMIN'" })
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

  teacherSelfRegister: z.object({
    fullName: z.string().min(2, 'Full name is required'),
    email: emailField,
    password: passwordField,
    staffId: z.string().min(3, 'Staff ID is required'),
    dateOfBirth: dateField
  }),

  importTeachers: z.union([
    z.array(
      z.object({
        fullName: z.string().min(2, 'Full name is required'),
        dateOfBirth: dateField,
        email: emailField,
        subjectsTaught: z.union([z.array(z.string()), z.string()]).optional()
      })
    ).min(1, 'At least one teacher record is required'),
    z.object({
      teachers: z.array(
        z.object({
          fullName: z.string().min(2, 'Full name is required'),
          dateOfBirth: dateField,
          email: emailField,
          subjectsTaught: z.union([z.array(z.string()), z.string()]).optional()
        })
      ).min(1, 'At least one teacher record is required')
    })
  ]),

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
      error: "Term must be 'First Term', 'Second Term', or 'Third Term'"
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
    amount: z.number().positive('Amount must be a positive number'),
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
    const errors = result.error.issues.map((e) => ({
      field: e.path.join('.'),
      message: e.message
    }));
    return res.status(400).json({ success: false, message: errors[0]?.message || 'Validation failed', errors });
  }
  req.body = result.data; // replace with coerced/safe data
  next();
};

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

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

// Admin direct-create flow: restricted to ADMIN accounts only
app.post('/api/auth/register', verifyToken, requireRole('ADMIN', 'SUPERADMIN'), validate(schemas.adminRegister), async (req, res) => {
  const { full_name, email, password, role } = req.body;

  if (!full_name || !email || !password || !role) {
    return res.status(400).json({ success: false, message: 'full_name, email, password, and role are required.' });
  }

  if (role !== 'ADMIN') {
    return res.status(400).json({
      success: false,
      message: 'Direct account creation is restricted to ADMIN role only. Teachers must register using their Staff ID.'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role) 
       VALUES ($1, $2, $3, 'ADMIN') 
       RETURNING id, full_name, email, role, created_at`,
      [full_name, email.trim().toLowerCase(), hashedPassword]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Admin account created successfully',
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

// Admin-only: Import staff/teacher roster pre-load (JSON Array, { teachers: [...] }, or CSV text)
app.post('/api/auth/admin/import-teachers', verifyToken, requireRole('ADMIN', 'SUPERADMIN'), validate(schemas.importTeachers), async (req, res) => {
  let teacherList = [];

  if (Array.isArray(req.body)) {
    teacherList = req.body;
  } else if (Array.isArray(req.body?.teachers)) {
    teacherList = req.body.teachers;
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
        teacherList.push({
          fullName: row.fullname || row.name || values[0],
          dateOfBirth: row.dateofbirth || row.dob || values[1],
          email: row.email || values[2],
          subjectsTaught: row.subjectstaught || row.subjects || values[3]
        });
      }
    }
  }

  if (!teacherList || teacherList.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No teacher records provided. Please send a JSON array or CSV text with fullName, dateOfBirth, and email.'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const currentYear = new Date().getFullYear();

    // Query highest current sequence number for PHA-STF-{year}-{sequence}
    const lastStaff = await client.query(
      `SELECT staff_id FROM teachers 
       WHERE staff_id LIKE $1 
       ORDER BY id DESC LIMIT 1`,
      [`PHA-STF-${currentYear}-%`]
    );

    let nextSeq = 1;
    if (lastStaff.rows.length > 0) {
      const parts = lastStaff.rows[0].staff_id.split('-');
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) nextSeq = lastNum + 1;
    }

    const imported = [];

    for (const item of teacherList) {
      const fullName = item.fullName || item.full_name || item.name;
      const dateOfBirth = item.dateOfBirth || item.date_of_birth || item.dob;
      const email = item.email;
      const subjectsTaught = item.subjectsTaught || item.subjects_taught || item.subjects || [];

      if (!fullName || !dateOfBirth || !email) {
        throw new Error(`Missing fullName, dateOfBirth, or email for record: ${JSON.stringify(item)}`);
      }

      let subjects = [];
      if (Array.isArray(subjectsTaught)) {
        subjects = subjectsTaught;
      } else if (typeof subjectsTaught === 'string') {
        subjects = subjectsTaught.split(',').map(s => s.trim()).filter(Boolean);
      }

      // Check collision on staff_id if needed, generating unique sequence
      let staffId = `PHA-STF-${currentYear}-${String(nextSeq++).padStart(4, '0')}`;
      let collision = true;
      while (collision) {
        const existingStaff = await client.query('SELECT 1 FROM teachers WHERE staff_id = $1', [staffId]);
        if (existingStaff.rows.length === 0) {
          collision = false;
        } else {
          staffId = `PHA-STF-${currentYear}-${String(nextSeq++).padStart(4, '0')}`;
        }
      }

      const inserted = await client.query(
        `INSERT INTO teachers (full_name, date_of_birth, email, staff_id, subjects_taught, user_id)
         VALUES ($1, $2, $3, $4, $5, NULL)
         RETURNING id, full_name, email, staff_id, subjects_taught, date_of_birth`,
        [fullName.trim(), dateOfBirth, email.trim().toLowerCase(), staffId, subjects]
      );

      imported.push(inserted.rows[0]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: `Successfully imported ${imported.length} staff records.`,
      teachers: imported
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

    // Create user account with role=STUDENT
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userRes = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'STUDENT')
       RETURNING id, full_name, email, role, created_at`,
      [fullName || student.full_name, email.trim().toLowerCase(), hashedPassword]
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
    let parentUser = null;
    const existingUsers = await client.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND role = $2',
      [email.trim(), 'PARENT']
    );

    if (existingUsers.rows.length > 0 && password) {
      for (const u of existingUsers.rows) {
        const isMatch = await bcrypt.compare(password, u.password_hash);
        if (isMatch) {
          parentUser = u;
          break;
        }
      }
    }

    if (!parentUser) {
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
        [fullName || 'Parent', email.trim().toLowerCase(), hashedPassword]
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

// Public: Teacher self-registration with Staff ID + DOB + Email matching
app.post('/api/auth/register/teacher', registrationLimiter, validate(schemas.teacherSelfRegister), async (req, res) => {
  const { fullName, email, password, staffId, dateOfBirth } = req.body;
  const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';

  if (!email || !password || !staffId || !dateOfBirth) {
    return res.status(400).json({
      success: false,
      message: 'Email, password, staffId, and dateOfBirth are required.'
    });
  }

  const isValidDate = !isNaN(Date.parse(dateOfBirth));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Look up unclaimed teacher matching staff_id, date_of_birth, and email
    const teacherRes = await client.query(
      `SELECT * FROM teachers 
       WHERE LOWER(staff_id) = LOWER($1) 
         AND date_of_birth = $2 
         AND LOWER(email) = LOWER($3)
         AND user_id IS NULL 
       FOR UPDATE`,
      [staffId.trim(), dateOfBirth, email.trim()]
    );

    if (teacherRes.rows.length === 0) {
      // Log attempt with matched=false
      await client.query(
        `INSERT INTO registration_attempts (admission_number_entered, dob_entered, matched, attempted_role, ip_address)
         VALUES ($1, $2, $3, $4, $5)`,
        [staffId.trim(), isValidDate ? dateOfBirth : null, false, 'TEACHER', clientIp]
      );
      await client.query('COMMIT');
      return res.status(400).json({
        success: false,
        message: 'No matching record found. Please verify your staff credentials with the school administration.'
      });
    }

    const teacher = teacherRes.rows[0];

    // Create user account with role=TEACHER
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userRes = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'TEACHER')
       RETURNING id, full_name, email, role, created_at`,
      [fullName || teacher.full_name, email.trim().toLowerCase(), hashedPassword]
    );
    const newUser = userRes.rows[0];

    // Link teachers row to new user
    await client.query(
      `UPDATE teachers SET user_id = $1, invite_accepted = TRUE WHERE id = $2`,
      [newUser.id, teacher.id]
    );

    // Log successful attempt
    await client.query(
      `INSERT INTO registration_attempts (admission_number_entered, dob_entered, matched, attempted_role, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [staffId.trim(), dateOfBirth, true, 'TEACHER', clientIp]
    );

    await client.query('COMMIT');

    const token = jwt.sign(
      { id: newUser.id, role: newUser.role, email: newUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(201).json({
      success: true,
      message: 'Teacher account registered successfully.',
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

app.post('/api/auth/login', validate(schemas.login), async (req, res) => {
  const { email, password, portal, admissionNumber } = req.body;

  if (!email || !password || !portal) {
    return res.status(400).json({ success: false, message: 'Email, password, and portal are required.' });
  }

  const genericPortalMessage = portal === 'student' || portal === 'parent'
    ? 'Invalid email, password or admission number.'
    : 'Invalid email or password.';

  try {
    let userResult;

    if (portal === 'student' || portal === 'parent') {
      const normalizedAdmissionNumber = admissionNumber?.trim();
      if (!normalizedAdmissionNumber) {
        return res.status(400).json({ success: false, message: genericPortalMessage });
      }

      if (portal === 'student') {
        userResult = await pool.query(
          `SELECT u.*
           FROM users u
           JOIN students s ON s.user_id = u.id
           WHERE LOWER(u.email) = LOWER($1)
             AND UPPER(s.admission_number) = UPPER($2)
             AND u.role = 'STUDENT'`,
          [email, normalizedAdmissionNumber]
        );
      } else {
        userResult = await pool.query(
          `SELECT DISTINCT u.*
           FROM users u
           JOIN parent_student_links l ON l.parent_user_id = u.id
           JOIN students s ON s.id = l.student_id
           WHERE LOWER(u.email) = LOWER($1)
             AND UPPER(s.admission_number) = UPPER($2)
             AND u.role = 'PARENT'`,
          [email, normalizedAdmissionNumber]
        );
      }
    } else {
      const allowedRoles = portal === 'teacher' ? ['TEACHER'] : ['ADMIN', 'SUPERADMIN'];
      userResult = await pool.query(
        'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND role = ANY($2::text[])',
        [email, allowedRoles]
      );
    }

    if (userResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: genericPortalMessage });
    }

    // Match password against accounts matching the portal's allowed roles
    let matchedUser = null;
    for (const u of userResult.rows) {
      const isMatch = await bcrypt.compare(password, u.password_hash);
      if (isMatch) {
        matchedUser = u;
        break;
      }
    }

    if (!matchedUser) {
      return res.status(400).json({ success: false, message: genericPortalMessage });
    }

    const token = jwt.sign(
      { id: matchedUser.id, role: matchedUser.role, email: matchedUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: matchedUser.id,
        full_name: matchedUser.full_name,
        email: matchedUser.email,
        role: matchedUser.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================
// 2. STUDENT & REPORT CARD MODULE
// =============================================================

const sendResendEmail = require('./announcementEmails').sendResendEmail;

app.post('/api/auth/forgot-password', passwordResetLimiter, async (req, res) => {
  const genericResponse = () => res.status(200).json({
    success: true,
    message: 'If an account matches, a reset link has been sent to that email.'
  });
  const parsed = schemas.forgotPassword.safeParse(req.body);
  if (!parsed.success) return genericResponse();

  const { email, portal, admissionNumber } = parsed.data;
  if (['student', 'parent'].includes(portal) && !admissionNumber) return genericResponse();

  const linksByEmail = new Map();
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    let userResult;
    if (portal === 'student') {
      userResult = await client.query(
        `SELECT u.*
         FROM users u
         JOIN students s ON s.user_id = u.id
         WHERE LOWER(u.email) = LOWER($1)
           AND UPPER(s.admission_number) = UPPER($2)
           AND u.role = 'STUDENT'`,
        [email, admissionNumber]
      );
    } else if (portal === 'parent') {
      userResult = await client.query(
        `SELECT DISTINCT u.*
         FROM users u
         JOIN parent_student_links l ON l.parent_user_id = u.id
         JOIN students s ON s.id = l.student_id
         WHERE LOWER(u.email) = LOWER($1)
           AND UPPER(s.admission_number) = UPPER($2)
           AND u.role = 'PARENT'`,
        [email, admissionNumber]
      );
    } else {
      const roles = portal === 'teacher' ? ['TEACHER'] : ['ADMIN', 'SUPERADMIN'];
      userResult = await client.query(
        'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND role = ANY($2::text[])',
        [email, roles]
      );
    }

    const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
    for (const user of userResult.rows) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await client.query(
        'DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL',
        [user.id]
      );
      await client.query(
        `INSERT INTO password_resets (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, tokenHash, expiresAt]
      );

      const accountPortal = user.role === 'SUPERADMIN' ? 'admin' : user.role.toLowerCase();
      const resetLink = `${clientUrl}/reset-password?token=${encodeURIComponent(token)}&portal=${accountPortal}`;
      const emailKey = user.email.toLowerCase();
      if (!linksByEmail.has(emailKey)) {
        linksByEmail.set(emailKey, { email: user.email, links: [] });
      }
      linksByEmail.get(emailKey).links.push({ role: user.role, url: resetLink });
    }

    await client.query('COMMIT');
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Failed to roll back password reset request:', rollbackError.message);
      }
    }
    console.error('Password reset request failed:', error.message);
    return genericResponse();
  } finally {
    client?.release();
  }

  await Promise.all([...linksByEmail.values()].map(({ email: recipient, links }) => sendResendEmail({
    email: recipient,
    subject: 'Password reset request',
    text: [
      'Use the link for the account you want to reset:',
      ...links.map(({ role, url }) => `${role}: ${url}`),
      'Each link expires in 60 minutes.'
    ].join('\n\n')
  })));

  return genericResponse();
});

app.post('/api/auth/reset-password', async (req, res) => {
  const parsed = schemas.resetPassword.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
    return res.status(400).json({ success: false, message: errors[0]?.message || 'Invalid reset request.', errors });
  }

  const tokenHash = crypto.createHash('sha256').update(parsed.data.token).digest('hex');
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const resetResult = await client.query(
      `SELECT id, user_id
       FROM password_resets
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       FOR UPDATE`,
      [tokenHash]
    );

    if (resetResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'This reset link is invalid, expired, or already used.' });
    }

    const userId = resetResult.rows[0].user_id;
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
    await client.query(
      'UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
      [userId]
    );
    await client.query('COMMIT');
    res.json({ success: true, message: 'Password reset successfully. You can now sign in.' });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Failed to roll back password update:', rollbackError.message);
      }
    }
    console.error('Password update failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not reset password. Please try again.' });
  } finally {
    client?.release();
  }
});

app.get('/api/students', verifyToken, requireRole('ADMIN', 'SUPERADMIN', 'TEACHER'), async (req, res) => {
  try {
    const students = await req.db.query(
      `SELECT s.id, s.class_id, c.level AS class_level, s.admission_number AS admission_no, 
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

app.get('/api/teachers', verifyToken, requireRole('ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const teachers = await req.db.query(
      `SELECT 
         t.id AS teacher_record_id,
         t.user_id AS id,
         COALESCE(u.full_name, t.full_name) AS full_name,
         COALESCE(u.email, t.email) AS email,
         t.staff_id,
         t.subjects_taught,
         t.date_of_birth,
         t.user_id,
         (t.user_id IS NOT NULL) AS is_registered,
         CASE WHEN t.user_id IS NOT NULL THEN 'Registered' ELSE 'Pending' END AS status,
         t.created_at
       FROM teachers t
       LEFT JOIN users u ON t.user_id = u.id
       ORDER BY t.id DESC`
    );
    res.json({ success: true, data: teachers.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/parents', verifyToken, requireRole('ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const parents = await req.db.query(
      `SELECT id, full_name, email
       FROM users
       WHERE role = 'PARENT'
       ORDER BY full_name`
    );
    res.json({ success: true, data: parents.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const uploadMaterialPdf = (buffer, publicId) => new Promise((resolve, reject) => {
  cloudinary.uploader.upload_stream(
    { folder: 'school-materials', public_id: publicId, resource_type: 'raw' },
    (error, result) => error ? reject(error) : resolve(result)
  ).end(buffer);
});

const getCloudinaryPublicId = (secureUrl) => {
  try {
    const pathname = new URL(secureUrl).pathname;
    const uploadPath = '/raw/upload/';
    const uploadIndex = pathname.indexOf(uploadPath);
    if (uploadIndex === -1) return null;
    return decodeURIComponent(pathname.slice(uploadIndex + uploadPath.length).replace(/^v\d+\//, ''));
  } catch (error) {
    return null;
  }
};

app.post('/api/materials', verifyToken, requireRole('TEACHER', 'ADMIN', 'SUPERADMIN'), parseMaterialUpload, async (req, res) => {
  let uploadedAsset;
  try {
    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim() || null;
    const rawClassId = String(req.body.classId || '').trim();
    const link = String(req.body.link || '').trim();
    const hasFile = Boolean(req.file);
    const hasLink = Boolean(link);

    if (!title) {
      return res.status(400).json({ success: false, message: 'Title is required.' });
    }
    if (hasFile === hasLink) {
      return res.status(400).json({ success: false, message: 'Provide exactly one PDF file or link.' });
    }

    let classId = null;
    if (rawClassId) {
      classId = Number(rawClassId);
      if (!Number.isInteger(classId) || classId <= 0) {
        return res.status(400).json({ success: false, message: 'Select a valid class.' });
      }
      const classResult = await req.db.query('SELECT 1 FROM classes WHERE id = $1', [classId]);
      if (classResult.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Select a valid class.' });
      }
    }

    let kind;
    let url;
    let originalFileName = null;
    let fileSize = null;

    if (hasFile) {
      if (!cloudinaryConfigured) {
        return res.status(503).json({ success: false, message: 'File uploads are not configured yet' });
      }
      if (req.file.mimetype !== 'application/pdf' || req.file.buffer.subarray(0, 4).toString('ascii') !== '%PDF') {
        return res.status(400).json({ success: false, message: 'The uploaded file must be a valid PDF.' });
      }

      originalFileName = path.basename(req.file.originalname || 'material.pdf').replace(/[\\/]/g, '_');
      const cloudinaryPublicId = `${crypto.randomUUID()}-${originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      uploadedAsset = await uploadMaterialPdf(req.file.buffer, cloudinaryPublicId);
      kind = 'FILE';
      url = uploadedAsset.secure_url;
      fileSize = req.file.size;
    } else {
      let parsedUrl;
      try {
        parsedUrl = new URL(link);
      } catch (error) {
        return res.status(400).json({ success: false, message: 'Link must be a valid http or https URL.' });
      }
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return res.status(400).json({ success: false, message: 'Link must be a valid http or https URL.' });
      }
      kind = 'LINK';
      url = parsedUrl.href;
    }

    const result = await req.db.query(
      `INSERT INTO materials (title, description, class_id, kind, url, file_name, file_size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [title, description, classId, kind, url, originalFileName, fileSize, req.user.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (uploadedAsset?.public_id) {
      try {
        await cloudinary.uploader.destroy(uploadedAsset.public_id, { resource_type: 'raw' });
      } catch (cleanupError) {
        console.error('Failed to clean up unreferenced material upload:', cleanupError.message);
      }
    }
    console.error('Material upload failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not save learning material.' });
  }
});

app.get('/api/materials', verifyToken, async (req, res) => {
  try {
    const role = req.user.role;
    if (role === 'PARENT' || !['STUDENT', 'TEACHER', 'ADMIN', 'SUPERADMIN'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Learning materials are not available to this role.' });
    }

    let query = `
      SELECT m.*, u.full_name AS uploader_name, c.name AS class_name
      FROM materials m
      JOIN users u ON u.id = m.uploaded_by
      LEFT JOIN classes c ON c.id = m.class_id`;
    const params = [];
    if (role === 'STUDENT') {
      query += `
        WHERE m.class_id IS NULL OR m.class_id = (
          SELECT s.class_id FROM students s WHERE s.user_id = $1
        )`;
      params.push(req.user.id);
    }
    query += ' ORDER BY m.created_at DESC';
    const result = await req.db.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/materials/:id', verifyToken, async (req, res) => {
  try {
    const result = await req.db.query('SELECT * FROM materials WHERE id = $1', [Number(req.params.id)]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Learning material not found.' });
    }

    const material = result.rows[0];
    const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(req.user.role);
    if (!isAdmin && Number(material.uploaded_by) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'You cannot delete this learning material.' });
    }

    await req.db.query('DELETE FROM materials WHERE id = $1', [material.id]);
    const cloudinaryPublicId = material.kind === 'FILE' ? getCloudinaryPublicId(material.url) : null;
    if (cloudinaryPublicId) {
      try {
        await cloudinary.uploader.destroy(cloudinaryPublicId, { resource_type: 'raw' });
      } catch (error) {
        console.error('Failed to remove material from Cloudinary:', error.message);
      }
    }
    res.json({ success: true, message: 'Learning material deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not delete learning material.' });
  }
});

app.get('/api/admin/users', verifyToken, requireRole('ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const query = String(req.query.query || '').trim();
    const result = await req.db.query(
      `SELECT DISTINCT u.id, u.full_name, u.email, u.role,
              CASE WHEN u.role = 'STUDENT' THEN s.admission_number ELSE NULL END AS admission_number
       FROM users u
       LEFT JOIN students s ON s.user_id = u.id
       WHERE $2 = ''
          OR u.full_name ILIKE $1
          OR u.email ILIKE $1
          OR (u.role = 'STUDENT' AND s.admission_number ILIKE $1)
       ORDER BY u.full_name
       LIMIT 20`,
      [`%${query}%`, query]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/reset-user-password', verifyToken, requireRole('ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const userId = Number(req.body.userId);
    const newPassword = req.body.newPassword;
    if (!Number.isInteger(userId) || userId <= 0 || typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Select a user and enter a password with at least 8 characters.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const result = await req.db.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id',
      [passwordHash, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    await req.db.query(
      'UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
      [userId]
    );
    res.json({ success: true, message: 'User password reset successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not reset user password.' });
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

// GET /api/student/me: returns authenticated student's profile, grades, and payments
app.get('/api/student/me', verifyToken, requireRole('STUDENT'), async (req, res) => {
  try {
    const studentRes = await (req.db || pool).query(
      `SELECT s.id, s.full_name, s.admission_number, s.date_of_birth, s.guardian_phone,
              c.name AS class_name, c.level AS class_level
       FROM students s
       LEFT JOIN classes c ON s.class_id = c.id
       WHERE s.user_id = $1`,
      [req.user.id]
    );

    if (studentRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student profile not found.' });
    }

    const student = studentRes.rows[0];

    const reportCardsRes = await (req.db || pool).query(
      `SELECT id, subject, term, ca_score, exam_score, total_score, grade, created_at
       FROM report_cards
       WHERE student_id = $1
       ORDER BY created_at DESC`,
      [student.id]
    );

    const paymentsRes = await (req.db || pool).query(
      `SELECT id, amount, reference, status, term, created_at
       FROM fee_payments
       WHERE student_id = $1
       ORDER BY created_at DESC`,
      [student.id]
    );

    res.json({
      success: true,
      data: {
        student,
        reportCards: reportCardsRes.rows.map(rc => ({
          ...rc,
          remark: calculateGradeAndRemark(rc.total_score).remark
        })),
        payments: paymentsRes.rows
      }
    });
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

    if (req.user.role === 'STUDENT') {
      return res.status(403).json({
        success: false,
        message: 'Students cannot initialize fee payments directly. Please use the parent portal or contact the school office.'
      });
    }

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

app.get('/api/payments/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
      }
    );

    const paystackData = response.data?.data;
    const paystackStatus = paystackData?.status;

    if (paystackStatus === 'success') {
      const result = await pool.query(
        `UPDATE fee_payments SET status = 'SUCCESS' WHERE reference = $1 RETURNING *`,
        [reference]
      );
      return res.json({ 
        success: true, 
        message: 'Payment confirmed successfully.',
        payment: result.rows[0],
        amount: paystackData.amount ? paystackData.amount / 100 : undefined,
        paidAt: paystackData.paid_at
      });
    } else if (paystackStatus === 'failed' || paystackStatus === 'abandoned') {
      const result = await pool.query(
        `UPDATE fee_payments SET status = 'FAILED' WHERE reference = $1 RETURNING *`,
        [reference]
      );
      return res.status(400).json({ 
        success: false, 
        message: 'Payment failed or was not completed.', 
        payment: result.rows[0] 
      });
    }

    res.status(400).json({ success: false, message: 'Payment verification failed or pending.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.message || err.message });
  }
});

// Paystack Webhook Handler (Automated status sync)
app.post('/api/payments/webhook', async (req, res) => {
  try {
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body));
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(raw)
      .digest('hex');

    if (hash === req.headers['x-paystack-signature']) {
      const event = req.body;
      const reference = event.data?.reference;

      if (reference) {
        if (event.event === 'charge.success') {
          await pool.query(
            `UPDATE fee_payments SET status = 'SUCCESS' WHERE reference = $1`,
            [reference]
          );
        } else if (event.event === 'charge.failed' || event.event === 'charge.abandoned') {
          await pool.query(
            `UPDATE fee_payments SET status = 'FAILED' WHERE reference = $1`,
            [reference]
          );
        }
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
      `SELECT fp.id, fp.student_id, fp.amount, fp.reference, fp.status, fp.term, fp.created_at,
              s.admission_number, COALESCE(u.full_name, s.full_name) AS student_name
       FROM fee_payments fp
       JOIN students s ON fp.student_id = s.id
       LEFT JOIN users u ON s.user_id = u.id
       ORDER BY fp.created_at DESC`
    );
    res.json({ success: true, data: payments.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/announcements', verifyToken, requireRole('ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const { title, message, visible_to_students, visible_to_parents, visible_to_teachers, event_date } = req.body;

    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required.' });
    }

    if (event_date && !/^\d{4}-\d{2}-\d{2}$/.test(event_date)) {
      return res.status(400).json({ success: false, message: 'event_date must be in YYYY-MM-DD format.' });
    }

    const result = await (req.db || pool).query(
      `INSERT INTO announcements (title, message, created_by, visible_to_students, visible_to_parents, visible_to_teachers, event_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        String(title).trim(),
        String(message).trim(),
        req.user.id,
        Boolean(visible_to_students),
        Boolean(visible_to_parents),
        Boolean(visible_to_teachers),
        event_date || null
      ]
    );

    const recipientRoles = [];
    if (Boolean(visible_to_parents)) recipientRoles.push('PARENT');
    if (Boolean(visible_to_teachers)) recipientRoles.push('TEACHER');

    let recipients = [];
    if (recipientRoles.length > 0) {
      try {
        const recipientResult = await pool.query(
          `SELECT DISTINCT email
           FROM users
           WHERE role = ANY($1::text[])
             AND email IS NOT NULL
             AND BTRIM(email) <> ''`,
          [recipientRoles]
        );
        recipients = recipientResult.rows;
      } catch (emailError) {
        console.error('Failed to look up announcement email recipients:', emailError.message);
      }
    }

    if (recipients.length > 0) {
      sendAnnouncementEmails(
        recipients,
        String(title).trim(),
        String(message).trim(),
        event_date || null
      );
    }

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/announcements', verifyToken, async (req, res) => {
  try {
    let whereClause = 'WHERE 1=1';
    const role = req.user.role;

    if (role === 'STUDENT') {
      whereClause = 'WHERE visible_to_students = TRUE';
    } else if (role === 'PARENT') {
      whereClause = 'WHERE visible_to_parents = TRUE';
    } else if (role === 'TEACHER') {
      whereClause = 'WHERE visible_to_teachers = TRUE';
    } else if (role === 'ADMIN' || role === 'SUPERADMIN') {
      whereClause = 'WHERE visible_to_students = TRUE OR visible_to_parents = TRUE OR visible_to_teachers = TRUE';
    }

    const announcements = await (req.db || pool).query(
      `SELECT a.*, u.full_name AS creator_name
       FROM announcements a
       JOIN users u ON a.created_by = u.id
       ${whereClause}
       ORDER BY a.created_at DESC`,
      []
    );

    res.json({ success: true, data: announcements.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const canAccessConversation = (conversation, user) => {
  if (Number(conversation.created_by) === Number(user.id)) return true;

  if (['ADMIN', 'SUPERADMIN'].includes(user.role)) {
    return true;
  }

  return conversation.target_role === user.role &&
    Number(conversation.target_user_id) === Number(user.id);
};

app.post('/api/conversations', verifyToken, async (req, res) => {
  try {
    const { subject, body } = req.body;

    if (req.user.role === 'STUDENT') {
      return res.status(403).json({ success: false, message: 'Students cannot create conversations.' });
    }

    if (!['PARENT', 'TEACHER', 'ADMIN', 'SUPERADMIN'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized action for your role.' });
    }

    if (!subject || !String(subject).trim() || !body || !String(body).trim()) {
      return res.status(400).json({ success: false, message: 'Subject and message body are required.' });
    }

    const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(req.user.role);
    const targetRole = isAdmin ? req.body.target_role : 'ADMIN';
    if (isAdmin && !['PARENT', 'TEACHER'].includes(targetRole)) {
      return res.status(400).json({ success: false, message: 'Recipient type must be PARENT or TEACHER.' });
    }

    const studentId = req.body.student_id == null || req.body.student_id === ''
      ? null
      : Number(req.body.student_id);
    if (studentId !== null && (!Number.isInteger(studentId) || studentId <= 0)) {
      return res.status(400).json({ success: false, message: 'Student context must be a valid student ID.' });
    }

    const recipients = isAdmin
      ? await req.db.query('SELECT id FROM users WHERE role = $1 ORDER BY id', [targetRole])
      : { rows: [{ id: null }] };

    if (recipients.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No registered parents/teachers yet.' });
    }

    const createdThreads = [];
    for (const recipient of recipients.rows) {
      const conversationResult = await req.db.query(
        `INSERT INTO conversations (subject, created_by, target_role, target_user_id, student_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [String(subject).trim(), req.user.id, targetRole, recipient.id, studentId]
      );
      const conversation = conversationResult.rows[0];

      await req.db.query(
        `INSERT INTO messages (conversation_id, sender_id, body)
         VALUES ($1, $2, $3)`,
        [conversation.id, req.user.id, String(body).trim()]
      );
      createdThreads.push(conversation);
    }

    res.status(201).json({
      success: true,
      data: createdThreads[0],
      threadsCreated: createdThreads.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/conversations', verifyToken, async (req, res) => {
  try {
    const role = req.user.role;
    if (role === 'STUDENT' || !['PARENT', 'TEACHER', 'ADMIN', 'SUPERADMIN'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized action for your role.' });
    }

    let query = `
      SELECT c.*, 
             u.full_name AS creator_name,
             u.role AS creator_role,
             target.full_name AS target_name,
             (SELECT COUNT(*) FROM messages m
              WHERE m.conversation_id = c.id AND m.sender_id != $1 AND m.read_at IS NULL) AS unread_count
      FROM conversations c
      JOIN users u ON u.id = c.created_by
      LEFT JOIN users target ON target.id = c.target_user_id
      WHERE 1=1`;
    const params = [req.user.id];

    if (role === 'PARENT') {
      query += ` AND (c.created_by = $2 OR (c.target_role = 'PARENT' AND c.target_user_id = $2))`;
      params.push(req.user.id);
    } else if (role === 'TEACHER') {
      query += ` AND (c.created_by = $2 OR (c.target_role = 'TEACHER' AND c.target_user_id = $2))`;
      params.push(req.user.id);
    }

    query += ` ORDER BY c.created_at DESC`;

    const result = await (req.db || pool).query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/conversations/:id/messages', verifyToken, async (req, res) => {
  try {
    if (req.user.role === 'STUDENT') {
      return res.status(403).json({ success: false, message: 'Students cannot access conversations.' });
    }

    const conversationId = Number(req.params.id);

    const conversationResult = await req.db.query(
      `SELECT * FROM conversations WHERE id = $1`,
      [conversationId]
    );

    if (conversationResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    const conversation = conversationResult.rows[0];
    if (!canAccessConversation(conversation, req.user)) {
      return res.status(403).json({ success: false, message: 'Access denied to this conversation.' });
    }

    await req.db.query(
      `UPDATE messages
       SET read_at = NOW()
       WHERE conversation_id = $1 AND sender_id != $2 AND read_at IS NULL`,
      [conversationId, req.user.id]
    );

    const messages = await req.db.query(
      `SELECT m.*, u.full_name AS sender_name
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC`,
      [conversationId]
    );

    res.json({ success: true, data: messages.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/conversations/:id/messages', verifyToken, async (req, res) => {
  try {
    if (req.user.role === 'STUDENT') {
      return res.status(403).json({ success: false, message: 'Students cannot reply to conversations.' });
    }

    const conversationId = Number(req.params.id);
    const { body } = req.body;

    if (!body || !String(body).trim()) {
      return res.status(400).json({ success: false, message: 'Message body is required.' });
    }

    const conversationResult = await req.db.query(
      `SELECT * FROM conversations WHERE id = $1`,
      [conversationId]
    );

    if (conversationResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    const conversation = conversationResult.rows[0];
    if (!canAccessConversation(conversation, req.user)) {
      return res.status(403).json({ success: false, message: 'You are not allowed to reply in this conversation.' });
    }

    const message = await req.db.query(
      `INSERT INTO messages (conversation_id, sender_id, body)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [conversationId, req.user.id, String(body).trim()]
    );

    res.status(201).json({ success: true, data: message.rows[0] });
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

    if (!staffId || !monthYear || !amount) {
      return res.status(400).json({ success: false, message: 'Staff ID, Amount, and Month/Year are required.' });
    }

    const result = await (req.db || pool).query(
      `INSERT INTO payroll (staff_id, amount, month_year, is_paid, paid_at)
       VALUES ($1, $2, $3, TRUE, NOW()) 
       RETURNING *`,
      [staffId, amount, monthYear]
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

app.use((error, req, res, next) => {
  console.error('Unhandled API error:', error);
  if (res.headersSent) return next(error);
  res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
});

// Start Express Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running smoothly on http://localhost:${PORT}`);
});