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
const ROLES = ['Owner / Founder', 'CEO / Director', 'Partner', 'Marketing Head / Manager', 'Sales Head / Manager', 'Business Development', 'Operations / Project Manager', 'Other Management', 'Employee / Team Member', 'Consultant', 'Other'];
const INDUSTRIES = ['Real Estate', 'Architecture / Construction', 'Hospitality', 'Education', 'Healthcare', 'Apparel / Fashion', 'E-commerce', 'Manufacturing', 'SaaS / Technology', 'Professional Services', 'Other'];
const STAGES = ['Idea / Pre-launch', 'New / Recently launched', 'Growing', 'Established', 'Expanding / Scaling'];
const EMPLOYEES = ['Just me', '2-5', '6-10', '11-25', '26-50', '51-100', '100+'];
const SALES = ['Yes, dedicated sales team', 'Yes, 1-2 salespeople', 'Sales handled by management / owners', 'No sales team', 'Building a sales team'];
const HELP = ['Strategy / Consultancy', 'Branding', 'Website Design & Development', 'Social Media Management', 'Performance Marketing / Lead Generation', 'SEO', 'Video Production', 'Software Development', 'App Development', 'AI Application Development', 'Other'];
const OBJECTIVES = ['Launch a new project / business', 'Improve branding / rebrand', 'Improve our website / digital presence', 'Generate qualified leads', 'Increase sales', 'Build a complete marketing system', 'Other'];
const STARTS = ['Immediately', 'Within 30 days', '1-3 months', '3-6 months', 'Just researching'];
const BUDGETS = ['Under PKR 100K / month', 'PKR 100K-250K / month', 'PKR 250K-500K / month', 'PKR 500K-1M / month', 'PKR 1M-2.5M / month', 'PKR 2.5M-5M / month', 'PKR 5M+ / month', 'Not decided yet', 'Prefer to discuss with our sales team'];

function ChoiceRow({
  label,
  options,
  value,
  onChange,
  required,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>
        {label} {required ? <Text style={styles.required}>*</Text> : null}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        {options.map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.chip, value === item ? styles.chipActive : null]}
            onPress={() => onChange(value === item ? '' : item)}
          >
            <Text style={[styles.chipText, value === item ? styles.chipTextActive : null]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

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
  const [website, setWebsite] = useState('');
  const [noWebsite, setNoWebsite] = useState(false);
  const [city, setCity] = useState('');
  const [role, setRole] = useState('');
  const [industry, setIndustry] = useState('');
  const [businessStage, setBusinessStage] = useState('');
  const [employeeCount, setEmployeeCount] = useState('');
  const [salesTeam, setSalesTeam] = useState('');
  const [helpWith, setHelpWith] = useState<string[]>([]);
  const [objective, setObjective] = useState('');
  const [startTimeline, setStartTimeline] = useState('');
  const [budget, setBudget] = useState('');
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
    setWebsite('');
    setNoWebsite(false);
    setCity('');
    setRole('');
    setIndustry('');
    setBusinessStage('');
    setEmployeeCount('');
    setSalesTeam('');
    setHelpWith([]);
    setObjective('');
    setStartTimeline('');
    setBudget('');
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
    if (!name.trim() || !company.trim() || !email.trim() || !phone.trim()) {
      setError('Name, company, email, and phone are required.');
      return;
    }
    if (!noWebsite && !website.trim()) {
      setError('Website is required, or mark that there is no website.');
      return;
    }
    if (!role || !industry || !businessStage || !employeeCount || !salesTeam || !objective || !startTimeline) {
      setError('Complete the business and need questions.');
      return;
    }
    if (helpWith.length === 0) {
      setError('Select at least one thing they need help with.');
      return;
    }
    if (!note.trim()) {
      setError('Describe what they need.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        company: company.trim(),
        website: noWebsite ? undefined : website.trim(),
        no_website: noWebsite,
        role,
        industry,
        business_stage: businessStage,
        employee_count: employeeCount,
        sales_team: salesTeam,
        help_with: helpWith,
        objective,
        start_timeline: startTimeline,
        budget: budget || undefined,
        brief: note.trim(),
        city: city.trim() || undefined,
        source: source || 'manual',
        assigned_to: assignedTo || undefined,
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
                Full name <Text style={styles.required}>*</Text>
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
              <Text style={styles.label}>
                WhatsApp / phone <Text style={styles.required}>*</Text>
              </Text>
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
              <Text style={styles.label}>
                Work email <Text style={styles.required}>*</Text>
              </Text>
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
                <Text style={styles.label}>
                  Company <Text style={styles.required}>*</Text>
                </Text>
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

            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Website {!noWebsite ? <Text style={styles.required}>*</Text> : null}
              </Text>
              <TextInput
                style={styles.input}
                placeholder="https://company.com"
                placeholderTextColor="#A1A1AA"
                autoCapitalize="none"
                editable={!noWebsite}
                value={website}
                onChangeText={setWebsite}
              />
              <TouchableOpacity style={styles.checkRow} onPress={() => setNoWebsite((v) => !v)}>
                <Ionicons name={noWebsite ? 'checkbox' : 'square-outline'} size={18} color="#4F46E5" />
                <Text style={styles.checkText}>No website</Text>
              </TouchableOpacity>
            </View>

            <ChoiceRow label="Role" required options={ROLES} value={role} onChange={setRole} />
            <ChoiceRow label="Business" required options={INDUSTRIES} value={industry} onChange={setIndustry} />
            <ChoiceRow label="Stage" required options={STAGES} value={businessStage} onChange={setBusinessStage} />
            <ChoiceRow label="Employees" required options={EMPLOYEES} value={employeeCount} onChange={setEmployeeCount} />
            <ChoiceRow label="Sales team" required options={SALES} value={salesTeam} onChange={setSalesTeam} />
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Help with <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.wrap}>
                {HELP.map((item) => {
                  const on = helpWith.includes(item);
                  return (
                    <TouchableOpacity
                      key={item}
                      style={[styles.chip, on ? styles.chipActive : null]}
                      onPress={() =>
                        setHelpWith((prev) => (on ? prev.filter((x) => x !== item) : [...prev, item]))
                      }
                    >
                      <Text style={[styles.chipText, on ? styles.chipTextActive : null]}>{item}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <ChoiceRow label="Objective" required options={OBJECTIVES} value={objective} onChange={setObjective} />
            <ChoiceRow label="Start" required options={STARTS} value={startTimeline} onChange={setStartTimeline} />
            <ChoiceRow label="Budget" options={BUDGETS} value={budget} onChange={setBudget} />

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
              <Text style={styles.label}>
                What they need <Text style={styles.required}>*</Text>
              </Text>
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
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  checkText: {
    fontSize: 12,
    color: '#3F3F46',
    fontWeight: '600',
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
