import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import { formatFollowUp } from '../../ui/format';

interface FollowUpSheetProps {
  visible: boolean;
  currentFollowUp?: string | null;
  onClose: () => void;
  onSave: (iso: string | null) => Promise<void>;
}

function atLocalHour(daysFromNow: number, hour = 10): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d;
}

const PRESETS = [
  { id: 'tomorrow', label: 'Tomorrow 10:00', getDate: () => atLocalHour(1, 10) },
  { id: '2d', label: 'In 2 days', getDate: () => atLocalHour(2, 10) },
  { id: 'week', label: 'Next week', getDate: () => atLocalHour(7, 10) },
];

export const FollowUpSheet: React.FC<FollowUpSheetProps> = ({
  visible,
  currentFollowUp,
  onClose,
  onSave,
}) => {
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [customDate, setCustomDate] = useState(() => atLocalHour(1, 10));

  const runSave = async (iso: string | null) => {
    setSaving(true);
    try {
      await onSave(iso);
      onClose();
    } finally {
      setSaving(false);
      setShowPicker(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Set follow-up</Text>
          <Text style={styles.subtitle}>
            {currentFollowUp
              ? `Current: ${formatFollowUp(currentFollowUp)}`
              : 'Remind yourself to reach out again'}
          </Text>

          <View style={styles.list}>
            {PRESETS.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={styles.row}
                disabled={saving}
                onPress={() => runSave(p.getDate().toISOString())}
              >
                <Ionicons name="alarm-outline" size={18} color={colors.indigo} />
                <Text style={styles.rowLabel}>{p.label}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.row}
              disabled={saving}
              onPress={() => {
                setCustomDate(atLocalHour(1, 10));
                setShowPicker(true);
              }}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.indigo} />
              <Text style={styles.rowLabel}>Pick date & time</Text>
            </TouchableOpacity>

            {currentFollowUp ? (
              <TouchableOpacity
                style={[styles.row, styles.clearRow]}
                disabled={saving}
                onPress={() => runSave(null)}
              >
                <Ionicons name="close-circle-outline" size={18} color={colors.rose} />
                <Text style={styles.clearLabel}>Clear follow-up</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {showPicker ? (
            <View style={styles.pickerBox}>
              <DateTimePicker
                value={customDate}
                mode="datetime"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={new Date()}
                onChange={(_event, date) => {
                  if (Platform.OS === 'android') {
                    setShowPicker(false);
                  }
                  if (date) {
                    setCustomDate(date);
                    if (Platform.OS === 'android') {
                      void runSave(date.toISOString());
                    }
                  }
                }}
              />
              {Platform.OS === 'ios' ? (
                <TouchableOpacity
                  style={styles.doneBtn}
                  disabled={saving}
                  onPress={() => runSave(customDate.toISOString())}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.doneBtnText}>Save</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {saving && !showPicker ? (
            <ActivityIndicator style={{ marginTop: 12 }} color={colors.indigo} />
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(24, 24, 27, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
    marginBottom: 16,
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  clearRow: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  clearLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.rose,
  },
  pickerBox: {
    marginTop: 12,
  },
  doneBtn: {
    marginTop: 8,
    backgroundColor: colors.indigo,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
