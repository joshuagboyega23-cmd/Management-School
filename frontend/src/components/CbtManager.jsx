import React, { useState, useEffect } from 'react';
import { 
  Plus, Edit, Trash2, Eye, Play, Award, FileSpreadsheet, CheckCircle, 
  Clock, ShieldAlert, Sparkles, Filter, RefreshCw, BookOpen, Layers
} from 'lucide-react';
import API from '../api';
import CbtQuestionBuilder from './CbtQuestionBuilder';
import CbtLiveBatch from './CbtLiveBatch';
import CbtResults from './CbtResults';

export default function CbtManager({ onNotify, initialView = 'list' }) {
  const [exams, setExams] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentView, setCurrentView] = useState(initialView); // 'list' | 'builder' | 'live' | 'results'
  const [selectedExam, setSelectedExam] = useState(null);

  // Filter state
  const [selectedClassFilter, setSelectedClassFilter] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('');

  // Create / Edit Exam Modal
  const [examModal, setExamModal] = useState({
    open: false,
    isEdit: false,
    examId: null,
    formData: {
      title: '',
      subject: '',
      term: 'First Term',
      class_id: '',
      duration_minutes: 60,
      total_marks: 60,
      max_leaves: 3,
      shuffle: true
    }
  });
  const [submitting, setSubmitting] = useState(false);

  // Fetch classes and exams
  const fetchClassesAndExams = async () => {
    try {
      setLoading(true);

      // Fetch exams
      const examRes = await API.get('/cbt/exams');
      setExams(Array.isArray(examRes.data?.data) ? examRes.data.data : []);

      // Fetch students to extract classes
      try {
        const studentRes = await API.get('/students');
        const studentList = Array.isArray(studentRes.data?.data) 
          ? studentRes.data.data 
          : (Array.isArray(studentRes.data) ? studentRes.data : []);
        
        const extractedClasses = [...new Map(
          studentList
            .filter((s) => s.class_id && s.class_name)
            .map((s) => [String(s.class_id), { id: s.class_id, name: s.class_name }])
        ).values()];

        if (extractedClasses.length > 0) {
          setClasses(extractedClasses);
        } else {
          // Default fallback classes
          setClasses([
            { id: 1, name: 'JSS 1' },
            { id: 2, name: 'JSS 2' },
            { id: 3, name: 'JSS 3' },
            { id: 4, name: 'SSS 1' },
            { id: 5, name: 'SSS 2' },
            { id: 6, name: 'SSS 3' }
          ]);
        }
      } catch (err) {
        // Fallback
        setClasses([
          { id: 1, name: 'JSS 1' },
          { id: 2, name: 'JSS 2' },
          { id: 3, name: 'JSS 3' },
          { id: 4, name: 'SSS 1' },
          { id: 5, name: 'SSS 2' },
          { id: 6, name: 'SSS 3' }
        ]);
      }
    } catch (err) {
      onNotify('error', err.response?.data?.message || 'Could not load exams list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClassesAndExams();
  }, []);

  // Open Create Exam
  const handleOpenCreateModal = () => {
    setExamModal({
      open: true,
      isEdit: false,
      examId: null,
      formData: {
        title: '',
        subject: '',
        term: 'First Term',
        class_id: classes[0]?.id || '',
        duration_minutes: 60,
        total_marks: 60,
        max_leaves: 3,
        shuffle: true
      }
    });
  };

  // Open Edit Exam
  const handleOpenEditModal = (exam) => {
    if (exam.status !== 'DRAFT') {
      onNotify('error', 'Exams can only be edited while in DRAFT status.');
      return;
    }
    setExamModal({
      open: true,
      isEdit: true,
      examId: exam.id,
      formData: {
        title: exam.title,
        subject: exam.subject,
        term: exam.term,
        class_id: exam.class_id,
        duration_minutes: exam.duration_minutes,
        total_marks: exam.total_marks,
        max_leaves: exam.max_leaves ?? 3,
        shuffle: Boolean(exam.shuffle)
      }
    });
  };

  // Submit Create / Edit Exam
  const handleExamFormSubmit = async (e) => {
    e.preventDefault();
    const data = examModal.formData;

    if (!data.title.trim() || !data.subject.trim() || !data.class_id) {
      onNotify('error', 'Please fill in all required fields.');
      return;
    }

    try {
      setSubmitting(true);
      if (examModal.isEdit) {
        await API.put(`/cbt/exams/${examModal.examId}`, data);
        onNotify('success', 'Exam updated successfully.');
      } else {
        await API.post('/cbt/exams', data);
        onNotify('success', 'New exam created in DRAFT status.');
      }
      setExamModal({ ...examModal, open: false });
      fetchClassesAndExams();
    } catch (err) {
      onNotify('error', err.response?.data?.message || 'Failed to save exam.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Exam
  const handleDeleteExam = async (exam) => {
    if (exam.status !== 'DRAFT') {
      onNotify('error', 'Only DRAFT exams can be deleted.');
      return;
    }
    if (!window.confirm(`Permanently delete exam "${exam.title}"?`)) return;

    try {
      setLoading(true);
      await API.delete(`/cbt/exams/${exam.id}`);
      onNotify('success', 'Exam deleted successfully.');
      fetchClassesAndExams();
    } catch (err) {
      onNotify('error', err.response?.data?.message || 'Could not delete exam.');
    } finally {
      setLoading(false);
    }
  };

  // Navigation handlers
  const handleOpenBuilder = (exam) => {
    setSelectedExam(exam);
    setCurrentView('builder');
  };

  const handleOpenLiveBatch = (exam) => {
    setSelectedExam(exam);
    setCurrentView('live');
  };

  const handleOpenResults = (exam) => {
    setSelectedExam(exam);
    setCurrentView('results');
  };

  const handleBackToList = () => {
    setCurrentView('list');
    setSelectedExam(null);
    fetchClassesAndExams();
  };

  // Render Sub-Views
  if (currentView === 'builder' && selectedExam) {
    return (
      <CbtQuestionBuilder
        exam={selectedExam}
        onBack={handleBackToList}
        onNotify={onNotify}
      />
    );
  }

  if (currentView === 'live' && selectedExam) {
    return (
      <CbtLiveBatch
        exam={selectedExam}
        onBack={handleBackToList}
        onNotify={onNotify}
      />
    );
  }

  if (currentView === 'results' && selectedExam) {
    return (
      <CbtResults
        exam={selectedExam}
        onBack={handleBackToList}
        onNotify={onNotify}
      />
    );
  }

  // Filtered exams list
  const filteredExams = exams.filter((exam) => {
    if (selectedClassFilter && String(exam.class_id) !== String(selectedClassFilter)) return false;
    if (selectedStatusFilter && exam.status !== selectedStatusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Layers className="h-6 w-6 text-blue-600" /> Computer Based Testing (CBT)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Build exams, upload questions, launch live batches with 6-digit access codes, and monitor integrity in real time.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition shrink-0"
        >
          <Plus className="h-4 w-4" /> Create New Exam
        </button>
      </div>

      {/* Filter and stats row */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <Filter className="h-4 w-4 text-slate-400" /> Filter:
          </div>

          <select
            value={selectedClassFilter}
            onChange={(e) => setSelectedClassFilter(e.target.value)}
            className="p-2 border border-slate-300 rounded-xl text-xs bg-white text-slate-700 focus:ring-blue-500"
          >
            <option value="">All Classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="p-2 border border-slate-300 rounded-xl text-xs bg-white text-slate-700 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">DRAFT</option>
            <option value="PUBLISHED">PUBLISHED</option>
            <option value="QUESTIONS_LOCKED">QUESTIONS_LOCKED</option>
            <option value="CLOSED">CLOSED</option>
          </select>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{filteredExams.length} exam{filteredExams.length === 1 ? '' : 's'}</span>
          <button
            onClick={fetchClassesAndExams}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
            title="Refresh list"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Exam Cards Grid */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 text-sm">
          <RefreshCw className="h-7 w-7 animate-spin mx-auto mb-2 text-blue-600" />
          Loading CBT exams...
        </div>
      ) : filteredExams.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <BookOpen className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700">No Exams Found</h3>
          <p className="text-xs text-slate-400 mt-1 mb-5">
            Create your first CBT exam or adjust your active filters above.
          </p>
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition"
          >
            <Plus className="h-4 w-4" /> Create New Exam
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredExams.map((exam) => (
            <div
              key={exam.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition flex flex-col justify-between overflow-hidden"
            >
              <div className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold tracking-wide uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                      {exam.subject}
                    </span>
                    <h3 className="text-base font-bold text-slate-800 mt-1 leading-snug">
                      {exam.title}
                    </h3>
                  </div>

                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                    exam.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-800' :
                    exam.status === 'QUESTIONS_LOCKED' ? 'bg-purple-100 text-purple-800' :
                    exam.status === 'CLOSED' ? 'bg-slate-200 text-slate-700' :
                    'bg-amber-100 text-amber-800'
                  }`}>
                    {exam.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <div>
                    <span className="text-slate-400 text-[11px] block">Class & Term</span>
                    <span className="font-semibold">{exam.class_name || `Class ${exam.class_id}`} • {exam.term}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px] block">Duration & Marks</span>
                    <span className="font-semibold">{exam.duration_minutes}m • {exam.total_marks} marks</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px] block">Max Tab Leaves</span>
                    <span className="font-semibold text-red-600">{exam.max_leaves ?? 3} leaves allowed</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px] block">Questions</span>
                    <span className="font-semibold">{exam.question_count || 0} questions</span>
                  </div>
                </div>
              </div>

              {/* Action buttons footer */}
              <div className="bg-slate-50/80 p-3.5 border-t border-slate-100 flex items-center justify-between gap-1 flex-wrap">
                <div className="flex items-center gap-1">
                  {/* Question Builder / Preview */}
                  <button
                    onClick={() => handleOpenBuilder(exam)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition shadow-2xs"
                    title="Upload & Preview Questions"
                  >
                    <Eye className="h-3.5 w-3.5 text-blue-600" /> Questions
                  </button>

                  {/* Start / Live Batch */}
                  {['PUBLISHED', 'QUESTIONS_LOCKED'].includes(exam.status) && (
                    <button
                      onClick={() => handleOpenLiveBatch(exam)}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition"
                      title="Manage Live Batch & Monitor Students"
                    >
                      <Play className="h-3.5 w-3.5 text-emerald-600" /> Batch
                    </button>
                  )}

                  {/* View Results */}
                  <button
                    onClick={() => handleOpenResults(exam)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition shadow-2xs"
                    title="View Scores & Release Questions"
                  >
                    <Award className="h-3.5 w-3.5 text-amber-600" /> Results
                  </button>
                </div>

                {/* Edit / Delete for DRAFT only */}
                {exam.status === 'DRAFT' && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditModal(exam)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      title="Edit Exam"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteExam(exam)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="Delete Exam"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Exam Modal */}
      {examModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-blue-600" />
                {examModal.isEdit ? 'Edit Exam' : 'Create New CBT Exam'}
              </h3>
              <button
                onClick={() => setExamModal({ ...examModal, open: false })}
                className="text-slate-400 hover:text-slate-700 text-base font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleExamFormSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Exam Title *</label>
                <input
                  type="text"
                  value={examModal.formData.title}
                  onChange={(e) => setExamModal({
                    ...examModal,
                    formData: { ...examModal.formData, title: e.target.value }
                  })}
                  placeholder="e.g. First Term Mid-Term Mathematics Examination"
                  required
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Subject *</label>
                  <input
                    type="text"
                    value={examModal.formData.subject}
                    onChange={(e) => setExamModal({
                      ...examModal,
                      formData: { ...examModal.formData, subject: e.target.value }
                    })}
                    placeholder="e.g. Mathematics"
                    required
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Term *</label>
                  <select
                    value={examModal.formData.term}
                    onChange={(e) => setExamModal({
                      ...examModal,
                      formData: { ...examModal.formData, term: e.target.value }
                    })}
                    required
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-white"
                  >
                    <option value="First Term">First Term</option>
                    <option value="Second Term">Second Term</option>
                    <option value="Third Term">Third Term</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Class *</label>
                  <select
                    value={examModal.formData.class_id}
                    onChange={(e) => setExamModal({
                      ...examModal,
                      formData: { ...examModal.formData, class_id: e.target.value }
                    })}
                    required
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-white"
                  >
                    <option value="">-- Choose Class --</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Duration (minutes) *</label>
                  <input
                    type="number"
                    min="5"
                    max="240"
                    value={examModal.formData.duration_minutes}
                    onChange={(e) => setExamModal({
                      ...examModal,
                      formData: { ...examModal.formData, duration_minutes: Number(e.target.value) }
                    })}
                    required
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Total Marks *</label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={examModal.formData.total_marks}
                    onChange={(e) => setExamModal({
                      ...examModal,
                      formData: { ...examModal.formData, total_marks: Number(e.target.value) }
                    })}
                    required
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                  />
                </div>

                {/* Maximum tab leaves before auto-submit */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Max Tab Leaves (Auto-Submit) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={examModal.formData.max_leaves}
                    onChange={(e) => setExamModal({
                      ...examModal,
                      formData: { ...examModal.formData, max_leaves: Number(e.target.value) }
                    })}
                    required
                    className="w-full p-2.5 border border-red-300 bg-red-50/20 text-red-900 rounded-xl text-xs font-bold"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Default 3 (Range: 1–20)</span>
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={examModal.formData.shuffle}
                    onChange={(e) => setExamModal({
                      ...examModal,
                      formData: { ...examModal.formData, shuffle: e.target.checked }
                    })}
                    className="h-4 w-4 text-blue-600 rounded-sm border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  Shuffle question and option order per student
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setExamModal({ ...examModal, open: false })}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                >
                  {submitting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                  {examModal.isEdit ? 'Update Exam' : 'Create Exam'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

