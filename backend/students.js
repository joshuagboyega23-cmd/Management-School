const express = require('express');
const pool = require('./db');
const router = express.Router();

// Helper function to auto-calculate grade and teacher remarks
function calculateGradeAndRemark(totalScore) {
  if (totalScore >= 70) return { grade: 'A', remark: 'Excellent' };
  if (totalScore >= 60) return { grade: 'B', remark: 'Very Good' };
  if (totalScore >= 50) return { grade: 'C', remark: 'Good' };
  if (totalScore >= 45) return { grade: 'D', remark: 'Fair' };
  if (totalScore >= 40) return { grade: 'E', remark: 'Pass' };
  return { grade: 'F', remark: 'Fail - Needs Improvement' };
}

// -------------------------------------------------------------
// 1. REGISTER NEW STUDENT
// -------------------------------------------------------------
router.post('/register', async (req, res) => {
  const { user_id, admission_no, class_name, guardian_phone } = req.body;

  try {
    const newStudent = await pool.query(
      `INSERT INTO student_profiles (user_id, admission_no, class_name, guardian_phone)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [user_id, admission_no, class_name, guardian_phone]
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

// -------------------------------------------------------------
// 2. INPUT MARKS & GENERATE REPORT CARD
// -------------------------------------------------------------
router.post('/grades', async (req, res) => {
  const { student_id, term, subject, ca_score, exam_score } = req.body;

  // Validate CA and Exam score bounds (e.g., CA max 40, Exam max 60)
  if (ca_score > 40 || exam_score > 60) {
    return res.status(400).json({
      success: false,
      message: 'CA score cannot exceed 40 and Exam score cannot exceed 60'
    });
  }

  const totalScore = parseFloat(ca_score) + parseFloat(exam_score);
  const { grade, remark } = calculateGradeAndRemark(totalScore);

  try {
    const reportCard = await pool.query(
      `INSERT INTO report_cards (student_id, term, subject, ca_score, exam_score, total_score, grade, remark)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [student_id, term, subject, ca_score, exam_score, totalScore, grade, remark]
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

// -------------------------------------------------------------
// 3. FETCH STUDENT REPORT CARD FOR A SPECIFIC TERM
// -------------------------------------------------------------
router.get('/report-card/:student_id/:term', async (req, res) => {
  const { student_id, term } = req.params;

  try {
    // Get student details with full user name
    const studentInfo = await pool.query(
      `SELECT sp.id as student_id, u.full_name, sp.admission_no, sp.class_name
       FROM student_profiles sp
       JOIN users u ON sp.user_id = u.id
       WHERE sp.id = $1`,
      [student_id]
    );

    if (studentInfo.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Get all subject grades for the given term
    const grades = await pool.query(
      `SELECT subject, ca_score, exam_score, total_score, grade, remark
       FROM report_cards
       WHERE student_id = $1 AND term = $2`,
      [student_id, term]
    );

    // Calculate term overall average
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

module.exports = router;