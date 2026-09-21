import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, FileText, CreditCard, DollarSign, CheckCircle, GraduationCap, Plus, ExternalLink, Send } from 'lucide-react';

const API_BASE = 'http://localhost:5000/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('students');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // -------------------------------------------------------------
  // FORM STATES
  // -------------------------------------------------------------
  // Grade Form State
  const [gradeForm, setGradeForm] = useState({
    student_id: '',
    term: 'First Term 2026',
    subject: 'Mathematics',
    ca_score: '',
    exam_score: ''
  });

  // Report Card Viewer State
  const [reportView, setReportView] = useState({ student_id: '', term: 'First Term 2026' });
  const [reportData, setReportData] = useState(null);

  // Fee Payment State
  const [paymentForm, setPaymentForm] = useState({
    studentId: '',
    email: '',
    amount: '',
    term: 'First Term 2026'
  });

  // Payroll State
  const [payrollForm, setPayrollForm] = useState({
    staffName: '',
    baseSalary: '',
    monthYear: '09-2026'
  });

  // -------------------------------------------------------------
  // API FETCHERS
  // -------------------------------------------------------------
  const fetchStudents = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/students`);
      setStudents(res.data);
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const showNotification = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 4000);
  };

  // -------------------------------------------------------------
  // HANDLERS
  // -------------------------------------------------------------
  // Submit Grades
  const handleGradeSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/students/grades`, gradeForm);
      showNotification('success', 'Grade recorded successfully!');
      setGradeForm({ ...gradeForm, ca_score: '', exam_score: '' });
    } catch (err) {
      showNotification('error', err.response?.data?.message || 'Failed to submit grade');
    }
  };

  // Fetch Report Card
  const handleFetchReportCard = async (e) => {
    e.preventDefault();
    if (!reportView.student_id) return;
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/students/report-card/${reportView.student_id}/${reportView.term}`);
      setReportData(res.data);
    } catch (err) {
      showNotification('error', err.response?.data?.message || 'Report card not found');
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  // Initialize Payment
  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_BASE}/payments/initialize`, paymentForm);
      if (res.data.success && res.data.paymentUrl) {
        window.open(res.data.paymentUrl, '_blank');
        showNotification('success', 'Paystack payment page opened in a new tab.');
      }
    } catch (err) {
      showNotification('error', err.response?.data?.message || 'Payment initialization failed');
    }
  };

  // Process Payroll
  const handlePayrollSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/payroll/process`, payrollForm);
      showNotification('success', `Payroll processed for ${payrollForm.staffName}`);
      setPayrollForm({ staffName: '', baseSalary: '', monthYear: '09-2026' });
    } catch (err) {
      showNotification('error', err.response?.data?.message || 'Payroll processing failed');
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col p-4 shadow-lg">
        <div className="flex items-center gap-3 px-2 py-4 border-b border-slate-800">
          <GraduationCap className="h-8 w-8 text-blue-400" />
          <h1 className="text-xl font-bold tracking-wide">Academia SMS</h1>
        </div>

        <nav className="mt-6 flex flex-col gap-2">
          <button 
            onClick={() => setActiveTab('students')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'students' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Users className="h-5 w-5" /> Student Records
          </button>
          <button 
            onClick={() => setActiveTab('reports')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'reports' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <FileText className="h-5 w-5" /> Report Cards
          </button>
          <button 
            onClick={() => setActiveTab('payments')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'payments' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <CreditCard className="h-5 w-5" /> Fee Payments
          </button>
          <button 
            onClick={() => setActiveTab('payroll')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'payroll' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <DollarSign className="h-5 w-5" /> Staff Payroll
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8">
        <header className="flex justify-between items-center mb-6 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 capitalize">{activeTab.replace('-', ' ')} Portal</h2>
            <p className="text-sm text-gray-500">School Management Administrative Dashboard</p>
          </div>
          <span className="bg-emerald-100 text-emerald-800 text-xs px-3 py-1 rounded-full font-semibold flex items-center gap-1">
            <CheckCircle className="h-3 w-3" /> API Connected
          </span>
        </header>

        {/* Global Banner Notification */}
        {message.text && (
          <div className={`mb-6 p-4 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 1. STUDENT RECORDS MODULE */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'students' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-800">Enrolled Students</h3>
            </div>
            {loading ? (
              <p className="text-gray-500">Loading student directory...</p>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-600 text-sm">
                    <th className="pb-3">ID</th>
                    <th className="pb-3">Admission No</th>
                    <th className="pb-3">Full Name</th>
                    <th className="pb-3">Class</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                  {students.length > 0 ? (
                    students.map((student) => (
                      <tr key={student.id}>
                        <td className="py-3 font-mono text-gray-400">{student.id}</td>
                        <td className="py-3 font-mono text-blue-600">{student.admission_no}</td>
                        <td className="py-3 font-medium">{student.name}</td>
                        <td className="py-3">{student.class_name}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="py-4 text-center text-gray-400">No student records found in database.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 2. REPORT CARDS & GRADING MODULE */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'reports' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Form: Add Subject Grade */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Record Assessment Score</h3>
              <form onSubmit={handleGradeSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Select Student</label>
                  <select 
                    value={gradeForm.student_id} 
                    onChange={(e) => setGradeForm({ ...gradeForm, student_id: e.target.value })}
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
                      value={gradeForm.ca_score} 
                      onChange={(e) => setGradeForm({ ...gradeForm, ca_score: e.target.value })}
                      required 
                      className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Exam Score (Max 60)</label>
                    <input 
                      type="number" 
                      max="60"
                      value={gradeForm.exam_score} 
                      onChange={(e) => setGradeForm({ ...gradeForm, exam_score: e.target.value })}
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

            {/* View Report Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold text-gray-800 mb-4">View Term Report Card</h3>
              <form onSubmit={handleFetchReportCard} className="flex gap-3 mb-6">
                <select 
                  value={reportView.student_id} 
                  onChange={(e) => setReportView({ ...reportView, student_id: e.target.value })}
                  required 
                  className="flex-1 p-2.5 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">-- Choose Student --</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button type="submit" className="bg-slate-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-800">
                  Generate
                </button>
              </form>

              {reportData && (
                <div className="border border-gray-200 p-4 rounded-lg bg-gray-50 text-sm space-y-3">
                  <div className="border-b pb-2 flex justify-between font-bold">
                    <span>{reportData.student.full_name}</span>
                    <span className="text-blue-600">{reportData.term}</span>
                  </div>
                  <div className="text-xs text-gray-600">
                    Average Score: <strong className="text-gray-900">{reportData.overallAverage}%</strong> | Total Subjects: <strong>{reportData.totalSubjects}</strong>
                  </div>
                  <table className="w-full text-left border-collapse text-xs mt-2 bg-white rounded border">
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
                      {reportData.subjects.map((s, idx) => (
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
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 3. FEE PAYMENTS MODULE */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'payments' && (
          <div className="max-w-xl bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="text-lg font-bold text-gray-800 mb-2">School Fee Checkout (Paystack)</h3>
            <p className="text-xs text-gray-500 mb-6">Initialize direct online tuition payments for students.</p>

            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Select Student</label>
                <select 
                  value={paymentForm.studentId} 
                  onChange={(e) => setPaymentForm({ ...paymentForm, studentId: e.target.value })}
                  required 
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">-- Choose Student --</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.admission_no})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Parent / Guardian Email</label>
                <input 
                  type="email" 
                  value={paymentForm.email} 
                  onChange={(e) => setPaymentForm({ ...paymentForm, email: e.target.value })}
                  placeholder="parent@example.com"
                  required 
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Amount (₦)</label>
                  <input 
                    type="number" 
                    value={paymentForm.amount} 
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    placeholder="50000"
                    required 
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Term</label>
                  <input 
                    type="text" 
                    value={paymentForm.term} 
                    onChange={(e) => setPaymentForm({ ...paymentForm, term: e.target.value })}
                    required 
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <button type="submit" className="w-full bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition flex items-center justify-center gap-2">
                Pay Fees via Paystack <ExternalLink className="h-4 w-4" />
              </button>
            </form>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 4. STAFF PAYROLL MODULE */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'payroll' && (
          <div className="max-w-xl bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Process Staff Salary</h3>
            <p className="text-xs text-gray-500 mb-6">Issue monthly payroll payments to teachers and school administration.</p>

            <form onSubmit={handlePayrollSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Staff Full Name</label>
                <input 
                  type="text" 
                  value={payrollForm.staffName} 
                  onChange={(e) => setPayrollForm({ ...payrollForm, staffName: e.target.value })}
                  placeholder="e.g. Mr. John Doe"
                  required 
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Base Salary (₦)</label>
                  <input 
                    type="number" 
                    value={payrollForm.baseSalary} 
                    onChange={(e) => setPayrollForm({ ...payrollForm, baseSalary: e.target.value })}
                    placeholder="150000"
                    required 
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Month/Year</label>
                  <input 
                    type="text" 
                    value={payrollForm.monthYear} 
                    onChange={(e) => setPayrollForm({ ...payrollForm, monthYear: e.target.value })}
                    required 
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <button type="submit" className="w-full bg-slate-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-800 transition flex items-center justify-center gap-2">
                Process Salary Disbursement <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}