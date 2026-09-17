import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import { formatFollowUp } from '../../ui/format';

interface FollowUpSheetProps {
  visible: boolean;
  currentFollowUp?: string | null;
  onClose: () => void;
  onSave: (iso: string | null) => Promise<void>;
}

function atLocalHour(daysFromNow: number, hour = 10, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const PRESETS = [
  {
    id: 'tomorrow_am',
    label: 'Tomorrow Morning',
    sublabel: '10:00 AM',
    icon: 'sunny-outline' as const,
    getDate: () => atLocalHour(1, 10, 0),
  },
  {
    id: 'tomorrow_pm',
    label: 'Tomorrow Afternoon',
    sublabel: '03:00 PM',
    icon: 'partly-sunny-outline' as const,
    getDate: () => atLocalHour(1, 15, 0),
  },
  {
    id: '2d',
    label: 'In 2 days',
    sublabel: '10:00 AM',
    icon: 'time-outline' as const,
    getDate: () => atLocalHour(2, 10, 0),
  },
  {
    id: '3d',
    label: 'In 3 days',
    sublabel: '10:00 AM',
    icon: 'time-outline' as const,
    getDate: () => atLocalHour(3, 10, 0),
  },
  {
    id: 'week',
    label: 'Next week',
    sublabel: '7 days · 10:00 AM',
    icon: 'calendar-outline' as const,
    getDate: () => atLocalHour(7, 10, 0),
  },
];

const TIME_OPTIONS = [
  { label: '09:00 AM', hour: 9, minute: 0 },
  { label: '10:00 AM', hour: 10, minute: 0 },
  { label: '11:30 AM', hour: 11, minute: 30 },
  { label: '02:00 PM', hour: 14, minute: 0 },
  { label: '03:30 PM', hour: 15, minute: 30 },
  { label: '05:00 PM', hour: 17, minute: 0 },
  { label: '06:00 PM', hour: 18, minute: 0 },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export const FollowUpSheet: React.FC<FollowUpSheetProps> = ({
  visible,
  currentFollowUp,
  onClose,
  onSave,
}) => {
  const [tab, setTab] = useState<'presets' | 'calendar'>('presets');
  const [saving, setSaving] = useState(false);

  // Selected date state
  const [selectedDate, setSelectedDate] = useState<Date>(() => atLocalHour(1, 10, 0));
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());

  // Reset or initialize state when sheet opens
  useEffect(() => {
    if (visible) {
      setTab('presets');
      setSaving(false);
      const initial =
        currentFollowUp && new Date(currentFollowUp).getTime() > Date.now()
          ? new Date(currentFollowUp)
          : atLocalHour(1, 10, 0);
      setSelectedDate(initial);
      setViewYear(initial.getFullYear());
      setViewMonth(initial.getMonth());
    }
  }, [visible, currentFollowUp]);

  const runSave = async (iso: string | null) => {
    setSaving(true);
    try {
      await onSave(iso);
      onClose();
    } catch {
      // Error handling managed in onSave
    } finally {
      setSaving(false);
    }
  };

  // Calendar calculations
  const now = useMemo(() => new Date(), []);
  const isCurrentMonthOrPast = useMemo(() => {
    return (
      viewYear < now.getFullYear() ||
      (viewYear === now.getFullYear() && viewMonth <= now.getMonth())
    );
  }, [viewYear, viewMonth, now]);

  const prevMonth = () => {
    if (isCurrentMonthOrPast) return;
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const daysInMonth = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();
    const blanks: (number | null)[] = Array.from({ length: firstDayOfWeek }, () => null);
    const days: (number | null)[] = Array.from({ length: totalDays }, (_, i) => i + 1);
    return [...blanks, ...days];
  }, [viewYear, viewMonth]);

  const handleSelectDay = (day: number) => {
    const next = new Date(
      viewYear,
      viewMonth,
      day,
      selectedDate.getHours(),
      selectedDate.getMinutes(),
      0
    );
    setSelectedDate(next);
  };

  const handleSelectTime = (hour: number, minute: number) => {
    const next = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      hour,
      minute,
      0
    );
    setSelectedDate(next);
  };

  const adjustMinutes = (deltaMinutes: number) => {
    const next = new Date(selectedDate.getTime() + deltaMinutes * 60000);
    if (next.getTime() < Date.now()) return;
    setSelectedDate(next);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Set follow-up</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {currentFollowUp
                  ? `Current: ${formatFollowUp(currentFollowUp)}`
                  : 'Remind yourself to reach out again'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeIconBtn}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Mode Switcher */}
          <View style={styles.segmentedControl}>
            <TouchableOpacity
              style={[styles.segmentBtn, tab === 'presets' ? styles.segmentBtnActive : null]}
              onPress={() => setTab('presets')}
            >
              <Ionicons
                name="flash-outline"
                size={14}
                color={tab === 'presets' ? colors.indigo : colors.muted}
              />
              <Text
                style={[
                  styles.segmentBtnText,
                  tab === 'presets' ? styles.segmentBtnTextActive : null,
                ]}
              >
                Quick Presets
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentBtn, tab === 'calendar' ? styles.segmentBtnActive : null]}
              onPress={() => setTab('calendar')}
            >
              <Ionicons
                name="calendar-outline"
                size={14}
                color={tab === 'calendar' ? colors.indigo : colors.muted}
              />
              <Text
                style={[
                  styles.segmentBtnText,
                  tab === 'calendar' ? styles.segmentBtnTextActive : null,
                ]}
              >
                Pick Date & Time
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {tab === 'presets' ? (
              <View style={styles.presetsList}>
                {PRESETS.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.presetRow}
                    disabled={saving}
                    onPress={() => runSave(p.getDate().toISOString())}
                  >
                    <View style={styles.presetIconBox}>
                      <Ionicons name={p.icon} size={18} color={colors.indigo} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.presetLabel}>{p.label}</Text>
                      <Text style={styles.presetSublabel}>{p.sublabel}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  style={[styles.presetRow, styles.customTriggerRow]}
                  disabled={saving}
                  onPress={() => setTab('calendar')}
                >
                  <View style={[styles.presetIconBox, { backgroundColor: '#EEF2FF' }]}>
                    <Ionicons name="calendar" size={18} color={colors.indigo} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.presetLabel, { color: colors.indigo }]}>
                      Choose specific date & time
                    </Text>
                    <Text style={styles.presetSublabel}>Open interactive calendar</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.indigo} />
                </TouchableOpacity>

                {currentFollowUp ? (
                  <TouchableOpacity
                    style={[styles.presetRow, styles.clearRow]}
                    disabled={saving}
                    onPress={() => runSave(null)}
                  >
                    <View style={[styles.presetIconBox, { backgroundColor: '#FFE4E6' }]}>
                      <Ionicons name="close-circle-outline" size={18} color={colors.rose} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.clearLabel}>Clear follow-up</Text>
                      <Text style={styles.clearSublabel}>Remove scheduled reminder</Text>
                    </View>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <View style={styles.calendarContainer}>
                {/* Month / Year Bar */}
                <View style={styles.monthHeader}>
                  <TouchableOpacity
                    style={[
                      styles.monthNavBtn,
                      isCurrentMonthOrPast ? styles.monthNavBtnDisabled : null,
                    ]}
                    disabled={isCurrentMonthOrPast}
                    onPress={prevMonth}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={18}
                      color={isCurrentMonthOrPast ? colors.line : colors.text}
                    />
                  </TouchableOpacity>

                  <Text style={styles.monthTitle}>
                    {MONTH_NAMES[viewMonth]} {viewYear}
                  </Text>

                  <TouchableOpacity
                    style={styles.monthNavBtn}
                    onPress={nextMonth}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="chevron-forward" size={18} color={colors.text} />
                  </TouchableOpacity>
                </View>

                {/* Day-of-week headers */}
                <View style={styles.weekdayRow}>
                  {WEEKDAY_NAMES.map((d, i) => (
                    <Text key={i} style={styles.weekdayText}>
                      {d}
                    </Text>
                  ))}
                </View>

                {/* Days Grid */}
                <View style={styles.daysGrid}>
                  {daysInMonth.map((day, idx) => {
                    if (day === null) {
                      return <View key={`blank-${idx}`} style={styles.dayCell} />;
                    }

                    const isPast =
                      new Date(viewYear, viewMonth, day, 23, 59, 59).getTime() < Date.now();
                    const isToday =
                      viewYear === now.getFullYear() &&
                      viewMonth === now.getMonth() &&
                      day === now.getDate();
                    const isSelected =
                      viewYear === selectedDate.getFullYear() &&
                      viewMonth === selectedDate.getMonth() &&
                      day === selectedDate.getDate();

                    return (
                      <TouchableOpacity
                        key={`day-${day}`}
                        style={[
                          styles.dayCell,
                          isSelected ? styles.dayCellSelected : null,
                          isToday && !isSelected ? styles.dayCellToday : null,
                        ]}
                        disabled={isPast || saving}
                        onPress={() => handleSelectDay(day)}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            isPast ? styles.dayTextDisabled : null,
                            isToday && !isSelected ? styles.dayTextToday : null,
                            isSelected ? styles.dayTextSelected : null,
                          ]}
                        >
                          {day}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Time Selection */}
                <View style={styles.timeSection}>
                  <View style={styles.timeHeaderRow}>
                    <Text style={styles.timeSectionTitle}>Select Time</Text>
                    <View style={styles.stepperRow}>
                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => adjustMinutes(-30)}
                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      >
                        <Text style={styles.stepperBtnText}>-30m</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => adjustMinutes(30)}
                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      >
                        <Text style={styles.stepperBtnText}>+30m</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.timeScroll}
                  >
                    <View style={styles.timeChipsRow}>
                      {TIME_OPTIONS.map((opt, i) => {
                        const isTimeSelected =
                          selectedDate.getHours() === opt.hour &&
                          selectedDate.getMinutes() === opt.minute;
                        return (
                          <TouchableOpacity
                            key={i}
                            style={[
                              styles.timeChip,
                              isTimeSelected ? styles.timeChipSelected : null,
                            ]}
                            disabled={saving}
                            onPress={() => handleSelectTime(opt.hour, opt.minute)}
                          >
                            <Text
                              style={[
                                styles.timeChipText,
                                isTimeSelected ? styles.timeChipTextSelected : null,
                              ]}
                            >
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>

                {/* Selected Date Summary Banner */}
                <View style={styles.summaryBanner}>
                  <Ionicons name="time" size={16} color={colors.indigo} />
                  <Text style={styles.summaryBannerText}>
                    {selectedDate.toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}{' '}
                    at{' '}
                    {selectedDate.toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>

                {/* Save CTA Button */}
                <TouchableOpacity
                  style={[styles.saveBtn, saving ? styles.disabledBtn : null]}
                  disabled={saving}
                  onPress={() => runSave(selectedDate.toISOString())}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                      <Text style={styles.saveBtnText}>Save Follow-up</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {saving && tab === 'presets' ? (
            <ActivityIndicator style={{ marginTop: 12 }} color={colors.indigo} />
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(24, 24, 27, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '90%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  closeIconBtn: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: colors.bg,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 3,
    marginBottom: 14,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 9,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  segmentBtnTextActive: {
    color: colors.indigo,
    fontWeight: '700',
  },
  scroll: {
    maxHeight: 460,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  presetsList: {
    gap: 8,
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  customTriggerRow: {
    backgroundColor: '#F5F7FF',
    borderColor: '#C7D2FE',
  },
  clearRow: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  presetIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  presetSublabel: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  clearLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.rose,
  },
  clearSublabel: {
    fontSize: 11,
    color: '#FB7185',
    marginTop: 2,
  },
  calendarContainer: {
    gap: 10,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  monthTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  monthNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavBtnDisabled: {
    opacity: 0.4,
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  weekdayText: {
    width: 36,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    rowGap: 4,
  },
  dayCell: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderColor: colors.indigo,
  },
  dayCellSelected: {
    backgroundColor: colors.indigo,
  },
  dayText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  dayTextDisabled: {
    color: '#D4D4D8',
  },
  dayTextToday: {
    color: colors.indigo,
    fontWeight: '800',
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  timeSection: {
    marginTop: 6,
    gap: 6,
  },
  timeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.slate,
  },
  stepperRow: {
    flexDirection: 'row',
    gap: 6,
  },
  stepperBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  stepperBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.slate,
  },
  timeScroll: {
    flexGrow: 0,
  },
  timeChipsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  timeChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  timeChipSelected: {
    backgroundColor: '#EEF2FF',
    borderColor: colors.indigo,
  },
  timeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.slate,
  },
  timeChipTextSelected: {
    color: colors.indigo,
    fontWeight: '700',
  },
  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginTop: 4,
  },
  summaryBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.indigo,
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 6,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

