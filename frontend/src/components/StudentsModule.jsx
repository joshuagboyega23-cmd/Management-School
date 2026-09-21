import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

export default function StudentsModule({ students, loading, onAddStudent }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [studentForm, setStudentForm] = useState({
    fullName: '',
    email: '',
    className: 'JSS 1',
    guardianPhone: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onAddStudent(studentForm, () => {
      setIsModalOpen(false);
      setStudentForm({ fullName: '', email: '', className: 'JSS 1', guardianPhone: '' });
    });
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-gray-800">Enrolled Students</h3>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2.5 rounded-lg flex items-center gap-2 transition"
        >
          <Plus className="h-4 w-4" /> Enrol New Student
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading student directory...</p>
      ) : (
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-200 text-gray-600 text-sm">
              <th className="pb-3">Admission No</th>
              <th className="pb-3">Full Name</th>
              <th className="pb-3">Class</th>
              <th className="pb-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
            {students.length > 0 ? (
              students.map((student) => (
                <tr key={student.id}>
                  <td className="py-3 font-mono text-blue-600">{student.admission_no}</td>
                  <td className="py-3 font-medium">{student.name}</td>
                  <td className="py-3">{student.class_name}</td>
                  <td className="py-3">
                    <button className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1 rounded">
                      View Profile
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" className="py-8 text-center text-gray-400">
                  No student records found in database. Click "Enrol New Student" above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {/* ENROL STUDENT MODAL POPUP */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-xl p-6 shadow-2xl border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">Enrol New Student</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Student Full Name</label>
                <input 
                  type="text" 
                  value={studentForm.fullName} 
                  onChange={(e) => setStudentForm({ ...studentForm, fullName: e.target.value })}
                  placeholder="e.g. David Adebayo"
                  required 
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Email Address</label>
                <input 
                  type="email" 
                  value={studentForm.email} 
                  onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })}
                  placeholder="student@school.com"
                  required 
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Class</label>
                  <select 
                    value={studentForm.className} 
                    onChange={(e) => setStudentForm({ ...studentForm, className: e.target.value })}
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    <option value="JSS 1">JSS 1</option>
                    <option value="JSS 2">JSS 2</option>
                    <option value="JSS 3">JSS 3</option>
                    <option value="SSS 1">SSS 1</option>
                    <option value="SSS 2">SSS 2</option>
                    <option value="SSS 3">SSS 3</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Guardian Phone</label>
                  <input 
                    type="text" 
                    value={studentForm.guardianPhone} 
                    onChange={(e) => setStudentForm({ ...studentForm, guardianPhone: e.target.value })}
                    placeholder="08012345678"
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
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