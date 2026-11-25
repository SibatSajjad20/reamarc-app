import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckSquare,
  Loader2,
  Mic,
  StopCircle,
} from 'lucide-react';
import { FormDialog, FormDialogBody } from '@/components/ui/FormDialogLayout';
import { Button } from '@/components/ui/button';
import { FormFooter } from '@/components/ui/FormFooter';
import { taskService } from '@/services/taskService';
import { useToast } from '@/context/ToastContext';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { canUseVoiceTask } from '@/utils/taskAccess';
import { CollectiveSubtaskRows } from './CollectiveSubtaskRows';
import {
  collectiveRowsError,
  isLeadOwnerCandidate,
  newCollectiveRow,
  type CollectiveSubtaskRow,
} from '@/utils/collectiveTask';
import type {
  Task,
  TaskActor,
  TaskAssignableUser,
  TaskPriority,
  TaskStatus,
  VoiceTaskParseResponse,
} from '@/types/task';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (task: Task) => void;
  assignable: TaskAssignableUser[];
  actor: TaskActor | null;
  workspaces?: Array<{ id: string; name: string }>;
}

type Step = 'idle' | 'recording' | 'processing' | 'draft' | 'saving';

export const VOICE_MAX_SECONDS = 60;
export const VOICE_MAX_BYTES = 3 * 1024 * 1024;
export const VOICE_MAX_TEXT = 600;
const VOICE_AUDIO_BITS_PER_SECOND = 32000;
const TOO_LONG_MSG = 'Recording is too large. Keep voice commands under 60 seconds.';

export const TaskVoiceModal: React.FC<Props> = ({
  open,
  onClose,
  onSaved,
  assignable,
  actor,
  workspaces: propWorkspaces,
}) => {
  const { addToast } = useToast();
  const { workspaces: hookWorkspaces } = useWorkspaces();
  const allWorkspaces = propWorkspaces && propWorkspaces.length > 0 ? propWorkspaces : hookWorkspaces;

  const [step, setStep] = useState<Step>('idle');
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [typedCommand, setTypedCommand] = useState('');

  // Draft fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [watcherIds, setWatcherIds] = useState<string[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [dueTime, setDueTime] = useState<string>('');
  const [estimateHours, setEstimateHours] = useState<string>('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [checklist, setChecklist] = useState<Array<{ text: string }>>([]);
  const [collectiveDraft, setCollectiveDraft] = useState(false);
  const [collectiveRows, setCollectiveRows] = useState<CollectiveSubtaskRow[]>([]);
  const [ambiguousCandidates, setAmbiguousCandidates] = useState<
    Array<{ id: string; name: string; department?: string; role?: string }>
  >([]);
  const [unrecognizedAssignee, setUnrecognizedAssignee] = useState<string | null>(null);
  const [unrecognizedCompany, setUnrecognizedCompany] = useState<string | null>(null);
  const [unrecognizedWatchers, setUnrecognizedWatchers] = useState<string[]>([]);
  // Sub-task rows whose spoken name matched several people or nobody, keyed by row key.
  const [subtaskHints, setSubtaskHints] = useState<
    Record<string, { spoken: string | null; candidates: Array<{ id: string; name: string; department?: string }> }>
  >({});

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const elapsedRef = useRef(0);
  const autoStoppedRef = useRef(false);
  const finishRef = useRef<() => void>(() => {});

  // Reset state whenever modal is opened or closed
  useEffect(() => {
    cleanup();
    setStep('idle');
    setSeconds(0);
    setErrorMsg(null);
    setTranscript('');
    setTypedCommand('');
    setTitle('');
    setDescription('');
    setStatus('todo');
    setAssigneeId('');
    setWatcherIds([]);
    setWorkspaceId('');
    setStartDate('');
    setDueDate('');
    setDueTime('');
    setEstimateHours('');
    setPriority('medium');
    setChecklist([]);
    setCollectiveDraft(false);
    setCollectiveRows([]);
    setAmbiguousCandidates([]);
    setUnrecognizedAssignee(null);
    setUnrecognizedCompany(null);
    setUnrecognizedWatchers([]);
    setSubtaskHints({});
    return () => {
      cleanup();
    };
  }, [open]);

  const cleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch {
        /* ignore */
      }
      streamRef.current = null;
    }
  };

  // Triggered strictly by user click to guarantee browser user gesture activation
  const handleStartRecording = async () => {
    cleanup();
    setErrorMsg(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support audio recording. Please use Chrome, Edge, or Opera.');
      }

      // Request stream directly inside the user click handler
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      }

      let recorder: MediaRecorder;
      try {
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: VOICE_AUDIO_BITS_PER_SECOND })
          : new MediaRecorder(stream, { audioBitsPerSecond: VOICE_AUDIO_BITS_PER_SECOND });
      } catch {
        recorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(100);

      // Successfully started
      setSeconds(0);
      elapsedRef.current = 0;
      autoStoppedRef.current = false;
      setStep('recording');

      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setSeconds(elapsedRef.current);
        // Hard 60 s cap: stop and process exactly once
        if (elapsedRef.current >= VOICE_MAX_SECONDS && !autoStoppedRef.current) {
          autoStoppedRef.current = true;
          finishRef.current();
        }
      }, 1000);
    } catch (err: any) {
      cleanup();
      if (err?.name === 'NotAllowedError' || /permission|denied|blocked/i.test(err?.message || '')) {
        setErrorMsg('Microphone permission was denied. Check the site permissions icon in your browser address bar.');
      } else if (err?.name === 'NotFoundError' || /devices? not found/i.test(err?.message || '')) {
        setErrorMsg('No microphone hardware device found.');
      } else if (err?.name === 'NotReadableError' || /hardware error/i.test(err?.message || '')) {
        setErrorMsg('Microphone is currently held or muted by another application (e.g. Discord, Zoom, or Windows settings).');
      } else {
        setErrorMsg(err?.message || 'Failed to start microphone recording.');
      }
    }
  };

  const handleCancelRecording = () => {
    cleanup();
    setStep('idle');
    setSeconds(0);
  };

  const applyParsedResponse = (res: VoiceTaskParseResponse, fallbackRawText?: string) => {
    setTranscript(res.transcript || fallbackRawText || '');
    setTitle(res.task.title || '');
    setDescription(res.task.description || '');
    setStatus('todo');

    // STRICT DROPDOWN LOCK: Only assign if assignee_id strictly exists in assignable dropdown
    const matched = res.task.assignee_id ? assignable.find((u) => u.id === res.task.assignee_id) : null;
    setAssigneeId(matched ? matched.id : '');

    // Company / Workspace
    const matchedWs = res.task.company_id ? allWorkspaces.find((w) => w.id === res.task.company_id) : null;
    setWorkspaceId(matchedWs ? matchedWs.id : '');

    // Watchers: filter against assignable dropdown, exclude assignee
    const rawWatcherIds = res.task.watcher_ids || [];
    const validWatchers = rawWatcherIds.filter(
      (id) => assignable.some((u) => u.id === id) && id !== (matched ? matched.id : '')
    );
    setWatcherIds(validWatchers);

    setStartDate(res.task.start_date || '');
    setDueDate(res.task.due_date || '');
    setDueTime(res.task.due_time || '');
    setEstimateHours(res.task.estimate_hours != null ? String(res.task.estimate_hours) : '');
    setPriority((res.task.priority as TaskPriority) || 'medium');
    setChecklist(res.task.checklist || []);
    const spokenSubs = res.task.is_collective ? res.task.subtasks || [] : [];
    setCollectiveDraft(spokenSubs.length > 0);
    const rows = spokenSubs.map((sub) =>
      newCollectiveRow({
        title: sub.title,
        assignee_id: sub.assignee_id && assignable.some((u) => u.id === sub.assignee_id) ? sub.assignee_id : '',
      }),
    );
    const hints: typeof subtaskHints = {};
    spokenSubs.forEach((sub, i) => {
      if (rows[i].assignee_id) return;
      const candidates = (sub.ambiguous_candidates || []).filter((c) => assignable.some((u) => u.id === c.id));
      if (candidates.length || sub.unrecognized_assignee) {
        hints[rows[i].key] = { spoken: sub.unrecognized_assignee || null, candidates };
      }
    });
    setCollectiveRows(rows);
    setSubtaskHints(hints);
    setAmbiguousCandidates(res.confidence?.ambiguous_candidates || []);
    setUnrecognizedAssignee(res.confidence?.unrecognized_assignee || null);
    setUnrecognizedCompany(res.confidence?.unrecognized_company || null);
    setUnrecognizedWatchers(res.confidence?.unrecognized_watchers || []);
    setStep('draft');
  };

  const handleFinishRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      handleCancelRecording();
      return;
    }

    setStep('processing');
    setErrorMsg(null);

    recorder.onstop = async () => {
      // Release the microphone as soon as recording stops, before the upload.
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach((track) => track.stop());
        } catch {
          /* ignore */
        }
        streamRef.current = null;
      }
      try {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });

        if (blob.size < 100) {
          throw new Error('Audio recording too short. Please speak and try again.');
        }
        if (blob.size > VOICE_MAX_BYTES) {
          throw new Error(TOO_LONG_MSG);
        }

        const res: VoiceTaskParseResponse = await taskService.voiceParseTask({ audio: blob });
        applyParsedResponse(res);
      } catch (err: any) {
        setErrorMsg(err?.message || 'Failed to transcribe or parse voice command.');
        setStep('idle');
      }
    };

    recorder.stop();
  };
  useEffect(() => {
    finishRef.current = handleFinishRecording;
  });

  const handleTestTyped = async () => {
    if (!typedCommand.trim()) return;
    setStep('processing');
    setErrorMsg(null);
    try {
      const res: VoiceTaskParseResponse = await taskService.voiceParseTask({ text: typedCommand.trim() });
      applyParsedResponse(res, typedCommand.trim());
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to parse command.');
      setStep('idle');
    }
  };

  const handleSave = async () => {
    setErrorMsg(null);
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setErrorMsg('Task title is required.');
      return;
    }
    if (cleanTitle.length > 200) {
      setErrorMsg('Task title cannot exceed 200 characters.');
      return;
    }

    if (description.trim().length > 10000) {
      setErrorMsg('Task description cannot exceed 10,000 characters.');
      return;
    }

    if (startDate && dueDate && startDate > dueDate) {
      setErrorMsg('Start date cannot be after due date.');
      return;
    }

    if (dueTime && !dueDate) {
      setErrorMsg('Please select a due date when specifying a due time.');
      return;
    }

    let parsedHours: number | undefined = undefined;
    if (estimateHours.trim() !== '') {
      parsedHours = parseFloat(estimateHours);
      if (isNaN(parsedHours) || parsedHours < 0 || parsedHours > 1000) {
        setErrorMsg('Expected hours must be a valid number between 0 and 1000.');
        return;
      }
    }

    if (collectiveDraft) {
      const lead = assignable.find((u) => u.id === assigneeId);
      if (!lead || !isLeadOwnerCandidate(lead)) {
        setErrorMsg('Pick a team lead as the lead owner of a collective task.');
        return;
      }
      const rowsErr = collectiveRowsError(collectiveRows);
      if (rowsErr) {
        setErrorMsg(rowsErr);
        return;
      }
    }

    setStep('saving');

    try {
      const payload: any = {
        title: cleanTitle,
        description: description.trim(),
        priority,
      };

      if (assigneeId) payload.assignee_id = assigneeId;
      if (watcherIds.length > 0) payload.watcher_ids = watcherIds;
      if (startDate) payload.start_date = startDate;
      if (dueDate) payload.due_date = dueDate;
      if (dueTime) payload.due_time = dueTime;
      if (parsedHours !== undefined) {
        payload.estimate_hours = parsedHours;
      }
      if (workspaceId) {
        const ws = allWorkspaces.find((w) => w.id === workspaceId);
        payload.related = {
          workspace_id: workspaceId,
          client_name: ws?.name || undefined,
        };
      }
      if (checklist.length > 0) {
        payload.checklist = checklist.map((c) => ({ text: c.text }));
      }

      if (collectiveDraft) {
        const createdCollective = await taskService.createCollective({
          main: payload,
          subtasks: collectiveRows.map((r) => ({ title: r.title.trim(), assignee_id: r.assignee_id })),
        });
        addToast('Collective task created', `${createdCollective.serial} · ${collectiveRows.length} sub-tasks`, 'success');
        onSaved(createdCollective);
        onClose();
        return;
      }

      const created = await taskService.createTask(payload);

      // If user chose a status other than 'todo', transition stage
      let finalTask = created;
      if (status && status !== 'todo') {
        try {
          finalTask = await taskService.changeStage(created.id, status);
        } catch {
          // Keep created task if stage change fails
        }
      }

      addToast('Task created', finalTask.serial || finalTask.title, 'success');
      onSaved(finalTask);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to create task.');
      setStep('draft');
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Admin & Team Lead gate (after all hooks so hook order never changes)
  if (actor && !canUseVoiceTask(actor)) {
    return null;
  }

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      title={
        <div className="flex items-center gap-2">
          <Mic className="w-5 h-5 text-accent" />
          <span className="font-semibold text-fg">New Task by Voice</span>
        </div>
      }
      subtitle="Dictate your assignment or type details below"
    >
      <FormDialogBody className="space-y-5 custom-scrollbar">
        {errorMsg && (
          <div className="flex items-start gap-2.5 p-3.5 text-sm text-danger-fg bg-danger-bg border border-danger-bd rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <div className="font-medium">{errorMsg}</div>
              <div className="text-xs text-danger-fg/80">
                You can also type your task assignment directly in the box below.
              </div>
            </div>
          </div>
        )}

        {/* STATE 1: IDLE / READY TO RECORD */}
        {step === 'idle' && (
          <div className="space-y-5">
            <div className="flex flex-col items-center justify-center p-8 bg-subtle/50 border border-border rounded-xl text-center space-y-4">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-accent-soft text-accent">
                <Mic className="w-7 h-7" />
              </div>

              <div className="space-y-1.5 max-w-sm">
                <h4 className="text-base font-semibold text-fg">Ready to Dictate</h4>
                <p className="text-xs text-fg-muted">
                  Click the button below and speak your assignment: state the task, assignee, due date, and priority.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleStartRecording}
                >
                  <Mic className="w-4 h-4 mr-1.5" />
                  Start Speaking
                </Button>
              </div>
            </div>

            {/* Manual text fallback */}
            <div className="p-4 bg-subtle/30 border border-border rounded-lg space-y-2">
              <p className="text-xs font-medium text-fg-muted">
                Or type your command directly:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={typedCommand}
                  onChange={(e) => setTypedCommand(e.target.value.slice(0, VOICE_MAX_TEXT))}
                  maxLength={VOICE_MAX_TEXT}
                  placeholder="e.g. Assign website banner to Hamza by tomorrow 5pm urgent"
                  className="flex-1 h-9 px-3 rounded-md bg-surface border border-border text-sm text-fg focus:border-accent focus:outline-hidden"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleTestTyped();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handleTestTyped}
                  disabled={!typedCommand.trim()}
                >
                  Parse
                </Button>
              </div>
              <p className="text-xs text-fg-muted text-right">
                {typedCommand.length}/{VOICE_MAX_TEXT}
              </p>
            </div>
          </div>
        )}

        {/* STATE 2: ACTIVE RECORDING */}
        {step === 'recording' && (
          <div className="flex flex-col items-center justify-center p-8 bg-subtle/50 border border-border rounded-xl text-center space-y-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-accent-soft text-accent">
              <Mic className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-danger-solid animate-pulse" />
                <span className="text-2xl font-semibold font-mono text-fg tracking-tight">
                  {formatSeconds(seconds)} / {formatSeconds(VOICE_MAX_SECONDS)}
                </span>
              </div>
              <p className="text-xs text-fg-muted">
                Listening... Click "Done Speaking" when you finish dictating.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={handleCancelRecording}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleFinishRecording}
              >
                <StopCircle className="w-4 h-4 mr-1.5" />
                Done Speaking
              </Button>
            </div>
          </div>
        )}

        {/* STATE 3: PROCESSING */}
        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center py-16 space-y-3 text-center">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-fg">Processing task details...</h4>
              <p className="text-xs text-fg-muted">Transcribing audio and extracting assignment fields</p>
            </div>
          </div>
        )}

        {/* STATE 4: DRAFT REVIEW & CONFIRM */}
        {(step === 'draft' || step === 'saving') && (
          <div className="space-y-5">
            {transcript && (
              <div className="p-3 bg-subtle border border-border rounded-lg space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-fg-muted uppercase tracking-wider flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5 text-accent" />
                    <span>Voice Command</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      cleanup();
                      setStep('idle');
                      setTranscript('');
                    }}
                    className="text-xs text-accent-text hover:underline font-medium"
                  >
                    Re-record
                  </button>
                </div>
                <div className="text-sm italic text-fg">"{transcript}"</div>
              </div>
            )}

            {/* Ambiguous candidates banner */}
            {ambiguousCandidates.length > 0 && (
              <div className="p-3 border border-warning-bd bg-warning-bg rounded-lg space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-warning-fg">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Multiple matches found for assignee. Click to select:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ambiguousCandidates.map((c) => {
                    const isSelected = assigneeId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setAssigneeId(c.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                          isSelected
                            ? 'bg-accent text-accent-fg border-accent'
                            : 'bg-surface text-fg border-border hover:bg-subtle'
                        }`}
                      >
                        <span>{c.name} {c.department ? `(${c.department})` : ''}</span>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Unrecognized assignee notice */}
            {unrecognizedAssignee && (
              <div className="flex items-start gap-2.5 p-3 border border-warning-bd bg-warning-bg rounded-lg text-xs text-warning-fg">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold">
                    Mentioned person "{unrecognizedAssignee}" was not found in the team roster.
                  </div>
                  <div className="text-warning-fg/80">
                    The task was left Unassigned so you can select someone from the employee dropdown below.
                  </div>
                </div>
              </div>
            )}

            {/* Unrecognized company notice */}
            {unrecognizedCompany && (
              <div className="flex items-start gap-2.5 p-3 border border-warning-bd bg-warning-bg rounded-lg text-xs text-warning-fg">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold">
                    Mentioned company "{unrecognizedCompany}" was not found in active clients.
                  </div>
                  <div className="text-warning-fg/80">
                    Left as None (Internal / General). You can select a company from the dropdown below if needed.
                  </div>
                </div>
              </div>
            )}

            {/* Unrecognized watchers notice */}
            {unrecognizedWatchers.length > 0 && (
              <div className="flex items-start gap-2.5 p-3 border border-warning-bd bg-warning-bg rounded-lg text-xs text-warning-fg">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="font-semibold">
                  Watcher{unrecognizedWatchers.length > 1 ? 's' : ''} {unrecognizedWatchers.map((w) => `"${w}"`).join(', ')} not
                  found in the team roster. Add them from the Watchers dropdown below.
                </div>
              </div>
            )}

            {/* Task Form Inputs */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-fg-muted mb-1.5">
                  Task Title <span className="text-danger-fg">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-9 px-3 rounded-md bg-subtle border border-border text-sm text-fg focus:border-accent focus:outline-hidden"
                  placeholder="Task title..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-fg-muted mb-1.5">
                  Task Description <span className="text-fg-muted/70 font-normal">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full p-2.5 rounded-md bg-subtle border border-border text-sm text-fg focus:border-accent focus:outline-hidden resize-y min-h-[72px]"
                  placeholder="Task description, context, or instructions..."
                />
              </div>

              {/* Status & Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-fg-muted mb-1.5">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TaskStatus)}
                    className="w-full h-9 px-3 rounded-md bg-subtle border border-border text-sm text-fg focus:border-accent focus:outline-hidden"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="in_review">In Review</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-fg-muted mb-1.5">
                    Priority
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['low', 'medium', 'high', 'urgent'] as TaskPriority[]).map((p) => {
                      const isSelected = priority === p;
                      const activeClass =
                        p === 'urgent'
                          ? 'bg-danger-solid text-white border-danger-solid'
                          : p === 'high'
                          ? 'bg-warning-bg text-warning-fg border-warning-bd'
                          : p === 'medium'
                          ? 'bg-info-bg text-info-fg border-info-bd'
                          : 'bg-neutral-bg text-neutral-fg border-neutral-bd';

                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPriority(p)}
                          className={`h-9 px-2 text-xs font-medium rounded-md border capitalize transition-colors text-center ${
                            isSelected
                              ? `${activeClass} font-semibold shadow-xs`
                              : 'bg-surface text-fg-2 border-border hover:bg-subtle hover:text-fg'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Assignee & Company / Client */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-fg-muted mb-1.5">
                    {collectiveDraft ? 'Lead owner (team lead)' : 'Assignee'}
                  </label>
                  <select
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    className="w-full h-9 px-3 rounded-md bg-subtle border border-border text-sm text-fg focus:border-accent focus:outline-hidden"
                  >
                    <option value="">Unassigned</option>
                    {assignable.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} {u.department ? `(${u.department})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-fg-muted mb-1.5">
                    Company / Client <span className="text-fg-muted/70 font-normal">(optional)</span>
                  </label>
                  <select
                    value={workspaceId}
                    onChange={(e) => setWorkspaceId(e.target.value)}
                    className="w-full h-9 px-3 rounded-md bg-subtle border border-border text-sm text-fg focus:border-accent focus:outline-hidden"
                  >
                    <option value="">None (Internal / General)</option>
                    {allWorkspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Watchers */}
              <div>
                <label className="block text-xs font-medium text-fg-muted mb-1.5">
                  Watchers <span className="text-fg-muted/70 font-normal">(optional, keeps team members informed)</span>
                </label>
                <div className="space-y-2">
                  <select
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v && !watcherIds.includes(v)) {
                        setWatcherIds((prev) => [...prev, v]);
                      }
                    }}
                    className="w-full h-9 px-3 rounded-md bg-subtle border border-border text-sm text-fg focus:border-accent focus:outline-hidden"
                  >
                    <option value="">+ Add watcher...</option>
                    {assignable
                      .filter((u) => !watcherIds.includes(u.id) && u.id !== assigneeId)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} {u.department ? `(${u.department})` : ''}
                        </option>
                      ))}
                  </select>

                  {watcherIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {watcherIds.map((id) => {
                        const u = assignable.find((x) => x.id === id);
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-subtle text-fg border border-border"
                          >
                            <span>{u?.name || id}</span>
                            <button
                              type="button"
                              onClick={() => setWatcherIds((prev) => prev.filter((x) => x !== id))}
                              className="text-fg-muted hover:text-danger-fg transition-colors font-bold text-sm leading-none ml-0.5"
                              title="Remove watcher"
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Start Date, Due Date, Due Time & Expected Hours */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-fg-muted mb-1.5">
                    Start Date <span className="text-fg-muted/70 font-normal">(optional)</span>
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full h-9 px-3 rounded-md bg-subtle border border-border text-sm text-fg focus:border-accent focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-fg-muted mb-1.5">
                    Due Date <span className="text-fg-muted/70 font-normal">(optional)</span>
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full h-9 px-3 rounded-md bg-subtle border border-border text-sm text-fg focus:border-accent focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-fg-muted mb-1.5">
                    Due Time <span className="text-fg-muted/70 font-normal">(optional)</span>
                  </label>
                  <input
                    type="time"
                    value={dueTime}
                    onChange={(e) => setDueTime(e.target.value)}
                    className="w-full h-9 px-3 rounded-md bg-subtle border border-border text-sm text-fg focus:border-accent focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-fg-muted mb-1.5">
                    Expected Hours <span className="text-fg-muted/70 font-normal">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    step="0.5"
                    placeholder="e.g. 4"
                    value={estimateHours}
                    onChange={(e) => setEstimateHours(e.target.value)}
                    className="w-full h-9 px-3 rounded-md bg-subtle border border-border text-sm text-fg focus:border-accent focus:outline-hidden"
                  />
                </div>
              </div>

              {collectiveDraft && (
                <div className="space-y-2 p-3 bg-subtle border border-border rounded-md" data-testid="voice-collective-draft">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-fg">Collective task: check each sub-task before saving</span>
                    <button
                      type="button"
                      className="text-micro text-fg-muted underline"
                      onClick={() => {
                        setCollectiveDraft(false);
                        setCollectiveRows([]);
                      }}
                    >
                      Make it a single task
                    </button>
                  </div>
                  <CollectiveSubtaskRows rows={collectiveRows} users={assignable} disabled={step === 'saving'} onChange={setCollectiveRows} />
                  {collectiveRows.map((row, i) => {
                    const hint = subtaskHints[row.key];
                    if (!hint || row.assignee_id) return null;
                    return (
                      <div
                        key={row.key}
                        className="p-2.5 border border-warning-bd bg-warning-bg rounded-lg space-y-1.5 text-xs text-warning-fg"
                        data-testid="voice-subtask-pick"
                      >
                        <div className="flex items-center gap-1.5 font-semibold">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {hint.candidates.length
                              ? `Sub-task ${i + 1}: several people match${hint.spoken ? ` "${hint.spoken}"` : ''}. Click to select:`
                              : `Sub-task ${i + 1}: "${hint.spoken}" was not found in the team roster. Pick someone above.`}
                          </span>
                        </div>
                        {hint.candidates.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {hint.candidates.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                disabled={step === 'saving'}
                                onClick={() =>
                                  setCollectiveRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, assignee_id: c.id } : r)))
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border bg-surface text-fg border-border hover:bg-subtle transition-colors"
                              >
                                {c.name} {c.department ? `(${c.department})` : ''}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {checklist.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-fg-muted mb-1.5">
                    Checklist ({checklist.length})
                  </label>
                  <div className="space-y-1.5 p-3 bg-subtle border border-border rounded-md">
                    {checklist.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-fg">
                        <CheckSquare className="w-3.5 h-3.5 text-accent shrink-0" />
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </FormDialogBody>
      {(step === 'draft' || step === 'saving') && (
        <FormFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={step === 'saving'}
            onClick={handleSave}
          >
            {step === 'saving' ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Creating Task...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-1.5" />
                Confirm & Assign Task
              </>
            )}
          </Button>
        </FormFooter>
      )}
    </FormDialog>
  );
};
