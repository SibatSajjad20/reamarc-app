import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme';
import { DateField, TimeField } from '../../src/ui/DateTimeField';
import { StatusBadge } from '../../src/ui/StatusBadge';
import { formatDisplayDate } from '../../src/ui/format';

type RequestType = 'leave' | 'wfh' | 'short_leave' | 'regularization' | 'overtime';
type ScreenMode = 'review' | 'mine';

type LeaveBalance = {
  annual_remaining?: number;
  sick_remaining?: number;
  annual_entitled?: number;
  sick_entitled?: number;
};

type AttendanceRequest = {
  id: string;
  user_id: string;
  user_name?: string;
  user_role?: string;
  department?: string;
  request_type?: string;
  leave_type?: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  short_leave_hours?: number;
  short_leave_start_time?: string;
  regularization_check_in?: string;
  regularization_check_out?: string;
  overtime_minutes?: number;
};

const REVIEW_ROLES = new Set(['hr', 'admin', 'operations']);

const TYPE_CHIPS: { id: RequestType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'leave', label: 'Annual Leave', icon: 'sunny-outline' },
  { id: 'wfh', label: 'Work From Home', icon: 'home-outline' },
  { id: 'short_leave', label: 'Short Leave', icon: 'timer-outline' },
  { id: 'regularization', label: 'Attendance Correction', icon: 'create-outline' },
  { id: 'overtime', label: 'Overtime Claim', icon: 'flash-outline' },
];

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function typeLabel(r: AttendanceRequest) {
  const found = TYPE_CHIPS.find((t) => t.id === r.request_type || t.id === r.leave_type);
  if (found) return found.label;
  return (r.request_type || r.leave_type || 'request').replace(/_/g, ' ');
}

function extraLine(r: AttendanceRequest) {
  const bits: string[] = [];
  if (r.short_leave_hours) bits.push(`${r.short_leave_hours}h short leave${r.short_leave_start_time ? ` from ${r.short_leave_start_time}` : ''}`);
  if (r.regularization_check_in || r.regularization_check_out) {
    bits.push(`In ${r.regularization_check_in || '—'} · Out ${r.regularization_check_out || '—'}`);
  }
  if (r.overtime_minutes) bits.push(`${r.overtime_minutes} min OT`);
  return bits.join(' · ');
}

export default function RequestsScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ form?: string }>();
  const canReview = REVIEW_ROLES.has(String(user?.role || '').toLowerCase());
  const [mode, setMode] = useState<ScreenMode>(canReview ? 'review' : 'mine');

  const [tab, setTab] = useState<RequestType>('leave');
  const [reason, setReason] = useState('');
  const [reasonFocus, setReasonFocus] = useState(false);
  const [start, setStart] = useState(todayIso());
  const [end, setEnd] = useState(todayIso());
  const [hours, setHours] = useState('1');
  const [startTime, setStartTime] = useState('15:00');
  const [corrIn, setCorrIn] = useState('09:30');
  const [corrOut, setCorrOut] = useState('18:30');
  const [busy, setBusy] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [mine, setMine] = useState<AttendanceRequest[]>([]);
  const [pending, setPending] = useState<AttendanceRequest[]>([]);

  useEffect(() => {
    setMode(canReview ? 'review' : 'mine');
  }, [canReview]);

  useFocusEffect(
    useCallback(() => {
      if (params.form === 'regularization') {
        setMode('mine');
        setTab('regularization');
      }
    }, [params.form]),
  );

  const loadMine = useCallback(async () => {
    try {
      const [b, list] = await Promise.all([
        api<LeaveBalance>('/leaves/balances/me'),
        api<AttendanceRequest[]>('/leaves/my-requests'),
      ]);
      setBalance(b);
      setMine(list || []);
    } catch {
      /* ignore */
    }
  }, []);

  const loadPending = useCallback(async () => {
    if (!canReview) {
      setPending([]);
      return;
    }
    try {
      const list = await api<AttendanceRequest[]>('/leaves/pending');
      setPending((list || []).filter((r) => r.user_id !== user?.id));
    } catch (err: any) {
      setMessage(err?.message || 'Could not load pending requests');
    }
  }, [canReview, user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadMine();
      loadPending();
    }, [loadMine, loadPending]),
  );

  const review = async (id: string, status: 'approved' | 'rejected') => {
    setMessage('');
    setActingId(id);
    try {
      await api(`/leaves/requests/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          review_comments: note.trim() || undefined,
        }),
      });
      setNote('');
      setMessage(status === 'approved' ? 'Approved.' : 'Rejected.');
      await loadPending();
    } catch (err: any) {
      setMessage(err?.message || 'Could not review');
    } finally {
      setActingId(null);
    }
  };

  const submit = async () => {
    setMessage('');
    if (reason.trim().length < 3) {
      setMessage('Please add a reason.');
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        request_type: tab,
        leave_type: tab === 'leave' ? 'casual' : tab,
        start_date: start,
        end_date: end,
        reason: reason.trim(),
      };
      if (tab === 'leave') payload.leave_category = 'casual';
      if (tab === 'short_leave') {
        payload.short_leave_hours = Number(hours);
        payload.short_leave_start_time = startTime;
        payload.end_date = start;
      }
      if (tab === 'regularization') {
        payload.regularization_date = start;
        payload.correction_target = 'both';
        payload.regularization_check_in = corrIn;
        payload.regularization_check_out = corrOut;
        payload.end_date = start;
      }
      if (tab === 'overtime') {
        payload.overtime_date = start;
        payload.end_date = start;
      }
      await api('/leaves/requests', { method: 'POST', body: JSON.stringify(payload) });
      setReason('');
      setMessage('Request submitted.');
      await loadMine();
      await loadPending();
    } catch (err: any) {
      setMessage(err.message || 'Could not submit');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Requests</Text>
        <View style={styles.balanceRow}>
          <BalanceCard
            icon="leaf-outline"
            label="Annual"
            value={balance?.annual_remaining ?? '—'}
            hint="Days remaining"
          />
          <BalanceCard
            icon="medkit-outline"
            label="Sick"
            value={balance?.sick_remaining ?? '—'}
            hint="Days remaining"
          />
        </View>

        {canReview ? (
          <View style={styles.modeRow}>
            <Pressable onPress={() => setMode('review')} style={[styles.modeChip, mode === 'review' && styles.modeOn]}>
              <Text style={[styles.modeText, mode === 'review' && { color: '#fff' }]}>To review ({pending.length})</Text>
            </Pressable>
            <Pressable onPress={() => setMode('mine')} style={[styles.modeChip, mode === 'mine' && styles.modeOn]}>
              <Text style={[styles.modeText, mode === 'mine' && { color: '#fff' }]}>Submit mine</Text>
            </Pressable>
          </View>
        ) : null}

        {mode === 'review' && canReview ? (
          <>
            <Text style={styles.section}>Pending from the team</Text>
            <Text style={styles.fieldLabel}>Optional note</Text>
            <TextInput
              style={styles.note}
              value={note}
              onChangeText={setNote}
              placeholder="Add a note for approve / reject"
              placeholderTextColor="#A1A1AA"
            />
            {pending.length === 0 ? (
              <EmptyState icon="checkmark-done-outline" title="Nothing to review" body="When teammates submit leave or corrections, they will appear here." />
            ) : (
              pending.map((r) => (
                <View key={r.id} style={styles.card}>
                  <View style={styles.cardHead}>
                    <Text style={styles.cardTitle}>{r.user_name || r.user_id}</Text>
                    <StatusBadge status={r.status} />
                  </View>
                  <Text style={styles.muted}>
                    {typeLabel(r)} · {formatDisplayDate(r.start_date)} → {formatDisplayDate(r.end_date)}
                    {r.department ? ` · ${r.department}` : ''}
                  </Text>
                  {!!extraLine(r) && <Text style={styles.body}>{extraLine(r)}</Text>}
                  <Text style={styles.body}>{r.reason}</Text>
                  <View style={styles.actions}>
                    <Pressable
                      style={[styles.actionBtn, styles.approve, actingId === r.id && { opacity: 0.5 }]}
                      disabled={actingId === r.id}
                      onPress={() => review(r.id, 'approved')}
                    >
                      <Text style={styles.actionText}>{actingId === r.id ? '…' : 'Approve'}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, styles.reject, actingId === r.id && { opacity: 0.5 }]}
                      disabled={actingId === r.id}
                      onPress={() => review(r.id, 'rejected')}
                    >
                      <Text style={styles.actionText}>{actingId === r.id ? '…' : 'Reject'}</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
            {!!message && <Text style={styles.msg}>{message}</Text>}
          </>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {TYPE_CHIPS.map((t) => (
                <Pressable key={t.id} onPress={() => setTab(t.id)} style={[styles.chip, tab === t.id && styles.chipOn]}>
                  <Ionicons name={t.icon} size={15} color={tab === t.id ? '#fff' : colors.indigo} />
                  <Text style={[styles.chipText, tab === t.id && { color: '#fff' }]}>{t.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <DateField label={tab === 'leave' || tab === 'wfh' ? 'Start Date' : 'Date'} value={start} onChange={setStart} />
            {tab === 'leave' || tab === 'wfh' ? (
              <DateField label="End Date" value={end} onChange={setEnd} />
            ) : null}
            {tab === 'short_leave' ? (
              <>
                <TimeField label="Start Time" value={startTime} onChange={setStartTime} />
                <Text style={styles.fieldLabel}>Hours (0.5–4)</Text>
                <TextInput
                  style={styles.note}
                  value={hours}
                  onChangeText={setHours}
                  keyboardType="decimal-pad"
                  placeholderTextColor="#A1A1AA"
                />
              </>
            ) : null}
            {tab === 'regularization' ? (
              <>
                <TimeField label="Time In" value={corrIn} onChange={setCorrIn} />
                <TimeField label="Time Out" value={corrOut} onChange={setCorrOut} />
              </>
            ) : null}

            <Text style={styles.fieldLabel}>Reason for Request</Text>
            <TextInput
              style={[styles.reason, reasonFocus && styles.reasonOn]}
              value={reason}
              onChangeText={(t) => setReason(t.slice(0, 150))}
              placeholder="Tell HR why you need this"
              placeholderTextColor="#A1A1AA"
              multiline
              onFocus={() => setReasonFocus(true)}
              onBlur={() => setReasonFocus(false)}
            />
            <Text style={styles.counter}>{reason.length}/150</Text>

            <Pressable style={[styles.btn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
              <Text style={styles.btnText}>{busy ? 'Submitting…' : 'Submit request'}</Text>
            </Pressable>
            {!!message && <Text style={styles.msg}>{message}</Text>}

            <Text style={styles.section}>My requests</Text>
            {mine.length === 0 ? (
              <EmptyState icon="document-text-outline" title="No requests yet" body="Submit leave, WFH, or a correction and it will show up here." />
            ) : (
              mine.map((r) => (
                <View key={r.id} style={styles.card}>
                  <View style={styles.cardHead}>
                    <Text style={styles.cardTitle}>{typeLabel(r)}</Text>
                    <StatusBadge status={r.status} />
                  </View>
                  <Text style={styles.muted}>
                    {formatDisplayDate(r.start_date)} → {formatDisplayDate(r.end_date)}
                  </Text>
                  <Text style={styles.body}>{r.reason}</Text>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function BalanceCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <View style={styles.balanceCard}>
      <Ionicons name={icon} size={18} color={colors.indigo} />
      <Text style={styles.balanceLabel}>{label}</Text>
      <Text style={styles.balanceValue}>{value}</Text>
      <Text style={styles.balanceHint}>{hint}</Text>
    </View>
  );
}

function EmptyState({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={36} color={colors.indigo} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 120 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 14 },
  balanceRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  balanceCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  balanceLabel: { marginTop: 8, fontWeight: '800', color: colors.text },
  balanceValue: { fontSize: 26, fontWeight: '800', color: colors.indigo, marginTop: 2 },
  balanceHint: { color: colors.muted, fontSize: 12, marginTop: 2 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  modeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  modeOn: { backgroundColor: colors.indigo, borderColor: colors.indigo },
  modeText: { fontSize: 12, fontWeight: '800', color: colors.text },
  section: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 10 },
  muted: { color: colors.muted, marginTop: 4 },
  chipRow: { gap: 8, paddingBottom: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.indigo, borderColor: colors.indigo },
  chipText: { fontSize: 12, fontWeight: '800', color: colors.text },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.slate, marginBottom: 6 },
  note: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    color: colors.text,
  },
  reason: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    minHeight: 92,
    color: colors.text,
    textAlignVertical: 'top',
  },
  reasonOn: { borderColor: colors.indigo },
  counter: { alignSelf: 'flex-end', color: colors.muted, fontSize: 12, marginTop: 4, marginBottom: 12 },
  btn: { backgroundColor: colors.indigo, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800' },
  msg: { marginTop: 10, color: colors.indigoDark, fontWeight: '600' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontWeight: '800', color: colors.text, flex: 1 },
  body: { marginTop: 6, color: colors.text },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  approve: { backgroundColor: colors.emerald },
  reject: { backgroundColor: colors.rose },
  actionText: { color: '#fff', fontWeight: '800' },
  empty: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyTitle: { fontWeight: '800', color: colors.text, marginTop: 10 },
  emptyBody: { color: colors.muted, textAlign: 'center', marginTop: 4, lineHeight: 20 },
});
