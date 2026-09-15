import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import type { CrmDealCreatePayload } from '../../types/crm';

interface DealModalProps {
  visible: boolean;
  leadName?: string;
  onClose: () => void;
  onSubmit: (payload: CrmDealCreatePayload) => Promise<void>;
}

const SERVICES = ['Branding', 'Website', 'Performance Marketing', 'Social Media', 'SEO', 'Other'];

export const DealModal: React.FC<DealModalProps> = ({
  visible,
  leadName,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [service, setService] = useState('Website');
  const [value, setValue] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [billingType, setBillingType] = useState<'one_time' | 'retainer'>('one_time');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setTitle('');
    setValue('');
    setNotes('');
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    const numVal = parseFloat(value.replace(/[^0-9.]/g, ''));
    if (!title.trim()) {
      setError('Deal title is required.');
      return;
    }
    if (isNaN(numVal) || numVal < 0) {
      setError('Enter a valid deal value.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        title: title.trim(),
        service,
        value: numVal,
        currency,
        billing_type: billingType,
        notes: notes.trim() || undefined,
      });
      handleClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create deal.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>New Commercial Deal</Text>
              {leadName ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  For {leadName}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <Ionicons name="close" size={20} color="#71717A" />
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.rose} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Title */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Deal Title <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Q4 Website Redesign & SEO"
                placeholderTextColor="#A1A1AA"
                value={title}
                onChangeText={setTitle}
                autoFocus
              />
            </View>

            {/* Value & Currency */}
            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 2, marginRight: 8 }]}>
                <Text style={styles.label}>
                  Value <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="5000"
                  placeholderTextColor="#A1A1AA"
                  keyboardType="numeric"
                  value={value}
                  onChangeText={setValue}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Currency</Text>
                <View style={styles.currencyToggle}>
                  {['USD', 'PKR', 'AED'].map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.currencyBtn, currency === c ? styles.currencyBtnActive : null]}
                      onPress={() => setCurrency(c)}
                    >
                      <Text
                        style={[
                          styles.currencyText,
                          currency === c ? styles.currencyTextActive : null,
                        ]}
                      >
                        {c}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* Billing Type */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Billing Model</Text>
              <View style={styles.billingToggle}>
                <TouchableOpacity
                  style={[
                    styles.billingBtn,
                    billingType === 'one_time' ? styles.billingBtnActive : null,
                  ]}
                  onPress={() => setBillingType('one_time')}
                >
                  <Text
                    style={[
                      styles.billingText,
                      billingType === 'one_time' ? styles.billingTextActive : null,
                    ]}
                  >
                    One-Time Project
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.billingBtn,
                    billingType === 'retainer' ? styles.billingBtnActive : null,
                  ]}
                  onPress={() => setBillingType('retainer')}
                >
                  <Text
                    style={[
                      styles.billingText,
                      billingType === 'retainer' ? styles.billingTextActive : null,
                    ]}
                  >
                    Monthly Retainer
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Primary Service */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Primary Service</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {SERVICES.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, service === s ? styles.chipActive : null]}
                    onPress={() => setService(s)}
                  >
                    <Text style={[styles.chipText, service === s ? styles.chipTextActive : null]}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Notes */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Deal Scope / Commercial Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Deliverables, payment milestones, scope..."
                placeholderTextColor="#A1A1AA"
                multiline
                numberOfLines={3}
                value={notes}
                onChangeText={setNotes}
              />
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} disabled={saving}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitBtn, saving ? styles.disabledBtn : null]}
              onPress={handleSubmit}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitText}>Save Deal</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F5',
  },
  title: {
    fontSize: 17,
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
    borderRadius: 20,
    backgroundColor: '#F4F4F5',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF1F2',
    marginHorizontal: 20,
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
  },
  errorText: {
    fontSize: 12,
    color: '#E11D48',
    fontWeight: '600',
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  inputGroup: {
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3F3F46',
    marginBottom: 6,
  },
  required: {
    color: '#E11D48',
  },
  input: {
    backgroundColor: '#F4F4F5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#18181B',
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  textArea: {
    minHeight: 65,
    textAlignVertical: 'top',
  },
  currencyToggle: {
    flexDirection: 'row',
    backgroundColor: '#F4F4F5',
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  currencyBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 9,
  },
  currencyBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  currencyText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#71717A',
  },
  currencyTextActive: {
    color: '#18181B',
  },
  billingToggle: {
    flexDirection: 'row',
    backgroundColor: '#F4F4F5',
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    gap: 4,
  },
  billingBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 10,
  },
  billingBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  billingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#71717A',
  },
  billingTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  chip: {
    backgroundColor: '#F4F4F5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  chipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#52525B',
  },
  chipTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F4F4F5',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F4F5',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#71717A',
  },
  submitBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
