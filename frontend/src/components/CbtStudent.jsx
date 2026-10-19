import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle, Clock3, LoaderCircle, LockKeyhole, Maximize, RefreshCw } from 'lucide-react';
import API from '../opi';
import CbtMathView from './CbtMathView';

const ACTIVE_EXAM_KEY = 'cbt-active-exam-id';

const getErrorMessage = (error, fallback) => (
  error.response?.data?.message || fallback
);

const formatTime = (seconds) => {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  return [hours, minutes, remainingSeconds].map((part) => String(part).padStart(2, '0')).join(':');
};

export default function CbtStudent() {
  const navigate = useNavigate();
  const [stage, setStage] = useState('available');
  const [exams, setExams] = useState([]);
  const [releasedExams, setReleasedExams] = useState([]);
  const [selectedExam, setSelectedExam] = useState(null);
  const [releasedExam, setReleasedExam] = useState(null);
  const [examSession, setExamSession] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [saveStates, setSaveStates] = useState({});
  const [warnings, setWarnings] = useState([]);
  const [leaveInfo, setLeaveInfo] = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [retryAfter, setRetryAfter] = useState(0);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [pageError, setPageError] = useState('');
  const [warningError, setWarningError] = useState('');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [leftExamPage, setLeftExamPage] = useState(false);
  const [examWarning, setExamWarning] = useState('');
  const [releasedLoading, setReleasedLoading] = useState(false);
  const pendingSaves = useRef(new Map());
  const deviceToken = examSession?.device_token;
  const attemptId = examSession?.attempt_id;

  const loadExams = useCallback(async () => {
    try {
      setLoading(true);
      setPageError('');
      const response = await API.get('/cbt/student/exams');
      setExams(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (error) {
      setPageError(getErrorMessage(error, 'Could not load available exams.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAttempt = useCallback(async (examId) => {
    try {
      setStarting(true);
      setPageError('');
      const response = await API.post(`/cbt/student/exams/${examId}/start`, {});
      const session = response.data?.data;
      if (!session?.attempt_id || !session?.deadline_at) {
        throw new Error('The exam server returned an incomplete attempt.');
      }
      setExamSession(session);
      setSelectedExam((current) => ({ ...current, exam_id: examId, title: session.title || current?.title }));
      setAnswers(session.answers || {});
      setQuestionIndex(0);
      setSaveStates({});
      setWarnings([]);
      setLeaveInfo(null);
      setLeftExamPage(false);
      setStage('exam');
      sessionStorage.setItem(ACTIVE_EXAM_KEY, String(examId));
    } catch (error) {
      const message = getErrorMessage(error, 'Could not resume the exam.');
      if (error.response?.status === 400 && /expired|submitted|already/i.test(message)) {
        sessionStorage.removeItem(ACTIVE_EXAM_KEY);
        setStage('submitted');
      } else {
        setPageError(error.message === 'The exam server returned an incomplete attempt.' ? error.message : message);
        setStage('instructions');
      }
    } finally {
      setStarting(false);
    }
  }, []);

  useEffect(() => {
    const activeExamId = sessionStorage.getItem(ACTIVE_EXAM_KEY);
    if (activeExamId && /^\d+$/.test(activeExamId)) {
      const timer = window.setTimeout(() => void loadAttempt(activeExamId), 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => void loadExams(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAttempt, loadExams]);

  useEffect(() => {
    if (retryAfter <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setRetryAfter((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [retryAfter]);

  const openCodeEntry = (exam) => {
    setSelectedExam(exam);
    setCode('');
    setCodeError('');
    setRetryAfter(0);
    setStage('code');
  };

  const enterCode = async (event) => {
    event.preventDefault();
    if (retryAfter > 0 || !selectedExam) return;
    try {
      setStarting(true);
      setCodeError('');
      const response = await API.post('/cbt/student/enter-code', {
        exam_id: selectedExam.exam_id,
        batch_id: selectedExam.batch_id,
        code
      });
      if (response.data?.success) setStage('instructions');
    } catch (error) {
      if (error.response?.status === 429) {
        const seconds = Number(error.response.data?.retryAfterSeconds);
        setRetryAfter(Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0);
        setCodeError('Please wait');
      } else {
        setCodeError(getErrorMessage(error, 'Could not verify the exam code.'));
      }
    } finally {
      setStarting(false);
    }
  };

  const startExam = async () => {
    try {
      const fullscreenRequest = document.documentElement.requestFullscreen?.();
      if (fullscreenRequest) {
        await fullscreenRequest.catch(() => {
          setExamWarning('Full screen could not be enabled. You can still continue the exam.');
        });
      }
    } catch {
      setExamWarning('Full screen could not be enabled. You can still continue the exam.');
    }
    await loadAttempt(selectedExam.exam_id);
  };

  const submitExam = useCallback(async (automatic = false) => {
    if (!attemptId || !deviceToken || submitting) return;
    setSubmitting(true);
    setPageError('');
    try {
      if (!automatic) await Promise.all([...pendingSaves.current.values()]);
      await API.post(
        `/cbt/student/attempts/${attemptId}/submit`,
        { device_token: deviceToken },
        { headers: { 'x-device-token': deviceToken } }
      );
      sessionStorage.removeItem(ACTIVE_EXAM_KEY);
      setStage('submitted');
    } catch (error) {
      setPageError(getErrorMessage(error, 'Could not submit the exam. Please retry.'));
    } finally {
      setSubmitting(false);
    }
  }, [attemptId, deviceToken, submitting]);

  useEffect(() => {
    if (stage !== 'exam' || !examSession?.deadline_at) return undefined;
    const updateTime = () => {
      const remaining = Math.max(0, Math.ceil((Date.parse(examSession.deadline_at) - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining === 0) void submitExam(true);
    };
    updateTime();
    const timer = window.setInterval(updateTime, 1000);
    return () => window.clearInterval(timer);
  }, [examSession?.deadline_at, stage, submitExam]);

  const queueAnswerSave = useCallback((questionId, label) => {
    setSaveStates((current) => ({ ...current, [questionId]: 'saving' }));
    const previous = pendingSaves.current.get(questionId) || Promise.resolve();
    let task;
    task = previous.catch(() => {}).then(async () => {
      let lastError;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await API.put(
            `/cbt/student/attempts/${attemptId}/answer`,
            { question_id: questionId, selected_label: label, device_token: deviceToken },
            { headers: { 'x-device-token': deviceToken } }
          );
          if (pendingSaves.current.get(questionId) === task) {
            setSaveStates((current) => ({ ...current, [questionId]: 'saved' }));
          }
          return;
        } catch (error) {
          lastError = error;
          if (error.response && error.response.status < 500) break;
          if (attempt < 2) {
            await new Promise((resolve) => window.setTimeout(resolve, 750 * (attempt + 1)));
          }
        }
      }
      if (pendingSaves.current.get(questionId) === task) {
        setSaveStates((current) => ({ ...current, [questionId]: 'failed' }));
      }
      throw lastError;
    }).finally(() => {
      if (pendingSaves.current.get(questionId) === task) {
        pendingSaves.current.delete(questionId);
      }
    });
    pendingSaves.current.set(questionId, task);
    task.catch(() => {});
  }, [attemptId, deviceToken]);

  const selectAnswer = (questionId, label) => {
    setAnswers((current) => ({ ...current, [questionId]: label }));
    queueAnswerSave(questionId, label);
  };

  const retryAnswerSave = (questionId) => {
    const label = answers[questionId];
    if (label) queueAnswerSave(questionId, label);
  };

  const sendLeaveEvent = useCallback(async (eventType) => {
    if (!attemptId || !deviceToken || stage !== 'exam') return;
    setLeftExamPage(true);
    try {
      const response = await API.post(
        `/cbt/student/attempts/${attemptId}/event`,
        { event_type: eventType, device_token: deviceToken },
        { headers: { 'x-device-token': deviceToken } }
      );
      setLeaveInfo({
        leaves: Number(response.data?.leaves) || 0,
        maxLeaves: Number(response.data?.maxLeaves) || 0
      });
      if (response.data?.autoSubmitted) {
        sessionStorage.removeItem(ACTIVE_EXAM_KEY);
        setStage('submitted');
      }
    } catch (error) {
      setPageError(getErrorMessage(error, 'Could not record leaving the exam page.'));
    }
  }, [attemptId, deviceToken, stage]);

  useEffect(() => {
    if (stage !== 'exam' || !attemptId) return undefined;
    let wasFullscreen = Boolean(document.fullscreenElement);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void sendLeaveEvent('TAB_HIDDEN');
    };
    const onWindowBlur = () => void sendLeaveEvent('TAB_HIDDEN');
    const onFullscreenChange = () => {
      if (wasFullscreen && !document.fullscreenElement) void sendLeaveEvent('FULLSCREEN_EXIT');
      wasFullscreen = Boolean(document.fullscreenElement);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [attemptId, sendLeaveEvent, stage]);

  const returnToExam = async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      setExamWarning('');
    } catch {
      setExamWarning('Full screen could not be enabled. Continue only when you are ready.');
    }
    setLeftExamPage(false);
  };

  useEffect(() => {
    if (stage !== 'exam' || !attemptId) return undefined;
    let active = true;
    const fetchWarnings = async () => {
      try {
        const response = await API.get(`/cbt/my-attempts/${attemptId}/warnings`);
        if (!active) return;
        const incoming = Array.isArray(response.data?.data) ? response.data.data : [];
        setWarnings((current) => {
          const knownIds = new Set(current.map((warning) => warning.id));
          return [...current, ...incoming.filter((warning) => !knownIds.has(warning.id))];
        });
        setWarningError('');
      } catch {
        if (active) setWarningError('Unable to refresh teacher messages. Retrying…');
      }
    };
    void fetchWarnings();
    const timer = window.setInterval(fetchWarnings, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [attemptId, stage]);

  const openReleasedQuestions = async () => {
    try {
      setReleasedLoading(true);
      setPageError('');
      const response = await API.get('/cbt/student/released-questions');
      setReleasedExams(Array.isArray(response.data?.data) ? response.data.data : []);
      setStage('released');
    } catch (error) {
      setPageError(getErrorMessage(error, 'Could not load released questions.'));
    } finally {
      setReleasedLoading(false);
    }
  };

  const startFromListing = (exam) => {
    setSelectedExam(exam);
    if (exam.attempt_started_at && !exam.attempt_submitted_at) {
      setStage('exam');
      sessionStorage.setItem(ACTIVE_EXAM_KEY, String(exam.exam_id));
      void loadAttempt(exam.exam_id);
    } else if (exam.student_status === 'CODE_ENTERED') {
      setStage('instructions');
    } else {
      openCodeEntry(exam);
    }
  };

  const goToDashboard = () => navigate('/student');
  const questions = examSession?.questions || [];
  const currentQuestion = questions[questionIndex];
  const unsavedAnswers = Object.values(saveStates).some((status) => status === 'saving' || status === 'failed');

  if (stage === 'submitted') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white p-8 text-xl font-semibold text-emerald-800 shadow-sm">
          <CheckCircle className="h-7 w-7" />
          Exam submitted successfully
        </div>
      </main>
    );
  }

  if (stage === 'exam') {
    if (starting || !examSession) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
          <p className="flex items-center gap-2 text-slate-600"><LoaderCircle className="h-5 w-5 animate-spin" /> Reconnecting to your exam…</p>
        </main>
      );
    }

    return (
      <main
        className="min-h-screen select-none bg-slate-100 p-4 text-slate-900 sm:p-8"
        onCopy={(event) => event.preventDefault()}
        onCut={(event) => event.preventDefault()}
        onPaste={(event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
      >
        <div className="mx-auto max-w-5xl">
          <header className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-slate-900 p-5 text-white shadow">
            <div>
              <p className="text-sm text-slate-300">Computer-Based Test</p>
              <h1 className="text-xl font-bold">{examSession.title || selectedExam?.title}</h1>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 font-mono text-lg font-bold" aria-live="polite">
              <Clock3 className="h-5 w-5" />
              {formatTime(secondsRemaining)}
            </div>
          </header>

          {warnings.map((warning) => (
            <div key={warning.id} className="mb-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <p>{warning.message}</p>
            </div>
          ))}
          {warningError && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{warningError}</p>}
          {examWarning && <p className="mb-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{examWarning}</p>}
          {pageError && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{pageError}</p>}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_15rem]">
            <section className="relative min-h-[25rem] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8" aria-label="Exam question">
              {currentQuestion ? (
                <div className={leftExamPage ? 'pointer-events-none select-none blur-md' : ''} aria-hidden={leftExamPage}>
                  <p className="mb-4 text-sm font-semibold text-blue-700">Question {questionIndex + 1} of {questions.length}</p>
                  <div className="mb-5 text-lg leading-8">
                    <CbtMathView text={currentQuestion.body_text} />
                  </div>
                  {currentQuestion.image_url && <img src={currentQuestion.image_url} alt="" className="mb-5 max-h-80 rounded-lg object-contain" draggable="false" />}
                  <div className="space-y-3">
                    {(currentQuestion.options || []).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => selectAnswer(currentQuestion.id, option.label)}
                        className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${
                          answers[currentQuestion.id] === option.label
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                            : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                        }`}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current text-sm font-bold">{option.label}</span>
                        <span className="min-w-0 flex-1">
                          <CbtMathView text={option.option_text || option.body_text || ''} />
                          {option.image_url && <img src={option.image_url} alt="" className="mt-3 max-h-48 rounded object-contain" draggable="false" />}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-5 flex min-h-6 items-center gap-2 text-xs text-slate-500" aria-live="polite">
                    {saveStates[currentQuestion.id] === 'saving' && <><LoaderCircle className="h-4 w-4 animate-spin" /> Saving answer…</>}
                    {saveStates[currentQuestion.id] === 'saved' && <><CheckCircle className="h-4 w-4 text-emerald-600" /> Answer saved</>}
                    {saveStates[currentQuestion.id] === 'failed' && (
                      <>
                        <span className="text-red-700">Answer not saved.</span>
                        <button type="button" onClick={() => retryAnswerSave(currentQuestion.id)} className="font-semibold text-blue-700 underline">Retry</button>
                      </>
                    )}
                  </div>
                </div>
              ) : <p className="text-slate-500">No questions are available for this exam.</p>}

              {leftExamPage && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-white/80 p-6 text-center backdrop-blur-md">
                  <LockKeyhole className="mb-3 h-9 w-9 text-amber-700" />
                  <h2 className="mb-2 text-xl font-bold text-slate-900">Return to the exam</h2>
                  {leaveInfo && (
                    <p className="mb-5 max-w-md text-sm text-slate-700">
                      You have left the exam page {leaveInfo.leaves} of {leaveInfo.maxLeaves} times. At {leaveInfo.maxLeaves}, your exam will be submitted automatically.
                    </p>
                  )}
                  <button type="button" onClick={returnToExam} className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800">
                    Return to the exam
                  </button>
                </div>
              )}
            </section>

            <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 font-bold text-slate-800">Questions</h2>
              <div className="mb-5 grid grid-cols-5 gap-2 lg:grid-cols-4">
                {questions.map((question, index) => (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => setQuestionIndex(index)}
                    className={`h-10 rounded-lg border text-sm font-semibold ${
                      index === questionIndex ? 'border-blue-700 bg-blue-700 text-white' :
                      answers[question.id] ? 'border-emerald-300 bg-emerald-50 text-emerald-800' :
                      'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                    aria-label={`Go to question ${index + 1}${answers[question.id] ? ', answered' : ', unanswered'}`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={questionIndex === 0} onClick={() => setQuestionIndex((index) => Math.max(0, index - 1))} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">Previous</button>
                <button type="button" disabled={questionIndex >= questions.length - 1} onClick={() => setQuestionIndex((index) => Math.min(questions.length - 1, index + 1))} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">Next</button>
              </div>
              <button
                type="button"
                disabled={submitting || (unsavedAnswers && secondsRemaining > 0)}
                onClick={() => void submitExam()}
                className="mt-5 w-full rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit exam'}
              </button>
              {unsavedAnswers && <p className="mt-2 text-xs text-amber-700">Wait for answers to save or retry before submitting.</p>}
            </aside>
          </div>
        </div>
      </main>
    );
  }

  if (stage === 'code') {
    return (
      <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <button type="button" onClick={() => setStage('available')} className="mb-5 flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Available exams</button>
          <h1 className="text-2xl font-bold text-slate-900">Enter exam code</h1>
          <p className="mt-2 text-slate-600">{selectedExam?.title}</p>
          <form onSubmit={enterCode} className="mt-6 space-y-4">
            <label htmlFor="cbt-code" className="block text-sm font-semibold text-slate-700">Access code</label>
            <input id="cbt-code" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" className="w-full rounded-lg border border-slate-300 px-4 py-3 text-lg tracking-widest outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            {codeError && <p className="text-sm text-red-700">{retryAfter > 0 ? `${codeError} (${retryAfter}s)` : codeError}</p>}
            <button type="submit" disabled={starting || retryAfter > 0 || !code.trim()} className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
              {starting ? 'Checking…' : retryAfter > 0 ? `Please wait (${retryAfter}s)` : 'Continue'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (stage === 'instructions') {
    return (
      <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <button type="button" onClick={() => { setStage('available'); void loadExams(); }} className="mb-5 flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Available exams</button>
          <h1 className="text-2xl font-bold text-slate-900">Exam instructions</h1>
          <p className="mt-2 text-lg font-semibold text-blue-800">{selectedExam?.title}</p>
          <ul className="mt-6 list-disc space-y-3 pl-5 text-sm leading-6 text-slate-700">
            <li>The exam timer uses the deadline set by the exam server.</li>
            <li>Your selected answers are saved as you go. Keep this page open until you submit.</li>
            <li>Leaving the exam page may be recorded and can cause automatic submission.</li>
            <li>Copying, pasting, cutting, dragging, right-clicking, and selecting text are disabled during the exam.</li>
          </ul>
          {pageError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{pageError}</p>}
          <button type="button" disabled={starting} onClick={() => void startExam()} className="mt-7 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
            <Maximize className="h-5 w-5" /> {starting ? 'Starting…' : 'Start exam'}
          </button>
        </div>
      </main>
    );
  }

  if (stage === 'released-detail') {
    return (
      <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
        <div className="mx-auto max-w-4xl">
          <button type="button" onClick={() => setStage('released')} className="mb-5 flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Released questions</button>
          <h1 className="mb-2 text-2xl font-bold text-slate-900">{releasedExam?.title}</h1>
          <p className="mb-6 text-sm text-slate-600">{releasedExam?.subject} · {releasedExam?.term}</p>
          <div className="space-y-4">
            {(releasedExam?.questions || []).map((question, index) => (
              <section key={question.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <p className="mb-3 text-sm font-semibold text-blue-700">Question {index + 1}</p>
                <div className="mb-4 text-lg leading-8"><CbtMathView text={question.body_text} /></div>
                {question.image_url && <img src={question.image_url} alt="" className="mb-4 max-h-80 rounded-lg object-contain" />}
                <ul className="space-y-3">
                  {(question.options || []).map((option) => (
                    <li key={option.id} className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
                      <span className="font-bold">{option.label}.</span>
                      <span className="flex-1"><CbtMathView text={option.option_text || ''} />{option.image_url && <img src={option.image_url} alt="" className="mt-3 max-h-48 rounded object-contain" />}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {releasedExam?.questions?.length === 0 && <p className="rounded-xl bg-white p-6 text-slate-600">No questions are available.</p>}
        </div>
      </main>
    );
  }

  if (stage === 'released') {
    return (
      <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
        <div className="mx-auto max-w-4xl">
          <button type="button" onClick={() => { setStage('available'); void loadExams(); }} className="mb-5 flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Available exams</button>
          <h1 className="mb-5 text-2xl font-bold text-slate-900">Released questions</h1>
          <div className="space-y-3">
            {releasedExams.map((exam) => (
              <button key={exam.exam_id} type="button" onClick={() => { setReleasedExam(exam); setStage('released-detail'); }} className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-blue-300">
                <span><span className="block font-semibold text-slate-900">{exam.title}</span><span className="mt-1 block text-sm text-slate-600">{exam.subject} · {exam.term}</span></span>
                <span className="text-sm font-semibold text-blue-700">{exam.questions.length} questions</span>
              </button>
            ))}
            {releasedExams.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">No questions have been released to you.</p>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <button type="button" onClick={goToDashboard} className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Student dashboard</button>
            <h1 className="text-2xl font-bold text-slate-900">Available exams</h1>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void loadExams()} className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /> Refresh</button>
            <button type="button" disabled={releasedLoading} onClick={() => void openReleasedQuestions()} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50">{releasedLoading ? 'Loading…' : 'Released questions'}</button>
          </div>
        </header>
        {pageError && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{pageError}</p>}
        {loading ? (
          <p className="flex items-center gap-2 text-slate-600"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading available exams…</p>
        ) : exams.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">There are no available exams right now.</p>
        ) : (
          <div className="space-y-3">
            {exams.map((exam) => (
              <article key={`${exam.exam_id}-${exam.batch_id}`} className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">{exam.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{exam.subject} · {exam.term} · {exam.duration_minutes} minutes</p>
                  {exam.attempt_submitted_at && <p className="mt-2 text-sm font-semibold text-emerald-700">Submitted</p>}
                </div>
                <button
                  type="button"
                  disabled={starting || Boolean(exam.attempt_submitted_at)}
                  onClick={() => startFromListing(exam)}
                  className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {exam.attempt_submitted_at ? 'Submitted' : exam.attempt_started_at ? 'Continue exam' : exam.student_status === 'CODE_ENTERED' ? 'Continue' : 'Enter code'}
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
