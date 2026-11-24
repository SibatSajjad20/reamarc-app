import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  AlertCircle,
  Building2,
  Calendar,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  Mic,
  StopCircle,
  Timer,
  X,
} from 'lucide-react-native';
import { useTheme } from '../../theme';
import { SelectField } from '../../ui/SelectField';
import {
  cancelVoiceRecording,
  isAudioRecordingAvailable,
  parseVoiceTaskAudio,
  parseVoiceTaskText,
  startVoiceRecording,
  stopVoiceRecording,
  type VoiceTaskParseResponse,
} from '../../lib/voiceRecording';
import {
  changeTaskStage,
  createTask,
  listTaskAssignees,
  listTaskClients,
  TASK_PRIORITY_OPTIONS,
  TASK_STAGES,
  type Task,
  type TaskClientOption,
  type TaskPerson,
  type TaskPriority,
  type TaskStatus,
} from '../../lib/tasks';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved: (task: Task) => void;
};

type Step = 'idle' | 'recording' | 'processing' | 'draft' | 'saving';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseIso(iso?: string | null): Date {
  if (!iso) return new Date();
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatPrettyDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    return parseIso(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatPrettyTime(timeStr?: string | null): string {
  if (!timeStr) return '';
  try {
    const [h, m] = timeStr.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  } catch {
    return timeStr;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/** Professional monthly calendar sheet */
function CalendarModal({
  visible,
  title,
  value,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  value: string;
  onClose: () => void;
  onSelect: (iso: string) => void;
}) {
  const theme = useTheme();
  const selected = value ? parseIso(value) : null;
  const [cursor, setCursor] = useState(() => (selected ? new Date(selected) : new Date()));

  useEffect(() => {
    if (visible) setCursor(selected ? new Date(selected) : new Date());
  }, [visible, value]);

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const startPad = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: Array<{ iso: string; day: number; inMonth: boolean }> = [];
    for (let i = 0; i < startPad; i += 1) {
      const d = new Date(year, month, 1 - (startPad - i));
      out.push({ iso: toIsoDate(d), day: d.getDate(), inMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      out.push({ iso: toIsoDate(new Date(year, month, day)), day, inMonth: true });
    }
    while (out.length % 7 !== 0) {
      const d = new Date(year, month, daysInMonth + (out.length - startPad - daysInMonth) + 1);
      out.push({ iso: toIsoDate(d), day: d.getDate(), inMonth: false });
    }
    return out;
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const todayIso = toIsoDate(new Date());

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={calStyles.sheetRoot}>
        <Pressable style={calStyles.sheetFlex} onPress={onClose} />
        <View style={[calStyles.calSheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[calStyles.calHead, { borderBottomColor: theme.border }]}>
            <Text style={[calStyles.calTitle, { color: theme.text }]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={[calStyles.iconBtn, { backgroundColor: theme.bgSubtle }]}>
              <X size={16} color={theme.textMuted} />
            </Pressable>
          </View>

          <View style={calStyles.calNav}>
            <Pressable
              onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              style={[calStyles.navBtn, { backgroundColor: theme.bgSubtle }]}
              hitSlop={8}
            >
              <ChevronLeft size={18} color={theme.text} />
            </Pressable>
            <Text style={[calStyles.monthLabel, { color: theme.text }]}>{monthLabel}</Text>
            <Pressable
              onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              style={[calStyles.navBtn, { backgroundColor: theme.bgSubtle }]}
              hitSlop={8}
            >
              <ChevronRight size={18} color={theme.text} />
            </Pressable>
          </View>

          <View style={calStyles.weekRow}>
            {WEEKDAYS.map((d) => (
              <View key={d} style={calStyles.weekCell}>
                <Text style={[calStyles.weekText, { color: theme.textMuted }]}>{d}</Text>
              </View>
            ))}
          </View>

          {chunk(cells, 7).map((row, rIdx) => (
            <View key={rIdx} style={calStyles.calRow}>
              {row.map((cell) => {
                const isSelected = value === cell.iso;
                const isToday = cell.iso === todayIso;
                return (
                  <View key={cell.iso + String(cell.inMonth)} style={calStyles.dayWrap}>
                    <Pressable
                      onPress={() => {
                        onSelect(cell.iso);
                        onClose();
                      }}
                      style={[
                        calStyles.dayInner,
                        isToday && !isSelected ? { borderWidth: 1.5, borderColor: theme.primary } : null,
                        isSelected ? { backgroundColor: theme.primary, borderColor: theme.primary } : null,
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: isSelected || isToday ? '700' : '500',
                          color: isSelected ? '#fff' : cell.inMonth ? theme.text : theme.textSubtle,
                        }}
                      >
                        {cell.day}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}

          <View style={[calStyles.calActions, { borderTopColor: theme.border }]}>
            {value ? (
              <Pressable
                onPress={() => {
                  onSelect('');
                  onClose();
                }}
                style={[calStyles.clearBtn, { borderColor: theme.border }]}
              >
                <Text style={[calStyles.clearBtnText, { color: theme.textMuted }]}>Clear Date</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => {
                onSelect(todayIso);
                onClose();
              }}
              style={[calStyles.todayBtn, { backgroundColor: theme.primaryLight }]}
            >
              <Text style={[calStyles.todayBtnText, { color: theme.primary }]}>Select Today</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

class VoiceTaskErrorBoundary extends React.Component<
  { onClose: () => void; children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { onClose: () => void; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('VoiceTaskModal ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Modal visible animationType="fade" transparent onRequestClose={this.props.onClose}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ width: '100%', maxWidth: 360, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, alignItems: 'center' }}>
              <AlertCircle size={44} color="#E11D48" style={{ marginBottom: 14 }} />
              <Text style={{ fontSize: 17, fontWeight: '700', marginBottom: 8, color: '#111827', textAlign: 'center' }}>
                Voice Assistant Unavailable
              </Text>
              <Text style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 20, lineHeight: 18 }}>
                {this.state.error?.message || 'An unexpected rendering error occurred. Please try typing or reopening.'}
              </Text>
              <Pressable
                onPress={this.props.onClose}
                style={{
                  width: '100%',
                  height: 44,
                  backgroundColor: '#4F46E5',
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 14 }}>Dismiss</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      );
    }
    return this.props.children;
  }
}

function VoiceTaskModalInner({ visible, onClose, onSaved }: Props) {
  const theme = useTheme();

  const [hasNativeAudio, setHasNativeAudio] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [seconds, setSeconds] = useState(0);
  const [typedCommand, setTypedCommand] = useState('');
  const [transcript, setTranscript] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Roster & Clients
  const [assignees, setAssignees] = useState<TaskPerson[]>([]);
  const [clients, setClients] = useState<TaskClientOption[]>([]);

  // Draft fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [watcherIds, setWatcherIds] = useState<string[]>([]);
  const [clientId, setClientId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [dueTime, setDueTime] = useState<string>('');
  const [estimateHours, setEstimateHours] = useState<string>('');
  const [checklist, setChecklist] = useState<Array<{ text: string }>>([]);
  const [ambiguousCandidates, setAmbiguousCandidates] = useState<
    Array<{ id: string; name: string; department?: string; role?: string }>
  >([]);

  // Pickers & Modals
  const [calTarget, setCalTarget] = useState<'start' | 'due' | null>(null);
  const [showTimeModal, setShowTimeModal] = useState(false);

  const timerRef = useRef<any>(null);
  const scrollViewRef = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulsing animation for active recording
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (step === 'recording') {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      );
      anim.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => {
      anim?.stop();
    };
  }, [step, pulseAnim]);

  // Load assignees and clients on modal open
  useEffect(() => {
    if (!visible) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      cancelVoiceRecording().catch(() => {});
      return;
    }

    setHasNativeAudio(isAudioRecordingAvailable());
    setStep('idle');
    setSeconds(0);
    setErrorMsg(null);
    setTranscript('');
    setTypedCommand('');
    setTitle('');
    setDescription('');
    setStatus('todo');
    setPriority('medium');
    setAssigneeId('');
    setWatcherIds([]);
    setClientId('');
    setStartDate('');
    setDueDate('');
    setDueTime('');
    setEstimateHours('');
    setChecklist([]);
    setAmbiguousCandidates([]);

    Promise.allSettled([listTaskAssignees(), listTaskClients()]).then(([pRes, cRes]) => {
      if (pRes.status === 'fulfilled' && pRes.value) {
        setAssignees(pRes.value);
      }
      if (cRes.status === 'fulfilled' && cRes.value) {
        setClients(cRes.value);
      }
    });

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      cancelVoiceRecording().catch(() => {});
    };
  }, [visible]);

  // Recording handlers
  const handleStartRecording = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setErrorMsg(null);

    if (!hasNativeAudio) {
      setErrorMsg('Microphone recording is not available in this build. You can dictate using your keyboard below.');
      return;
    }

    try {
      setSeconds(0);
      setStep('recording');

      timerRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);

      await startVoiceRecording();
    } catch (err: any) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setErrorMsg(err?.message || 'Could not start microphone recording. You can dictate below.');
      setStep('idle');
    }
  };

  const handleCancelRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    cancelVoiceRecording().catch(() => {});
    setStep('idle');
    setSeconds(0);
  };

  const handleFinishRecording = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setStep('processing');
    setErrorMsg(null);

    try {
      const { uri } = await stopVoiceRecording();
      const res: VoiceTaskParseResponse = await parseVoiceTaskAudio(uri);
      applyParseResponse(res);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to transcribe or parse voice command.');
      setStep('idle');
    }
  };

  const handleTestTyped = async () => {
    const clean = typedCommand.trim();
    if (!clean) return;

    Keyboard.dismiss();
    setStep('processing');
    setErrorMsg(null);

    try {
      const res: VoiceTaskParseResponse = await parseVoiceTaskText(clean);
      applyParseResponse(res, clean);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to parse command.');
      setStep('idle');
    }
  };

  function applyParseResponse(res: VoiceTaskParseResponse, fallbackTranscript = '') {
    setTranscript(res.transcript || fallbackTranscript);
    setTitle(res.task?.title || '');
    setDescription(res.task?.description || '');
    setStatus('todo');
    setPriority(res.task?.priority || 'medium');
    setAssigneeId(res.task?.assignee_id || '');
    setWatcherIds(res.task?.watcher_ids || []);
    setClientId(res.task?.client_id || res.task?.company_id || '');
    setStartDate(res.task?.start_date || '');
    setDueDate(res.task?.due_date || '');
    setDueTime(res.task?.due_time || '');
    setEstimateHours(res.task?.estimate_hours != null ? String(res.task.estimate_hours) : '');
    setChecklist(res.task?.checklist || []);
    setAmbiguousCandidates(res.confidence?.ambiguous_candidates || []);
    setStep('draft');
  }

  const handleSave = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setErrorMsg('Task title is required.');
      return;
    }
    if (description.trim().length > 10000) {
      setErrorMsg('Task description cannot exceed 10,000 characters.');
      return;
    }

    setStep('saving');
    setErrorMsg(null);

    try {
      const payload: any = {
        title: cleanTitle,
        description: description.trim(),
        priority,
      };

      if (assigneeId) payload.assignee_id = assigneeId;
      if (watcherIds.length > 0) payload.watcher_ids = watcherIds;
      if (clientId) payload.client_id = clientId;
      if (startDate) payload.start_date = startDate;
      if (dueDate) payload.due_date = dueDate;
      if (dueTime) payload.due_time = dueTime;
      if (estimateHours && !isNaN(Number(estimateHours))) {
        payload.estimate_hours = Number(estimateHours);
      }
      if (checklist.length > 0) {
        payload.checklist = checklist.map((c) => ({ text: c.text }));
      }

      const created = await createTask(payload);

      let finalTask = created;
      if (status && status !== 'todo') {
        try {
          finalTask = await changeTaskStage(created.id, status);
        } catch {
          // Keep created task if stage change fails
        }
      }

      onSaved(finalTask);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to create task.');
      setStep('draft');
    }
  };

  const handleCancel = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    cancelVoiceRecording().catch(() => {});
    onClose();
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Convert dueTime string to Date object for picker
  const pickerTime = useMemo(() => {
    const d = new Date();
    if (!dueTime) {
      d.setHours(17, 0, 0, 0);
      return d;
    }
    const [h, m] = dueTime.split(':').map(Number);
    d.setHours(!Number.isNaN(h) ? h : 17, !Number.isNaN(m) ? m : 0, 0, 0);
    return d;
  }, [dueTime]);

  // SelectField options
  const statusOptions = useMemo(
    () =>
      TASK_STAGES.map((s) => ({
        value: s.value,
        label: s.label,
      })),
    [],
  );

  const assigneeOptions = useMemo(
    () => [
      { value: '', label: 'Unassigned' },
      ...assignees.map((u) => ({
        value: u.id,
        label: u.name,
        hint: u.department || u.role,
      })),
    ],
    [assignees],
  );

  const clientOptions = useMemo(
    () => [
      { value: '', label: 'No related company / client' },
      ...clients.map((c) => ({
        value: c.id,
        label: c.name,
      })),
    ],
    [clients],
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="pageSheet"
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView
        style={[styles.sheet, { backgroundColor: theme.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
          <View style={styles.headerLeft}>
            <View style={[styles.headerIconBox, { backgroundColor: theme.primaryLight }]}>
              <Mic size={18} color={theme.primary} />
            </View>
            <View style={styles.headerTextGroup}>
              <Text style={[styles.headerTitle, { color: theme.text }]}>New Task by Voice</Text>
              <Text style={[styles.headerSubtitle, { color: theme.textMuted }]}>
                Dictate your assignment or type details below
              </Text>
            </View>
          </View>

          <Pressable
            hitSlop={12}
            onPress={handleCancel}
            style={({ pressed }) => [
              styles.closeBtn,
              { backgroundColor: theme.bgSubtle, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <X size={16} color={theme.textMuted} />
          </Pressable>
        </View>

        {/* Body Content */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={true}
          >
            {errorMsg && (
              <View
                style={[
                  styles.errorBox,
                  {
                    backgroundColor: theme.roseLight,
                    borderColor: theme.rose,
                  },
                ]}
              >
                <AlertCircle size={16} color={theme.rose} style={{ marginTop: 2 }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.errorText, { color: theme.rose }]}>{errorMsg}</Text>
                  <Text style={[styles.errorSub, { color: theme.rose }]}>
                    You can also type your task assignment directly in the box below.
                  </Text>
                </View>
              </View>
            )}

            {/* STATE 1: IDLE / READY TO DICTATE */}
            {step === 'idle' && (
              <View style={styles.idleWrap}>
                {/* Voice Hero Card */}
                <View
                  style={[
                    styles.cardSection,
                    {
                      backgroundColor: theme.bgSubtle,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <View style={[styles.micHeroCircle, { backgroundColor: theme.primaryLight }]}>
                    <Mic size={26} color={theme.primary} />
                  </View>

                  <Text style={[styles.heroTitle, { color: theme.text }]}>Ready to Dictate</Text>
                  <Text style={[styles.heroSubtitle, { color: theme.textMuted }]}>
                    Tap the button below and speak your assignment: state the task, assignee, due
                    date, and priority.
                  </Text>

                  <View style={styles.centerBtnWrap}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.heroActionBtn,
                        styles.primaryBtn,
                        {
                          backgroundColor: theme.primary,
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                      onPress={handleStartRecording}
                    >
                      <Mic size={18} color="#FFFFFF" />
                      <Text style={styles.heroActionBtnText} numberOfLines={1}>
                        Start Speaking
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {/* Manual typed / dictation box */}
                <View
                  style={[
                    styles.manualSection,
                    {
                      backgroundColor: theme.bgSubtle,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
                    Or type your command directly:
                  </Text>

                  <TextInput
                    style={[
                      styles.commandInput,
                      {
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        color: theme.text,
                      },
                    ]}
                    multiline
                    numberOfLines={3}
                    value={typedCommand}
                    onChangeText={setTypedCommand}
                    placeholder="e.g. Assign website banner to Hamza by tomorrow 5pm urgent"
                    placeholderTextColor={theme.textSubtle}
                    returnKeyType="done"
                    onFocus={() => {
                      setTimeout(() => {
                        scrollViewRef.current?.scrollToEnd({ animated: true });
                      }, 120);
                    }}
                  />

                  <View style={styles.manualActionRow}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.parseBtn,
                        {
                          backgroundColor: typedCommand.trim() ? theme.primary : theme.border,
                          opacity: !typedCommand.trim() ? 0.5 : pressed ? 0.85 : 1,
                        },
                      ]}
                      disabled={!typedCommand.trim()}
                      onPress={handleTestTyped}
                    >
                      <Text style={styles.parseBtnText}>Parse</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            {/* STATE 2: ACTIVE RECORDING */}
            {step === 'recording' && (
              <View
                style={[
                  styles.recordingWrap,
                  {
                    backgroundColor: theme.bgSubtle,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Animated.View
                  style={[
                    styles.pulsingRing,
                    {
                      borderColor: theme.primaryLight,
                      transform: [{ scale: pulseAnim }],
                    },
                  ]}
                >
                  <View style={[styles.recordingMicCircle, { backgroundColor: theme.primary }]}>
                    <Mic size={30} color="#FFFFFF" />
                  </View>
                </Animated.View>

                <View style={styles.timerRow}>
                  <View style={[styles.liveDot, { backgroundColor: theme.rose }]} />
                  <Text style={[styles.timerValue, { color: theme.text }]}>
                    {formatSeconds(seconds)}
                  </Text>
                </View>

                <Text style={[styles.recordingHint, { color: theme.textMuted }]}>
                  Listening... Tap "Done Speaking" when you finish dictating.
                </Text>

                <View style={styles.centerBtnWrap}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.heroActionBtn,
                      styles.primaryBtn,
                      {
                        backgroundColor: theme.primary,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                    onPress={handleFinishRecording}
                  >
                    <StopCircle size={18} color="#FFFFFF" />
                    <Text style={styles.heroActionBtnText} numberOfLines={1}>
                      Done Speaking
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* STATE 3: PROCESSING */}
            {step === 'processing' && (
              <View style={styles.processingWrap}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={[styles.processingTitle, { color: theme.text }]}>
                  Processing task details...
                </Text>
                <Text style={[styles.processingSubtitle, { color: theme.textMuted }]}>
                  Transcribing audio and extracting assignment fields
                </Text>
              </View>
            )}

            {/* STATE 4: DRAFT REVIEW & CONFIRM */}
            {(step === 'draft' || step === 'saving') && (
              <View style={styles.draftWrap}>
                {/* Voice Command Banner */}
                {transcript ? (
                  <View
                    style={[
                      styles.transcriptCard,
                      {
                        backgroundColor: theme.bgSubtle,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <View style={styles.transcriptHead}>
                      <View style={styles.transcriptLabelRow}>
                        <Mic size={14} color={theme.primary} />
                        <Text style={[styles.transcriptLabel, { color: theme.textMuted }]}>
                          VOICE COMMAND
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          setStep('idle');
                          setTranscript('');
                        }}
                        hitSlop={8}
                      >
                        <Text style={[styles.reRecordBtn, { color: theme.primary }]}>Re-record</Text>
                      </Pressable>
                    </View>
                    <Text style={[styles.transcriptText, { color: theme.text }]}>"{transcript}"</Text>
                  </View>
                ) : null}

                {/* Ambiguous candidates banner */}
                {ambiguousCandidates.length > 0 && (
                  <View
                    style={[
                      styles.disambiguationBox,
                      {
                        backgroundColor: theme.amberLight,
                        borderColor: theme.amber,
                      },
                    ]}
                  >
                    <View style={styles.disambiguationHeader}>
                      <AlertCircle size={16} color={theme.amber} />
                      <Text style={[styles.disambiguationTitle, { color: theme.amber }]}>
                        Multiple matches found for assignee. Tap to select:
                      </Text>
                    </View>
                    <View style={calStyles.candidateChipsRow}>
                      {ambiguousCandidates.map((c) => {
                        const isSelected = assigneeId === c.id;
                        return (
                          <Pressable
                            key={c.id}
                            style={[
                              calStyles.candidateChip,
                              {
                                backgroundColor: isSelected ? theme.primary : theme.surface,
                                borderColor: isSelected ? theme.primary : theme.border,
                              },
                            ]}
                            onPress={() => setAssigneeId(c.id)}
                          >
                            <Text
                              style={[
                                calStyles.candidateChipText,
                                { color: isSelected ? '#FFFFFF' : theme.text },
                              ]}
                            >
                              {c.name} {c.department ? `(${c.department})` : ''}
                            </Text>
                            {isSelected && <Check size={14} color="#FFFFFF" />}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Form: Task Title */}
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
                    Task Title <Text style={{ color: theme.rose }}>*</Text>
                  </Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        color: theme.text,
                      },
                    ]}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Task title..."
                    placeholderTextColor={theme.textSubtle}
                  />
                </View>

                {/* Form: Description */}
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
                    Description
                  </Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      styles.textArea,
                      {
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        color: theme.text,
                      },
                    ]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Task description, context, or instructions..."
                    placeholderTextColor={theme.textSubtle}
                    multiline
                  />
                </View>

                {/* Form: Status */}
                <View style={styles.fieldGroup}>
                  <SelectField
                    label="Status"
                    value={status}
                    options={statusOptions}
                    onChange={(val) => setStatus(val as TaskStatus)}
                  />
                </View>

                {/* Form: Priority Selector */}
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Priority</Text>
                  <View style={styles.priorityRow}>
                    {TASK_PRIORITY_OPTIONS.map((p) => {
                      const isSelected = priority === p.value;
                      let activeBg = theme.primary;
                      if (p.value === 'urgent') activeBg = theme.rose;
                      else if (p.value === 'high') activeBg = theme.amber;
                      else if (p.value === 'medium') activeBg = theme.primary;
                      else if (p.value === 'low') activeBg = theme.textMuted;

                      return (
                        <Pressable
                          key={p.value}
                          style={[
                            styles.priorityPill,
                            {
                              backgroundColor: isSelected ? activeBg : theme.surface,
                              borderColor: isSelected ? activeBg : theme.border,
                            },
                          ]}
                          onPress={() => setPriority(p.value)}
                        >
                          <Text
                            style={[
                              styles.priorityPillText,
                              { color: isSelected ? '#FFFFFF' : theme.textMuted },
                            ]}
                          >
                            {p.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Form: Assignee */}
                <View style={styles.fieldGroup}>
                  <SelectField
                    label="Assignee"
                    value={assigneeId}
                    options={assigneeOptions}
                    onChange={(val) => setAssigneeId(val)}
                    searchable
                    placeholder="Select assignee..."
                  />
                </View>

                {/* Form: Company / Related Client */}
                <View style={styles.fieldGroup}>
                  <SelectField
                    label="Company / Related Client"
                    value={clientId}
                    options={clientOptions}
                    onChange={(val) => setClientId(val)}
                    searchable
                    placeholder="Select company..."
                  />
                </View>

                {/* Form: Watchers */}
                <View style={styles.fieldGroup}>
                  <SelectField
                    label="Watchers"
                    value=""
                    placeholder="+ Add watcher..."
                    options={[
                      { value: '', label: '+ Add watcher...' },
                      ...assignees
                        .filter((u) => !watcherIds.includes(u.id) && u.id !== assigneeId)
                        .map((u) => ({
                          value: u.id,
                          label: u.name,
                          hint: u.department || u.role,
                        })),
                    ]}
                    onChange={(val) => {
                      if (val && !watcherIds.includes(val)) {
                        setWatcherIds((prev) => [...prev, val]);
                      }
                    }}
                    searchable
                  />
                  {watcherIds.length > 0 ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {watcherIds.map((id) => {
                        const u = assignees.find((x) => x.id === id);
                        return (
                          <View
                            key={id}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              backgroundColor: theme.bgSubtle,
                              borderRadius: 16,
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderWidth: 1,
                              borderColor: theme.border,
                            }}
                          >
                            <Text style={{ fontSize: 13, color: theme.text, marginRight: 6 }}>
                              {u?.name || id}
                            </Text>
                            <Pressable
                              onPress={() => setWatcherIds((prev) => prev.filter((x) => x !== id))}
                              hitSlop={8}
                            >
                              <Text style={{ fontSize: 15, fontWeight: '700', color: theme.textMuted }}>×</Text>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>

                {/* Form: Start Date */}
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Start Date</Text>
                  <Pressable
                    onPress={() => setCalTarget('start')}
                    style={[
                      styles.dateControl,
                      { backgroundColor: theme.surface, borderColor: theme.border },
                    ]}
                  >
                    <Calendar size={16} color={theme.primary} />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.dateControlText,
                        { color: startDate ? theme.text : theme.textSubtle },
                      ]}
                    >
                      {startDate ? formatPrettyDate(startDate) : 'Select start date'}
                    </Text>
                    {startDate ? (
                      <Pressable hitSlop={8} onPress={() => setStartDate('')}>
                        <X size={14} color={theme.textMuted} />
                      </Pressable>
                    ) : null}
                  </Pressable>
                </View>

                {/* Form: Due Date & Time */}
                <View style={styles.twoColRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: theme.textMuted, marginBottom: 6 }]}>
                      Due Date
                    </Text>
                    <Pressable
                      onPress={() => setCalTarget('due')}
                      style={[
                        styles.dateControl,
                        { backgroundColor: theme.surface, borderColor: theme.border },
                      ]}
                    >
                      <Calendar size={16} color={theme.primary} />
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.dateControlText,
                          { color: dueDate ? theme.text : theme.textSubtle },
                        ]}
                      >
                        {dueDate ? formatPrettyDate(dueDate) : 'Select date'}
                      </Text>
                      {dueDate ? (
                        <Pressable hitSlop={8} onPress={() => setDueDate('')}>
                          <X size={14} color={theme.textMuted} />
                        </Pressable>
                      ) : null}
                    </Pressable>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: theme.textMuted, marginBottom: 6 }]}>
                      Due Time
                    </Text>
                    <Pressable
                      onPress={() => setShowTimeModal(true)}
                      style={[
                        styles.dateControl,
                        { backgroundColor: theme.surface, borderColor: theme.border },
                      ]}
                    >
                      <Clock size={16} color={theme.primary} />
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.dateControlText,
                          { color: dueTime ? theme.text : theme.textSubtle },
                        ]}
                      >
                        {dueTime ? formatPrettyTime(dueTime) : 'Select time'}
                      </Text>
                      {dueTime ? (
                        <Pressable hitSlop={8} onPress={() => setDueTime('')}>
                          <X size={14} color={theme.textMuted} />
                        </Pressable>
                      ) : null}
                    </Pressable>
                  </View>
                </View>

                {/* Form: Expected Hours */}
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
                    Expected Hours (Estimate)
                  </Text>
                  <View
                    style={[
                      styles.inputWithIcon,
                      { backgroundColor: theme.surface, borderColor: theme.border },
                    ]}
                  >
                    <Timer size={16} color={theme.primary} />
                    <TextInput
                      style={[styles.hoursInput, { color: theme.text }]}
                      value={estimateHours}
                      onChangeText={setEstimateHours}
                      placeholder="e.g. 4 or 2.5"
                      placeholderTextColor={theme.textSubtle}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                {/* Checklist items */}
                {checklist.length > 0 && (
                  <View style={styles.fieldGroup}>
                    <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
                      Checklist ({checklist.length})
                    </Text>
                    <View
                      style={[
                        styles.checklistCard,
                        {
                          backgroundColor: theme.bgSubtle,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      {checklist.map((item, idx) => (
                        <View key={idx} style={styles.checkItemRow}>
                          <CheckSquare size={15} color={theme.primary} />
                          <Text style={[styles.checkItemText, { color: theme.text }]}>
                            {item.text}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Actions Footer */}
                <View style={[styles.draftActionsRow, { borderTopColor: theme.border }]}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.confirmBtn,
                      {
                        backgroundColor: theme.primary,
                        opacity: step === 'saving' ? 0.7 : pressed ? 0.85 : 1,
                      },
                    ]}
                    onPress={handleSave}
                    disabled={step === 'saving'}
                  >
                    {step === 'saving' ? (
                      <>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                        <Text style={styles.confirmBtnText}>Creating Task...</Text>
                      </>
                    ) : (
                      <>
                        <Check size={18} color="#FFFFFF" />
                        <Text style={styles.confirmBtnText} numberOfLines={1}>
                          Confirm Task
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          </ScrollView>
      </KeyboardAvoidingView>

      {/* Calendar Modal for Start Date / Due Date */}
      {calTarget !== null ? (
        <CalendarModal
          visible={calTarget !== null}
          title={calTarget === 'start' ? 'Select Start Date' : 'Select Due Date'}
          value={calTarget === 'start' ? startDate : dueDate}
          onClose={() => setCalTarget(null)}
          onSelect={(iso) => {
            if (calTarget === 'start') setStartDate(iso);
            else if (calTarget === 'due') setDueDate(iso);
          }}
        />
      ) : null}

      {/* Time Picker Modal */}
      {showTimeModal && Platform.OS === 'android' ? (
        <DateTimePicker
          value={pickerTime}
          mode="time"
          display="default"
          onChange={(_, selected) => {
            setShowTimeModal(false);
            if (selected) {
              const h = String(selected.getHours()).padStart(2, '0');
              const m = String(selected.getMinutes()).padStart(2, '0');
              setDueTime(`${h}:${m}`);
            }
          }}
        />
      ) : null}

      {showTimeModal && Platform.OS === 'ios' ? (
        <Modal
          visible={showTimeModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowTimeModal(false)}
        >
          <View style={calStyles.sheetRoot}>
            <Pressable style={calStyles.sheetFlex} onPress={() => setShowTimeModal(false)} />
            <View
              style={[
                calStyles.timeSheet,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <View style={[calStyles.calHead, { borderBottomColor: theme.border }]}>
                <Text style={[calStyles.calTitle, { color: theme.text }]}>Due Time</Text>
                <Pressable onPress={() => setShowTimeModal(false)}>
                  <Text style={{ color: theme.primary, fontWeight: '600', fontSize: 15 }}>
                    Done
                  </Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={pickerTime}
                mode="time"
                display="spinner"
                themeVariant={theme.isDark ? 'dark' : 'light'}
                onChange={(_, selected) => {
                  if (selected) {
                    const h = String(selected.getHours()).padStart(2, '0');
                    const m = String(selected.getMinutes()).padStart(2, '0');
                    setDueTime(`${h}:${m}`);
                  }
                }}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </Modal>
  );
}

export function VoiceTaskModal(props: Props) {
  if (!props.visible) return null;

  return (
    <VoiceTaskErrorBoundary onClose={props.onClose}>
      <VoiceTaskModalInner {...props} />
    </VoiceTaskErrorBoundary>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 16 : 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextGroup: {
    flex: 1,
    gap: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '400',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 44 : 28,
    gap: 14,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
  },
  errorSub: {
    fontSize: 12,
    opacity: 0.85,
  },
  idleWrap: {
    gap: 14,
  },
  cardSection: {
    alignItems: 'center',
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  micHeroCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  heroSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  centerBtnWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  heroActionBtn: {
    height: 48,
    minWidth: 200,
    paddingHorizontal: 28,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heroActionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  actionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  primaryBtn: {},
  secondaryBtn: {
    borderWidth: 1,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
  manualSection: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  commandInput: {
    minHeight: 76,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  manualActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  parseBtn: {
    paddingHorizontal: 18,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parseBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  recordingWrap: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  pulsingRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingMicCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timerValue: {
    fontSize: 26,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  recordingHint: {
    fontSize: 13,
    textAlign: 'center',
  },
  processingWrap: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  processingTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 8,
  },
  processingSubtitle: {
    fontSize: 12,
    textAlign: 'center',
  },
  draftWrap: {
    gap: 14,
  },
  transcriptCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  transcriptHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  transcriptLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  transcriptLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  reRecordBtn: {
    fontSize: 12,
    fontWeight: '600',
  },
  transcriptText: {
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  disambiguationBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  disambiguationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  disambiguationTitle: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  textArea: {
    minHeight: 76,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  inputWithIcon: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  hoursInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 10,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 6,
  },
  priorityPill: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityPillText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  dateControl: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 6,
  },
  dateControlText: {
    flex: 1,
    fontSize: 12.5,
  },
  checklistCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  checkItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkItemText: {
    fontSize: 13,
  },
  draftActionsRow: {
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  confirmBtn: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

const calStyles = StyleSheet.create({
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetFlex: {
    flex: 1,
  },
  calSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    padding: 16,
    paddingBottom: 28,
  },
  calHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  calTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekCell: {
    flex: 1,
    alignItems: 'center',
  },
  weekText: {
    fontSize: 12,
    fontWeight: '600',
  },
  calRow: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  dayWrap: {
    flex: 1,
    alignItems: 'center',
  },
  dayInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  clearBtn: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
  todayBtn: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  timeSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    padding: 16,
    paddingBottom: 36,
  },
  candidateChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  candidateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  candidateChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
