import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';
import { getAuthErrorMessage, postAuthRequest, SERVER_WAKING_MESSAGE, wakeServer } from '../opi';

const PORTALS = ['student', 'parent', 'teacher', 'admin'];

export default function ForgotPassword() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPortal = PORTALS.includes(searchParams.get('portal')) ? searchParams.get('portal') : 'student';
  const [portal, setPortal] = useState(initialPortal);
  const [email, setEmail] = useState('');
  const [admissionNumber, setAdmissionNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    wakeServer();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    const payload = { email: email.trim(), portal };
    if (portal === 'student' || portal === 'parent') payload.admissionNumber = admissionNumber.trim();

    try {
      const response = await postAuthRequest('/auth/forgot-password', payload, () => setError(SERVER_WAKING_MESSAGE));
      setError('');
      setNotice(response.data.message);
    } catch (requestError) {
      setError(getAuthErrorMessage(requestError, 'Could not request a reset link. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handlePortalChange = (event) => {
    const nextPortal = event.target.value;
    setPortal(nextPortal);
    setSearchParams({ portal: nextPortal });
    setError('');
    setNotice('');
  };

  return (
    <main className="min-h-screen bg-slate-900 px-4 py-12 text-white">
      <div className="mx-auto max-w-md">
        <Link to="/login" className="mb-6 inline-flex items-center gap-2 text-xs text-blue-300 hover:text-blue-200">
          <ArrowLeft className="h-4 w-4" /> Back to sign in
        </Link>
        <section className="rounded-xl border border-slate-700 bg-slate-800 p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <Mail className="h-5 w-5 text-blue-400" />
            <h1 className="text-xl font-bold">Forgot password</h1>
          </div>
          <p className="mb-5 text-sm text-slate-400">Enter the account details used for your portal.</p>
          {error && <p className="mb-4 rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-300" role="alert">{error}</p>}
          {notice && <p className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950/50 p-3 text-sm text-emerald-300" role="status">{notice}</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="reset-portal" className="mb-1 block text-xs font-semibold text-slate-300">Portal</label>
              <select id="reset-portal" value={portal} onChange={handlePortalChange} className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm">
                <option value="student">Student</option>
                <option value="parent">Parent</option>
                <option value="teacher">Teacher</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label htmlFor="reset-email" className="mb-1 block text-xs font-semibold text-slate-300">Email address</label>
              <input id="reset-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm" autoComplete="email" />
            </div>
            {(portal === 'student' || portal === 'parent') && (
              <div>
                <label htmlFor="reset-admission" className="mb-1 block text-xs font-semibold text-slate-300">
                  {portal === 'parent' ? 'Admission number of any one of your children' : 'Admission number'}
                </label>
                <input id="reset-admission" type="text" required value={admissionNumber} onChange={(event) => setAdmissionNumber(event.target.value)} placeholder="PHA-2026-0001" className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm uppercase" />
              </div>
            )}
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
              {loading ? 'Sending request...' : 'Send reset link'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}