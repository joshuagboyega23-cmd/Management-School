import React, { useState } from 'react';
import { Send, AlertCircle } from 'lucide-react';

export default function PayrollModule({ teachers, onProcessPayroll }) {
  const [payrollForm, setPayrollForm] = useState({
    staffId: '',
    monthYear: '2026-09'
  });

  const registeredTeachers = (Array.isArray(teachers) ? teachers : []).filter(
    (t) => t.id && (t.is_registered || t.status === 'Registered')
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!payrollForm.staffId) return;
    onProcessPayroll({
      ...payrollForm,
      staffId: Number(payrollForm.staffId)
    });
  };

  return (
    <div className="max-w-xl bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <h3 className="text-lg font-bold text-gray-800 mb-2">Process Staff Salary</h3>
      <p className="text-xs text-gray-500 mb-6">Disburse monthly salary for registered school staff.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Select Registered Teacher *</label>
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
                No registered staff accounts available. Pre-loaded teachers must complete self-registration with their Staff ID before salary disbursement.
              </span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Month / Year (YYYY-MM)</label>
          <input 
            type="text" 
            value={payrollForm.monthYear} 
            onChange={(e) => setPayrollForm({ ...payrollForm, monthYear: e.target.value })}
            placeholder="2026-09"
            required 
            className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <button 
          type="submit" 
          disabled={registeredTeachers.length === 0}
          className="w-full bg-slate-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-800 transition flex items-center justify-center gap-2 disabled:opacity-50"
        >
          Disburse Salary <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}