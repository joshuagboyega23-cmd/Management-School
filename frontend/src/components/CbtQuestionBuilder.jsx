import React, { useState, useEffect, useRef } from 'react';
import { 
  FileSpreadsheet, Download, Upload, Image as ImageIcon, Eye, CheckCircle, 
  AlertCircle, ArrowLeft, Key, RefreshCw, Sparkles, HelpCircle 
} from 'lucide-react';
import API from '../api';
import CbtMathView from './CbtMathView';

export default function CbtQuestionBuilder({ exam, onBack, onNotify }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [showKeys, setShowKeys] = useState(true);
  const [activeTab, setActiveTab] = useState('preview'); // 'preview' | 'upload'
  const [correctKeyModal, setCorrectKeyModal] = useState({ open: false, question: null, newLabel: '', reason: '' });
  const [submittingKey, setSubmittingKey] = useState(false);

  const fileInputRef = useRef(null);

  const fetchQuestions = async () => {
    if (!exam?.id) return;
    try {
      setLoading(true);
      const res = await API.get(`/cbt/exams/${exam.id}`);
      const questions = Array.isArray(res.data?.data?.questions) ? res.data.data.questions : [];
      setQuestions(questions.map((q) => ({
        ...q,
        question_text: q.body_text ?? q.question_text ?? ''
      })));
    } catch (err) {
      onNotify('error', err.response?.data?.message || 'Could not load exam questions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, [exam?.id]);

  const handleDownloadTemplate = async () => {
    try {
      const res = await API.get('/cbt/exams/template', { responseType: 'blob' });
      const blob = new Blob([res.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cbt_exam_template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      onNotify('success', 'Excel template downloaded successfully.');
    } catch (err) {
      onNotify('error', err.response?.data?.message || 'Could not download Excel template.');
    }
  };

  const handleExcelUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx')) {
      setUploadError('Only .xlsx files are supported. Please download the official template.');
      return;
    }

    setUploadError('');
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await API.post(`/cbt/exams/${exam.id}/upload-questions`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onNotify('success', res.data?.message || 'Questions uploaded successfully.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchQuestions();
      setActiveTab('preview');
    } catch (err) {
      const msg = err.response?.data?.message || 'Upload failed. Check template structure.';
      setUploadError(msg);
      onNotify('error', msg);
    } finally {
      setUploading(false);
    }
  };

  const handleQuestionImageUpload = async (questionId, file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);

    try {
      setLoading(true);
      await API.post(`/cbt/questions/${questionId}/image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onNotify('success', 'Question image updated successfully.');
      fetchQuestions();
    } catch (err) {
      onNotify('error', err.response?.data?.message || 'Failed to upload question image.');
    } finally {
      setLoading(false);
    }
  };

  const handleOptionImageUpload = async (optionId, file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);

    try {
      setLoading(true);
      await API.post(`/cbt/options/${optionId}/image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onNotify('success', 'Option image updated successfully.');
      fetchQuestions();
    } catch (err) {
      onNotify('error', err.response?.data?.message || 'Failed to upload option image.');
    } finally {
      setLoading(false);
    }
  };

  const handleCorrectKeySubmit = async (e) => {
    e.preventDefault();
    if (!correctKeyModal.question || !correctKeyModal.newLabel || !correctKeyModal.reason.trim()) {
      onNotify('error', 'Please select a new correct label and enter a reason.');
      return;
    }

    try {
      setSubmittingKey(true);
      const res = await API.post(`/cbt/questions/${correctKeyModal.question.id}/correct-key`, {
        new_label: correctKeyModal.newLabel,
        reason: correctKeyModal.reason.trim()
      });
      onNotify('success', res.data?.message || 'Answer key updated and submitted attempts re-marked.');
      setCorrectKeyModal({ open: false, question: null, newLabel: '', reason: '' });
      fetchQuestions();
    } catch (err) {
      onNotify('error', err.response?.data?.message || 'Failed to correct answer key.');
    } finally {
      setSubmittingKey(false);
    }
  };

  const handlePublishExam = async () => {
    if (!window.confirm('Publish this exam? Once published, students in active batches can take it.')) return;
    try {
      setLoading(true);
      const res = await API.post(`/cbt/exams/${exam.id}/publish`);
      onNotify('success', res.data?.message || 'Exam published successfully.');
      exam.status = 'PUBLISHED';
    } catch (err) {
      onNotify('error', err.response?.data?.message || 'Failed to publish exam. Make sure questions are uploaded.');
    } finally {
      setLoading(false);
    }
  };

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
              <h2 className="text-xl font-bold text-slate-800">{exam.title}</h2>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                exam.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-800' :
                exam.status === 'QUESTIONS_LOCKED' ? 'bg-indigo-100 text-indigo-800' :
                'bg-amber-100 text-amber-800'
              }`}>
                {exam.status}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {exam.subject} • {exam.term} • {exam.class_name || `Class ID ${exam.class_id}`} • {exam.duration_minutes} mins • {exam.total_marks} marks • Max leaves: {exam.max_leaves ?? 3}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-semibold transition"
          >
            <Download className="h-4 w-4" /> Download Template
          </button>

          {exam.status === 'DRAFT' && (
            <button
              onClick={() => setActiveTab(activeTab === 'upload' ? 'preview' : 'upload')}
              className="flex items-center gap-2 px-3.5 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs font-semibold transition"
            >
              <Upload className="h-4 w-4" /> {activeTab === 'upload' ? 'View Preview' : 'Upload Questions'}
            </button>
          )}

          {exam.status === 'DRAFT' && questions.length > 0 && (
            <button
              onClick={handlePublishExam}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition"
            >
              <Sparkles className="h-4 w-4" /> Publish Exam
            </button>
          )}
        </div>
      </div>

      {/* Upload Panel */}
      {activeTab === 'upload' && exam.status === 'DRAFT' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" /> Upload Question Spreadsheet
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Upload your questions formatted using the standard CBT Excel template.
              </p>
            </div>
          </div>

          <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center bg-slate-50/50 hover:bg-slate-50 transition">
            <Upload className="h-10 w-10 text-slate-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700 mb-1">Select questions workbook (.xlsx)</p>
            <p className="text-xs text-slate-500 mb-4">Questions can include inline LaTeX formulas like $x^2 + y^2 = r^2$</p>

            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleExcelUpload}
              disabled={uploading}
              className="hidden"
              id="cbt-excel-upload"
            />
            <label
              htmlFor="cbt-excel-upload"
              className={`inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer transition ${
                uploading ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              {uploading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" /> Uploading & Validating...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Browse Excel File
                </>
              )}
            </label>

            {uploadError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium text-left">
                {uploadError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preview Section */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-600" /> Student View Preview
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {questions.length} total question{questions.length === 1 ? '' : 's'} • Formulas rendered exactly as students see them
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showKeys}
                onChange={(e) => setShowKeys(e.target.checked)}
                className="h-4 w-4 text-blue-600 rounded-sm border-slate-300 focus:ring-blue-500"
              />
              Show Answer Keys
            </label>
            <button
              onClick={fetchQuestions}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
              title="Refresh questions"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-600" />
            Loading exam questions...
          </div>
        ) : questions.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            <HelpCircle className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-slate-700">No questions uploaded yet</p>
            <p className="text-xs text-slate-400 mt-1">Download the template and upload your questions to get started.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {questions.map((q, idx) => (
              <div
                key={q.id}
                className="p-5 rounded-2xl border border-slate-200 bg-slate-50/40 hover:border-slate-300 transition space-y-4"
              >
                {/* Question header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center">
                      {q.question_number || idx + 1}
                    </span>
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-slate-800">
                        <CbtMathView text={q.question_text} />
                      </div>
                      {q.image_url && (
                        <div className="mt-2">
                          <img
                            src={q.image_url}
                            alt={`Question ${q.question_number}`}
                            className="max-h-48 max-w-sm rounded-xl border border-slate-200 object-contain bg-white p-1"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Add Image on question */}
                    <label className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 cursor-pointer transition shadow-2xs">
                      <ImageIcon className="h-3.5 w-3.5 text-blue-600" />
                      {q.image_url ? 'Replace Image' : 'Add Image'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleQuestionImageUpload(q.id, file);
                        }}
                      />
                    </label>

                    {/* Correct Key button */}
                    <button
                      onClick={() => setCorrectKeyModal({ open: true, question: q, newLabel: q.correct_label || '', reason: '' })}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-semibold text-amber-800 transition"
                      title="Correct Answer Key"
                    >
                      <Key className="h-3.5 w-3.5 text-amber-600" />
                      Correct Key
                    </button>
                  </div>
                </div>

                {/* Options grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-10">
                  {(q.options || []).map((opt) => {
                    const isCorrect = showKeys && opt.label === q.correct_label;
                    return (
                      <div
                        key={opt.id}
                        className={`flex items-start justify-between gap-3 p-3 rounded-xl border transition ${
                          isCorrect
                            ? 'bg-emerald-50/70 border-emerald-300'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className={`w-6 h-6 rounded-md font-bold text-xs flex items-center justify-center ${
                            isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {opt.label}
                          </span>
                          <div className="space-y-1">
                            <div className="text-xs text-slate-700 font-medium">
                              <CbtMathView text={opt.option_text} />
                            </div>
                            {opt.image_url && (
                              <img
                                src={opt.image_url}
                                alt={`Option ${opt.label}`}
                                className="max-h-24 max-w-xs rounded-lg border border-slate-200 object-contain bg-white p-1"
                              />
                            )}
                          </div>
                        </div>

                        {/* Add image on option */}
                        <label className="p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer transition" title="Add/Change Option Image">
                          <ImageIcon className="h-3.5 w-3.5" />
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleOptionImageUpload(opt.id, file);
                            }}
                          />
                        </label>
                      </div>
                    );
                  })}
                </div>

                {showKeys && (
                  <div className="pl-10 text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                    Correct Answer: Option {q.correct_label}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Answer Key Correction Modal */}
      {correctKeyModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-200 space-y-4">
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
              Update the key for Question #{correctKeyModal.question?.question_number}. All existing submitted attempts will be immediately re-marked on the server.
            </p>

            <form onSubmit={handleCorrectKeySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Correct Option</label>
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for change</label>
                <textarea
                  value={correctKeyModal.reason}
                  onChange={(e) => setCorrectKeyModal({ ...correctKeyModal, reason: e.target.value })}
                  placeholder="e.g. Typo in original key or question ambiguity"
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
                  Confirm & Re-mark
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

