import React, { useState } from 'react';
import { Plus, X, Calendar, User, Mail, BookOpen, Trash2, CheckCircle, Copy, AlertCircle } from 'lucide-react';

export default function StaffModule({ teachers, loading, onImportTeachers }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [copiedId, setCopiedId] = useState('');

  const [staffRows, setStaffRows] = useState([
    { fullName: '', dateOfBirth: '', email: '', subjectsTaught: '' }
  ]);

  const handleAddRow = () => {
    setStaffRows([
      ...staffRows,
      { fullName: '', dateOfBirth: '', email: '', subjectsTaught: '' }
    ]);
  };

  const handleRemoveRow = (index) => {
    if (staffRows.length === 1) return;
    setStaffRows(staffRows.filter((_, i) => i !== index));
  };

  const handleRowChange = (index, field, value) => {
    const updated = [...staffRows];
    updated[index][field] = value;
    setStaffRows(updated);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = staffRows.map((r) => ({
      fullName: r.fullName.trim(),
      dateOfBirth: r.dateOfBirth,
      email: r.email.trim(),
      subjectsTaught: r.subjectsTaught ? r.subjectsTaught.split(',').map((s) => s.trim()).filter(Boolean) : []
    }));

    onImportTeachers(payload, (createdTeachers) => {
      setImportResults(createdTeachers);
      setStaffRows([{ fullName: '', dateOfBirth: '', email: '', subjectsTaught: '' }]);
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
          <p className="text-xs text-gray-500">Official teacher roster, pre-loaded records & generated Staff IDs</p>
        </div>
        <button 
          onClick={() => { setIsModalOpen(true); setImportResults(null); }}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2.5 rounded-lg flex items-center gap-2 transition shadow"
        >
          <Plus className="h-4 w-4" /> Pre-load & Import Staff
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
                            <span key={idx} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs">
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
                    No staff records found. Click <strong>"Pre-load & Import Staff"</strong> to add teachers and generate Staff IDs.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL: STAFF IMPORT & GENERATED CODES */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center p-4 z-50 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-2xl p-6 shadow-2xl border border-gray-200 my-8">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-800">
                  {importResults ? 'Generated Staff IDs' : 'Pre-load & Import Staff'}
                </h3>
                <p className="text-xs text-gray-500">
                  {importResults
                    ? 'Distribute these Staff IDs to teachers so they can complete registration'
                    : 'Add teacher details to auto-generate official Staff IDs (PHA-STF-YYYY-NNNN)'}
                </p>
              </div>
              <button 
                onClick={() => { setIsModalOpen(false); setImportResults(null); }}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {importResults ? (
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 text-emerald-800 text-sm">
                  <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
                  <span>
                    Successfully pre-loaded {importResults.length} staff member(s). Share the generated Staff IDs below with the respective teachers:
                  </span>
                </div>

                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 border-b border-gray-200">
                      <tr>
                        <th className="p-3 font-semibold">Teacher Name</th>
                        <th className="p-3 font-semibold">Generated Staff ID</th>
                        <th className="p-3 font-semibold">Registered Email</th>
                        <th className="p-3 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {importResults.map((t, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-3 font-medium text-slate-800">{t.full_name}</td>
                          <td className="p-3 font-mono font-bold text-blue-600">{t.staff_id}</td>
                          <td className="p-3 text-slate-500">{t.email}</td>
                          <td className="p-3">
                            <button
                              type="button"
                              onClick={() => handleCopy(t.staff_id)}
                              className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 text-xs"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              {copiedId === t.staff_id ? 'Copied!' : 'Copy ID'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => { setIsModalOpen(false); setImportResults(null); }}
                    className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="max-h-96 overflow-y-auto space-y-4 pr-1">
                  {staffRows.map((row, index) => (
                    <div key={index} className="p-4 bg-slate-50 rounded-xl border border-slate-200 relative space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-700">Staff Member #{index + 1}</span>
                        {staffRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(index)}
                            className="text-red-500 hover:text-red-700 p-1"
                            title="Remove row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Full Name *</label>
                          <input
                            type="text"
                            value={row.fullName}
                            onChange={(e) => handleRowChange(index, 'fullName', e.target.value)}
                            placeholder="e.g. Mr. Babatunde Johnson"
                            required
                            className="w-full p-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Email Address *</label>
                          <input
                            type="email"
                            value={row.email}
                            onChange={(e) => handleRowChange(index, 'email', e.target.value)}
                            placeholder="teacher@school.edu.ng"
                            required
                            className="w-full p-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Date of Birth *</label>
                          <input
                            type="date"
                            value={row.dateOfBirth}
                            onChange={(e) => handleRowChange(index, 'dateOfBirth', e.target.value)}
                            required
                            className="w-full p-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Subjects Taught (comma-separated)</label>
                          <input
                            type="text"
                            value={row.subjectsTaught}
                            onChange={(e) => handleRowChange(index, 'subjectsTaught', e.target.value)}
                            placeholder="e.g. Mathematics, Physics"
                            className="w-full p-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleAddRow}
                  className="w-full py-2 border-2 border-dashed border-slate-300 hover:border-blue-500 text-slate-600 hover:text-blue-600 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition bg-white"
                >
                  <Plus className="h-4 w-4" /> Add Another Staff Row
                </button>

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
                    Generate Staff IDs ({staffRows.length})
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

