import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GraduationCap, Lock, Mail, User, Calendar, Hash, ArrowLeft, UserPlus, AlertCircle, Heart, BookOpen } from 'lucide-react';
import API from '../opi';

export default function Register() {
  const navigate = useNavigate();
  const [roleType, setRoleType] = useState('STUDENT'); // 'STUDENT' | 'PARENT' | 'TEACHER'
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    admissionNumber: '',
    staffId: '',
    dateOfBirth: '',
    relationship: 'Parent',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match. Please ensure both password fields are identical.');
      return;
    }

    setLoading(true);

    try {
      let endpoint = '/auth/register/student';
      let payload = {
        fullName: formData.fullName,
        email: formData.email,
        password: formData.password,
        admissionNumber: formData.admissionNumber,
        dateOfBirth: formData.dateOfBirth,
      };

      if (roleType === 'PARENT') {
        endpoint = '/auth/register/parent';
        payload = {
          ...payload,
          relationship: formData.relationship,
        };
      } else if (roleType === 'TEACHER') {
        endpoint = '/auth/register/teacher';
        payload = {
          fullName: formData.fullName,
          email: formData.email,
          password: formData.password,
          staffId: formData.staffId,
          dateOfBirth: formData.dateOfBirth,
        };
      }

      const res = await API.post(endpoint, payload);

      if (res.data.success) {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));

        if (roleType === 'STUDENT') {
          navigate('/student');
        } else if (roleType === 'TEACHER') {
          navigate('/teacher');
        } else {
          navigate('/parent');
        }
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.response?.data?.error ||
        (roleType === 'TEACHER'
          ? 'Registration failed. Please verify your Staff ID, Date of Birth, and pre-loaded Email with school administration.'
          : 'Registration failed. Please verify your admission details with the administration.')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-lg text-center">
        <Link to="/" className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-xs mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to School Website
        </Link>
        <div className="flex justify-center mb-3">
          <div className="bg-blue-600 rounded-full p-3 shadow-lg">
            <GraduationCap className="h-8 w-8 text-white" />
          </div>
        </div>
        <h2 className="text-3xl font-extrabold text-white tracking-tight">Portal Registration</h2>
        <p className="mt-2 text-sm text-slate-400">
          Activate your account using your verified credentials
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-lg px-4">
        <div className="bg-slate-800 py-8 px-6 shadow-xl rounded-2xl sm:px-10 border border-slate-700">
          {/* Role selector tabs */}
          <div className="flex rounded-lg bg-slate-900 p-1 mb-6 border border-slate-700">
            <button
              type="button"
              onClick={() => { setRoleType('STUDENT'); setError(''); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-md transition flex items-center justify-center gap-1.5 ${
                roleType === 'STUDENT'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <GraduationCap className="h-4 w-4" /> Student
            </button>
            <button
              type="button"
              onClick={() => { setRoleType('TEACHER'); setError(''); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-md transition flex items-center justify-center gap-1.5 ${
                roleType === 'TEACHER'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BookOpen className="h-4 w-4" /> Teacher
            </button>
            <button
              type="button"
              onClick={() => { setRoleType('PARENT'); setError(''); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-md transition flex items-center justify-center gap-1.5 ${
                roleType === 'PARENT'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Heart className="h-4 w-4" /> Parent
            </button>
          </div>

          {error && (
            <div className="mb-5 bg-red-950/60 border border-red-800/80 rounded-lg p-3.5 flex items-start gap-3 text-red-300 text-sm">
              <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {roleType === 'STUDENT' ? 'Your Full Name' : roleType === 'TEACHER' ? 'Staff Full Name' : 'Parent / Guardian Full Name'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  required
                  placeholder={roleType === 'STUDENT' ? 'e.g. John Adeyemi' : roleType === 'TEACHER' ? 'e.g. Mr. Babatunde Johnson' : 'e.g. Dr. Samuel Adeyemi'}
                  className="w-full pl-10 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
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
                  placeholder="email@example.com"
                  className="w-full pl-10 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    minLength={8}
                    placeholder="Min 8 chars"
                    className="w-full pl-10 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Confirm Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                    minLength={8}
                    placeholder="Re-enter password"
                    className={`w-full pl-10 pr-3 py-2 bg-slate-900 border rounded-lg text-white text-sm focus:outline-none focus:ring-2 placeholder-slate-500 ${
                      formData.confirmPassword && formData.password !== formData.confirmPassword
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-slate-700 focus:ring-blue-500'
                    }`}
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-700/60">
              <p className="text-xs text-blue-400 font-semibold mb-3">
                {roleType === 'STUDENT'
                  ? 'Verification: School Admission Info'
                  : roleType === 'TEACHER'
                  ? 'Verification: Staff ID & Birth Record'
                  : 'Verification: Student Link Details'}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {roleType === 'STUDENT' ? 'Admission Number' : roleType === 'TEACHER' ? 'Staff ID' : "Child's Admission Number"}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Hash className="h-4 w-4" />
                    </div>
                    {roleType === 'TEACHER' ? (
                      <input
                        type="text"
                        name="staffId"
                        value={formData.staffId}
                        onChange={handleChange}
                        required
                        placeholder="e.g. PHA-STF-2026-0001"
                        className="w-full pl-10 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500 uppercase font-mono"
                      />
                    ) : (
                      <input
                        type="text"
                        name="admissionNumber"
                        value={formData.admissionNumber}
                        onChange={handleChange}
                        required
                        placeholder="e.g. PHA-2026-0001"
                        className="w-full pl-10 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500 uppercase font-mono"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {roleType === 'PARENT' ? "Child's Date of Birth" : 'Date of Birth'}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Calendar className="h-4 w-4" />
                    </div>
                    <input
                      type="date"
                      name="dateOfBirth"
                      value={formData.dateOfBirth}
                      onChange={handleChange}
                      required
                      className="w-full pl-10 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {roleType === 'PARENT' && (
                <div className="mt-3">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Relationship to Student</label>
                  <select
                    name="relationship"
                    value={formData.relationship}
                    onChange={handleChange}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Father">Father</option>
                    <option value="Mother">Mother</option>
                    <option value="Guardian">Guardian</option>
                    <option value="Sponsor">Sponsor</option>
                  </select>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 flex justify-center items-center gap-2 py-3 px-4 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-md transition disabled:opacity-50"
            >
              {loading ? (
                <span>Verifying & Registering...</span>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" /> Create {roleType === 'STUDENT' ? 'Student' : roleType === 'TEACHER' ? 'Teacher' : 'Parent'} Account
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-700 text-center space-y-2">
            <p className="text-xs text-slate-400">
              Already registered?{' '}
              <Link 
                to={roleType === 'TEACHER' ? '/teacher-login' : '/login'} 
                className="font-semibold text-blue-400 hover:text-blue-300"
              >
                Sign in to your {roleType === 'TEACHER' ? 'Staff' : 'Student/Parent'} account
              </Link>
            </p>
            <div className="pt-2 flex justify-center items-center gap-3 text-xs text-slate-500">
              <Link to="/login" className="hover:text-blue-300 transition">Student/Parent</Link>
              <span>•</span>
              <Link to="/teacher-login" className="hover:text-indigo-300 transition">Staff Portal</Link>
              <span>•</span>
              <Link to="/admin-login" className="hover:text-blue-300 transition">Admin Portal</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

