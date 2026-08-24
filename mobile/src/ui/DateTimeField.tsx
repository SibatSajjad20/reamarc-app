import React, { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { formatDisplayDate, formatTime } from './format';

function parseDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const next = new Date();
  if (y && m && d) next.setFullYear(y, m - 1, d);
  next.setHours(12, 0, 0, 0);
  return next;
}

function parseTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const next = new Date();
  next.setHours(h || 0, m || 0, 0, 0);
  return next;
}

function toIsoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toHhmm(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <PickerField
      label={label}
      display={formatDisplayDate(value)}
      icon="calendar-outline"
      mode="date"
      date={parseDate(value)}
      onChange={(d) => onChange(toIsoDate(d))}
    />
  );
}

export function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <PickerField
      label={label}
      display={formatTime(value)}
      icon="time-outline"
      mode="time"
      date={parseTime(value)}
      onChange={(d) => onChange(toHhmm(d))}
    />
  );
}

function PickerField({
  label,
  display,
  icon,
  mode,
  date,
  onChange,
}: {
  label: string;
  display: string;
  icon: keyof typeof Ionicons.glyphMap;
  mode: 'date' | 'time';
  date: Date;
  onChange: (next: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(date);
  const value = useMemo(() => date, [date]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => {
          setDraft(value);
          setOpen(true);
        }}
        style={styles.field}
      >
        <Ionicons name={icon} size={18} color={colors.indigo} />
        <Text style={styles.value}>{display}</Text>
      </Pressable>
      {open && Platform.OS === 'android' ? (
        <DateTimePicker
          value={value}
          mode={mode}
          display="default"
          onChange={(_, selected) => {
            setOpen(false);
            if (selected) onChange(selected);
          }}
        />
      ) : null}
      {Platform.OS === 'ios' ? (
        <Modal visible={open} transparent animationType="slide">
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable
                onPress={() => {
                  onChange(draft);
                  setOpen(false);
                }}
              >
                <Text style={styles.done}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={draft}
              mode={mode}
              display="spinner"
              onChange={(_, selected) => {
                if (selected) setDraft(selected);
              }}
            />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '700', color: colors.slate, marginBottom: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  value: { color: colors.text, fontWeight: '700', fontSize: 15 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
  },
  sheetHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  sheetTitle: { fontWeight: '800', color: colors.text },
  done: { color: colors.indigo, fontWeight: '800' },
});
