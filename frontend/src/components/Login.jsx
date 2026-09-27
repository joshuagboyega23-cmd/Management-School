import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GraduationCap, Lock, Mail, ArrowLeft, LogIn, AlertCircle, Heart, BookOpen, ShieldCheck } from 'lucide-react';
import API from '../opi';

export default function Login() {
  const navigate = useNavigate();
  const [activeRole, setActiveRole] = useState('STUDENT'); // 'STUDENT' | 'PARENT'
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
        portal: activeRole.toLowerCase()
      });

      if (res.data.success) {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));

        const role = res.data.user?.role;
        if (role === 'STUDENT') {
          navigate('/student');
        } else if (role === 'PARENT') {
          navigate('/parent');
        } else {
          navigate('/student');
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
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link to="/" className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-xs mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to School Website
        </Link>
        <div className="flex justify-center mb-3">
          <div className="bg-blue-600 rounded-full p-3 shadow-lg">
            <GraduationCap className="h-8 w-8 text-white" />
          </div>
        </div>
        <h2 className="text-3xl font-extrabold text-white tracking-tight">Student & Parent Sign In</h2>
        <p className="mt-2 text-sm text-slate-400">
          Access report cards, assessment records, and online tuition payments
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-slate-800 py-8 px-6 shadow-xl rounded-2xl sm:px-10 border border-slate-700">
          {/* Student vs Parent framing toggle */}
          <div className="flex rounded-lg bg-slate-900 p-1 mb-6 border border-slate-700">
            <button
              type="button"
              onClick={() => setActiveRole('STUDENT')}
              className={`flex-1 py-2 text-xs font-semibold rounded-md transition flex items-center justify-center gap-2 ${
                activeRole === 'STUDENT'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <GraduationCap className="h-4 w-4" /> I am a Student
            </button>
            <button
              type="button"
              onClick={() => setActiveRole('PARENT')}
              className={`flex-1 py-2 text-xs font-semibold rounded-md transition flex items-center justify-center gap-2 ${
                activeRole === 'PARENT'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Heart className="h-4 w-4" /> I am a Parent
            </button>
          </div>

          {error && (
            <div className="mb-4 bg-red-950/60 border border-red-800/80 rounded-lg p-3 flex items-start gap-3 text-red-300 text-sm">
              <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {activeRole === 'STUDENT' ? 'Student Email Address' : 'Parent Email Address'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder={activeRole === 'STUDENT' ? 'student@example.com' : 'parent@example.com'}
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 flex justify-center items-center gap-2 py-3 px-4 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-md transition disabled:opacity-50"
            >
              {loading ? (
                <span>Signing in...</span>
              ) : (
                <>
                  <LogIn className="h-4 w-4" /> Sign In as {activeRole === 'STUDENT' ? 'Student' : 'Parent'}
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-700 text-center space-y-3">
            <p className="text-xs text-slate-400">
              First time here?{' '}
              <Link to="/register" className="font-semibold text-blue-400 hover:text-blue-300">
                Register with Admission No.
              </Link>
            </p>

            {/* Discreet Staff & Admin portal links */}
            <div className="pt-2 flex justify-center items-center gap-4 text-xs text-slate-500">
              <Link to="/teacher-login" className="hover:text-indigo-300 flex items-center gap-1 transition">
                <BookOpen className="h-3.5 w-3.5" /> Staff Login
              </Link>
              <span>•</span>
              <Link to="/admin-login" className="hover:text-blue-300 flex items-center gap-1 transition">
                <ShieldCheck className="h-3.5 w-3.5" /> Admin Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
