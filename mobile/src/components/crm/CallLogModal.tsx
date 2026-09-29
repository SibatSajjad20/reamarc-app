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
import type { CrmLead } from '../../types/crm';

interface CallLogModalProps {
  visible: boolean;
  lead: CrmLead | null;
  onClose: () => void;
  onLogOutcome: (outcome: string, note?: string) => Promise<void>;
}

const CALL_OUTCOMES = [
  { id: 'connected', label: 'Connected & Interested', icon: 'checkmark-circle', color: colors.emerald },
  { id: 'voicemail', label: 'Left Voicemail', icon: 'mic-outline', color: colors.indigo },
  { id: 'no_answer', label: 'No Answer / Busy', icon: 'call-outline', color: colors.amber },
  { id: 'wrong_number', label: 'Wrong Number / Not Interested', icon: 'close-circle', color: colors.rose },
];

export const CallLogModal: React.FC<CallLogModalProps> = ({
  visible,
  lead,
  onClose,
  onLogOutcome,
}) => {
  const [selectedOutcome, setSelectedOutcome] = useState<string>('connected');
  const [customNote, setCustomNote] = useState('');
  const [saving, setSaving] = useState(false);

  if (!lead) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onLogOutcome(selectedOutcome, customNote.trim() || undefined);
      setCustomNote('');
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
              <Ionicons name="call" size={20} color="#4F46E5" />
            </View>
            <View style={styles.headerTextContainer}>
              <Text style={styles.title}>Log Call Result</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                Call with {lead.name}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#71717A" />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Call Outcome</Text>
          <View style={styles.outcomesList}>
            {CALL_OUTCOMES.map((o) => {
              const active = selectedOutcome === o.id;
              return (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.outcomeRow, active ? styles.outcomeRowActive : null]}
                  onPress={() => setSelectedOutcome(o.id)}
                >
                  <Ionicons name={o.icon as any} size={18} color={o.color} />
                  <Text style={[styles.outcomeLabel, active ? styles.outcomeLabelActive : null]}>
                    {o.label}
                  </Text>
                  {active ? (
                    <Ionicons name="checkmark" size={16} color="#4F46E5" style={{ marginLeft: 'auto' }} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>Call Notes (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Key points discussed, next steps..."
            placeholderTextColor="#A1A1AA"
            multiline
            numberOfLines={2}
            value={customNote}
            onChangeText={setCustomNote}
          />

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.saveText}>Save Call Log</Text>
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
    marginBottom: 16,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
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
  outcomesList: {
    marginBottom: 14,
    gap: 6,
  },
  outcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  outcomeRowActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  outcomeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3F3F46',
  },
  outcomeLabelActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#F4F4F5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#18181B',
    minHeight: 56,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    marginBottom: 16,
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
  saveBtn: {
    flex: 2,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
