import React, { useState, useEffect } from 'react';
import { 
  Award, Download, CheckSquare, Square, CheckCircle, XCircle, Clock, 
  AlertTriangle, ArrowLeft, RefreshCw, Key, HelpCircle, FileSpreadsheet,
  Eye, Check, ShieldAlert
} from 'lucide-react';
import * as XLSX from 'xlsx';
import API from '../api';
import CbtMathView from './CbtMathView';

export default function CbtResults({ exam, onBack, onNotify }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [releasing, setReleasing] = useState(false);

  // Student detailed attempt review drawer/modal
  const [reviewModal, setReviewModal] = useState({ open: false, attemptId: null, data: null, loading: false });

  // Answer key correction modal
  const [correctKeyModal, setCorrectKeyModal] = useState({ open: false, question: null, newLabel: '', reason: '' });
  const [submittingKey, setSubmittingKey] = useState(false);

  const fetchResults = async () => {
    if (!exam?.id) return;
    try {
      setLoading(true);
      const res = await API.get(`/cbt/exams/${exam.id}/students`);
      setStudents(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      onNotify('error', err.response?.data?.message || 'Could not fetch exam results.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
  }, [exam?.id]);

  // Open detailed student attempt view
  const handleOpenStudentReview = async (student) => {
    if (!student.attempt_id) {
      onNotify('error', `${student.full_name} has not started or submitted an attempt yet.`);
      return;
    }

    setReviewModal({ open: true, attemptId: student.attempt_id, data: null, loading: true });
    try {
      const res = await API.get(`/cbt/attempts/${student.attempt_id}/details`);
      setReviewModal({ open: true, attemptId: student.attempt_id, data: res.data?.data, loading: false });
    } catch (err) {
      onNotify('error', err.response?.data?.message || 'Could not load student attempt details.');
      setReviewModal({ open: false, attemptId: null, data: null, loading: false });
    }
  };

  // Toggle selection for release
  const handleToggleSelect = (studentId) => {
    setSelectedStudentIds(prev => 
      prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]
    );
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedStudentIds(students.map(s => s.student_id));
    } else {
      setSelectedStudentIds([]);
    }
  };

  // Release / Unrelease questions
  const handleReleaseQuestions = async (doRelease = true) => {
    if (selectedStudentIds.length === 0) {
      onNotify('error', 'Select at least one student to update question release settings.');
      return;
    }

    try {
      setReleasing(true);
      const res = await API.post(`/cbt/exams/${exam.id}/release-questions`, {
        student_ids: selectedStudentIds,
        release: doRelease
      });
      onNotify('success', res.data?.message || 'Question release settings updated.');
      setSelectedStudentIds([]);
      await fetchResults();
    } catch (err) {
      onNotify('error', err.response?.data?.message || 'Failed to update question release.');
    } finally {
      setReleasing(false);
    }
  };

  // Export results to Excel (.xlsx)
  const handleExportToExcel = () => {
    try {
      const rows = students.map((s) => ({
        'Admission Number': s.admission_number,
        'Student Name': s.full_name,
        'Status': s.status,
        'Score': s.score !== null ? Number(s.score) : 'N/A',
        'Total Marks': exam.total_marks,
        'Correct Answers': s.correct_count !== null ? Number(s.correct_count) : 'N/A',
        'Total Tab Leaves': s.tab_leave_count || 0,
        'Submission Type': s.submit_type || (s.status === 'SUBMITTED' ? 'MANUAL' : 'N/A'),
        'Auto-Submitted For Leaving': s.submit_type === 'AUTO_LEAVES' ? 'YES' : 'NO',
        'Questions Released': s.is_released ? 'YES' : 'NO',
        'Submitted At': s.attempt_submitted_at ? new Date(s.attempt_submitted_at).toLocaleString() : 'N/A'
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Exam Results');
      
      const filename = `${exam.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_results.xlsx`;
      XLSX.writeFile(wb, filename);
      onNotify('success', `Results exported to ${filename}`);
    } catch (err) {
      onNotify('error', 'Could not generate Excel export file.');
    }
  };

  // Correct answer key submit
  const handleCorrectKeySubmit = async (e) => {
    e.preventDefault();
    if (!correctKeyModal.question || !correctKeyModal.newLabel || !correctKeyModal.reason.trim()) {
      onNotify('error', 'Please choose a correct label and give a reason.');
      return;
    }

    try {
      setSubmittingKey(true);
      const res = await API.post(`/cbt/questions/${correctKeyModal.question.id}/correct-key`, {
        new_label: correctKeyModal.newLabel,
        reason: correctKeyModal.reason.trim()
      });
      onNotify('success', res.data?.message || 'Answer key corrected and all student scores re-marked!');
      setCorrectKeyModal({ open: false, question: null, newLabel: '', reason: '' });
      await fetchResults();
      if (reviewModal.attemptId) {
        // Refresh open student review
        const updatedRes = await API.get(`/cbt/attempts/${reviewModal.attemptId}/details`);
        setReviewModal(prev => ({ ...prev, data: updatedRes.data?.data }));
      }
    } catch (err) {
      onNotify('error', err.response?.data?.message || 'Could not update answer key.');
    } finally {
      setSubmittingKey(false);
    }
  };

  const submittedStudents = students.filter(s => s.status === 'SUBMITTED');
  const avgScore = submittedStudents.length > 0
    ? (submittedStudents.reduce((acc, s) => acc + Number(s.score || 0), 0) / submittedStudents.length).toFixed(1)
    : '—';

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
            title="Back to Exam List"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-800">{exam.title} — Results</h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800">
                {submittedStudents.length} / {students.length} Submitted
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {exam.subject} • {exam.term} • Total Marks: {exam.total_marks} • Class Average: {avgScore}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleExportToExcel}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-bold transition shadow-2xs"
          >
            <Download className="h-4 w-4" /> Export to Excel (.xlsx)
          </button>

          <button
            onClick={() => handleReleaseQuestions(true)}
            disabled={releasing || selectedStudentIds.length === 0}
            className={`flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs ${
              selectedStudentIds.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            title="Allow selected students to view questions and answers"
          >
            <CheckSquare className="h-4 w-4" /> Release Questions ({selectedStudentIds.length})
          </button>

          <button
            onClick={() => handleReleaseQuestions(false)}
            disabled={releasing || selectedStudentIds.length === 0}
            className={`flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition ${
              selectedStudentIds.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            Unrelease
          </button>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Award className="h-5 w-5 text-blue-600" /> Student Score Breakdown
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Click a student's name to view their full answer sheet, question comparisons, and leave events.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <input
                type="checkbox"
                checked={selectedStudentIds.length > 0 && selectedStudentIds.length === students.length}
                onChange={handleSelectAll}
                className="h-4 w-4 text-blue-600 rounded-sm border-slate-300 focus:ring-blue-500 cursor-pointer"
              />
              Select All for Release
            </label>
            <button
              onClick={fetchResults}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
              title="Refresh results"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-600" />
            Loading results...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-y border-slate-200">
                <tr>
                  <th className="p-3 w-10">Select</th>
                  <th className="p-3">Student Name</th>
                  <th className="p-3">Admission No</th>
                  <th className="p-3">Status & Mode</th>
                  <th className="p-3 text-center">Tab Leaves</th>
                  <th className="p-3 text-right">Score</th>
                  <th className="p-3 text-center">Questions Released</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {students.map((student) => {
                  const isSelected = selectedStudentIds.includes(student.student_id);
                  const isAutoLeaves = student.submit_type === 'AUTO_LEAVES';

                  return (
                    <tr
                      key={student.student_id}
                      className="hover:bg-slate-50/80 transition"
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(student.student_id)}
                          className="h-4 w-4 text-blue-600 rounded-sm border-slate-300 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => handleOpenStudentReview(student)}
                          className="font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1.5 text-left"
                          title="Click to view detailed answer sheet"
                        >
                          {student.full_name}
                        </button>
                      </td>
                      <td className="p-3 font-mono text-slate-700">
                        {student.admission_number}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            student.status === 'SUBMITTED' ? 'bg-emerald-100 text-emerald-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {student.status}
                          </span>
                          {isAutoLeaves && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-[10px] font-bold flex items-center gap-1 border border-red-300">
                              <AlertTriangle className="h-3 w-3" /> Auto-Submitted (Leaves)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-bold ${
                          student.tab_leave_count >= 1
                            ? 'bg-red-100 text-red-700 font-extrabold'
                            : 'text-slate-500'
                        }`}>
                          {student.tab_leave_count || 0}
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold text-sm text-slate-800">
                        {student.score !== null ? (
                          <span>
                            {student.score} <span className="text-slate-400 text-xs font-normal">/ {exam.total_marks}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">Not Submitted</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {student.is_released ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                            <Check className="h-3 w-3" /> Released
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Hidden</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Student Detailed Review Modal (Shows questions, answers, and leave events) */}
      {reviewModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-3xl w-full shadow-2xl border border-slate-200 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Award className="h-5 w-5 text-blue-600" />
                  {reviewModal.data?.student?.full_name || 'Student Attempt Review'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Admission: {reviewModal.data?.student?.admission_number} • Class: {reviewModal.data?.student?.class_name}
                </p>
              </div>

              <button
                onClick={() => setReviewModal({ open: false, attemptId: null, data: null, loading: false })}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            {reviewModal.loading ? (
              <div className="py-16 text-center text-slate-400 text-sm">
                <RefreshCw className="h-7 w-7 animate-spin mx-auto mb-2 text-blue-600" />
                Loading detailed answer sheet...
              </div>
            ) : reviewModal.data ? (
              <div className="space-y-6">
                {/* Score Summary Box */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div>
                    <span className="text-[11px] text-slate-400 font-semibold uppercase">Final Score</span>
                    <p className="text-lg font-extrabold text-blue-700">
                      {reviewModal.data.attempt.score} / {reviewModal.data.exam?.total_marks}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 font-semibold uppercase">Correct Answers</span>
                    <p className="text-lg font-bold text-emerald-700">
                      {reviewModal.data.attempt.correct_count} / {reviewModal.data.questions?.length}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 font-semibold uppercase">Submit Type</span>
                    <p className={`text-sm font-bold mt-1 ${
                      reviewModal.data.attempt.submit_type === 'AUTO_LEAVES' ? 'text-red-600' : 'text-slate-700'
                    }`}>
                      {reviewModal.data.attempt.submit_type}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 font-semibold uppercase">Total Tab Leaves</span>
                    <p className={`text-lg font-bold ${
                      (reviewModal.data.leave_events || []).length > 0 ? 'text-red-600' : 'text-slate-700'
                    }`}>
                      {(reviewModal.data.leave_events || []).length}
                    </p>
                  </div>
                </div>

                {/* Auto-submitted warning banner if applicable */}
                {reviewModal.data.attempt.submit_type === 'AUTO_LEAVES' && (
                  <div className="p-4 bg-red-50 border border-red-300 rounded-2xl flex items-start gap-3 text-xs text-red-800">
                    <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-sm">Exam Auto-Submitted For Leaving Screen</p>
                      <p className="mt-0.5 text-red-700">
                        This student reached the limit of {reviewModal.data.exam?.max_leaves ?? 3} allowed tab leaves. The server automatically locked and graded their attempt at the exact moment of their final violation.
                      </p>
                    </div>
                  </div>
                )}

                {/* Tab Leave Event History */}
                {(reviewModal.data.leave_events || []).length > 0 && (
                  <div className="space-y-2 border border-slate-200 rounded-2xl p-4 bg-white">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-red-600" /> Recorded Tab-Leave Violations
                    </h4>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {reviewModal.data.leave_events.map((ev, i) => (
                        <div
                          key={ev.id || i}
                          className="flex items-center justify-between text-xs p-2 bg-red-50/60 rounded-xl border border-red-100 text-slate-700"
                        >
                          <span className="font-semibold text-red-800">
                            Violation #{i + 1}: {ev.event_type}
                          </span>
                          <span className="text-slate-500 font-mono text-[11px]">
                            {new Date(ev.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Question-by-Question Review */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-800">Question Answer Review</h4>
                    <span className="text-xs text-slate-400">Green = Correct, Red = Student Pick</span>
                  </div>

                  <div className="space-y-4">
                    {(reviewModal.data.questions || []).map((q, idx) => {
                      const isCorrect = q.is_correct;
                      const hasAnswered = Boolean(q.selected_label);

                      return (
                        <div
                          key={q.id}
                          className={`p-4 rounded-2xl border transition ${
                            isCorrect
                              ? 'border-emerald-200 bg-emerald-50/30'
                              : hasAnswered
                              ? 'border-red-200 bg-red-50/30'
                              : 'border-slate-200 bg-slate-50/30'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5">
                              <span className={`w-6 h-6 rounded-md font-bold text-xs flex items-center justify-center shrink-0 ${
                                isCorrect ? 'bg-emerald-600 text-white' : hasAnswered ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-700'
                              }`}>
                                {q.question_number || idx + 1}
                              </span>
                              <div className="text-xs font-semibold text-slate-800">
                                <CbtMathView text={q.question_text} />
                              </div>
                            </div>

                            <button
                              onClick={() => setCorrectKeyModal({ open: true, question: q, newLabel: q.correct_label || '', reason: '' })}
                              className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-lg transition shrink-0"
                            >
                              Correct Key
                            </button>
                          </div>

                          {/* Options */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pl-8">
                            {(q.options || []).map((opt) => {
                              const isStudentPick = q.selected_label === opt.label;
                              const isCorrectKey = q.correct_label === opt.label;

                              return (
                                <div
                                  key={opt.id}
                                  className={`p-2 rounded-xl border text-xs flex items-center justify-between ${
                                    isCorrectKey
                                      ? 'bg-emerald-100 border-emerald-400 font-bold text-emerald-900'
                                      : isStudentPick
                                      ? 'bg-red-100 border-red-400 font-bold text-red-900'
                                      : 'bg-white border-slate-200 text-slate-700'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold bg-white/80">
                                      {opt.label}
                                    </span>
                                    <CbtMathView text={opt.option_text} />
                                  </div>

                                  <div className="text-[10px] flex items-center gap-1 font-bold">
                                    {isCorrectKey && <span className="text-emerald-700">✓ KEY</span>}
                                    {isStudentPick && !isCorrectKey && <span className="text-red-700">✗ STUDENT</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Answer Key Correction Modal */}
      {correctKeyModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Key className="h-5 w-5 text-amber-600" /> Correct Answer Key
              </h3>
              <button
                onClick={() => setCorrectKeyModal({ open: false, question: null, newLabel: '', reason: '' })}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Change the correct key for Question #{correctKeyModal.question?.question_number}. The server will automatically re-score all students' attempts.
            </p>

            <form onSubmit={handleCorrectKeySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select New Key</label>
                <div className="grid grid-cols-4 gap-2">
                  {['A', 'B', 'C', 'D'].map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setCorrectKeyModal({ ...correctKeyModal, newLabel: label })}
                      className={`py-2 text-xs font-bold rounded-xl border transition ${
                        correctKeyModal.newLabel === label
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for correction</label>
                <textarea
                  value={correctKeyModal.reason}
                  onChange={(e) => setCorrectKeyModal({ ...correctKeyModal, reason: e.target.value })}
                  placeholder="e.g. Typo in question sheet key"
                  required
                  rows={3}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCorrectKeyModal({ open: false, question: null, newLabel: '', reason: '' })}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingKey}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                >
                  {submittingKey ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                  Confirm & Re-score
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

