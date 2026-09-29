import React, { useEffect, useState } from 'react';
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
import type { CrmLead } from '../../types/crm';

export interface CallLogAnswers {
  outcome: string;
  note?: string;
  role: string;
  business_stage: string;
  employee_count: string;
  sales_team: string;
  objective: string;
  budget?: string;
}

interface CallLogModalProps {
  visible: boolean;
  lead: CrmLead | null;
  onClose: () => void;
  onLogOutcome: (answers: CallLogAnswers) => Promise<void>;
}

const CALL_OUTCOMES = [
  { id: 'connected', label: 'Connected', icon: 'checkmark-circle', color: colors.emerald },
  { id: 'voicemail', label: 'Voicemail', icon: 'mic-outline', color: colors.indigo },
  { id: 'no_answer', label: 'No answer', icon: 'call-outline', color: colors.amber },
  { id: 'wrong_number', label: 'Wrong number', icon: 'close-circle', color: colors.rose },
];

const ROLES = [
  'Owner / Founder',
  'CEO / Director',
  'Partner',
  'Marketing Head / Manager',
  'Sales Head / Manager',
  'Business Development',
  'Operations / Project Manager',
  'Other Management',
  'Employee / Team Member',
  'Consultant',
  'Other',
];
const STAGES = ['Idea / Pre-launch', 'New / Recently launched', 'Growing', 'Established', 'Expanding / Scaling'];
const EMPLOYEES = ['Just me', '2-5', '6-10', '11-25', '26-50', '51-100', '100+'];
const SALES = [
  'Yes, dedicated sales team',
  'Yes, 1-2 salespeople',
  'Sales handled by management / owners',
  'No sales team',
  'Building a sales team',
];
const OBJECTIVES = [
  'Launch a new project / business',
  'Improve branding / rebrand',
  'Improve our website / digital presence',
  'Generate qualified leads',
  'Increase sales',
  'Build a complete marketing system',
  'Other',
];
const BUDGETS = [
  'Under PKR 100K / month',
  'PKR 100K-250K / month',
  'PKR 250K-500K / month',
  'PKR 500K-1M / month',
  'PKR 1M-2.5M / month',
  'PKR 2.5M-5M / month',
  'PKR 5M+ / month',
  'Not decided yet',
  'Prefer to discuss with our sales team',
];

export const CallLogModal: React.FC<CallLogModalProps> = ({
  visible,
  lead,
  onClose,
  onLogOutcome,
}) => {
  const [selectedOutcome, setSelectedOutcome] = useState('connected');
  const [customNote, setCustomNote] = useState('');
  const [role, setRole] = useState('');
  const [businessStage, setBusinessStage] = useState('');
  const [employeeCount, setEmployeeCount] = useState('');
  const [salesTeam, setSalesTeam] = useState('');
  const [objective, setObjective] = useState('');
  const [budget, setBudget] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !lead) return;
    setSelectedOutcome('connected');
    setCustomNote('');
    setRole(ROLES.includes(lead.role || '') ? lead.role || '' : '');
    setBusinessStage(STAGES.includes(lead.business_stage || '') ? lead.business_stage || '' : '');
    setEmployeeCount(EMPLOYEES.includes(lead.employee_count || '') ? lead.employee_count || '' : '');
    setSalesTeam(SALES.includes(lead.sales_team || '') ? lead.sales_team || '' : '');
    setObjective(OBJECTIVES.includes(lead.objective || '') ? lead.objective || '' : '');
    setBudget(BUDGETS.includes(lead.budget || '') ? lead.budget || '' : '');
    setError(null);
  }, [visible, lead?.id]);

  if (!lead) return null;

  const handleSave = async () => {
    if (!role || !businessStage || !employeeCount || !salesTeam || !objective) {
      setError('Role, stage, employees, sales team, and objective are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onLogOutcome({
        outcome: selectedOutcome,
        note: customNote.trim() || undefined,
        role,
        business_stage: businessStage,
        employee_count: employeeCount,
        sales_team: salesTeam,
        objective,
        budget: budget || undefined,
      });
      onClose();
    } catch {
      // The screen that opened this sheet shows the error.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Call notes</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {lead.name}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={20} color="#71717A" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionLabel}>Outcome</Text>
            <View style={styles.wrap}>
              {CALL_OUTCOMES.map((item) => {
                const active = selectedOutcome === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.chip, active ? styles.chipActive : null]}
                    onPress={() => setSelectedOutcome(item.id)}
                  >
                    <Ionicons name={item.icon as any} size={14} color={active ? '#4F46E5' : item.color} />
                    <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Choice
              label="Role in the company"
              required
              options={ROLES}
              value={role}
              onChange={setRole}
            />
            <Choice
              label="Business stage"
              required
              options={STAGES}
              value={businessStage}
              onChange={setBusinessStage}
            />
            <Choice
              label="Employees"
              required
              options={EMPLOYEES}
              value={employeeCount}
              onChange={setEmployeeCount}
            />
            <Choice
              label="Sales team"
              required
              options={SALES}
              value={salesTeam}
              onChange={setSalesTeam}
            />
            <Choice
              label="Main objective"
              required
              options={OBJECTIVES}
              value={objective}
              onChange={setObjective}
            />
            <Choice
              label="Maximum monthly budget"
              hint="Optional. Include fees, ads, content, and tools."
              options={BUDGETS}
              value={budget}
              onChange={setBudget}
            />

            <Text style={styles.sectionLabel}>Notes</Text>
            <TextInput
              style={styles.input}
              placeholder="What was discussed"
              placeholderTextColor="#A1A1AA"
              multiline
              value={customNote}
              onChangeText={setCustomNote}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.saveText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

function Choice({
  label,
  options,
  value,
  onChange,
  required,
  hint,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.sectionLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.wrap}>
        {options.map((item) => {
          const active = value === item;
          return (
            <TouchableOpacity
              key={item}
              style={[styles.chip, active ? styles.chipActive : null]}
              onPress={() => onChange(active ? '' : item)}
            >
              <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{item}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F5',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#18181B',
  },
  subtitle: {
    fontSize: 12,
    color: '#71717A',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  group: {
    marginTop: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3F3F46',
    marginBottom: 6,
  },
  required: {
    color: '#E11D48',
  },
  hint: {
    fontSize: 11,
    color: '#71717A',
    marginTop: -2,
    marginBottom: 6,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F4F4F5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    maxWidth: '100%',
  },
  chipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3F3F46',
    flexShrink: 1,
  },
  chipTextActive: {
    color: '#4F46E5',
  },
  input: {
    backgroundColor: '#F4F4F5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#18181B',
    minHeight: 64,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    textAlignVertical: 'top',
  },
  error: {
    marginTop: 8,
    fontSize: 12,
    color: '#E11D48',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F4F4F5',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#71717A',
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
  },
  saveText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
