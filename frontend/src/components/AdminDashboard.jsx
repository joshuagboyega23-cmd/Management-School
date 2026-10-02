import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Users, UserCheck, FileText, CreditCard, CheckCircle, GraduationCap, ArrowLeft, LogOut, Menu, X, Clock, RefreshCw, Bell, MessageSquareText, KeyRound, Share2, Trash2, Download } from 'lucide-react';

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
  const [parents, setParents] = useState([]);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [parentSearch, setParentSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [reportData, setReportData] = useState(null);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [verifyingRef, setVerifyingRef] = useState('');
  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    message: '',
    visible_to_students: true,
    visible_to_parents: true,
    visible_to_teachers: true,
    event_date: ''
  });
  const [announcements, setAnnouncements] = useState([]);
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
  const [adminForm, setAdminForm] = useState({ full_name: '', email: '', password: '', confirmPassword: '', role: 'ADMIN' });
  const [adminUsers, setAdminUsers] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [activityFilter, setActivityFilter] = useState('All');
  const [promotionForm, setPromotionForm] = useState({ fromClassId: '', toClassId: '', confirmText: '' });
  const [promotionSummary, setPromotionSummary] = useState(null);
  const [exportClassId, setExportClassId] = useState('');
  const [newMessageForm, setNewMessageForm] = useState({
    target_role: 'PARENT',
    audience: { mode: 'ALL', classIds: [], userIds: [] },
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

  const fetchAdminUsers = async () => {
    try {
      const res = await API.get('/admin/users', { params: { query: '' } });
      setAdminUsers((Array.isArray(res.data?.data) ? res.data.data : []).filter((user) => ['ADMIN', 'SUPERADMIN'].includes(user.role)));
    } catch (err) {
      setAdminUsers([]);
    }
  };

  const fetchParents = async () => {
    try {
      const res = await API.get('/parents');
      setParents(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      setParents([]);
    }
  };

  const handleDeleteStudent = async (student) => {
    const linkedAccount = student.user_id ? ' their linked student login,' : '';
    const confirmed = window.confirm(
      `Permanently delete ${student.name}? This removes the student record,${linkedAccount} grades, fee/payment history, and parent links. Authored conversations and materials will be reassigned to your administrator account. This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await API.delete(`/admin/students/${student.id}`);
      showNotification('success', `${student.name} was deleted.`);
      fetchStudents();
      fetchActivityLog();
    } catch (err) {
      showNotification('error', err.response?.data?.message || 'Could not delete student.');
    }
  };

  const handleDeleteTeacher = async (teacher) => {
    const accountImpact = teacher.user_id
      ? 'their linked teacher login and payroll/password-reset records, '
      : '';
    const confirmed = window.confirm(
      `Permanently delete ${teacher.full_name}? This removes the teacher record, ${accountImpact}and reassigns authored conversations, messages, announcements, and uploaded materials to your administrator account. This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await API.delete(`/admin/teachers/${teacher.teacher_record_id}`);
      showNotification('success', `${teacher.full_name} was deleted.`);
      fetchTeachers();
      fetchActivityLog();
    } catch (err) {
      showNotification('error', err.response?.data?.message || 'Could not delete teacher.');
    }
  };

  const fetchPendingPayments = async () => {
    try {
      const res = await API.get('/payments/history');
      const list = Array.isArray(res.data?.data) ? res.data.data : [];
      setPaymentHistory(list);
      setPendingPayments(list.filter((payment) => payment.status === 'PENDING'));
    } catch (err) {
      console.error('Error fetching pending payments:', err);
      setPaymentHistory([]);
      setPendingPayments([]);
    }
  };

  const fetchAnnouncements = async () => {
    try {
      const res = await API.get('/announcements');
      setAnnouncements(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      setAnnouncements([]);
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

  const fetchActivityLog = async () => {
    try {
      const res = await API.get('/admin/activity-log', { params: { limit: 25 } });
      setActivityLog(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      setActivityLog([]);
    }
  };

  useEffect(() => {
    fetchStudents();
    fetchTeachers();
    fetchAdminUsers();
    fetchParents();
    fetchPendingPayments();
    fetchAnnouncements();
    fetchConversations();
    fetchActivityLog();
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
      fetchAnnouncements();
    } catch (err) {
      showNotification('error', err.response?.data?.message || err.response?.data?.error || 'Failed to post announcement');
    }
  };

  const handleDeleteAnnouncement = async (announcement) => {
    const confirmText = 'This removes it from all student, parent and teacher dashboards. Events are stored on the same announcement record, so deleting an event also removes its announcement. Continue?';
    if (!window.confirm(confirmText)) return;

    try {
      await API.delete(`/announcements/${announcement.id}`);
      showNotification('success', 'Announcement and event deleted.');
      fetchAnnouncements();
    } catch (err) {
      showNotification('error', err.response?.data?.message || 'Could not delete announcement.');
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
        audience: newMessageForm.audience,
        subject: newMessageForm.subject,
        body: newMessageForm.body
      });
      if (res.data.success) {
        const count = Number(res.data.threadsCreated || 0);
        const recipientType = newMessageForm.target_role === 'PARENT' ? 'parents' : 'teachers';
        showNotification('success', `Sent to ${count} ${recipientType}.`);
        setNewMessageForm({
          target_role: newMessageForm.target_role,
          audience: { mode: 'ALL', classIds: [], userIds: [] },
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

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    if (!adminForm.full_name.trim() || !adminForm.email.trim() || !adminForm.password || !adminForm.confirmPassword) {
      showNotification('error', 'Complete all admin details before creating the account.');
      return;
    }
    if (adminForm.password !== adminForm.confirmPassword) {
      showNotification('error', 'Passwords do not match.');
      return;
    }
    try {
      const res = await API.post('/admin/create-admin', {
        full_name: adminForm.full_name.trim(),
        email: adminForm.email.trim().toLowerCase(),
        password: adminForm.password,
        role: adminForm.role
      });
      showNotification('success', res.data?.message || 'Admin account created successfully.');
      setAdminForm({ full_name: '', email: '', password: '', confirmPassword: '', role: 'ADMIN' });
      await fetchAdminUsers();
    } catch (err) {
      showNotification('error', err.response?.data?.message || err.response?.data?.error || 'Could not create admin account.');
    }
  };

  const handleExportCsv = async (endpoint, filename, params = {}) => {
    try {
      const res = await API.get(endpoint, { params, responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showNotification('error', err.response?.data?.message || 'Unable to download the export.');
    }
  };

  const handlePromoteClass = async (e) => {
    e.preventDefault();
    if (!promotionForm.fromClassId) {
      showNotification('error', 'Select the class to promote from.');
      return;
    }
    if (promotionForm.confirmText !== 'PROMOTE') {
      showNotification('error', 'Type PROMOTE to confirm the class move.');
      return;
    }
    try {
      const res = await API.post('/admin/promote-class', {
        fromClassId: Number(promotionForm.fromClassId),
        toClassId: promotionForm.toClassId ? Number(promotionForm.toClassId) : null
      });
      setPromotionSummary(res.data);
      setPromotionForm({ fromClassId: '', toClassId: '', confirmText: '' });
      fetchStudents();
      fetchActivityLog();
      showNotification('success', res.data.message || 'Class promotion completed.');
    } catch (err) {
      showNotification('error', err.response?.data?.message || 'Could not promote class.');
    }
  };

  const registeredTeachers = teachers.filter((teacher) => teacher.is_registered && teacher.id);
  const classOptions = [...new Map(
    students
      .filter((student) => student.class_id && student.class_name)
      .map((student) => [String(student.class_id), { id: student.class_id, name: student.class_name }])
  ).values()];
  const matchingTeachers = registeredTeachers.filter((teacher) =>
    `${teacher.full_name} ${teacher.email}`.toLowerCase().includes(teacherSearch.trim().toLowerCase())
  );
  const matchingParents = parents.filter((parent) =>
    `${parent.full_name} ${parent.email} ${(parent.children || []).map((child) => `${child.name} ${child.admission_number} ${child.class || ''}`).join(' ')}`
      .toLowerCase()
      .includes(parentSearch.trim().toLowerCase())
  );

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
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 overflow-y-auto bg-slate-900 text-white flex flex-col p-4 shadow-2xl md:shadow-lg shrink-0 transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${
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
            onClick={() => handleTabSelect('export-data')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'export-data' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Download className="h-5 w-5" /> Export Data
          </button>
          <button
            onClick={() => handleTabSelect('activity-log')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'activity-log' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Bell className="h-5 w-5" /> Activity Log
          </button>
          <button
            onClick={() => handleTabSelect('promote-class')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'promote-class' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <GraduationCap className="h-5 w-5" /> Promote Class
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
            onDeleteStudent={handleDeleteStudent}
          />
        )}

        {activeTab === 'staff' && (
          <>
            <StaffModule 
              teachers={teachers} 
              loading={loadingStaff} 
              onImportTeachers={handleImportTeachers} 
              onDeleteTeacher={handleDeleteTeacher}
            />

            <div className="mt-8 max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-bold text-slate-800">Add Admin</h3>
              <form onSubmit={handleCreateAdmin} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Full name</label>
                  <input type="text" value={adminForm.full_name} onChange={(e) => setAdminForm({ ...adminForm, full_name: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2.5 text-sm" required />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Email</label>
                  <input type="email" value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2.5 text-sm" required />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Role</label>
                  <select value={adminForm.role} onChange={(e) => setAdminForm({ ...adminForm, role: e.target.value })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm" required>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Password</label>
                  <PasswordInput value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} required className="w-full rounded-lg border border-slate-300 p-2.5 pr-10 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Confirm password</label>
                  <PasswordInput value={adminForm.confirmPassword} onChange={(e) => setAdminForm({ ...adminForm, confirmPassword: e.target.value })} required className="w-full rounded-lg border border-slate-300 p-2.5 pr-10 text-sm" />
                </div>
                <button type="submit" className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Create Admin Account</button>
              </form>
              <div className="mt-6 border-t border-slate-200 pt-4">
                <h4 className="mb-3 text-sm font-semibold text-slate-700">Admin Accounts</h4>
                {adminUsers.length ? (
                  <ul className="space-y-2">
                    {adminUsers.map((user) => (
                      <li key={user.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate font-medium text-slate-800">{user.full_name}<span className="ml-2 text-xs font-normal text-slate-500">{user.email}</span></span>
                        <span className="shrink-0 text-xs font-semibold text-slate-500">{user.role}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500">No admin accounts found.</p>
                )}
              </div>
            </div>
          </>
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
              paymentHistory={paymentHistory}
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
            <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
              <section className="border-t border-slate-200 pt-5">
                <h3 className="mb-3 text-base font-bold text-slate-800">Announcements</h3>
                {announcements.length === 0 ? (
                  <p className="text-sm text-slate-500">No announcements yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {announcements.map((announcement) => (
                      <div key={announcement.id} className="flex items-start justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold text-slate-800">{announcement.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{announcement.message}</p>
                          <p className="mt-1 text-[11px] text-slate-400">{formatDateTime(announcement.created_at)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteAnnouncement(announcement)}
                          aria-label={`Delete announcement ${announcement.title}`}
                          title="Delete announcement"
                          className="shrink-0 rounded-lg border border-red-200 p-2 text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="border-t border-slate-200 pt-5">
                <h3 className="mb-3 text-base font-bold text-slate-800">Upcoming Events</h3>
                {announcements.filter((announcement) => announcement.event_date).length === 0 ? (
                  <p className="text-sm text-slate-500">No upcoming events.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {announcements.filter((announcement) => announcement.event_date).map((event) => (
                      <div key={event.id} className="flex items-start justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold text-slate-800">{event.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{new Date(event.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteAnnouncement(event)}
                          aria-label={`Delete event ${event.title}`}
                          title="Delete event and its announcement"
                          className="shrink-0 rounded-lg border border-red-200 p-2 text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
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
            {!selectedResetUser && (
              <>
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
                          setResetPassword('');
                          setConfirmResetPassword('');
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="font-semibold text-slate-800">{user.full_name}</span>
                        <span className="ml-2 text-slate-500">{user.email} · {user.role}{user.admission_number ? ` · ${user.admission_number}` : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {selectedResetUser && (
              <div className="border-t border-slate-200 pt-4">
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="space-y-1 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">{selectedResetUser.full_name}</p>
                    <p>{selectedResetUser.email}</p>
                    <p>{selectedResetUser.role}</p>
                    {selectedResetUser.admission_number && <p>Admission number: {selectedResetUser.admission_number}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedResetUser(null);
                      setResetPassword('');
                      setConfirmResetPassword('');
                      setIssuedPassword('');
                    }}
                    className="text-xs font-semibold text-blue-700 underline underline-offset-2"
                  >
                    Change selection
                  </button>
                </div>
                <form onSubmit={handleAdminPasswordReset} className="mt-4 space-y-3">
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
              </div>
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

        {activeTab === 'export-data' && (
          <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold text-slate-800">Export Data</h3>
            <div className="mb-4 max-w-sm">
              <label htmlFor="grades-export-class" className="mb-1 block text-xs font-semibold text-slate-600">Filter by Class</label>
              <select id="grades-export-class" value={exportClassId} onChange={(e) => setExportClassId(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm">
                <option value="">All Classes</option>
                {classOptions.map((classItem) => (
                  <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <button type="button" onClick={() => handleExportCsv('/admin/export/students', 'students-export.csv')} className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                <Download className="h-4 w-4" /> Students
              </button>
              <button type="button" onClick={() => handleExportCsv('/admin/export/grades', 'grades-export.csv', exportClassId ? { classId: exportClassId } : {})} className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                <Download className="h-4 w-4" /> Grades
              </button>
              <button type="button" onClick={() => handleExportCsv('/admin/export/payments', 'payments-export.csv')} className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                <Download className="h-4 w-4" /> Payments
              </button>
            </div>
          </div>
        )}

        {activeTab === 'activity-log' && (
          <div className="max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-slate-800">Activity Log</h3>
              <select value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="All">All</option>
                <option value="Grades">Grades</option>
                <option value="Passwords">Passwords</option>
                <option value="Admin">Admin</option>
                <option value="Promotions">Promotions</option>
              </select>
            </div>
            <div className="space-y-3">
              {activityLog.filter((entry) => activityFilter === 'All' || entry.action === activityFilter).map((entry, index) => (
                <div key={`${entry.created_at}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
                    <span>{entry.actor_name || 'System'}</span>
                    <span>•</span>
                    <span>{entry.actor_role || 'ADMIN'}</span>
                    <span>•</span>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">{entry.action}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-800">{entry.target_description}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{new Date(entry.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'promote-class' && (
          <div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold text-slate-800">Promote Class</h3>
            <form onSubmit={handlePromoteClass} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Promote from</label>
                <select value={promotionForm.fromClassId} onChange={(e) => setPromotionForm({ ...promotionForm, fromClassId: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2.5 text-sm">
                  <option value="">Select class</option>
                  {classOptions.map((classItem) => (
                    <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Destination class (leave blank to graduate / mark inactive)</label>
                <select value={promotionForm.toClassId} onChange={(e) => setPromotionForm({ ...promotionForm, toClassId: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2.5 text-sm">
                  <option value="">Graduate / Mark Inactive</option>
                  {classOptions.map((classItem) => (
                    <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Type PROMOTE to confirm</label>
                <input type="text" value={promotionForm.confirmText} onChange={(e) => setPromotionForm({ ...promotionForm, confirmText: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2.5 text-sm" placeholder="PROMOTE" />
              </div>
              <button type="submit" className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Confirm Promotion</button>
            </form>
            {promotionSummary && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {promotionSummary.message}
              </div>
            )}
          </div>
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
                    onChange={(e) => {
                      setNewMessageForm({
                        ...newMessageForm,
                        target_role: e.target.value,
                        audience: { mode: 'ALL', classIds: [], userIds: [] }
                      });
                      setTeacherSearch('');
                      setParentSearch('');
                    }}
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="PARENT">Parent</option>
                    <option value="TEACHER">Teacher</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Send to</label>
                  <select
                    value={newMessageForm.audience.mode}
                    onChange={(e) => setNewMessageForm({
                      ...newMessageForm,
                      audience: { mode: e.target.value, classIds: [], userIds: [] }
                    })}
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="ALL">All {newMessageForm.target_role === 'PARENT' ? 'parents' : 'teachers'}</option>
                    {newMessageForm.target_role === 'PARENT' && <option value="CLASSES">Parents of selected classes</option>}
                    <option value="SELECTED">Selected {newMessageForm.target_role === 'PARENT' ? 'parents' : 'teachers'}</option>
                  </select>
                </div>

                {newMessageForm.target_role === 'TEACHER' && newMessageForm.audience.mode === 'SELECTED' && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <label className="mb-2 block text-xs font-semibold text-slate-600">Search registered teachers</label>
                    <input type="search" value={teacherSearch} onChange={(e) => setTeacherSearch(e.target.value)} placeholder="Name or email" className="mb-2 w-full rounded-lg border border-slate-300 p-2 text-sm" />
                    <div className="max-h-40 space-y-2 overflow-y-auto">
                      {matchingTeachers.map((teacher) => (
                        <label key={teacher.id} className="flex items-start gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={newMessageForm.audience.userIds.includes(teacher.id)}
                            onChange={(e) => setNewMessageForm({
                              ...newMessageForm,
                              audience: {
                                ...newMessageForm.audience,
                                userIds: e.target.checked
                                  ? [...newMessageForm.audience.userIds, teacher.id]
                                  : newMessageForm.audience.userIds.filter((id) => id !== teacher.id)
                              }
                            })}
                          />
                          <span>{teacher.full_name} <span className="text-xs text-slate-500">{teacher.email}</span></span>
                        </label>
                      ))}
                      {matchingTeachers.length === 0 && <p className="text-xs text-slate-500">No registered teachers match.</p>}
                    </div>
                  </div>
                )}

                {newMessageForm.target_role === 'PARENT' && newMessageForm.audience.mode === 'CLASSES' && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="mb-2 text-xs font-semibold text-slate-600">Classes</p>
                    <div className="space-y-2">
                      {classOptions.map((classItem) => (
                        <label key={classItem.id} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={newMessageForm.audience.classIds.includes(classItem.id)}
                            onChange={(e) => setNewMessageForm({
                              ...newMessageForm,
                              audience: {
                                ...newMessageForm.audience,
                                classIds: e.target.checked
                                  ? [...newMessageForm.audience.classIds, classItem.id]
                                  : newMessageForm.audience.classIds.filter((id) => id !== classItem.id)
                              }
                            })}
                          />
                          {classItem.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {newMessageForm.target_role === 'PARENT' && newMessageForm.audience.mode === 'SELECTED' && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <label className="mb-2 block text-xs font-semibold text-slate-600">Search parents and their children</label>
                    <input type="search" value={parentSearch} onChange={(e) => setParentSearch(e.target.value)} placeholder="Parent, email, child, admission number, or class" className="mb-2 w-full rounded-lg border border-slate-300 p-2 text-sm" />
                    <div className="max-h-48 space-y-3 overflow-y-auto">
                      {matchingParents.map((parent) => (
                        <label key={parent.id} className="flex items-start gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={newMessageForm.audience.userIds.includes(parent.id)}
                            onChange={(e) => setNewMessageForm({
                              ...newMessageForm,
                              audience: {
                                ...newMessageForm.audience,
                                userIds: e.target.checked
                                  ? [...newMessageForm.audience.userIds, parent.id]
                                  : newMessageForm.audience.userIds.filter((id) => id !== parent.id)
                              }
                            })}
                          />
                          <span>
                            <span className="block font-semibold">{parent.full_name} <span className="font-normal text-xs text-slate-500">{parent.email}</span></span>
                            {(parent.children || []).map((child) => <span key={`${parent.id}-${child.admission_number}`} className="block text-xs text-slate-500">{child.name} · {child.admission_number} · {child.class || 'No class'}</span>)}
                          </span>
                        </label>
                      ))}
                      {matchingParents.length === 0 && <p className="text-xs text-slate-500">No parents match.</p>}
                    </div>
                  </div>
                )}
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

