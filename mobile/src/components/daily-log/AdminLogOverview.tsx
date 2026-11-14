import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { getCachedMatrix, setCachedMatrix } from '../../lib/attendanceCache';
import { getCachedSnapshot, setCachedSnapshot } from '../../lib/dailyLogCache';
import {
  LiveAttendanceRow,
  LiveShift,
  LogSnapshot,
  OverviewRange,
  PersonStatus,
  SnapshotDepartment,
  SnapshotException,
  SnapshotPerson,
  addDays,
  coveragePercent,
  exceptionDetail,
  exceptionInWindow,
  exceptionReviewLabel,
  formatHours,
  formatSignedHours,
  isMissingLog,
  liveShiftFromMatrix,
  mondayOf,
  monthBounds,
  personStatus,
  shiftMonth,
  snapshotSearch,
  todayIso,
} from '../../lib/logOverview';
import { useTheme } from '../../theme';
import { Avatar } from '../../ui/Avatar';
import { DateField } from '../../ui/DateTimeField';
import { SkeletonBlock } from '../../ui/Skeleton';
import { formatDisplayDate } from '../../ui/format';

function liveMapFromMatrix(matrix: unknown): Record<string, { shift: LiveShift; checkIn: string }> {
  const rows = ((matrix as { rows?: LiveAttendanceRow[] } | null)?.rows || []);
  const map: Record<string, { shift: LiveShift; checkIn: string }> = {};
  for (const row of rows) {
    const id = String(row?.user_id || '');
    const shift = liveShiftFromMatrix(row);
    if (!id || !shift) continue;
    map[id] = { shift, checkIn: String(row.check_in || row.punch_in || '').trim() };
  }
  return map;
}

const RANGES: { key: OverviewRange; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'range', label: 'Range' },
];

const STATUS_LABEL: Record<PersonStatus, string> = {
  logged: 'Logged',
  missing: 'Missing log',
  in_shift: 'In shift',
  awaiting: 'Awaiting check-in',
  on_leave: 'On leave',
  not_started: 'Not started',
};

function OverviewSkeleton() {
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.kpiGrid}>
        {[0, 1].map((row) => (
          <View key={row} style={styles.kpiRow}>
            {[0, 1].map((col) => (
              <View key={col} style={styles.kpiCell}>
                <SkeletonBlock width="46%" height={10} radius={4} />
                <SkeletonBlock width="70%" height={18} radius={5} style={{ marginTop: 10 }} />
              </View>
            ))}
          </View>
        ))}
      </View>
      <View style={styles.card}>
        <SkeletonBlock width="40%" height={12} />
        <SkeletonBlock height={10} radius={999} style={{ marginTop: 14 }} />
        <SkeletonBlock height={10} radius={999} style={{ marginTop: 10 }} />
      </View>
      <View style={styles.card}>
        {Array.from({ length: 4 }).map((_, index) => (
          <View key={index} style={styles.personRow}>
            <SkeletonBlock width={36} height={36} radius={18} />
            <View style={{ flex: 1, marginLeft: 10, gap: 8 }}>
              <SkeletonBlock width="55%" height={12} />
              <SkeletonBlock width="36%" height={10} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function AdminLogOverview({
  reloadToken,
  onSettled,
  onOpenPerson,
}: {
  reloadToken: number;
  onSettled: () => void;
  onOpenPerson: (userId: string, name: string, date: string) => void;
}) {
  const theme = useTheme();
  const today = todayIso();
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;
  const [mode, setMode] = useState<OverviewRange>('today');
  const [anchor, setAnchor] = useState(today);
  const [rangeStart, setRangeStart] = useState(addDays(today, -6));
  const [rangeEnd, setRangeEnd] = useState(today);
  const [department, setDepartment] = useState('all');
  const [employeeId, setEmployeeId] = useState('');
  const [picker, setPicker] = useState<'department' | 'employee' | null>(null);
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [snapshot, setSnapshot] = useState<LogSnapshot | null>(null);
  const [inbox, setInbox] = useState<SnapshotException[]>([]);
  const [liveByUser, setLiveByUser] = useState<Record<string, { shift: LiveShift; checkIn: string }>>({});
  const [loading, setLoading] = useState(true);
  const [loadedQuery, setLoadedQuery] = useState('');
  const [error, setError] = useState('');

  const query = useMemo(() => {
    const monday = mondayOf(anchor);
    const month = monthBounds(anchor, today);
    return snapshotSearch({
      mode,
      anchor: mode === 'week' ? monday : anchor,
      start: mode === 'month' ? month.start : rangeStart,
      end: mode === 'month' ? month.end : rangeEnd,
      today,
    });
  }, [mode, anchor, rangeStart, rangeEnd, today]);

  const windowBounds = useMemo(() => {
    if (mode === 'today') {
      const date = anchor > today ? today : anchor;
      return { start: date, end: date };
    }
    if (mode === 'week') {
      const start = mondayOf(anchor);
      const saturday = addDays(start, 5);
      return { start, end: saturday > today ? today : saturday };
    }
    if (mode === 'month') return monthBounds(anchor, today);
    let start = rangeStart;
    let end = rangeEnd;
    if (start > today) start = today;
    if (end > today) end = today;
    if (start > end) return { start: end, end: start };
    return { start, end };
  }, [mode, anchor, rangeStart, rangeEnd, today]);

  const includesLiveToday = windowBounds.start <= today && today <= windowBounds.end;

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedSnapshot<LogSnapshot>(query);
    const cachedInbox = getCachedSnapshot<SnapshotException[]>(`inbox|${query}`);
    const cachedMatrix = includesLiveToday ? getCachedMatrix(today) : undefined;
    if (cached) {
      setSnapshot(cached.data);
      setInbox(cachedInbox?.data || []);
      if (cachedMatrix) setLiveByUser(liveMapFromMatrix(cachedMatrix.data.matrix));
      setLoadedQuery(query);
      setLoading(false);
      setError('');
    } else {
      setLoading(true);
      setLoadedQuery('');
    }

    (async () => {
      try {
        const inboxPath =
          mode === 'today'
            ? `/log-exceptions/inbox?date=${windowBounds.end}`
            : '/log-exceptions/inbox';
        const matrixPath = includesLiveToday ? '/attendance/matrix' : '';
        const [data, inboxRows, matrixRes] = await Promise.all([
          api<LogSnapshot>(`/log-exceptions/snapshot${query}`),
          api<SnapshotException[]>(inboxPath).catch(() => [] as SnapshotException[]),
          matrixPath
            ? api<{ rows?: LiveAttendanceRow[] }>(matrixPath).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setCachedSnapshot(query, data);
        setCachedSnapshot(`inbox|${query}`, inboxRows);
        if (matrixRes) setCachedMatrix(today, matrixRes, 0);
        setSnapshot(data);
        setInbox(Array.isArray(inboxRows) ? inboxRows : []);
        setLiveByUser(matrixRes ? liveMapFromMatrix(matrixRes) : includesLiveToday ? liveMapFromMatrix(cachedMatrix?.data.matrix) : {});
        setLoadedQuery(query);
        setError('');
      } catch (err: any) {
        if (cancelled) return;
        if (!cached) {
          setSnapshot(null);
          setInbox([]);
          setError(err?.message || 'Could not load overview');
        }
        setLoadedQuery(query);
      } finally {
        if (!cancelled) {
          setLoading(false);
          settledRef.current();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [query, reloadToken, mode, windowBounds.end, includesLiveToday, today]);

  const periodEnded = useMemo(() => {
    const end = snapshot?.end_date || anchor;
    return end < today;
  }, [snapshot?.end_date, anchor, today]);

  const departments = snapshot?.departments || [];
  const people = snapshot?.people || [];

  const filteredPeople = useMemo(() => {
    return people
      .filter((person) => {
        if (department !== 'all' && String(person.department || '') !== department) return false;
        if (employeeId && person.user_id !== employeeId) return false;
        return true;
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [people, department, employeeId]);

  const includesToday = windowBounds.start <= today && today <= (snapshot?.end_date || windowBounds.end);
  const statusFor = (person: SnapshotPerson) =>
    personStatus(person, {
      periodEnded,
      includesToday,
      live: includesLiveToday ? liveByUser[person.user_id]?.shift ?? null : null,
    });

  const exceptions = useMemo(() => {
    const seen = new Set<string>();
    const rows = [...inbox, ...(snapshot?.top_exceptions || [])];
    return rows.filter((item) => {
      if (!exceptionInWindow(item, windowBounds.start, windowBounds.end, today)) return false;
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      if (department !== 'all' && String(item.department || '') !== department) return false;
      if (employeeId && item.user_id !== employeeId) return false;
      return true;
    });
  }, [inbox, snapshot?.top_exceptions, windowBounds.start, windowBounds.end, today, department, employeeId]);

  const selectedDepartment: SnapshotDepartment | undefined =
    department === 'all' ? undefined : departments.find((dept) => dept.name === department);
  const selectedPerson: SnapshotPerson | undefined = employeeId
    ? people.find((person) => person.user_id === employeeId)
    : undefined;

  const worked = selectedPerson
    ? selectedPerson.worked_hours
    : selectedDepartment
      ? selectedDepartment.worked_hours
      : snapshot?.worked_hours || 0;
  const logged = selectedPerson
    ? selectedPerson.logged_hours
    : selectedDepartment
      ? selectedDepartment.logged_hours
      : snapshot?.logged_hours || 0;
  const submitted = selectedPerson
    ? selectedPerson.logged
      ? 1
      : 0
    : selectedDepartment
      ? selectedDepartment.logged
      : snapshot?.logs_submitted || 0;
  const expected = selectedPerson ? 1 : selectedDepartment ? selectedDepartment.total : snapshot?.employees_expected || 0;
  const exceptionTotal = exceptions.length;
  const gap = logged - worked;
  const barMax = Math.max(worked, logged, 0.01);
  const coverage = coveragePercent(logged, worked);

  const periodLabel = useMemo(() => {
    if (mode === 'today') return formatDisplayDate(anchor > today ? today : anchor);
    if (mode === 'week') {
      const start = mondayOf(anchor);
      return `${formatDisplayDate(start)} – ${formatDisplayDate(addDays(start, 5))}`;
    }
    if (mode === 'month') {
      const bounds = monthBounds(anchor, today);
      return `${formatDisplayDate(bounds.start)} – ${formatDisplayDate(bounds.end)}`;
    }
    return `${formatDisplayDate(rangeStart)} – ${formatDisplayDate(rangeEnd)}`;
  }, [mode, anchor, today, rangeStart, rangeEnd]);

  const canGoForward = useMemo(() => {
    if (mode === 'today') return anchor < today;
    if (mode === 'week') return mondayOf(anchor) < mondayOf(today);
    if (mode === 'month') return anchor.slice(0, 7) < today.slice(0, 7);
    return false;
  }, [mode, anchor, today]);

  const shiftPeriod = (delta: number) => {
    if (delta > 0 && !canGoForward) return;
    if (mode === 'today') setAnchor(addDays(anchor, delta));
    else if (mode === 'week') setAnchor(addDays(mondayOf(anchor), delta * 7));
    else if (mode === 'month') setAnchor(shiftMonth(anchor, delta));
  };

  const employeeName =
    people.find((person) => person.user_id === employeeId)?.full_name || 'All employees';
  const departmentName = department === 'all' ? 'All departments' : department;
  const pickerPeople = people.filter((person) => {
    if (department !== 'all' && String(person.department || '') !== department) return false;
    const q = employeeQuery.trim().toLowerCase();
    if (!q) return true;
    return `${person.full_name} ${person.department || ''}`.toLowerCase().includes(q);
  });

  const openDay = windowBounds.end;

  return (
    <View style={styles.wrap}>
      <View style={[styles.segment, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {RANGES.map((option) => {
          const active = mode === option.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => setMode(option.key)}
              style={[styles.segmentBtn, active && { backgroundColor: theme.primary }]}
            >
              <Text style={[styles.segmentText, { color: active ? '#fff' : theme.textMuted }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'range' ? (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.rangeFields}>
            <View style={{ flex: 1 }}>
              <DateField
                label="From"
                value={rangeStart}
                onChange={(value) => {
                  const next = value > today ? today : value;
                  if (next > rangeEnd) {
                    setRangeStart(rangeEnd);
                    setRangeEnd(next);
                  } else {
                    setRangeStart(next);
                  }
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <DateField
                label="To"
                value={rangeEnd}
                onChange={(value) => {
                  const next = value > today ? today : value;
                  if (next < rangeStart) {
                    setRangeEnd(rangeStart);
                    setRangeStart(next);
                  } else {
                    setRangeEnd(next);
                  }
                }}
              />
            </View>
          </View>
        </View>
      ) : (
        <View style={[styles.navCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Pressable onPress={() => shiftPeriod(-1)} hitSlop={8} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={18} color={theme.text} />
          </Pressable>
          <Text style={[styles.navLabel, { color: theme.text }]} numberOfLines={1}>
            {periodLabel}
          </Text>
          <Pressable onPress={() => shiftPeriod(1)} hitSlop={8} style={styles.navBtn} disabled={!canGoForward}>
            <Ionicons name="chevron-forward" size={18} color={canGoForward ? theme.text : theme.textSubtle} />
          </Pressable>
        </View>
      )}

      <View style={styles.filterRow}>
        <Pressable
          style={[styles.filterBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() => setPicker('department')}
        >
          <Ionicons name="layers-outline" size={15} color={theme.primary} />
          <Text style={[styles.filterText, { color: theme.text }]} numberOfLines={1}>
            {departmentName}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.filterBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() => {
            setEmployeeQuery('');
            setPicker('employee');
          }}
        >
          <Ionicons name="person-outline" size={15} color={theme.primary} />
          <Text style={[styles.filterText, { color: theme.text }]} numberOfLines={1}>
            {employeeName}
          </Text>
        </Pressable>
      </View>

      {loading && loadedQuery !== query ? (
        <OverviewSkeleton />
      ) : error && !snapshot ? (
        <View style={[styles.card, styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="alert-circle-outline" size={28} color={theme.rose} />
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>{error}</Text>
        </View>
      ) : (
        <>
          <Text style={[styles.summary, { color: theme.textMuted }]}>
            {selectedPerson || selectedDepartment
              ? `${submitted} of ${expected} logged in this filter`
              : snapshot?.summary || `${submitted} of ${expected} logged`}
          </Text>
          <Text style={[styles.summaryStrong, { color: theme.text }]}>
            {formatHours(worked)} at work vs {formatHours(logged)} in the log
          </Text>

          <View style={styles.kpiGrid}>
            <View style={styles.kpiRow}>
              <Kpi label="At work" value={formatHours(worked)} color={theme.emerald} theme={theme} />
              <Kpi label="Logged" value={formatHours(logged)} color={theme.primary} theme={theme} />
            </View>
            <View style={styles.kpiRow}>
              <Kpi label="Gap" value={formatSignedHours(gap)} color={Math.abs(gap) < 0.5 ? theme.emerald : theme.rose} theme={theme} />
              <Kpi label="Exceptions" value={String(exceptionTotal)} color={exceptionTotal > 0 ? theme.amber : theme.emerald} theme={theme} />
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.cardHead}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Logged vs worked</Text>
              <Text style={[styles.cardMeta, { color: theme.textMuted }]}>{coverage}% logged</Text>
            </View>
            <Bar label="Worked" value={formatHours(worked)} width={(worked / barMax) * 100} color={theme.emerald} track={theme.bgSubtle} muted={theme.textMuted} />
            <Bar label="Logged" value={formatHours(logged)} width={(logged / barMax) * 100} color={theme.primary} track={theme.bgSubtle} muted={theme.textMuted} />
            <Text style={[styles.footnote, { color: theme.textSubtle }]}>
              {submitted} of {expected} people logged
              {snapshot?.compliance_pct != null && !selectedPerson && !selectedDepartment
                ? ` · ${snapshot.compliance_pct}% compliance`
                : ''}
            </Text>
          </View>

          {departments.length > 0 && !selectedPerson ? (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Department hours</Text>
              <Text style={[styles.footnote, { color: theme.textSubtle, marginTop: -4 }]}>
                Worked time, logged time, and who still owes a log
              </Text>
              {(selectedDepartment ? [selectedDepartment] : [...departments].sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name))).map((dept) => {
                const deptGap = dept.logged_hours - dept.worked_hours;
                const members = people.filter((person) => String(person.department || '') === dept.name);
                const missingLogs = members.filter((person) => statusFor(person) === 'missing').length;
                const inShift = members.filter((person) => statusFor(person) === 'in_shift').length;
                const awaiting = members.filter((person) => statusFor(person) === 'awaiting').length;
                return (
                  <View key={dept.name} style={[styles.deptBlock, { borderTopColor: theme.borderSubtle }]}>
                    <View style={styles.cardHead}>
                      <Text style={[styles.personName, { color: theme.text, flex: 1 }]}>{dept.name}</Text>
                      <Text style={[styles.cardMeta, { color: missingLogs > 0 ? theme.rose : theme.textMuted }]}>
                        {dept.logged}/{dept.total} logged
                      </Text>
                    </View>
                    <Text style={[styles.personMeta, { color: theme.textMuted }]}>
                      At work {formatHours(dept.worked_hours)} · Logged {formatHours(dept.logged_hours)} · Gap {formatSignedHours(deptGap)}
                    </Text>
                    <Text style={[styles.personMeta, { color: missingLogs > 0 ? theme.rose : theme.textMuted }]}>
                      {[
                        missingLogs > 0 ? `${missingLogs} missing a log` : '',
                        inShift > 0 ? `${inShift} in shift` : '',
                        awaiting > 0 ? `${awaiting} awaiting check-in` : '',
                        missingLogs === 0 && inShift === 0 && awaiting === 0 ? 'Everyone logged' : '',
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.cardHead}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Exceptions</Text>
              <Text style={[styles.cardMeta, { color: theme.textMuted }]}>{exceptionTotal}</Text>
            </View>
            {(snapshot?.end_date || '') > today ? (
              <Text style={[styles.footnote, { color: theme.textSubtle, marginTop: -4 }]}>
                Only days through today. Later days in this range are not exceptions yet.
              </Text>
            ) : null}
            {exceptions.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                No open exceptions for this period.
              </Text>
            ) : (
              exceptions.map((item) => (
                <ExceptionRow
                  key={item.id}
                  item={item}
                  theme={theme}
                  onPress={() => onOpenPerson(item.user_id, item.full_name, item.date || openDay)}
                />
              ))
            )}
          </View>

          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.cardHead}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>People</Text>
              <Text style={[styles.cardMeta, { color: theme.textMuted }]}>{filteredPeople.length}</Text>
            </View>
            {filteredPeople.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>No one matches these filters.</Text>
            ) : (
              filteredPeople.map((person) => {
                const status = statusFor(person);
                const punchedIn = liveByUser[person.user_id]?.checkIn;
                const personGap = (person.signed_gap_hours ?? person.logged_hours - person.worked_hours) || 0;
                return (
                  <Pressable
                    key={person.user_id}
                    style={[styles.personRow, { borderTopColor: theme.borderSubtle }]}
                    onPress={() => onOpenPerson(person.user_id, person.full_name, openDay)}
                  >
                    <Avatar name={person.full_name} size={36} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <View style={styles.cardHead}>
                        <Text style={[styles.personName, { color: theme.text, flex: 1 }]} numberOfLines={1}>
                          {person.full_name}
                        </Text>
                        <StatusPill status={status} theme={theme} />
                      </View>
                      <Text style={[styles.personMeta, { color: theme.textMuted }]}>
                        {person.department || 'Unassigned'}
                      </Text>
                      <Text style={[styles.personMeta, { color: theme.textMuted }]}>
                        {status === 'in_shift'
                          ? `In shift${punchedIn ? ` · in at ${punchedIn}` : ''} · Logged ${formatHours(person.logged_hours)}`
                          : `At work ${formatHours(person.worked_hours)} · Logged ${formatHours(person.logged_hours)}${person.has_checkout || periodEnded ? ` · Gap ${formatSignedHours(personGap)}` : ''}`}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        </>
      )}

      <Modal visible={picker != null} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.overlay} onPress={() => setPicker(null)} />
        <View style={[styles.sheet, { backgroundColor: theme.card }]}>
          <View style={styles.sheetHead}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              {picker === 'department' ? 'Department' : 'Employee'}
            </Text>
            <Pressable onPress={() => setPicker(null)}>
              <Text style={{ color: theme.primary, fontWeight: '700' }}>Close</Text>
            </Pressable>
          </View>
          {picker === 'employee' ? (
            <TextInput
              value={employeeQuery}
              onChangeText={setEmployeeQuery}
              placeholder="Search employee"
              placeholderTextColor={theme.textSubtle}
              style={[styles.search, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgSubtle }]}
            />
          ) : null}
          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
            {picker === 'department' ? (
              <>
                <PickerRow
                  label="All departments"
                  active={department === 'all'}
                  onPress={() => {
                    setDepartment('all');
                    setEmployeeId('');
                    setPicker(null);
                  }}
                  theme={theme}
                />
                {departments.map((dept) => (
                  <PickerRow
                    key={dept.name}
                    label={dept.name}
                    meta={`${dept.logged}/${dept.total} logged`}
                    active={department === dept.name}
                    onPress={() => {
                      setDepartment(dept.name);
                      setEmployeeId('');
                      setPicker(null);
                    }}
                    theme={theme}
                  />
                ))}
              </>
            ) : (
              <>
                <PickerRow
                  label="All employees"
                  active={!employeeId}
                  onPress={() => {
                    setEmployeeId('');
                    setPicker(null);
                  }}
                  theme={theme}
                />
                {pickerPeople.map((person) => (
                  <PickerRow
                    key={person.user_id}
                    label={person.full_name}
                    meta={person.department || 'Unassigned'}
                    active={employeeId === person.user_id}
                    onPress={() => {
                      setEmployeeId(person.user_id);
                      setPicker(null);
                    }}
                    theme={theme}
                  />
                ))}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function Kpi({
  label,
  value,
  color,
  theme,
}: {
  label: string;
  value: string;
  color: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={[styles.kpiCell, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.kpiLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.kpiValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Bar({
  label,
  value,
  width,
  color,
  track,
  muted,
}: {
  label: string;
  value: string;
  width: number;
  color: string;
  track: string;
  muted: string;
}) {
  return (
    <View style={styles.barBlock}>
      <View style={styles.barLabels}>
        <Text style={[styles.barLabel, { color: muted }]}>{label}</Text>
        <Text style={[styles.barLabel, { color: muted }]}>{value}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: track }]}>
        <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, width))}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function ExceptionRow({
  item,
  theme,
  onPress,
}: {
  item: SnapshotException;
  theme: ReturnType<typeof useTheme>;
  onPress: () => void;
}) {
  const missing = isMissingLog(item);
  const detail = exceptionDetail(item);
  const detailColor = item.compare_ready === false ? theme.textMuted : missing || (item.signed_gap_hours || 0) < 0 ? theme.rose : theme.emerald;
  return (
    <Pressable onPress={onPress} style={[styles.exceptionRow, { borderTopColor: theme.borderSubtle }]}>
      <View style={{ flex: 1 }}>
        <View style={styles.cardHead}>
          <Text style={[styles.personName, { color: theme.text, flex: 1 }]} numberOfLines={1}>
            {item.full_name}
          </Text>
          <Text style={[styles.cardMeta, { color: theme.textMuted }]}>{formatDisplayDate(item.date)}</Text>
        </View>
        <Text style={[styles.personMeta, { color: theme.textMuted }]}>
          {item.department || 'General'} · {missing ? 'Missing log' : 'Hour discrepancy'}
        </Text>
        {item.message ? (
          <Text style={[styles.personMeta, { color: theme.text }]} numberOfLines={2}>
            {item.message}
          </Text>
        ) : null}
        <View style={[styles.cardHead, { marginTop: 4 }]}>
          <Text style={[styles.pillText, { color: theme.primary }]}>{exceptionReviewLabel(item)}</Text>
          <Text style={[styles.gapText, { color: detailColor }]}>{detail}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function StatusPill({ status, theme }: { status: PersonStatus; theme: ReturnType<typeof useTheme> }) {
  const tone =
    status === 'logged'
      ? { bg: theme.emeraldLight, fg: theme.emerald }
      : status === 'missing'
        ? { bg: theme.roseLight, fg: theme.rose }
        : status === 'in_shift'
          ? { bg: theme.primaryLight, fg: theme.primary }
          : status === 'awaiting'
            ? { bg: theme.amberLight, fg: theme.amber }
            : status === 'on_leave'
            ? { bg: theme.amberLight, fg: theme.amber }
            : { bg: theme.bgSubtle, fg: theme.textMuted };
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.pillText, { color: tone.fg }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

function PickerRow({
  label,
  meta,
  active,
  onPress,
  theme,
}: {
  label: string;
  meta?: string;
  active: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.pickerRow, { borderBottomColor: theme.borderSubtle }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.personName, { color: theme.text }]}>{label}</Text>
        {meta ? <Text style={[styles.personMeta, { color: theme.textMuted }]}>{meta}</Text> : null}
      </View>
      {active ? <Ionicons name="checkmark" size={18} color={theme.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 4, gap: 4 },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  segmentText: { fontSize: 13, fontWeight: '700' },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 6,
    paddingVertical: 8,
    gap: 4,
  },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navLabel: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '700' },
  filterRow: { flexDirection: 'row', gap: 10 },
  filterBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  filterText: { flex: 1, fontSize: 13, fontWeight: '600' },
  summary: { fontSize: 13, lineHeight: 18 },
  summaryStrong: { fontSize: 15, fontWeight: '700', marginTop: -6 },
  kpiGrid: { gap: 10 },
  kpiRow: { flexDirection: 'row', gap: 10 },
  kpiCell: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 74,
    justifyContent: 'space-between',
  },
  kpiLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  kpiValue: { fontSize: 20, fontWeight: '800', marginTop: 6 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  cardMeta: { fontSize: 12, fontWeight: '700' },
  barBlock: { gap: 6 },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  barLabel: { fontSize: 12, fontWeight: '600' },
  track: { flex: 1, height: 8, borderRadius: 999, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 999 },
  footnote: { fontSize: 11, marginTop: 2 },
  deptBlock: { gap: 2, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  personName: { fontSize: 14, fontWeight: '700' },
  personMeta: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  exceptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  gapText: { fontSize: 12, fontWeight: '800' },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 },
  pillText: { fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 22 },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  rangeFields: { flexDirection: 'row', gap: 10 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: 28 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  search: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, fontSize: 14 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
});
