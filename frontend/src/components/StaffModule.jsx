import React, { useState } from 'react';
import { Plus, X, Calendar, User, Mail, BookOpen, CheckCircle, Copy, AlertCircle, ShieldCheck } from 'lucide-react';

export default function StaffModule({ teachers, loading, onImportTeachers }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [generatedResult, setGeneratedResult] = useState(null);
  const [copiedId, setCopiedId] = useState('');

  const [teacherForm, setTeacherForm] = useState({
    fullName: '',
    dateOfBirth: '',
    email: '',
    subjectsTaught: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = [{
      fullName: teacherForm.fullName.trim(),
      dateOfBirth: teacherForm.dateOfBirth,
      email: teacherForm.email.trim(),
      subjectsTaught: teacherForm.subjectsTaught ? teacherForm.subjectsTaught.split(',').map((s) => s.trim()).filter(Boolean) : []
    }];

    onImportTeachers(payload, (createdTeachers) => {
      if (Array.isArray(createdTeachers) && createdTeachers.length > 0) {
        setGeneratedResult(createdTeachers[0]);
      }
      setTeacherForm({ fullName: '', dateOfBirth: '', email: '', subjectsTaught: '' });
    });
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(''), 2500);
  };

  const teacherList = Array.isArray(teachers) ? teachers : [];

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Staff Management</h3>
          <p className="text-xs text-gray-500">Official teacher roster and pre-loaded Staff ID codes</p>
        </div>
        <button 
          onClick={() => { setIsModalOpen(true); setGeneratedResult(null); }}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2.5 rounded-lg flex items-center gap-2 transition shadow"
        >
          <Plus className="h-4 w-4" /> Add Teacher
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm py-8 text-center animate-pulse">Loading staff directory...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th className="pb-3 font-semibold">Staff ID</th>
                <th className="pb-3 font-semibold">Full Name</th>
                <th className="pb-3 font-semibold">Email</th>
                <th className="pb-3 font-semibold">Date of Birth</th>
                <th className="pb-3 font-semibold">Subjects Taught</th>
                <th className="pb-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {teacherList.length > 0 ? (
                teacherList.map((teacher) => (
                  <tr key={teacher.teacher_record_id || teacher.staff_id} className="hover:bg-slate-50/80">
                    <td className="py-3 font-mono font-bold text-blue-600 flex items-center gap-1.5">
                      <span>{teacher.staff_id}</span>
                      <button
                        onClick={() => handleCopy(teacher.staff_id)}
                        title="Copy Staff ID"
                        className="text-gray-400 hover:text-blue-600 p-0.5"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </td>
                    <td className="py-3 font-medium text-slate-900">{teacher.full_name}</td>
                    <td className="py-3 text-xs text-slate-500">{teacher.email}</td>
                    <td className="py-3 text-xs text-slate-500">
                      {teacher.date_of_birth ? new Date(teacher.date_of_birth).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="py-3 text-xs text-slate-600">
                      {Array.isArray(teacher.subjects_taught) && teacher.subjects_taught.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {teacher.subjects_taught.map((s, idx) => (
                            <span key={idx} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-medium">
                              {s}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">General</span>
                      )}
                    </td>
                    <td className="py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        teacher.is_registered || teacher.user_id
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {teacher.is_registered || teacher.user_id ? 'Registered' : 'Pending Registration'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="py-10 text-center text-gray-400">
                    No staff records found in database. Click <strong>"Add Teacher"</strong> to enrol a teacher and generate a Staff ID.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ADD TEACHER MODAL & GENERATED STAFF ID POPUP */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl border border-gray-200">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-800">
                  {generatedResult ? 'Staff ID Generated!' : 'Add New Teacher'}
                </h3>
                <p className="text-xs text-gray-500">
                  {generatedResult
                    ? 'Give this Staff ID to the teacher to complete their registration'
                    : 'Pre-loads teacher records and auto-generates official Staff ID (PHA-STF-YYYY-NNNN)'}
                </p>
              </div>
              <button 
                onClick={() => { setIsModalOpen(false); setGeneratedResult(null); }}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {generatedResult ? (
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3 text-emerald-800 text-xs leading-relaxed">
                  <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block text-sm mb-0.5">Teacher Pre-Enrolled Successfully!</span>
                    Share this unique Staff ID with the teacher. They will use it along with their Date of Birth and Email to create their portal account.
                  </div>
                </div>

                <div className="bg-slate-900 rounded-xl p-4 text-white space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Teacher Name</span>
                    <span className="text-sm font-semibold">{generatedResult.full_name}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Pre-loaded Email</span>
                    <span className="text-xs text-slate-300">{generatedResult.email}</span>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-medium">Generated Staff ID:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-extrabold text-blue-400 bg-blue-950/80 px-2.5 py-1 rounded border border-blue-800">
                        {generatedResult.staff_id}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(generatedResult.staff_id)}
                        className="bg-blue-600 hover:bg-blue-500 text-white p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                        title="Copy Staff ID"
                      >
                        <Copy className="h-4 w-4" />
                        <span>{copiedId === generatedResult.staff_id ? 'Copied!' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setGeneratedResult(null); }}
                    className="flex-1 py-2.5 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
                  >
                    + Add Another Teacher
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsModalOpen(false); setGeneratedResult(null); }}
                    className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition shadow"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Teacher Full Name *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <User className="h-4 w-4" />
                    </div>
                    <input
                      type="text"
                      value={teacherForm.fullName}
                      onChange={(e) => setTeacherForm({ ...teacherForm, fullName: e.target.value })}
                      placeholder="e.g. Mr. Babatunde Johnson"
                      required
                      className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Date of Birth *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Calendar className="h-4 w-4" />
                    </div>
                    <input
                      type="date"
                      value={teacherForm.dateOfBirth}
                      onChange={(e) => setTeacherForm({ ...teacherForm, dateOfBirth: e.target.value })}
                      required
                      className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Teacher Email Address *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Mail className="h-4 w-4" />
                    </div>
                    <input
                      type="email"
                      value={teacherForm.email}
                      onChange={(e) => setTeacherForm({ ...teacherForm, email: e.target.value })}
                      placeholder="teacher@pinnacleheights.edu.ng"
                      required
                      className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Subjects Taught (comma-separated)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <BookOpen className="h-4 w-4" />
                    </div>
                    <input
                      type="text"
                      value={teacherForm.subjectsTaught}
                      onChange={(e) => setTeacherForm({ ...teacherForm, subjectsTaught: e.target.value })}
                      placeholder="e.g. Mathematics, Physics"
                      className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition shadow"
                  >
                    Generate Staff ID
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
