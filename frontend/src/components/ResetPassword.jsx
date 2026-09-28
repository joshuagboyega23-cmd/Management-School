import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { getAuthErrorMessage, postAuthRequest, SERVER_WAKING_MESSAGE, wakeServer } from '../opi';
import PasswordInput from './PasswordInput';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    wakeServer();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const response = await postAuthRequest('/auth/reset-password', {
        token: searchParams.get('token') || '',
        newPassword
      }, () => setError(SERVER_WAKING_MESSAGE));
      setError('');
      setSuccess(response.data.message || 'Password reset successfully.');
      const portal = searchParams.get('portal');
      const loginPath = portal === 'teacher' ? '/teacher-login' : portal === 'admin' ? '/admin-login' : '/login';
      window.setTimeout(() => navigate(loginPath, { replace: true }), 1200);
    } catch (requestError) {
      setError(getAuthErrorMessage(requestError, 'Could not reset password. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 px-4 py-12 text-white">
      <div className="mx-auto max-w-md">
        <button type="button" onClick={() => navigate(-1)} className="mb-6 inline-flex items-center gap-2 text-xs text-blue-300 hover:text-blue-200">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <section className="rounded-xl border border-slate-700 bg-slate-800 p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <Lock className="h-5 w-5 text-blue-400" />
            <h1 className="text-xl font-bold">Choose a new password</h1>
          </div>
          {error && <p className="mb-4 rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-300" role="alert">{error}</p>}
          {success && <p className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950/50 p-3 text-sm text-emerald-300" role="status">{success} Redirecting to sign in...</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="new-password" className="mb-1 block text-xs font-semibold text-slate-300">New password</label>
              <PasswordInput id="new-password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 pr-10 text-sm" />
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-1 block text-xs font-semibold text-slate-300">Confirm new password</label>
              <PasswordInput id="confirm-password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 pr-10 text-sm" />
            </div>
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
              {loading ? 'Saving password...' : 'Reset password'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}