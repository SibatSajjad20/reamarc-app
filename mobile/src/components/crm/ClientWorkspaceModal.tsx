import React, { useEffect, useState } from 'react';
import {
  Modal,
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

const SERVICES = [
  'Branding',
  'Website Dev',
  'Web Maintenance',
  'SEO',
  'Performance Marketing',
  'Video Shoot',
  'Software Dev',
  'Mobile App Dev',
  'UI/UX Designing',
  'Social Media Management',
];

export interface ClientWorkspacePayload {
  name: string;
  status: 'active' | 'inactive';
  proposal_url?: string | null;
  proposal_name?: string | null;
  project_cycle: 'Retainer' | 'One-Time Project';
  priority: 'High' | 'Medium' | 'Low';
  health: 'Excellent' | 'Good' | 'Moderate' | 'Emergency';
  contract_start_date: string;
  contract_end_date: string;
  services: string[];
  poc_name?: string | null;
  poc_email?: string | null;
  poc_phone?: string | null;
  billing_name?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
}

interface ClientWorkspaceModalProps {
  visible: boolean;
  lead: CrmLead | null;
  onClose: () => void;
  onSubmit: (payload: ClientWorkspacePayload) => Promise<void>;
}

function phoneOf(lead: CrmLead | null): string {
  if (!lead) return '';
  if (lead.phone_e164) return `+${lead.phone_e164}`;
  return lead.phone_raw || '';
}

export const ClientWorkspaceModal: React.FC<ClientWorkspaceModalProps> = ({
  visible,
  lead,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [services, setServices] = useState<string[]>([]);
  const [cycle, setCycle] = useState<'Retainer' | 'One-Time Project'>('Retainer');
  const [priority, setPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [health, setHealth] = useState<'Excellent' | 'Good' | 'Moderate' | 'Emergency'>('Good');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [proposalUrl, setProposalUrl] = useState('');
  const [pocName, setPocName] = useState('');
  const [pocEmail, setPocEmail] = useState('');
  const [pocPhone, setPocPhone] = useState('');
  const [billingName, setBillingName] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [billingPhone, setBillingPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !lead) return;
    const phone = phoneOf(lead);
    setName(lead.company || lead.name || '');
    setServices(lead.service && SERVICES.includes(lead.service) ? [lead.service] : []);
    setCycle('Retainer');
    setPriority('Medium');
    setHealth('Good');
    setStatus('active');
    setStart('');
    setEnd('');
    setProposalUrl('');
    setPocName(lead.name || '');
    setPocEmail(lead.email || '');
    setPocPhone(phone);
    setBillingName(lead.name || '');
    setBillingEmail(lead.email || '');
    setBillingPhone(phone);
    setError(null);
  }, [visible, lead]);

  const toggleService = (service: string) => {
    setServices((current) =>
      current.includes(service) ? current.filter((item) => item !== service) : [...current, service]
    );
  };

  const save = async () => {
    if (!name.trim()) {
      setError('Client / Brand name is required.');
      return;
    }
    if (!start.trim() || !end.trim()) {
      setError('Contract start and end dates are required (YYYY-MM-DD).');
      return;
    }
    if (end.trim() < start.trim()) {
      setError('Contract end date cannot be earlier than contract start date.');
      return;
    }
    if (services.length === 0) {
      setError('Select at least one service.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const url = proposalUrl.trim();
      await onSubmit({
        name: name.trim(),
        status,
        proposal_url: url || null,
        proposal_name: url ? 'Client proposal' : null,
        project_cycle: cycle,
        priority,
        health,
        contract_start_date: start.trim(),
        contract_end_date: end.trim(),
        services,
        poc_name: pocName.trim() || null,
        poc_email: pocEmail.trim() || null,
        poc_phone: pocPhone.trim() || null,
        billing_name: billingName.trim() || null,
        billing_email: billingEmail.trim() || null,
        billing_phone: billingPhone.trim() || null,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Could not create the client workspace.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Add Client Workspace</Text>
              <Text style={styles.subtitle}>This registers the lead as an active client.</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Field label="Client / brand name" value={name} onChangeText={setName} />
            <Text style={styles.label}>Services</Text>
            <View style={styles.chips}>
              {SERVICES.map((service) => {
                const on = services.includes(service);
                return (
                  <TouchableOpacity
                    key={service}
                    style={[styles.chip, on ? styles.chipOn : null]}
                    onPress={() => toggleService(service)}
                  >
                    <Text style={[styles.chipText, on ? styles.chipTextOn : null]}>{service}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.label}>Project cycle</Text>
            <Choice
              options={['Retainer', 'One-Time Project']}
              value={cycle}
              onChange={(value) => setCycle(value as 'Retainer' | 'One-Time Project')}
            />
            <Text style={styles.label}>Priority</Text>
            <Choice
              options={['High', 'Medium', 'Low']}
              value={priority}
              onChange={(value) => setPriority(value as 'High' | 'Medium' | 'Low')}
            />
            <Text style={styles.label}>Health</Text>
            <Choice
              options={['Excellent', 'Good', 'Moderate', 'Emergency']}
              value={health}
              onChange={(value) => setHealth(value as 'Excellent' | 'Good' | 'Moderate' | 'Emergency')}
            />
            <Text style={styles.label}>Status</Text>
            <Choice
              options={['active', 'inactive']}
              value={status}
              onChange={(value) => setStatus(value as 'active' | 'inactive')}
            />
            <Field label="Contract start (YYYY-MM-DD)" value={start} onChangeText={setStart} />
            <Field label="Contract end (YYYY-MM-DD)" value={end} onChangeText={setEnd} />
            <Field
              label="Client proposal link"
              value={proposalUrl}
              onChangeText={setProposalUrl}
              placeholder="https://…  (the client's file, not a deal proposal)"
            />
            <Field label="Point of contact" value={pocName} onChangeText={setPocName} />
            <Field label="Contact email" value={pocEmail} onChangeText={setPocEmail} />
            <Field label="Contact phone" value={pocPhone} onChangeText={setPocPhone} />
            <Field label="Billing name" value={billingName} onChangeText={setBillingName} />
            <Field label="Billing email" value={billingEmail} onChangeText={setBillingEmail} />
            <Field label="Billing phone" value={billingPhone} onChangeText={setBillingPhone} />
          </ScrollView>
          <TouchableOpacity style={styles.save} onPress={() => void save()} disabled={saving}>
            <Text style={styles.saveText}>{saving ? 'Creating…' : 'Create workspace'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const Field = ({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}) => (
  <View style={{ marginBottom: 10 }}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      style={styles.input}
      autoCapitalize="none"
    />
  </View>
);

const Choice = ({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) => (
  <View style={styles.chips}>
    {options.map((option) => {
      const on = option === value;
      return (
        <TouchableOpacity
          key={option}
          style={[styles.chip, on ? styles.chipOn : null]}
          onPress={() => onChange(option)}
        >
          <Text style={[styles.chipText, on ? styles.chipTextOn : null]}>{option}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 2, fontSize: 12, color: colors.muted },
  body: { paddingHorizontal: 20, paddingBottom: 12 },
  label: { fontSize: 12, fontWeight: '700', color: colors.slate, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bg,
  },
  chipOn: { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' },
  chipText: { fontSize: 12, color: colors.slate, fontWeight: '600' },
  chipTextOn: { color: colors.indigo },
  error: { color: colors.rose, fontSize: 13, marginBottom: 10 },
  save: {
    marginHorizontal: 20,
    marginTop: 8,
    backgroundColor: colors.indigo,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 14,
  },
  saveText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});
