import { useState } from 'react';
import { ExternalLink } from 'lucide-react';

export default function PaymentsModule({ students, paymentHistory, onProcessPayment }) {
  const currentYear = new Date().getFullYear();
  const [selectedClassId, setSelectedClassId] = useState('');
  const [paymentForm, setPaymentForm] = useState({
    studentId: '',
    email: '',
    amount: '',
    term: `First Term ${currentYear}`
  });

  const studentList = Array.isArray(students) ? students : [];
  const paymentList = Array.isArray(paymentHistory) ? paymentHistory : [];
  const classOptions = [...new Map(
    studentList
      .filter((student) => student.class_id && student.class_name)
      .map((student) => [String(student.class_id), { id: student.class_id, name: student.class_name }])
  ).values()];
  const classStudents = studentList.filter((student) => String(student.class_id) === String(selectedClassId));
  const selectedPayments = paymentList.filter((payment) => String(payment.student_id) === String(paymentForm.studentId));
  const pendingTotal = selectedPayments
    .filter((payment) => payment.status === 'PENDING')
    .reduce((total, payment) => total + Number(payment.amount || 0), 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    onProcessPayment({
      ...paymentForm,
      studentId: Number(paymentForm.studentId),
      amount: Number(paymentForm.amount)
    });
  };

  return (
    <div className="max-w-xl bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <h3 className="text-lg font-bold text-gray-800 mb-2">School Fee Checkout (Paystack)</h3>
      <p className="text-xs text-gray-500 mb-6">Initialize direct online tuition payments for students.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Select Class</label>
          <select
            value={selectedClassId}
            onChange={(e) => {
              setSelectedClassId(e.target.value);
              setPaymentForm({ ...paymentForm, studentId: '' });
            }}
            required
            className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm"
          >
            <option value="">-- Choose Class --</option>
            {classOptions.map((classItem) => (
              <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Select Student</label>
          <select
            value={paymentForm.studentId} 
            onChange={(e) => setPaymentForm({ ...paymentForm, studentId: e.target.value })}
            required
            disabled={!selectedClassId}
            className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">{selectedClassId ? '-- Choose Student --' : 'Select a class first'}</option>
            {classStudents.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.admission_no})</option>
            ))}
          </select>
        </div>

        {paymentForm.studentId && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-800">Payment History</h4>
              <span className="text-xs font-medium text-amber-800">Pending transactions: NGN {pendingTotal.toLocaleString()}</span>
            </div>
            {selectedPayments.length === 0 ? (
              <p className="text-xs text-slate-500">No payment history for this student.</p>
            ) : (
              <div className="max-h-44 space-y-2 overflow-y-auto">
                {selectedPayments.map((payment) => (
                  <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2 text-xs">
                    <span className="text-slate-600">{payment.term || 'Term'} · {payment.reference}</span>
                    <span className="font-semibold text-slate-800">NGN {Number(payment.amount || 0).toLocaleString()} · {payment.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
            <select
              value={paymentForm.term}
              onChange={(e) => setPaymentForm({ ...paymentForm, term: e.target.value })}
              required
              className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white"
            >
              {['First Term', 'Second Term', 'Third Term'].map((term) => (
                <option key={term} value={`${term} ${currentYear}`}>{term} {currentYear}</option>
              ))}
            </select>
          </div>
        </div>

        <button type="submit" className="w-full bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition flex items-center justify-center gap-2">
          Pay Fees via Paystack <ExternalLink className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}