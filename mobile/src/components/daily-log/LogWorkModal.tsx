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
import { Check, ChevronDown, Search, X } from 'lucide-react-native';
import { api } from '../../lib/api';
import { clearDailyLogCaches } from '../../lib/dailyLogCache';
import { getModuleCache, setModuleCache } from '../../lib/moduleCache';
import { DailyLogEntry } from '../../lib/dailyLog';
import { htmlToPlainText } from '../../lib/taskHtml';
import { useTheme } from '../../theme';
import { SuccessBurst, useSheetMotion } from '../../ui/motion';

interface LogWorkModalProps {
  visible: boolean;
  initialDate?: string;
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

type PickerKey = 'client' | 'type' | 'status' | null;

function optionsFromNames(names: string[]): SelectOption[] {
  return names.filter(Boolean).map((name) => ({ value: name, label: name }));
}

export const LogWorkModal: React.FC<LogWorkModalProps> = ({
  visible,
  initialDate,
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
  const [clientOptions, setClientOptions] = useState<SelectOption[]>(
    () => getModuleCache<SelectOption[]>(WORKSPACES_CACHE) || FALLBACK_CLIENTS,
  );
  const [taskTypes, setTaskTypes] = useState<SelectOption[]>(DEFAULT_TASK_TYPES);
  const [taskStatuses, setTaskStatuses] = useState<SelectOption[]>(DEFAULT_TASK_STATUSES);

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
      setClientProject((prev) => prev || '');

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
      setTaskType((prev) => (nextTypes.some((t) => t.value === prev) ? prev : nextTypes[0]?.value || prev));
      setTaskStatus((prev) => {
        if (nextStatuses.some((s) => s.value === prev)) return prev;
        return nextStatuses.find((s) => s.value === 'Incomplete')?.value || nextStatuses[0]?.value || prev;
      });
    } catch {
      if (!cachedClients?.length) setClientOptions(FALLBACK_CLIENTS);
    } finally {
      setLoadingClients(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      setPicker(null);
      setPickerQuery('');
      return;
    }
    setErrorMsg(null);
    if (entry) {
      setDate(entry.date || initialDate || new Date().toISOString().split('T')[0]);
      setClientProject(entry.client_project || '');
      setTaskDescription(htmlToPlainText(entry.task_description || ''));
      setTaskType(entry.task_type || 'Scheduled Task');
      setTaskStatus(String(entry.task_status || 'Incomplete'));
      setHours(String(entry.hours_utilized ?? '1.0'));
      setRemarks(entry.remarks || '');
    } else {
      setDate(initialDate || new Date().toISOString().split('T')[0]);
    }
    void loadLookups();
  }, [visible, initialDate, entry, loadLookups]);

  const resetForm = () => {
    setTaskDescription('');
    setTaskType(taskTypes[0]?.value || 'Scheduled Task');
    setTaskStatus(taskStatuses.find((s) => s.value === 'Incomplete')?.value || 'Incomplete');
    setHours('1.0');
    setRemarks('');
    setErrorMsg(null);
    setClientProject('');
    setPicker(null);
    setPickerQuery('');
  };

  const handleClose = () => {
    if (submitting) return;
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    const trimmedProject = clientProject.trim();
    const trimmedDesc = taskDescription.trim();
    const parsedHours = parseFloat(hours);

    if (!trimmedProject) {
      setErrorMsg('Please select a client before submitting.');
      setPicker('client');
      return;
    }
    if (!trimmedDesc) {
      setErrorMsg('Please provide a task description.');
      return;
    }
    if (isNaN(parsedHours) || parsedHours <= 0) {
      setErrorMsg('Hours must be greater than 0.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const payload = {
        date,
        client_project: trimmedProject,
        task_description: trimmedDesc,
        task_type: taskType,
        task_status: taskStatus,
        hours_utilized: parsedHours,
        remarks: remarks.trim() || undefined,
      };

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

  const togglePicker = (key: PickerKey) => {
    setPickerQuery('');
    setPicker((prev) => (prev === key ? null : key));
  };

  const filteredClientOptions = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return clientOptions;
    return clientOptions.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [clientOptions, pickerQuery]);

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
              <Text style={[styles.subtitle, { color: theme.textMuted }]}>{date}</Text>
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

            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.text }]}>Task description *</Text>
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

            {renderSelect('type', 'Task type', selectedType?.label || taskType, taskTypes, taskType, setTaskType)}
            {renderSelect(
              'status',
              'Task status',
              selectedStatus?.label || taskStatus,
              taskStatuses,
              taskStatus,
              setTaskStatus,
              { dot: selectedStatus?.dot },
            )}

            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.text }]}>Hours utilized</Text>
              <View style={styles.hoursRow}>
                {HOUR_PRESETS.map((h) => {
                  const active = parseFloat(hours) === h;
                  return (
                    <Pressable
                      key={h}
                      onPress={() => setHours(String(h))}
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
                keyboardType="decimal-pad"
                placeholder="Custom hours (e.g. 2.5)"
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
    maxHeight: '90%',
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
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
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
    fontSize: 15,
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
    fontSize: 15,
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
