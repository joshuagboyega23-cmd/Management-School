import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, LogOut, FileText, CheckCircle, AlertCircle, Users, BookOpen, Plus, Download, MessageSquareText, Share2, Trash2, Pencil, Menu, X } from 'lucide-react';
import API from '../opi';
import { downloadGradeSheetPDF } from '../utils/pdfUtils';
import MaterialsManager from './MaterialsManager';

const filterStudentsByClass = (list, selectedClass) => {
  if (!selectedClass) return list;
  return list.filter((student) => String(student.class_id) === String(selectedClass));
};

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({ type: '', text: '' });
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [editingGradeId, setEditingGradeId] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [conversationThread, setConversationThread] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [messageForm, setMessageForm] = useState({ subject: '', body: '' });

  const [gradeClass, setGradeClass] = useState('');
  const [viewClass, setViewClass] = useState('');

  const [gradeForm, setGradeForm] = useState({
    studentId: '',
    term: 'First Term',
    subject: 'Mathematics',
    caScore: '',
    examScore: '',
    remark: ''
  });
  const [bulkGradeClass, setBulkGradeClass] = useState('');
  const [bulkGradeSubject, setBulkGradeSubject] = useState('Mathematics');
  const [bulkGradeTerm, setBulkGradeTerm] = useState('First Term');
  const [bulkGradeRows, setBulkGradeRows] = useState([]);
  const [bulkGradeSummary, setBulkGradeSummary] = useState(null);
  const [bulkGradeLoading, setBulkGradeLoading] = useState(false);

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
      setConversations(Array.isArray(res.data?.data) ? res.data.data : []);
      if (res.data?.data?.length > 0 && !selectedConversationId) {
        setSelectedConversationId(String(res.data.data[0].id));
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

  useEffect(() => {
    fetchStudents();
    fetchAnnouncements();
    fetchConversations();
  }, []);

  useEffect(() => {
    if (selectedConversationId) {
      fetchConversationThread(selectedConversationId);
    }
  }, [selectedConversationId]);

  const showNotification = (type, text) => {
    setNotification({ type, text });
    setTimeout(() => setNotification({ type: '', text: '' }), 4000);
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

  const handleGradeSubmit = async (e) => {
    e.preventDefault();
    try {
      const scores = {
        caScore: Number(gradeForm.caScore),
        examScore: Number(gradeForm.examScore)
      };
      if (editingGradeId) {
        await API.patch(`/report-cards/${editingGradeId}`, scores);
      } else {
        await API.post('/report-cards', {
          ...gradeForm,
          studentId: Number(gradeForm.studentId),
          ...scores
        });
      }
      showNotification('success', editingGradeId ? 'Assessment grade updated successfully!' : 'Assessment grade recorded successfully!');
      if (gradeForm.studentId === selectedStudentId) {
        fetchStudentReport(gradeForm.studentId);
      }
      setEditingGradeId(null);
      setGradeForm({
        ...gradeForm,
        caScore: '',
        examScore: '',
        remark: ''
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

  const loadBulkGradeRows = async (classId, subject, term) => {
    if (!classId || !subject || !term) {
      setBulkGradeRows([]);
      return;
    }
    setBulkGradeLoading(true);
    try {
      const classStudents = filterStudentsByClass(students, classId);
      const rows = await Promise.all(classStudents.map(async (student) => {
        try {
          const res = await API.get(`/report-cards/student/${student.id}`);
          const existing = (Array.isArray(res.data?.data) ? res.data.data : []).find(
            (record) => record.subject === subject && record.term === term
          );
          return {
            studentId: student.id,
            studentName: student.name,
            caScore: existing ? String(existing.ca_score ?? '') : '',
            examScore: existing ? String(existing.exam_score ?? '') : '',
            existing: existing || null
          };
        } catch (error) {
          return { studentId: student.id, studentName: student.name, caScore: '', examScore: '', existing: null };
        }
      }));
      setBulkGradeRows(rows);
    } finally {
      setBulkGradeLoading(false);
    }
  };

  const handleBulkGradeSave = async () => {
    if (!bulkGradeClass || !bulkGradeSubject || !bulkGradeTerm) return;
    const entries = bulkGradeRows
      .filter((row) => !row.existing)
      .map((row) => ({
        studentId: Number(row.studentId),
        caScore: Number(row.caScore || 0),
        examScore: Number(row.examScore || 0)
      }));

    if (entries.length === 0) {
      setBulkGradeSummary({ saved: 0, skipped: bulkGradeRows.length, skippedStudents: bulkGradeRows.map((row) => row.studentName) });
      return;
    }

    try {
      const res = await API.post('/report-cards/bulk', {
        classId: Number(bulkGradeClass),
        subject: bulkGradeSubject,
        term: bulkGradeTerm,
        entries
      });
      setBulkGradeSummary(res.data?.summary || { saved: 0, skipped: 0, skippedStudents: [] });
      await loadBulkGradeRows(bulkGradeClass, bulkGradeSubject, bulkGradeTerm);
      if (selectedStudentId) fetchStudentReport(selectedStudentId);
    } catch (error) {
      setBulkGradeSummary({ saved: 0, skipped: 0, skippedStudents: [], error: error.response?.data?.message || 'Could not save the grade sheet.' });
    }
  };

  useEffect(() => {
    if (bulkGradeClass && bulkGradeSubject && bulkGradeTerm) {
      void loadBulkGradeRows(bulkGradeClass, bulkGradeSubject, bulkGradeTerm);
    } else {
      setBulkGradeRows([]);
    }
  }, [bulkGradeClass, bulkGradeSubject, bulkGradeTerm, students]);

  const filteredGradeStudents = filterStudentsByClass(students, gradeClass);
  const filteredViewStudents = filterStudentsByClass(students, viewClass);
  const classOptions = [...new Map(
    students
      .filter((student) => student.class_id && student.class_name)
      .map((student) => [String(student.class_id), { id: student.class_id, name: student.class_name }])
  ).values()];
  const upcomingEvents = [...announcements]
    .filter((item) => item.event_date)
    .sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

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
      const res = await API.post('/conversations', messageForm);
      if (res.data.success) {
        showNotification('success', 'Message sent to the school admin.');
        setMessageForm({ subject: '', body: '' });
        fetchConversations();
      }
    } catch (err) {
      showNotification('error', err.response?.data?.message || 'Failed to send message');
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100 font-sans">
      {isSidebarOpen && (
        <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 z-30 bg-black/50 md:hidden" />
      )}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col overflow-y-auto bg-slate-900 p-4 text-white shadow-2xl transition-transform duration-300 md:static md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between border-b border-slate-800 px-2 py-4">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-8 w-8 text-blue-400" />
            <div>
              <h1 className="text-base font-bold leading-tight">Pinnacle Heights</h1>
              <p className="text-xs text-slate-400 leading-tight">Teacher Portal</p>
            </div>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white md:hidden" aria-label="Close sidebar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="mt-6 flex flex-col gap-2">
          {[
            { id: 'overview', label: 'Overview', Icon: GraduationCap },
            { id: 'grades', label: 'Grades', Icon: FileText },
            { id: 'messages', label: 'Messages', Icon: MessageSquareText },
            { id: 'materials', label: 'Share Materials', Icon: Share2 }
          ].map(({ id, label, Icon }) => (
            <button key={id} onClick={() => handleTabSelect(id)} className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-medium transition ${activeTab === id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
              <Icon className="h-5 w-5" /> {label}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-2 border-t border-slate-800 pt-4">
          <button onClick={handleLogout} className="flex w-full items-center gap-2 rounded px-2 py-2 text-xs text-red-400 transition hover:text-red-300">
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 sm:p-8">
        <header className="mb-6 flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <button onClick={() => setIsSidebarOpen(true)} className="rounded-lg bg-slate-100 p-2 text-slate-700 hover:bg-slate-200 md:hidden" aria-label="Open navigation menu">
            <Menu className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold capitalize text-gray-800">{activeTab} Portal</h2>
            <p className="text-xs text-gray-500">Pinnacle Heights Academy — Teacher Dashboard</p>
          </div>
        </header>

        <div className={`mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.6fr] ${activeTab === 'overview' ? '' : 'hidden'}`}>
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-3">School Announcements</h3>
            {announcements.length === 0 ? (
              <p className="text-sm text-slate-500">No announcements are currently visible to your role.</p>
            ) : (
              <div className="space-y-3">
                {announcements.map((announcement) => (
                  <div key={announcement.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                    <div className="flex justify-between items-start gap-3 mb-1">
                      <p className="font-semibold text-slate-800">{announcement.title}</p>
                      {announcement.event_date && (
                        <span className="text-[11px] font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          {new Date(announcement.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{announcement.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-3">Upcoming Events</h3>
            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-slate-500">No upcoming events scheduled.</p>
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map((event) => (
                  <div key={event.id} className="border border-blue-200 rounded-xl p-3 bg-blue-50">
                    <p className="font-semibold text-slate-800">{event.title}</p>
                    <p className="text-xs text-blue-700 mt-1">
                      {new Date(event.event_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {notification.text && (
          <div className={`mb-6 p-4 rounded-xl text-sm font-medium ${
            notification.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {notification.text}
          </div>
        )}

        {activeTab === 'grades' && (
          <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Grade Submission Form */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-600" /> Enter Student Assessment
            </h3>
            <p className="text-xs text-slate-500 mb-6">Record Continuous Assessment (CA) and Exam scores</p>

            <form onSubmit={handleGradeSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">1. Select Class</label>
                  <select
                    value={gradeClass}
                    onChange={(e) => {
                      setGradeClass(e.target.value);
                      setGradeForm({ ...gradeForm, studentId: '' });
                    }}
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">-- All Classes (JSS1 - SS3) --</option>
                    {classOptions.map((classItem) => (
                      <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">2. Select Student</label>
                  <select
                    value={gradeForm.studentId}
                    onChange={(e) => setGradeForm({ ...gradeForm, studentId: e.target.value })}
                    required
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">-- Choose Student --</option>
                    {filteredGradeStudents.length === 0 && gradeClass ? (
                      <option value="" disabled>No students in this class</option>
                    ) : filteredGradeStudents.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name} ({student.admission_no || student.admission_number}) - {student.class_name || 'No Class'}
                      </option>
                    ))}
                  </select>
                </div>
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
                  <select
                    value={gradeForm.term}
                    onChange={(e) => setGradeForm({ ...gradeForm, term: e.target.value })}
                    required
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="First Term">First Term</option>
                    <option value="Second Term">Second Term</option>
                    <option value="Third Term">Third Term</option>
                  </select>
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
                    placeholder="52"
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              {editingGradeId && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Remark (calculated from total score)</label>
                  <input type="text" value={gradeForm.remark} readOnly className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm text-slate-600" />
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg text-sm transition shadow flex items-center justify-center gap-2 mt-4"
              >
                {editingGradeId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editingGradeId ? 'Update Grade Record' : 'Save Grade Record'}
              </button>
              {editingGradeId && (
                <button type="button" onClick={() => { setEditingGradeId(null); setGradeForm({ ...gradeForm, remark: '' }); }} className="w-full rounded-lg border border-slate-300 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  Cancel Edit
                </button>
              )}
            </form>
          </div>

          {/* Student Report Preview */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" /> Student Grade Sheet
              </h3>
              {reportData && reportData.length > 0 && selectedStudentId && (() => {
                const sel = students.find(s => String(s.id) === String(selectedStudentId));
                return (
                  <button
                    onClick={() => downloadGradeSheetPDF(sel, reportData)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition"
                  >
                    <Download className="h-3.5 w-3.5" /> Download PDF
                  </button>
                );
              })()}
            </div>
            <p className="text-xs text-slate-500 mb-4">Select a class and student to view their current term records</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">1. Select Class</label>
                <select
                  value={viewClass}
                  onChange={(e) => {
                    setViewClass(e.target.value);
                    setSelectedStudentId('');
                    setReportData(null);
                  }}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="">-- All Classes (JSS1 - SS3) --</option>
                  {classOptions.map((classItem) => (
                    <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">2. Select Student</label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => handleStudentSelect(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="">-- Choose Student to View --</option>
                  {filteredViewStudents.length === 0 && viewClass ? (
                    <option value="" disabled>No students in this class</option>
                  ) : filteredViewStudents.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name} ({student.admission_no || student.admission_number}) - {student.class_name || 'No Class'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedStudentId ? (
              reportData && reportData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-medium">
                        <th className="pb-2">Subject</th>
                        <th className="pb-2">Term</th>
                        <th className="pb-2">CA</th>
                        <th className="pb-2">Exam</th>
                        <th className="pb-2">Total</th>
                        <th className="pb-2">Grade</th>
                        <th className="pb-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {reportData.map((r) => (
                        <tr key={r.id}>
                          <td className="py-2.5 font-medium">{r.subject}</td>
                          <td className="py-2.5 font-mono">{r.term}</td>
                          <td className="py-2.5 font-mono">{r.ca_score}</td>
                          <td className="py-2.5 font-mono">{r.exam_score}</td>
                          <td className="py-2.5 font-bold font-mono text-blue-600">{r.total_score}</td>
                          <td className="py-2.5 font-bold">{r.grade}</td>
                          <td className="py-2.5">
                            <div className="flex gap-2">
                              <button type="button" onClick={() => {
                                setEditingGradeId(r.id);
                                setGradeForm({
                                  ...gradeForm,
                                  studentId: String(selectedStudentId),
                                  subject: r.subject,
                                  term: r.term,
                                  caScore: String(r.ca_score ?? ''),
                                  examScore: String(r.exam_score ?? ''),
                                  remark: r.remark || ''
                                });
                              }} className="border border-slate-300 rounded p-1" title="Edit grade"><Pencil className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={async () => {
                                const ok = window.confirm(`Remove ${r.subject} for ${r.term}? This cannot be undone.`);
                                if (!ok) return;
                                try { await API.delete(`/report-cards/${r.id}`); fetchStudentReport(selectedStudentId); showNotification('success', 'Grade removed successfully.'); } catch (err) { showNotification('error', err.response?.data?.message || 'Could not delete the grade.'); }
                              }} className="border border-red-200 rounded p-1 text-red-600" title="Delete grade"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
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

        <div className="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Grade Sheet</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <select value={bulkGradeClass} onChange={(e) => setBulkGradeClass(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white">
              <option value="">Select class</option>
              {classOptions.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
              ))}
            </select>
            <input type="text" value={bulkGradeSubject} onChange={(e) => setBulkGradeSubject(e.target.value)} placeholder="Subject" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" />
            <select value={bulkGradeTerm} onChange={(e) => setBulkGradeTerm(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white">
              <option value="First Term">First Term</option>
              <option value="Second Term">Second Term</option>
              <option value="Third Term">Third Term</option>
            </select>
          </div>
          {bulkGradeSummary && (
            <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${bulkGradeSummary.error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
              {bulkGradeSummary.error ? bulkGradeSummary.error : `${bulkGradeSummary.saved ?? 0} saved, ${bulkGradeSummary.skipped ?? 0} skipped${bulkGradeSummary.skippedStudents?.length ? ` (${bulkGradeSummary.skippedStudents.join(', ')})` : ''}`}
            </div>
          )}
          {bulkGradeLoading ? (
            <p className="text-sm text-slate-500">Loading grade sheet…</p>
          ) : bulkGradeRows.length > 0 ? (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-2">Student</th>
                    <th className="p-2">CA</th>
                    <th className="p-2">Exam</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkGradeRows.map((row) => (
                    <tr key={row.studentId} className="border-t border-slate-200">
                      <td className="p-2 font-medium">{row.studentName}</td>
                      <td className="p-2">
                        {row.existing ? <span className="text-slate-500">{row.caScore}</span> : <input type="number" value={row.caScore} min="0" max="40" onChange={(e) => setBulkGradeRows((current) => current.map((item) => item.studentId === row.studentId ? { ...item, caScore: e.target.value } : item))} className="w-20 border border-slate-300 rounded px-2 py-1" />}
                      </td>
                      <td className="p-2">
                        {row.existing ? <span className="text-slate-500">{row.examScore}</span> : <input type="number" value={row.examScore} min="0" max="60" onChange={(e) => setBulkGradeRows((current) => current.map((item) => item.studentId === row.studentId ? { ...item, examScore: e.target.value } : item))} className="w-20 border border-slate-300 rounded px-2 py-1" />}
                      </td>
                      <td className="p-2">{row.existing ? <span className="text-amber-700 text-xs font-semibold">already recorded — use edit to change</span> : <span className="text-emerald-700 text-xs font-semibold">ready to save</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : bulkGradeClass ? (
            <p className="text-sm text-slate-500">No students found in this class.</p>
          ) : (
            <p className="text-sm text-slate-500">Choose a class to load the grade sheet.</p>
          )}
          <button type="button" onClick={handleBulkGradeSave} disabled={!bulkGradeClass || bulkGradeLoading} className="mt-4 rounded-lg bg-blue-600 text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Save All</button>
        </div>
          </>
        )}

        {activeTab === 'messages' && (
        <div className="mt-8 grid grid-cols-1 xl:grid-cols-[0.95fr_1.25fr] gap-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Messages</h3>
            <form onSubmit={handleCreateConversation} className="space-y-3 mb-5 border-b border-slate-200 pb-5">
              <h4 className="text-sm font-bold text-slate-700">Message School Admin</h4>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Subject</label>
                <input
                  type="text"
                  value={messageForm.subject}
                  onChange={(e) => setMessageForm({ ...messageForm, subject: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Message</label>
                <textarea
                  value={messageForm.body}
                  onChange={(e) => setMessageForm({ ...messageForm, body: e.target.value })}
                  rows={4}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                  required
                />
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold">Send Message</button>
            </form>
            <div className="space-y-3">
              {conversations.length === 0 ? (
                <p className="text-sm text-slate-500">No conversations directed to you yet.</p>
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
                    <p className="text-xs text-slate-500 mt-1">From {conversation.creator_name}</p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Conversation Thread</h3>
            {selectedConversationId ? (
              <>
                <div className="space-y-3 max-h-[360px] overflow-y-auto mb-4">
                  {conversationThread.length === 0 ? (
                    <p className="text-sm text-slate-500">No replies yet.</p>
                  ) : (
                    conversationThread.map((message) => (
                      <div key={message.id} className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${message.sender_id === Number(JSON.parse(localStorage.getItem('user') || '{}')?.id) ? 'ml-auto bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                        <p>{message.body}</p>
                        <p className={`text-[10px] mt-1 ${message.sender_id === Number(JSON.parse(localStorage.getItem('user') || '{}')?.id) ? 'text-blue-100' : 'text-slate-400'}`}>
                          {message.sender_name} • {new Date(message.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleReplySubmit} className="border-t border-slate-200 pt-4 space-y-3">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={3}
                    placeholder="Type your reply..."
                    className="w-full p-3 border border-slate-300 rounded-xl text-sm"
                  />
                  <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">Send Reply</button>
                </form>
              </>
            ) : (
              <p className="text-sm text-slate-500">Select a conversation to open the thread.</p>
            )}
          </div>
        </div>
        )}

        {activeTab === 'materials' && (
          <MaterialsManager students={students} onNotify={showNotification} />
        )}
      </main>
    </div>
  );
}
