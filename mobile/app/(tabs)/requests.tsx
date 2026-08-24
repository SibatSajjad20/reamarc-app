import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme';
import { DateField, TimeField } from '../../src/ui/DateTimeField';
import { StatusBadge } from '../../src/ui/StatusBadge';
import { formatDisplayDate } from '../../src/ui/format';

type RequestType = 'leave' | 'wfh' | 'short_leave' | 'regularization';
type CorrectionTarget = 'both' | 'time_in' | 'time_out';
type ScreenMode = 'apply' | 'mine' | 'review';

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
  correction_target?: CorrectionTarget;
  regularization_check_in?: string;
  regularization_check_out?: string;
  regularization_punch_in?: string;
  regularization_punch_out?: string;
  original_check_in?: string;
  original_check_out?: string;
  original_punch_in?: string;
  original_punch_out?: string;
  shift_end?: string;
  check_out?: string;
  overtime_minutes?: number;
  reviewer_name?: string;
  review_comments?: string;
};

const REVIEW_ROLES = new Set(['hr', 'admin', 'operations']);

const TYPE_CHIPS: { id: RequestType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'leave', label: 'Annual Leave', icon: 'sunny-outline' },
  { id: 'wfh', label: 'Work From Home', icon: 'home-outline' },
  { id: 'short_leave', label: 'Short Leave', icon: 'timer-outline' },
  { id: 'regularization', label: 'Correction', icon: 'create-outline' },
];

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function typeLabel(r: AttendanceRequest) {
  const found = TYPE_CHIPS.find((t) => t.id === r.request_type || t.id === r.leave_type);
  if (found) return found.label;
  if (r.leave_type === 'missed_punch_regularization' || r.request_type === 'regularization') {
    return 'Correction';
  }
  if (r.leave_type === 'overtime' || r.request_type === 'overtime') {
    return 'Overtime';
  }
  return (r.request_type || r.leave_type || 'Request').replace(/_/g, ' ');
}

function formatCorrectionLine(r: AttendanceRequest): string {
  const origIn = (r.original_punch_in || r.original_check_in || '').substring(0, 5) || 'None';
  const origOut = (r.original_punch_out || r.original_check_out || '').substring(0, 5) || 'None';
  const nextIn = (r.regularization_punch_in || r.regularization_check_in || '').substring(0, 5) || '—';
  const nextOut = (r.regularization_punch_out || r.regularization_check_out || '').substring(0, 5) || '—';

  if (r.correction_target === 'time_in') {
    return `Time In: ${origIn} → ${nextIn}`;
  }
  if (r.correction_target === 'time_out') {
    return `Time Out: ${origOut} → ${nextOut}`;
  }
  return `In: ${origIn} → ${nextIn} · Out: ${origOut} → ${nextOut}`;
}

function formatOvertimeLine(r: AttendanceRequest): string {
  const mins = typeof r.overtime_minutes === 'number' ? r.overtime_minutes : 0;
  let durationStr = '';
  if (mins > 0) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    durationStr = h > 0 ? (m > 0 ? `+${h}h ${m}m Overtime` : `+${h}h Overtime`) : `+${m}m Overtime`;
  }
  const span = r.shift_end && r.check_out ? `${r.shift_end} → ${r.check_out}` : '';
  if (durationStr && span) {
    return `${durationStr} (${span})`;
  }
  return durationStr || (span ? `Overtime: ${span}` : 'Overtime Claim');
}

export default function RequestsScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ form?: string }>();
  const canReview = REVIEW_ROLES.has(String(user?.role || '').toLowerCase());
  const [mode, setMode] = useState<ScreenMode>(canReview ? 'review' : 'apply');

  const [tab, setTab] = useState<RequestType>('leave');
  const [correctionTarget, setCorrectionTarget] = useState<CorrectionTarget>('both');
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
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
  const [mine, setMine] = useState<AttendanceRequest[]>([]);
  const [pending, setPending] = useState<AttendanceRequest[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (params.form === 'regularization') {
        setMode('apply');
        setTab('regularization');
      }
    }, [params.form]),
  );

  const loadMine = useCallback(async () => {
    try {
      const list = await api<AttendanceRequest[]>('/leaves/my-requests');
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
      let alive = true;
      (async () => {
        try {
          await Promise.all([loadMine(), loadPending()]);
        } finally {
          if (alive) setInitialLoading(false);
        }
      })();
      return () => {
        alive = false;
      };
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
      await loadMine();
    } catch (err: any) {
      setMessage(err?.message || 'Could not review');
    } finally {
      setActingId(null);
    }
  };

  const submit = async () => {
    setMessage('');
    if (!reason.trim()) {
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        request_type: tab,
        leave_type: tab === 'leave' ? 'casual' : tab === 'regularization' ? 'missed_punch_regularization' : tab,
        start_date: start,
        end_date: tab === 'leave' || tab === 'wfh' ? end : start,
        reason: reason.trim(),
      };
      if (tab === 'leave') payload.leave_category = 'casual';
      if (tab === 'short_leave') {
        payload.short_leave_hours = Number(hours);
        payload.short_leave_start_time = startTime;
      }
      if (tab === 'regularization') {
        payload.regularization_date = start;
        payload.correction_target = correctionTarget;
        if (correctionTarget === 'time_in' || correctionTarget === 'both') {
          payload.regularization_check_in = corrIn;
          payload.regularization_punch_in = corrIn;
        }
        if (correctionTarget === 'time_out' || correctionTarget === 'both') {
          payload.regularization_check_out = corrOut;
          payload.regularization_punch_out = corrOut;
        }
      }
      await api('/leaves/requests', { method: 'POST', body: JSON.stringify(payload) });
      setReason('');
      setReasonOpen(false);
      setMessage('Request submitted successfully.');
      setMode('mine');
      await loadMine();
      await loadPending();
    } catch (err: any) {
      setMessage(err.message || 'Could not submit request');
    } finally {
      setBusy(false);
    }
  };

  const isAdmin =
    String(user?.role || '').toLowerCase() === 'admin' ||
    String(user?.role || '').toLowerCase() === 'super_admin';
  const [filter, setFilter] = useState('all');

  const filteredPending = useMemo(() => {
    if (filter === 'all') return pending;
    if (filter === 'leave') {
      return pending.filter(
        (r) =>
          r.request_type === 'leave' ||
          r.leave_type === 'leave' ||
          r.leave_type === 'casual' ||
          r.leave_type === 'annual',
      );
    }
    if (filter === 'wfh') return pending.filter((r) => r.request_type === 'wfh' || r.leave_type === 'wfh');
    if (filter === 'short_leave') {
      return pending.filter((r) => r.request_type === 'short_leave' || r.leave_type === 'short_leave');
    }
    if (filter === 'correction') {
      return pending.filter(
        (r) => r.request_type === 'regularization' || r.leave_type === 'missed_punch_regularization',
      );
    }
    if (filter === 'overtime') {
      return pending.filter((r) => r.request_type === 'overtime' || r.leave_type === 'overtime');
    }
    return pending;
  }, [pending, filter]);

  if (initialLoading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centerScreen]}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.indigo} />
          <Text style={styles.loadingTitle}>Loading Requests</Text>
          <Text style={styles.loadingSubtitle}>Fetching team and submitted requests...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header Row: Title & Action Pill */}
          <View style={styles.headerRow}>
            <Text style={styles.title}>{isAdmin ? 'Team Approvals' : 'Requests'}</Text>
            {isAdmin ? (
              <View style={styles.adminPendingBadge}>
                <Text style={styles.adminPendingBadgeText}>{pending.length} Pending</Text>
              </View>
            ) : canReview ? (
              <Pressable
                onPress={() => setMode('mine')}
                style={[styles.myRequestsPill, mode === 'mine' && styles.myRequestsPillActive]}
              >
                <Ionicons
                  name="document-text-outline"
                  size={14}
                  color={mode === 'mine' ? '#FFFFFF' : colors.indigo}
                />
                <Text style={[styles.myRequestsPillText, mode === 'mine' && { color: '#FFFFFF' }]}>
                  My Requests ({mine.length})
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* Top Navigation Tabs (For HR / Operations & Employees only, hidden for Admin) */}
          {!isAdmin && (
            <View style={styles.modeRow}>
              {canReview ? (
                <>
                  <Pressable
                    onPress={() => setMode('review')}
                    style={[styles.modeChip, mode === 'review' && styles.modeOn]}
                  >
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={15}
                      color={mode === 'review' ? '#fff' : colors.slate}
                    />
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      style={[styles.modeText, mode === 'review' && { color: '#fff' }]}
                    >
                      To Review ({pending.length})
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setMode('apply')}
                    style={[styles.modeChip, mode === 'apply' && styles.modeOn]}
                  >
                    <Ionicons
                      name="add-circle-outline"
                      size={15}
                      color={mode === 'apply' ? '#fff' : colors.slate}
                    />
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      style={[styles.modeText, mode === 'apply' && { color: '#fff' }]}
                    >
                      Apply Request
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    onPress={() => setMode('apply')}
                    style={[styles.modeChip, mode === 'apply' && styles.modeOn]}
                  >
                    <Ionicons
                      name="add-circle-outline"
                      size={15}
                      color={mode === 'apply' ? '#fff' : colors.slate}
                    />
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      style={[styles.modeText, mode === 'apply' && { color: '#fff' }]}
                    >
                      Apply Request
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setMode('mine')}
                    style={[styles.modeChip, mode === 'mine' && styles.modeOn]}
                  >
                    <Ionicons
                      name="document-text-outline"
                      size={15}
                      color={mode === 'mine' ? '#fff' : colors.slate}
                    />
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      style={[styles.modeText, mode === 'mine' && { color: '#fff' }]}
                    >
                      My Requests ({mine.length})
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          )}

          {/* MODE: TO REVIEW (HR / ADMIN / OPERATIONS) */}
          {(isAdmin || (mode === 'review' && canReview)) ? (
            <>
              {isAdmin && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipRow}>
                  {[
                    { id: 'all', label: `All (${pending.length})` },
                    { id: 'leave', label: 'Leaves' },
                    { id: 'wfh', label: 'WFH' },
                    { id: 'short_leave', label: 'Short Leave' },
                    { id: 'correction', label: 'Corrections' },
                    { id: 'overtime', label: 'Overtime' },
                  ].map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => setFilter(c.id)}
                      style={[styles.filterChip, filter === c.id && styles.filterChipActive]}
                    >
                      <Text style={[styles.filterChipText, filter === c.id && styles.filterChipTextActive]}>
                        {c.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              <Text style={styles.section}>{isAdmin ? 'Pending Approval Queue' : 'Pending Team Requests'}</Text>
              <Text style={styles.fieldLabel}>Optional review comment</Text>
              <TextInput
                style={styles.note}
                value={note}
                onChangeText={setNote}
                placeholder="Add an approval or rejection note"
                placeholderTextColor="#A1A1AA"
              />
              {filteredPending.length === 0 ? (
                <EmptyState
                  icon="checkmark-done-outline"
                  title="All caught up"
                  body={isAdmin ? "There are no pending requests matching this filter." : "When team members submit leaves or attendance corrections, they will appear here."}
                />
              ) : (
                filteredPending.map((r: AttendanceRequest) => (
                  <View key={r.id} style={styles.card}>
                    <View style={styles.cardHead}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{r.user_name || r.user_id}</Text>
                        <Text style={styles.muted}>{typeLabel(r)} · {formatDisplayDate(r.start_date)}</Text>
                      </View>
                      <StatusBadge status={r.status} />
                    </View>

                    {(r.request_type === 'regularization' || r.leave_type === 'missed_punch_regularization') && (
                      <View style={styles.detailBox}>
                        <Text style={styles.detailBoxText}>{formatCorrectionLine(r)}</Text>
                      </View>
                    )}

                    {(r.request_type === 'overtime' || r.leave_type === 'overtime') && (
                      <View style={styles.detailBox}>
                        <Ionicons name="time-outline" size={13} color={colors.emerald} />
                        <Text style={[styles.detailBoxText, { color: colors.emerald, fontWeight: '700' }]}>
                          {formatOvertimeLine(r)}
                        </Text>
                      </View>
                    )}

                    {r.request_type === 'short_leave' && (
                      <View style={styles.detailBox}>
                        <Text style={styles.detailBoxText}>
                          {r.short_leave_hours}h duration starting at {r.short_leave_start_time || '—'}
                        </Text>
                      </View>
                    )}

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
          ) : null}

          {/* MODE: APPLY FOR NEW REQUEST */}
          {mode === 'apply' ? (
            <>
              <Text style={styles.section}>Select Request Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {TYPE_CHIPS.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => setTab(t.id)}
                    style={[styles.chip, tab === t.id && styles.chipOn]}
                  >
                    <Ionicons name={t.icon} size={15} color={tab === t.id ? '#fff' : colors.indigo} />
                    <Text style={[styles.chipText, tab === t.id && { color: '#fff' }]}>{t.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <DateField
                label={tab === 'leave' || tab === 'wfh' ? 'Start Date' : 'Target Date'}
                value={start}
                onChange={setStart}
              />
              {tab === 'leave' || tab === 'wfh' ? (
                <DateField label="End Date" value={end} onChange={setEnd} />
              ) : null}

              {tab === 'short_leave' ? (
                <>
                  <TimeField label="Start Time" value={startTime} onChange={setStartTime} />
                  <Text style={styles.fieldLabel}>Duration in Hours (0.5 – 4.0)</Text>
                  <TextInput
                    style={styles.note}
                    value={hours}
                    onChangeText={setHours}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 1.5"
                    placeholderTextColor="#A1A1AA"
                  />
                </>
              ) : null}

              {tab === 'regularization' ? (
                <>
                  <Text style={styles.fieldLabel}>What needs correction?</Text>
                  <View style={styles.targetRow}>
                    <Pressable
                      onPress={() => setCorrectionTarget('both')}
                      style={[styles.targetChip, correctionTarget === 'both' && styles.targetChipOn]}
                    >
                      <Text style={[styles.targetText, correctionTarget === 'both' && styles.targetTextOn]}>
                        Both In & Out
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setCorrectionTarget('time_in')}
                      style={[styles.targetChip, correctionTarget === 'time_in' && styles.targetChipOn]}
                    >
                      <Text style={[styles.targetText, correctionTarget === 'time_in' && styles.targetTextOn]}>
                        Time In Only
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setCorrectionTarget('time_out')}
                      style={[styles.targetChip, correctionTarget === 'time_out' && styles.targetChipOn]}
                    >
                      <Text style={[styles.targetText, correctionTarget === 'time_out' && styles.targetTextOn]}>
                        Time Out Only
                      </Text>
                    </Pressable>
                  </View>

                  {(correctionTarget === 'both' || correctionTarget === 'time_in') && (
                    <TimeField label="Corrected Time In" value={corrIn} onChange={setCorrIn} />
                  )}
                  {(correctionTarget === 'both' || correctionTarget === 'time_out') && (
                    <TimeField label="Corrected Time Out" value={corrOut} onChange={setCorrOut} />
                  )}
                </>
              ) : null}

              <Pressable
                style={[styles.btn, { marginTop: 14 }]}
                onPress={() => {
                  setMessage('');
                  setReasonOpen(true);
                }}
              >
                <Text style={styles.btnText}>Submit Request</Text>
              </Pressable>
              {!!message && <Text style={styles.msg}>{message}</Text>}
            </>
          ) : null}

          {/* MODE: MY SUBMITTED REQUESTS */}
          {mode === 'mine' ? (
            <>
              <Text style={styles.section}>My Submitted Requests</Text>
              {mine.length === 0 ? (
                <EmptyState
                  icon="document-text-outline"
                  title="No requests yet"
                  body="Submit leave, WFH, or attendance corrections and track their approval status here."
                />
              ) : (
                mine.map((r) => (
                  <View key={r.id} style={styles.card}>
                    <View style={styles.cardHead}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{typeLabel(r)}</Text>
                        <Text style={styles.muted}>
                          {formatDisplayDate(r.start_date)}
                          {r.end_date && r.end_date !== r.start_date ? ` → ${formatDisplayDate(r.end_date)}` : ''}
                        </Text>
                      </View>
                      <StatusBadge status={r.status} />
                    </View>

                    {(r.request_type === 'regularization' || r.leave_type === 'missed_punch_regularization') && (
                      <View style={styles.detailBox}>
                        <Text style={styles.detailBoxText}>{formatCorrectionLine(r)}</Text>
                      </View>
                    )}

                    {(r.request_type === 'overtime' || r.leave_type === 'overtime') && (
                      <View style={styles.detailBox}>
                        <Ionicons name="time-outline" size={13} color={colors.emerald} />
                        <Text style={[styles.detailBoxText, { color: colors.emerald, fontWeight: '700' }]}>
                          {formatOvertimeLine(r)}
                        </Text>
                      </View>
                    )}

                    {r.request_type === 'short_leave' && (
                      <View style={styles.detailBox}>
                        <Text style={styles.detailBoxText}>
                          {r.short_leave_hours}h duration starting at {r.short_leave_start_time || '—'}
                        </Text>
                      </View>
                    )}

                    <Text style={styles.body}>{r.reason}</Text>

                    {!!r.review_comments && (
                      <View style={styles.reviewCommentBox}>
                        <Text style={styles.reviewCommentText}>
                          Note from {r.reviewer_name || 'HR'}: "{r.review_comments}"
                        </Text>
                      </View>
                    )}
                  </View>
                ))
              )}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* REASON FORM MODAL */}
      <Modal
        visible={reasonOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          Keyboard.dismiss();
          setReasonOpen(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.centerModalWrapper}
        >
          <Pressable style={styles.backdropPressable} onPress={Keyboard.dismiss} />
          <View style={styles.centerCard}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {tab === 'leave'
                    ? 'Annual Leave Reason'
                    : tab === 'wfh'
                    ? 'Work From Home Reason'
                    : tab === 'short_leave'
                    ? 'Short Leave Reason'
                    : 'Correction Reason'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {tab === 'leave' || tab === 'wfh'
                    ? `${formatDisplayDate(start)}${start !== end ? ` to ${formatDisplayDate(end)}` : ''}`
                    : tab === 'short_leave'
                    ? `${hours}h duration starting at ${startTime}`
                    : `${formatDisplayDate(start)} · ${
                        correctionTarget === 'both'
                          ? 'Both In & Out'
                          : correctionTarget === 'time_in'
                          ? `Time In (${corrIn})`
                          : `Time Out (${corrOut})`
                      }`}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  setReasonOpen(false);
                }}
                hitSlop={12}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color={colors.slate} />
              </Pressable>
            </View>

            <View style={styles.inputWrap}>
              <TextInput
                style={styles.centerInput}
                placeholder="Provide context or explanation for HR approval"
                placeholderTextColor={colors.muted}
                value={reason}
                onChangeText={(t) => setReason(t.slice(0, 150))}
                multiline
                blurOnSubmit={true}
                returnKeyType="done"
                autoFocus
              />
              <Text style={styles.counter}>{reason.length}/150</Text>
            </View>

            <Pressable
              style={[
                styles.modalSubmitBtn,
                { backgroundColor: colors.indigo, opacity: !reason.trim() || busy ? 0.45 : 1 },
              ]}
              onPress={submit}
              disabled={!reason.trim() || busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalSubmitBtnText}>Submit Request</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                setReasonOpen(false);
              }}
              style={{ marginTop: 10, paddingVertical: 6 }}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
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
  centerScreen: { justifyContent: 'center', alignItems: 'center' },
  loadingBox: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingTitle: { marginTop: 18, fontSize: 18, fontWeight: '800', color: colors.text },
  loadingSubtitle: { marginTop: 6, fontSize: 13, color: colors.muted, textAlign: 'center' },
  scroll: { padding: 20, paddingBottom: 220 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  myRequestsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  myRequestsPillActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  myRequestsPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.indigo,
  },
  adminPendingBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  adminPendingBadgeText: {
    color: colors.indigo,
    fontWeight: '800',
    fontSize: 12,
  },
  filterChipRow: {
    gap: 6,
    paddingBottom: 12,
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  filterChipActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  filterChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.slate,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  modeRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    gap: 6,
    marginBottom: 18,
  },
  modeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  modeOn: {
    backgroundColor: colors.indigo,
    shadowColor: colors.indigo,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  modeText: { fontSize: 12.5, fontWeight: '800', color: colors.slate, textAlign: 'center' },
  section: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 10, marginBottom: 12 },
  muted: { color: colors.muted, fontSize: 12, marginTop: 2 },
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
  targetRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  targetChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  targetChipOn: { backgroundColor: '#EEF2FF', borderColor: colors.indigo },
  targetText: { fontSize: 12, fontWeight: '700', color: colors.slate },
  targetTextOn: { color: colors.indigo, fontWeight: '800' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.slate, marginBottom: 6, marginTop: 4 },
  note: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    color: colors.text,
  },
  btn: {
    backgroundColor: colors.indigo,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: colors.indigo,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  msg: { marginTop: 10, textAlign: 'center', color: colors.indigo, fontWeight: '700' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontWeight: '800', fontSize: 15, color: colors.text },
  detailBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  detailBoxText: { color: colors.slate, fontSize: 12, fontWeight: '700' },
  body: { marginTop: 6, color: colors.text, lineHeight: 20 },
  reviewCommentBox: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 6,
  },
  reviewCommentText: { color: colors.slate, fontSize: 11, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  approve: { backgroundColor: colors.emerald },
  reject: { backgroundColor: colors.rose },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  empty: {
    alignItems: 'center',
    paddingVertical: 36,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyTitle: { fontWeight: '800', color: colors.text, marginTop: 10 },
  emptyBody: { color: colors.muted, marginTop: 4 },
  centerModalWrapper: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  backdropPressable: { ...StyleSheet.absoluteFillObject },
  centerCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  modalTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: colors.text,
  },
  modalSubtitle: {
    color: colors.muted,
    marginTop: 4,
    fontSize: 13,
  },
  modalCloseBtn: {
    backgroundColor: '#F4F4F5',
    borderRadius: 999,
    padding: 4,
  },
  inputWrap: {
    marginVertical: 10,
  },
  centerInput: {
    minHeight: 85,
    maxHeight: 130,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 12,
    color: colors.text,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  counter: {
    alignSelf: 'flex-end',
    color: colors.muted,
    fontSize: 11,
    marginTop: 4,
  },
  modalSubmitBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  modalSubmitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  cancelText: {
    color: colors.muted,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 13,
  },
});
