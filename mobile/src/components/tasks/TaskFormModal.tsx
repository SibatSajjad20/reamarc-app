import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { Calendar, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react-native';
import { useTheme } from '../../theme';
import { SuccessBurst } from '../../ui/motion';
import { SelectField } from '../../ui/SelectField';
import { useAuth } from '../../context/AuthContext';
import {
  allowedTaskStages,
  createTask,
  listTaskAssignees,
  listTaskClients,
  stageLabel,
  TASK_PRIORITY_OPTIONS,
  updateTask,
  validateWorkTaskForm,
  type Task,
  type TaskClientOption,
  type TaskPerson,
  type TaskPriority,
  type TaskStatus,
} from '../../lib/tasks';

type Props = {
  visible: boolean;
  task?: Task | null;
  onClose: () => void;
  onSaved: (task: Task) => void;
};

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function toIsoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseIso(iso?: string) {
  if (!iso) return new Date();
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatPretty(iso?: string) {
  if (!iso) return '';
  try {
    return parseIso(iso).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

function CalendarSheet({
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable style={styles.sheetFlex} onPress={onClose} />
        <View style={[styles.calSheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.calHead}>
            <Text style={[styles.calTitle, { color: theme.text }]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={18} color={theme.textMuted} />
            </Pressable>
          </View>
          <View style={styles.calNav}>
            <Pressable
              onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              style={[styles.navBtn, { backgroundColor: theme.bgSubtle }]}
            >
              <ChevronLeft size={18} color={theme.text} />
            </Pressable>
            <Text style={[styles.monthLabel, { color: theme.text }]}>{monthLabel}</Text>
            <Pressable
              onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              style={[styles.navBtn, { backgroundColor: theme.bgSubtle }]}
            >
              <ChevronRight size={18} color={theme.text} />
            </Pressable>
          </View>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((d) => (
              <View key={d} style={styles.weekCell}>
                <Text style={[styles.weekText, { color: theme.textMuted }]}>{d}</Text>
              </View>
            ))}
          </View>
          {chunk(cells, 7).map((row) => (
            <View key={row[0].iso} style={styles.calRow}>
              {row.map((cell) => {
                const isSelected = value === cell.iso;
                const isToday = cell.iso === todayIso;
                return (
                  <View key={cell.iso + String(cell.inMonth)} style={styles.dayWrap}>
                    <Pressable
                      onPress={() => {
                        onSelect(cell.iso);
                        onClose();
                      }}
                      style={[
                        styles.dayInner,
                        isToday && !isSelected ? { borderWidth: 1.5, borderColor: theme.primary } : null,
                        isSelected ? { backgroundColor: theme.primary, borderColor: theme.primary } : null,
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: isSelected || isToday ? '700' : '400',
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
          <View style={styles.calActions}>
            <Pressable
              onPress={() => {
                const today = new Date();
                setCursor(today);
                onSelect(toIsoDate(today));
                onClose();
              }}
              style={[styles.calActionBtn, { backgroundColor: theme.primaryLight }]}
            >
              <Text style={{ color: theme.primary, fontWeight: '600' }}>Today</Text>
            </Pressable>
            {value ? (
              <Pressable
                onPress={() => {
                  onSelect('');
                  onClose();
                }}
                style={[styles.calActionBtn, { backgroundColor: theme.bgSubtle }]}
              >
                <Text style={{ color: theme.text, fontWeight: '500' }}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function TaskFormModal({ visible, task, onClose, onSaved }: Props) {
  const theme = useTheme();
  const { user } = useAuth();
  const isCreate = !task;
  const stageOptions = !isCreate && task ? allowedTaskStages(user, task) : [];
  const statusLocked = Boolean(task && task.status === 'completed') || stageOptions.length <= 1;
  const [people, setPeople] = useState<TaskPerson[]>([]);
  const [clients, setClients] = useState<TaskClientOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(task?.title || '');
  const [status, setStatus] = useState<TaskStatus>(task?.status || 'todo');
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id || '');
  const [startDate, setStartDate] = useState(task?.start_date || '');
  const [dueDate, setDueDate] = useState(task?.due_date || '');
  const [dueTime, setDueTime] = useState(task?.due_time || '');
  const [estimate, setEstimate] = useState(task?.estimate_hours != null ? String(task.estimate_hours) : '');
  const [clientId, setClientId] = useState(task?.client_id || '');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority || 'medium');
  const [description, setDescription] = useState(task?.description || '');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [cal, setCal] = useState<null | 'start' | 'due'>(null);
  const [showTime, setShowTime] = useState(false);
  const [flashSuccess, setFlashSuccess] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitleError(null);
    setEstimateError(null);
    setTitle(task?.title || '');
    setStatus(task?.status || 'todo');
    setAssigneeId(task?.assignee_id || '');
    setStartDate(task?.start_date || '');
    setDueDate(task?.due_date || '');
    setDueTime(task?.due_time || '');
    setEstimate(task?.estimate_hours != null ? String(task.estimate_hours) : '');
    setClientId(task?.client_id || '');
    setPriority(task?.priority || 'medium');
    setDescription(task?.description || '');
  }, [visible, task]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    Promise.allSettled([listTaskAssignees(), listTaskClients()]).then(([peopleRes, clientRes]) => {
      if (cancelled) return;
      if (peopleRes.status === 'fulfilled') setPeople(peopleRes.value || []);
      if (clientRes.status === 'fulfilled') setClients(clientRes.value || []);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const handleSave = async () => {
    const errors = validateWorkTaskForm({ title, estimate });
    setTitleError(errors.title || null);
    setEstimateError(errors.estimate || null);
    if (errors.title || errors.estimate) {
      if (errors.estimate && !errors.title) Alert.alert('Check estimate', errors.estimate);
      return;
    }
    const hours = estimate.trim() ? Number(estimate) : null;
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      ...(isCreate ? { status: 'todo' as const } : statusLocked ? {} : { status }),
      priority,
      assignee_id: assigneeId || null,
      start_date: startDate || null,
      due_date: dueDate || null,
      due_time: dueTime || null,
      estimate_hours: hours,
      client_id: clientId || null,
    };
    setSaving(true);
    try {
      const saved = isCreate ? await createTask(payload) : await updateTask(task!.id, payload);
      setFlashSuccess(true);
      setTimeout(() => {
        setFlashSuccess(false);
        onSaved(saved);
        onClose();
      }, 260);
    } catch (err: any) {
      Alert.alert('Save failed', err?.message || 'Could not save task');
    } finally {
      setSaving(false);
    }
  };

  const timeDate = useMemo(() => {
    const d = new Date();
    if (!dueTime) {
      d.setHours(18, 0, 0, 0);
      return d;
    }
    const [h, m] = dueTime.split(':').map(Number);
    d.setHours(!Number.isNaN(h) ? h : 18, !Number.isNaN(m) ? m : 0, 0, 0);
    return d;
  }, [dueTime]);

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.sheet, { backgroundColor: theme.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SuccessBurst show={flashSuccess} />
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>{isCreate ? 'Add task' : 'Edit task'}</Text>
            <Text style={[styles.sub, { color: theme.textMuted }]}>
              Title, assignee, dates, estimate, and related client
            </Text>
          </View>
          <Pressable onPress={onClose} style={[styles.close, { backgroundColor: theme.bgSubtle }]}>
            <X size={18} color={theme.textMuted} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              Task Title <Text style={{ color: theme.rose }}>*</Text>
            </Text>
            <TextInput
              value={title}
              onChangeText={(v) => {
                setTitle(v);
                if (titleError) setTitleError(null);
              }}
              placeholder="What needs to be done?"
              placeholderTextColor={theme.textMuted}
              style={[
                styles.input,
                {
                  color: theme.text,
                  backgroundColor: theme.surface,
                  borderColor: titleError ? theme.rose : theme.border,
                },
              ]}
            />
            {titleError ? <Text style={[styles.error, { color: theme.rose }]}>{titleError}</Text> : null}
          </View>

          {!isCreate ? (
            statusLocked ? (
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.textMuted }]}>Status</Text>
                <Text style={[styles.lockedValue, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}>
                  {stageLabel(task?.status)}
                </Text>
              </View>
            ) : (
              <SelectField
                label="Status"
                value={status}
                onChange={(v) => setStatus(v as TaskStatus)}
                options={stageOptions}
              />
            )
          ) : null}

          <SelectField
            label="Assigned Person"
            value={assigneeId}
            onChange={setAssigneeId}
            placeholder="Assign an employee..."
            searchable
            emptyText="No employees found"
            options={[
              { value: '', label: 'Unassigned' },
              ...people.map((p) => ({
                value: p.id,
                label: p.full_name || p.name,
                hint: [p.department, p.role].filter(Boolean).join(' · '),
              })),
            ]}
          />

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textMuted }]}>Start Date</Text>
            <Pressable
              onPress={() => setCal('start')}
              style={[styles.control, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <Calendar size={16} color={theme.primary} />
              <Text style={[styles.controlText, { color: startDate ? theme.text : theme.textMuted }]}>
                {startDate ? formatPretty(startDate) : 'Select start date'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.row}>
            <View style={styles.col}>
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.textMuted }]}>Due Date</Text>
                <Pressable
                  onPress={() => setCal('due')}
                  style={[styles.control, { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                  <Calendar size={16} color={theme.primary} />
                  <Text style={[styles.controlText, { color: dueDate ? theme.text : theme.textMuted }]}>
                    {dueDate ? formatPretty(dueDate) : 'Select date'}
                  </Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.col}>
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.textMuted }]}>Due Time</Text>
                <Pressable
                  onPress={() => setShowTime(true)}
                  style={[styles.control, { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                  <Clock size={16} color={theme.primary} />
                  <Text style={[styles.controlText, { color: dueTime ? theme.text : theme.textMuted }]}>
                    {dueTime || 'Select time'}
                  </Text>
                </Pressable>
                {dueTime ? (
                  <Pressable onPress={() => setDueTime('')} style={{ marginTop: 6 }}>
                    <Text style={{ color: theme.primary, fontWeight: '500', fontSize: 12 }}>Clear time</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>

          {showTime && Platform.OS === 'android' ? (
            <DateTimePicker
              value={timeDate}
              mode="time"
              display="default"
              onChange={(_, selected) => {
                setShowTime(false);
                if (selected) {
                  setDueTime(
                    `${String(selected.getHours()).padStart(2, '0')}:${String(selected.getMinutes()).padStart(2, '0')}`,
                  );
                }
              }}
            />
          ) : null}
          {Platform.OS === 'ios' ? (
            <Modal visible={showTime} transparent animationType="slide" onRequestClose={() => setShowTime(false)}>
              <View style={styles.sheetRoot}>
                <Pressable style={styles.sheetFlex} onPress={() => setShowTime(false)} />
                <View style={[styles.timeSheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={styles.calHead}>
                    <Text style={[styles.calTitle, { color: theme.text }]}>Due time</Text>
                    <Pressable onPress={() => setShowTime(false)}>
                      <Text style={{ color: theme.primary, fontWeight: '600' }}>Done</Text>
                    </Pressable>
                  </View>
                  <DateTimePicker
                    value={timeDate}
                    mode="time"
                    display="spinner"
                    themeVariant={theme.isDark ? 'dark' : 'light'}
                    onChange={(_, selected) => {
                      if (selected) {
                        setDueTime(
                          `${String(selected.getHours()).padStart(2, '0')}:${String(selected.getMinutes()).padStart(2, '0')}`,
                        );
                      }
                    }}
                  />
                </View>
              </View>
            </Modal>
          ) : null}

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textMuted }]}>Estimate Hours</Text>
            <TextInput
              value={estimate}
              onChangeText={(v) => {
                setEstimate(v);
                if (estimateError) setEstimateError(null);
              }}
              keyboardType="decimal-pad"
              placeholder="e.g. 4"
              placeholderTextColor={theme.textMuted}
              style={[
                styles.input,
                {
                  color: theme.text,
                  backgroundColor: theme.surface,
                  borderColor: estimateError ? theme.rose : theme.border,
                },
              ]}
            />
            {estimateError ? <Text style={[styles.error, { color: theme.rose }]}>{estimateError}</Text> : null}
          </View>

          <SelectField
            label="Related Client"
            value={clientId}
            onChange={setClientId}
            placeholder="Select client..."
            searchable
            emptyText="No clients found"
            options={[
              { value: '', label: 'No related client' },
              ...clients.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />

          <SelectField
            label="Priority"
            value={priority}
            onChange={(v) => setPriority(v as TaskPriority)}
            options={TASK_PRIORITY_OPTIONS}
          />

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textMuted }]}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Notes, context, or acceptance criteria..."
              placeholderTextColor={theme.textMuted}
              multiline
              style={[
                styles.input,
                styles.area,
                { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            />
          </View>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
          <Pressable onPress={onClose} style={[styles.btnGhost, { borderColor: theme.border }]}>
            <Text style={[styles.btnGhostText, { color: theme.text }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => void handleSave()}
            disabled={saving}
            style={[styles.btnPrimary, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnPrimaryText}>{isCreate ? 'Create Task' : 'Save Changes'}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <CalendarSheet
        visible={cal === 'start'}
        title="Start date"
        value={startDate}
        onClose={() => setCal(null)}
        onSelect={setStartDate}
      />
      <CalendarSheet
        visible={cal === 'due'}
        title="Due date"
        value={dueDate}
        onClose={() => setCal(null)}
        onSelect={setDueDate}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: { fontSize: 20, fontWeight: '700' },
  sub: { fontSize: 12, fontWeight: '400', marginTop: 2 },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, paddingBottom: 28 },
  field: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '500', marginBottom: 6 },
  control: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlText: { flex: 1, fontSize: 14, fontWeight: '400' },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '400',
  },
  lockedValue: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '600',
  },
  area: { minHeight: 100, textAlignVertical: 'top' },
  error: { marginTop: 6, fontSize: 12, fontWeight: '500' },
  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  footer: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1 },
  btnGhost: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnGhostText: { fontWeight: '600', fontSize: 15 },
  btnPrimary: {
    flex: 1.2,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetFlex: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)' },
  calSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 12,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  calHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  calTitle: { fontSize: 16, fontWeight: '700' },
  calNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 16, fontWeight: '600' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekCell: { flex: 1, alignItems: 'center' },
  weekText: { fontSize: 11, fontWeight: '600' },
  calRow: { flexDirection: 'row' },
  dayWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  dayInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  calActions: { flexDirection: 'row', gap: 10, paddingTop: 12 },
  calActionBtn: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  timeSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    paddingBottom: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
});
