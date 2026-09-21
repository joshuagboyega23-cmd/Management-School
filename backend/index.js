const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
require('dotenv').config();

const app = express();

// Security and Middleware Configuration
app.use(helmet());
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

// Helper function to auto-calculate grade and teacher remarks
function calculateGradeAndRemark(totalScore) {
  if (totalScore >= 70) return { grade: 'A', remark: 'Excellent' };
  if (totalScore >= 60) return { grade: 'B', remark: 'Very Good' };
  if (totalScore >= 50) return { grade: 'C', remark: 'Good' };
  if (totalScore >= 45) return { grade: 'D', remark: 'Fair' };
  if (totalScore >= 40) return { grade: 'E', remark: 'Pass' };
  return { grade: 'F', remark: 'Fail - Needs Improvement' };
}

// =============================================================
// ROOT HEALTH CHECK
// =============================================================
app.get('/', (req, res) => {
  res.send('School Management System API is running...');
});

// =============================================================
// 1. AUTHENTICATION MODULE (Register & Login)
// =============================================================

// User Registration
app.post('/api/auth/register', async (req, res) => {
  const { full_name, email, password, role } = req.body;

  try {
    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await pool.query(
      'INSERT INTO users (full_name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, full_name, email, role',
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

// User Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const user = userResult.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
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
// 2. STUDENT & REPORT CARD GRADING MODULE
// =============================================================

// Register Student Profile
app.post('/api/students/register', async (req, res) => {
  const { user_id, admission_no, class_name } = req.body;

  try {
    const newStudent = await pool.query(
      `INSERT INTO students (user_id, admission_no, class_name)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [user_id, admission_no, class_name]
    );

    res.status(201).json({
      success: true,
      message: 'Student profile created successfully',
      student: newStudent.rows[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Input Marks & Generate Report Card Entry
app.post('/api/students/grades', async (req, res) => {
  const { student_id, term, subject, ca_score, exam_score } = req.body;

  if (parseFloat(ca_score) > 40 || parseFloat(exam_score) > 60) {
    return res.status(400).json({
      success: false,
      message: 'CA score cannot exceed 40 and Exam score cannot exceed 60'
    });
  }

  const totalScore = parseFloat(ca_score) + parseFloat(exam_score);
  const { grade } = calculateGradeAndRemark(totalScore);

  try {
    const reportCard = await pool.query(
      `INSERT INTO report_cards (student_id, term, subject, ca_score, exam_score, total_score, grade)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [student_id, term, subject, ca_score, exam_score, totalScore, grade]
    );

    res.status(201).json({
      success: true,
      message: 'Subject grade recorded successfully',
      reportCard: reportCard.rows[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fetch Student Report Card for a Term
app.get('/api/students/report-card/:student_id/:term', async (req, res) => {
  const { student_id, term } = req.params;

  try {
    const studentInfo = await pool.query(
      `SELECT s.id as student_id, u.full_name, s.admission_no, s.class_name
       FROM students s
       JOIN users u ON s.user_id = u.id
       WHERE s.id = $1`,
      [student_id]
    );

    if (studentInfo.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const grades = await pool.query(
      `SELECT subject, ca_score, exam_score, total_score, grade
       FROM report_cards
       WHERE student_id = $1 AND term = $2`,
      [student_id, term]
    );

    const totalSubjectCount = grades.rows.length;
    const overallSum = grades.rows.reduce((acc, curr) => acc + parseFloat(curr.total_score), 0);
    const overallAverage = totalSubjectCount > 0 ? (overallSum / totalSubjectCount).toFixed(2) : 0;

    res.json({
      success: true,
      student: studentInfo.rows[0],
      term,
      overallAverage,
      totalSubjects: totalSubjectCount,
      subjects: grades.rows
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET All Students (For Frontend Dashboard View)
app.get('/api/students', async (req, res) => {
  try {
    const students = await pool.query(
      `SELECT s.id, s.admission_no, u.full_name AS name, s.class_name 
       FROM students s 
       JOIN users u ON s.user_id = u.id 
       ORDER BY s.id ASC`
    );
    res.json(students.rows);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================
// 3. FINANCIAL ENGINE & PAYSTACK PAYMENTS MODULE
// =============================================================

// Initialize Payment
app.post('/api/payments/initialize', async (req, res) => {
  try {
    const { studentId, amount, email, term } = req.body;
    const reference = `FEE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    await pool.query(
      `INSERT INTO fee_payments (student_id, amount, reference, status, term) VALUES ($1, $2, $3, $4, $5)`,
      [studentId, amount, reference, 'PENDING', term]
    );

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount: amount * 100,
        reference
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
    res.status(500).json({ success: false, error: err.message });
  }
});

// Verify Payment
app.get('/api/payments/verify/:reference', async (req, res) => {
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
      return res.json({ success: true, data: result.rows[0] });
    }

    res.status(400).json({ success: false, message: 'Payment verification failed' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================
// 4. HR & PAYROLL MODULE
// =============================================================

// Process Payroll
app.post('/api/payroll/process', async (req, res) => {
  try {
    const { staffName, baseSalary, monthYear } = req.body;

    const result = await pool.query(
      `INSERT INTO payroll (staff_name, base_salary, month_year, is_paid, paid_at)
       VALUES ($1, $2, $3, TRUE, NOW()) RETURNING *`,
      [staffName, baseSalary, monthYear]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start Express Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running smoothly on http://localhost:${PORT}`));