import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, LogOut, Users, FileText, CreditCard, Award, ChevronDown, ChevronUp, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import API, { SERVER_WAKING_MESSAGE } from '../opi';
import { formatDateTime, downloadReceiptPDF } from '../utils/pdfUtils';

export default function ParentDashboard() {
  const navigate = useNavigate();
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [notification, setNotification] = useState({ type: '', text: '' });
  const currentYear = new Date().getFullYear();
  const [paymentForm, setPaymentForm] = useState(() => {
    let parentEmail = '';
    try {
      parentEmail = JSON.parse(localStorage.getItem('user') || '{}').email || '';
    } catch (error) {
      parentEmail = '';
    }
    return { amount: '', term: `First Term ${currentYear}`, email: parentEmail };
  });
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [verifyingRef, setVerifyingRef] = useState('');
  const [announcements, setAnnouncements] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [conversationThread, setConversationThread] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [messageForm, setMessageForm] = useState({ subject: '', body: '' });

  const fetchChildren = async () => {
    try {
      setLoading(true);
      const res = await API.get('/parent/children');
      if (res.data.success) {
        setChildren(res.data.data);
        if (res.data.data.length > 0 && !selectedChildId) {
          setSelectedChildId(res.data.data[0].id);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch linked children.');
    } finally {
      setLoading(false);
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
      // Refresh children data
      const refreshRes = await API.get('/parent/children');
      if (refreshRes.data.success) {
        setChildren(refreshRes.data.data);
      }
    } catch (err) {
      showNotification('error', err.response?.data?.message || 'Could not verify payment status.');
    } finally {
      setVerifyingRef('');
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

  useEffect(() => {
    fetchChildren();
    fetchAnnouncements();
    fetchConversations();
  }, []);

  useEffect(() => {
    if (selectedConversationId) {
      fetchConversationThread(selectedConversationId);
    }
  }, [selectedConversationId]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const showNotification = (type, text) => {
    setNotification({ type, text });
    setTimeout(() => setNotification({ type: '', text: '' }), 4000);
  };

  const handleCreateConversation = async (e) => {
    e.preventDefault();
    try {
      const res = await API.post('/conversations', messageForm);
      if (res.data.success) {
        showNotification('success', 'Message sent successfully.');
        setMessageForm({ subject: '', body: '' });
        fetchConversations();
      }
    } catch (err) {
      showNotification('error', err.response?.data?.message || 'Failed to send message');
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
      showNotification('error', err.response?.data?.message || 'Failed to send reply');
    }
  };

  const handleChildPayment = async (event) => {
    event.preventDefault();
    if (!selectedChild || Number(paymentForm.amount) <= 0) return;
    try {
      setPaymentLoading(true);
      const res = await API.post('/payments/initialize', {
        studentId: Number(selectedChild.id),
        amount: Number(paymentForm.amount),
        email: paymentForm.email.trim(),
        term: paymentForm.term
      });

      if (res.data.success && res.data.paymentUrl) {
        window.location.href = res.data.paymentUrl;
      } else if (res.data.success) {
        showNotification('error', 'Paystack did not return a checkout link. Please try again.');
      } else {
        showNotification('error', res.data.message || res.data.error || 'Payment initialization failed');
      }
    } catch (err) {
      showNotification('error', err.response?.data?.message || err.response?.data?.error || (!err.response ? SERVER_WAKING_MESSAGE : 'Payment initialization failed'));
    } finally {
      setPaymentLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <p className="text-slate-600 font-medium animate-pulse">Loading parent portal...</p>
      </div>
    );
  }

  const selectedChild = children.find(c => c.id === selectedChildId) || children[0];
  const upcomingEvents = [...announcements]
    .filter((item) => item.event_date)
    .sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

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
              <h1 className="text-lg font-bold">Parent & Guardian Portal</h1>
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

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-700 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {selectedChild && selectedChild.paymentHistory?.filter((p) => p.status === 'PENDING').length > 0 && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-5 w-5 text-amber-600" />
              <h3 className="text-base font-bold text-amber-900">Pending Payments</h3>
            </div>
            <p className="text-xs text-amber-700 mb-4">
              These payments were initiated but have not yet been marked as completed. If you already completed payment on Paystack, click <strong>Check Status Now</strong> to update the system.
            </p>
            <div className="divide-y divide-amber-200/70 border-t border-amber-200">
              {selectedChild.paymentHistory.filter((p) => p.status === 'PENDING').map((p) => (
                <div key={p.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-mono font-bold text-slate-800">{p.reference}</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {p.term || 'First Term'} • <strong className="text-slate-900">₦{parseFloat(p.amount).toLocaleString()}</strong> • Initiated: {formatDateTime(p.created_at)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleVerifyPending(p.reference)}
                    disabled={verifyingRef === p.reference}
                    className="self-start sm:self-auto flex items-center gap-1.5 text-xs font-bold text-amber-900 bg-amber-200/80 hover:bg-amber-300 px-3.5 py-1.5 rounded-lg transition disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${verifyingRef === p.reference ? 'animate-spin' : ''}`} />
                    {verifyingRef === p.reference ? 'Verifying...' : 'Check Status Now'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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

        {children.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm max-w-xl mx-auto">
            <Users className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-800 mb-1">No Linked Children</h3>
            <p className="text-sm text-slate-500">
              No students are currently linked to your parent account. Please register with your child's admission number.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar: Child list */}
            <div className="lg:col-span-1 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">Your Children</h3>
              {children.map((child) => (
                <button
                  key={child.id}
                  onClick={() => setSelectedChildId(child.id)}
                  className={`w-full text-left p-4 rounded-xl border transition ${
                    selectedChildId === child.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <p className="font-bold text-sm leading-tight">{child.full_name}</p>
                  <p className={`text-xs mt-1 ${selectedChildId === child.id ? 'text-blue-100' : 'text-slate-400'}`}>
                    {child.admission_number} · {child.class_name || 'Class'}
                  </p>
                </button>
              ))}
            </div>

            {/* Child Detailed Dashboard */}
            {selectedChild && (
              <div className="lg:col-span-3 space-y-8">
                {/* Child Header */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <span className="text-xs font-semibold bg-blue-50 text-blue-700 px-3 py-1 rounded-full uppercase">
                        {selectedChild.relationship || 'Student'}
                      </span>
                      <h2 className="text-2xl font-extrabold text-slate-900 mt-2">{selectedChild.full_name}</h2>
                      <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-500">
                        <span>Admission No: <strong className="text-slate-700 font-mono">{selectedChild.admission_number}</strong></span>
                        <span>Class: <strong className="text-slate-700">{selectedChild.class_name}</strong></span>
                        <span>DOB: <strong className="text-slate-700">{selectedChild.date_of_birth ? new Date(selectedChild.date_of_birth).toLocaleDateString() : 'N/A'}</strong></span>
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
                      <p className="text-xs text-blue-600 font-semibold uppercase">Term Average</p>
                      <p className="text-3xl font-extrabold text-blue-900 mt-1">
                        {selectedChild.reportCardsSummary?.averageScore || 0}%
                      </p>
                      <p className="text-xs text-blue-500 mt-0.5">{selectedChild.reportCardsSummary?.totalSubjects || 0} Subjects</p>
                    </div>
                  </div>
                </div>

                {/* Report Card */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Award className="h-5 w-5 text-blue-600" /> Academic Report Card
                  </h3>

                  {(selectedChild.reportCardsSummary?.grades || []).length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center">No grades published yet for this student.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500 font-medium">
                            <th className="pb-3">Subject</th>
                            <th className="pb-3">Term</th>
                            <th className="pb-3">CA (40)</th>
                            <th className="pb-3">Exam (60)</th>
                            <th className="pb-3">Total (100)</th>
                            <th className="pb-3">Grade</th>
                            <th className="pb-3">Remark</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {selectedChild.reportCardsSummary.grades.map((rc) => (
                            <tr key={rc.id}>
                              <td className="py-3 font-semibold text-slate-900">{rc.subject}</td>
                              <td className="py-3 text-slate-500">{rc.term}</td>
                              <td className="py-3 font-mono">{rc.ca_score}</td>
                              <td className="py-3 font-mono">{rc.exam_score}</td>
                              <td className="py-3 font-bold font-mono text-blue-600">{rc.total_score}</td>
                              <td className="py-3">
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                  ['A', 'B'].includes(rc.grade) ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {rc.grade}
                                </span>
                              </td>
                              <td className="py-3 text-xs text-slate-500">{rc.remark}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Fee Payments */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-blue-600" /> Fee Payment History
                    </h3>
                  </div>

                  {(selectedChild.paymentHistory || []).length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center">No payment history recorded.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500 font-medium">
                            <th className="pb-3">Reference</th>
                            <th className="pb-3">Term</th>
                            <th className="pb-3">Amount</th>
                            <th className="pb-3">Status</th>
                            <th className="pb-3">Date &amp; Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {selectedChild.paymentHistory.map((p) => (
                            <tr key={p.id}>
                              <td className="py-3 font-mono text-xs text-slate-500">{p.reference}</td>
                              <td className="py-3">{p.term || 'First Term'}</td>
                              <td className="py-3 font-bold">₦{parseFloat(p.amount).toLocaleString()}</td>
                              <td className="py-3">
                                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                  p.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' : p.status === 'FAILED' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {p.status === 'SUCCESS' ? 'Confirmed' : p.status === 'FAILED' ? 'Failed' : 'Pending'}
                                </span>
                              </td>
                              <td className="py-3 text-xs text-slate-400">
                                {formatDateTime(p.created_at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Paystack quick pay */}
                  <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl">
                    <div>
                      <p className="font-semibold text-sm text-slate-800">Tuition checkout</p>
                      <p className="text-xs text-slate-500">Review payment details before continuing to Paystack.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCheckoutOpen((open) => !open)}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-5 py-2.5 rounded-lg transition shadow"
                    >
                      {checkoutOpen ? 'Close Checkout' : 'Make Payment'}
                    </button>
                  </div>

                  {checkoutOpen && (
                    <form onSubmit={handleChildPayment} className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
                      <h4 className="text-base font-bold text-slate-800">Payment Checkout</h4>
                      <div className="grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-3">
                        <div><p className="text-[11px] font-semibold text-slate-500">Student</p><p className="font-semibold text-slate-800">{selectedChild.full_name}</p></div>
                        <div><p className="text-[11px] font-semibold text-slate-500">Admission Number</p><p className="font-mono text-slate-800">{selectedChild.admission_number}</p></div>
                        <div><p className="text-[11px] font-semibold text-slate-500">Class</p><p className="text-slate-800">{selectedChild.class_name || 'Assigned Class'}</p></div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-600">Term</label>
                          <select value={paymentForm.term} onChange={(e) => setPaymentForm({ ...paymentForm, term: e.target.value })} required className="w-full rounded-lg border border-slate-300 p-2.5 text-sm">
                            {['First Term', 'Second Term', 'Third Term'].map((term) => <option key={term} value={`${term} ${currentYear}`}>{term} {currentYear}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-600">Amount (₦)</label>
                          <input type="number" min="0.01" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} required className="w-full rounded-lg border border-slate-300 p-2.5 text-sm" />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">Paying email</label>
                        <input type="email" value={paymentForm.email} onChange={(e) => setPaymentForm({ ...paymentForm, email: e.target.value })} required className="w-full rounded-lg border border-slate-300 p-2.5 text-sm" />
                      </div>
                      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                        You are paying ₦{Number(paymentForm.amount || 0).toLocaleString()} for {selectedChild.full_name} — {paymentForm.term}
                      </div>
                      <div className="text-xs text-slate-600">
                        <p>Total confirmed payments: <strong>₦{(selectedChild.paymentHistory || []).filter((payment) => payment.status === 'SUCCESS').reduce((total, payment) => total + Number(payment.amount || 0), 0).toLocaleString()}</strong></p>
                        <p>Pending payments: <strong>{(selectedChild.paymentHistory || []).filter((payment) => payment.status === 'PENDING').length}</strong></p>
                      </div>
                      <button type="submit" disabled={paymentLoading || Number(paymentForm.amount) <= 0} className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                        {paymentLoading ? 'Connecting to Paystack...' : 'Pay via Paystack'}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 xl:grid-cols-[0.95fr_1.25fr] gap-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Messages</h3>
            <form onSubmit={handleCreateConversation} className="space-y-3 mb-5">
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

            <div className="space-y-3 border-t border-slate-200 pt-4">
              <h4 className="text-sm font-bold text-slate-700">Recent Conversations</h4>
              {conversations.length === 0 ? (
                <p className="text-sm text-slate-500">No conversations yet.</p>
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
                    <p className="text-xs text-slate-500 mt-1">School Admin • {conversation.creator_name}</p>
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
                    <p className="text-sm text-slate-500">No replies yet.</p>
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

                <form onSubmit={handleReplySubmit} className="border-t border-slate-200 pt-4 space-y-3">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={3}
                    placeholder="Reply to this conversation..."
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
      </main>
    </div>
  );
}

