import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Plus,
  Filter,
  Search,
  ListChecks,
  Trash2,
  Pencil,
  RotateCw,
  Table as TableIcon,
  LayoutDashboard,
  X,
  ExternalLink,
  AlertTriangle,
  Download,
  ClipboardList,
  Paperclip,
  Layers,
  Calendar as CalendarIcon,
  MoreHorizontal,
  Columns3,
  Rows3,
  User,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu';
import { dailyLogService } from '../../services/dailyLogService';
import { logExceptionService } from '../../services/logExceptionService';
import { useCacheInvalidation } from '../../utils/cacheBus';
import type {
  DailyLogEntry,
  DailyLogColumn,
  UserLogActivity,
  GetDailyLogEntriesParams,
  DayTarget,
  DayTargetFollowUp,
} from '../../types/dailyLog';
import { useAuth } from '../../context/AuthContext';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../ui/ConfirmProvider';
import { DailyLogModal } from '../daily-log/DailyLogModal';
import { DailyLogForm } from '../daily-log/DailyLogForm';
import { ShiftTasksTracker } from '../daily-log/ShiftTasksTracker';
import { DateRangeCalendarPicker } from '../daily-log/DateRangeCalendarPicker';
import { useSystemConfig } from '../../hooks/useSystemConfig';
import { downloadFileAttachment } from '../../utils/fileUrl';
import { toSafeHttpsUrl } from '../../utils/safeUrl';
import { CustomSelect } from '../ui/CustomSelect';
import { OffDayBanner } from '../ui/OffDayBanner';
import { useOffDays } from '../../hooks/useOffDays';
import { getRoleLabel } from '../../utils/badgeStyles';
import { formatHours, isLogDateExpired } from '../../utils/logTimeChecks';
import { exportDailyLogWorkbook } from '../../utils/dailyLogExcelExport';
import { PageHeader } from '../ui/PageHeader';
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl';
import { StatusPill } from '../ui/StatusPill';
import { Callout } from '../ui/Callout';
import { EmptyState } from '../ui/EmptyState';
import { Button, IconButton } from '../ui/button';
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from '../ui/popover';
import { cn } from '../../lib/utils';

const DEFAULT_COLUMNS: DailyLogColumn[] = [
  { key: 'date', label: 'Date', type: 'date', editable: true, width: '130' },
  { key: 'resource_name', label: 'Resource Name', type: 'text', editable: true, width: '160' },
  { key: 'role', label: 'Role', type: 'text', editable: true, width: '160' },
  { key: 'department', label: 'Department', type: 'text', editable: true, width: '140' },
  { key: 'client_project', label: 'Client / Project', type: 'text', editable: true, width: '160' },
  { key: 'task_description', label: 'Task Description', type: 'text', editable: true, width: '280' },
  {
    key: 'task_type',
    label: 'Task Type',
    type: 'select',
    options: ['Scheduled Task', 'Runtime Task'],
    editable: true,
    width: '160',
  },
  {
    key: 'task_status',
    label: 'Task Status',
    type: 'select',
    options: ['Completed', 'Incomplete', 'Blocker'],
    editable: true,
    width: '150',
  },
  { key: 'revisions_done', label: 'Revisions / Updates Done', type: 'text', editable: true, width: '220' },
  { key: 'deliverables', label: 'Deliverables Submitted (Links / Files)', type: 'text', editable: true, width: '240' },
  { key: 'hours_utilized', label: 'Hours Utilized', type: 'number', editable: true, width: '130' },
  { key: 'remarks', label: 'Remarks (Optional)', type: 'text', editable: true, width: '200' },
];

const DEFAULT_ROW_HEIGHT = 44;

const NON_FILTERABLE_KEYS = new Set([
  'task_description',
  'revisions_done',
  'deliverables',
  'hours_utilized',
  'remarks',
]);

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FOLLOW_UP_CHIP_LIMIT = 4;

const getTodayIso = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatChipDate = (iso: string): string => {
  const parts = String(iso || '').split('-');
  if (parts.length !== 3) return iso;
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!month || !day || month < 1 || month > 12) return iso;
  return `${MONTH_SHORT[month - 1]} ${day}`;
};

const formatMissingDatesList = (dates: string[]): string => {
  if (dates.length === 0) return '';
  const formatted = dates.map(formatChipDate);
  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}`;
  if (formatted.length === 3) return `${formatted[0]}, ${formatted[1]} and ${formatted[2]}`;
  const extraCount = formatted.length - 3;
  return `${formatted[0]}, ${formatted[1]}, ${formatted[2]} and ${extraCount} more`;
};

const getThisWeekBounds = () => {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);

  const format = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dt = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dt}`;
  };

  return {
    start: format(monday),
    end: format(saturday),
  };
};

const getCurrentMonthSheet = (): string => {
  const d = new Date();
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${monthNames[d.getMonth()]} - ${d.getFullYear()}`;
};

export const DailyLogView: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const confirm = useConfirm();
  const isAdmin = user?.role === 'admin';
  const isHR = user?.role === 'hr';
  const isOperations = user?.role === 'operations';
  const isLead = user?.role === 'team_lead';
  const canSubmitLogs = user?.role === 'team_member' || user?.role === 'team_lead' || user?.role === 'hr';
  const canExportLogs = isAdmin || isHR || isOperations || isLead;
  const userDept = user?.department || '';
  const { departments } = useSystemConfig();

  // Dual presentation: 'log' (mock 06 card & timeline) vs 'sheet' (configurable table)
  // Default to sheet view for admin/HR/operations who oversee the whole team; log view for everyone else
  const [viewMode, setViewMode] = useState<'log' | 'sheet'>(() => {
    if (isAdmin || isHR || isOperations) return 'sheet';
    return 'log';
  });

  const userDepts = useMemo(() => {
    if (userDept) {
      return userDept.split(/[,;/]|\band\b|&/i).map((s) => s.trim()).filter(Boolean);
    }
    return [];
  }, [userDept]);

  const initialSheets = dailyLogService.getCachedSheets()?.data;
  const initialColumns = dailyLogService.getCachedColumns()?.data;
  const initialActivity = dailyLogService.getCachedActivity()?.data;
  const hasCached = dailyLogService.hasInitialCache();

  const [columns, setColumns] = useState<DailyLogColumn[]>(() => initialColumns || DEFAULT_COLUMNS);
  const [entries, setEntries] = useState<DailyLogEntry[]>([]);
  const [availableSheets, setAvailableSheets] = useState<string[]>(() => initialSheets || []);
  const [activeSheet, setActiveSheet] = useState<string>(() => getCurrentMonthSheet());
  const [isLoading, setIsLoading] = useState<boolean>(!hasCached);
  useModuleLoadGate(isLoading);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Department Filter State
  const [selectedDept, setSelectedDept] = useState<string>(() => {
    if (isLead && userDept) {
      const depts = userDept.split(/[,;/]|\band\b|&/i).map((s) => s.trim()).filter(Boolean);
      return depts.length === 1 ? depts[0] : 'All';
    }
    if (!isAdmin && !isHR && userDept) return userDept;
    return 'All';
  });

  // Date Filter State
  const [datePreset, setDatePreset] = useState<'today' | 'week' | 'month' | 'custom'>('month');
  const [customStartDate, setCustomStartDate] = useState<string>(getTodayIso());
  const [customEndDate, setCustomEndDate] = useState<string>(getTodayIso());
  const [isCustomRangeOpen, setIsCustomRangeOpen] = useState<boolean>(false);

  // Controlled Create / Edit Modal State
  const [isEntryModalOpen, setIsEntryModalOpen] = useState<boolean>(false);
  const [entryModalMode, setEntryModalMode] = useState<'create' | 'edit'>('create');
  const [selectedEntry, setSelectedEntry] = useState<DailyLogEntry | null>(null);
  const [prefilledDate, setPrefilledDate] = useState<string | undefined>(undefined);

  // User Activity & Missing Days State
  const [myActivity, setMyActivity] = useState<UserLogActivity | null>(() => initialActivity || null);
  const [dayTarget, setDayTarget] = useState<DayTarget | null>(null);
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  const [sendingReasonDate, setSendingReasonDate] = useState<string | null>(null);
  const [openFollowUpDate, setOpenFollowUpDate] = useState<string | null>(null);
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [pendingFollowUpDate, setPendingFollowUpDate] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('reamarc_daily_log_focus');
      if (!raw) return;
      const focus = JSON.parse(raw) as { date?: string; resourceName?: string };
      localStorage.removeItem('reamarc_daily_log_focus');
      if (focus.date) {
        setDatePreset('custom');
        setCustomStartDate(focus.date);
        setCustomEndDate(focus.date);
        setPendingFollowUpDate(focus.date);
      }
      if (focus.resourceName) setSearchQuery(focus.resourceName);
    } catch {
      /* ignore */
    }
  }, []);

  // OCC Warning state
  const [occConflictMessage, setOccConflictMessage] = useState<string | null>(null);

  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  // Per-Column Filters State
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [openFilterColKey, setOpenFilterColKey] = useState<string | null>(null);

  useEffect(() => {
    if (!openFilterColKey) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        !target.closest(`[data-filter-popover="${openFilterColKey}"]`) &&
        !target.closest(`[data-filter-btn="${openFilterColKey}"]`)
      ) {
        setOpenFilterColKey(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [openFilterColKey]);

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('reamarc_daily_log_col_widths');
      if (saved) return JSON.parse(saved);
    } catch {}
    const initial: Record<string, number> = {};
    DEFAULT_COLUMNS.forEach((col) => {
      initial[col.key] = parseInt(col.width || '150', 10);
    });
    return initial;
  });

  const [rowHeights, setRowHeights] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('reamarc_daily_log_row_heights');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableInnerRef = useRef<HTMLDivElement>(null);
  const resizeGuideRef = useRef<HTMLDivElement>(null);
  const resizeTooltipRef = useRef<HTMLDivElement>(null);
  const currentResizingWidthRef = useRef<number>(150);

  const buildFilterParams = useCallback((): GetDailyLogEntriesParams => {
    const params: GetDailyLogEntriesParams = {};

    if (selectedDept && selectedDept !== 'All') {
      params.department = selectedDept;
    }

    if (datePreset === 'today') {
      const t = getTodayIso();
      params.start_date = t;
      params.end_date = t;
    } else if (datePreset === 'week') {
      const bounds = getThisWeekBounds();
      params.start_date = bounds.start;
      params.end_date = bounds.end;
    } else if (datePreset === 'month') {
      params.month_sheet = activeSheet;
    } else if (datePreset === 'custom') {
      if (customStartDate && customEndDate) {
        params.start_date = customStartDate;
        params.end_date = customEndDate;
      }
    }

    return params;
  }, [activeSheet, selectedDept, datePreset, customStartDate, customEndDate]);

  const fetchAbortRef = useRef<AbortController | null>(null);
  const fetchReqIdRef = useRef(0);

  const fetchEntries = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const reqId = ++fetchReqIdRef.current;

    const params = buildFilterParams();
    const paramKey = JSON.stringify(params);
    const cachedEntries = dailyLogService.getCachedEntries(paramKey);
    const hasSoftCache = Boolean(cachedEntries && dailyLogService.hasInitialCache());

    if (hasSoftCache) {
      if (cachedEntries) setEntries(cachedEntries.data);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    setOccConflictMessage(null);
    try {
      const [sheets, cols, logs, activity] = await Promise.all([
        dailyLogService.getSheets({ signal: controller.signal }),
        dailyLogService.getColumns({ signal: controller.signal }),
        dailyLogService.getAllEntries(params, { signal: controller.signal }),
        dailyLogService.getMyLogActivity(7, { signal: controller.signal }).catch(() => null),
      ]);

      if (reqId !== fetchReqIdRef.current) return;

      if (activity) {
        setMyActivity(activity);
        dailyLogService.setCachedActivity(activity);
      }

      if (sheets) {
        dailyLogService.setCachedSheets(sheets);
      }
      if (logs) {
        dailyLogService.setCachedEntries(paramKey, logs);
      }

      const allSheetSet = new Set<string>(sheets || []);
      if (activeSheet) allSheetSet.add(activeSheet);
      const current = getCurrentMonthSheet();
      allSheetSet.add(current);
      (logs || []).forEach((l) => {
        if (l.month_sheet) allSheetSet.add(l.month_sheet);
      });
      const combinedSheets = Array.from(allSheetSet);

      if (combinedSheets.length > 0) {
        setAvailableSheets(combinedSheets);
      }

      if (cols && cols.length > 0) {
        let finalCols = [...cols];
        if (!finalCols.some((c) => c.key === 'department')) {
          const roleIdx = finalCols.findIndex((c) => c.key === 'role');
          const deptCol: DailyLogColumn = {
            key: 'department',
            label: 'Department',
            type: 'text',
            editable: true,
            width: '140',
          };
          if (roleIdx !== -1) {
            finalCols.splice(roleIdx + 1, 0, deptCol);
          } else {
            finalCols.push(deptCol);
          }
        }
        dailyLogService.setCachedColumns(finalCols);
        setColumns(finalCols);
        setColumnWidths((prev) => {
          const next = { ...prev };
          finalCols.forEach((col) => {
            if (!next[col.key]) {
              next[col.key] = parseInt(col.width || '150', 10);
            }
          });
          return next;
        });
      }

      setEntries(logs || []);
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.status === 499) return;
      if (reqId !== fetchReqIdRef.current) return;
      console.error('Failed to fetch daily log entries:', err);
    } finally {
      if (reqId === fetchReqIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [buildFilterParams, activeSheet]);

  useEffect(() => {
    fetchEntries();
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, [fetchEntries]);

  useEffect(() => {
    const onDeleted = () => {
      fetchEntries();
    };
    window.addEventListener('reamarc-member-deleted', onDeleted);
    return () => window.removeEventListener('reamarc-member-deleted', onDeleted);
  }, [fetchEntries]);

  const bannerDate = useMemo(() => {
    if (datePreset === 'today') return getTodayIso();
    if (datePreset === 'custom' && customStartDate && customStartDate === customEndDate) return customStartDate;
    return getTodayIso();
  }, [datePreset, customStartDate, customEndDate]);

  const { getOffDay, holidays, workingSaturdays } = useOffDays();
  const viewingSingleDay =
    datePreset === 'today' || (datePreset === 'custom' && customStartDate === customEndDate);
  const viewingOff = getOffDay(bannerDate);
  const hideLogCreate = viewingSingleDay && viewingOff.isOff;

  const dayTargetAbortRef = useRef<AbortController | null>(null);
  const dayTargetReqIdRef = useRef(0);

  const refreshDayTarget = useCallback(async () => {
    if (!canSubmitLogs) {
      setDayTarget(null);
      return;
    }
    dayTargetAbortRef.current?.abort();
    const controller = new AbortController();
    dayTargetAbortRef.current = controller;
    const reqId = ++dayTargetReqIdRef.current;

    try {
      const target = await dailyLogService.getDayTarget(bannerDate, { signal: controller.signal });
      if (reqId === dayTargetReqIdRef.current) {
        setDayTarget(target);
      }
    } catch (err: any) {
      if (reqId === dayTargetReqIdRef.current && err?.name !== 'AbortError') {
        setDayTarget(null);
      }
    }
  }, [canSubmitLogs, bannerDate]);

  useEffect(() => {
    refreshDayTarget();
  }, [refreshDayTarget]);

  // SWR: Invalidation bus listener for real-time consistency without unmounting
  useCacheInvalidation(['daily-log', 'attendance', 'exceptions'], () => {
    void refreshDayTarget();
    void fetchEntries();
  });

  const followUps = useMemo(() => {
    const list = [...(dayTarget?.follow_ups || [])] as DayTargetFollowUp[];
    list.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    return list;
  }, [dayTarget?.follow_ups]);

  const followUpByDate = useMemo(() => {
    const map = new Map<string, DayTargetFollowUp>();
    followUps.forEach((item) => {
      if (item.date) map.set(item.date, item);
    });
    return map;
  }, [followUps]);

  const extraMissingDates = useMemo(() => {
    return (myActivity?.missing_dates || [])
      .filter((d) => d >= '2026-08-19' && !followUpByDate.has(d))
      .sort((a, b) => a.localeCompare(b));
  }, [myActivity?.missing_dates, followUpByDate]);

  const openFollowUp = useCallback((date: string) => {
    setOpenFollowUpDate(date);
    setShowReasonInput(false);
  }, []);

  const handleNextFollowUp = useCallback(() => {
    const actionable = followUps.filter((item) => item.can_send_reason);
    const pool = actionable.length ? actionable : followUps;
    if (!pool.length) return;
    const idx = pool.findIndex((item) => item.date === openFollowUpDate);
    const next = pool[(idx + 1) % pool.length];
    if (next?.date) openFollowUp(next.date);
  }, [followUps, openFollowUpDate, openFollowUp]);

  const getExportPeriodMeta = () => {
    if (datePreset === 'today') {
      const t = getTodayIso();
      return { periodLabel: 'Today', startDate: t, endDate: t };
    }
    if (datePreset === 'week') {
      const bounds = getThisWeekBounds();
      return { periodLabel: 'This Week (Mon – Sat)', startDate: bounds.start, endDate: bounds.end };
    }
    if (datePreset === 'month') {
      return { periodLabel: `This Month (${activeSheet})` };
    }
    return { periodLabel: 'Custom Range', startDate: customStartDate, endDate: customEndDate };
  };

  const handleExportExcel = async () => {
    if (!canExportLogs || isExporting) return;
    setIsExporting(true);
    try {
      const exportEntries = await dailyLogService.getAllEntries(buildFilterParams());
      if (!exportEntries.length) {
        addToast('Nothing to export', 'No daily log entries match the current date and department filters.', 'warning');
        return;
      }
      const period = getExportPeriodMeta();
      const filename = exportDailyLogWorkbook(exportEntries, columns, {
        ...period,
        department: selectedDept || 'All',
        exportedBy: user?.full_name || user?.name || user?.email || 'Unknown',
        exportedByRole: getRoleLabel(user?.role),
      });
      addToast('Excel downloaded', `Saved ${filename} with ${exportEntries.length} log ${exportEntries.length === 1 ? 'entry' : 'entries'}.`, 'success');
    } catch (err) {
      console.error('Daily log Excel export failed:', err);
      addToast('Export failed', 'Could not download the daily log Excel file. Please try again.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const openAddTimeForDate = useCallback((date: string) => {
    setDatePreset('custom');
    setCustomStartDate(date);
    setCustomEndDate(date);
    setPrefilledDate(date);
    setSelectedEntry(null);
    setEntryModalMode('create');
    setIsEntryModalOpen(true);
  }, []);

  useEffect(() => {
    if (!openFollowUpDate) return;
    if (followUpByDate.has(openFollowUpDate)) return;
    const next = followUps.find((item) => item.can_send_reason) || followUps[0];
    setOpenFollowUpDate(next?.date || null);
    setShowReasonInput(false);
  }, [followUps, followUpByDate, openFollowUpDate]);

  useEffect(() => {
    if (!pendingFollowUpDate) return;
    if (followUpByDate.has(pendingFollowUpDate)) {
      openFollowUp(pendingFollowUpDate);
      setPendingFollowUpDate(null);
    }
  }, [pendingFollowUpDate, followUpByDate, openFollowUp]);

  const openFollowUpItem = openFollowUpDate ? followUpByDate.get(openFollowUpDate) : undefined;
  const followUpActorNames = [
    ...new Set(followUps.map((item) => (item.action_by_name || '').trim()).filter(Boolean)),
  ];
  const followUpActorLabel = followUpActorNames.length === 1 ? ` from ${followUpActorNames[0]}` : '';
  const visibleFollowUpChips = (() => {
    const first = followUps.slice(0, FOLLOW_UP_CHIP_LIMIT);
    if (!openFollowUpItem) return first;
    if (first.some((item) => item.date === openFollowUpItem.date)) return first;
    return [...first.slice(0, Math.max(0, FOLLOW_UP_CHIP_LIMIT - 1)), openFollowUpItem];
  })();
  const hiddenFollowUpCount = Math.max(0, followUps.length - FOLLOW_UP_CHIP_LIMIT);

  const submitFollowUpReason = async (date: string) => {
    const text = (reasonDrafts[date] || '').trim();
    if (text.length < 3) return;
    setSendingReasonDate(date);
    try {
      await logExceptionService.submitReason(date, text);
      addToast('Reason sent', 'Your lead can accept it. This is not a task log.', 'success');
      refreshDayTarget();
      setReasonDrafts((prev) => ({ ...prev, [date]: '' }));
      setShowReasonInput(false);
    } catch (err: any) {
      addToast('Could not send reason', err.message || 'Try again.', 'error');
    } finally {
      setSendingReasonDate(null);
    }
  };

  const handleSheetChange = async (sheetName: string) => {
    setActiveSheet(sheetName);
    setDatePreset('month');
  };

  const handleOpenCreateModal = () => {
    if (hideLogCreate) return;
    setPrefilledDate(undefined);
    setSelectedEntry(null);
    setEntryModalMode('create');
    setIsEntryModalOpen(true);
  };

  const isOwnEntry = useCallback((entry: DailyLogEntry) => {
    const currentUserId = user?.id;
    const currentUserName = (user?.full_name || user?.name || '').trim().toLowerCase();
    
    return Boolean(
      (entry.user_id && currentUserId && entry.user_id === currentUserId) ||
      (entry.resource_name && currentUserName && entry.resource_name.trim().toLowerCase() === currentUserName)
    );
  }, [user]);

  const canEditEntry = useCallback((entry: DailyLogEntry) => {
    if (!isOwnEntry(entry)) return false;

    if (entry.date && isLogDateExpired(entry.date, holidays, workingSaturdays)) {
      return false;
    }

    return true;
  }, [isOwnEntry, holidays, workingSaturdays]);

  const handleOpenEditModal = (entry: DailyLogEntry) => {
    if (!canEditEntry(entry)) return;
    setPrefilledDate(undefined);
    setSelectedEntry(entry);
    setEntryModalMode('edit');
    setIsEntryModalOpen(true);
  };

  const handleEntrySaved = (savedEntry: DailyLogEntry) => {
    const entrySheet = savedEntry.month_sheet;
    if (entrySheet) {
      setAvailableSheets((prev) => (prev.includes(entrySheet) ? prev : [...prev, entrySheet]));
    }

    const params = buildFilterParams();
    const paramKey = JSON.stringify(params);

    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === savedEntry.id);
      let updated: DailyLogEntry[];
      if (idx >= 0) {
        updated = [...prev];
        updated[idx] = savedEntry;
      } else {
        updated = [savedEntry, ...prev];
      }
      dailyLogService.replaceCachedEntries(paramKey, updated);
      dailyLogService.invalidateEntries(paramKey);
      return updated;
    });

    refreshDayTarget();
    dailyLogService.getMyLogActivity(7).then(setMyActivity).catch(() => {});

    if (datePreset === 'month' && entrySheet && entrySheet !== activeSheet) {
      setActiveSheet(entrySheet);
    } else {
      fetchEntries();
    }
  };

  const handleDeleteRow = async (entryId: string) => {
    const entry = entries.find((e) => e.id === entryId);
    const dateStr = entry?.date || 'this date';
    const ok = await confirm({
      title: 'Delete this log entry?',
      description: `This removes the entry from ${dateStr}. This can't be undone.`,
      confirmLabel: 'Delete entry',
      tone: 'danger',
    });
    if (!ok) return;

    const entriesSnapshot = [...entries];
    const dayTargetSnapshot = dayTarget ? { ...dayTarget } : null;
    const params = buildFilterParams();
    const paramKey = JSON.stringify(params);

    const updatedEntries = entriesSnapshot.filter((e) => e.id !== entryId);
    setEntries(updatedEntries);

    if (entry && isOwnEntry(entry) && entry.date === bannerDate && dayTarget) {
      const hours = Number(entry.hours_utilized) || 0;
      setDayTarget((prev) => {
        if (!prev) return null;
        const newLogged = Math.max(0, (prev.logged_hours || 0) - hours);
        const newRemaining = Math.max(0, (prev.expected_hours || 0) - newLogged);
        return {
          ...prev,
          logged_hours: newLogged,
          remaining_hours: newRemaining,
        };
      });
    }

    try {
      await dailyLogService.deleteEntry(entryId);
      dailyLogService.replaceCachedEntries(paramKey, updatedEntries);
      dailyLogService.invalidateEntries(paramKey);
      refreshDayTarget();
      dailyLogService.getMyLogActivity(7).then(setMyActivity).catch(() => {});
      fetchEntries();
    } catch (err: any) {
      console.error('Failed to delete daily log entry:', err);
      setEntries(entriesSnapshot);
      setDayTarget(dayTargetSnapshot);
      dailyLogService.replaceCachedEntries(paramKey, entriesSnapshot);
      addToast('Could not delete entry', err?.message || 'Try again.', 'error');
    }
  };

  const handleColumnResizeStart = (e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnWidths[colKey] || 150;
    currentResizingWidthRef.current = startWidth;

    const handleElement = e.currentTarget as HTMLElement;
    const innerRect = tableInnerRef.current?.getBoundingClientRect();
    const initialHandleLeft = innerRect ? handleElement.getBoundingClientRect().right - innerRect.left : 0;

    if (resizeGuideRef.current) {
      resizeGuideRef.current.style.display = 'block';
      resizeGuideRef.current.style.transform = `translateX(${initialHandleLeft}px)`;
      if (resizeTooltipRef.current) {
        resizeTooltipRef.current.textContent = `${startWidth}px`;
      }
    }
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(90, Math.min(600, startWidth + delta));
      const roundedWidth = Math.round(newWidth);
      currentResizingWidthRef.current = roundedWidth;

      if (resizeGuideRef.current) {
        const currentLeft = initialHandleLeft + (roundedWidth - startWidth);
        resizeGuideRef.current.style.transform = `translateX(${currentLeft}px)`;
        if (resizeTooltipRef.current) {
          resizeTooltipRef.current.textContent = `${roundedWidth}px`;
        }
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (resizeGuideRef.current) {
        resizeGuideRef.current.style.display = 'none';
      }

      const finalWidth = currentResizingWidthRef.current;
      setColumnWidths((prev) => {
        const next = { ...prev, [colKey]: finalWidth };
        try {
          localStorage.setItem('reamarc_daily_log_col_widths', JSON.stringify(next));
        } catch {}
        return next;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const resetColumnWidths = () => {
    const initial: Record<string, number> = {};
    DEFAULT_COLUMNS.forEach((col) => {
      initial[col.key] = parseInt(col.width || '150', 10);
    });
    setColumnWidths(initial);
    try {
      localStorage.removeItem('reamarc_daily_log_col_widths');
    } catch {}
    addToast('Layout reset', 'Column widths restored to defaults.', 'info');
  };

  const resetRowHeights = () => {
    setRowHeights({});
    try {
      localStorage.removeItem('reamarc_daily_log_row_heights');
    } catch {}
    addToast('Layout reset', 'Row heights restored to defaults.', 'info');
  };

  // Summarize (uses ListChecks, restricted to Admin)
  const handleAiSummarize = () => {
    if (!isAdmin) return;
    setIsSummarizing(true);
    setTimeout(() => {
      const totalHours = entries.reduce((acc, curr) => {
        const val = Number(curr.hours_utilized) || 0;
        return acc + val;
      }, 0);
      const completed = entries.filter((e) => e.task_status === 'Completed').length;
      const blockers = entries.filter((e) => e.task_status === 'Blocker').length;
      const uniquePeople = new Set(entries.map((e) => e.resource_name)).size;

      setAiSummary(
        `Department summary (${selectedDept}): ${entries.length} tasks recorded across ${uniquePeople} contributors. Total time logged: ${formatHours(totalHours)} · ${completed} completed, ${blockers} blockers flagged.`
      );
      setIsSummarizing(false);
    }, 800);
  };

  const getUniqueValuesForColumn = (colKey: string): string[] => {
    const set = new Set<string>();
    entries.forEach((e) => {
      const val = (e as any)[colKey];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        set.add(String(val).trim());
      }
    });
    return Array.from(set).sort();
  };

  const [selectedMember, setSelectedMember] = useState<string>('ALL');

  const memberOptions = useMemo(() => {
    const memberMap = new Map<string, { id: string; name: string; isYou: boolean }>();
    entries.forEach((e) => {
      const isYou = isOwnEntry(e);
      const key = e.user_id || (e.resource_name || '').trim().toLowerCase();
      if (!key) return;
      if (!memberMap.has(key)) {
        memberMap.set(key, {
          id: isYou ? '__YOU__' : (e.user_id || e.resource_name || key),
          name: isYou ? 'You' : (e.resource_name || 'Unknown'),
          isYou,
        });
      }
    });
    const others = Array.from(memberMap.values())
      .filter((m) => !m.isYou)
      .sort((a, b) => a.name.localeCompare(b.name));
    const you = Array.from(memberMap.values()).find((m) => m.isYou);
    const list = [{ value: 'ALL', label: 'Everyone' }];
    if (you) list.push({ value: '__YOU__', label: 'You' });
    others.forEach((m) => list.push({ value: m.id, label: m.name }));
    return list;
  }, [entries, isOwnEntry]);

  useEffect(() => {
    if (selectedMember !== 'ALL' && !memberOptions.some((o) => o.value === selectedMember)) {
      setSelectedMember('ALL');
    }
  }, [memberOptions, selectedMember]);

  const filteredEntries = useMemo(() => {
    let result = entries;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((e) =>
        Object.values(e).some((v) => typeof v === 'string' && v.toLowerCase().includes(q))
      );
    }

    if (isLead && selectedMember !== 'ALL') {
      if (selectedMember === '__YOU__') {
        result = result.filter(isOwnEntry);
      } else {
        result = result.filter((e) => e.user_id === selectedMember || e.resource_name === selectedMember);
      }
    }

    Object.entries(columnFilters).forEach(([colKey, filterVal]) => {
      if (!filterVal || filterVal === '__ALL__') return;
      const colDef = columns.find((c) => c.key === colKey);
      if (colDef?.type === 'select') {
        result = result.filter((e) => (e as any)[colKey] === filterVal);
      } else {
        const q = filterVal.toLowerCase();
        result = result.filter((e) => {
          const cellVal = String((e as any)[colKey] || '').toLowerCase();
          return cellVal.includes(q);
        });
      }
    });

    return result;
  }, [entries, searchQuery, isLead, selectedMember, isOwnEntry, columnFilters, columns]);

  const isTeamView = useMemo(() => {
    return filteredEntries.some((e) => !isOwnEntry(e));
  }, [filteredEntries, isOwnEntry]);

  const sheetOptions = useMemo(() => {
    const parseSheetDate = (sheetStr: string) => {
      const parts = sheetStr.split(' - ');
      if (parts.length === 2) {
        const monthName = parts[0].trim();
        const year = parseInt(parts[1].trim(), 10);
        const monthIndex = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ].indexOf(monthName);
        if (monthIndex !== -1 && !isNaN(year)) {
          return new Date(year, monthIndex, 1).getTime();
        }
      }
      return 0;
    };

    const sorted = [...availableSheets].sort((a, b) => parseSheetDate(b) - parseSheetDate(a));
    return sorted.map((sheet) => ({
      value: sheet,
      label: sheet.replace(' - ', ' '),
    }));
  }, [availableSheets]);

  // Grouped entries for the log view timeline
  const groupedEntries = useMemo(() => {
    const groups: { date: string; entries: DailyLogEntry[]; totalHours: number }[] = [];
    const map = new Map<string, DailyLogEntry[]>();

    filteredEntries.forEach((entry) => {
      const d = entry.date || 'Unknown';
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(entry);
    });

    const sortedDates = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));
    sortedDates.forEach((date) => {
      const dayEntries = map.get(date)!;
      const totalHours = dayEntries.reduce((acc, curr) => acc + (Number(curr.hours_utilized) || 0), 0);
      groups.push({ date, entries: dayEntries, totalHours });
    });

    return groups;
  }, [filteredEntries]);

  const rowVirtualizer = useVirtualizer({
    count: filteredEntries.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: (index) => rowHeights[filteredEntries[index]?.id] || DEFAULT_ROW_HEIGHT,
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalVirtualSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start ?? 0 : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? totalVirtualSize - (virtualRows[virtualRows.length - 1]?.end ?? 0)
      : 0;

  const totalTableWidth = useMemo(() => {
    return 56 + columns.reduce((sum, col) => sum + (columnWidths[col.key] || 150), 0) + 72;
  }, [columns, columnWidths]);

  const departmentOptions = useMemo(() => {
    if (isAdmin || isHR || isOperations) {
      const opts = departments.map((dept) => ({ value: dept, label: dept }));
      return [{ value: 'All', label: 'All Departments' }, ...opts];
    }
    if (isLead) {
      const leadDepts = userDepts.length > 0 ? userDepts : (userDept ? [userDept] : []);
      const opts = leadDepts.map((dept) => ({ value: dept, label: dept }));
      if (leadDepts.length > 1) {
        return [{ value: 'All', label: 'All Assigned Departments' }, ...opts];
      }
      return opts;
    }
    return [];
  }, [departments, isAdmin, isHR, isOperations, isLead, userDepts, userDept]);

  const modalCurrentUser = useMemo(
    () =>
      user
        ? {
            name: user.name,
            full_name: user.full_name,
            role: user.role,
            department: user.department,
          }
        : null,
    [user]
  );

  const modalExistingEntries = useMemo(() => {
    const uid = user?.id;
    const uname = (user?.full_name || user?.name || '').trim().toLowerCase();
    return entries.filter((e) => {
      if (uid && e.user_id === uid) return true;
      if (uname && (e.resource_name || '').trim().toLowerCase() === uname) return true;
      return false;
    });
  }, [entries, user?.id, user?.full_name, user?.name]);

  const rangeOptions: SegmentedOption[] = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
    {
      value: 'custom',
      label:
        datePreset === 'custom'
          ? `${formatChipDate(customStartDate)} – ${formatChipDate(customEndDate)}`
          : 'Custom range',
    },
  ];

  const handleRangeChange = (val: string) => {
    if (val === 'custom') {
      setIsCustomRangeOpen(true);
      return;
    }
    setDatePreset(val as 'today' | 'week' | 'month');
  };

  const formatTimelineDayHeader = (isoDate: string): string => {
    const today = getTodayIso();
    if (isoDate === today) return 'Today';
    const parts = isoDate.split('-').map(Number);
    if (parts.length !== 3) return isoDate;
    const [y, m, d] = parts;
    const dt = new Date(y, m - 1, d);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[dt.getDay()]}, ${d} ${MONTH_SHORT[m - 1]}`;
  };

  return (
    <div className="flex flex-col h-full bg-canvas text-fg select-none overflow-hidden p-6 lg:px-8 lg:py-6">
      {/* ─── Page Header ─── */}
      <PageHeader
        title="Daily log"
        description={
          isAdmin || isOperations
            ? 'Review and manage team daily logs and hours logged across departments.'
            : 'Record what you worked on. Logged hours are compared with your time at work.'
        }
        actions={
          <>

            <Button
              variant="secondary"
              size="md"
              icon={viewMode === 'log' ? TableIcon : LayoutDashboard}
              onClick={() => setViewMode((v) => (v === 'log' ? 'sheet' : 'log'))}
            >
              {viewMode === 'log' ? 'Open sheet view' : 'Back to log view'}
            </Button>
          </>
        }
      />

      {/* ─── Shift Summary Strip (Mock 06 Reference, only for employees who log shifts) ─── */}
      {!isAdmin && !isOperations && (
        <ShiftTasksTracker
          dayTarget={dayTarget}
          loading={isLoading && !dayTarget}
          variant="strip"
        />
      )}

      {/* ─── Off-Day Warning Banner ─── */}
      {hideLogCreate && (
        <div className="mb-4 shrink-0">
          <OffDayBanner info={viewingOff} date={bannerDate} />
        </div>
      )}

      {/* ─── Follow-Up / Clarification Callout ─── */}
      {canSubmitLogs && followUps.length > 0 && openFollowUpItem && (
        <div className="mb-4 shrink-0">
          <Callout
            variant="warning"
            icon={ClipboardList}
            title={
              openFollowUpItem.action_by_name
                ? `${openFollowUpItem.action_by_name} asked for a reason:`
                : `Reason requested${followUpActorLabel}:`
            }
            action={
              openFollowUpItem.can_send_reason ? (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openAddTimeForDate(openFollowUpItem.date)}
                  >
                    Add time
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowReasonInput((p) => !p)}
                  >
                    {showReasonInput ? 'Cancel' : 'Send reason'}
                  </Button>
                </div>
              ) : null
            }
          >
            <span>
              {formatChipDate(openFollowUpItem.date)} · logged{' '}
              {formatHours(Number(openFollowUpItem.logged_hours) || 0)}, at work{' '}
              {formatHours(Number(openFollowUpItem.worked_hours) || 0)}.
            </span>

            {/* Multiple Follow-up chips if available */}
            {followUps.length > 1 && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className="text-micro text-fg-muted font-medium">Other dates:</span>
                {visibleFollowUpChips.map((item) => (
                  <button
                    key={item.date}
                    type="button"
                    onClick={() => openFollowUp(item.date)}
                    className={cn(
                      'px-2 py-0.5 rounded-sm text-micro font-medium cursor-pointer border transition-colors',
                      item.date === openFollowUpDate
                        ? 'bg-warning-fg text-surface border-warning-fg font-semibold'
                        : 'bg-surface border-border text-fg-2 hover:bg-hover'
                    )}
                  >
                    {formatChipDate(item.date)}
                  </button>
                ))}
                {hiddenFollowUpCount > 0 && (
                  <button
                    type="button"
                    onClick={handleNextFollowUp}
                    className="text-micro font-medium text-warning-fg hover:underline cursor-pointer"
                  >
                    +{hiddenFollowUpCount} more
                  </button>
                )}
              </div>
            )}

            {/* Inline Send Reason Input */}
            {openFollowUpItem.can_send_reason && showReasonInput && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-warning-bd/40">
                <input
                  type="text"
                  value={reasonDrafts[openFollowUpItem.date] || ''}
                  onChange={(e) =>
                    setReasonDrafts((prev) => ({ ...prev, [openFollowUpItem.date]: e.target.value }))
                  }
                  placeholder="e.g. Client meeting 2h..."
                  className="flex-1 px-3 py-1.5 h-8 rounded-md bg-surface border border-warning-bd text-small text-fg focus-visible:focus-ring"
                />
                <Button
                  variant="primary"
                  size="sm"
                  disabled={
                    sendingReasonDate === openFollowUpItem.date ||
                    !(reasonDrafts[openFollowUpItem.date] || '').trim()
                  }
                  loading={sendingReasonDate === openFollowUpItem.date}
                  onClick={() => submitFollowUpReason(openFollowUpItem.date)}
                >
                  Send reason
                </Button>
              </div>
            )}
          </Callout>
        </div>
      )}

      {/* ─── Missing Work Log Banner ─── */}
      {!isAdmin && !isOperations && extraMissingDates.length > 0 && (
        <div className="mb-4 shrink-0">
          <Callout
            variant="warning"
            icon={AlertTriangle}
            className="items-center py-1.5"
            action={
              <Button
                variant="secondary"
                size="sm"
                icon={Plus}
                className="shrink-0"
                onClick={() => {
                  setPrefilledDate(extraMissingDates[0]);
                  setSelectedEntry(null);
                  setEntryModalMode('create');
                  setIsEntryModalOpen(true);
                }}
              >
                Log for {formatChipDate(extraMissingDates[0])}
              </Button>
            }
          >
            <div className="truncate">
              <span className="font-semibold text-fg">Pending log submission</span>
              <span className="text-fg-2"> · You haven't logged {formatMissingDatesList(extraMissingDates)}.</span>
            </div>
          </Callout>
        </div>
      )}

      {/* ─── OCC Conflict Warning ─── */}
      {occConflictMessage && (
        <div className="mb-4 shrink-0">
          <Callout
            variant="warning"
            icon={AlertTriangle}
            title="Version conflict:"
            action={
              <Button variant="secondary" size="sm" icon={RotateCw} onClick={fetchEntries}>
                Refresh view
              </Button>
            }
          >
            {occConflictMessage}
          </Callout>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PRESENTATION 1: LOG VIEW (DEFAULT FOR MEMBERS & LEADS, MOCK 06)
         ───────────────────────────────────────────────────────────── */}
      {viewMode === 'log' && (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 overflow-hidden">
          {/* Left Card: Add Entry Form (Inline, only for non-admin & non-operations members who log daily shifts) */}
          {!isAdmin && !isOperations && (
            <div className="w-full lg:w-[440px] shrink-0 bg-surface border border-border rounded-lg shadow-xs flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-surface shrink-0">
                <h3 className="text-h3 font-semibold text-fg">Add entry</h3>
                <span className="text-small text-fg-muted font-numeric">{activeSheet}</span>
              </div>
              <div className="p-4 flex-1 overflow-y-auto">
                <DailyLogForm
                  mode="create"
                  prefilledDate={prefilledDate}
                  columns={columns}
                  activeSheet={activeSheet}
                  currentUser={modalCurrentUser}
                  existingEntries={modalExistingEntries}
                  onSaved={handleEntrySaved}
                  onRefreshRequired={fetchEntries}
                  layout="card"
                />
              </div>
            </div>
          )}

          {/* Right Card: Timeline of Entries */}
          <div className="flex-1 min-w-0 bg-surface border border-border rounded-lg shadow-xs flex flex-col overflow-hidden">
            {/* Toolbar: Range SegmentedControl, Summarize, Export */}
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap shrink-0">
              <div className="flex items-center gap-2">
                {/* Range SegmentedControl with Anchored Custom Range Popover */}
                <Popover open={isCustomRangeOpen} onOpenChange={setIsCustomRangeOpen}>
                  <PopoverAnchor asChild>
                    <div className="relative inline-flex">
                      <SegmentedControl
                        value={datePreset}
                        onValueChange={handleRangeChange}
                        options={rangeOptions}
                      />
                    </div>
                  </PopoverAnchor>
                  <PopoverContent
                    className="p-0 border-0 shadow-lg w-auto rounded-lg z-[var(--z-popover,100)]"
                    align="end"
                    sideOffset={6}
                  >
                    <DateRangeCalendarPicker
                      initialStartDate={customStartDate}
                      initialEndDate={customEndDate}
                      onCancel={() => setIsCustomRangeOpen(false)}
                      onApply={({ startDate, endDate }) => {
                        setCustomStartDate(startDate);
                        setCustomEndDate(endDate);
                        setDatePreset('custom');
                        setIsCustomRangeOpen(false);
                      }}
                    />
                  </PopoverContent>
                </Popover>

                {/* Member filter: Team leads only */}
                {isLead && (
                  <div className="w-[140px] shrink-0">
                    <CustomSelect
                      size="sm"
                      value={selectedMember}
                      onChange={setSelectedMember}
                      options={memberOptions}
                      icon={User}
                    />
                  </div>
                )}
              </div>

              {/* Action Buttons: Summarize (Admin) & Export */}
              <div className="flex items-center gap-2 ml-auto">
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={ListChecks}
                    loading={isSummarizing}
                    disabled={entries.length === 0}
                    onClick={handleAiSummarize}
                  >
                    Summarize
                  </Button>
                )}

                {canExportLogs && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Download}
                    loading={isExporting}
                    onClick={handleExportExcel}
                  >
                    Export
                  </Button>
                )}
              </div>
            </div>

            {/* Timeline Entries Content */}
            <div className="p-4 overflow-y-auto flex-1">
              {/* Neutral Callout for AI Summary */}
              {isAdmin && aiSummary && (
                <Callout
                  variant="neutral"
                  icon={ListChecks}
                  title="Department summary"
                  action={
                    <Button variant="ghost" size="sm" onClick={() => setAiSummary(null)}>
                      Dismiss
                    </Button>
                  }
                  className="mb-4"
                >
                  {aiSummary}
                </Callout>
              )}

              {isLoading ? (
                /* Skeleton loader for timeline: 3 day groups */
                <div className="space-y-6 animate-pulse p-2">
                  {[1, 2].map((g) => (
                    <div key={g} className="space-y-3">
                      <div className="flex justify-between">
                        <div className="h-4 w-28 bg-skel rounded" />
                        <div className="h-4 w-32 bg-skel rounded" />
                      </div>
                      {[1, 2, 3].map((r) => (
                        <div key={r} className="flex gap-3">
                          <div className="w-16 h-4 bg-skel rounded shrink-0 mt-1" />
                          <div className="flex-1 space-y-2">
                            <div className="flex justify-between">
                              <div className="h-4 w-3/5 bg-skel rounded" />
                              <div className="h-4 w-12 bg-skel rounded" />
                            </div>
                            <div className="h-3 w-1/3 bg-skel rounded" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : filteredEntries.length === 0 ? (
                <EmptyState
                  title="Nothing logged today"
                  description="Add what you worked on so your day is accounted for."
                  action={
                    !isAdmin && !isOperations && !hideLogCreate ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleOpenCreateModal}
                      >
                        Add entry
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="space-y-6">
                  {groupedEntries.map((group) => {
                    return (
                      <div key={group.date} className="space-y-3">
                        {/* Day Group Heading */}
                        <div className="flex items-center justify-between pb-1.5 border-b border-border">
                          <span className="text-ui font-semibold text-fg">
                            {formatTimelineDayHeader(group.date)}
                          </span>
                          <span className="text-small text-fg-muted font-numeric tabular-nums">
                            {group.entries.length}{' '}
                            {group.entries.length === 1 ? 'entry' : 'entries'} ·{' '}
                            {formatHours(group.totalHours)}
                            {isTeamView && (() => {
                              const distinctPeople = new Set(
                                group.entries.map((e) => e.user_id || (e.resource_name || '').trim().toLowerCase())
                              ).size;
                              return ` · ${distinctPeople} ${distinctPeople === 1 ? 'person' : 'people'}`;
                            })()}
                          </span>
                        </div>

                        {/* Day Timeline Rows */}
                        <div className="space-y-1">
                          {group.entries.map((entry) => {
                            const isEditable = canEditEntry(entry);
                            const hoursNum = Number(entry.hours_utilized) || 0;

                            return (
                              <div
                                key={entry.id}
                                onClick={() => isEditable && handleOpenEditModal(entry)}
                                className={cn(
                                  'flex gap-3.5 group rounded-md p-2 -mx-2 transition-colors select-none',
                                  isEditable && 'hover:bg-hover cursor-pointer'
                                )}
                              >
                                {/* Hours duration label */}
                                <div className="w-16 shrink-0 text-small text-fg-muted font-numeric tabular-nums pt-0.5">
                                  {formatHours(hoursNum)}
                                </div>

                                {/* Timeline Line & Dot */}
                                <div className="flex flex-col items-center shrink-0">
                                  <span className="w-2.5 h-2.5 rounded-full border-2 border-accent bg-surface mt-1 shrink-0" />
                                  <span className="w-px flex-1 bg-border my-1" />
                                </div>

                                {/* Content Details */}
                                <div className="flex-1 min-w-0 pb-2">
                                  <div className="flex items-start justify-between gap-3">
                                    <h4 className="text-ui font-medium text-fg line-clamp-2 leading-snug group-hover:text-accent-text transition-colors">
                                      {entry.task_description}
                                    </h4>
                                    <span className="text-ui font-semibold font-numeric tabular-nums text-fg shrink-0">
                                      {formatHours(hoursNum)}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    {isTeamView && entry.resource_name && (
                                      <>
                                        <span className="text-small font-semibold text-fg">
                                          {entry.resource_name}
                                        </span>
                                        <span className="text-fg-faint">·</span>
                                      </>
                                    )}
                                    <span className="text-small text-fg-muted font-medium">
                                      {entry.client_project || 'Internal agency work'}
                                    </span>
                                    <span className="text-fg-faint">·</span>
                                    <StatusPill status={entry.task_status} />
                                    <span className="text-small px-1.5 py-0.5 rounded-sm border border-border bg-subtle text-fg-2 font-medium">
                                      {entry.task_type === 'Scheduled Task'
                                        ? 'Scheduled'
                                        : entry.task_type === 'Runtime Task'
                                        ? 'Runtime'
                                        : entry.task_type}
                                    </span>
                                    {entry.deliverables && (
                                      <span className="inline-flex items-center gap-1 text-micro text-accent-text font-medium">
                                        <Paperclip size={11} /> Deliverables
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PRESENTATION 2: SHEET VIEW (FULL CONFIGURABLE TABLE, MOCK 06)
         ───────────────────────────────────────────────────────────── */}
      {viewMode === 'sheet' && (
        <div className="flex-1 min-h-0 flex flex-col bg-surface border border-border rounded-lg shadow-xs overflow-hidden">
          {/* Table Toolbar */}
          <div className="p-3 border-b border-border flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 shrink-0 bg-surface">
            {/* Left group / Mobile rows 1-3 */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-2 flex-1 min-w-0">
              {/* Row 1 at mobile / left on desktop: Search */}
              <div className="relative w-full lg:w-auto lg:min-w-[180px] lg:max-w-[320px] flex-1">
                <Search size={14} className="text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-8 py-1.5 h-8 bg-canvas border border-border-strong rounded-md text-ui text-fg placeholder:text-fg-faint focus-visible:focus-ring"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg p-0.5 cursor-pointer"
                    title="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Row 2 at mobile: Range control (scrolls horizontally) */}
              <div className="overflow-x-auto shrink-0 py-0.5">
                <Popover open={isCustomRangeOpen} onOpenChange={setIsCustomRangeOpen}>
                  <PopoverAnchor asChild>
                    <div className="relative inline-flex">
                      <SegmentedControl
                        value={datePreset}
                        onValueChange={handleRangeChange}
                        options={rangeOptions}
                      />
                    </div>
                  </PopoverAnchor>
                  <PopoverContent
                    className="p-0 border-0 shadow-lg w-auto rounded-lg z-[var(--z-popover,100)]"
                    align="end"
                    sideOffset={6}
                  >
                    <DateRangeCalendarPicker
                      initialStartDate={customStartDate}
                      initialEndDate={customEndDate}
                      onCancel={() => setIsCustomRangeOpen(false)}
                      onApply={({ startDate, endDate }) => {
                        setCustomStartDate(startDate);
                        setCustomEndDate(endDate);
                        setDatePreset('custom');
                        setIsCustomRangeOpen(false);
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Row 3 at mobile: Month & Dept selects sit 2-up */}
              <div
                className={cn(
                  'grid gap-2 w-full lg:w-auto lg:flex lg:items-center shrink-0',
                  departmentOptions.filter((o) => o.value !== 'All').length > 1 ? 'grid-cols-2' : 'grid-cols-1'
                )}
              >
                <div className="w-full lg:w-[160px]">
                  <CustomSelect
                    value={datePreset === 'month' ? activeSheet : ''}
                    onChange={handleSheetChange}
                    options={sheetOptions}
                    placeholder="Month"
                    icon={CalendarIcon}
                  />
                </div>
                {departmentOptions.filter((o) => o.value !== 'All').length > 1 && (
                  <div className="w-full lg:w-[180px]">
                    <CustomSelect
                      value={selectedDept}
                      onChange={setSelectedDept}
                      options={departmentOptions}
                      placeholder="Department"
                      icon={Layers}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Right Tools in Sheet View / Row 4 at mobile: right-aligned actions */}
            <div className="flex items-center gap-1.5 shrink-0 justify-end lg:ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton
                    variant="secondary"
                    size="md"
                    icon={MoreHorizontal}
                    label="More options"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={resetColumnWidths}>
                    <Columns3 size={14} className="mr-2 text-fg-muted" />
                    <span>Reset column widths</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={resetRowHeights}>
                    <Rows3 size={14} className="mr-2 text-fg-muted" />
                    <span>Reset row heights</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={fetchEntries}>
                    <RotateCw size={14} className="mr-2 text-fg-muted" />
                    <span>Refresh</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {isAdmin && (
                <Button
                  variant="ghost"
                  size="md"
                  icon={ListChecks}
                  loading={isSummarizing}
                  disabled={entries.length === 0}
                  onClick={handleAiSummarize}
                >
                  Summarize
                </Button>
              )}

              {canExportLogs && (
                <Button
                  variant="secondary"
                  size="md"
                  icon={Download}
                  loading={isExporting}
                  disabled={isExporting || isLoading}
                  onClick={handleExportExcel}
                >
                  Export
                </Button>
              )}

              {!isAdmin && !isOperations && !hideLogCreate && (
                <Button
                  variant="primary"
                  size="md"
                  icon={Plus}
                  onClick={handleOpenCreateModal}
                  disabled={isLoading || isEntryModalOpen}
                >
                  Add entry
                </Button>
              )}
            </div>
          </div>

          {/* AI Summary Banner in Sheet View */}
          {isAdmin && aiSummary && (
            <div className="px-4 py-2 border-b border-border bg-subtle/40">
              <Callout
                variant="neutral"
                icon={ListChecks}
                title="Department summary"
                action={
                  <Button variant="ghost" size="sm" onClick={() => setAiSummary(null)}>
                    Dismiss
                  </Button>
                }
              >
                {aiSummary}
              </Callout>
            </div>
          )}

          {/* Virtualized Table Container */}
          <div
            ref={tableContainerRef}
            className="flex-1 min-h-0 overflow-x-auto overflow-y-auto bg-surface relative w-full flex flex-col"
          >
            <div
              ref={tableInnerRef}
              style={{
                width: `${totalTableWidth}px`,
                minWidth: `${totalTableWidth}px`,
              }}
              className="min-w-full flex flex-col relative"
            >
              {/* Column Resize Visual Guide */}
              <div
                ref={resizeGuideRef}
                style={{ display: 'none', left: 0 }}
                className="absolute top-0 bottom-0 w-0.5 bg-accent z-40 pointer-events-none"
              >
                <div
                  ref={resizeTooltipRef}
                  className="absolute top-2 -left-6 px-1.5 py-0.5 bg-accent text-accent-fg text-micro font-medium rounded shadow-md pointer-events-none select-none"
                />
              </div>

              <table
                className="border-separate border-spacing-0 text-small text-left table-fixed w-full"
                style={{ width: `${totalTableWidth}px`, minWidth: `${totalTableWidth}px` }}
              >
                <thead className="sticky top-0 z-30 shadow-xs">
                  <tr className="bg-canvas text-fg-muted font-medium text-small border-b border-border">
                    <th
                      style={{ width: '56px', minWidth: '56px', maxWidth: '56px' }}
                      className="p-2 text-center font-numeric text-small font-medium text-fg-muted border-b border-r border-border sticky top-0 z-20 select-none bg-canvas"
                    >
                      #
                    </th>
                    {columns.map((col) => {
                      const colW = columnWidths[col.key] || 150;
                      const isFilterable = !NON_FILTERABLE_KEYS.has(col.key);
                      const hasActiveFilter = isFilterable && Boolean(columnFilters[col.key]);
                      const isFilterOpen = isFilterable && openFilterColKey === col.key;
                      const existingUniqueValues = isFilterable ? getUniqueValuesForColumn(col.key) : [];

                      return (
                        <th
                          key={col.key}
                          style={{ width: `${colW}px`, minWidth: `${colW}px` }}
                          className="sticky top-0 z-20 p-2 font-medium border-b border-r border-border bg-canvas text-fg-muted relative select-none hover:bg-hover transition-colors"
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="truncate text-small font-medium text-fg" title={col.label}>
                              {col.label}
                            </span>
                            {isFilterable && (
                              <button
                                type="button"
                                data-filter-btn={col.key}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenFilterColKey(isFilterOpen ? null : col.key);
                                }}
                                className={cn(
                                  'p-1 rounded transition-colors cursor-pointer shrink-0',
                                  hasActiveFilter
                                    ? 'bg-accent text-accent-fg font-semibold'
                                    : 'text-fg-muted hover:text-fg hover:bg-hover'
                                )}
                                title={`Filter by ${col.label}`}
                              >
                                <Filter size={12} />
                              </button>
                            )}
                          </div>

                          {/* Column Resize Handle */}
                          <div
                            onMouseDown={(e) => handleColumnResizeStart(e, col.key)}
                            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-accent/80 z-20"
                          />

                          {/* Popover Filter Menu */}
                          {isFilterOpen && (
                            <div
                              data-filter-popover={col.key}
                              onClick={(e) => e.stopPropagation()}
                              className="absolute left-0 top-full mt-1 z-50 w-52 bg-surface border border-border rounded-lg shadow-md p-2.5 space-y-2 font-normal"
                            >
                              <div className="flex items-center justify-between pb-1 border-b border-border">
                                <span className="text-micro font-medium text-fg-muted">Filter {col.label}</span>
                                {hasActiveFilter && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setColumnFilters((prev) => {
                                        const next = { ...prev };
                                        delete next[col.key];
                                        return next;
                                      });
                                      setOpenFilterColKey(null);
                                    }}
                                    className="text-micro text-danger-fg hover:underline font-medium cursor-pointer"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>

                              <input
                                type="text"
                                placeholder="Search value..."
                                value={columnFilters[col.key] || ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setColumnFilters((prev) => {
                                    if (!v) {
                                      const next = { ...prev };
                                      delete next[col.key];
                                      return next;
                                    }
                                    return { ...prev, [col.key]: v };
                                  });
                                }}
                                className="w-full px-2 py-1 text-small bg-canvas border border-border-strong rounded-md text-fg focus-visible:focus-ring"
                              />

                              {existingUniqueValues.length > 0 && (
                                <div className="max-h-36 overflow-y-auto space-y-0.5 pr-1">
                                  {existingUniqueValues.map((val) => {
                                    const isSelected = columnFilters[col.key] === val;
                                    return (
                                      <button
                                        key={val}
                                        type="button"
                                        onClick={() => {
                                          setColumnFilters((prev) => ({ ...prev, [col.key]: val }));
                                          setOpenFilterColKey(null);
                                        }}
                                        className={cn(
                                          'w-full text-left px-2 py-1 rounded text-small truncate transition-colors cursor-pointer',
                                          isSelected
                                            ? 'bg-accent-soft text-accent-text font-medium'
                                            : 'text-fg-2 hover:bg-hover'
                                        )}
                                      >
                                        {val}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </th>
                      );
                    })}
                    <th
                      style={{ width: '72px', minWidth: '72px' }}
                      className="p-2 text-center font-medium text-fg-muted border-b border-border sticky top-0 z-20 bg-canvas"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-normal">
                  {isLoading ? (
                    Array.from({ length: 12 }).map((_, rIdx) => (
                      <tr
                        key={`skel-row-${rIdx}`}
                        style={{ height: `${DEFAULT_ROW_HEIGHT}px` }}
                        className="animate-pulse"
                      >
                        <td className="p-2 text-center border-b border-r border-border">
                          <div className="w-4 h-3 bg-skel rounded mx-auto" />
                        </td>
                        {columns.map((col, cIdx) => {
                          const colW = columnWidths[col.key] || 150;
                          const widthPercent = ((rIdx * 19 + cIdx * 29) % 36) + 48;
                          return (
                            <td
                              key={`skel-${rIdx}-${col.key}`}
                              style={{ width: `${colW}px`, minWidth: `${colW}px` }}
                              className="p-2 border-b border-r border-border"
                            >
                              <div
                                className="h-3.5 bg-skel rounded"
                                style={{ width: `${widthPercent}%` }}
                              />
                            </td>
                          );
                        })}
                        <td className="p-2 text-center border-b border-border">
                          <div className="w-8 h-3.5 bg-skel rounded mx-auto" />
                        </td>
                      </tr>
                    ))
                  ) : filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length + 2} className="py-16 text-center">
                        <EmptyState
                          title="No entries found"
                          description="No daily logs match the current date and department filter."
                          action={
                            !isAdmin && !isOperations && !hideLogCreate ? (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={handleOpenCreateModal}
                              >
                                Add entry
                              </Button>
                            ) : undefined
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    <>
                      {paddingTop > 0 && (
                        <tr style={{ height: `${paddingTop}px` }} aria-hidden="true">
                          <td colSpan={columns.length + 2} style={{ height: `${paddingTop}px`, padding: 0, border: 0 }} />
                        </tr>
                      )}
                      {virtualRows.map((virtualRow) => {
                        const row = filteredEntries[virtualRow.index];
                        if (!row) return null;
                        const rowH = rowHeights[row.id] || DEFAULT_ROW_HEIGHT;
                        const rowFollowUp = canEditEntry(row) ? followUpByDate.get(row.date) : undefined;

                        return (
                          <tr
                            key={row.id}
                            ref={rowVirtualizer.measureElement}
                            data-index={virtualRow.index}
                            style={{ height: `${rowH}px` }}
                            onDoubleClick={(e) => {
                              const target = e.target as HTMLElement;
                              if (target && target.closest('button, a, input, select')) return;
                              if (canEditEntry(row)) {
                                handleOpenEditModal(row);
                              }
                            }}
                            className={cn(
                              'hover:bg-hover transition-colors group',
                              canEditEntry(row) && 'cursor-pointer',
                              rowFollowUp && 'bg-warning-bg/40'
                            )}
                            title={canEditEntry(row) ? 'Double-click to edit your log entry' : undefined}
                          >
                            {/* Row Index */}
                            <td className="p-2 text-center font-numeric text-small font-medium text-fg-muted border-b border-r border-border bg-subtle/30 select-none">
                              {virtualRow.index + 1}
                            </td>

                            {/* Column Cells */}
                            {columns.map((col) => {
                              const val = (row as any)[col.key] || row.custom_fields?.[col.key];

                              if (col.key === 'date') {
                                const dateStr = String(val || row.date || '');
                                return (
                                  <td
                                    key={col.key}
                                    className="p-2 border-b border-r border-border overflow-hidden text-ellipsis whitespace-nowrap text-fg font-medium font-numeric"
                                    title={dateStr}
                                  >
                                    {dateStr ? (
                                      <span className="inline-flex items-center gap-1.5 min-w-0">
                                        {rowFollowUp ? (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openFollowUp(row.date);
                                            }}
                                            className="inline-flex items-center gap-1.5 min-w-0 cursor-pointer text-warning-fg"
                                            title="Follow-up pending"
                                          >
                                            <span className="w-1.5 h-1.5 rounded-full bg-warning-dot shrink-0" />
                                            <span className="truncate">{dateStr}</span>
                                          </button>
                                        ) : (
                                          <span className="truncate">{dateStr}</span>
                                        )}
                                      </span>
                                    ) : (
                                      <span className="text-fg-faint italic">—</span>
                                    )}
                                  </td>
                                );
                              }

                              if (col.key === 'task_status') {
                                return (
                                  <td
                                    key={col.key}
                                    className="p-2 border-b border-r border-border overflow-hidden text-ellipsis whitespace-nowrap"
                                  >
                                    <StatusPill status={String(val || 'Incomplete')} />
                                  </td>
                                );
                              }

                              if (col.key === 'task_type') {
                                const typeStr = String(val || 'Scheduled Task');
                                return (
                                  <td
                                    key={col.key}
                                    className="p-2 border-b border-r border-border overflow-hidden text-ellipsis whitespace-nowrap"
                                  >
                                    <span className="inline-flex items-center text-small px-2 py-0.5 rounded-sm border border-border bg-subtle text-fg-2 font-medium">
                                      {typeStr === 'Scheduled Task' ? 'Scheduled' : typeStr === 'Runtime Task' ? 'Runtime' : typeStr}
                                    </span>
                                  </td>
                                );
                              }

                              if (col.key === 'task_description') {
                                const desc = String(val || '');
                                return (
                                  <td
                                    key={col.key}
                                    className="p-2 border-b border-r border-border"
                                    title={desc}
                                  >
                                    {desc ? (
                                      <span className="line-clamp-2 text-fg leading-snug">{desc}</span>
                                    ) : (
                                      <span className="text-fg-faint italic">—</span>
                                    )}
                                  </td>
                                );
                              }

                              if (col.key === 'deliverables') {
                                if (!val || String(val).trim() === '') {
                                  return (
                                    <td
                                      key={col.key}
                                      className="p-2 border-b border-r border-border text-fg-faint italic"
                                    >
                                      —
                                    </td>
                                  );
                                }

                                const valStr = String(val);
                                const rawParts = valStr.split(/\s*\|\s*|\n/).map((s) => s.trim()).filter(Boolean);

                                return (
                                  <td
                                    key={col.key}
                                    className="p-2 border-b border-r border-border overflow-hidden"
                                  >
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {rawParts.map((item, itemIdx) => {
                                        const mdMatch = item.match(/^\[(.*?)\]\((.*?)\)$/);
                                        if (mdMatch) {
                                          const label = mdMatch[1];
                                          const url = mdMatch[2];
                                          const isFile = url.startsWith('/uploads') || url.includes('/uploads/');
                                          const fileName = label.replace(/^File:\s*/i, '') || 'Attachment';

                                          return (
                                            <button
                                              key={itemIdx}
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                downloadFileAttachment(url, fileName);
                                              }}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-subtle hover:bg-hover text-accent-text border border-border text-small font-medium transition cursor-pointer truncate max-w-[160px]"
                                              title={`Download: ${fileName}`}
                                            >
                                              {isFile ? <Download size={12} /> : <Paperclip size={12} />}
                                              <span className="truncate">{fileName}</span>
                                            </button>
                                          );
                                        }

                                        if (item.startsWith('/uploads') || item.includes('/uploads/')) {
                                          const fileName = item.split('/').pop() || 'Attachment';
                                          return (
                                            <button
                                              key={itemIdx}
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                downloadFileAttachment(item, fileName);
                                              }}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-subtle hover:bg-hover text-accent-text border border-border text-small font-medium transition cursor-pointer truncate max-w-[160px]"
                                              title={`Download: ${fileName}`}
                                            >
                                              <Download size={12} />
                                              <span className="truncate">{fileName}</span>
                                            </button>
                                          );
                                        }

                                        const safeHref = toSafeHttpsUrl(item);
                                        if (safeHref) {
                                          return (
                                            <a
                                              key={itemIdx}
                                              href={safeHref}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              onClick={(e) => e.stopPropagation()}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-subtle hover:bg-hover text-accent-text border border-border text-small font-medium transition cursor-pointer truncate max-w-[160px]"
                                              title={item}
                                            >
                                              <ExternalLink size={12} />
                                              <span className="truncate">{item.replace(/^https?:\/\/(www\.)?/, '')}</span>
                                            </a>
                                          );
                                        }

                                        return (
                                          <span key={itemIdx} className="text-fg-2 text-small truncate">
                                            {item}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </td>
                                );
                              }

                              if (col.key === 'role') {
                                const roleStr = String(val || row.role || 'Team Member');
                                return (
                                  <td
                                    key={col.key}
                                    className="p-2 border-b border-r border-border overflow-hidden text-ellipsis whitespace-nowrap text-fg-2"
                                  >
                                    <span className="text-small font-medium">{roleStr}</span>
                                  </td>
                                );
                              }

                              if (col.key === 'department') {
                                const deptStr = String(val || row.department || '');
                                return (
                                  <td
                                    key={col.key}
                                    className="p-2 border-b border-r border-border overflow-hidden text-ellipsis whitespace-nowrap text-fg-2"
                                  >
                                    {deptStr || <span className="text-fg-faint italic">—</span>}
                                  </td>
                                );
                              }

                              if (col.key === 'hours_utilized') {
                                const hours = Number(val) || 0;
                                return (
                                  <td
                                    key={col.key}
                                    className="p-2 border-b border-r border-border overflow-hidden text-ellipsis whitespace-nowrap"
                                  >
                                    {hours ? (
                                      <span className="font-numeric text-small font-semibold tabular-nums text-fg">
                                        {formatHours(hours)}
                                      </span>
                                    ) : (
                                      <span className="text-fg-faint italic">—</span>
                                    )}
                                  </td>
                                );
                              }

                              return (
                                <td
                                  key={col.key}
                                  className="p-2 border-b border-r border-border overflow-hidden text-ellipsis whitespace-nowrap text-fg-2"
                                  title={String(val || '')}
                                >
                                  {val !== undefined && val !== null && String(val) !== '' ? (
                                    String(val)
                                  ) : (
                                    <span className="text-fg-faint italic">—</span>
                                  )}
                                </td>
                              );
                            })}

                            {/* Actions Column */}
                            <td className="p-2 text-center border-b border-border">
                              {canEditEntry(row) ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditModal(row)}
                                    className="p-1 text-fg-muted hover:text-fg hover:bg-hover rounded transition cursor-pointer"
                                    title="Edit log entry"
                                  >
                                    <Pencil size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRow(row.id)}
                                    className="p-1 text-fg-muted hover:text-danger-fg hover:bg-danger-bg rounded transition cursor-pointer"
                                    title="Delete log entry"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-fg-faint italic text-small">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {paddingBottom > 0 && (
                        <tr style={{ height: `${paddingBottom}px` }} aria-hidden="true">
                          <td colSpan={columns.length + 2} style={{ height: `${paddingBottom}px`, padding: 0, border: 0 }} />
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer: Showing N entries */}
          <div className="px-4 py-2 border-t border-border flex items-center justify-end text-small shrink-0 bg-surface">
            <div className="text-micro text-fg-muted font-numeric tabular-nums">
              Showing {filteredEntries.length} entries
            </div>
          </div>
        </div>
      )}

      {/* ─── Create / Edit Daily Log Modal ─── */}
      <DailyLogModal
        isOpen={isEntryModalOpen && (!isAdmin && !isOperations || entryModalMode === 'edit')}
        mode={entryModalMode}
        initialData={selectedEntry}
        prefilledDate={prefilledDate}
        columns={columns}
        activeSheet={activeSheet}
        currentUser={modalCurrentUser}
        existingEntries={modalExistingEntries}
        onClose={() => {
          setIsEntryModalOpen(false);
          setPrefilledDate(undefined);
        }}
        onSaved={handleEntrySaved}
        onRefreshRequired={fetchEntries}
      />

    </div>
  );
};
