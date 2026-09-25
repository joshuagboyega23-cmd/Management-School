import React, { useState, useEffect } from 'react';
import { Send, AlertCircle, History, CheckCircle } from 'lucide-react';
import API from '../opi';

// Generate last 24 months as YYYY-MM options
function generateMonthOptions() {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' });
    options.push({ value, label });
  }
  return options;
}

const MONTH_OPTIONS = generateMonthOptions();

export default function PayrollModule({ teachers, onProcessPayroll }) {
  const [payrollForm, setPayrollForm] = useState({
    staffId: '',
    amount: '',
    monthYear: MONTH_OPTIONS[0].value
  });
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const registeredTeachers = (Array.isArray(teachers) ? teachers : []).filter(
    (t) => t.id && (t.is_registered || t.status === 'Registered')
  );

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      setHistoryError('');
      const res = await API.get('/payroll/history');
      setHistory(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      setHistoryError('Could not load payroll history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!payrollForm.staffId || !payrollForm.amount) return;
    onProcessPayroll(
      {
        staffId: Number(payrollForm.staffId),
        amount: Number(payrollForm.amount),
        monthYear: payrollForm.monthYear
      },
      () => {
        // Refresh history after successful submission
        fetchHistory();
        setPayrollForm({ ...payrollForm, staffId: '', amount: '' });
      }
    );
  };

  return (
    <div className="space-y-8">
      {/* ── Form ── */}
      <div className="max-w-xl bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-lg font-bold text-gray-800 mb-1">Record Salary Payment</h3>
        <p className="text-xs text-gray-500 mb-6">
          Log a monthly salary record for registered staff.{' '}
          <span className="italic text-gray-400">(Ledger entry only — no bank transfer is initiated.)</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Teacher Select */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Select Registered Teacher *
            </label>
            <select
              value={payrollForm.staffId}
              onChange={(e) => setPayrollForm({ ...payrollForm, staffId: e.target.value })}
              required
              className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">-- Choose Teacher --</option>
              {registeredTeachers.map((t) => (
                <option key={t.teacher_record_id || t.id} value={t.id}>
                  {t.full_name} ({t.staff_id})
                </option>
              ))}
            </select>
            {registeredTeachers.length === 0 && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 mt-2 bg-amber-50 p-2 rounded border border-amber-200">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  No registered staff accounts available. Teachers must complete self-registration before salary records can be logged.
                </span>
              </div>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Salary Amount (₦) *
            </label>
            <input
              type="number"
              min="1"
              step="0.01"
              value={payrollForm.amount}
              onChange={(e) => setPayrollForm({ ...payrollForm, amount: e.target.value })}
              placeholder="e.g. 150000"
              required
              className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Month Picker */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Month / Year *
            </label>
            <select
              value={payrollForm.monthYear}
              onChange={(e) => setPayrollForm({ ...payrollForm, monthYear: e.target.value })}
              required
              className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              {MONTH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={registeredTeachers.length === 0 || !payrollForm.amount}
            className="w-full bg-slate-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-800 transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            Record Salary <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

      {/* ── Payroll History Table ── */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <History className="h-5 w-5 text-blue-600" /> Salary Records
          </h3>
          <button
            onClick={fetchHistory}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium transition"
          >
            Refresh
          </button>
        </div>

        {historyLoading && (
          <p className="text-sm text-gray-400 animate-pulse py-4 text-center">Loading records...</p>
        )}
        {historyError && (
          <p className="text-sm text-red-500 py-4 text-center">{historyError}</p>
        )}
        {!historyLoading && !historyError && history.length === 0 && (
          <p className="text-sm text-gray-400 py-4 text-center">No salary records logged yet.</p>
        )}
        {!historyLoading && history.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 font-medium text-xs">
                  <th className="pb-2 pr-4">Staff Name</th>
                  <th className="pb-2 pr-4">Month</th>
                  <th className="pb-2 pr-4">Amount (₦)</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Recorded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="py-2.5 pr-4 font-medium text-gray-800">
                      {row.staff_name}
                      <span className="block text-xs text-gray-400 font-normal">{row.email}</span>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-gray-600">{row.month_year}</td>
                    <td className="py-2.5 pr-4 font-bold text-gray-900">
                      ₦{Number(row.amount).toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-4">
                      {row.is_paid ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded border border-emerald-200">
                          <CheckCircle className="h-3 w-3" /> Recorded
                        </span>
                      ) : (
                        <span className="bg-amber-50 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded border border-amber-200">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-xs text-gray-400">
                      {row.paid_at ? new Date(row.paid_at).toLocaleDateString('en-NG') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}