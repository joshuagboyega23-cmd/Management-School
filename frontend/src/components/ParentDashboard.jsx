import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, LogOut, Users, FileText, CreditCard, Award, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import API from '../opi';

export default function ParentDashboard() {
  const navigate = useNavigate();
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [notification, setNotification] = useState({ type: '', text: '' });
  const [paymentForm, setPaymentForm] = useState({ amount: '85000', term: 'First Term 2026' });
  const [paymentLoading, setPaymentLoading] = useState(false);

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

  useEffect(() => {
    fetchChildren();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const showNotification = (type, text) => {
    setNotification({ type, text });
    setTimeout(() => setNotification({ type: '', text: '' }), 4000);
  };

  const handleChildPayment = async (child) => {
    try {
      setPaymentLoading(true);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const res = await API.post('/payments/initialize', {
        studentId: child.id,
        amount: parseFloat(paymentForm.amount),
        email: user.email,
        term: paymentForm.term
      });

      if (res.data.success && res.data.paymentUrl) {
        window.location.href = res.data.paymentUrl;
        showNotification('success', 'Redirecting to Paystack checkout...');
      }
    } catch (err) {
      showNotification('error', err.response?.data?.error || 'Payment initialization failed');
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
                            <th className="pb-3">Date</th>
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
                                  p.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {p.status}
                                </span>
                              </td>
                              <td className="py-3 text-xs text-slate-400">
                                {new Date(p.created_at).toLocaleDateString()}
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
                      <p className="font-semibold text-sm text-slate-800">Pay Tuition Fees for {selectedChild.full_name}</p>
                      <p className="text-xs text-slate-500">Secure instant payment via Paystack</p>
                    </div>
                    <button
                      onClick={() => handleChildPayment(selectedChild)}
                      disabled={paymentLoading}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-5 py-2.5 rounded-lg transition shadow"
                    >
                      {paymentLoading ? 'Processing...' : 'Make Payment'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

