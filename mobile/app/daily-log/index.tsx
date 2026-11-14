import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { ModuleHeader } from '../../src/ui/ModuleHeader';
import { useTabBarOffset } from '../../src/ui/layout';
import { FadeIn } from '../../src/ui/motion';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api } from '../../src/lib/api';
import {
  DailyLogEntry,
  DateLogGroup,
  PersonLogGroup,
  buildEntriesQuery,
  formatHoursShort,
  getMondayIso,
  getMonSatWeekBounds,
  getMonSatWeekDisplayBounds,
  groupEntriesByDate,
  groupEntriesByPerson,
  parseHours,
  shiftWeekMonday,
  taskStatusTone,
} from '../../src/lib/dailyLog';
import {
  getCachedEmployees,
  getCachedEntries,
  getCachedLogVariance,
  invalidateEntriesCache,
  invalidateLogVarianceCache,
  invalidateSnapshotCache,
  makeEntriesCacheKey,
  setCachedEmployees,
  setCachedEntries,
  setCachedLogVariance,
} from '../../src/lib/dailyLogCache';
import {
  CoverageTone,
  UnifiedVarianceData,
  VarianceTone,
  fetchLogVariance,
  formatMinutes,
  formatPercentage,
  formatSignedMinutes,
  getCoverageTone,
  getVarianceTone,
} from '../../src/lib/logVariance';
import { colors } from '../../src/theme';
import { Avatar } from '../../src/ui/Avatar';
import { DateField } from '../../src/ui/DateTimeField';
import { DailyLogListSkeleton, DailyLogOverviewSkeleton } from '../../src/ui/Skeleton';
import { Plus, Share2 } from 'lucide-react-native';
import { AdminLogOverview } from '../../src/components/daily-log/AdminLogOverview';
import { LogWorkModal } from '../../src/components/daily-log/LogWorkModal';
import { PressScale } from '../../src/ui/motion';
import { TaskHtmlText } from '../../src/ui/TaskHtmlText';
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

function getToneColor(tone: VarianceTone | CoverageTone): string {
  switch (tone) {
    case 'success':
      return colors.emerald;
    case 'warning':
      return colors.amber;
    case 'danger':
      return colors.rose;
    case 'info':
      return colors.indigo;
    default:
      return colors.text;
  }
}

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
          <PressScale
            key={entry.id}
            style={styles.taskRow}
            contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
            onPress={() => onOpen(entry)}
          >
            <View style={{ flex: 1 }}>
              <TaskHtmlText
                html={entry.task_description || 'Untitled task'}
                style={styles.taskTitle}
                numberOfLines={2}
              />
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
          </PressScale>
        );
      })}
    </>
  );
}

const TEAM_VIEW_ROLES = new Set(['team_lead', 'hr', 'admin', 'super_admin', 'operations']);
const OVERVIEW_ROLES = new Set(['admin', 'super_admin', 'operations']);

export default function DailyLogListScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const tabOffset = useTabBarOffset();
  const params = useLocalSearchParams<{ date?: string; userId?: string; name?: string }>();
  const myId = String(user?.id || '');
  const myName = String(user?.name || '');
  const role = String(user?.role || '').toLowerCase();
  const canViewTeam = TEAM_VIEW_ROLES.has(role);
  const isOverviewUser = OVERVIEW_ROLES.has(role);

  const initialDate =
    typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : todayIso();
  const paramUserId = typeof params.userId === 'string' && params.userId ? params.userId : '';
  const initialUserId = paramUserId || (isOverviewUser ? '' : myId);
  const initialName =
    typeof params.name === 'string' && params.name ? params.name : isOverviewUser && !paramUserId ? '' : myName;
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
  const [varianceData, setVarianceData] = useState<UnifiedVarianceData | null>(null);
  const [varianceLoading, setVarianceLoading] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [overviewNonce, setOverviewNonce] = useState(0);
  const [logScope, setLogScope] = useState<'mine' | 'team' | 'overview'>(
    paramUserId && paramUserId !== myId ? 'team' : isOverviewUser ? 'overview' : 'mine',
  );

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
    if (rangeMode === 'week') return getMonSatWeekBounds(selectedDate, todayIso());
    if (rangeMode === 'custom') return normalizeCustomRange(customStart, customEnd);
    return { start: selectedDate, end: selectedDate };
  }, [rangeMode, selectedDate, customStart, customEnd]);

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

      if (cached && !force) {
        reqIdRef.current += 1;
        fetchKeyRef.current = key;
        setEntries(cached.data);
        setShowListSkeleton(false);
        setColdStart(false);
        setError('');
        if (!soft) setRefreshing(false);
        return;
      }

      if (!cached && !soft) {
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

  const loadVariance = useCallback(
    async (startDate: string, endDate: string, userId: string, force = false) => {
      const cached = getCachedLogVariance(userId, startDate, endDate);
      if (cached && !force) {
        workedReqIdRef.current += 1;
        setVarianceData(cached.data);
        setVarianceLoading(false);
        return;
      }

      if (!cached) {
        setVarianceData(null);
        setVarianceLoading(true);
      } else {
        setVarianceLoading(true);
      }

      const reqId = ++workedReqIdRef.current;

      try {
        const data = await fetchLogVariance(startDate, endDate, userId || null, api);
        if (reqId !== workedReqIdRef.current) return;
        setCachedLogVariance(userId, startDate, endDate, data);
        setVarianceData(data);
      } catch {
        if (reqId !== workedReqIdRef.current) return;
        if (!cached) {
          setVarianceData(null);
        }
      } finally {
        if (reqId === workedReqIdRef.current) setVarianceLoading(false);
      }
    },
    [],
  );

  // Cache-first paint. Skip network if this range/person was already loaded.
  useEffect(() => {
    if (logScope === 'overview') {
      setColdStart(false);
      return;
    }
    const { start, end } = rangeBounds;
    const cached = getCachedEntries(start, end, userIdFilter, personName);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (cached) {
      reqIdRef.current += 1;
      fetchKeyRef.current = makeEntriesCacheKey(start, end, userIdFilter, personName);
      setEntries(cached.data);
      setShowListSkeleton(false);
      setColdStart(false);
      setError('');
      hasSettledOnce.current = true;
      return;
    }

    setShowListSkeleton(true);
    setEntries([]);
    const delay = hasSettledOnce.current ? SETTLE_MS : 0;
    hasSettledOnce.current = true;
    debounceTimer.current = setTimeout(() => {
      void executeFetch(start, end, userIdFilter, personName, { force: false });
    }, delay);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [rangeBounds.start, rangeBounds.end, userIdFilter, personName, executeFetch, logScope]);

  // Log variance: skeleton on cache miss, instant paint + no refetch on cache hit.
  useEffect(() => {
    if (logScope === 'overview') return;
    const { start, end } = rangeBounds;
    const cached = getCachedLogVariance(userIdFilter, start, end);
    if (workedDebounceTimer.current) clearTimeout(workedDebounceTimer.current);

    if (cached) {
      workedReqIdRef.current += 1;
      setVarianceData(cached.data);
      setVarianceLoading(false);
      hasWorkedSettledOnce.current = true;
      return;
    }

    setVarianceData(null);
    setVarianceLoading(true);
    const delay = hasWorkedSettledOnce.current ? SETTLE_MS : 0;
    hasWorkedSettledOnce.current = true;
    workedDebounceTimer.current = setTimeout(() => {
      void loadVariance(start, end, userIdFilter, false);
    }, delay);

    return () => {
      if (workedDebounceTimer.current) clearTimeout(workedDebounceTimer.current);
    };
  }, [rangeBounds.start, rangeBounds.end, userIdFilter, loadVariance, logScope]);

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
      void loadVariance(start, end, uid, true);
      return () => {
        didBlurRef.current = true;
      };
    }, [executeFetch, loadVariance]),
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
    if (nextUserId) {
      setUserIdFilter(nextUserId);
      if (myId && nextUserId !== myId) setLogScope('team');
    }
    if (nextName) {
      setPersonName(nextName);
    }
  }, [params.date, params.userId, params.name, myId]);

  const switchLogScope = (next: 'mine' | 'team' | 'overview') => {
    setLogScope(next);
    if (next === 'mine') {
      setUserIdFilter(myId);
      setPersonName(myName);
    } else if (next === 'team') {
      setUserIdFilter('');
      setPersonName('');
    }
  };

  const openOverviewPerson = useCallback((userId: string, name: string, date: string) => {
    setLogScope('team');
    setUserIdFilter(userId);
    setPersonName(name);
    setRangeMode('day');
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setSelectedDate(date);
      setDraftDate(parseDate(date));
    }
    router.setParams({ userId, name, date });
  }, [router]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (logScope === 'overview') {
      invalidateSnapshotCache();
      setOverviewNonce((value) => value + 1);
      return;
    }
    invalidateLogVarianceCache();
    invalidateEntriesCache();
    void executeFetch(rangeBounds.start, rangeBounds.end, userIdFilter, personName, {
      force: true,
    });
    void loadVariance(rangeBounds.start, rangeBounds.end, userIdFilter, true);
  }, [executeFetch, loadVariance, rangeBounds.start, rangeBounds.end, userIdFilter, personName, logScope]);

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

  const isSingleDayToday =
    isToday && rangeBounds.start === rangeBounds.end && rangeBounds.start === todayIso();

  const displaySummary = useMemo(() => {
    const raw = varianceData?.summary;
    const loggedFromEntries = Math.round(totalHours * 60);

    if (isSingleDayToday) {
      const todayDayRecord = varianceData?.days?.find((d) => d.date === rangeBounds.start);
      const isLiveShift =
        todayDayRecord?.status === 'live' ||
        Boolean(
          varianceData?.today_live &&
            (varianceData.today_live.worked > 0 || varianceData.today_live.logged > 0),
        );

      if ((raw?.worked ?? 0) > 0 && !isLiveShift) {
        return {
          worked: raw?.worked ?? 0,
          logged: Math.max(raw?.logged ?? 0, loggedFromEntries),
          variance: raw?.variance ?? 0,
          coverage_pct: raw?.coverage_pct ?? null,
          avg_logged_per_present_day:
            raw?.avg_logged_per_present_day ?? (raw as any)?.avg_logged_per_day ?? null,
          days_present: raw?.days_present ?? 1,
          days_absent: raw?.days_absent ?? 0,
          is_live: false,
        };
      }

      const liveWorked = varianceData?.today_live?.worked ?? todayDayRecord?.worked ?? 0;
      const liveLogged = Math.max(
        varianceData?.today_live?.logged ?? todayDayRecord?.logged ?? 0,
        loggedFromEntries,
      );
      const liveVariance = liveWorked - liveLogged;
      const liveCoveragePct =
        liveWorked > 0
          ? Math.round((liveLogged / liveWorked) * 100)
          : liveLogged > 0
            ? 100
            : null;
      const hasPresent =
        liveWorked > 0 || Boolean(todayDayRecord?.check_in) || (raw?.days_present ?? 0) > 0;

      return {
        worked: liveWorked,
        logged: liveLogged,
        variance: liveVariance,
        coverage_pct: liveCoveragePct,
        avg_logged_per_present_day: liveLogged > 0 ? liveLogged : null,
        days_present: hasPresent ? 1 : 0,
        days_absent: 0,
        is_live: isLiveShift || liveWorked > 0,
      };
    }

    const worked = raw?.worked ?? 0;
    const logged = Math.max(
      raw?.logged ?? 0,
      rangeBounds.start === rangeBounds.end ? loggedFromEntries : 0,
    );
    return {
      worked,
      logged,
      variance: raw?.variance ?? (worked - logged),
      coverage_pct:
        raw?.coverage_pct ??
        (worked > 0 ? Math.round((logged / worked) * 100) : logged > 0 ? 100 : null),
      avg_logged_per_present_day:
        raw?.avg_logged_per_present_day ?? (raw as any)?.avg_logged_per_day ?? null,
      days_present: raw?.days_present ?? 0,
      days_absent: raw?.days_absent ?? 0,
      is_live: false,
    };
  }, [varianceData, isSingleDayToday, rangeBounds.start, rangeBounds.end, totalHours]);

  const varianceTone = useMemo(() => {
    return getVarianceTone(displaySummary.variance, displaySummary.days_present);
  }, [displaySummary]);

  const coverageTone = useMemo(() => {
    return getCoverageTone(displaySummary.coverage_pct);
  }, [displaySummary]);

  const handleShareSummary = async () => {
    if (filteredEntries.length === 0) {
      Alert.alert('No Logs', 'There are no log entries to share for the current view.');
      return;
    }
    const lines = [
      `OneWorkLane Daily Log Summary (${rangeBounds.start === rangeBounds.end ? rangeBounds.start : `${rangeBounds.start} to ${rangeBounds.end}`})`,
      `Total Hours: ${formatHoursShort(totalHours)} | Tasks: ${filteredEntries.length}`,
      '',
    ];
    for (const e of filteredEntries) {
      const status = e.task_status ? `[${e.task_status}] ` : '';
      const proj = e.client_project ? `${e.client_project}: ` : '';
      const h = e.hours_utilized ? ` (${formatHoursShort(e.hours_utilized)})` : '';
      lines.push(`• ${status}${proj}${e.task_description}${h}`);
    }
    try {
      await Share.share({
        message: lines.join('\n'),
        title: `OneWorkLane Daily Log - ${selectedDate}`,
      });
    } catch {
      // dismissed
    }
  };

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

  const logProgressPct = Math.min(100, Math.max(0, Math.round(varianceData?.summary.coverage_pct ?? 0)));
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

  if (logScope !== 'overview' && coldStart && entries.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['bottom']}>
        <DailyLogListSkeleton rows={8} />
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
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ModuleHeader
        title={logScope === 'overview' ? 'Overview' : logScope === 'team' ? 'Team logs' : 'My log'}
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: tabOffset }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.indigo} />
        }
      >
        {canViewTeam ? (
          <View style={styles.scopeRow}>
            {(isOverviewUser
              ? ([
                  ['overview', 'Overview'],
                  ['team', 'Team'],
                ] as const)
              : ([
                  ['mine', 'My log'],
                  ['team', 'Team'],
                ] as const)
            ).map(([key, label]) => {
              const active = logScope === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => switchLogScope(key)}
                  style={[styles.scopeChip, active && styles.scopeChipOn]}
                >
                  <Text style={[styles.scopeChipText, active && styles.scopeChipTextOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {logScope === 'overview' ? (
          <AdminLogOverview
            reloadToken={overviewNonce}
            onSettled={() => setRefreshing(false)}
            onOpenPerson={openOverviewPerson}
          />
        ) : null}
        {logScope !== 'overview' ? (
        <>
        <FadeIn>
        <View style={styles.personBanner}>
          {logScope === 'team' ? (
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
                  : 'Select a teammate to filter'}
              </Text>
            </View>
            <Ionicons name="chevron-down" size={18} color={colors.indigo} />
          </Pressable>
          ) : (
            <View style={styles.employeeSelectBtn}>
              <Avatar name={myName || 'Me'} size={34} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.employeeSelectName} numberOfLines={1}>
                  {myName || 'My logs'}
                </Text>
                <Text style={styles.employeeSelectMeta}>Your hours and tasks for this period</Text>
              </View>
            </View>
          )}

          {varianceLoading && !varianceData && entries.length === 0 ? (
            <DailyLogOverviewSkeleton />
          ) : (
            <>
              <View style={styles.statsGrid}>
                <View style={styles.statCell}>
                  <Text style={styles.statLabel}>Worked</Text>
                  <Text style={[styles.statValue, { color: colors.emerald }]}>
                    {formatMinutes(displaySummary.worked)}
                  </Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statLabel}>Logged</Text>
                  <Text style={[styles.statValue, { color: colors.indigo }]}>
                    {formatMinutes(displaySummary.logged)}
                  </Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statLabel}>Unlogged</Text>
                  <Text style={[styles.statValue, { color: getToneColor(varianceTone) }]}>
                    {formatSignedMinutes(displaySummary.variance)}
                  </Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statLabel}>Coverage %</Text>
                  <Text style={[styles.statValue, { color: getToneColor(coverageTone) }]}>
                    {formatPercentage(displaySummary.coverage_pct, 0)}
                  </Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statLabel}>Avg logged / present day</Text>
                  <Text style={[styles.statValue, { color: colors.indigo }]}>
                    {formatMinutes(displaySummary.avg_logged_per_present_day)}
                  </Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statLabel}>Days present / missing</Text>
                  <Text style={styles.statValue}>
                    {`${displaySummary.days_present} / ${displaySummary.days_absent}`}
                  </Text>
                </View>
              </View>

              {isSingleDayToday && (displaySummary.is_live || varianceData?.today_live) && (displaySummary.worked > 0 || displaySummary.logged > 0) ? (
                <View style={styles.liveHoursBanner}>
                  <Ionicons name="time-outline" size={14} color={colors.indigo} />
                  <Text style={styles.liveHoursText}>
                    Shift in progress · {formatMinutes(displaySummary.logged)} logged / {formatMinutes(displaySummary.worked)} at work so far
                  </Text>
                </View>
              ) : varianceData?.range?.today_included && varianceData?.today_live && !isSingleDayToday ? (
                <View style={styles.liveHoursBanner}>
                  <Ionicons name="time-outline" size={14} color={colors.indigo} />
                  <Text style={styles.liveHoursText}>
                    Today so far (live): {formatMinutes(varianceData.today_live.logged)} logged /{' '}
                    {formatMinutes(varianceData.today_live.worked)} worked (not in totals yet)
                  </Text>
                </View>
              ) : null}

              <View style={styles.progressBlock}>
                <View style={styles.progressLabels}>
                  <Text style={styles.progressLabel}>
                    Logged {formatMinutes(displaySummary.logged)}
                  </Text>
                  <Text style={styles.progressLabel}>
                    Worked {formatMinutes(displaySummary.worked)}
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(100, Math.max(0, displaySummary.coverage_pct ?? 0))}%`,
                        backgroundColor:
                          (displaySummary.coverage_pct ?? 0) >= 95
                            ? colors.emerald
                            : (displaySummary.coverage_pct ?? 0) >= 80
                              ? colors.amber
                              : colors.rose,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.progressHint}>
                  {displaySummary.worked <= 0 && displaySummary.logged <= 0
                    ? 'No hours recorded for this period'
                    : displaySummary.worked <= 0
                      ? 'Logged hours with no worked hours yet'
                      : `${formatPercentage(displaySummary.coverage_pct, 1)} of worked hours logged`}
                </Text>
              </View>
            </>
          )}
        </View>
        </FadeIn>

        <View style={styles.actionRow}>
          {logScope === 'mine' ? (
            <Pressable
              style={styles.logWorkBtn}
              onPress={() => setShowLogModal(true)}
            >
              <Plus size={16} color="#FFFFFF" />
              <Text style={styles.logWorkBtnText}>Log Work</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.shareBtn, logScope === 'team' && { flex: 1 }]}
            onPress={handleShareSummary}
          >
            <Share2 size={16} color={colors.indigo} />
            <Text style={styles.shareBtnText}>Share</Text>
          </Pressable>
        </View>

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

        {rangeMode === 'custom' ? (
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
              onPress={() => (rangeMode === 'week' ? handleShiftWeek(-1) : handleShiftDay(-1))}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={18} color={colors.text} />
            </Pressable>

            <Pressable
              style={styles.dateCenterBtn}
              disabled={rangeMode === 'week'}
              onPress={() => {
                if (rangeMode === 'week') return;
                setDraftDate(parseDate(selectedDate));
                setShowDatePicker(true);
              }}
            >
              <Ionicons name="calendar-outline" size={16} color={colors.indigo} />
              <Text style={styles.dateCenterText}>
                {rangeMode === 'week'
                  ? `${formatDisplayDate(weekDisplay.start)} – ${formatDisplayDate(weekDisplay.end)}`
                  : isToday
                    ? `Today, ${formatDisplayDate(selectedDate)}`
                    : formatDisplayDate(selectedDate)}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.dateNavArrow,
                ((rangeMode === 'week' && !canGoNextWeek) ||
                  (rangeMode === 'day' && isToday)) &&
                  styles.dateNavArrowDisabled,
              ]}
              onPress={() =>
                rangeMode === 'week' ? handleShiftWeek(1) : handleShiftDay(1)
              }
              disabled={
                (rangeMode === 'week' && !canGoNextWeek) ||
                (rangeMode === 'day' && isToday)
              }
              hitSlop={8}
            >
              <Ionicons
                name="chevron-forward"
                size={18}
                color={
                  (rangeMode === 'week' && !canGoNextWeek) ||
                  (rangeMode === 'day' && isToday)
                    ? colors.muted
                    : colors.text
                }
              />
            </Pressable>

            {rangeMode !== 'week' && !isToday ? (
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

        {logScope === 'team' && !isPersonView ? (
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
                onPress={() => {
                  if (statusFilter === chip.key) return;
                  setStatusFilter(chip.key);
                }}
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
        </>
        ) : null}
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

      <LogWorkModal
        visible={showLogModal}
        initialDate={selectedDate}
        onClose={() => setShowLogModal(false)}
        onCreated={() => {
          onRefresh();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },
  scopeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  scopeChip: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  scopeChipOn: { backgroundColor: colors.indigo, borderColor: colors.indigo },
  scopeChipText: { fontSize: 13, fontWeight: '600', color: colors.slate },
  scopeChipTextOn: { color: '#fff' },
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
  liveHoursBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 8,
    gap: 6,
  },
  liveHoursText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.indigo,
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
  taskTitle: { fontSize: 14, fontWeight: '400', color: colors.text, lineHeight: 20 },
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
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    marginBottom: 12,
  },
  logWorkBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.indigo,
    borderRadius: 12,
    paddingVertical: 12,
  },
  logWorkBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  shareBtnText: {
    color: colors.indigo,
    fontSize: 14,
    fontWeight: '700',
  },
});
