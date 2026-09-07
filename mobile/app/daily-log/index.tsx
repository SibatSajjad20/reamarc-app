import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api } from '../../src/lib/api';
import {
  DailyLogEntry,
  DateLogGroup,
  PersonLogGroup,
  buildEntriesQuery,
  enumerateDatesInclusive,
  formatHoursShort,
  getMondayIso,
  getMonSatWeekBounds,
  getMonSatWeekDisplayBounds,
  groupEntriesByDate,
  groupEntriesByPerson,
  parseHours,
  parseWorkHoursValue,
  shiftWeekMonday,
  taskStatusTone,
} from '../../src/lib/dailyLog';
import {
  getCachedEmployees,
  getCachedEntries,
  getCachedWorked,
  isCacheStale,
  makeEntriesCacheKey,
  setCachedEmployees,
  setCachedEntries,
  setCachedWorked,
} from '../../src/lib/dailyLogCache';
import { colors } from '../../src/theme';
import { Avatar } from '../../src/ui/Avatar';
import { DateField } from '../../src/ui/DateTimeField';
import { DailyLogListSkeleton } from '../../src/ui/Skeleton';
import { TruckLoader } from '../../src/ui/TruckLoader';
import { formatDisplayDate, prettyRole } from '../../src/ui/format';

const SETTLE_MS = 400;

function parseDate(iso: string) {
  if (!iso) return new Date();
  const parts = iso.split('-').map(Number);
  if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  }
  return new Date();
}

function toIsoDate(d: Date = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayIso() {
  return toIsoDate(new Date());
}

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'Completed', label: 'Completed' },
  { key: 'Incomplete', label: 'Incomplete' },
  { key: 'Blocker', label: 'Blocker' },
] as const;

type RangeMode = 'day' | 'week' | 'custom';

type EmployeeOption = {
  id: string;
  full_name: string;
  department?: string | null;
  role?: string;
  is_active?: boolean;
};

type MatrixRow = {
  user_id: string;
  employee_name?: string;
  work_hours?: string | number | null;
};

type MatrixResponse = {
  rows?: MatrixRow[];
};

const LOGGER_ROLES = new Set(['team_member', 'team_lead', 'hr', 'member']);

function normalizeCustomRange(start: string, end: string): { start: string; end: string } {
  const today = todayIso();
  let s = start || today;
  let e = end || today;
  if (s > today) s = today;
  if (e > today) e = today;
  if (s > e) {
    const tmp = s;
    s = e;
    e = tmp;
  }
  return { start: s, end: e };
}

function TaskRows({
  entries,
  fallbackDate,
  onOpen,
}: {
  entries: DailyLogEntry[];
  fallbackDate: string;
  onOpen: (entry: DailyLogEntry) => void;
}) {
  return (
    <>
      {entries.map((entry) => {
        const tone = taskStatusTone(entry.task_status);
        return (
          <Pressable
            key={entry.id}
            style={styles.taskRow}
            onPress={() => onOpen(entry)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.taskTitle} numberOfLines={2}>
                {entry.task_description || 'Untitled task'}
              </Text>
              <Text style={styles.taskProject} numberOfLines={1}>
                {entry.client_project || 'No project'}
                {entry.task_type ? ` · ${entry.task_type}` : ''}
                {entry.date && entry.date !== fallbackDate ? ` · ${formatDisplayDate(entry.date)}` : ''}
              </Text>
            </View>
            <View style={styles.taskRightMeta}>
              <View style={[styles.statusBadge, { backgroundColor: tone.bg }]}>
                <Text style={[styles.statusText, { color: tone.fg }]}>{tone.label}</Text>
              </View>
              <Text style={styles.taskHours}>{formatHoursShort(entry.hours_utilized)}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </View>
          </Pressable>
        );
      })}
    </>
  );
}

export default function DailyLogListScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; userId?: string; name?: string }>();

  const initialDate =
    typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : todayIso();
  const initialUserId =
    typeof params.userId === 'string' && params.userId ? params.userId : '';
  const initialName = typeof params.name === 'string' && params.name ? params.name : '';
  const initialCached = getCachedEntries(initialDate, initialDate, initialUserId, initialName);
  const initialEmployees = getCachedEmployees();

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [userIdFilter, setUserIdFilter] = useState(initialUserId);
  const [personName, setPersonName] = useState(initialName);
  const [rangeMode, setRangeMode] = useState<RangeMode>('day');
  const [customStart, setCustomStart] = useState(initialDate);
  const [customEnd, setCustomEnd] = useState(initialDate);
  const [entries, setEntries] = useState<DailyLogEntry[]>(() => initialCached?.data ?? []);
  const [coldStart, setColdStart] = useState(() => !initialCached);
  const [showListSkeleton, setShowListSkeleton] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [draftDate, setDraftDate] = useState<Date>(parseDate(initialDate));
  const [error, setError] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [employees, setEmployees] = useState<EmployeeOption[]>(() => initialEmployees?.data ?? []);
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);
  const [workedHours, setWorkedHours] = useState(0);
  const [workedByDate, setWorkedByDate] = useState<Record<string, number>>({});
  const [workedLoading, setWorkedLoading] = useState(false);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workedDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchKeyRef = useRef('');
  const reqIdRef = useRef(0);
  const workedReqIdRef = useRef(0);
  const hasSettledOnce = useRef(false);
  const hasWorkedSettledOnce = useRef(false);
  const didBlurRef = useRef(false);
  const expandedForKeyRef = useRef('');
  const isToday = selectedDate === todayIso();
  const isPersonView = Boolean(userIdFilter || personName);
  const currentWeekMonday = getMondayIso(todayIso());

  const weekDisplay = useMemo(
    () => getMonSatWeekDisplayBounds(selectedDate),
    [selectedDate],
  );

  const rangeBounds = useMemo(() => {
    if (!isPersonView) return { start: selectedDate, end: selectedDate };
    if (rangeMode === 'week') return getMonSatWeekBounds(selectedDate, todayIso());
    if (rangeMode === 'custom') return normalizeCustomRange(customStart, customEnd);
    return { start: selectedDate, end: selectedDate };
  }, [isPersonView, rangeMode, selectedDate, customStart, customEnd]);

  const rangeBoundsRef = useRef(rangeBounds);
  const personFilterRef = useRef({ userIdFilter, personName });
  rangeBoundsRef.current = rangeBounds;
  personFilterRef.current = { userIdFilter, personName };

  const canGoNextWeek = getMondayIso(selectedDate) < currentWeekMonday;
  const usesDateGroups = isPersonView && (rangeMode === 'week' || rangeMode === 'custom');

  const executeFetch = useCallback(
    async (
      startDate: string,
      endDate: string,
      userId: string,
      resourceName: string,
      opts: { force?: boolean; soft?: boolean } = {},
    ) => {
      const { force = false, soft = false } = opts;
      const key = makeEntriesCacheKey(startDate, endDate, userId, resourceName);
      const cached = getCachedEntries(startDate, endDate, userId, resourceName);
      const today = todayIso();
      const stale = isCacheStale(cached, startDate, endDate, today);

      if (cached && !force) {
        setEntries(cached.data);
        setShowListSkeleton(false);
        setColdStart(false);
        setError('');
        if (!stale) {
          if (!soft) {
            setRefreshing(false);
          }
          return;
        }
        // Stale (includes today): keep list visible and revalidate in background.
      } else if (!cached && !soft) {
        setShowListSkeleton(true);
        setEntries([]);
      }

      const reqId = ++reqIdRef.current;
      fetchKeyRef.current = key;
      if (!soft) setError('');

      try {
        const query = buildEntriesQuery({
          startDate,
          endDate,
          userId: userId || undefined,
          resourceName: !userId && resourceName ? resourceName : undefined,
          limit: 500,
        });
        const data = await api<DailyLogEntry[]>(`/daily-log/entries${query}`);
        if (reqId !== reqIdRef.current || fetchKeyRef.current !== key) return;
        const list = Array.isArray(data) ? data : [];
        setCachedEntries(startDate, endDate, userId, resourceName, list);
        setEntries(list);
        if (expandedForKeyRef.current !== key) {
          setExpandedKeys({});
          expandedForKeyRef.current = key;
        }
        setError('');
      } catch (err: any) {
        if (reqId !== reqIdRef.current || fetchKeyRef.current !== key) return;
        if (!cached) {
          setEntries([]);
          setError(err?.message || 'Failed to load daily logs');
        }
      } finally {
        if (reqId === reqIdRef.current) {
          setColdStart(false);
          setShowListSkeleton(false);
          setRefreshing(false);
        }
      }
    },
    [],
  );

  const loadWorkedHours = useCallback(
    async (startDate: string, endDate: string, userId: string, force = false) => {
      const cached = getCachedWorked(startDate, endDate, userId);
      const today = todayIso();
      if (cached && !force) {
        setWorkedHours(cached.data.total);
        setWorkedByDate(cached.data.byDate);
        setWorkedLoading(false);
        if (!isCacheStale(cached, startDate, endDate, today)) return;
      }

      const dates = enumerateDatesInclusive(startDate, endDate, 31);
      if (dates.length === 0) {
        setWorkedHours(0);
        setWorkedByDate({});
        setWorkedLoading(false);
        return;
      }

      const reqId = ++workedReqIdRef.current;
      if (!cached || force) setWorkedLoading(true);

      try {
        const matrices = await Promise.all(
          dates.map((dateStr) => {
            const query = dateStr === todayIso() ? '' : `?date=${dateStr}`;
            return api<MatrixResponse>(`/attendance/matrix${query}`).catch(() => null);
          }),
        );
        if (reqId !== workedReqIdRef.current) return;
        let total = 0;
        const byDate: Record<string, number> = {};
        dates.forEach((dateStr, index) => {
          let dayTotal = 0;
          for (const row of matrices[index]?.rows || []) {
            if (userId && row.user_id !== userId) continue;
            dayTotal += parseWorkHoursValue(row.work_hours);
          }
          byDate[dateStr] = dayTotal;
          total += dayTotal;
        });
        setCachedWorked(startDate, endDate, userId, { total, byDate });
        setWorkedByDate(byDate);
        setWorkedHours(total);
      } catch {
        if (reqId !== workedReqIdRef.current) return;
        if (!cached) {
          setWorkedHours(0);
          setWorkedByDate({});
        }
      } finally {
        if (reqId === workedReqIdRef.current) setWorkedLoading(false);
      }
    },
    [],
  );

  // Cache-first paint + settle debounce for entries (UI updates immediately; network waits).
  useEffect(() => {
    const { start, end } = rangeBounds;
    const cached = getCachedEntries(start, end, userIdFilter, personName);
    if (cached) {
      setEntries(cached.data);
      setShowListSkeleton(false);
      setColdStart(false);
      setError('');
    } else {
      setShowListSkeleton(true);
      setEntries([]);
    }

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const delay = hasSettledOnce.current ? SETTLE_MS : 0;
    hasSettledOnce.current = true;
    debounceTimer.current = setTimeout(() => {
      void executeFetch(start, end, userIdFilter, personName, { force: false });
    }, delay);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [rangeBounds.start, rangeBounds.end, userIdFilter, personName, executeFetch]);

  // Worked hours: same settle window + session cache.
  useEffect(() => {
    const { start, end } = rangeBounds;
    const cached = getCachedWorked(start, end, userIdFilter);
    if (cached) {
      setWorkedHours(cached.data.total);
      setWorkedByDate(cached.data.byDate);
      setWorkedLoading(false);
    } else {
      setWorkedLoading(true);
    }

    if (workedDebounceTimer.current) clearTimeout(workedDebounceTimer.current);
    const delay = hasWorkedSettledOnce.current ? SETTLE_MS : 0;
    hasWorkedSettledOnce.current = true;
    workedDebounceTimer.current = setTimeout(() => {
      void loadWorkedHours(start, end, userIdFilter, false);
    }, delay);

    return () => {
      if (workedDebounceTimer.current) clearTimeout(workedDebounceTimer.current);
    };
  }, [rangeBounds.start, rangeBounds.end, userIdFilter, loadWorkedHours]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (workedDebounceTimer.current) clearTimeout(workedDebounceTimer.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedEmployees();
    if (cached) setEmployees(cached.data);

    (async () => {
      try {
        const members = await api<EmployeeOption[]>('/admin/users');
        if (cancelled) return;
        const list = (Array.isArray(members) ? members : [])
          .filter((m) => m?.is_active !== false)
          .filter((m) => LOGGER_ROLES.has(String(m.role || '').toLowerCase()))
          .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')));
        setCachedEmployees(list);
        setEmployees(list);
      } catch {
        if (!cancelled && !cached) setEmployees([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Soft revalidate on return from detail — never full-screen reload.
  useFocusEffect(
    useCallback(() => {
      if (!didBlurRef.current) {
        return () => {
          didBlurRef.current = true;
        };
      }
      const { start, end } = rangeBoundsRef.current;
      const { userIdFilter: uid, personName: name } = personFilterRef.current;
      void executeFetch(start, end, uid, name, { soft: true });
      return () => {
        didBlurRef.current = true;
      };
    }, [executeFetch]),
  );

  useEffect(() => {
    const nextDate =
      typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
        ? params.date
        : null;
    const nextUserId = typeof params.userId === 'string' ? params.userId : '';
    const nextName = typeof params.name === 'string' ? params.name : '';

    if (nextDate && nextDate !== selectedDate) {
      setSelectedDate(nextDate);
      setDraftDate(parseDate(nextDate));
    }
    if (nextUserId !== userIdFilter) {
      setUserIdFilter(nextUserId);
    }
    if (nextName !== personName) {
      setPersonName(nextName);
    }
    if (!nextUserId && !nextName) {
      setRangeMode('day');
    }
  }, [params.date, params.userId, params.name]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void executeFetch(rangeBounds.start, rangeBounds.end, userIdFilter, personName, {
      force: true,
    });
    void loadWorkedHours(rangeBounds.start, rangeBounds.end, userIdFilter, true);
  }, [executeFetch, loadWorkedHours, rangeBounds.start, rangeBounds.end, userIdFilter, personName]);

  const handleShiftDay = (delta: number) => {
    const cur = parseDate(selectedDate);
    cur.setDate(cur.getDate() + delta);
    const nextIso = toIsoDate(cur);
    if (delta > 0 && nextIso > todayIso()) return;
    setSelectedDate(nextIso);
  };

  const handleShiftWeek = (weekDelta: number) => {
    const nextMonday = shiftWeekMonday(selectedDate, weekDelta);
    if (weekDelta > 0 && nextMonday > currentWeekMonday) return;
    setSelectedDate(nextMonday);
  };

  const handleSelectDate = (newDate: string) => {
    if (newDate > todayIso()) return;
    if (rangeMode === 'week') {
      setSelectedDate(getMondayIso(newDate));
      return;
    }
    setSelectedDate(newDate);
  };

  const handleCustomStart = (next: string) => {
    const bounds = normalizeCustomRange(next, customEnd);
    setCustomStart(bounds.start);
    setCustomEnd(bounds.end);
  };

  const handleCustomEnd = (next: string) => {
    const bounds = normalizeCustomRange(customStart, next);
    setCustomStart(bounds.start);
    setCustomEnd(bounds.end);
  };

  const clearPersonFilter = () => {
    setUserIdFilter('');
    setPersonName('');
    setRangeMode('day');
    router.setParams({ userId: '', name: '' });
  };

  const openPersonLog = (group: PersonLogGroup) => {
    const nextUserId = group.userId || '';
    const nextName = group.name || '';
    if (!nextUserId && !nextName) return;
    setSearch('');
    setUserIdFilter(nextUserId);
    setPersonName(nextName);
    setRangeMode('day');
    setExpandedKeys({});
    router.setParams({
      userId: nextUserId,
      name: nextName,
      date: selectedDate,
    });
  };

  const selectEmployee = (emp: EmployeeOption | null) => {
    setShowEmployeePicker(false);
    if (!emp) {
      clearPersonFilter();
      return;
    }
    setSearch('');
    setUserIdFilter(emp.id);
    setPersonName(emp.full_name);
    setExpandedKeys({});
    router.setParams({
      userId: emp.id,
      name: emp.full_name,
      date: selectedDate,
    });
  };

  const setRange = (mode: RangeMode) => {
    if (mode === rangeMode) return;
    setRangeMode(mode);
    if (mode === 'week') {
      setSelectedDate(getMondayIso(selectedDate));
      return;
    }
    if (mode === 'custom') {
      const week = getMonSatWeekDisplayBounds(selectedDate);
      const bounds = normalizeCustomRange(week.start, week.end);
      setCustomStart(bounds.start);
      setCustomEnd(bounds.end);
    }
  };

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isExpanded = (key: string, entryCount: number) => {
    if (entryCount <= 1) return true;
    return Boolean(expandedKeys[key]);
  };

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (statusFilter !== 'all' && String(entry.task_status) !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        entry.resource_name,
        entry.department,
        entry.client_project,
        entry.task_description,
        entry.task_type,
        entry.remarks,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [entries, search, statusFilter]);

  const personGroups = useMemo(() => groupEntriesByPerson(filteredEntries), [filteredEntries]);
  const dateGroups = useMemo(() => groupEntriesByDate(filteredEntries), [filteredEntries]);
  const totalHours = useMemo(
    () => filteredEntries.reduce((sum, e) => sum + parseHours(e.hours_utilized), 0),
    [filteredEntries],
  );

  const statusCounts = useMemo(() => {
    let completed = 0;
    let incomplete = 0;
    let blocker = 0;
    for (const entry of filteredEntries) {
      const status = String(entry.task_status || '').toLowerCase();
      if (status === 'completed') completed += 1;
      else if (status === 'incomplete') incomplete += 1;
      else if (status === 'blocker') blocker += 1;
    }
    return { completed, incomplete, blocker };
  }, [filteredEntries]);

  const periodDayCount = useMemo(
    () => enumerateDatesInclusive(rangeBounds.start, rangeBounds.end, 31).length || 1,
    [rangeBounds.start, rangeBounds.end],
  );

  const avgDailyLoggedHours = useMemo(
    () => totalHours / periodDayCount,
    [totalHours, periodDayCount],
  );

  const openTask = (entry: DailyLogEntry) => {
    router.push({
      pathname: '/daily-log/[id]',
      params: {
        id: entry.id,
        date: entry.date || selectedDate,
        userId: entry.user_id || userIdFilter || '',
      },
    });
  };

  const logProgressPct =
    workedHours > 0 ? Math.min(100, Math.round((totalHours / workedHours) * 100)) : totalHours > 0 ? 100 : 0;
  const selectedEmployee =
    employees.find((emp) => emp.id === userIdFilter) ||
    (isPersonView
      ? {
          id: userIdFilter,
          full_name: personName || 'Selected employee',
          department: undefined,
          role: undefined,
        }
      : null);

  if (coldStart && entries.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]} edges={['bottom']}>
        <TruckLoader label="Loading daily logs..." />
      </SafeAreaView>
    );
  }

  const renderExpandFooter = (key: string, count: number) => {
    if (count <= 1) return null;
    const open = isExpanded(key, count);
    return (
      <Pressable style={styles.expandBtn} onPress={() => toggleExpanded(key)}>
        <Text style={styles.expandBtnText}>
          {open ? 'Collapse tasks' : `Expand ${count} tasks`}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.indigo} />
      </Pressable>
    );
  };

  const renderPersonGroups = (groups: PersonLogGroup[], allowPersonDrill: boolean) =>
    groups.map((group) => {
      const expanded = isExpanded(group.key, group.entries.length);
      return (
        <View key={group.key} style={styles.groupCard}>
          <Pressable
            style={styles.groupHeader}
            onPress={() => {
              if (allowPersonDrill) openPersonLog(group);
              else if (group.entries.length > 1) toggleExpanded(group.key);
            }}
          >
            <Avatar name={group.name} size={36} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.groupName} numberOfLines={1}>
                {group.name}
              </Text>
              <Text style={styles.groupMeta} numberOfLines={1}>
                {group.department || 'General'}
                {group.role ? ` · ${prettyRole(group.role)}` : ''}
              </Text>
            </View>
            <View style={styles.groupStats}>
              <Text style={styles.groupHours}>{formatHoursShort(group.totalHours)}</Text>
              <Text style={styles.groupCount}>
                {group.entries.length} task{group.entries.length === 1 ? '' : 's'}
              </Text>
            </View>
            {allowPersonDrill ? (
              <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: 6 }} />
            ) : null}
          </Pressable>

          {expanded ? (
            <TaskRows entries={group.entries} fallbackDate={selectedDate} onOpen={openTask} />
          ) : (
            <View style={styles.collapsedHint}>
              <Text style={styles.collapsedHintText}>
                {group.entries.length} task{group.entries.length === 1 ? '' : 's'}
              </Text>
            </View>
          )}

          {renderExpandFooter(group.key, group.entries.length)}
        </View>
      );
    });

  const renderDateGroups = (groups: DateLogGroup[]) =>
    groups.map((group) => {
      const expanded = isExpanded(group.key, group.entries.length);
      return (
        <View key={group.key} style={styles.groupCard}>
          <Pressable
            style={styles.groupHeader}
            onPress={() => {
              if (group.entries.length > 1) toggleExpanded(group.key);
            }}
          >
            <View style={styles.dateAvatar}>
              <Ionicons name="calendar-outline" size={16} color={colors.indigo} />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.groupName} numberOfLines={1}>
                {formatDisplayDate(group.date)}
              </Text>
              <Text style={styles.groupMeta}>
                {group.entries.length} task{group.entries.length === 1 ? '' : 's'}
              </Text>
            </View>
            <View style={styles.groupStats}>
              <Text style={styles.groupHours}>{formatHoursShort(group.totalHours)}</Text>
            </View>
          </Pressable>

          {expanded ? (
            <TaskRows entries={group.entries} fallbackDate={group.date} onOpen={openTask} />
          ) : (
            <View style={styles.collapsedHint}>
              <Text style={styles.collapsedHintText}>
                {group.entries.length} task{group.entries.length === 1 ? '' : 's'}
              </Text>
            </View>
          )}

          {renderExpandFooter(group.key, group.entries.length)}
        </View>
      );
    });

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.indigo} />
        }
      >
        <View style={styles.personBanner}>
          <Pressable style={styles.employeeSelectBtn} onPress={() => setShowEmployeePicker(true)}>
            <Avatar name={selectedEmployee?.full_name || 'Team'} size={34} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.employeeSelectName} numberOfLines={1}>
                {selectedEmployee?.full_name || 'All team'}
              </Text>
              <Text style={styles.employeeSelectMeta} numberOfLines={1}>
                {selectedEmployee
                  ? `${selectedEmployee.department || 'General'}${
                      selectedEmployee.role ? ` · ${prettyRole(selectedEmployee.role)}` : ''
                    }`
                  : 'Select an employee to filter'}
              </Text>
            </View>
            <Ionicons name="chevron-down" size={18} color={colors.indigo} />
          </Pressable>

          <View style={styles.statsGrid}>
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>Tasks</Text>
              <Text style={styles.statValue}>{filteredEntries.length}</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>Logged</Text>
              <Text style={[styles.statValue, { color: colors.indigo }]}>
                {formatHoursShort(totalHours)}
              </Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>Worked</Text>
              <Text style={[styles.statValue, { color: colors.emerald }]}>
                {workedLoading ? '…' : formatHoursShort(workedHours)}
              </Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>Avg log per day</Text>
              <Text style={[styles.statValue, { color: colors.indigo }]}>
                {formatHoursShort(avgDailyLoggedHours)}
              </Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>Completed</Text>
              <Text style={[styles.statValue, { color: colors.emerald }]}>
                {statusCounts.completed}
              </Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>Incomplete / Blocker</Text>
              <Text style={styles.statValue}>
                <Text style={{ color: colors.amber }}>{statusCounts.incomplete}</Text>
                <Text style={{ color: colors.muted }}> / </Text>
                <Text style={{ color: colors.rose }}>{statusCounts.blocker}</Text>
              </Text>
            </View>
          </View>

          <View style={styles.progressBlock}>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLabel}>
                Logged {formatHoursShort(totalHours)}
              </Text>
              <Text style={styles.progressLabel}>
                Worked {workedLoading ? '…' : formatHoursShort(workedHours)}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${workedLoading ? 0 : logProgressPct}%`,
                    backgroundColor:
                      logProgressPct >= 100
                        ? colors.emerald
                        : logProgressPct >= 80
                          ? colors.amber
                          : colors.indigo,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressHint}>
              {workedLoading
                ? 'Comparing log vs worked hours…'
                : workedHours <= 0 && totalHours <= 0
                  ? 'No hours recorded for this period'
                  : workedHours <= 0
                    ? 'Logged hours with no worked hours yet'
                    : `${logProgressPct}% of worked hours logged`}
            </Text>
          </View>
        </View>

        {isPersonView ? (
          <View style={styles.rangeToggleRow}>
            {(
              [
                { key: 'day', label: 'Day' },
                { key: 'week', label: 'Week' },
                { key: 'custom', label: 'Range' },
              ] as const
            ).map((option) => {
              const active = rangeMode === option.key;
              return (
                <Pressable
                  key={option.key}
                  style={[styles.rangeToggleBtn, active && styles.rangeToggleBtnActive]}
                  onPress={() => setRange(option.key)}
                >
                  <Text style={[styles.rangeToggleText, active && styles.rangeToggleTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {isPersonView && rangeMode === 'custom' ? (
          <View style={styles.customRangeCard}>
            <View style={styles.customRangeFields}>
              <View style={styles.customRangeField}>
                <DateField label="From" value={customStart} onChange={handleCustomStart} />
              </View>
              <View style={styles.customRangeField}>
                <DateField label="To" value={customEnd} onChange={handleCustomEnd} />
              </View>
            </View>
            <Text style={styles.customRangeHint}>
              Showing logs from {formatDisplayDate(rangeBounds.start)} to{' '}
              {formatDisplayDate(rangeBounds.end)}
            </Text>
          </View>
        ) : (
          <View style={styles.dateSelectorCard}>
            <Pressable
              style={styles.dateNavArrow}
              onPress={() => (isPersonView && rangeMode === 'week' ? handleShiftWeek(-1) : handleShiftDay(-1))}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={18} color={colors.text} />
            </Pressable>

            <Pressable
              style={styles.dateCenterBtn}
              disabled={isPersonView && rangeMode === 'week'}
              onPress={() => {
                if (isPersonView && rangeMode === 'week') return;
                setDraftDate(parseDate(selectedDate));
                setShowDatePicker(true);
              }}
            >
              <Ionicons name="calendar-outline" size={16} color={colors.indigo} />
              <Text style={styles.dateCenterText}>
                {isPersonView && rangeMode === 'week'
                  ? `${formatDisplayDate(weekDisplay.start)} – ${formatDisplayDate(weekDisplay.end)}`
                  : formatDisplayDate(selectedDate)}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.dateNavArrow,
                ((isPersonView && rangeMode === 'week' && !canGoNextWeek) ||
                  (!isPersonView && isToday) ||
                  (isPersonView && rangeMode === 'day' && isToday)) &&
                  styles.dateNavArrowDisabled,
              ]}
              onPress={() =>
                isPersonView && rangeMode === 'week' ? handleShiftWeek(1) : handleShiftDay(1)
              }
              disabled={
                (isPersonView && rangeMode === 'week' && !canGoNextWeek) ||
                (!isPersonView && isToday) ||
                (isPersonView && rangeMode === 'day' && isToday)
              }
              hitSlop={8}
            >
              <Ionicons
                name="chevron-forward"
                size={18}
                color={
                  (isPersonView && rangeMode === 'week' && !canGoNextWeek) ||
                  (!isPersonView && isToday) ||
                  (isPersonView && rangeMode === 'day' && isToday)
                    ? colors.muted
                    : colors.text
                }
              />
            </Pressable>

            {!(isPersonView && rangeMode === 'week') && !isToday ? (
              <Pressable style={styles.todayJumpBadge} onPress={() => handleSelectDate(todayIso())}>
                <Text style={styles.todayJumpText}>Today</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {Platform.OS === 'android' && showDatePicker ? (
          <DateTimePicker
            value={draftDate}
            mode="date"
            display="default"
            maximumDate={new Date()}
            onChange={(event, date) => {
              setShowDatePicker(false);
              if (event.type === 'set' && date) {
                handleSelectDate(toIsoDate(date));
              }
            }}
          />
        ) : null}

        {Platform.OS === 'ios' && (
          <Modal visible={showDatePicker} transparent animationType="slide">
            <Pressable style={styles.modalOverlay} onPress={() => setShowDatePicker(false)} />
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select date</Text>
                <Pressable
                  style={styles.modalDoneBtn}
                  onPress={() => {
                    handleSelectDate(toIsoDate(draftDate));
                    setShowDatePicker(false);
                  }}
                >
                  <Text style={styles.modalDoneText}>Done</Text>
                </Pressable>
              </View>
              <View style={styles.datePickerBox}>
                <DateTimePicker
                  value={draftDate}
                  mode="date"
                  display="inline"
                  themeVariant="light"
                  textColor="#0F172A"
                  accentColor={colors.indigo}
                  maximumDate={new Date()}
                  style={styles.inlineDatePicker}
                  onChange={(_, date) => {
                    if (date) setDraftDate(date);
                  }}
                />
              </View>
            </View>
          </Modal>
        )}

        {!isPersonView ? (
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={16} color={colors.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search name, project, or task..."
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
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipRow}
        >
          {STATUS_FILTERS.map((chip) => {
            const active = statusFilter === chip.key;
            return (
              <Pressable
                key={chip.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setStatusFilter(chip.key)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {showListSkeleton ? (
          <DailyLogListSkeleton rows={8} />
        ) : error ? (
          <View style={styles.emptyBox}>
            <Ionicons name="alert-circle-outline" size={28} color={colors.rose} />
            <Text style={styles.emptyText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={onRefresh}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : filteredEntries.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="document-text-outline" size={28} color={colors.muted} />
            <Text style={styles.emptyText}>
              {isPersonView
                ? rangeMode === 'week'
                  ? `No logs from ${personName || 'this person'} this work week`
                  : rangeMode === 'custom'
                    ? `No logs from ${personName || 'this person'} in this date range`
                    : `No logs submitted by ${personName || 'this person'} for this date`
                : 'No logs submitted for this date'}
            </Text>
          </View>
        ) : usesDateGroups ? (
          renderDateGroups(dateGroups)
        ) : isPersonView ? (
          renderPersonGroups(personGroups, false)
        ) : (
          renderPersonGroups(personGroups, true)
        )}
      </ScrollView>

      <Modal visible={showEmployeePicker} transparent animationType="slide">
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setShowEmployeePicker(false);
          }}
        />
        <View style={styles.pickerSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select employee</Text>
            <Pressable
              style={styles.modalDoneBtn}
              onPress={() => {
                setShowEmployeePicker(false);
              }}
            >
              <Text style={styles.modalDoneText}>Close</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
            <Pressable
              style={[styles.pickerRow, !isPersonView && styles.pickerRowActive]}
              onPress={() => selectEmployee(null)}
            >
              <Avatar name="Team" size={34} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.pickerName}>All team</Text>
                <Text style={styles.pickerMeta}>Show everyone for this period</Text>
              </View>
              {!isPersonView ? <Ionicons name="checkmark" size={18} color={colors.indigo} /> : null}
            </Pressable>

            {employees.map((emp) => {
              const active = emp.id === userIdFilter;
              return (
                <Pressable
                  key={emp.id}
                  style={[styles.pickerRow, active && styles.pickerRowActive]}
                  onPress={() => selectEmployee(emp)}
                >
                  <Avatar name={emp.full_name} size={34} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.pickerName}>{emp.full_name}</Text>
                    <Text style={styles.pickerMeta}>
                      {emp.department || 'General'}
                      {emp.role ? ` · ${prettyRole(emp.role)}` : ''}
                    </Text>
                  </View>
                  {active ? <Ionicons name="checkmark" size={18} color={colors.indigo} /> : null}
                </Pressable>
              );
            })}

            {employees.length === 0 ? (
              <Text style={styles.pickerEmpty}>No employees available</Text>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },
  rangeToggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 4,
    marginBottom: 12,
    gap: 4,
  },
  rangeToggleBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 9,
  },
  rangeToggleBtnActive: { backgroundColor: colors.indigo },
  rangeToggleText: { fontSize: 13, fontWeight: '700', color: colors.slate },
  rangeToggleTextActive: { color: '#FFFFFF', fontWeight: '800' },
  customRangeCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    marginBottom: 12,
  },
  customRangeFields: { flexDirection: 'row', gap: 10 },
  customRangeField: { flex: 1 },
  customRangeHint: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  dateSelectorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dateNavArrow: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateNavArrowDisabled: { opacity: 0.45 },
  dateCenterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  dateCenterText: { fontSize: 13, fontWeight: '800', color: colors.text },
  todayJumpBadge: {
    backgroundColor: colors.indigo,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 4,
  },
  todayJumpText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '800' },
  personBanner: {
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    padding: 12,
    marginBottom: 12,
  },
  employeeSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  employeeSelectName: { fontSize: 14, fontWeight: '800', color: colors.text },
  employeeSelectMeta: { marginTop: 2, fontSize: 11.5, color: colors.muted },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    gap: 8,
  },
  statCell: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statValue: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  progressBlock: {
    marginTop: 10,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: { fontSize: 11, fontWeight: '700', color: colors.slate },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#E4E4E7',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressHint: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  pickerSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '75%',
    paddingBottom: 20,
  },
  pickerList: { paddingHorizontal: 12 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginBottom: 4,
  },
  pickerRowActive: { backgroundColor: '#EEF2FF' },
  pickerName: { fontSize: 14, fontWeight: '800', color: colors.text },
  pickerMeta: { marginTop: 2, fontSize: 11.5, color: colors.muted },
  pickerEmpty: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 13,
    paddingVertical: 24,
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
  searchInput: { flex: 1, fontSize: 13, color: colors.text },
  filterChipRow: { gap: 6, paddingBottom: 14 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  filterChipActive: { backgroundColor: colors.indigo, borderColor: colors.indigo },
  filterChipText: { fontSize: 11.5, fontWeight: '700', color: colors.slate },
  filterChipTextActive: { color: '#FFFFFF', fontWeight: '800' },
  loadingCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 28,
    alignItems: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 20,
  },
  emptyText: { marginTop: 8, fontSize: 13, color: colors.muted, textAlign: 'center' },
  retryBtn: {
    marginTop: 12,
    backgroundColor: colors.indigo,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  groupCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 10,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F5',
  },
  dateAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupName: { fontSize: 14, fontWeight: '800', color: colors.text },
  groupMeta: { marginTop: 2, fontSize: 11.5, color: colors.muted },
  groupStats: { alignItems: 'flex-end' },
  groupHours: { fontSize: 13, fontWeight: '800', color: colors.indigo },
  groupCount: { marginTop: 2, fontSize: 10.5, fontWeight: '700', color: colors.muted },
  collapsedHint: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FAFAFA',
  },
  collapsedHintText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F4F4F5',
  },
  expandBtnText: { fontSize: 12, fontWeight: '800', color: colors.indigo },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F4F4F5',
  },
  taskTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  taskProject: { marginTop: 3, fontSize: 11.5, color: colors.muted },
  taskRightMeta: { alignItems: 'flex-end', gap: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10.5, fontWeight: '800' },
  taskHours: { fontSize: 11, fontWeight: '700', color: colors.slate },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 28,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F5',
  },
  modalTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  modalDoneBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  modalDoneText: { fontSize: 14, fontWeight: '700', color: colors.indigo },
  datePickerBox: { alignItems: 'center', paddingHorizontal: 8 },
  inlineDatePicker: { width: '100%' },
});
