import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { downloadReportCardPDF } from '../utils/pdfUtils';

const CLASS_OPTIONS = ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'];

const filterStudentsByClass = (list, selectedClass) => {
  if (!selectedClass) return list;
  const target = selectedClass.toUpperCase().trim();
  return list.filter((s) => {
    const cName = (s.class_name || '').toUpperCase().trim();
    const cLevel = (s.class_level || '').toUpperCase().trim();
    return cName.startsWith(target) || cLevel === target || String(s.class_id) === target;
  });
};

export default function ReportsModule({ students, onSubmitGrade, onFetchReportCard, reportData }) {
  const [gradeClass, setGradeClass] = useState('');
  const [gradeForm, setGradeForm] = useState({
    studentId: '',
    term: 'First Term',
    subject: 'Mathematics',
    caScore: '',
    examScore: ''
  });

  const [viewClass, setViewClass] = useState('');
  const [reportView, setReportView] = useState({ studentId: '' });

  const studentList = Array.isArray(students) ? students : [];
  const reportList = Array.isArray(reportData) ? reportData : [];

  const filteredGradeStudents = filterStudentsByClass(studentList, gradeClass);
  const filteredViewStudents = filterStudentsByClass(studentList, viewClass);

  const handleGradeSubmit = (e) => {
    e.preventDefault();
    onSubmitGrade({
      ...gradeForm,
      studentId: Number(gradeForm.studentId),
      caScore: Number(gradeForm.caScore),
      examScore: Number(gradeForm.examScore)
    }, () => {
      setGradeForm({ ...gradeForm, caScore: '', examScore: '' });
    });
  };

  const handleFetchReport = (e) => {
    e.preventDefault(); // <-- THIS PREVENTS THE PAGE REFRESH / BLANK SCREEN
    if (!reportView.studentId) return;
    onFetchReportCard(reportView.studentId);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Grade Entry Form */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Record Subject Assessment</h3>
        <form onSubmit={handleGradeSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">1. Select Class</label>
              <select
                value={gradeClass}
                onChange={(e) => {
                  setGradeClass(e.target.value);
                  setGradeForm({ ...gradeForm, studentId: '' });
                }}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="">-- All Classes (JSS1 - SS3) --</option>
                {CLASS_OPTIONS.map((cls) => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">2. Select Student</label>
              <select 
                value={gradeForm.studentId} 
                onChange={(e) => setGradeForm({ ...gradeForm, studentId: e.target.value })}
                required 
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="">-- Choose Student --</option>
                {filteredGradeStudents.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.class_name || 'No Class'})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Term</label>
              <select 
                value={gradeForm.term} 
                onChange={(e) => setGradeForm({ ...gradeForm, term: e.target.value })}
                required 
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="First Term">First Term</option>
                <option value="Second Term">Second Term</option>
                <option value="Third Term">Third Term</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Subject</label>
              <input 
                type="text" 
                value={gradeForm.subject} 
                onChange={(e) => setGradeForm({ ...gradeForm, subject: e.target.value })}
                required 
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">CA Score (Max 40)</label>
              <input 
                type="number" 
                max="40"
                value={gradeForm.caScore} 
                onChange={(e) => setGradeForm({ ...gradeForm, caScore: e.target.value })}
                required 
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Exam Score (Max 60)</label>
              <input 
                type="number" 
                max="60"
                value={gradeForm.examScore} 
                onChange={(e) => setGradeForm({ ...gradeForm, examScore: e.target.value })}
                required 
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <button type="submit" className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition">
            Submit Grade Record
          </button>
        </form>
      </div>

      {/* Report Card Viewer */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">View Student Report Card</h3>
          {reportList.length > 0 && (() => {
            const sel = studentList.find(s => String(s.id) === String(reportView.studentId));
            return (
              <button
                onClick={() => downloadReportCardPDF(sel, reportList)}
                className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition"
              >
                <Download className="h-3.5 w-3.5" /> Download PDF
              </button>
            );
          })()}
        </div>
        <form onSubmit={handleFetchReport} className="space-y-3 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">1. Select Class</label>
              <select
                value={viewClass}
                onChange={(e) => {
                  setViewClass(e.target.value);
                  setReportView({ studentId: '' });
                }}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="">-- All Classes (JSS1 - SS3) --</option>
                {CLASS_OPTIONS.map((cls) => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">2. Select Student</label>
              <select 
                value={reportView.studentId} 
                onChange={(e) => setReportView({ studentId: e.target.value })}
                required 
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="">-- Choose Student --</option>
                {filteredViewStudents.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.class_name || 'No Class'})</option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" className="w-full bg-slate-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-700 transition">
            Fetch Report Card
          </button>
        </form>

        {reportList.length > 0 ? (
          <table className="w-full text-left border-collapse text-xs bg-white rounded border border-gray-200">
            <thead>
              <tr className="border-b bg-gray-100">
                <th className="p-2">Subject</th>
                <th className="p-2">CA</th>
                <th className="p-2">Exam</th>
                <th className="p-2">Total</th>
                <th className="p-2">Grade</th>
              </tr>
            </thead>
            <tbody>
              {reportList.map((s, idx) => (
                <tr key={idx} className="border-b">
                  <td className="p-2 font-medium">{s.subject}</td>
                  <td className="p-2">{s.ca_score}</td>
                  <td className="p-2">{s.exam_score}</td>
                  <td className="p-2 font-bold">{s.total_score}</td>
                  <td className="p-2 text-blue-600 font-bold">{s.grade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : reportData && (
          <p className="text-xs text-gray-500 italic py-2">No grades recorded yet for this student.</p>
        )}
      </div>
    </div>
  );
}