import React, { useState } from 'react';
import { Plus, X, Calendar, User, Phone, GraduationCap } from 'lucide-react';

export default function StudentsModule({ students, loading, onAddStudent }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [studentForm, setStudentForm] = useState({
    fullName: '',
    dateOfBirth: '',
    className: 'JSS 1',
    guardianPhone: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onAddStudent(studentForm, () => {
      setIsModalOpen(false);
      setStudentForm({ fullName: '', dateOfBirth: '', className: 'JSS 1', guardianPhone: '' });
    });
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Enrolled Students</h3>
          <p className="text-xs text-gray-500">Official student roster and admission numbers</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2.5 rounded-lg flex items-center gap-2 transition shadow"
        >
          <Plus className="h-4 w-4" /> Enrol New Student
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm py-8 text-center animate-pulse">Loading student directory...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th className="pb-3 font-semibold">Admission No</th>
                <th className="pb-3 font-semibold">Full Name</th>
                <th className="pb-3 font-semibold">Class</th>
                <th className="pb-3 font-semibold">Date of Birth</th>
                <th className="pb-3 font-semibold">Guardian Phone</th>
                <th className="pb-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {(Array.isArray(students) ? students : []).length > 0 ? (
                (Array.isArray(students) ? students : []).map((student) => (
                  <tr key={student.id} className="hover:bg-slate-50/80">
                    <td className="py-3 font-mono font-bold text-blue-600">{student.admission_no}</td>
                    <td className="py-3 font-medium text-slate-900">{student.name}</td>
                    <td className="py-3">{student.class_name}</td>
                    <td className="py-3 text-xs text-slate-500">
                      {student.date_of_birth ? new Date(student.date_of_birth).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="py-3 text-xs text-slate-500">{student.guardian_phone || 'N/A'}</td>
                    <td className="py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        student.user_id ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {student.user_id ? 'Claimed' : 'Pre-Enrolled'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="py-10 text-center text-gray-400">
                    No student records found in database. Click <strong>"Enrol New Student"</strong> to add the first record.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ENROL STUDENT MODAL POPUP */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl border border-gray-200">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Enrol New Student</h3>
                <p className="text-xs text-gray-500">Generates official Admission Number for student self-registration</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Student Full Name *</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <User className="h-4 w-4" />
                  </div>
                  <input 
                    type="text" 
                    value={studentForm.fullName} 
                    onChange={(e) => setStudentForm({ ...studentForm, fullName: e.target.value })}
                    placeholder="e.g. David Adebayo"
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
                    value={studentForm.dateOfBirth} 
                    onChange={(e) => setStudentForm({ ...studentForm, dateOfBirth: e.target.value })}
                    required 
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Class</label>
                  <select 
                    value={studentForm.className} 
                    onChange={(e) => setStudentForm({ ...studentForm, className: e.target.value })}
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="JSS 1">JSS 1</option>
                    <option value="JSS 2">JSS 2</option>
                    <option value="JSS 3">JSS 3</option>
                    <option value="SS 1">SS 1</option>
                    <option value="SS 2">SS 2</option>
                    <option value="SS 3">SS 3</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Guardian Phone</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Phone className="h-4 w-4" />
                    </div>
                    <input 
                      type="tel" 
                      value={studentForm.guardianPhone} 
                      onChange={(e) => setStudentForm({ ...studentForm, guardianPhone: e.target.value })}
                      placeholder="08012345678"
                      className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
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
                  Enrol Student
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}