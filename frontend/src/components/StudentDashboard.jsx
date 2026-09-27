import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, LogOut, Award, CreditCard, User, AlertCircle, FileText, CheckCircle, Clock, Download, RefreshCw } from 'lucide-react';
import API from '../opi';
import { downloadReportCardPDF, downloadReceiptPDF, formatDateTime } from '../utils/pdfUtils';

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('grades'); // 'grades' | 'payments'
  const [verifyingRef, setVerifyingRef] = useState('');
  const [notification, setNotification] = useState({ type: '', text: '' });
  const [feeHistory, setFeeHistory] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const student = data?.student;

  const fetchStudentData = async () => {
    try {
      setLoading(true);
      const res = await API.get('/student/me');
      if (res.data.success) {
        setData(res.data.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load student data');
    } finally {
      setLoading(false);
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
      // Refresh dashboard to show updated status
      const refreshRes = await API.get('/student/me');
      if (refreshRes.data.success) {
        setData(refreshRes.data.data);
      }
      const feeRes = await API.get('/payments/history');
      if (feeRes.data.success) {
        const studentPayments = (Array.isArray(feeRes.data.data) ? feeRes.data.data : []).filter(
          (payment) => Number(payment.student_id) === Number(student?.id)
        );
        setFeeHistory(studentPayments);
      }
    } catch (err) {
      showNotification('error', err.response?.data?.message || 'Could not verify payment status.');
    } finally {
      setVerifyingRef('');
    }
  };

  const fetchFeeStatus = async () => {
    if (!student?.id) return;
    try {
      const res = await API.get('/payments/history');
      const paymentsList = Array.isArray(res.data?.data) ? res.data.data : [];
      const studentPayments = paymentsList.filter(
        (payment) => Number(payment.student_id) === Number(student.id)
      );
      setFeeHistory(studentPayments);
    } catch (err) {
      setFeeHistory([]);
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
    fetchStudentData();
    fetchAnnouncements();
  }, []);

  useEffect(() => {
    if (student?.id) {
      fetchFeeStatus();
    }
  }, [student?.id]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const showNotification = (type, text) => {
    setNotification({ type, text });
    setTimeout(() => setNotification({ type: '', text: '' }), 4000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <p className="text-slate-600 font-medium animate-pulse">Loading student portal...</p>
      </div>
    );
  }

  const reportCards = data?.reportCards || [];
  const payments = data?.payments || [];
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
              <h1 className="text-lg font-bold">Student Portal</h1>
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

        {/* Profile Banner */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-2xl p-6 sm:p-8 text-white shadow-lg mb-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <span className="bg-blue-500/30 text-blue-100 text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider">
                Enrolled Student
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold mt-2">{student?.full_name}</h2>
              <div className="flex flex-wrap gap-4 mt-3 text-xs text-blue-200">
                <span className="flex items-center gap-1 font-mono bg-blue-900/40 px-2.5 py-1 rounded-md">
                  Adm No: {student?.admission_number}
                </span>
                <span className="bg-blue-900/40 px-2.5 py-1 rounded-md">
                  Class: {student?.class_name || 'Assigned Class'}
                </span>
                <span className="bg-blue-900/40 px-2.5 py-1 rounded-md">
                  DOB: {student?.date_of_birth ? new Date(student.date_of_birth).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>

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

        <div className="flex gap-3 mb-6 border-b border-slate-200 pb-3">
          <button
            onClick={() => setActiveTab('grades')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition ${
              activeTab === 'grades'
                ? 'bg-blue-600 text-white shadow'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <FileText className="h-4 w-4" /> My Report Card & Grades
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition ${
              activeTab === 'payments'
                ? 'bg-blue-600 text-white shadow'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <CreditCard className="h-4 w-4" /> My Fee Status
          </button>
        </div>

        {/* Tab 1: Grades */}
        {activeTab === 'grades' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Award className="h-5 w-5 text-blue-600" /> Academic Assessment Records
              </h3>
              {reportCards.length > 0 && (
                <button
                  onClick={() => downloadReportCardPDF(student, reportCards)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition"
                >
                  <Download className="h-3.5 w-3.5" /> Download PDF
                </button>
              )}
            </div>

            {reportCards.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">No grades or assessments recorded yet for this session.</p>
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
                    {reportCards.map((rc) => (
                      <tr key={rc.id} className="hover:bg-slate-50/80">
                        <td className="py-3 font-semibold text-slate-900">{rc.subject}</td>
                        <td className="py-3 text-slate-500">{rc.term}</td>
                        <td className="py-3 font-mono">{rc.ca_score}</td>
                        <td className="py-3 font-mono">{rc.exam_score}</td>
                        <td className="py-3 font-bold font-mono text-blue-600">{rc.total_score}</td>
                        <td className="py-3">
                          <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                            ['A', 'B'].includes(rc.grade)
                              ? 'bg-emerald-100 text-emerald-800'
                              : ['C', 'D'].includes(rc.grade)
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
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
        )}

        {/* Tab 2: Payments */}
        {activeTab === 'payments' && (
          <div className="space-y-6">
            {payments.filter((p) => p.status === 'PENDING').length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-5 w-5 text-amber-600" />
                  <h3 className="text-base font-bold text-amber-900">Pending Fee Payments</h3>
                </div>
                <p className="text-xs text-amber-700 mb-4">
                  These payments were initiated but have not yet been marked as completed. If you already completed payment on Paystack, click <strong>Check Status Now</strong> to update the system.
                </p>
                <div className="divide-y divide-amber-200/70 border-t border-amber-200">
                  {payments.filter((p) => p.status === 'PENDING').map((p) => (
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

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-blue-600" /> My Fee Status
                </h3>
              </div>

              {feeHistory.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">No fee transaction history has been recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {feeHistory.map((p) => (
                    <div
                      key={p.id}
                      className="grid grid-cols-2 items-center gap-x-5 gap-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4 text-sm sm:grid-cols-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(8rem,0.85fr)_minmax(12rem,1.3fr)_minmax(7rem,0.7fr)_minmax(10rem,auto)]"
                    >
                      <div className="min-w-0">
                        <p className="mb-1 text-[11px] font-semibold text-slate-500">Term</p>
                        <p className="break-words text-slate-800">{p.term || 'First Term'}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="mb-1 text-[11px] font-semibold text-slate-500">Amount</p>
                        <p className="font-bold text-slate-900">₦{parseFloat(p.amount).toLocaleString()}</p>
                      </div>
                      <div className="col-span-2 min-w-0 sm:col-span-2 xl:col-span-1">
                        <p className="mb-1 text-[11px] font-semibold text-slate-500">Date &amp; Time</p>
                        <p className="break-words text-xs text-slate-600">{formatDateTime(p.created_at)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="mb-1 text-[11px] font-semibold text-slate-500">Status</p>
                        <span className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${
                          p.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' : p.status === 'FAILED' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {p.status === 'SUCCESS' ? 'Confirmed' : p.status === 'FAILED' ? 'Failed' : 'Pending'}
                        </span>
                      </div>
                      <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-2 xl:col-span-1 xl:justify-self-end">
                        <p className="text-[11px] font-semibold text-slate-500 xl:hidden">Receipt</p>
                        {p.status === 'SUCCESS' ? (
                          <button
                            onClick={() => downloadReceiptPDF({ ...p, reference: p.reference, amount: p.amount, term: p.term, paidAt: p.created_at })}
                            className="text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1.5 rounded-lg transition"
                          >
                            Download Receipt
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">Not available</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

