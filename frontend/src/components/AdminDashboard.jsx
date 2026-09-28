import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Users, UserCheck, FileText, CreditCard, CheckCircle, GraduationCap, ArrowLeft, LogOut, Menu, X, Clock, RefreshCw, Bell, MessageSquareText, KeyRound, Share2 } from 'lucide-react';

import StudentsModule from './StudentsModule';
import StaffModule from './StaffModule';
import ReportsModule from './ReportsModule';
import PaymentsModule from './PaymentsModule';
import PayrollModule from './PayrollModule';
import API from '../opi';
import { formatDateTime } from '../utils/pdfUtils';
import PasswordInput from './PasswordInput';
import MaterialsManager from './MaterialsManager';

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
  const [pendingPayments, setPendingPayments] = useState([]);
  const [verifyingRef, setVerifyingRef] = useState('');
  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    message: '',
    visible_to_students: true,
    visible_to_parents: true,
    visible_to_teachers: true,
    event_date: ''
  });
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [conversationThread, setConversationThread] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [selectedResetUser, setSelectedResetUser] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');
  const [issuedPassword, setIssuedPassword] = useState('');
  const [newMessageForm, setNewMessageForm] = useState({
    target_role: 'PARENT',
    subject: '',
    body: ''
  });

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

  const fetchPendingPayments = async () => {
    try {
      const res = await API.get('/payments/history');
      const list = Array.isArray(res.data?.data) ? res.data.data : [];
      setPendingPayments(list.filter((payment) => payment.status === 'PENDING'));
    } catch (err) {
      console.error('Error fetching pending payments:', err);
      setPendingPayments([]);
    }
  };

  const fetchConversations = async () => {
    try {
      const res = await API.get('/conversations');
      const list = Array.isArray(res.data?.data) ? res.data.data : [];
      setConversations(list);
      if (list.length > 0 && !selectedConversationId) {
        setSelectedConversationId(String(list[0].id));
      }
    } catch (err) {
      setConversations([]);
    }
  };

  const fetchConversationThread = async (conversationId) => {
    if (!conversationId) return;
    try {
      const res = await API.get(`/conversations/${conversationId}/messages`);
      setConversationThread(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      setConversationThread([]);
    }
  };

  const handleVerifyPending = async (reference) => {
    try {
      setVerifyingRef(reference);
      const res = await API.get(`/payments/verify/${reference}`);
      if (res.data.success) {
        showNotification('success', 'Payment verified successfully! Status updated.');
      } else {
        showNotification('error', res.data.message || 'Payment is still pending or unconfirmed.');
      }
      await fetchPendingPayments();
    } catch (err) {
      showNotification('error', err.response?.data?.message || 'Could not verify payment status.');
    } finally {
      setVerifyingRef('');
    }
  };

  useEffect(() => {
    fetchStudents();
    fetchTeachers();
    fetchPendingPayments();
    fetchConversations();
  }, []);

  useEffect(() => {
    if (selectedConversationId) {
      fetchConversationThread(selectedConversationId);
    }
  }, [selectedConversationId]);

  useEffect(() => {
    const query = userSearch.trim();
    if (!query) {
      setUserSearchResults([]);
      return undefined;
    }

    let active = true;
    const timeoutId = setTimeout(async () => {
      try {
        const res = await API.get('/admin/users', { params: { query } });
        if (active) setUserSearchResults(Array.isArray(res.data?.data) ? res.data.data : []);
      } catch (err) {
        if (active) setUserSearchResults([]);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [userSearch]);

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
        window.location.href = res.data.paymentUrl;
        showNotification('success', 'Redirecting to Paystack checkout...');
      }
    } catch (err) {
      showNotification('error', err.response?.data?.error || 'Payment initialization failed');
    }
  };

  // 6. Payroll Action
  const handlePayrollSubmit = async (payrollForm, onSuccess) => {
    try {
      await API.post('/payroll/process', payrollForm);
      showNotification('success', 'Salary record logged successfully');
      if (onSuccess) onSuccess();
    } catch (err) {
      showNotification('error', err.response?.data?.error || err.response?.data?.message || 'Payroll processing failed');
    }
  };

  const handleAnnouncementSubmit = async (e) => {
    e.preventDefault();
    try {
      await API.post('/announcements', {
        ...announcementForm,
        visible_to_students: Boolean(announcementForm.visible_to_students),
        visible_to_parents: Boolean(announcementForm.visible_to_parents),
        visible_to_teachers: Boolean(announcementForm.visible_to_teachers)
      });
      showNotification('success', 'Announcement posted successfully.');
      setAnnouncementForm({
        title: '',
        message: '',
        visible_to_students: true,
        visible_to_parents: true,
        visible_to_teachers: true,
        event_date: ''
      });
    } catch (err) {
      showNotification('error', err.response?.data?.message || err.response?.data?.error || 'Failed to post announcement');
    }
  };

  const handleReplySubmit = async (e) => {
    e.preventDefault();
    if (!selectedConversationId || !replyText.trim()) return;
    try {
      await API.post(`/conversations/${selectedConversationId}/messages`, { body: replyText });
      setReplyText('');
      fetchConversationThread(selectedConversationId);
      fetchConversations();
    } catch (err) {
      showNotification('error', err.response?.data?.message || 'Failed to send message');
    }
  };

  const handleCreateConversation = async (e) => {
    e.preventDefault();
    try {
      const res = await API.post('/conversations', {
        target_role: newMessageForm.target_role,
        subject: newMessageForm.subject,
        body: newMessageForm.body
      });
      if (res.data.success) {
        const count = Number(res.data.threadsCreated || 0);
        showNotification('success', `Message sent in ${count} private thread${count === 1 ? '' : 's'}.`);
        setNewMessageForm({
          target_role: newMessageForm.target_role,
          subject: '',
          body: ''
        });
        fetchConversations();
      }
    } catch (err) {
      showNotification('error', err.response?.data?.message || 'Failed to send message');
    }
  };

  const handleAdminPasswordReset = async (e) => {
    e.preventDefault();
    if (!selectedResetUser) return;
    if (resetPassword !== confirmResetPassword) {
      showNotification('error', 'Passwords do not match.');
      return;
    }

    try {
      await API.post('/admin/reset-user-password', {
        userId: selectedResetUser.id,
        newPassword: resetPassword
      });
      setIssuedPassword(resetPassword);
      setResetPassword('');
      setConfirmResetPassword('');
      showNotification('success', 'Password reset. Copy the temporary password now; it is shown only once.');
    } catch (err) {
      showNotification('error', err.response?.data?.message || 'Could not reset user password.');
    }
  };

  const generateAdminPassword = () => {
    const bytes = new Uint8Array(18);
    window.crypto.getRandomValues(bytes);
    const generatedPassword = Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 24);
    setResetPassword(generatedPassword);
    setConfirmResetPassword(generatedPassword);
    setIssuedPassword('');
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
            onClick={() => handleTabSelect('announcements')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'announcements' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Bell className="h-5 w-5" /> Announcements
          </button>
          <button 
            onClick={() => handleTabSelect('messages')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'messages' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <MessageSquareText className="h-5 w-5" /> Messages
          </button>
          <button
            onClick={() => handleTabSelect('materials')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'materials' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Share2 className="h-5 w-5" /> Share Materials
          </button>
          <button
            onClick={() => handleTabSelect('password-reset')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'password-reset' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <KeyRound className="h-5 w-5" /> Reset User Password
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
          <div className="space-y-6">
            {pendingPayments.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-5 w-5 text-amber-600" />
                  <h3 className="text-base font-bold text-amber-900">Pending Fee Payments</h3>
                </div>
                <p className="text-xs text-amber-700 mb-4">
                  These payments were initiated but have not yet been marked as completed. If you already completed payment on Paystack, click <strong>Check Status Now</strong> to update the system.
                </p>
                <div className="divide-y divide-amber-200/70 border-t border-amber-200">
                  {pendingPayments.map((payment) => (
                    <div key={payment.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-mono font-bold text-slate-800">{payment.reference}</p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {payment.term || 'First Term'} • <strong className="text-slate-900">₦{parseFloat(payment.amount).toLocaleString()}</strong> • Initiated: {formatDateTime(payment.created_at)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleVerifyPending(payment.reference)}
                        disabled={verifyingRef === payment.reference}
                        className="self-start sm:self-auto flex items-center gap-1.5 text-xs font-bold text-amber-900 bg-amber-200/80 hover:bg-amber-300 px-3.5 py-1.5 rounded-lg transition disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${verifyingRef === payment.reference ? 'animate-spin' : ''}`} />
                        {verifyingRef === payment.reference ? 'Verifying...' : 'Check Status Now'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <PaymentsModule 
              students={students} 
              onProcessPayment={handlePaymentSubmit} 
            />
          </div>
        )}

        {activeTab === 'announcements' && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 max-w-2xl">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Post Announcement</h3>
            <form onSubmit={handleAnnouncementSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Title</label>
                <input
                  type="text"
                  value={announcementForm.title}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Message</label>
                <textarea
                  value={announcementForm.message}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, message: e.target.value })}
                  rows={5}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Event Date (optional)</label>
                <input
                  type="date"
                  value={announcementForm.event_date}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, event_date: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={announcementForm.visible_to_students} onChange={(e) => setAnnouncementForm({ ...announcementForm, visible_to_students: e.target.checked })} /> Visible to Students</label>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={announcementForm.visible_to_parents} onChange={(e) => setAnnouncementForm({ ...announcementForm, visible_to_parents: e.target.checked })} /> Visible to Parents</label>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={announcementForm.visible_to_teachers} onChange={(e) => setAnnouncementForm({ ...announcementForm, visible_to_teachers: e.target.checked })} /> Visible to Teachers</label>
              </div>

              <button type="submit" className="bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold">Publish Announcement</button>
            </form>
          </div>
        )}

        {activeTab === 'payroll' && (
          <PayrollModule 
            teachers={teachers}
            onProcessPayroll={handlePayrollSubmit} 
          />
        )}

        {activeTab === 'password-reset' && (
          <div className="max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold text-slate-800">Reset User Password</h3>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Search by name, email, or admission number</label>
            <input
              type="search"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="mb-3 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
              placeholder="Start typing to find a user"
            />
            {userSearchResults.length > 0 && (
              <div className="mb-5 max-h-48 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200">
                {userSearchResults.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      setSelectedResetUser(user);
                      setIssuedPassword('');
                    }}
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${selectedResetUser?.id === user.id ? 'bg-blue-50' : ''}`}
                  >
                    <span className="font-semibold text-slate-800">{user.full_name}</span>
                    <span className="ml-2 text-slate-500">{user.email} · {user.role}{user.admission_number ? ` · ${user.admission_number}` : ''}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedResetUser && (
              <form onSubmit={handleAdminPasswordReset} className="space-y-3 border-t border-slate-200 pt-4">
                <p className="text-sm text-slate-700">Selected: <strong>{selectedResetUser.full_name}</strong> ({selectedResetUser.role})</p>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">New password</label>
                  <PasswordInput
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    minLength={8}
                    required
                    className="w-full rounded-lg border border-slate-300 p-2.5 pr-10 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Confirm password</label>
                  <PasswordInput
                    value={confirmResetPassword}
                    onChange={(e) => setConfirmResetPassword(e.target.value)}
                    minLength={8}
                    required
                    className="w-full rounded-lg border border-slate-300 p-2.5 pr-10 text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={generateAdminPassword} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Generate password</button>
                  <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Reset password</button>
                </div>
              </form>
            )}
            {issuedPassword && (
              <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4" role="status">
                <p className="text-xs font-semibold text-emerald-800">Temporary password (shown once)</p>
                <code className="mt-2 block break-all text-sm text-emerald-950">{issuedPassword}</code>
                <button type="button" onClick={() => setIssuedPassword('')} className="mt-3 text-xs font-semibold text-emerald-800 underline">Hide password</button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'materials' && (
          <MaterialsManager students={students} onNotify={showNotification} />
        )}

        {activeTab === 'messages' && (
          <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.25fr] gap-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-4">School Messages</h3>
              <form onSubmit={handleCreateConversation} className="space-y-3 mb-5 border-b border-slate-200 pb-5">
                <h4 className="text-sm font-bold text-slate-700">New Message</h4>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Recipient Type</label>
                  <select
                    value={newMessageForm.target_role}
                    onChange={(e) => setNewMessageForm({ ...newMessageForm, target_role: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="PARENT">Parent</option>
                    <option value="TEACHER">Teacher</option>
                  </select>
                </div>
                <p className="text-xs text-slate-500">Sends a private message to every registered {newMessageForm.target_role.toLowerCase()}.</p>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Subject</label>
                  <input
                    type="text"
                    value={newMessageForm.subject}
                    onChange={(e) => setNewMessageForm({ ...newMessageForm, subject: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Message</label>
                  <textarea
                    value={newMessageForm.body}
                    onChange={(e) => setNewMessageForm({ ...newMessageForm, body: e.target.value })}
                    rows={4}
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                    required
                  />
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold">Send Message</button>
              </form>
              <div className="space-y-3">
                {conversations.length === 0 ? (
                  <p className="text-sm text-slate-500">No conversations available.</p>
                ) : (
                  conversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => setSelectedConversationId(String(conversation.id))}
                      className={`w-full text-left rounded-xl border p-3 ${selectedConversationId === String(conversation.id) ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}
                    >
                      <div className="flex justify-between gap-3 items-center">
                        <strong className="text-sm text-slate-800">{conversation.subject}</strong>
                        {Number(conversation.unread_count || 0) > 0 && (
                          <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{conversation.unread_count}</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {conversation.target_role === 'ADMIN'
                          ? `From ${conversation.creator_name} (${conversation.creator_role})`
                          : `To ${conversation.target_role}: ${conversation.target_name}`}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-4">Thread</h3>
              {selectedConversationId ? (
                <>
                  <div className="space-y-3 max-h-[360px] overflow-y-auto mb-4">
                    {conversationThread.length === 0 ? (
                      <p className="text-sm text-slate-500">No messages in this thread yet.</p>
                    ) : (
                      conversationThread.map((message) => (
                        <div key={message.id} className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${message.sender_id === Number(JSON.parse(localStorage.getItem('user') || '{}')?.id) ? 'ml-auto bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                          <p>{message.body}</p>
                          <p className={`text-[10px] mt-1 ${message.sender_id === Number(JSON.parse(localStorage.getItem('user') || '{}')?.id) ? 'text-blue-100' : 'text-slate-400'}`}>
                            {message.sender_name} • {formatDateTime(message.created_at)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  <form onSubmit={handleReplySubmit} className="space-y-3 border-t border-slate-200 pt-4">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={3}
                      placeholder="Type your reply..."
                      className="w-full rounded-xl border border-slate-300 p-3 text-sm"
                    />
                    <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">Send Reply</button>
                  </form>
                </>
              ) : (
                <p className="text-sm text-slate-500">Select a conversation to view the thread.</p>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

