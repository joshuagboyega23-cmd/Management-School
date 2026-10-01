import React, { useEffect, useState } from 'react';
import { Download, Pencil, Trash2 } from 'lucide-react';
import API from '../opi';
import { downloadReportCardPDF } from '../utils/pdfUtils';

const filterStudentsByClass = (list, selectedClass) => {
  if (!selectedClass) return list;
  return list.filter((student) => String(student.class_id) === String(selectedClass));
};

export default function ReportsModule({ students, onSubmitGrade, onFetchReportCard, reportData }) {
  const [gradeClass, setGradeClass] = useState('');
  const [gradeForm, setGradeForm] = useState({
    studentId: '',
    term: 'First Term',
    subject: 'Mathematics',
    caScore: '',
    examScore: ''
  });

  const [viewClass, setViewClass] = useState('');
  const [reportView, setReportView] = useState({ studentId: '' });
  const [bulkClassId, setBulkClassId] = useState('');
  const [bulkSubject, setBulkSubject] = useState('Mathematics');
  const [bulkTerm, setBulkTerm] = useState('First Term');
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSummary, setBulkSummary] = useState(null);
  const [editingRowId, setEditingRowId] = useState(null);
  const [editForm, setEditForm] = useState({ caScore: '', examScore: '' });

  const studentList = Array.isArray(students) ? students : [];
  const reportList = Array.isArray(reportData) ? reportData : [];
  const classOptions = [...new Map(
    studentList
      .filter((student) => student.class_id && student.class_name)
      .map((student) => [String(student.class_id), { id: student.class_id, name: student.class_name }])
  ).values()];

  const filteredGradeStudents = filterStudentsByClass(studentList, gradeClass);
  const filteredViewStudents = filterStudentsByClass(studentList, viewClass);
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch (error) {
      return {};
    }
  })();

  const loadBulkRows = async (classId, subject, term) => {
    if (!classId || !subject || !term) {
      setBulkRows([]);
      return;
    }
    setBulkLoading(true);
    try {
      const classStudents = filterStudentsByClass(studentList, classId);
      const rows = await Promise.all(classStudents.map(async (student) => {
        try {
          const res = await API.get(`/report-cards/student/${student.id}`);
          const existing = (Array.isArray(res.data?.data) ? res.data.data : []).find(
            (record) => record.subject === subject && record.term === term
          );
          return {
            studentId: student.id,
            studentName: student.name,
            caScore: existing ? String(existing.ca_score ?? '') : '',
            examScore: existing ? String(existing.exam_score ?? '') : '',
            existing: existing || null
          };
        } catch (error) {
          return { studentId: student.id, studentName: student.name, caScore: '', examScore: '', existing: null };
        }
      }));
      setBulkRows(rows);
    } finally {
      setBulkLoading(false);
    }
  };

  useEffect(() => {
    if (bulkClassId && bulkSubject && bulkTerm) {
      void loadBulkRows(bulkClassId, bulkSubject, bulkTerm);
    } else {
      setBulkRows([]);
    }
  }, [bulkClassId, bulkSubject, bulkTerm, studentList]);

  const handleGradeSubmit = (e) => {
    e.preventDefault();
    onSubmitGrade({
      ...gradeForm,
      studentId: Number(gradeForm.studentId),
      caScore: Number(gradeForm.caScore),
      examScore: Number(gradeForm.examScore)
    }, () => {
      setGradeForm({ ...gradeForm, caScore: '', examScore: '' });
    });
  };

  const handleFetchReport = (e) => {
    e.preventDefault();
    if (!reportView.studentId) return;
    onFetchReportCard(reportView.studentId);
  };

  const handleBulkSave = async () => {
    if (!bulkClassId || !bulkSubject || !bulkTerm) return;
    const entries = bulkRows
      .filter((row) => !row.existing)
      .map((row) => ({
        studentId: Number(row.studentId),
        caScore: Number(row.caScore || 0),
        examScore: Number(row.examScore || 0)
      }));

    if (entries.length === 0) {
      setBulkSummary({ saved: 0, skipped: bulkRows.length, skippedStudents: bulkRows.map((row) => row.studentName) });
      return;
    }

    try {
      const res = await API.post('/report-cards/bulk', {
        classId: Number(bulkClassId),
        subject: bulkSubject,
        term: bulkTerm,
        entries
      });
      setBulkSummary(res.data?.summary || { saved: 0, skipped: 0, skippedStudents: [] });
      await loadBulkRows(bulkClassId, bulkSubject, bulkTerm);
    } catch (error) {
      setBulkSummary({
        saved: 0,
        skipped: 0,
        skippedStudents: [],
        error: error.response?.data?.message || 'Could not save the grade sheet.'
      });
    }
  };

  const startEdit = (row) => {
    setEditingRowId(row.id);
    setEditForm({ caScore: row.ca_score ?? '', examScore: row.exam_score ?? '' });
  };

  const saveInlineEdit = async (rowId) => {
    try {
      await API.patch(`/report-cards/${rowId}`, {
        caScore: Number(editForm.caScore),
        examScore: Number(editForm.examScore)
      });
      setEditingRowId(null);
      if (reportView.studentId) onFetchReportCard(reportView.studentId);
    } catch (error) {
      setBulkSummary({ error: error.response?.data?.message || 'Could not update the grade.' });
    }
  };

  const deleteInlineGrade = async (rowId, subject, term) => {
    const confirmText = `Remove ${subject} for ${term}? This cannot be undone.`;
    if (!window.confirm(confirmText)) return;
    try {
      await API.delete(`/report-cards/${rowId}`);
      if (reportView.studentId) onFetchReportCard(reportView.studentId);
    } catch (error) {
      setBulkSummary({ error: error.response?.data?.message || 'Could not delete the grade.' });
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Record Subject Assessment</h3>
          <form onSubmit={handleGradeSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">1. Select Class</label>
                <select
                  value={gradeClass}
                  onChange={(e) => {
                    setGradeClass(e.target.value);
                    setGradeForm({ ...gradeForm, studentId: '' });
                  }}
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">-- All Classes (JSS1 - SS3) --</option>
                  {classOptions.map((classItem) => (
                    <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">2. Select Student</label>
                <select
                  value={gradeForm.studentId}
                  onChange={(e) => setGradeForm({ ...gradeForm, studentId: e.target.value })}
                  required
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">-- Choose Student --</option>
                  {filteredGradeStudents.length === 0 && gradeClass ? (
                    <option value="" disabled>No students in this class</option>
                  ) : filteredGradeStudents.map((student) => (
                    <option key={student.id} value={student.id}>{student.name} ({student.class_name || 'No Class'})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Term</label>
                <select
                  value={gradeForm.term}
                  onChange={(e) => setGradeForm({ ...gradeForm, term: e.target.value })}
                  required
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="First Term">First Term</option>
                  <option value="Second Term">Second Term</option>
                  <option value="Third Term">Third Term</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Subject</label>
                <input
                  type="text"
                  value={gradeForm.subject}
                  onChange={(e) => setGradeForm({ ...gradeForm, subject: e.target.value })}
                  required
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">CA Score (Max 40)</label>
                <input
                  type="number"
                  max="40"
                  min="0"
                  value={gradeForm.caScore}
                  onChange={(e) => setGradeForm({ ...gradeForm, caScore: e.target.value })}
                  required
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Exam Score (Max 60)</label>
                <input
                  type="number"
                  max="60"
                  min="0"
                  value={gradeForm.examScore}
                  onChange={(e) => setGradeForm({ ...gradeForm, examScore: e.target.value })}
                  required
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <button type="submit" className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition">
              Submit Grade Record
            </button>
          </form>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-800">View Student Report Card</h3>
            {reportList.length > 0 && (() => {
              const sel = studentList.find((s) => String(s.id) === String(reportView.studentId));
              return (
                <button
                  onClick={() => downloadReportCardPDF(sel, reportList)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition"
                >
                  <Download className="h-3.5 w-3.5" /> Download PDF
                </button>
              );
            })()}
          </div>
          <form onSubmit={handleFetchReport} className="space-y-3 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">1. Select Class</label>
                <select
                  value={viewClass}
                  onChange={(e) => {
                    setViewClass(e.target.value);
                    setReportView({ studentId: '' });
                  }}
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">-- All Classes (JSS1 - SS3) --</option>
                  {classOptions.map((classItem) => (
                    <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">2. Select Student</label>
                <select
                  value={reportView.studentId}
                  onChange={(e) => setReportView({ studentId: e.target.value })}
                  required
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">-- Choose Student --</option>
                  {filteredViewStudents.length === 0 && viewClass ? (
                    <option value="" disabled>No students in this class</option>
                  ) : filteredViewStudents.map((student) => (
                    <option key={student.id} value={student.id}>{student.name} ({student.class_name || 'No Class'})</option>
                  ))}
                </select>
              </div>
            </div>
            <button type="submit" className="w-full bg-slate-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-700 transition">
              Fetch Report Card
            </button>
          </form>

          {reportList.length > 0 ? (
            <table className="w-full text-left border-collapse text-xs bg-white rounded border border-gray-200">
              <thead>
                <tr className="border-b bg-gray-100">
                  <th className="p-2">Subject</th>
                  <th className="p-2">Term</th>
                  <th className="p-2">CA</th>
                  <th className="p-2">Exam</th>
                  <th className="p-2">Total</th>
                  <th className="p-2">Grade</th>
                  {currentUser.role && ['TEACHER', 'ADMIN', 'SUPERADMIN'].includes(currentUser.role) && <th className="p-2">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {reportList.map((s, idx) => (
                  <tr key={idx} className="border-b align-top">
                    <td className="p-2 font-medium">{s.subject}</td>
                    <td className="p-2">{s.term}</td>
                    <td className="p-2">{editingRowId === s.id ? <input type="number" value={editForm.caScore} onChange={(e) => setEditForm({ ...editForm, caScore: e.target.value })} className="w-20 border border-gray-300 rounded px-2 py-1" /> : s.ca_score}</td>
                    <td className="p-2">{editingRowId === s.id ? <input type="number" value={editForm.examScore} onChange={(e) => setEditForm({ ...editForm, examScore: e.target.value })} className="w-20 border border-gray-300 rounded px-2 py-1" /> : s.exam_score}</td>
                    <td className="p-2 font-bold">{s.total_score}</td>
                    <td className="p-2 text-blue-600 font-bold">{s.grade}</td>
                    {currentUser.role && ['TEACHER', 'ADMIN', 'SUPERADMIN'].includes(currentUser.role) && (
                      <td className="p-2">
                        {editingRowId === s.id ? (
                          <div className="flex gap-2">
                            <button type="button" onClick={() => saveInlineEdit(s.id)} className="text-xs bg-blue-600 text-white px-2 py-1 rounded">Save</button>
                            <button type="button" onClick={() => setEditingRowId(null)} className="text-xs border border-gray-300 px-2 py-1 rounded">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button type="button" onClick={() => startEdit(s)} className="border border-gray-300 rounded p-1 text-slate-700" title="Edit grade"><Pencil className="h-3.5 w-3.5" /></button>
                            <button type="button" onClick={() => deleteInlineGrade(s.id, s.subject, s.term)} className="border border-red-200 rounded p-1 text-red-600" title="Delete grade"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : reportData && (
            <p className="text-xs text-gray-500 italic py-2">No grades recorded yet for this student.</p>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Grade Sheet</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <select value={bulkClassId} onChange={(e) => setBulkClassId(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white">
            <option value="">Select class</option>
            {classOptions.map((classItem) => (
              <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
            ))}
          </select>
          <input type="text" value={bulkSubject} onChange={(e) => setBulkSubject(e.target.value)} placeholder="Subject" className="w-full p-2.5 border border-gray-300 rounded-lg text-sm" />
          <select value={bulkTerm} onChange={(e) => setBulkTerm(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white">
            <option value="First Term">First Term</option>
            <option value="Second Term">Second Term</option>
            <option value="Third Term">Third Term</option>
          </select>
        </div>

        {bulkSummary && (
          <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${bulkSummary.error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
            {bulkSummary.error ? bulkSummary.error : `${bulkSummary.saved ?? 0} saved, ${bulkSummary.skipped ?? 0} skipped${bulkSummary.skippedStudents?.length ? ` (${bulkSummary.skippedStudents.join(', ')})` : ''}`}
          </div>
        )}

        {bulkLoading ? (
          <p className="text-sm text-slate-500">Loading grade sheet…</p>
        ) : bulkRows.length > 0 ? (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2">Student</th>
                  <th className="p-2">CA</th>
                  <th className="p-2">Exam</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {bulkRows.map((row) => (
                  <tr key={row.studentId} className="border-t border-slate-200">
                    <td className="p-2 font-medium">{row.studentName}</td>
                    <td className="p-2">
                      {row.existing ? (
                        <span className="text-slate-500">{row.caScore}</span>
                      ) : (
                        <input type="number" value={row.caScore} min="0" max="40" onChange={(e) => setBulkRows((current) => current.map((item) => item.studentId === row.studentId ? { ...item, caScore: e.target.value } : item))} className="w-20 border border-slate-300 rounded px-2 py-1" />
                      )}
                    </td>
                    <td className="p-2">
                      {row.existing ? (
                        <span className="text-slate-500">{row.examScore}</span>
                      ) : (
                        <input type="number" value={row.examScore} min="0" max="60" onChange={(e) => setBulkRows((current) => current.map((item) => item.studentId === row.studentId ? { ...item, examScore: e.target.value } : item))} className="w-20 border border-slate-300 rounded px-2 py-1" />
                      )}
                    </td>
                    <td className="p-2">
                      {row.existing ? (
                        <span className="text-amber-700 text-xs font-semibold">already recorded — use edit to change</span>
                      ) : (
                        <span className="text-emerald-700 text-xs font-semibold">ready to save</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : bulkClassId ? (
          <p className="text-sm text-slate-500">No students found in this class.</p>
        ) : (
          <p className="text-sm text-slate-500">Choose a class to load the grade sheet.</p>
        )}

        <button type="button" onClick={handleBulkSave} disabled={!bulkClassId || bulkLoading} className="mt-4 rounded-lg bg-blue-600 text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
          Save All
        </button>
      </div>
    </div>
  );
}