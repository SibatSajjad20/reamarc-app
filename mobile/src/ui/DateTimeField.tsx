import React, { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { formatDisplayDate, formatTime } from './format';

function parseDate(iso: string) {
  if (!iso) return new Date();
  const parts = iso.split('-').map(Number);
  if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  }
  return new Date();
}

function parseTime(hhmm: string) {
  const d = new Date();
  if (!hhmm) {
    d.setHours(9, 30, 0, 0);
    return d;
  }
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(!isNaN(h) ? h : 9, !isNaN(m) ? m : 30, 0, 0);
  return d;
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
                style={styles.doneBtn}
                onPress={() => {
                  onChange(draft);
                  setOpen(false);
                }}
              >
                <Text style={styles.done}>Done</Text>
              </Pressable>
            </View>
            <View style={mode === 'date' ? styles.datePickerBox : styles.timePickerBox}>
              <DateTimePicker
                value={draft}
                mode={mode}
                display={mode === 'date' ? 'inline' : 'spinner'}
                textColor="#0F172A"
                themeVariant="light"
                accentColor={colors.indigo}
                style={mode === 'date' ? styles.inlineDatePicker : styles.spinnerTimePicker}
                onChange={(_, selected) => {
                  if (selected) setDraft(selected);
                }}
              />
            </View>
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
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  sheetHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sheetTitle: { fontWeight: '800', color: colors.text, fontSize: 16 },
  doneBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
  },
  done: { color: colors.indigo, fontWeight: '800', fontSize: 14 },
  datePickerBox: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: '#FFFFFF',
    minHeight: 320,
    justifyContent: 'center',
  },
  inlineDatePicker: {
    height: 320,
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
  timePickerBox: {
    height: 216,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  spinnerTimePicker: {
    height: 216,
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
});
