import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Plus, Search, X } from 'lucide-react-native';
import { useTheme } from '../../theme';
import {
  MAX_COLLECTIVE_SUBTASKS,
  newSubtaskDraft,
  type CollectiveSubtaskDraft,
  type TaskPerson,
} from '../../lib/taskForm';

type Props = {
  rows: CollectiveSubtaskDraft[];
  people: TaskPerson[];
  disabled?: boolean;
  onChange: (rows: CollectiveSubtaskDraft[]) => void;
};

/** Sub-task rows (title + assignee) for a collective task. */
export function CollectiveSubtasksEditor({ rows, people, disabled, onChange }: Props) {
  const theme = useTheme();
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) =>
        (p.full_name || p.name || '').toLowerCase().includes(q) ||
        (p.department || '').toLowerCase().includes(q) ||
        (p.role || '').toLowerCase().includes(q),
    );
  }, [people, query]);
  const patch = (key: string, next: Partial<CollectiveSubtaskDraft>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...next } : r)));
  const nameOf = (id: string) => {
    const p = people.find((x) => x.id === id);
    return p?.full_name || p?.name || '';
  };

  return (
    <View style={{ gap: 8 }} testID="collective-subtasks">
      <Text style={[styles.hint, { color: theme.textMuted }]}>
        The main task closes only when every sub-task is done.
      </Text>
      {rows.map((r, i) => (
        <View key={r.key} style={[styles.row, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <TextInput
            value={r.title}
            editable={!disabled}
            maxLength={200}
            onChangeText={(v) => patch(r.key, { title: v })}
            placeholder={`Sub-task ${i + 1}`}
            placeholderTextColor={theme.textMuted}
            style={[styles.input, { color: theme.text }]}
          />
          <View style={styles.rowBottom}>
            <Pressable
              disabled={disabled}
              onPress={() => {
                setQuery('');
                setPickerFor(r.key);
              }}
              style={[styles.assignBtn, { borderColor: theme.primary, backgroundColor: theme.primaryLight }]}
            >
              <Text style={{ color: theme.primary, fontWeight: '600', fontSize: 12 }} numberOfLines={1}>
                {r.assignee_id ? nameOf(r.assignee_id) || 'Assigned' : 'Assign to…'}
              </Text>
            </Pressable>
            <Pressable
              disabled={disabled}
              hitSlop={8}
              onPress={() => onChange(rows.filter((x) => x.key !== r.key))}
              accessibilityLabel={`Remove sub-task ${i + 1}`}
            >
              <X size={16} color={theme.textMuted} />
            </Pressable>
          </View>
        </View>
      ))}
      {rows.length < MAX_COLLECTIVE_SUBTASKS ? (
        <Pressable
          disabled={disabled}
          onPress={() => onChange([...rows, newSubtaskDraft()])}
          style={[styles.addBtn, { borderColor: theme.border }]}
        >
          <Plus size={14} color={theme.primary} />
          <Text style={{ color: theme.primary, fontWeight: '600', fontSize: 13 }}>Add sub-task</Text>
        </Pressable>
      ) : null}

      <Modal visible={pickerFor !== null} transparent animationType="slide" onRequestClose={() => setPickerFor(null)}>
        <View style={styles.sheetRoot}>
          <Pressable style={{ flex: 1 }} onPress={() => setPickerFor(null)} />
          <View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.search, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}>
              <Search size={16} color={theme.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search employees…"
                placeholderTextColor={theme.textMuted}
                style={[styles.input, { color: theme.text, flex: 1 }]}
                autoCapitalize="none"
              />
            </View>
            <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={{ padding: 12, gap: 6 }} keyboardShouldPersistTaps="handled">
              {filtered.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    if (pickerFor) patch(pickerFor, { assignee_id: p.id });
                    setPickerFor(null);
                  }}
                  style={[styles.option, { borderColor: theme.border }]}
                >
                  <Text style={{ color: theme.text, fontWeight: '600' }}>{p.full_name || p.name}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                    {[p.department, p.role].filter(Boolean).join(' · ')}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12 },
  row: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  input: { fontSize: 14, paddingVertical: 4 },
  assignBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 10,
  },
  sheetRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, paddingBottom: 24 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10 },
  option: { borderWidth: 1, borderRadius: 10, padding: 10 },
});
