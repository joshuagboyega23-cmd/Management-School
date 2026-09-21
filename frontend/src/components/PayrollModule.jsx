import React, { useState } from 'react';
import { Send } from 'lucide-react';

export default function PayrollModule({ onProcessPayroll }) {
  const [payrollForm, setPayrollForm] = useState({
    staffId: '',
    monthYear: '09-2026'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onProcessPayroll(payrollForm);
  };

  return (
    <div className="max-w-xl bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <h3 className="text-lg font-bold text-gray-800 mb-2">Process Staff Salary</h3>
      <p className="text-xs text-gray-500 mb-6">Disburse monthly salary for school staff.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Staff ID</label>
          <input 
            type="text" 
            value={payrollForm.staffId} 
            onChange={(e) => setPayrollForm({ ...payrollForm, staffId: e.target.value })}
            placeholder="Enter Staff UUID"
            required 
            className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Month / Year</label>
          <input 
            type="text" 
            value={payrollForm.monthYear} 
            onChange={(e) => setPayrollForm({ ...payrollForm, monthYear: e.target.value })}
            required 
            className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <button type="submit" className="w-full bg-slate-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-800 transition flex items-center justify-center gap-2">
          Disburse Salary <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}