const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('./db');
require('dotenv').config();

const app = express();

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

// Middleware: Authenticate JWT Token
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
    req.user = decoded;
    next();
  } catch (error) {
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

app.post('/api/auth/register', async (req, res) => {
  const { full_name, email, password, role } = req.body;

  if (!full_name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Please provide all required fields.' });
  }

  try {
    const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Email already registered.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, full_name, email, role, created_at`,
      [full_name, email, hashedPassword, role || 'STUDENT']
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: newUser.rows[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
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
      process.env.JWT_SECRET || 'secret123',
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
      `SELECT s.id, s.admission_number AS admission_no, u.full_name AS name, u.email, s.class_name, s.guardian_phone, s.created_at 
       FROM students s 
       JOIN users u ON s.user_id = u.id 
       ORDER BY s.id DESC`
    );
    res.json({ success: true, data: students.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/students', async (req, res) => {
  const client = await pool.connect();
  try {
    const { fullName, email, className, guardianPhone } = req.body;
    const admissionNo = `ADM-${Date.now().toString().slice(-4)}`;

    await client.query('BEGIN');

    // Generate random temporary default password
    const tempPassword = `Student@${Math.floor(1000 + Math.random() * 9000)}`;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(tempPassword, salt);

    const userResult = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'STUDENT')
       RETURNING id;`,
      [fullName, email, hashedPassword]
    );

    const userId = userResult.rows[0].id;

    const studentResult = await client.query(
      `INSERT INTO students (user_id, admission_number, class_name, guardian_phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, admission_number AS admission_no, class_name;`,
      [userId, admissionNo, className, guardianPhone || 'N/A']
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Student enrolled successfully',
      student: {
        id: studentResult.rows[0].id,
        admission_no: studentResult.rows[0].admission_no,
        name: fullName,
        email,
        class_name: className,
        defaultPassword: tempPassword
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

app.post('/api/report-cards', verifyToken, requireRole('TEACHER', 'ADMIN', 'SUPERADMIN'), async (req, res) => {
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
    const reportCard = await pool.query(
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
    const grades = await pool.query(
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
// 3. PAYSTACK PAYMENTS MODULE
// =============================================================

app.post('/api/payments/initialize', verifyToken, async (req, res) => {
  try {
    const { studentId, amount, email, term } = req.body;
    const reference = `FEE-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Create pending record
    await pool.query(
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
      const result = await pool.query(
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
    const payments = await pool.query(
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

app.post('/api/payroll/process', verifyToken, requireRole('ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const { staffId, amount, monthYear } = req.body;

    if (!staffId || !monthYear) {
      return res.status(400).json({ success: false, message: 'Staff ID and Month/Year are required.' });
    }

    const payrollAmount = amount || 150000.00;

    const result = await pool.query(
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
    const payroll = await pool.query(
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