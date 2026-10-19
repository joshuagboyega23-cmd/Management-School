import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, StopCircle, UserPlus, Send, Volume2, VolumeX, Eye, EyeOff, 
  AlertTriangle, CheckCircle, Clock, ShieldAlert, ArrowLeft, RefreshCw,
  Bell, Lock, Unlock, UserCheck, Flame
} from 'lucide-react';
import API from '../api';

export default function CbtLiveBatch({ exam, onBack, onNotify }) {
  const [students, setStudents] = useState([]);
  const [currentBatch, setCurrentBatch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [showAccessCode, setShowAccessCode] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [flashingStudentIds, setFlashingStudentIds] = useState({}); // { [studentId]: expiresAtMs }
  const [activeAlertToasts, setActiveAlertToasts] = useState([]);

  // Modals
  const [warnModal, setWarnModal] = useState({ open: false, student: null, message: '' });
  const [addLateModal, setAddLateModal] = useState({ open: false, studentId: '' });
  const [submittingAction, setSubmittingAction] = useState(false);

  // References for polling interval & last alert ID
  const lastAlertIdRef = useRef(0);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  // Web Audio chime/beep for alerts
  const playAlertSound = () => {
    if (!soundEnabledRef.current) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {
      // AudioContext blocked
    }
  };

  // Fetch initial student roster & batch state
  const fetchBatchData = async (isPolling = false) => {
    if (!exam?.id) return;
    try {
      if (!isPolling) setLoading(true);
      const res = await API.get(`/cbt/exams/${exam.id}/students`);
      setStudents(Array.isArray(res.data?.data) ? res.data.data : []);
      setCurrentBatch(res.data?.current_batch || null);
    } catch (err) {
      if (!isPolling) {
        onNotify('error', err.response?.data?.message || 'Could not load exam batch students.');
      }
    } finally {
      if (!isPolling) setLoading(false);
    }
  };

  // Poll alerts for current live batch
  const pollAlerts = async (batchId) => {
    if (!batchId) return;
    try {
      const res = await API.get(`/cbt/batches/${batchId}/alerts?since=${lastAlertIdRef.current}`);
      const newAlerts = Array.isArray(res.data?.data) ? res.data.data : [];
      if (newAlerts.length > 0) {
        // Update last seen ID
        const maxId = Math.max(...newAlerts.map(a => a.id));
        if (maxId > lastAlertIdRef.current) {
          lastAlertIdRef.current = maxId;
        }

        // Add to pinned alerts list
        setAlerts((prev) => [...newAlerts, ...prev].slice(0, 50));

        // Flash rows for 10 seconds and play alert sound
        const now = Date.now();
        const newFlashMap = {};
        newAlerts.forEach((alert) => {
          newFlashMap[alert.student_id] = now + 10000;
        });
        setFlashingStudentIds((prev) => ({ ...prev, ...newFlashMap }));

        playAlertSound();

        // Create pop-up toasts for each alert
        const toasts = newAlerts.map(a => ({
          id: a.id,
          studentName: a.student_name,
          alertType: a.alert_type,
          detail: a.detail,
          leaveCount: a.leave_count,
          createdAt: a.created_at
        }));
        setActiveAlertToasts(prev => [...prev, ...toasts].slice(-5));

        // Auto remove toast after 6 seconds
        setTimeout(() => {
          setActiveAlertToasts(prev => prev.filter(t => !toasts.some(nt => nt.id === t.id)));
        }, 6000);
      }
    } catch (err) {
      // Quiet poll error
    }
  };

  // Initial load
  useEffect(() => {
    fetchBatchData();
  }, [exam?.id]);

  // SINGLE 4-second polling interval for both status table and alerts
  useEffect(() => {
    const intervalId = setInterval(async () => {
      await fetchBatchData(true);
      if (currentBatch?.id && currentBatch.status === 'LIVE') {
        await pollAlerts(currentBatch.id);
      }
    }, 4000);

    return () => {
      clearInterval(intervalId);
    };
  }, [exam?.id, currentBatch?.id, currentBatch?.status]);

  // Handle start batch
  const handleStartBatch = async () => {
    if (selectedStudentIds.length === 0) {
      onNotify('error', 'Please select at least one student to start the exam batch.');
      return;
    }

    try {
      setSubmittingAction(true);
      const res = await API.post(`/cbt/exams/${exam.id}/batches`, {
        student_ids: selectedStudentIds
      });
      onNotify('success', `Exam batch started with ${selectedStudentIds.length} student(s)!`);
      lastAlertIdRef.current = 0;
      setSelectedStudentIds([]);
      await fetchBatchData();
    } catch (err) {
      onNotify('error', err.response?.data?.message || 'Could not start exam batch.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle end batch
  const handleEndBatch = async () => {
    if (!currentBatch?.id) return;
    if (!window.confirm('Are you sure you want to END the current exam batch? Students will no longer be able to enter codes or start attempts.')) {
      return;
    }

    try {
      setSubmittingAction(true);
      await API.post(`/cbt/batches/${currentBatch.id}/end`);
      onNotify('success', 'Exam batch ended successfully.');
      await fetchBatchData();
    } catch (err) {
      onNotify('error', err.response?.data?.message || 'Could not end exam batch.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle add late student
  const handleAddLateStudent = async (e) => {
    e.preventDefault();
    if (!currentBatch?.id || !addLateModal.studentId) return;

    try {
      setSubmittingAction(true);
      await API.post(`/cbt/batches/${currentBatch.id}/add-student`, {
        student_id: Number(addLateModal.studentId)
      });
      onNotify('success', 'Late student added to running batch.');
      setAddLateModal({ open: false, studentId: '' });
      await fetchBatchData();
    } catch (err) {
      onNotify('error', err.response?.data?.message || 'Could not add late student.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle unlock student
  const handleUnlockStudent = async (studentId) => {
    try {
      setSubmittingAction(true);
      const res = await API.post(`/cbt/exams/${exam.id}/unlock-student`, {
        student_id: Number(studentId)
      });
      onNotify('success', `Student unlocked into new batch! Code: ${res.data?.data?.access_code}`);
      await fetchBatchData();
    } catch (err) {
      onNotify('error', err.response?.data?.message || 'Could not unlock student.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle send teacher warning
  const handleSendWarning = async (e) => {
    e.preventDefault();
    if (!warnModal.student?.attempt_id || !warnModal.message.trim()) {
      onNotify('error', 'Attempt ID or warning message missing.');
      return;
    }

    try {
      setSubmittingAction(true);
      await API.post(`/cbt/attempts/${warnModal.student.attempt_id}/warn`, {
        message: warnModal.message.trim()
      });
      onNotify('success', `Warning delivered to ${warnModal.student.full_name}.`);
      setWarnModal({ open: false, student: null, message: '' });
    } catch (err) {
      onNotify('error', err.response?.data?.message || 'Failed to send warning.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const isLive = currentBatch?.status === 'LIVE';
  const unbatchedStudents = students.filter(s => !s.batch_id || s.status === 'WAITING');

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedStudentIds(unbatchedStudents.map(s => s.student_id));
    } else {
      setSelectedStudentIds([]);
    }
  };

  const handleToggleSelectStudent = (id) => {
    setSelectedStudentIds(prev => 
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const nowMs = Date.now();

  return (
    <div className="space-y-6">
      {/* Toast Pop-ups for Live Alerts */}
      <div className="fixed top-5 right-5 z-50 space-y-2 max-w-sm pointer-events-none">
        {activeAlertToasts.map(toast => (
          <div 
            key={toast.id}
            className="p-4 bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-xl border border-red-500/50 flex items-start gap-3 pointer-events-auto animate-bounce-once"
          >
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold text-sm text-red-200">{toast.studentName}</p>
              <p className="text-slate-300">
                {toast.alertType === 'TAB_HIDDEN' && '⚠️ Switched browser tab / hidden window'}
                {toast.alertType === 'FULLSCREEN_EXIT' && '⚠️ Exited fullscreen mode'}
                {toast.alertType === 'WRONG_CODES' && '🔒 Too many incorrect code attempts'}
                {toast.alertType === 'AUTO_SUBMITTED' && '🛑 Reached leave limit: AUTO-SUBMITTED'}
              </p>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span>{toast.detail}</span>
                {toast.leaveCount !== undefined && <span>• Total leaves: {toast.leaveCount}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

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
                isLive ? 'bg-emerald-100 text-emerald-800 animate-pulse' : 'bg-slate-100 text-slate-700'
              }`}>
                {isLive ? 'LIVE BATCH RUNNING' : 'NO LIVE BATCH'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {exam.subject} • {exam.term} • {exam.class_name || `Class ID ${exam.class_id}`} • Max leaves allowed: {exam.max_leaves ?? 3}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition ${
              soundEnabled
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-slate-50 text-slate-500 border-slate-200'
            }`}
            title={soundEnabled ? 'Alert sounds ON' : 'Alert sounds OFF (click to enable)'}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            Sound {soundEnabled ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={() => fetchBatchData(false)}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
            title="Refresh status"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 6-Digit Access Code Banner (shown very large with hide/show toggle) */}
      {isLive && currentBatch?.access_code && (
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 rounded-3xl text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 border border-slate-700">
          <div className="space-y-1 text-center md:text-left">
            <span className="text-[11px] font-bold tracking-wider uppercase text-amber-400 bg-amber-950/60 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
              Teacher & Invigilator Only
            </span>
            <h3 className="text-lg font-bold text-white">Live Batch Access Code</h3>
            <p className="text-xs text-slate-300">
              Announce or display this 6-digit code to students in the examination room.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-slate-950/80 px-8 py-3.5 rounded-2xl border border-slate-700/80 text-center shadow-inner">
              <span className="font-mono text-4xl sm:text-5xl font-extrabold tracking-[0.25em] text-amber-400 select-all">
                {showAccessCode ? currentBatch.access_code : '••••••'}
              </span>
            </div>

            <button
              onClick={() => setShowAccessCode(!showAccessCode)}
              className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-600 transition"
              title={showAccessCode ? 'Hide Code' : 'Show Code'}
            >
              {showAccessCode ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setAddLateModal({ open: true, studentId: '' })}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
            >
              <UserPlus className="h-4 w-4" /> Add Late Student
            </button>
            <button
              onClick={handleEndBatch}
              disabled={submittingAction}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
            >
              <StopCircle className="h-4 w-4" /> End Batch
            </button>
          </div>
        </div>
      )}

      {/* Pinned Alerts List (if any alerts triggered) */}
      {alerts.length > 0 && (
        <div className="bg-red-50/80 border border-red-200 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-red-800 flex items-center gap-2">
              <Bell className="h-4 w-4 text-red-600" /> Recent Live Alerts ({alerts.length})
            </h4>
            <span className="text-[11px] text-red-600 font-medium">Updates live every 4 seconds</span>
          </div>

          <div className="max-h-36 overflow-y-auto space-y-2 pr-1">
            {alerts.slice(0, 10).map((a) => (
              <div
                key={a.id}
                className="p-2.5 bg-white rounded-xl border border-red-200 flex items-center justify-between text-xs text-slate-700 shadow-2xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">{a.student_name}</span>
                  <span className="px-2 py-0.5 rounded-full font-semibold text-[10px] bg-red-100 text-red-800">
                    {a.alert_type}
                  </span>
                  <span className="text-slate-500">{a.detail}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-red-600">Leaves: {a.leave_count}</span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(a.created_at).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Batch Starting Controls (when no batch or starting additional batch) */}
      {!isLive && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Play className="h-5 w-5 text-blue-600" /> Start Exam Batch
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Select students present in the exam hall to generate their unique 6-digit access code.
              </p>
            </div>

            <button
              onClick={handleStartBatch}
              disabled={submittingAction || selectedStudentIds.length === 0}
              className={`flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs ${
                selectedStudentIds.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <Play className="h-4 w-4" /> Start Batch ({selectedStudentIds.length} Selected)
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs font-semibold text-slate-700">
            <label className="flex items-center gap-2 cursor-pointer bg-slate-100 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition">
              <input
                type="checkbox"
                checked={selectedStudentIds.length > 0 && selectedStudentIds.length === unbatchedStudents.length}
                onChange={handleSelectAll}
                className="h-4 w-4 text-blue-600 rounded-sm border-slate-300 focus:ring-blue-500"
              />
              Select All Present Students ({unbatchedStudents.length})
            </label>
            <span className="text-slate-400">•</span>
            <span className="text-slate-500">{selectedStudentIds.length} students ticked</span>
          </div>
        </div>
      )}

      {/* Live Status Table */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-blue-600" /> Student Examination Status
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Refreshed automatically every 4 seconds • Tab-leave counts highlighted in red
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
            {students.length} Total Students
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-600" />
            Loading live batch roster...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-y border-slate-200">
                <tr>
                  {!isLive && <th className="p-3 w-10">Tick</th>}
                  <th className="p-3">Admission No</th>
                  <th className="p-3">Student Name</th>
                  <th className="p-3">Live Status</th>
                  <th className="p-3 text-center">Tab Leaves</th>
                  <th className="p-3">Score</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {students.map((student) => {
                  const isTicked = selectedStudentIds.includes(student.student_id);
                  const isFlashing = flashingStudentIds[student.student_id] && nowMs < flashingStudentIds[student.student_id];
                  const hasLeaves = student.tab_leave_count >= 1;
                  const isAutoLeaves = student.submit_type === 'AUTO_LEAVES';

                  return (
                    <tr
                      key={student.student_id}
                      className={`transition duration-300 ${
                        isFlashing
                          ? 'bg-amber-100/80 animate-pulse font-semibold'
                          : hasLeaves
                          ? 'bg-red-50/30 hover:bg-red-50/60'
                          : 'hover:bg-slate-50/70'
                      }`}
                    >
                      {!isLive && (
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={isTicked}
                            onChange={() => handleToggleSelectStudent(student.student_id)}
                            className="h-4 w-4 text-blue-600 rounded-sm border-slate-300 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="p-3 font-mono font-semibold text-slate-700">
                        {student.admission_number}
                      </td>
                      <td className="p-3 font-bold text-slate-800 flex items-center gap-1.5">
                        {student.full_name}
                        {isFlashing && (
                          <Flame className="h-4 w-4 text-red-600 animate-bounce" title="Alert within last 10s!" />
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          student.status === 'SUBMITTED' ? 'bg-emerald-100 text-emerald-800' :
                          student.status === 'WRITING' ? 'bg-blue-100 text-blue-800' :
                          student.status === 'CODE_ENTERED' ? 'bg-purple-100 text-purple-800' :
                          student.status === 'LOCKED_OUT' ? 'bg-red-100 text-red-800' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {student.status}
                          {isAutoLeaves && (
                            <span className="text-[10px] ml-1 px-1.5 py-0.2 bg-red-600 text-white rounded-full">
                              AUTO-LEAVES
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${
                          hasLeaves
                            ? 'bg-red-600 text-white animate-pulse'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {student.tab_leave_count}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-slate-800">
                        {student.score !== null ? `${student.score} / ${exam.total_marks}` : '—'}
                      </td>
                      <td className="p-3 text-right space-x-2">
                        {/* Warn Student Button */}
                        {student.attempt_id && student.status !== 'SUBMITTED' && (
                          <button
                            onClick={() => setWarnModal({ open: true, student, message: '' })}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold transition"
                            title="Send warning message to student's screen"
                          >
                            <Send className="h-3 w-3" /> Warn
                          </button>
                        )}

                        {/* Unlock button if locked out */}
                        {student.status === 'LOCKED_OUT' && (
                          <button
                            onClick={() => handleUnlockStudent(student.student_id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-lg text-xs font-semibold transition"
                            title="Unlock student and issue fresh code"
                          >
                            <Unlock className="h-3 w-3" /> Unlock
                          </button>
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

      {/* Warn Student Modal */}
      {warnModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Send className="h-5 w-5 text-amber-600" /> Warn {warnModal.student?.full_name}
              </h3>
              <button
                onClick={() => setWarnModal({ open: false, student: null, message: '' })}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              The student will receive this warning in a high-priority prompt on their exam screen.
            </p>

            <form onSubmit={handleSendWarning} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Warning Message (1 to 200 characters)
                </label>
                <textarea
                  value={warnModal.message}
                  onChange={(e) => setWarnModal({ ...warnModal, message: e.target.value })}
                  placeholder="e.g. Please keep your eyes focused on your own screen."
                  required
                  maxLength={200}
                  rows={3}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs focus:ring-blue-500 focus:border-blue-500"
                />
                <div className="text-right text-[11px] text-slate-400 mt-1">
                  {warnModal.message.length} / 200
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setWarnModal({ open: false, student: null, message: '' })}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction || !warnModal.message.trim()}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                >
                  {submittingAction ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                  Send Warning
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Late Student Modal */}
      {addLateModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-blue-600" /> Add Late Student to Batch
              </h3>
              <button
                onClick={() => setAddLateModal({ open: false, studentId: '' })}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddLateStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Late Student</label>
                <select
                  value={addLateModal.studentId}
                  onChange={(e) => setAddLateModal({ ...addLateModal, studentId: e.target.value })}
                  required
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-white focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">-- Choose student --</option>
                  {unbatchedStudents.map((s) => (
                    <option key={s.student_id} value={s.student_id}>
                      {s.full_name} ({s.admission_number})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddLateModal({ open: false, studentId: '' })}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction || !addLateModal.studentId}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                >
                  {submittingAction ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                  Add to Running Batch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

