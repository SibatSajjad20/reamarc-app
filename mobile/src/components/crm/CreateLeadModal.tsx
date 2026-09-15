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
import type { CrmAssignee, CrmLeadCreatePayload } from '../../types/crm';

interface CreateLeadModalProps {
  visible: boolean;
  assignees: CrmAssignee[];
  canAssign: boolean;
  onClose: () => void;
  onSubmit: (payload: CrmLeadCreatePayload) => Promise<void>;
}

const SOURCES = ['manual', 'website', 'referral', 'meta', 'google', 'other'];
const SERVICES = ['Branding', 'Website', 'Performance Marketing', 'Social Media', 'SEO', 'Other'];

export const CreateLeadModal: React.FC<CreateLeadModalProps> = ({
  visible,
  assignees,
  canAssign,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [city, setCity] = useState('');
  const [service, setService] = useState('');
  const [source, setSource] = useState('manual');
  const [assignedTo, setAssignedTo] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setPhone('');
    setEmail('');
    setCompany('');
    setCity('');
    setService('');
    setSource('manual');
    setAssignedTo('');
    setNote('');
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Lead name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        company: company.trim() || undefined,
        city: city.trim() || undefined,
        service: service || undefined,
        source: source || 'manual',
        assigned_to: assignedTo || undefined,
        note: note.trim() || undefined,
      });
      reset();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create lead.');
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
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>New Lead</Text>
              <Text style={styles.subtitle}>Enter contact and requirements</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <Ionicons name="close" size={22} color="#71717A" />
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.rose} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. John Doe"
                placeholderTextColor="#A1A1AA"
                value={name}
                onChangeText={setName}
                autoFocus
              />
            </View>

            {/* Phone */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone / WhatsApp</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. +923001234567"
                placeholderTextColor="#A1A1AA"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
            </View>

            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. john@example.com"
                placeholderTextColor="#A1A1AA"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            {/* Company & City */}
            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Company</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Acme Corp"
                  placeholderTextColor="#A1A1AA"
                  value={company}
                  onChangeText={setCompany}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>City</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Lahore"
                  placeholderTextColor="#A1A1AA"
                  value={city}
                  onChangeText={setCity}
                />
              </View>
            </View>

            {/* Service Interested */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Service</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {SERVICES.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, service === s ? styles.chipActive : null]}
                    onPress={() => setService(service === s ? '' : s)}
                  >
                    <Text style={[styles.chipText, service === s ? styles.chipTextActive : null]}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Source */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Source</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {SOURCES.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, source === s ? styles.chipActive : null]}
                    onPress={() => setSource(s)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        source === s ? styles.chipTextActive : null,
                        { textTransform: 'capitalize' },
                      ]}
                    >
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Assignee (if permitted) */}
            {canAssign && assignees.length > 0 ? (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Assign To</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  <TouchableOpacity
                    style={[styles.chip, !assignedTo ? styles.chipActive : null]}
                    onPress={() => setAssignedTo('')}
                  >
                    <Text style={[styles.chipText, !assignedTo ? styles.chipTextActive : null]}>
                      Unassigned Pool
                    </Text>
                  </TouchableOpacity>
                  {assignees.map((a) => (
                    <TouchableOpacity
                      key={a.id}
                      style={[styles.chip, assignedTo === a.id ? styles.chipActive : null]}
                      onPress={() => setAssignedTo(a.id)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          assignedTo === a.id ? styles.chipTextActive : null,
                        ]}
                      >
                        {a.full_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* Notes */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Initial Requirement / Note</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="What did the client request? Initial thoughts..."
                placeholderTextColor="#A1A1AA"
                multiline
                numberOfLines={3}
                value={note}
                onChangeText={setNote}
              />
            </View>
          </ScrollView>

          {/* Action Footer */}
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
                <>
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                  <Text style={styles.submitText}>Create Lead</Text>
                </>
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
    maxHeight: '90%',
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
    fontSize: 18,
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
    minHeight: 70,
    textAlignVertical: 'top',
  },
  chipScroll: {
    flexDirection: 'row',
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
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    gap: 6,
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
