import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, LogOut, Award, CreditCard, User, AlertCircle, FileText, CheckCircle, Clock, Download, RefreshCw, Menu, X, BookOpen } from 'lucide-react';
import API from '../opi';
import { downloadReportCardPDF, downloadReceiptPDF, formatDateTime } from '../utils/pdfUtils';

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [verifyingRef, setVerifyingRef] = useState('');
  const [notification, setNotification] = useState({ type: '', text: '' });
  const [feeHistory, setFeeHistory] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [materials, setMaterials] = useState([]);
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

  const fetchMaterials = async () => {
    try {
      const res = await API.get('/materials');
      setMaterials(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      setMaterials([]);
    }
  };

  useEffect(() => {
    fetchStudentData();
    fetchAnnouncements();
    fetchMaterials();
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

  const handleTabSelect = (tab) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
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
              <p className="text-xs text-slate-400 leading-tight">Student Portal</p>
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
            { id: 'materials', label: 'Learning Materials', Icon: BookOpen },
            { id: 'payments', label: 'Payments', Icon: CreditCard }
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
            <h2 className="text-xl font-bold capitalize text-gray-800">{activeTab === 'materials' ? 'Learning Materials' : `${activeTab} Portal`}</h2>
            <p className="text-xs text-gray-500">Pinnacle Heights Academy — Student Dashboard</p>
          </div>
        </header>
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
        <div className={`${activeTab === 'overview' ? '' : 'hidden'} bg-gradient-to-r from-blue-700 to-indigo-800 rounded-2xl p-6 sm:p-8 text-white shadow-lg mb-8`}>
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

        <section className={`${activeTab === 'materials' ? '' : 'hidden'} mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`} aria-labelledby="learning-materials-heading">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
              <FileText className="h-5 w-5" />
            </div>
            <h2 id="learning-materials-heading" className="text-lg font-bold text-slate-800">Learning Materials</h2>
          </div>
          {materials.length === 0 ? (
            <p className="py-3 text-sm text-slate-500">No learning materials have been shared yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {materials.map((material) => (
                <article key={material.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words font-semibold text-slate-800">{material.title}</h3>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">{material.kind}</span>
                    </div>
                    {material.description && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{material.description}</p>}
                    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{material.class_name || 'All students'}</span>
                      <span>{formatDateTime(material.created_at)}</span>
                      <span>Posted by {material.uploader_name}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {material.kind === 'FILE' ? (
                      <>
                        <a href={material.url} target="_blank" rel="noreferrer" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100">Open</a>
                        <a href={material.url} download={material.file_name || material.title} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">Download</a>
                      </>
                    ) : (
                      <a href={material.url} target="_blank" rel="noreferrer" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100">Open link</a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

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

