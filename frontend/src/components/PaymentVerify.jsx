import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader2, ArrowLeft, Receipt, ExternalLink } from 'lucide-react';
import API from '../opi';

export default function PaymentVerify() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const reference = searchParams.get('reference') || searchParams.get('trxref');

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null); // 'success' | 'failed' | 'no-ref'
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Determine user dashboard destination if authenticated
  const getUserDashboardPath = () => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.role === 'PARENT') return '/parent';
        if (user.role === 'STUDENT') return '/student';
        if (user.role === 'ADMIN' || user.role === 'SUPERADMIN') return '/admin';
      }
    } catch (e) {}
    return '/';
  };

  useEffect(() => {
    if (!reference) {
      setLoading(false);
      setStatus('no-ref');
      setErrorMessage('No payment reference code was provided in the URL.');
      return;
    }

    const verifyPayment = async () => {
      try {
        setLoading(true);
        const res = await API.get(`/payments/verify/${encodeURIComponent(reference)}`);
        if (res.data.success) {
          setStatus('success');
          setPaymentDetails(res.data);
        } else {
          setStatus('failed');
          setErrorMessage(res.data.message || 'Payment could not be verified.');
        }
      } catch (err) {
        setStatus('failed');
        setErrorMessage(
          err.response?.data?.message ||
          err.response?.data?.error ||
          'Payment could not be verified — please contact the school bursary or administrative office.'
        );
      } finally {
        setLoading(false);
      }
    };

    verifyPayment();
  }, [reference]);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="w-full max-w-md bg-slate-800 rounded-2xl p-8 border border-slate-700 shadow-2xl text-center">
        {/* Loading State */}
        {loading && (
          <div className="py-8 space-y-4">
            <div className="flex justify-center">
              <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
            </div>
            <h3 className="text-xl font-bold text-white">Verifying Transaction</h3>
            <p className="text-xs text-slate-400">
              Connecting securely to Paystack to verify your payment status...
            </p>
            {reference && (
              <p className="text-xs font-mono text-slate-500 bg-slate-900 p-2 rounded-lg border border-slate-700">
                Ref: {reference}
              </p>
            )}
          </div>
        )}

        {/* Success State */}
        {!loading && status === 'success' && (
          <div className="space-y-5">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-emerald-900/60 border border-emerald-500/50">
              <CheckCircle className="h-10 w-10 text-emerald-400" />
            </div>

            <div>
              <h3 className="text-2xl font-extrabold text-white">Payment Confirmed!</h3>
              <p className="text-xs text-slate-300 mt-1">
                Your tuition payment has been processed and officially recorded.
              </p>
            </div>

            <div className="bg-slate-900 rounded-xl p-4 border border-slate-700 text-left space-y-2.5 text-xs">
              <div className="flex justify-between items-center text-slate-400">
                <span>Reference Code</span>
                <span className="font-mono font-bold text-blue-400">{reference}</span>
              </div>
              {paymentDetails?.amount && (
                <div className="flex justify-between items-center text-slate-400">
                  <span>Amount Paid</span>
                  <span className="font-bold text-white text-sm">₦{Number(paymentDetails.amount).toLocaleString()}</span>
                </div>
              )}
              {paymentDetails?.payment?.term && (
                <div className="flex justify-between items-center text-slate-400">
                  <span>Academic Term</span>
                  <span className="text-white font-medium">{paymentDetails.payment.term}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-slate-400 pt-2 border-t border-slate-800">
                <span>Status</span>
                <span className="bg-emerald-900/60 text-emerald-300 font-semibold px-2 py-0.5 rounded border border-emerald-700/50">
                  SUCCESS / PAID
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => navigate(getUserDashboardPath())}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition shadow-md flex items-center justify-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" /> Return to Dashboard
              </button>
            </div>
          </div>
        )}

        {/* Failure / Unconfirmed State */}
        {!loading && (status === 'failed' || status === 'no-ref') && (
          <div className="space-y-5">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-900/60 border border-red-500/50">
              <AlertCircle className="h-10 w-10 text-red-400" />
            </div>

            <div>
              <h3 className="text-2xl font-extrabold text-white">Payment Unconfirmed</h3>
              <p className="text-xs text-red-300 mt-1">
                {errorMessage || 'Payment could not be verified — contact the school office.'}
              </p>
            </div>

            {reference && (
              <div className="bg-slate-900 rounded-xl p-4 border border-slate-700 text-left space-y-2 text-xs">
                <div className="flex justify-between items-center text-slate-400">
                  <span>Reference</span>
                  <span className="font-mono text-slate-300">{reference}</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  If your account was debited, please quote this reference code when contacting the school bursary.
                </p>
              </div>
            )}

            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={() => navigate(getUserDashboardPath())}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-semibold transition"
              >
                Return to Dashboard
              </button>
              <Link
                to="/"
                className="text-xs text-blue-400 hover:text-blue-300 py-1"
              >
                Back to School Home
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

