import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as LocalAuthentication from 'expo-local-authentication';
import NetInfo from '@react-native-community/netinfo';
import { api } from '../../src/lib/api';
import { classifyGpsFix, haversineMeters } from '../../src/lib/geo';
import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme';
import { Avatar } from '../../src/ui/Avatar';
import { formatLongDate, formatTime, prettyRole } from '../../src/ui/format';

type TodayPayload = {
  record: {
    check_in?: string | null;
    punch_in?: string | null;
    check_out?: string | null;
    punch_out?: string | null;
    status?: string;
    work_duration_formatted?: string;
    break_minutes?: number;
    late_minutes?: number;
    is_late?: boolean;
  } | null;
  shift: {
    name: string;
    start_time: string;
    end_time: string;
    shift_type?: string;
    break_duration_minutes?: number;
  };
  is_wfh_approved: boolean;
  can_punch_in?: boolean;
  can_punch_out?: boolean;
  office_latitude?: number;
  office_longitude?: number;
  geofence_radius_meters?: number;
  is_ip_verified?: boolean;
  enforce_ip_whitelist?: boolean;
  shift_ended?: boolean;
  checkout_gate?: { type?: string; shift_end?: string; message?: string | null };
  is_off_day?: boolean;
  off_day_kind?: string | null;
  off_day_label?: string | null;
};

function scheduledBreakMinutes(today: TodayPayload | null): number {
  const kind = `${today?.shift?.shift_type || ''} ${today?.shift?.name || ''}`.toLowerCase();
  if (kind.includes('afternoon')) return 0;
  const fromShift = today?.shift?.break_duration_minutes;
  if (typeof fromShift === 'number' && Number.isFinite(fromShift)) {
    return Math.max(0, fromShift);
  }
  const fromRecord = today?.record?.break_minutes;
  if (typeof fromRecord === 'number' && Number.isFinite(fromRecord)) {
    return Math.max(0, fromRecord);
  }
  if (kind.includes('night') || kind.includes('hr') || kind.includes('standard')) return 60;
  return 0;
}

type Fix = {
  lat: number;
  lng: number;
  accuracy: number;
  capturedAt: string;
  mocked: boolean;
  distance: number;
  quality: ReturnType<typeof classifyGpsFix>;
};

export default function PunchScreen() {
  const { user, deviceUuid } = useAuth();
  const [today, setToday] = useState<TodayPayload | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [online, setOnline] = useState(true);
  const [onWifi, setOnWifi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const pulse = useRef(new Animated.Value(1)).current;

  const load = useCallback(async () => {
    const data = await api<TodayPayload>('/attendance/today');
    setToday(data);
    return data;
  }, []);

  const captureGps = useCallback(async (payload: TodayPayload | null) => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      setError('Location permission is required to punch.');
      return null;
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy ?? 999;
    const mocked = Boolean((pos as { mocked?: boolean }).mocked || (pos.coords as { mocked?: boolean }).mocked);
    const officeLat = payload?.office_latitude ?? payload?.office_latitude ?? 33.52049;
    const officeLng = payload?.office_longitude ?? payload?.office_longitude ?? 73.09145;
    const radius = payload?.geofence_radius_meters ?? payload?.geofence_radius_meters ?? 500;
    const distance = haversineMeters(lat, lng, officeLat, officeLng);
    const quality = classifyGpsFix(distance, accuracy, radius);
    const next: Fix = {
      lat,
      lng,
      accuracy,
      capturedAt: new Date(pos.timestamp).toISOString(),
      mocked,
      distance,
      quality,
    };
    setFix(next);
    return next;
  }, []);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setOnline(Boolean(state.isConnected));
      setOnWifi(state.type === 'wifi');
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await load();
        if (alive && !data?.is_off_day) await captureGps(data);
      } catch (err: any) {
        if (alive) setError(err.message || 'Could not load today');
      }
    })();
    const poll = setInterval(() => {
      load().catch(() => undefined);
    }, 45000);
    const tick = setInterval(() => setNowTick(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load, captureGps]);

  const cin = today?.record?.check_in || today?.record?.punch_in || null;
  const cout = today?.record?.check_out || today?.record?.punch_out || null;
  const isOffDay = Boolean(today?.is_off_day);
  const offDayLabel = today?.off_day_label || 'Official rest day';
  const isWfh = Boolean(today?.is_wfh_approved);
  const canIn = Boolean(today?.can_punch_in) && !cin && !isOffDay;
  const canOut = Boolean(today?.can_punch_out) && Boolean(cin) && !cout && !isOffDay;

  useEffect(() => {
    if (!canOut) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [canOut, pulse]);

  const elapsed = useMemo(() => {
    if (!cin || cout) return null;
    const [h, m] = cin.split(':').map(Number);
    const start = new Date();
    start.setHours(h, m, 0, 0);
    const diff = Math.max(0, Math.floor((nowTick - start.getTime()) / 1000));
    const hh = String(Math.floor(diff / 3600)).padStart(2, '0');
    const mm = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    return `${hh}h : ${mm}m`;
  }, [cin, cout, nowTick]);

  const gpsOk = isWfh || fix?.quality === 'in_range';
  const ipRequired = today?.enforce_ip_whitelist !== false;
  const wifiOk =
    isWfh ||
    !ipRequired ||
    Boolean(today?.is_ip_verified) ||
    (onWifi && gpsOk);
  const lateMinutes = today?.record?.late_minutes || 0;
  const isLate = Boolean(today?.record?.is_late || lateMinutes > 0);
  const breakMins = scheduledBreakMinutes(today);

  const confirmBiometric = async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirm it is you to punch',
      fallbackLabel: 'Use PIN',
      disableDeviceFallback: false,
    });
    if (!result.success) {
      throw new Error('Face ID / fingerprint / PIN was cancelled.');
    }
  };

  const punch = async (kind: 'in' | 'out', varianceReason?: string) => {
    if (today?.is_off_day) throw new Error(`Check-in is closed. ${today.off_day_label || 'Official rest day'}.`);
    if (!deviceUuid) throw new Error('Device is not registered yet.');
    if (!online) throw new Error('You are offline. Connect to the internet, then punch. Time is recorded on the server.');
    await confirmBiometric();
    const data = today || (await load());
    const gps = (await captureGps(data)) || fix;
    if (!gps) throw new Error('Could not read GPS.');
    const body: Record<string, unknown> = {
      device_uuid: deviceUuid,
      biometric_verified: true,
      is_mocked: gps.mocked,
      latitude: gps.lat,
      longitude: gps.lng,
      accuracy_meters: gps.accuracy,
      gps_captured_at: gps.capturedAt,
    };
    if (kind === 'in') {
      body.notes = isWfh ? 'WFH Approved Check-In' : 'Office Check-In';
      await api('/attendance/check-in', { method: 'POST', body: JSON.stringify(body) });
    } else {
      body.notes = 'Shift check-out';
      if (varianceReason) body.variance_reason = varianceReason;
      await api('/attendance/check-out', { method: 'POST', body: JSON.stringify(body) });
    }
    await load();
  };

  const onPress = async (kind: 'in' | 'out') => {
    setError('');
    if (kind === 'out' && today?.checkout_gate && today.checkout_gate.type && today.checkout_gate.type !== 'none') {
      setReasonOpen(true);
      return;
    }
    setBusy(true);
    try {
      await punch(kind);
    } catch (err: any) {
      setError(err.message || 'Punch failed');
    } finally {
      setBusy(false);
    }
  };

  const submitReason = async () => {
    if (reason.trim().length < 3) {
      Alert.alert('Reason required', 'Please explain overtime or leaving early.');
      return;
    }
    setBusy(true);
    try {
      await punch('out', reason.trim());
      setReasonOpen(false);
      setReason('');
    } catch (err: any) {
      setError(err.message || 'Check-out failed');
    } finally {
      setBusy(false);
    }
  };

  let btnLabel = 'Shift complete';
  let btnColor = colors.slate;
  let btnDisabled = true;
  let btnIcon: keyof typeof Ionicons.glyphMap = 'checkmark-circle';
  if (canIn) {
    btnLabel = 'Tap to Check In';
    btnColor = colors.indigo;
    btnDisabled = false;
    btnIcon = 'finger-print';
  } else if (canOut) {
    btnLabel = 'Check Out';
    btnColor = colors.emerald;
    btnDisabled = false;
    btnIcon = 'exit-outline';
  }

  const roleLine = [prettyRole(user?.role), user?.department].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hi}>Hi {user?.name?.split(' ')[0] || 'there'}</Text>
            <View style={styles.metaRow}>
              <View style={styles.dateChip}>
                <Text style={styles.dateText}>{formatLongDate()}</Text>
              </View>
              {!!roleLine && (
                <View style={styles.roleChip}>
                  <Text style={styles.roleText}>{roleLine}</Text>
                </View>
              )}
            </View>
            <Text style={styles.shift}>
              {today?.shift?.name || 'Shift'} · {formatTime(today?.shift?.start_time)} – {formatTime(today?.shift?.end_time)}
            </Text>
          </View>
          <Avatar name={user?.name} size={48} />
        </View>

        {isOffDay ? (
          <View style={styles.restCard}>
            <Ionicons name="calendar-outline" size={36} color={colors.indigo} />
            <Text style={styles.restTitle}>{offDayLabel}</Text>
            <Text style={styles.restBody}>
              Check-in and check-out are closed today (Sunday, first Saturday, or a company holiday).
              Leave, WFH, and punch corrections can still be submitted from Requests.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.verifyLabel}>Punch verification</Text>
            <View style={styles.pills}>
              <VerifyPill ok={Boolean(gpsOk)} icon="location-outline" label={isWfh ? 'WFH' : 'Geofence'} />
              <VerifyPill ok={Boolean(wifiOk)} icon="wifi-outline" label={isWfh ? 'Remote' : 'Office Wi-Fi'} />
              <VerifyPill ok={online} icon="sync-outline" label={online ? 'Server Sync' : 'Offline'} />
            </View>

            <View style={styles.heroWrap}>
              <Animated.View style={{ transform: [{ scale: canOut ? pulse : 1 }] }}>
                <Pressable
                  style={[
                    styles.hero,
                    { backgroundColor: btnColor, opacity: busy || btnDisabled ? 0.55 : 1 },
                    canIn && styles.heroGlow,
                  ]}
                  disabled={busy || btnDisabled}
                  onPress={() => onPress(canIn ? 'in' : 'out')}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name={btnIcon} size={36} color="#fff" />
                      <Text style={styles.heroText}>{btnLabel}</Text>
                      {!!elapsed && <Text style={styles.heroTimer}>{elapsed} on shift</Text>}
                    </>
                  )}
                </Pressable>
              </Animated.View>
            </View>
            <View style={styles.lockRow}>
              <Ionicons name="lock-closed-outline" size={13} color={colors.muted} />
              <Text style={styles.footerLock}>Biometric & Geofence Protected</Text>
            </View>
          </>
        )}
        {!!error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Today</Text>
            {isOffDay ? (
              <View style={[styles.statusBadge, { backgroundColor: '#EEF2FF' }]}>
                <Text style={[styles.statusText, { color: colors.indigo }]}>Rest day</Text>
              </View>
            ) : !cin ? (
              <View style={[styles.statusBadge, { backgroundColor: '#F4F4F5' }]}>
                <Text style={[styles.statusText, { color: colors.muted }]}>Not checked in</Text>
              </View>
            ) : isLate ? (
              <View style={[styles.statusBadge, { backgroundColor: '#FFF1F2' }]}>
                <Text style={[styles.statusText, { color: colors.rose }]}>Late (+{lateMinutes}m)</Text>
              </View>
            ) : (
              <View style={[styles.statusBadge, { backgroundColor: '#ECFDF5' }]}>
                <Text style={[styles.statusText, { color: colors.emerald }]}>On Time</Text>
              </View>
            )}
          </View>
          <View style={styles.timeline}>
            <TimelineStep label="Check In" value={formatTime(cin)} done={Boolean(cin)} />
            <View style={styles.timelineLine} />
            <TimelineStep
              label={breakMins > 0 ? `Break ${breakMins}m` : 'Break'}
              value={breakMins > 0 ? `${breakMins}m` : 'None'}
              done={Boolean(cin) && breakMins > 0}
            />
            <View style={styles.timelineLine} />
            <TimelineStep label="Check Out" value={formatTime(cout)} done={Boolean(cout)} />
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={reasonOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          Keyboard.dismiss();
          setReasonOpen(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKeyboardAvoid}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalBg}>
              <TouchableWithoutFeedback>
                <View style={styles.modal}>
                  <Text style={styles.cardTitle}>
                    {today?.checkout_gate?.type === 'overtime' ? 'Overtime reason' : 'Leaving early'}
                  </Text>
                  <Text style={styles.shift}>
                    {today?.checkout_gate?.message || `Shift ended at ${today?.checkout_gate?.shift_end || today?.shift?.end_time}.`}
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Why are you overtime / leaving early?"
                    placeholderTextColor={colors.muted}
                    value={reason}
                    onChangeText={setReason}
                    multiline
                  />
                  <Pressable style={[styles.modalBtn, { backgroundColor: colors.emerald }]} onPress={submitReason} disabled={busy}>
                    <Text style={styles.heroText}>Submit check-out</Text>
                  </Pressable>
                  <Pressable onPress={() => { Keyboard.dismiss(); setReasonOpen(false); }} style={{ marginTop: 12, paddingVertical: 6 }}>
                    <Text style={[styles.footerLock, { textAlign: 'center' }]}>Cancel</Text>
                  </Pressable>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function VerifyPill({ ok, icon, label }: { ok: boolean; icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: ok ? '#ECFDF5' : '#FFF7ED' }]}>
      <Ionicons name={icon} size={14} color={ok ? colors.emerald : colors.amber} />
      <Text style={{ color: ok ? colors.emerald : colors.amber, fontWeight: '700', fontSize: 12 }}>{label}</Text>
    </View>
  );
}

function TimelineStep({ label, value, done }: { label: string; value: string; done: boolean }) {
  return (
    <View style={styles.step}>
      <View style={[styles.dot, { backgroundColor: done ? colors.indigo : colors.line }]} />
      <Text style={styles.stepLabel}>{label}</Text>
      <Text style={styles.stepValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 18 },
  hi: { fontSize: 28, fontWeight: '800', color: colors.text },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  dateChip: { backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: colors.line },
  dateText: { fontSize: 12, fontWeight: '700', color: colors.slate },
  roleChip: { backgroundColor: '#EEF2FF', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  roleText: { fontSize: 12, fontWeight: '800', color: colors.indigo },
  shift: { color: colors.muted, marginTop: 8, fontSize: 13 },
  verifyLabel: { fontSize: 12, fontWeight: '800', color: colors.slate, marginBottom: 8, letterSpacing: 0.3 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  heroWrap: { alignItems: 'center', marginBottom: 10 },
  hero: {
    width: 196,
    height: 196,
    borderRadius: 98,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  heroGlow: {
    shadowColor: colors.indigo,
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  heroText: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  heroTimer: { color: '#ECFDF5', fontWeight: '700', marginTop: 6 },
  restCard: {
    backgroundColor: '#EEF2FF',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    marginBottom: 8,
  },
  restTitle: { marginTop: 10, fontSize: 16, fontWeight: '800', color: colors.indigo, textAlign: 'center' },
  restBody: { marginTop: 8, fontSize: 13, color: colors.slate, textAlign: 'center', lineHeight: 18 },
  lockRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 4 },
  footerLock: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  error: { color: colors.rose, marginTop: 12, fontWeight: '600', textAlign: 'center' },
  card: {
    marginTop: 22,
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle: { fontWeight: '800', color: colors.text, fontSize: 16 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '800' },
  timeline: { flexDirection: 'row', alignItems: 'center' },
  timelineLine: { flex: 1, height: 2, backgroundColor: colors.line, marginBottom: 22 },
  step: { alignItems: 'center', width: 86 },
  dot: { width: 10, height: 10, borderRadius: 5, marginBottom: 8 },
  stepLabel: { fontSize: 11, color: colors.muted, fontWeight: '700' },
  stepValue: { fontSize: 13, fontWeight: '800', color: colors.text, marginTop: 2 },
  modalKeyboardAvoid: { flex: 1 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: colors.card,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  input: {
    minHeight: 85,
    maxHeight: 130,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    marginVertical: 12,
    color: colors.text,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  modalBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
});
