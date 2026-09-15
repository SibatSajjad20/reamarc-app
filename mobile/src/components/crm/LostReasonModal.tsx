import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';

interface LostReasonModalProps {
  visible: boolean;
  title?: string;
  onClose: () => void;
  onSubmit: (reason: string, note?: string) => Promise<void>;
}

const REASONS = [
  { id: 'budget', label: 'Price / Budget Mismatch' },
  { id: 'timing', label: 'Bad Timing / Project Deferred' },
  { id: 'competitor', label: 'Chose Competitor' },
  { id: 'no_response', label: 'Unresponsive / Ghosted' },
  { id: 'not_a_fit', label: 'Requirements Out of Scope' },
  { id: 'unqualified', label: 'Unqualified / No Budget' },
  { id: 'other', label: 'Other Reason' },
];

export const LostReasonModal: React.FC<LostReasonModalProps> = ({
  visible,
  title = 'Mark as Lost',
  onClose,
  onSubmit,
}) => {
  const [selectedReason, setSelectedReason] = useState<string>('budget');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit(selectedReason, note.trim() || undefined);
      setNote('');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="alert-circle" size={20} color={colors.rose} />
            </View>
            <View style={styles.headerTextContainer}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>Select the primary reason for tracking</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#71717A" />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Reason</Text>
          <View style={styles.reasonsList}>
            {REASONS.map((r) => {
              const active = selectedReason === r.id;
              return (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.reasonRow, active ? styles.reasonRowActive : null]}
                  onPress={() => setSelectedReason(r.id)}
                >
                  <Text style={[styles.reasonLabel, active ? styles.reasonLabelActive : null]}>
                    {r.label}
                  </Text>
                  {active ? (
                    <Ionicons name="checkmark-circle" size={16} color={colors.rose} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>Details (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Additional context or competitor details..."
            placeholderTextColor="#A1A1AA"
            multiline
            numberOfLines={2}
            value={note}
            onChangeText={setNote}
          />

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitText}>Confirm</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#0F172A',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFF1F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#18181B',
  },
  subtitle: {
    fontSize: 12,
    color: '#71717A',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#71717A',
    marginBottom: 8,
  },
  reasonsList: {
    marginBottom: 12,
    gap: 5,
  },
  reasonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  reasonRowActive: {
    backgroundColor: '#FFF1F2',
    borderColor: colors.rose,
  },
  reasonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3F3F46',
  },
  reasonLabelActive: {
    color: colors.rose,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#F4F4F5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#18181B',
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    marginBottom: 14,
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#71717A',
  },
  submitBtn: {
    flex: 2,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
