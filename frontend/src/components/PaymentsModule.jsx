import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';

export default function PaymentsModule({ students, onProcessPayment }) {
  const [paymentForm, setPaymentForm] = useState({
    studentId: '',
    email: '',
    amount: '',
    term: 'First Term 2026'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onProcessPayment(paymentForm);
  };

  return (
    <div className="max-w-xl bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <h3 className="text-lg font-bold text-gray-800 mb-2">School Fee Checkout (Paystack)</h3>
      <p className="text-xs text-gray-500 mb-6">Initialize direct online tuition payments for students.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Select Student</label>
          <select 
            value={paymentForm.studentId} 
            onChange={(e) => setPaymentForm({ ...paymentForm, studentId: e.target.value })}
            required 
            className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">-- Choose Student --</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.admission_no})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Parent Email</label>
          <input 
            type="email" 
            value={paymentForm.email} 
            onChange={(e) => setPaymentForm({ ...paymentForm, email: e.target.value })}
            placeholder="parent@example.com"
            required 
            className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Amount (₦)</label>
            <input 
              type="number" 
              value={paymentForm.amount} 
              onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
              placeholder="50000"
              required 
              className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Term</label>
            <input 
              type="text" 
              value={paymentForm.term} 
              onChange={(e) => setPaymentForm({ ...paymentForm, term: e.target.value })}
              required 
              className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <button type="submit" className="w-full bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition flex items-center justify-center gap-2">
          Pay Fees via Paystack <ExternalLink className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}