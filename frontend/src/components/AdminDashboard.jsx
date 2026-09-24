import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Users, UserCheck, FileText, CreditCard, CheckCircle, GraduationCap, ArrowLeft, LogOut, Menu, X } from 'lucide-react';

import StudentsModule from './StudentsModule';
import StaffModule from './StaffModule';
import ReportsModule from './ReportsModule';
import PaymentsModule from './PaymentsModule';
import PayrollModule from './PayrollModule';
import API from '../opi';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('students');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [reportData, setReportData] = useState(null);

  // Fetch Students
  const fetchStudents = async () => {
    try {
      setLoading(true);
      const res = await API.get('/students');
      const list = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
      setStudents(list);
    } catch (err) {
      console.error('Error fetching students:', err);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Teachers
  const fetchTeachers = async () => {
    try {
      setLoadingStaff(true);
      const res = await API.get('/teachers');
      const list = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
      setTeachers(list);
    } catch (err) {
      console.error('Error fetching teachers:', err);
      setTeachers([]);
    } finally {
      setLoadingStaff(false);
    }
  };

  useEffect(() => {
    fetchStudents();
    fetchTeachers();
  }, []);

  const showNotification = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 4000);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleTabSelect = (tab) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  // 1. Add Student Action
  const handleAddStudent = async (studentForm, onSuccess) => {
    try {
      await API.post('/students', studentForm);
      showNotification('success', 'Student enrolled successfully!');
      fetchStudents();
      if (onSuccess) onSuccess();
    } catch (err) {
      showNotification('error', err.response?.data?.message || err.response?.data?.error || 'Failed to add student');
    }
  };

  // 2. Import Staff Action
  const handleImportTeachers = async (teacherPayload, onSuccess) => {
    try {
      const res = await API.post('/auth/admin/import-teachers', teacherPayload);
      showNotification('success', res.data?.message || 'Staff roster imported successfully!');
      fetchTeachers();
      if (onSuccess && res.data?.teachers) {
        onSuccess(res.data.teachers);
      }
    } catch (err) {
      showNotification('error', err.response?.data?.message || err.response?.data?.error || 'Failed to import staff');
    }
  };

  // 3. Submit Grade Action
  const handleGradeSubmit = async (gradeForm, onSuccess) => {
    try {
      await API.post('/report-cards', gradeForm);
      showNotification('success', 'Grade recorded successfully!');
      if (onSuccess) onSuccess();
    } catch (err) {
      showNotification('error', err.response?.data?.message || err.response?.data?.error || 'Failed to submit grade');
    }
  };

  // 4. Fetch Report Card
  const handleFetchReportCard = async (studentId) => {
    if (!studentId) return;
    try {
      setLoading(true);
      const res = await API.get(`/report-cards/student/${studentId}`);
      setReportData(res.data.data);
    } catch (err) {
      showNotification('error', 'Report card not found');
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  // 5. Paystack Payment Action
  const handlePaymentSubmit = async (paymentForm) => {
    try {
      const res = await API.post('/payments/initialize', paymentForm);
      if (res.data.success && res.data.paymentUrl) {
        window.open(res.data.paymentUrl, '_blank');
        showNotification('success', 'Redirecting to Paystack checkout...');
      }
    } catch (err) {
      showNotification('error', err.response?.data?.error || 'Payment initialization failed');
    }
  };

  // 6. Payroll Action
  const handlePayrollSubmit = async (payrollForm) => {
    try {
      await API.post('/payroll/process', payrollForm);
      showNotification('success', 'Payroll processed successfully');
    } catch (err) {
      showNotification('error', err.response?.data?.error || 'Payroll processing failed');
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">
      {/* Mobile Backdrop Overlay */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-30 md:hidden transition-opacity"
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white flex flex-col p-4 shadow-2xl md:shadow-lg shrink-0 transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex items-center justify-between px-2 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-8 w-8 text-blue-400" />
            <div>
              <h1 className="text-base font-bold leading-tight">Pinnacle Heights</h1>
              <p className="text-xs text-slate-400 leading-tight">Admin Portal</p>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="mt-6 flex flex-col gap-2">
          <button 
            onClick={() => handleTabSelect('students')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'students' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Users className="h-5 w-5" /> Student Records
          </button>
          <button 
            onClick={() => handleTabSelect('staff')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'staff' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <UserCheck className="h-5 w-5" /> Staff Management
          </button>
          <button 
            onClick={() => handleTabSelect('reports')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'reports' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <FileText className="h-5 w-5" /> Report Cards
          </button>
          <button 
            onClick={() => handleTabSelect('payments')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'payments' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <CreditCard className="h-5 w-5" /> Fee Payments
          </button>
          <button 
            onClick={() => handleTabSelect('payroll')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'payroll' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <span className="h-5 w-5 flex items-center justify-center font-bold text-base leading-none">₦</span> Staff Payroll
          </button>
        </nav>

        {/* Footer controls */}
        <div className="mt-auto pt-4 border-t border-slate-800 space-y-2">
          <Link
            to="/"
            onClick={() => setIsSidebarOpen(false)}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-xs px-2 py-2 rounded transition w-full"
          >
            <ArrowLeft className="h-4 w-4" /> Back to School Website
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-red-400 hover:text-red-300 text-xs px-2 py-2 rounded transition w-full"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-8">
        <header className="flex justify-between items-center mb-6 bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800 capitalize">{activeTab.replace('-', ' ')} Portal</h2>
              <p className="text-xs sm:text-sm text-gray-500">Pinnacle Heights Academy — Administrative Dashboard</p>
            </div>
          </div>
          <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 sm:px-3 rounded-full font-semibold flex items-center gap-1 shrink-0">
            <CheckCircle className="h-3 w-3" /> <span className="hidden sm:inline">Authenticated</span> Session
          </span>
        </header>

        {/* Global Notification Banner */}
        {message.text && (
          <div className={`mb-6 p-4 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        {/* Tab Displays */}
        {activeTab === 'students' && (
          <StudentsModule 
            students={students} 
            loading={loading} 
            onAddStudent={handleAddStudent} 
          />
        )}

        {activeTab === 'staff' && (
          <StaffModule 
            teachers={teachers} 
            loading={loadingStaff} 
            onImportTeachers={handleImportTeachers} 
          />
        )}

        {activeTab === 'reports' && (
          <ReportsModule 
            students={students} 
            onSubmitGrade={handleGradeSubmit} 
            onFetchReportCard={handleFetchReportCard} 
            reportData={reportData} 
          />
        )}

        {activeTab === 'payments' && (
          <PaymentsModule 
            students={students} 
            onProcessPayment={handlePaymentSubmit} 
          />
        )}

        {activeTab === 'payroll' && (
          <PayrollModule 
            teachers={teachers}
            onProcessPayroll={handlePayrollSubmit} 
          />
        )}
      </main>
    </div>
  );
}

