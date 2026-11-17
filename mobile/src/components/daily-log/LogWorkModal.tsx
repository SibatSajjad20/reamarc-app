import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import {
  Bold,
  Check,
  CheckSquare,
  ChevronDown,
  List,
  ListOrdered,
  Search,
  Square,
  X,
} from 'lucide-react-native';
import { api } from '../../lib/api';
import { clearDailyLogCaches } from '../../lib/dailyLogCache';
import { getModuleCache, setModuleCache } from '../../lib/moduleCache';
import { DailyLogEntry, getEarliestLogDate, parseHours } from '../../lib/dailyLog';
import { htmlToPlainText } from '../../lib/taskHtml';
import { listAllTasks, stageLabel, stageTone, Task, TaskStatus } from '../../lib/tasks';
import { useTheme } from '../../theme';
import { DateField } from '../../ui/DateTimeField';
import { SuccessBurst, useSheetMotion } from '../../ui/motion';

interface LogWorkModalProps {
  visible: boolean;
  initialDate?: string;
  initialTask?: Task | null;
  entry?: DailyLogEntry | null;
  onClose: () => void;
  onCreated?: (entry: DailyLogEntry) => void;
  onSaved?: (entry: DailyLogEntry) => void;
  onDeleted?: (entryId: string) => void;
}

type Workspace = { id?: string; name: string; status?: string };

type SelectOption = { value: string; label: string; color?: string; dot?: string };

const FALLBACK_CLIENTS: SelectOption[] = [
  { value: 'Internal Agency Work', label: 'Internal Agency Work' },
  { value: 'General Client Operations', label: 'General Client Operations' },
];

const DEFAULT_TASK_TYPES: SelectOption[] = [
  { value: 'Scheduled Task', label: 'Scheduled' },
  { value: 'Runtime Task', label: 'Runtime' },
];

const DEFAULT_TASK_STATUSES: SelectOption[] = [
  { value: 'Completed', label: 'Completed', color: '#059669', dot: '#10B981' },
  { value: 'Incomplete', label: 'Incomplete', color: '#D97706', dot: '#F59E0B' },
  { value: 'Blocker', label: 'Blocker', color: '#E11D48', dot: '#E11D48' },
];

const HOUR_PRESETS = [0.5, 1, 1.5, 2, 4];
const WORKSPACES_CACHE = 'log-workspaces';
const COLUMNS_CACHE = 'log-columns';

type PickerKey = 'client' | 'type' | 'status' | 'task' | null;

function optionsFromNames(names: string[]): SelectOption[] {
  return names.filter(Boolean).map((name) => ({ value: name, label: name }));
}

export const LogWorkModal: React.FC<LogWorkModalProps> = ({
  visible,
  initialDate,
  initialTask,
  entry,
  onClose,
  onCreated,
  onSaved,
  onDeleted,
}) => {
  const theme = useTheme();
  const { opacity, translateY } = useSheetMotion(visible);
  const [flashSuccess, setFlashSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerKey>(null);
  const [pickerQuery, setPickerQuery] = useState('');

  const [date, setDate] = useState(() => initialDate || new Date().toISOString().split('T')[0]);
  const [clientProject, setClientProject] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskType, setTaskType] = useState('Scheduled Task');
  const [taskStatus, setTaskStatus] = useState('Incomplete');
  const [hours, setHours] = useState('1.0');
  const [remarks, setRemarks] = useState('');

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskSerial, setSelectedTaskSerial] = useState<string | null>(null);
  const [syncTaskStage, setSyncTaskStage] = useState(true);
  const [myTasks, setMyTasks] = useState<Task[]>([]);

  const [clientOptions, setClientOptions] = useState<SelectOption[]>(
    () => getModuleCache<SelectOption[]>(WORKSPACES_CACHE) || FALLBACK_CLIENTS,
  );
  const [taskTypes, setTaskTypes] = useState<SelectOption[]>(DEFAULT_TASK_TYPES);
  const [taskStatuses, setTaskStatuses] = useState<SelectOption[]>(DEFAULT_TASK_STATUSES);

  const earliestLogDate = useMemo(() => getEarliestLogDate(new Date()), []);
  const maxLogDate = useMemo(() => new Date(), []);

  const loadLookups = useCallback(async () => {
    const cachedClients = getModuleCache<SelectOption[]>(WORKSPACES_CACHE);
    if (cachedClients?.length) {
      setClientOptions(cachedClients);
    } else {
      setLoadingClients(true);
    }

    const cachedColumns = getModuleCache<{ types: SelectOption[]; statuses: SelectOption[] }>(COLUMNS_CACHE);
    if (cachedColumns) {
      if (cachedColumns.types?.length) setTaskTypes(cachedColumns.types);
      if (cachedColumns.statuses?.length) setTaskStatuses(cachedColumns.statuses);
    }

    try {
      const [workspaces, columns] = await Promise.all([
        api<Workspace[]>('/workspaces').catch(() => [] as Workspace[]),
        api<{ key: string; options?: string[] }[]>('/daily-log/columns').catch(() => []),
      ]);

      const active = (workspaces || []).filter((w) => String(w.status || 'active') !== 'inactive' && w.name);
      const nextClients = active.length
        ? active
            .map((w) => ({ value: w.name, label: w.name }))
            .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
        : FALLBACK_CLIENTS;
      setModuleCache(WORKSPACES_CACHE, nextClients);
      setClientOptions(nextClients);

      const typeCol = columns.find((c) => c.key === 'task_type');
      const statusCol = columns.find((c) => c.key === 'task_status');
      const nextTypes =
        typeCol?.options?.length ? optionsFromNames(typeCol.options) : DEFAULT_TASK_TYPES;
      const nextStatuses = statusCol?.options?.length
        ? statusCol.options.map((name) => {
            const known = DEFAULT_TASK_STATUSES.find((s) => s.value === name);
            return known || { value: name, label: name };
          })
        : DEFAULT_TASK_STATUSES;
      setModuleCache(COLUMNS_CACHE, { types: nextTypes, statuses: nextStatuses });
      setTaskTypes(nextTypes);
      setTaskStatuses(nextStatuses);
    } catch {
      if (!cachedClients?.length) setClientOptions(FALLBACK_CLIENTS);
    } finally {
      setLoadingClients(false);
    }
  }, []);

  const loadAssignedTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const res = await listAllTasks({ scope: 'mine' });
      const stageOrder: Record<string, number> = {
        in_progress: 1,
        todo: 2,
        review: 3,
        completed: 4,
      };
      const valid = (res.items || []).filter((t) => (t.status as string) !== 'cancelled');
      valid.sort((a, b) => {
        const orderA = stageOrder[a.status] ?? 99;
        const orderB = stageOrder[b.status] ?? 99;
        if (orderA !== orderB) return orderA - orderB;
        return (b.serial || '').localeCompare(a.serial || '');
      });
      setMyTasks(valid);
    } catch {
      // ignore
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      setPicker(null);
      setPickerQuery('');
      return;
    }
    setErrorMsg(null);
    void loadLookups();
    void loadAssignedTasks();

    if (entry) {
      setDate(entry.date || initialDate || new Date().toISOString().split('T')[0]);
      setClientProject(entry.client_project || '');
      setTaskDescription(htmlToPlainText(entry.task_description || ''));
      setTaskType(entry.task_type || 'Scheduled Task');
      setTaskStatus(String(entry.task_status || 'Incomplete'));
      setHours(String(entry.hours_utilized ?? '1.0'));
      setRemarks(entry.remarks || '');
      setSelectedTaskId(entry.task_id || null);
      setSelectedTaskSerial(entry.task_serial || null);
      setSyncTaskStage(false);
    } else if (initialTask) {
      setDate(initialDate || new Date().toISOString().split('T')[0]);
      setSelectedTaskId(initialTask.id);
      setSelectedTaskSerial(initialTask.serial || null);
      if (initialTask.client_name) {
        setClientProject(initialTask.client_name);
      }
      setTaskDescription(initialTask.title || '');
      setTaskType('Scheduled Task');
      setTaskStatus('Incomplete');
      setHours('1.0');
      setRemarks('');
      setSyncTaskStage(initialTask.status !== 'completed');
    } else {
      setDate(initialDate || new Date().toISOString().split('T')[0]);
      setSelectedTaskId(null);
      setSelectedTaskSerial(null);
      setSyncTaskStage(true);
    }
  }, [visible, initialDate, initialTask, entry, loadLookups, loadAssignedTasks]);

  const resetForm = () => {
    setTaskDescription('');
    setTaskType(taskTypes[0]?.value || 'Scheduled Task');
    setTaskStatus(taskStatuses.find((s) => s.value === 'Incomplete')?.value || 'Incomplete');
    setHours('1.0');
    setRemarks('');
    setErrorMsg(null);
    setClientProject('');
    setSelectedTaskId(null);
    setSelectedTaskSerial(null);
    setSyncTaskStage(true);
    setPicker(null);
    setPickerQuery('');
  };

  const handleClose = () => {
    if (submitting) return;
    resetForm();
    onClose();
  };

  const handleInsertFormat = (type: 'bold' | 'bullet' | 'number') => {
    if (type === 'bold') {
      setTaskDescription((prev) => (prev ? `${prev} **bold text**` : '**bold text**'));
    } else if (type === 'bullet') {
      setTaskDescription((prev) => (prev ? `${prev}\n• ` : '• '));
    } else if (type === 'number') {
      setTaskDescription((prev) => (prev ? `${prev}\n1. ` : '1. '));
    }
  };

  const handleSubmit = async () => {
    const trimmedProject = clientProject.trim();
    const trimmedDesc = taskDescription.trim();
    const parsedHours = parseHours(hours);

    if (!trimmedProject) {
      setErrorMsg('Please select a client before submitting.');
      setPicker('client');
      return;
    }
    if (!trimmedDesc) {
      setErrorMsg('Please provide a task description.');
      return;
    }
    if (!parsedHours || parsedHours <= 0) {
      setErrorMsg('Please provide a valid time utilized (e.g. 1.5 or 0:30).');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const payload: any = {
        date,
        client_project: trimmedProject,
        task_description: trimmedDesc,
        task_type: taskType,
        task_status: taskStatus,
        hours_utilized: parsedHours,
        remarks: remarks.trim() || undefined,
      };

      if (selectedTaskId) {
        payload.task_id = selectedTaskId;
        payload.task_serial = selectedTaskSerial || undefined;
        if (syncTaskStage) {
          payload.sync_task_status = taskStatus.toLowerCase() === 'completed' ? 'completed' : 'in_progress';
        }
      }

      if (entry?.id) {
        const updated = await api<DailyLogEntry>(`/daily-log/entries/${encodeURIComponent(entry.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...payload,
            version: entry.version,
          }),
        });
        clearDailyLogCaches();
        onSaved?.(updated);
      } else {
        const created = await api<DailyLogEntry>('/daily-log/entries', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        clearDailyLogCaches();
        resetForm();
        onCreated?.(created);
      }
      setFlashSuccess(true);
      setTimeout(() => {
        setFlashSuccess(false);
        onClose();
      }, 280);
    } catch (err: any) {
      const msg = err?.message || 'Failed to submit log entry.';
      setErrorMsg(msg);
      Alert.alert('Submission Failed', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!entry?.id || submitting) return;
    Alert.alert('Delete this log?', 'This cannot be undone. Only entries inside the 48 working-hour window can be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSubmitting(true);
            setErrorMsg(null);
            try {
              await api(`/daily-log/entries/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
              clearDailyLogCaches();
              onDeleted?.(entry.id);
              onClose();
            } catch (err: any) {
              const msg = err?.message || 'Failed to delete log entry.';
              setErrorMsg(msg);
              Alert.alert('Delete Failed', msg);
            } finally {
              setSubmitting(false);
            }
          })();
        },
      },
    ]);
  };

  const selectedType = taskTypes.find((t) => t.value === taskType);
  const selectedStatus = taskStatuses.find((s) => s.value === taskStatus);
  const selectedClient = clientOptions.find((c) => c.value === clientProject);
  const selectedTask = myTasks.find((t) => t.id === selectedTaskId);

  const togglePicker = (key: PickerKey) => {
    setPickerQuery('');
    setPicker((prev) => (prev === key ? null : key));
  };

  const filteredClientOptions = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return clientOptions;
    return clientOptions.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [clientOptions, pickerQuery]);

  const filteredTasks = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return myTasks;
    return myTasks.filter((t) =>
      (t.title || '').toLowerCase().includes(q) ||
      (t.serial || '').toLowerCase().includes(q) ||
      (t.client_name || '').toLowerCase().includes(q),
    );
  }, [myTasks, pickerQuery]);

  const renderTaskPicker = () => {
    const open = picker === 'task';
    const displayTitle = selectedTask
      ? `${selectedTask.serial ? `[${selectedTask.serial}] ` : ''}${selectedTask.title}`
      : selectedTaskSerial
      ? `Linked Task (${selectedTaskSerial})`
      : 'None (General / Ad-hoc)';

    return (
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.text }]}>Link to Task (Task Manager)</Text>
        <Pressable
          onPress={() => togglePicker('task')}
          style={[
            styles.selectBtn,
            {
              backgroundColor: theme.bgSubtle,
              borderColor: open ? theme.primary : theme.border,
            },
          ]}
        >
          <View style={styles.selectValue}>
            {selectedTaskId ? (
              <View style={[styles.taskBadge, { backgroundColor: theme.primaryLight }]}>
                <Text style={[styles.taskBadgeText, { color: theme.primary }]}>
                  {selectedTaskSerial || 'TASK'}
                </Text>
              </View>
            ) : null}
            <Text
              style={[
                styles.selectText,
                { color: selectedTaskId ? theme.text : theme.textMuted },
              ]}
              numberOfLines={1}
            >
              {displayTitle}
            </Text>
          </View>
          <ChevronDown
            size={18}
            color={theme.textMuted}
            style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
          />
        </Pressable>

        {open ? (
          <View style={[styles.dropdown, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.searchBox, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}>
              <Search size={16} color={theme.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Search assigned tasks..."
                placeholderTextColor={theme.textSubtle}
                value={pickerQuery}
                onChangeText={setPickerQuery}
                autoCapitalize="none"
              />
            </View>
            <ScrollView
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              style={styles.dropdownScroll}
              contentContainerStyle={styles.dropdownList}
            >
              <Pressable
                onPress={() => {
                  setSelectedTaskId(null);
                  setSelectedTaskSerial(null);
                  setPicker(null);
                  setPickerQuery('');
                }}
                style={[
                  styles.taskOptionCard,
                  {
                    backgroundColor: !selectedTaskId ? theme.primaryLight : 'transparent',
                    borderColor: !selectedTaskId ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text style={[styles.taskOptionTitle, { color: !selectedTaskId ? theme.primary : theme.text }]}>
                  None (General / Ad-hoc)
                </Text>
              </Pressable>

              {filteredTasks.map((t) => {
                const active = t.id === selectedTaskId;
                const tone = stageTone(t.status as TaskStatus, theme);
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => {
                      setSelectedTaskId(t.id);
                      setSelectedTaskSerial(t.serial || null);
                      if (t.client_name) {
                        setClientProject(t.client_name);
                      }
                      if (!taskDescription.trim()) {
                        setTaskDescription(t.title);
                      }
                      setSyncTaskStage(t.status !== 'completed');
                      setPicker(null);
                      setPickerQuery('');
                      if (errorMsg) setErrorMsg(null);
                    }}
                    style={[
                      styles.taskOptionCard,
                      {
                        backgroundColor: active ? theme.primaryLight : 'transparent',
                        borderColor: active ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <View style={styles.taskOptionHeader}>
                      <View style={[styles.taskBadge, { backgroundColor: theme.primaryLight }]}>
                        <Text style={[styles.taskBadgeText, { color: theme.primary }]}>
                          {t.serial || 'TASK'}
                        </Text>
                      </View>
                      {t.client_name ? (
                        <Text style={[styles.taskOptionClient, { color: theme.textMuted }]} numberOfLines={1}>
                          {t.client_name}
                        </Text>
                      ) : null}
                      <View style={[styles.stageChip, { backgroundColor: tone.bg }]}>
                        <View style={[styles.statusDot, { backgroundColor: tone.color }]} />
                        <Text style={[styles.stageChipText, { color: tone.color }]}>
                          {stageLabel(t.status as TaskStatus)}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[styles.taskOptionTitle, { color: active ? theme.primary : theme.text }]}
                      numberOfLines={2}
                    >
                      {t.title}
                    </Text>
                  </Pressable>
                );
              })}
              {loadingTasks && myTasks.length === 0 ? (
                <ActivityIndicator style={{ marginVertical: 12 }} size="small" color={theme.primary} />
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </View>
    );
  };

  const renderOptions = (
    options: SelectOption[],
    value: string,
    onSelect: (next: string) => void,
    searchable?: boolean,
  ) => (
    <View style={[styles.dropdown, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {searchable ? (
        <View style={[styles.searchBox, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}>
          <Search size={16} color={theme.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search clients..."
            placeholderTextColor={theme.textSubtle}
            value={pickerQuery}
            onChangeText={setPickerQuery}
            autoCapitalize="none"
          />
        </View>
      ) : null}
      <ScrollView
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        style={styles.dropdownScroll}
        contentContainerStyle={styles.dropdownList}
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => {
                onSelect(opt.value);
                setPicker(null);
                setPickerQuery('');
                if (errorMsg) setErrorMsg(null);
              }}
              style={[
                styles.pickerRow,
                {
                  backgroundColor: active ? theme.primaryLight : 'transparent',
                  borderColor: active ? theme.primary : theme.border,
                },
              ]}
            >
              {opt.dot ? <View style={[styles.statusDot, { backgroundColor: opt.dot }]} /> : null}
              <Text style={[styles.pickerLabel, { color: active ? theme.primary : theme.text }]}>
                {opt.label}
              </Text>
              {active ? <Check size={16} color={theme.primary} /> : null}
            </Pressable>
          );
        })}
        {options.length === 0 ? (
          <Text style={[styles.emptyPicker, { color: theme.textMuted }]}>No matches</Text>
        ) : null}
      </ScrollView>
    </View>
  );

  const renderSelect = (
    key: PickerKey,
    label: string,
    valueLabel: string,
    options: SelectOption[],
    value: string,
    onSelect: (next: string) => void,
    opts?: { loading?: boolean; dot?: string; searchable?: boolean; placeholder?: string },
  ) => {
    const open = picker === key;
    return (
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
        <Pressable
          onPress={() => togglePicker(key)}
          disabled={opts?.loading}
          style={[
            styles.selectBtn,
            {
              backgroundColor: theme.bgSubtle,
              borderColor: open ? theme.primary : theme.border,
            },
          ]}
        >
          <View style={styles.selectValue}>
            {opts?.dot ? <View style={[styles.statusDot, { backgroundColor: opts.dot }]} /> : null}
            <Text
              style={[styles.selectText, { color: valueLabel ? theme.text : theme.textSubtle }]}
              numberOfLines={1}
            >
              {opts?.loading ? 'Loading…' : valueLabel || opts?.placeholder || 'Select…'}
            </Text>
          </View>
          {opts?.loading ? (
            <ActivityIndicator size="small" color={theme.textMuted} />
          ) : (
            <ChevronDown
              size={18}
              color={theme.textMuted}
              style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
            />
          )}
        </Pressable>
        {open ? renderOptions(options, value, onSelect, opts?.searchable) : null}
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <Animated.View style={[styles.backdrop, { opacity }]}>
          <Pressable style={{ flex: 1 }} onPress={handleClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, borderColor: theme.border, opacity, transform: [{ translateY }] },
          ]}
        >
          <SuccessBurst show={flashSuccess} />
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.title, { color: theme.text }]}>
                {entry ? 'Edit log entry' : 'Log Daily Work'}
              </Text>
              <Text style={[styles.subtitle, { color: theme.textMuted }]}>
                Record what you worked on · 48h submission window
              </Text>
            </View>
            <Pressable
              hitSlop={8}
              onPress={handleClose}
              style={[styles.closeBtn, { backgroundColor: theme.bgSubtle }]}
            >
              <X size={18} color={theme.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {!!errorMsg && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            {renderTaskPicker()}

            <View style={styles.rowTwo}>
              <View style={{ flex: 1 }}>
                <DateField
                  label="Date *"
                  value={date}
                  onChange={setDate}
                  minimumDate={earliestLogDate}
                  maximumDate={maxLogDate}
                />
              </View>
              <View style={{ flex: 1 }}>
                {renderSelect(
                  'client',
                  'Client / project *',
                  selectedClient?.label || '',
                  filteredClientOptions,
                  clientProject,
                  setClientProject,
                  {
                    loading: loadingClients && !clientOptions.length,
                    searchable: true,
                    placeholder: 'Select a client',
                  },
                )}
              </View>
            </View>

            <View style={styles.field}>
              <View style={styles.descLabelRow}>
                <Text style={[styles.label, { color: theme.text }]}>Work Done / Details *</Text>
                <View style={styles.formatToolbar}>
                  <Pressable
                    hitSlop={6}
                    onPress={() => handleInsertFormat('bold')}
                    style={[styles.formatBtn, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}
                  >
                    <Bold size={13} color={theme.text} strokeWidth={2.5} />
                  </Pressable>
                  <Pressable
                    hitSlop={6}
                    onPress={() => handleInsertFormat('bullet')}
                    style={[styles.formatBtn, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}
                  >
                    <List size={13} color={theme.text} strokeWidth={2.5} />
                  </Pressable>
                  <Pressable
                    hitSlop={6}
                    onPress={() => handleInsertFormat('number')}
                    style={[styles.formatBtn, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}
                  >
                    <ListOrdered size={13} color={theme.text} strokeWidth={2.5} />
                  </Pressable>
                </View>
              </View>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    backgroundColor: theme.bgSubtle,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                placeholder="Describe what you worked on..."
                placeholderTextColor={theme.textSubtle}
                multiline
                numberOfLines={3}
                value={taskDescription}
                onChangeText={setTaskDescription}
              />
            </View>

            <View style={styles.rowTwo}>
              <View style={{ flex: 1 }}>
                {renderSelect('type', 'Task type', selectedType?.label || taskType, taskTypes, taskType, setTaskType)}
              </View>
              <View style={{ flex: 1 }}>
                {renderSelect(
                  'status',
                  'Task status',
                  selectedStatus?.label || taskStatus,
                  taskStatuses,
                  taskStatus,
                  setTaskStatus,
                  { dot: selectedStatus?.dot },
                )}
              </View>
            </View>

            {selectedTaskId ? (
              <Pressable
                onPress={() => setSyncTaskStage(!syncTaskStage)}
                style={[
                  styles.syncRow,
                  { backgroundColor: theme.bgSubtle, borderColor: theme.border },
                ]}
              >
                {syncTaskStage ? (
                  <CheckSquare size={18} color={theme.primary} />
                ) : (
                  <Square size={18} color={theme.textMuted} />
                )}
                <Text style={[styles.syncText, { color: theme.text }]}>
                  Update Task Manager status to{' '}
                  <Text style={{ fontWeight: '700', color: theme.primary }}>
                    {taskStatus.toLowerCase() === 'completed' ? 'Completed' : 'In Progress'}
                  </Text>
                </Text>
              </Pressable>
            ) : null}

            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.text }]}>Time Utilized</Text>
              <View style={styles.hoursRow}>
                {HOUR_PRESETS.map((h) => {
                  const active = parseHours(hours) === h;
                  return (
                    <Pressable
                      key={h}
                      onPress={() => setHours(h === 0.5 ? '30m' : `${h}h`)}
                      style={[
                        styles.hourPresetBtn,
                        {
                          backgroundColor: active ? theme.primaryLight : theme.bgSubtle,
                          borderColor: active ? theme.primary : theme.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.hourPresetText,
                          { color: active ? theme.primary : theme.textMuted },
                        ]}
                      >
                        {h === 0.5 ? '30m' : `${h}h`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                style={[
                  styles.input,
                  {
                    marginTop: 8,
                    backgroundColor: theme.bgSubtle,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                placeholder="e.g. 1.5, 30m, 0:30"
                placeholderTextColor={theme.textSubtle}
                value={hours}
                onChangeText={setHours}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.text }]}>Remarks (optional)</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.bgSubtle,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                placeholder="Links, notes, extra context"
                placeholderTextColor={theme.textSubtle}
                value={remarks}
                onChangeText={setRemarks}
              />
            </View>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            {entry ? (
              <Pressable
                disabled={submitting}
                onPress={handleDelete}
                style={[styles.deleteBtn, submitting && { opacity: 0.6 }]}
              >
                <Text style={styles.deleteBtnText}>Delete</Text>
              </Pressable>
            ) : null}
            <Pressable
              disabled={submitting}
              onPress={handleSubmit}
              style={[
                styles.submitBtn,
                { backgroundColor: theme.primary, flex: 1 },
                submitting && { opacity: 0.6 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>{entry ? 'Save changes' : 'Submit log entry'}</Text>
              )}
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: 20,
    gap: 16,
  },
  rowTwo: {
    flexDirection: 'row',
    gap: 12,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  descLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  formatToolbar: {
    flexDirection: 'row',
    gap: 4,
  },
  formatBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 76,
    textAlignVertical: 'top',
  },
  selectBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  selectValue: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  selectText: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  hoursRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  hourPresetBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  hourPresetText: {
    fontSize: 13,
    fontWeight: '700',
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  syncText: {
    fontSize: 13,
    flex: 1,
  },
  taskBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  taskBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  taskOptionCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  taskOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taskOptionClient: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  taskOptionTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  stageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  stageChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  errorBox: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#E11D48',
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    color: '#E11D48',
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deleteBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF1F2',
  },
  deleteBtnText: {
    color: '#E11D48',
    fontSize: 15,
    fontWeight: '600',
  },
  submitBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    margin: 8,
    marginBottom: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  dropdown: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  dropdownScroll: {
    maxHeight: 220,
  },
  dropdownList: {
    padding: 8,
    gap: 6,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  emptyPicker: {
    textAlign: 'center',
    marginTop: 24,
    fontSize: 14,
  },
});

export default LogWorkModal;
