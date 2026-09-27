import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, LogOut, FileText, CheckCircle, AlertCircle, Users, BookOpen, Plus, Download, MessageSquareText } from 'lucide-react';
import API from '../opi';
import { downloadGradeSheetPDF } from '../utils/pdfUtils';

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

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({ type: '', text: '' });
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [activeTab, setActiveTab] = useState('grades');
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

  const handleGradeSubmit = async (e) => {
    e.preventDefault();
    try {
      await API.post('/report-cards', {
        ...gradeForm,
        studentId: Number(gradeForm.studentId),
        caScore: Number(gradeForm.caScore),
        examScore: Number(gradeForm.examScore)
      });
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

  const filteredGradeStudents = filterStudentsByClass(students, gradeClass);
  const filteredViewStudents = filterStudentsByClass(students, viewClass);
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
        <div className="mb-8 grid grid-cols-1 xl:grid-cols-[1.4fr_0.6fr] gap-6">
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

        <div className="flex gap-3 mb-6 border-b border-slate-200 pb-3">
          <button
            onClick={() => setActiveTab('grades')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition ${activeTab === 'grades' ? 'bg-blue-600 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
          >
            <FileText className="h-4 w-4" /> Grades
          </button>
          <button
            onClick={() => setActiveTab('messages')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition ${activeTab === 'messages' ? 'bg-blue-600 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
          >
            <MessageSquareText className="h-4 w-4" /> Messages
          </button>
        </div>

        {activeTab === 'grades' && (
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
                    {CLASS_OPTIONS.map((cls) => (
                      <option key={cls} value={cls}>{cls}</option>
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
                    {filteredGradeStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.admission_no || s.admission_number}) - {s.class_name || 'No Class'}
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
                  {CLASS_OPTIONS.map((cls) => (
                    <option key={cls} value={cls}>{cls}</option>
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
                  {filteredViewStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.admission_no || s.admission_number}) - {s.class_name || 'No Class'}
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
      </main>
    </div>
  );
}
