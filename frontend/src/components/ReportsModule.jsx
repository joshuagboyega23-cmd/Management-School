import React, { useState } from 'react';

export default function ReportsModule({ students, onSubmitGrade, onFetchReportCard, reportData }) {
  const [gradeForm, setGradeForm] = useState({
    studentId: '',
    term: 'First Term 2026',
    subject: 'Mathematics',
    caScore: '',
    examScore: ''
  });

  const [reportView, setReportView] = useState({ studentId: '' });

  const handleGradeSubmit = (e) => {
    e.preventDefault();
    onSubmitGrade(gradeForm, () => {
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
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Select Student</label>
            <select 
              value={gradeForm.studentId} 
              onChange={(e) => setGradeForm({ ...gradeForm, studentId: e.target.value })}
              required 
              className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="">-- Choose Student --</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.class_name})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Term</label>
              <input 
                type="text" 
                value={gradeForm.term} 
                onChange={(e) => setGradeForm({ ...gradeForm, term: e.target.value })}
                required 
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
              />
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
        <h3 className="text-lg font-bold text-gray-800 mb-4">View Student Report Card</h3>
        <form onSubmit={handleFetchReport} className="flex gap-3 mb-6">
          <select 
            value={reportView.studentId} 
            onChange={(e) => setReportView({ studentId: e.target.value })}
            required 
            className="flex-1 p-2.5 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">-- Choose Student --</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button type="submit" className="bg-slate-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-800">
            Fetch
          </button>
        </form>

        {reportData && (
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
              {reportData.map((s, idx) => (
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
        )}
      </div>
    </div>
  );
}