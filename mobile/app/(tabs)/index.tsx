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
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
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
    expected_hours?: number;
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

type DayTargetPayload = {
  expected_hours: number;
  worked_hours: number;
  logged_hours: number;
  remaining_hours: number;
  has_checkin: boolean;
  has_checkout: boolean;
  status: string;
};

function formatHoursAndMinutes(hours: number): string {
  if (!hours || hours <= 0) return '0m';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

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

function PunchScreen() {
  const { user, deviceUuid } = useAuth();
  const [today, setToday] = useState<TodayPayload | null>(null);
  const [dayTarget, setDayTarget] = useState<DayTargetPayload | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [online, setOnline] = useState(true);
  const [onWifi, setOnWifi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const pulse = useRef(new Animated.Value(1)).current;

  const load = useCallback(async () => {
    try {
      const [data, target] = await Promise.all([
        api<TodayPayload>('/attendance/today'),
        api<DayTargetPayload>('/daily-log/day-target').catch(() => null),
      ]);
      setToday(data);
      if (target) setDayTarget(target);
      return data;
    } catch (err: any) {
      throw err;
    }
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
      } finally {
        if (alive) setInitialLoading(false);
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

  const shiftDurationFormatted = useMemo(() => {
    if (!cin) return '00:00';
    const [inH, inM] = cin.split(':').map(Number);
    if (cout) {
      if (today?.record?.work_duration_formatted) {
        return today.record.work_duration_formatted;
      }
      const [outH, outM] = cout.split(':').map(Number);
      let diffMins = (outH * 60 + outM) - (inH * 60 + inM);
      if (diffMins < 0) diffMins += 24 * 60;
      const hh = Math.floor(diffMins / 60);
      const mm = diffMins % 60;
      if (hh === 0) return `${mm}m`;
      if (mm === 0) return `${hh}h`;
      return `${hh}h ${mm}m`;
    }
    const start = new Date();
    start.setHours(inH, inM, 0, 0);
    const diffSec = Math.max(0, Math.floor((nowTick - start.getTime()) / 1000));
    const hh = String(Math.floor(diffSec / 3600)).padStart(2, '0');
    const mm = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
    return `${hh}h : ${mm}m`;
  }, [cin, cout, nowTick, today?.record?.work_duration_formatted]);

  const elapsed = useMemo(() => {
    if (!cin || cout) return null;
    return shiftDurationFormatted;
  }, [cin, cout, shiftDurationFormatted]);

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

  const loggedHours = dayTarget?.logged_hours ?? 0;
  const expectedHours = dayTarget?.expected_hours ?? today?.shift?.expected_hours ?? 8.0;
  const workedHours = dayTarget?.worked_hours ?? 0;
  const remainingHoursToLog = Math.max(0, (cout ? workedHours : expectedHours) - loggedHours);

  let trackerStatusLabel = 'Log Pending';
  let trackerStatusBg = '#FFF7ED';
  let trackerStatusColor = colors.amber;

  if (cout) {
    if (loggedHours >= workedHours && workedHours > 0) {
      trackerStatusLabel = 'Log Complete';
      trackerStatusBg = '#ECFDF5';
      trackerStatusColor = colors.emerald;
    } else if (loggedHours < workedHours) {
      const diffFormatted = formatHoursAndMinutes(workedHours - loggedHours);
      trackerStatusLabel = `${diffFormatted} missing`;
      trackerStatusBg = '#FFF1F2';
      trackerStatusColor = colors.rose;
    }
  } else if (cin) {
    if (loggedHours >= expectedHours && expectedHours > 0) {
      trackerStatusLabel = 'Target Reached';
      trackerStatusBg = '#ECFDF5';
      trackerStatusColor = colors.emerald;
    } else if (loggedHours > 0) {
      trackerStatusLabel = `${formatHoursAndMinutes(loggedHours)} Logged`;
      trackerStatusBg = '#EEF2FF';
      trackerStatusColor = colors.indigo;
    } else {
      trackerStatusLabel = '0m Logged';
      trackerStatusBg = '#FFF7ED';
      trackerStatusColor = colors.amber;
    }
  }

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

  if (initialLoading && !today) {
    return (
      <SafeAreaView style={[styles.safe, styles.centerScreen]}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.indigo} />
          <Text style={styles.loadingTitle}>Syncing Attendance</Text>
          <Text style={styles.loadingSubtitle}>Fetching your shift schedule & status...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hi}>Hi {user?.name?.split(' ')[0] || 'there'} 👋</Text>
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

            {cout ? (
              <View style={styles.completedCard}>
                <View style={styles.completedHeader}>
                  <View style={styles.completedIconBadge}>
                    <Ionicons name="checkmark-circle" size={26} color="#059669" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.completedTitle}>Shift Complete</Text>
                    <Text style={styles.completedSub}>
                      Checked out at {formatTime(cout)}
                    </Text>
                  </View>
                  <View style={styles.completedHoursPill}>
                    <Ionicons name="time-outline" size={13} color="#059669" />
                    <Text style={styles.completedHoursText}>{shiftDurationFormatted}</Text>
                  </View>
                </View>
              </View>
            ) : (
              <>
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
          </>
        )}
        {!!error && <Text style={styles.error}>{error}</Text>}

        {cin && !isOffDay && String(user?.role || '').toLowerCase() !== 'operations' && (
          <View style={styles.trackerCard}>
            <View style={styles.trackerHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="timer-outline" size={16} color={colors.indigo} />
                <Text style={styles.trackerHeadTitle}>Shift & Tasks Tracker</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: trackerStatusBg }]}>
                <Text style={[styles.statusText, { color: trackerStatusColor }]}>
                  {trackerStatusLabel}
                </Text>
              </View>
            </View>

            <View style={styles.trackerRow}>
              <View style={styles.trackerCol}>
                <View style={styles.trackerLabelWrap}>
                  <Text style={styles.trackerLabel} numberOfLines={1} adjustsFontSizeToFit>
                    Total Hours
                  </Text>
                </View>
                <Text style={styles.trackerValue} numberOfLines={1}>{shiftDurationFormatted}</Text>
              </View>
              <View style={styles.trackerSep} />
              <View style={styles.trackerCol}>
                <View style={styles.trackerLabelWrap}>
                  <Text style={styles.trackerLabel} numberOfLines={1} adjustsFontSizeToFit>
                    Tasks Logged
                  </Text>
                </View>
                <Text style={[styles.trackerValue, { color: colors.emerald }]} numberOfLines={1}>
                  {loggedHours > 0 ? formatHoursAndMinutes(loggedHours) : '0m'}
                </Text>
              </View>
              <View style={styles.trackerSep} />
              <View style={styles.trackerCol}>
                <View style={styles.trackerLabelWrap}>
                  <Text style={styles.trackerLabel} numberOfLines={1} adjustsFontSizeToFit>
                    {cout ? 'Net Deficit' : 'To Log'}
                  </Text>
                </View>
                <Text
                  style={[styles.trackerValue, { color: remainingHoursToLog > 0 ? colors.amber : colors.muted }]}
                  numberOfLines={1}
                >
                  {remainingHoursToLog > 0 ? `${formatHoursAndMinutes(remainingHoursToLog)} left` : 'Complete'}
                </Text>
              </View>
            </View>
          </View>
        )}

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
                <Text style={styles.cardTitle}>
                  {today?.checkout_gate?.type === 'overtime' ? 'Overtime Reason' : 'Leaving Early Reason'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {today?.checkout_gate?.message || `Shift ended at ${today?.checkout_gate?.shift_end || today?.shift?.end_time}.`}
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
                placeholder="Why are you checking out at this time?"
                placeholderTextColor={colors.muted}
                value={reason}
                onChangeText={setReason}
                multiline
                blurOnSubmit={true}
                returnKeyType="done"
              />
            </View>

            <Pressable
              style={[styles.modalSubmitBtn, { backgroundColor: colors.emerald, opacity: busy ? 0.6 : 1 }]}
              onPress={submitReason}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.heroText}>Submit check-out</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                setReasonOpen(false);
              }}
              style={{ marginTop: 10, paddingVertical: 6 }}
            >
              <Text style={[styles.footerLock, { textAlign: 'center' }]}>Cancel</Text>
            </Pressable>
          </View>
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

type DailyMatrixRow = {
  user_id: string;
  employee_name: string;
  department?: string;
  role?: string;
  shift_name?: string;
  shift_timing?: string;
  check_in?: string | null;
  check_out?: string | null;
  punch_in?: string | null;
  punch_out?: string | null;
  status?: string;
  status_badge?: string;
  work_hours?: string;
  is_late?: boolean;
  is_wfh_approved?: boolean;
};

type DailyMatrixSummary = {
  total_headcount?: number;
  present?: number;
  on_time?: number;
  late?: number;
  wfh?: number;
  leaves?: number;
  absent?: number;
};

type DailyMatrixResponse = {
  date: string;
  summary?: DailyMatrixSummary;
  total_employees?: number;
  present_count?: number;
  absent_count?: number;
  late_count?: number;
  wfh_count?: number;
  leave_count?: number;
  rows?: DailyMatrixRow[];
};

function AdminOverviewScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [matrix, setMatrix] = useState<DailyMatrixResponse | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [lastUpdated, setLastUpdated] = useState('');

  const loadData = useCallback(async (spin = false) => {
    if (spin) setLoading(true);
    try {
      const [matrixRes, pendingRes] = await Promise.all([
        api<DailyMatrixResponse>('/attendance/matrix'),
        api<any[]>('/leaves/pending').catch(() => []),
      ]);
      if (matrixRes) {
        setMatrix(matrixRes);
        setPendingCount(Array.isArray(pendingRes) ? pendingRes.length : 0);
        const d = new Date();
        setLastUpdated(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
    } catch (err: any) {
      console.error('Failed to load matrix in admin overview:', err);
    } finally {
      if (spin) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData(true);
      const timer = setInterval(() => {
        loadData(false);
      }, 10000);
      return () => clearInterval(timer);
    }, [loadData]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(false);
  }, [loadData]);

  // Derive counts directly matching desktop daily matrix
  const totalEmployees = matrix?.total_employees ?? matrix?.summary?.total_headcount ?? (matrix?.rows?.length || 0);
  const presentCount = matrix?.present_count ?? matrix?.summary?.present ?? 0;
  const onTimeCount = matrix?.summary?.on_time ?? Math.max(0, presentCount - (matrix?.late_count || matrix?.summary?.late || 0));
  const lateCount = matrix?.late_count ?? matrix?.summary?.late ?? 0;
  const wfhCount = matrix?.wfh_count ?? matrix?.summary?.wfh ?? 0;
  const leaveCount = matrix?.leave_count ?? matrix?.summary?.leaves ?? 0;
  const absentCount = matrix?.absent_count ?? matrix?.summary?.absent ?? Math.max(0, totalEmployees - presentCount - wfhCount - leaveCount);

  const attendancePercent =
    totalEmployees > 0 ? Math.round((presentCount / totalEmployees) * 100) : 0;

  const rows = matrix?.rows || [];

  const filteredEmployees = useMemo(() => {
    return rows.filter((e) => {
      const name = e.employee_name || '';
      const dept = e.department || '';
      const matchesSearch =
        !search ||
        name.toLowerCase().includes(search.toLowerCase()) ||
        dept.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;

      const cin = e.check_in || e.punch_in;
      const isPres = Boolean(cin);
      const isLate = Boolean(e.status === 'late' || (e.status !== 'wfh' && e.is_late));
      const isWfh = Boolean(e.status === 'wfh' || e.is_wfh_approved || e.status_badge === 'WFH');
      const isLeave =
        ['sick_leave', 'casual_leave', 'annual_leave', 'unpaid_leave', 'short_leave', 'on_leave'].includes(
          String(e.status || ''),
        ) ||
        e.status_badge === 'Leave' ||
        e.status_badge === 'Annual Leave' ||
        e.status_badge === 'Sick Leave';

      if (filter === 'all') return true;
      if (filter === 'present') return isPres;
      if (filter === 'late') return isLate;
      if (filter === 'wfh') return isWfh;
      if (filter === 'leave') return isLeave;
      if (filter === 'absent') return !isPres && !isWfh && !isLeave;
      return true;
    });
  }, [rows, search, filter]);

  if (loading && !matrix) {
    return (
      <SafeAreaView style={[styles.safe, styles.centerScreen]}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.indigo} />
          <Text style={styles.loadingTitle}>Loading Command Center</Text>
          <Text style={styles.loadingSubtitle}>Fetching live attendance from desktop database...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.adminScroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.indigo} />}
      >
        {/* Executive Header */}
        <View style={styles.adminHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.adminGreeting}>Hi {user?.name?.split(' ')[0] || 'Admin'} 👋</Text>
            <View style={styles.livePulseRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>
                Live Attendance {lastUpdated ? `· ${lastUpdated}` : ''}
              </Text>
            </View>
          </View>
          <View style={styles.avatarWrap}>
            <Avatar name={user?.name || 'Admin'} size={46} />
          </View>
        </View>

        {/* Pending Approvals Callout Banner */}
        {pendingCount > 0 && (
          <Pressable
            style={styles.pendingActionBanner}
            onPress={() => router.push('/(tabs)/requests')}
          >
            <View style={styles.pendingActionLeft}>
              <View style={styles.pendingBadgeIcon}>
                <Ionicons name="shield-checkmark" size={18} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingActionTitle}>
                  {pendingCount} Requests Pending Approval
                </Text>
                <Text style={styles.pendingActionSub}>
                  Leaves, corrections & overtime awaiting review
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.indigo} />
          </Pressable>
        )}

        {/* 4 Executive Metric Cards in Clean 2x2 Grid (No whitespace on right!) */}
        <View style={styles.metricsContainer}>
          {/* Row 1: Headcount & Punctuality */}
          <View style={styles.metricsRow}>
            {/* Card 1: Headcount */}
            <View style={styles.metricCard}>
              <View style={styles.metricHead}>
                <Text style={styles.metricLabel}>Present Today</Text>
                <View style={[styles.miniIconBg, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="people" size={13} color={colors.emerald} />
                </View>
              </View>
              <Text style={styles.metricValue}>
                {presentCount}
                <Text style={styles.metricTotal}> / {totalEmployees}</Text>
              </Text>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${Math.min(100, attendancePercent)}%` }]} />
              </View>
              <Text style={styles.metricFooter}>{attendancePercent}% Attendance Rate</Text>
            </View>

            {/* Card 2: Punctuality */}
            <View style={styles.metricCard}>
              <View style={styles.metricHead}>
                <Text style={styles.metricLabel}>Punctuality</Text>
                <View style={[styles.miniIconBg, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="time" size={13} color={colors.indigo} />
                </View>
              </View>
              <View style={styles.dualStatRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dualStatNum, { color: colors.emerald }]}>{onTimeCount}</Text>
                  <Text style={styles.dualStatLabel}>On Time</Text>
                </View>
                <View style={styles.metricSep} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={[styles.dualStatNum, { color: lateCount > 0 ? colors.rose : colors.muted }]}>
                    {lateCount}
                  </Text>
                  <Text style={styles.dualStatLabel}>Late</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Row 2: Remote & Leaves & Unreported */}
          <View style={styles.metricsRow}>
            {/* Card 3: Remote & Leaves */}
            <View style={styles.metricCard}>
              <View style={styles.metricHead}>
                <Text style={styles.metricLabel}>Remote & Leaves</Text>
                <View style={[styles.miniIconBg, { backgroundColor: '#F5F3FF' }]}>
                  <Ionicons name="home" size={13} color="#7C3AED" />
                </View>
              </View>
              <View style={styles.dualStatRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dualStatNum, { color: '#2563EB' }]}>{wfhCount}</Text>
                  <Text style={styles.dualStatLabel}>WFH</Text>
                </View>
                <View style={styles.metricSep} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={[styles.dualStatNum, { color: '#7C3AED' }]}>{leaveCount}</Text>
                  <Text style={styles.dualStatLabel}>Leave</Text>
                </View>
              </View>
            </View>

            {/* Card 4: Absent */}
            <View style={styles.metricCard}>
              <View style={styles.metricHead}>
                <Text style={styles.metricLabel}>Unreported</Text>
                <View style={[styles.miniIconBg, { backgroundColor: '#FFF1F2' }]}>
                  <Ionicons name="alert-circle" size={13} color={colors.rose} />
                </View>
              </View>
              <Text style={[styles.metricValue, { color: absentCount > 0 ? colors.rose : colors.text }]}>
                {absentCount}
              </Text>
              <Text style={styles.metricFooter}>Missing clock-in</Text>
            </View>
          </View>
        </View>

        {/* Live Employee Directory Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.adminSectionTitle}>Live Team Directory</Text>
          <Text style={styles.adminSectionCount}>
            {filteredEmployees.length} of {totalEmployees}
          </Text>
        </View>

        {/* Search Input */}
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search employee or department..."
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
          />
          {Boolean(search) && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {/* Filter Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipRow}>
          {[
            { id: 'all', label: `All (${totalEmployees})` },
            { id: 'present', label: `Present (${presentCount})` },
            { id: 'late', label: `Late (${lateCount})` },
            { id: 'wfh', label: `WFH (${wfhCount})` },
            { id: 'leave', label: `Leave (${leaveCount})` },
            { id: 'absent', label: `Absent (${absentCount})` },
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

        {/* Employee Cards */}
        {filteredEmployees.length === 0 ? (
          <View style={styles.emptyAdminBox}>
            <Ionicons name="people-outline" size={32} color={colors.muted} />
            <Text style={styles.emptyAdminText}>No employees match this filter</Text>
          </View>
        ) : (
          filteredEmployees.map((emp) => {
            const cin = emp.check_in || emp.punch_in;
            const cout = emp.check_out || emp.punch_out;
            const isPres = Boolean(cin);
            const isLate = Boolean(emp.status === 'late' || (emp.status !== 'wfh' && emp.is_late));
            const isWfh = Boolean(emp.status === 'wfh' || emp.is_wfh_approved || emp.status_badge === 'WFH');
            const isLeave =
              ['sick_leave', 'casual_leave', 'annual_leave', 'unpaid_leave', 'short_leave', 'on_leave'].includes(
                String(emp.status || ''),
              ) ||
              emp.status_badge === 'Leave' ||
              emp.status_badge === 'Annual Leave' ||
              emp.status_badge === 'Sick Leave';
            const isCompleted = isPres && Boolean(cout);

            let statusLabel = 'Absent';
            let badgeBg = '#FEF2F2';
            let badgeColor = '#DC2626';

            if (isPres) {
              if (isLate) {
                statusLabel = 'Late';
                badgeBg = '#FFF1F2';
                badgeColor = '#DC2626';
              } else if (isCompleted) {
                statusLabel = 'Completed';
                badgeBg = '#ECFDF5';
                badgeColor = '#059669';
              } else {
                statusLabel = 'On Time';
                badgeBg = '#ECFDF5';
                badgeColor = '#059669';
              }
            } else if (isWfh) {
              statusLabel = 'W.F.H';
              badgeBg = '#EFF6FF';
              badgeColor = '#2563EB';
            } else if (isLeave) {
              statusLabel = emp.status_badge || (emp.status === 'short_leave' ? 'Short Leave' : 'Leave');
              badgeBg = '#F5F3FF';
              badgeColor = '#7C3AED';
            }

            return (
              <View key={emp.user_id} style={styles.empCard}>
                <View style={styles.empCardMain}>
                  <Avatar name={emp.employee_name} size={38} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={styles.empNameRow}>
                      <Text style={styles.empName} numberOfLines={1}>
                        {emp.employee_name}
                      </Text>
                      <View style={[styles.empStatusBadge, { backgroundColor: badgeBg }]}>
                        <Text style={[styles.empStatusText, { color: badgeColor }]}>
                          {statusLabel}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.empDept}>{emp.department || 'General'} · {prettyRole(emp.role || 'employee')}</Text>
                  </View>
                </View>

                {/* Timings row */}
                <View style={styles.empTimingsRow}>
                  <View style={styles.empTimingItem}>
                    <Ionicons name="enter-outline" size={12} color={colors.muted} />
                    <Text style={styles.empTimingLabel}>In:</Text>
                    <Text style={[styles.empTimingValue, { color: isLate ? colors.rose : colors.emerald }]}>
                      {cin ? cin.substring(0, 5) : '—'}
                    </Text>
                  </View>

                  <View style={styles.empTimingItem}>
                    <Ionicons name="exit-outline" size={12} color={colors.muted} />
                    <Text style={styles.empTimingLabel}>Out:</Text>
                    <Text style={styles.empTimingValue}>
                      {cout ? cout.substring(0, 5) : '—'}
                    </Text>
                  </View>

                  {emp.work_hours && emp.work_hours !== '00:00' ? (
                    <View style={styles.empTimingItem}>
                      <Ionicons name="time-outline" size={12} color={colors.muted} />
                      <Text style={styles.empTimingLabel}>Hrs:</Text>
                      <Text style={[styles.empTimingValue, { color: colors.indigo, fontWeight: '700' }]}>
                        {emp.work_hours}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function PunchOrOverviewScreen() {
  const { user } = useAuth();
  const isAdmin =
    String(user?.role || '').toLowerCase() === 'admin' ||
    String(user?.role || '').toLowerCase() === 'super_admin';

  if (isAdmin) {
    return <AdminOverviewScreen />;
  }
  return <PunchScreen />;
}



const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centerScreen: { justifyContent: 'center', alignItems: 'center' },
  loadingBox: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingTitle: { marginTop: 18, fontSize: 18, fontWeight: '800', color: colors.text },
  loadingSubtitle: { marginTop: 6, fontSize: 13, color: colors.muted, textAlign: 'center' },
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
  completedCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 8,
  },
  completedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  completedIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#065F46',
  },
  completedSub: {
    fontSize: 12,
    color: '#047857',
    marginTop: 2,
    fontWeight: '600',
  },
  completedHoursPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  completedHoursText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
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
  trackerCard: {
    marginTop: 18,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  trackerHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  trackerHeadTitle: {
    fontWeight: '800',
    color: colors.text,
    fontSize: 14,
  },
  trackerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: colors.line,
  },
  trackerCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  trackerLabelWrap: {
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  trackerLabel: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '700',
    textAlign: 'center',
  },
  trackerValue: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  trackerSep: {
    width: 1,
    height: 26,
    alignSelf: 'center',
    backgroundColor: colors.line,
  },
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
    textAlignVertical: 'top',
    fontSize: 14,
    backgroundColor: '#FAFAFA',
  },
  modalSubmitBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  adminScroll: {
    padding: 20,
    paddingBottom: 130,
  },
  adminHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  adminGreeting: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
  },
  livePulseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  liveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  avatarWrap: {
    borderRadius: 999,
    padding: 2,
    borderWidth: 2,
    borderColor: colors.indigo,
  },
  pendingActionBanner: {
    backgroundColor: '#EEF2FF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  pendingActionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  pendingBadgeIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.indigo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingActionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  pendingActionSub: {
    fontSize: 11.5,
    color: colors.muted,
    marginTop: 2,
  },
  metricsContainer: {
    marginBottom: 16,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  metricHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.muted,
  },
  miniIconBg: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  metricTotal: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  progressBarBg: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#F1F5F9',
    marginTop: 8,
    marginBottom: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: 3,
  },
  metricFooter: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.muted,
  },
  dualStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  dualStatNum: {
    fontSize: 18,
    fontWeight: '800',
  },
  dualStatLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.muted,
    marginTop: 2,
  },
  metricSep: {
    width: 1,
    height: 24,
    backgroundColor: colors.line,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  adminSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  adminSectionCount: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
  },
  filterChipRow: {
    gap: 6,
    paddingBottom: 14,
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
  emptyAdminBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyAdminText: {
    marginTop: 8,
    fontSize: 13,
    color: colors.muted,
  },
  empCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 8,
  },
  empCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  empNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  empName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    flex: 1,
    marginRight: 6,
  },
  empStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  empStatusText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  empDept: {
    fontSize: 11.5,
    color: colors.muted,
    marginTop: 2,
  },
  empTimingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F4F4F5',
  },
  empTimingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  empTimingLabel: {
    fontSize: 10.5,
    color: colors.muted,
    fontWeight: '600',
  },
  empTimingValue: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
  },
});
