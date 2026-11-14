import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { useTheme } from '../theme';

export type SelectOption = { value: string; label: string; hint?: string };

type Props = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  searchable?: boolean;
  emptyText?: string;
};

export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder,
  required,
  searchable,
  emptyText = 'No options',
}: Props) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((item) => item.value === value);
  const showSearch = searchable ?? options.length > 8;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((item) => `${item.label} ${item.hint || ''}`.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.textMuted }]}>
        {label}
        {required ? <Text style={{ color: theme.rose }}> *</Text> : null}
      </Text>
      <Pressable
        onPress={() => {
          setQuery('');
          setOpen(true);
        }}
        style={[styles.control, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <Text numberOfLines={1} style={[styles.controlText, { color: selected ? theme.text : theme.textMuted }]}>
          {selected?.label || placeholder || 'Select'}
        </Text>
        <ChevronDown size={16} color={theme.textMuted} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.menuCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.menuTitle, { color: theme.text }]}>{label}</Text>
            {showSearch ? (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search…"
                placeholderTextColor={theme.textMuted}
                style={[
                  styles.search,
                  { color: theme.text, backgroundColor: theme.bgSubtle, borderColor: theme.border },
                ]}
              />
            ) : null}
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              {filtered.length === 0 ? (
                <Text style={[styles.empty, { color: theme.textMuted }]}>{emptyText}</Text>
              ) : (
                filtered.map((item) => {
                  const active = item.value === value;
                  return (
                    <Pressable
                      key={item.value || 'blank'}
                      style={[
                        styles.menuRow,
                        active ? { backgroundColor: theme.primaryLight } : null,
                      ]}
                      onPress={() => {
                        onChange(item.value);
                        setOpen(false);
                      }}
                    >
                      <Text style={[styles.menuRowText, { color: active ? theme.primary : theme.text }]}>
                        {item.label}
                      </Text>
                      {item.hint ? (
                        <Text style={[styles.menuHint, { color: theme.textMuted }]}>{item.hint}</Text>
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
  controlText: { flex: 1, fontSize: 15, fontWeight: '400' },
  search: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 24 },
  menuCard: { borderRadius: 16, borderWidth: 1, padding: 12, maxHeight: '70%' },
  menuTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8, paddingHorizontal: 6 },
  menuRow: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10, marginBottom: 2 },
  menuRowText: { fontSize: 15, fontWeight: '500' },
  menuHint: { fontSize: 12, marginTop: 2, fontWeight: '400' },
  empty: { paddingVertical: 16, textAlign: 'center', fontSize: 13 },
});
