import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, LogOut, FileText, CheckCircle, AlertCircle, Users, BookOpen, Plus } from 'lucide-react';
import API from '../opi';

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({ type: '', text: '' });
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [reportData, setReportData] = useState(null);

  const [gradeForm, setGradeForm] = useState({
    studentId: '',
    term: 'First Term 2026',
    subject: 'Mathematics',
    caScore: '',
    examScore: ''
  });

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const res = await API.get('/students');
      const list = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
      setStudents(list);
    } catch (err) {
      showNotification('error', err.response?.data?.message || 'Failed to fetch student roster');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const showNotification = (type, text) => {
    setNotification({ type, text });
    setTimeout(() => setNotification({ type: '', text: '' }), 4000);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleGradeSubmit = async (e) => {
    e.preventDefault();
    try {
      await API.post('/report-cards', gradeForm);
      showNotification('success', 'Assessment grade recorded successfully!');
      if (gradeForm.studentId === selectedStudentId) {
        fetchStudentReport(gradeForm.studentId);
      }
      setGradeForm({
        ...gradeForm,
        caScore: '',
        examScore: ''
      });
    } catch (err) {
      showNotification('error', err.response?.data?.message || err.response?.data?.error || 'Failed to submit grade');
    }
  };

  const fetchStudentReport = async (studentId) => {
    if (!studentId) return;
    try {
      const res = await API.get(`/report-cards/student/${studentId}`);
      setReportData(res.data.data);
    } catch (err) {
      setReportData(null);
    }
  };

  const handleStudentSelect = (studentId) => {
    setSelectedStudentId(studentId);
    fetchStudentReport(studentId);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="bg-slate-900 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 rounded-full p-2">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Teacher Grading Portal</h1>
              <p className="text-xs text-slate-400">Pinnacle Heights Academy</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg transition"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {notification.text && (
          <div className={`mb-6 p-4 rounded-xl text-sm font-medium ${
            notification.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {notification.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Grade Submission Form */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-600" /> Enter Student Assessment
            </h3>
            <p className="text-xs text-slate-500 mb-6">Record Continuous Assessment (CA) and Exam scores</p>

            <form onSubmit={handleGradeSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Select Student</label>
                <select
                  value={gradeForm.studentId}
                  onChange={(e) => setGradeForm({ ...gradeForm, studentId: e.target.value })}
                  required
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="">-- Choose Student --</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.admission_no || s.admission_number}) - {s.class_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Subject</label>
                  <input
                    type="text"
                    value={gradeForm.subject}
                    onChange={(e) => setGradeForm({ ...gradeForm, subject: e.target.value })}
                    required
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Term</label>
                  <input
                    type="text"
                    value={gradeForm.term}
                    onChange={(e) => setGradeForm({ ...gradeForm, term: e.target.value })}
                    required
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">CA Score (Max 40)</label>
                  <input
                    type="number"
                    max={40}
                    min={0}
                    step="0.1"
                    value={gradeForm.caScore}
                    onChange={(e) => setGradeForm({ ...gradeForm, caScore: e.target.value })}
                    required
                    placeholder="35"
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Exam Score (Max 60)</label>
                  <input
                    type="number"
                    max={60}
                    min={0}
                    step="0.1"
                    value={gradeForm.examScore}
                    onChange={(e) => setGradeForm({ ...gradeForm, examScore: e.target.value })}
                    required
                    placeholder="52"
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg text-sm transition shadow flex items-center justify-center gap-2 mt-4"
              >
                <Plus className="h-4 w-4" /> Save Grade Record
              </button>
            </form>
          </div>

          {/* Student Report Preview */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" /> Student Grade Sheet
            </h3>
            <p className="text-xs text-slate-500 mb-4">Select a student to view their current term records</p>

            <div className="mb-4">
              <select
                value={selectedStudentId}
                onChange={(e) => handleStudentSelect(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white"
              >
                <option value="">-- Choose Student to View --</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.admission_no || s.admission_number})
                  </option>
                ))}
              </select>
            </div>

            {selectedStudentId ? (
              reportData && reportData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-medium">
                        <th className="pb-2">Subject</th>
                        <th className="pb-2">CA</th>
                        <th className="pb-2">Exam</th>
                        <th className="pb-2">Total</th>
                        <th className="pb-2">Grade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {reportData.map((r) => (
                        <tr key={r.id}>
                          <td className="py-2.5 font-medium">{r.subject}</td>
                          <td className="py-2.5 font-mono">{r.ca_score}</td>
                          <td className="py-2.5 font-mono">{r.exam_score}</td>
                          <td className="py-2.5 font-bold font-mono text-blue-600">{r.total_score}</td>
                          <td className="py-2.5 font-bold">{r.grade}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-400 py-8 text-center">No assessment records found for this student.</p>
              )
            ) : (
              <p className="text-sm text-slate-400 py-8 text-center">Please select a student from the dropdown above.</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

