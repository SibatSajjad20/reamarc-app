import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import type { CrmAssignee, CrmLead, CrmLeadCreatePayload } from '../../types/crm';

interface CreateLeadModalProps {
  visible: boolean;
  assignees: CrmAssignee[];
  canAssign: boolean;
  mode?: 'create' | 'edit';
  initialLead?: CrmLead | null;
  onClose: () => void;
  onSubmit: (payload: CrmLeadCreatePayload & { mark_form_complete?: boolean }) => Promise<void>;
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

function DropdownField({
  label,
  options,
  value,
  onChange,
  required,
  placeholder = 'Select',
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((item) => item.value === value);
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>
        {label} {required ? <Text style={styles.required}>*</Text> : null}
      </Text>
      <TouchableOpacity style={styles.dropdown} onPress={() => setOpen(true)}>
        <Text numberOfLines={1} style={selected ? styles.dropdownValue : styles.dropdownPlaceholder}>
          {selected?.label || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#71717A" />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.menuCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.menuTitle}>{label}</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {options.map((item) => (
                <TouchableOpacity
                  key={item.value || 'blank'}
                  style={styles.menuRow}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.menuRowText, item.value === value ? styles.menuRowTextActive : null]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function MultiDropdownField({
  label,
  options,
  values,
  onChange,
  required,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>
        {label} {required ? <Text style={styles.required}>*</Text> : null}
      </Text>
      <TouchableOpacity style={styles.dropdown} onPress={() => setOpen(true)}>
        <Text numberOfLines={1} style={values.length ? styles.dropdownValue : styles.dropdownPlaceholder}>
          {values.length ? values.join(', ') : 'Select'}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#71717A" />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.menuCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.menuTitle}>{label}</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {options.map((item) => {
                const on = values.includes(item);
                return (
                  <TouchableOpacity
                    key={item}
                    style={styles.menuRow}
                    onPress={() =>
                      onChange(on ? values.filter((value) => value !== item) : [...values, item])
                    }
                  >
                    <Text style={[styles.menuRowText, on ? styles.menuRowTextActive : null]}>{item}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.menuDone} onPress={() => setOpen(false)}>
              <Text style={styles.menuDoneText}>Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function asOptions(options: string[]) {
  return options.map((item) => ({ value: item, label: item }));
}

export const CreateLeadModal: React.FC<CreateLeadModalProps> = ({
  visible,
  assignees,
  canAssign,
  mode = 'create',
  initialLead,
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
  const [helpOther, setHelpOther] = useState('');
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
    setHelpOther('');
    setObjective('');
    setStartTimeline('');
    setBudget('');
    setSource('manual');
    setAssignedTo('');
    setNote('');
    setError(null);
  };

  useEffect(() => {
    if (!visible) return;
    if (mode === 'edit' && initialLead) {
      setName(initialLead.name || '');
      setPhone(initialLead.phone_e164 ? `+${initialLead.phone_e164}` : initialLead.phone_raw || '');
      setEmail(initialLead.email || '');
      setCompany(initialLead.company || '');
      setWebsite(initialLead.website || '');
      setNoWebsite(Boolean(initialLead.no_website));
      setCity(initialLead.city || '');
      setRole(initialLead.role || '');
      setIndustry(initialLead.industry || '');
      setBusinessStage(initialLead.business_stage || '');
      setEmployeeCount(initialLead.employee_count || '');
      setSalesTeam(initialLead.sales_team || '');
      setHelpWith(initialLead.help_with || []);
      setHelpOther(initialLead.help_other || '');
      setObjective(initialLead.objective || '');
      setStartTimeline(initialLead.start_timeline || '');
      setBudget(initialLead.budget || '');
      setSource(initialLead.source || 'manual');
      setNote(initialLead.brief || '');
      setError(null);
      return;
    }
    reset();
  }, [visible, mode, initialLead?.id]);

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
    if (helpWith.includes('Other') && helpOther.replace(/[^a-zA-Z]/g, '').length <= 6) {
      setError('The specific need needs more than 6 letters.');
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
        help_other: helpWith.includes('Other') ? helpOther.trim() : undefined,
        objective,
        start_timeline: startTimeline,
        budget: budget || undefined,
        brief: note.trim(),
        city: city.trim() || undefined,
        ...(mode === 'create' ? { source: source || 'manual', assigned_to: assignedTo || undefined } : { mark_form_complete: true }),
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
              <Text style={styles.title}>{mode === 'edit' ? 'Lead form' : 'New Lead'}</Text>
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

            <DropdownField label="Role" required options={asOptions(ROLES)} value={role} onChange={setRole} />
            <DropdownField label="Business" required options={asOptions(INDUSTRIES)} value={industry} onChange={setIndustry} />
            <DropdownField label="Stage" required options={asOptions(STAGES)} value={businessStage} onChange={setBusinessStage} />
            <DropdownField label="Employees" required options={asOptions(EMPLOYEES)} value={employeeCount} onChange={setEmployeeCount} />
            <DropdownField label="Sales team" required options={asOptions(SALES)} value={salesTeam} onChange={setSalesTeam} />
            <MultiDropdownField label="Help with" required options={HELP} values={helpWith} onChange={setHelpWith} />
            {helpWith.includes('Other') ? (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Specific need <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="What else do they need help with?"
                  placeholderTextColor="#A1A1AA"
                  value={helpOther}
                  onChangeText={setHelpOther}
                />
              </View>
            ) : null}
            <DropdownField label="Objective" required options={asOptions(OBJECTIVES)} value={objective} onChange={setObjective} />
            <DropdownField label="Start" required options={asOptions(STARTS)} value={startTimeline} onChange={setStartTimeline} />
            <DropdownField
              label="Budget"
              options={asOptions(BUDGETS)}
              value={budget}
              onChange={setBudget}
              placeholder="Not provided"
            />
            {mode === 'create' ? (
              <DropdownField
                label="Source"
                options={SOURCES.map((item) => ({ value: item, label: item.charAt(0).toUpperCase() + item.slice(1) }))}
                value={source}
                onChange={setSource}
              />
            ) : null}
            {mode === 'create' && canAssign && assignees.length > 0 ? (
              <DropdownField
                label="Assign To"
                options={[
                  { value: '', label: 'Unassigned Pool' },
                  ...assignees.map((person) => ({ value: person.id, label: person.full_name })),
                ]}
                value={assignedTo}
                onChange={setAssignedTo}
              />
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
                  <Text style={styles.submitText}>{mode === 'edit' ? 'Save form' : 'Create Lead'}</Text>
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
  dropdown: {
    marginTop: 6,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dropdownValue: {
    flex: 1,
    fontSize: 14,
    color: '#18181B',
  },
  dropdownPlaceholder: {
    flex: 1,
    fontSize: 14,
    color: '#A1A1AA',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 28,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#18181B',
    marginBottom: 8,
  },
  menuRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F5',
  },
  menuRowText: {
    fontSize: 14,
    color: '#3F3F46',
  },
  menuRowTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  menuDone: {
    marginTop: 12,
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  menuDoneText: {
    color: '#FFFFFF',
    fontWeight: '700',
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
