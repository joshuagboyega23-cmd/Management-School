import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldCheck, Lock, Mail, ArrowLeft, LogIn, AlertCircle, BookOpen, GraduationCap } from 'lucide-react';
import API from '../opi';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await API.post('/auth/login', {
        email: formData.email,
        password: formData.password,
        portal: 'admin'
      });

      if (res.data.success) {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));

        const role = res.data.user?.role;
        if (role === 'ADMIN' || role === 'SUPERADMIN') {
          navigate('/admin');
        } else {
          navigate('/admin');
        }
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.response?.data?.error ||
        'Login failed. Please check your credentials.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link to="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-xs mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to School Website
        </Link>
        <div className="flex justify-center mb-3">
          <div className="bg-slate-800 border border-slate-700 rounded-full p-3 shadow-lg">
            <ShieldCheck className="h-8 w-8 text-blue-400" />
          </div>
        </div>
        <h2 className="text-3xl font-extrabold text-white tracking-tight">Administrative Portal</h2>
        <p className="mt-2 text-sm text-slate-400">
          Secure sign in for School Administrators, Principals & SuperAdmins
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-slate-900 py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-800">
          {error && (
            <div className="mb-4 bg-red-950/60 border border-red-800/80 rounded-lg p-3 flex items-start gap-3 text-red-300 text-sm">
              <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Admin Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder="admin@pinnacleheights.edu.ng"
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Master Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-600"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 flex justify-center items-center gap-2 py-3 px-4 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-md transition disabled:opacity-50"
            >
              {loading ? (
                <span>Authenticating Administrator...</span>
              ) : (
                <>
                  <LogIn className="h-4 w-4" /> Sign In to Admin Console
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-800 text-center space-y-3">
            <p className="text-xs text-slate-500">
              Authorized personnel only. All access attempts are securely audited.
            </p>

            <div className="pt-2 flex justify-center items-center gap-4 text-xs text-slate-500">
              <Link to="/login" className="hover:text-blue-300 flex items-center gap-1 transition">
                <GraduationCap className="h-3.5 w-3.5" /> Student / Parent Sign In
              </Link>
              <span>•</span>
              <Link to="/teacher-login" className="hover:text-indigo-300 flex items-center gap-1 transition">
                <BookOpen className="h-3.5 w-3.5" /> Teacher Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

