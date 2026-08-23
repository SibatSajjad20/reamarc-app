import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Plus,
  Filter,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Pencil,
  ChevronDown,
  Loader2,
  Grid,
  RotateCcw,
  Calendar as CalendarIcon,
  X,
  Check,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  Layers,
  CalendarRange,
  Paperclip,
  Download,
  Clock,
  ClipboardList,
} from 'lucide-react';
import { dailyLogService } from '../../services/dailyLogService';
import { logExceptionService } from '../../services/logExceptionService';
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
import { DailyLogModal } from '../daily-log/DailyLogModal';
import { DateRangeCalendarPicker } from '../daily-log/DateRangeCalendarPicker';
import { useSystemConfig } from '../../hooks/useSystemConfig';
import { downloadFileAttachment } from '../../utils/fileUrl';
import { CustomSelect } from '../ui/CustomSelect';
import { OffDayBanner } from '../ui/OffDayBanner';
import { useOffDays } from '../../hooks/useOffDays';
import { getDeptBadgeClass, getRoleBadgeClass, getRoleLabel, getTaskTypeBadgeClass } from '../../utils/badgeStyles';
import { formatHours, formatSignedHours } from '../../utils/logTimeChecks';
import { exportDailyLogWorkbook } from '../../utils/dailyLogExcelExport';

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

const FIELD_TYPE_OPTIONS: { id: 'text' | 'select' | 'date' | 'number'; label: string }[] = [
  { id: 'text', label: 'Text Input' },
  { id: 'select', label: 'Dropdown Menu' },
  { id: 'date', label: 'Date Picker' },
  { id: 'number', label: 'Numeric' },
];

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

const getThisWeekBounds = () => {
  const now = new Date();
  const day = now.getDay(); // 0: Sun, 1: Mon ... 6: Sat
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

interface FieldTypeSelectProps {
  value: 'text' | 'select' | 'date' | 'number';
  onChange: (val: 'text' | 'select' | 'date' | 'number') => void;
}

const FieldTypeSelect: React.FC<FieldTypeSelectProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  const currentLabel =
    FIELD_TYPE_OPTIONS.find((t) => t.id === value)?.label || 'Text Input';

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-xs font-semibold text-zinc-900 dark:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-600 transition-all cursor-pointer select-none shadow-2xs"
      >
        <span className="truncate">{currentLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 transition-transform duration-150 shrink-0 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-[#151722] border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-1.5 space-y-0.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100">
          {FIELD_TYPE_OPTIONS.map((opt) => {
            const isSelected = value === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onChange(opt.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-left select-none ${
                  isSelected
                    ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <span>{opt.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0 ml-1.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const DailyLogView: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isAdmin = user?.role === 'admin';
  const isHR = user?.role === 'hr';
  const isOperations = user?.role === 'operations';
  const isLead = user?.role === 'team_lead';
  const canSubmitLogs = user?.role === 'team_member' || user?.role === 'team_lead' || user?.role === 'hr';
  const canExportLogs = isAdmin || isHR || isOperations || isLead;
  const userDept = user?.department || '';
  const { departments } = useSystemConfig();

  const [columns, setColumns] = useState<DailyLogColumn[]>(DEFAULT_COLUMNS);
  const [entries, setEntries] = useState<DailyLogEntry[]>([]);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>('August - 2026');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  useModuleLoadGate(isLoading);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Department & Team Lead Filter State
  const [selectedDept, setSelectedDept] = useState<string>(() => {
    if (isLead && userDept) return userDept;
    if (!isAdmin && !isHR && userDept) return userDept;
    return 'All';
  });

  // Enhanced Date Filter State (Today, Week Mon-Sat, Month, Custom Range)
  const [datePreset, setDatePreset] = useState<'today' | 'week' | 'month' | 'custom'>('month');
  const [customStartDate, setCustomStartDate] = useState<string>(getTodayIso());
  const [customEndDate, setCustomEndDate] = useState<string>(getTodayIso());
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState<boolean>(false);
  const [dateDropdownView, setDateDropdownView] = useState<'presets' | 'calendar'>('presets');
  const dateDropdownRef = useRef<HTMLDivElement>(null);

  // Controlled Create / Edit Modal State
  const [isEntryModalOpen, setIsEntryModalOpen] = useState<boolean>(false);
  const [entryModalMode, setEntryModalMode] = useState<'create' | 'edit'>('create');
  const [selectedEntry, setSelectedEntry] = useState<DailyLogEntry | null>(null);
  const [prefilledDate, setPrefilledDate] = useState<string | undefined>(undefined);

  // User Activity & Missing Days State
  const [myActivity, setMyActivity] = useState<UserLogActivity | null>(null);
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

  // Close dropdown on outside click
  useEffect(() => {
    if (!isDateDropdownOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(e.target as Node)) {
        setIsDateDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isDateDropdownOpen]);

  const [isColumnModalOpen, setIsColumnModalOpen] = useState<boolean>(false);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  // Per-Column Filters State
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [openFilterColKey, setOpenFilterColKey] = useState<string | null>(null);

  // Close column filter popover on outside click
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

  // New Field State inside Modal
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<'text' | 'select' | 'date' | 'number'>('text');
  const [newFieldOptions, setNewFieldOptions] = useState('');

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('reamarc_daily_log_col_widths');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
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
    } catch (e) {}
    return {};
  });

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

  // Fetch Sheets, Columns & Query Entries
  const fetchEntries = useCallback(async () => {
    setIsLoading(true);
    setOccConflictMessage(null);
    try {
      const params = buildFilterParams();

      const [sheets, cols, logs, activity] = await Promise.all([
        dailyLogService.getSheets(),
        dailyLogService.getColumns(),
        dailyLogService.getEntries(params),
        dailyLogService.getMyLogActivity(7).catch(() => null),
      ]);

      if (activity) {
        setMyActivity(activity);
      }

      const allSheetSet = new Set<string>(sheets || []);
      (logs || []).forEach((l) => {
        if (l.month_sheet) allSheetSet.add(l.month_sheet);
      });
      const combinedSheets = Array.from(allSheetSet);

      if (combinedSheets.length > 0) {
        setAvailableSheets(combinedSheets);
        if (!combinedSheets.includes(activeSheet)) {
          setActiveSheet(combinedSheets[0]);
        }
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
    } catch (err) {
      console.error('Failed to fetch daily log entries:', err);
    } finally {
      setIsLoading(false);
    }
  }, [buildFilterParams]);

  useEffect(() => {
    fetchEntries();
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

  const { getOffDay } = useOffDays();
  const viewingSingleDay =
    datePreset === 'today' || (datePreset === 'custom' && customStartDate === customEndDate);
  const viewingOff = getOffDay(bannerDate);
  const hideLogCreate = viewingSingleDay && viewingOff.isOff;

  useEffect(() => {
    if (!canSubmitLogs) {
      setDayTarget(null);
      return;
    }
    dailyLogService.getDayTarget(bannerDate).then(setDayTarget).catch(() => setDayTarget(null));
  }, [canSubmitLogs, bannerDate, entries]);

  const liveLoggedHours = useMemo(() => {
    const uid = user?.id;
    const uname = (user?.full_name || user?.name || '').trim().toLowerCase();
    return entries
      .filter((e) => {
        if (e.date !== bannerDate) return false;
        if (uid && e.user_id === uid) return true;
        if (uname && (e.resource_name || '').trim().toLowerCase() === uname) return true;
        return false;
      })
      .reduce((sum, e) => sum + (Number(e.hours_utilized) || 0), 0);
  }, [entries, bannerDate, user]);

  const hoursChip = useMemo(() => {
    if (!canSubmitLogs || !dayTarget || dayTarget.is_full_leave) return null;
    const logged = formatHours(liveLoggedHours);
    const worked = formatHours(dayTarget.worked_hours || 0);
    const stillIn = Boolean(dayTarget.has_checkin && !dayTarget.has_checkout);
    const gap = (dayTarget.worked_hours || 0) - liveLoggedHours;
    const short = dayTarget.compare_ready && gap > 0.25;
    const over = dayTarget.compare_ready && gap < -0.25;
    const severeShort = dayTarget.compare_ready && liveLoggedHours <= 2 && (dayTarget.worked_hours || 0) > 2;

    let tone: 'ok' | 'warn' | 'alert' = 'ok';
    if (severeShort) tone = 'alert';
    else if (short || over) tone = 'warn';

    const extras = [
      dayTarget.is_wfh ? 'WFH' : '',
      dayTarget.is_full_leave ? 'on leave' : '',
    ].filter(Boolean);

    let label = `${logged} / ${worked}`;
    let title = `Logged ${logged} / ${worked} at work`;
    if (stillIn) {
      label = `${logged} · in`;
      title = `Logged ${logged} · still checked in — comparison waits until check-out`;
    } else if (short) {
      title = `Logged ${logged} / ${worked} at work — ${formatHours(gap)} short`;
    } else if (over) {
      title = `Logged ${logged} / ${worked} at work — ${formatHours(-gap)} over`;
    } else if (dayTarget.compare_ready) {
      title = `Logged ${logged} / ${worked} at work — matches time in/out`;
    } else {
      title = `Logged ${logged} / ${worked} at work — waiting on check-out`;
    }
    if (extras.length) title += ` · ${extras.join(' · ')}`;

    return { label, title, tone };
  }, [canSubmitLogs, dayTarget, liveLoggedHours]);

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
    return (myActivity?.missing_dates || []).filter(
      (d) => d >= '2026-08-19' && !followUpByDate.has(d)
    );
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
      const next = await dailyLogService.getDayTarget(bannerDate);
      setDayTarget(next);
      setReasonDrafts((prev) => ({ ...prev, [date]: '' }));
      setShowReasonInput(false);
    } catch (err: any) {
      addToast('Could not send reason', err.message || 'Try again.', 'warning');
    } finally {
      setSendingReasonDate(null);
    }
  };

  // Switch Month Sheet Tab
  const handleSheetChange = async (sheetName: string) => {
    setActiveSheet(sheetName);
    setDatePreset('month');
  };

  // Open Create Modal
  const handleOpenCreateModal = () => {
    if (hideLogCreate) return;
    setPrefilledDate(undefined);
    setSelectedEntry(null);
    setEntryModalMode('create');
    setIsEntryModalOpen(true);
  };

  // Permission check: only the author who logged the entry can edit or delete their own entry
  const canEditEntry = useCallback((entry: DailyLogEntry) => {
    const currentUserId = user?.id;
    const currentUserName = (user?.full_name || user?.name || '').trim().toLowerCase();
    
    if (entry.user_id && currentUserId && entry.user_id === currentUserId) return true;
    if (entry.resource_name && currentUserName && entry.resource_name.trim().toLowerCase() === currentUserName) return true;
    return false;
  }, [user]);

  // Open Edit Modal
  const handleOpenEditModal = (entry: DailyLogEntry) => {
    if (!canEditEntry(entry)) return;
    setPrefilledDate(undefined);
    setSelectedEntry(entry);
    setEntryModalMode('edit');
    setIsEntryModalOpen(true);
  };

  // Handle entry saved
  const handleEntrySaved = (savedEntry: DailyLogEntry) => {
    if (entryModalMode === 'create') {
      setEntries((prev) => [savedEntry, ...prev]);
    } else {
      setEntries((prev) => prev.map((e) => (e.id === savedEntry.id ? savedEntry : e)));
    }
    dailyLogService.getMyLogActivity(7).then(setMyActivity).catch(() => {});
  };

  // Delete Log Row
  const handleDeleteRow = async (entryId: string) => {
    if (!window.confirm('Are you sure you want to delete this log entry?')) return;
    setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
    try {
      await dailyLogService.deleteEntry(entryId);
    } catch (err) {
      console.error('Failed to delete daily log entry:', err);
      fetchEntries();
    }
  };

  // Add Custom Column
  const handleAddNewColumn = () => {
    if (!newFieldLabel.trim()) return;
    const newKey = newFieldLabel.trim().toLowerCase().replace(/\s+/g, '_');
    if (columns.some((col) => col.key === newKey)) {
      alert('A field with this name already exists.');
      return;
    }

    const optionsList =
      newFieldType === 'select' && newFieldOptions.trim()
        ? newFieldOptions
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

    const newCol: DailyLogColumn = {
      key: newKey,
      label: newFieldLabel.trim(),
      type: newFieldType,
      options: optionsList,
      editable: true,
      width: '160',
    };

    const updated = [...columns, newCol];
    setColumns(updated);
    setColumnWidths((prev) => ({ ...prev, [newKey]: 160 }));

    setNewFieldLabel('');
    setNewFieldOptions('');
    setNewFieldType('text');
  };

  const handleDeleteColumn = (colKey: string) => {
    if (!isAdmin) return;
    const updated = columns.filter((col) => col.key !== colKey);
    setColumns(updated);
  };

  const handleSaveColumns = async () => {
    try {
      await dailyLogService.updateColumns(columns);
      setIsColumnModalOpen(false);
    } catch (err) {
      console.error('Failed to save columns schema:', err);
    }
  };

  // Column Resizing Handlers
  const handleColumnResizeStart = (e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnWidths[colKey] || 150;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(90, Math.min(600, startWidth + delta));
      setColumnWidths((prev) => {
        const next = { ...prev, [colKey]: Math.round(newWidth) };
        try {
          localStorage.setItem('reamarc_daily_log_col_widths', JSON.stringify(next));
        } catch (e) {}
        return next;
      });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // Reset Layout
  const handleResetLayout = () => {
    const initial: Record<string, number> = {};
    DEFAULT_COLUMNS.forEach((col) => {
      initial[col.key] = parseInt(col.width || '150', 10);
    });
    setColumnWidths(initial);
    setRowHeights({});
    try {
      localStorage.removeItem('reamarc_daily_log_col_widths');
      localStorage.removeItem('reamarc_daily_log_row_heights');
    } catch (e) {}
  };

  // AI Summarization (Strictly Restricted to Admin)
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
        `Department Summary (${selectedDept}): ${entries.length} tasks recorded across ${uniquePeople} contributors. Total time logged: ${totalHours.toFixed(
          1
        )} hrs • ${completed} completed, ${blockers} blockers flagged.`
      );
      setIsSummarizing(false);
    }, 800);
  };

  // Column unique values
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

  // Filtered entries in UI
  const filteredEntries = useMemo(() => {
    let result = entries;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((e) =>
        Object.values(e).some((v) => typeof v === 'string' && v.toLowerCase().includes(q))
      );
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
  }, [entries, searchQuery, columnFilters, columns]);

  const totalTableWidth = useMemo(() => {
    return 56 + columns.reduce((sum, col) => sum + (columnWidths[col.key] || 150), 0) + 72;
  }, [columns, columnWidths]);

  const departmentOptions = useMemo(() => {
    const visible = departments.filter((dept) => {
      if (isAdmin || isHR || isOperations) return true;
      return userDept.toLowerCase() === dept.toLowerCase();
    });
    const opts = visible.map((dept) => ({ value: dept, label: dept }));
    if (isAdmin || isHR) {
      return [{ value: 'All', label: 'All Departments' }, ...opts];
    }
    return opts;
  }, [departments, isAdmin, isHR, isOperations, userDept]);

  const getDatePresetLabel = () => {
    if (datePreset === 'today') return "Today's Data";
    if (datePreset === 'week') return 'This Week (Mon - Sat)';
    if (datePreset === 'month') return `This Month (${activeSheet})`;
    if (datePreset === 'custom') return `${customStartDate} to ${customEndDate}`;
    return 'All Dates';
  };

  return (
    <div className="flex flex-col h-full bg-slate-100 dark:bg-[#09090b] text-slate-900 dark:text-zinc-100 font-sans select-none overflow-hidden">
      {/* ─── Top Toolbar: Search, Date Filter & Add Log Button ─── */}
      <div className="sticky top-0 z-40 px-6 py-3 bg-white dark:bg-[#0f1117] border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center gap-2.5 shadow-xs shrink-0">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-[380px]">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2 bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {hoursChip && (
            <div
              title={hoursChip.title}
              className={`flex items-center gap-1.5 shrink-0 px-2.5 py-2 rounded-xl border text-xs font-bold shadow-2xs ${
                hoursChip.tone === 'alert'
                  ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/50 text-rose-800 dark:text-rose-200'
                  : hoursChip.tone === 'warn'
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-200'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5 shrink-0 opacity-80" />
              <span className="whitespace-nowrap tabular-nums">{hoursChip.label}</span>
            </div>
          )}

          {/* Enhanced 4-Preset Date Filter Popover */}
          <div className="relative" ref={dateDropdownRef}>
            <button
              type="button"
              onClick={() => setIsDateDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2.5 bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 rounded-xl px-3.5 py-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-all shadow-2xs cursor-pointer select-none"
            >
              <CalendarIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span className="truncate max-w-[160px]">{getDatePresetLabel()}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 transition-transform duration-150 shrink-0 ${
                  isDateDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isDateDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 z-50 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100">
                {dateDropdownView === 'calendar' ? (
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-900/90 border border-b-0 border-zinc-200 dark:border-zinc-800 rounded-t-2xl">
                      <button
                        type="button"
                        onClick={() => setDateDropdownView('presets')}
                        className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        ← Back to Presets
                      </button>
                      <span className="text-[11px] font-bold text-zinc-400">Custom Date Range</span>
                    </div>
                    <DateRangeCalendarPicker
                      initialStartDate={customStartDate}
                      initialEndDate={customEndDate}
                      onCancel={() => setIsDateDropdownOpen(false)}
                      onApply={({ startDate, endDate }) => {
                        setCustomStartDate(startDate);
                        setCustomEndDate(endDate);
                        setDatePreset('custom');
                        setIsDateDropdownOpen(false);
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-72 bg-white dark:bg-[#151722] border border-zinc-200 dark:border-zinc-700 rounded-2xl p-2.5 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-2">
                      Date Range Presets
                    </span>

                    {/* 1. Today */}
                    <button
                      type="button"
                      onClick={() => {
                        setDatePreset('today');
                        setIsDateDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer text-left select-none ${
                        datePreset === 'today'
                          ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-zinc-900 dark:text-zinc-100">1. Today's Data</div>
                        <div className="text-[10px] text-zinc-400">Show entries for {getTodayIso()}</div>
                      </div>
                      {datePreset === 'today' && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                    </button>

                    {/* 2. This Week (Mon-Sat) */}
                    <button
                      type="button"
                      onClick={() => {
                        setDatePreset('week');
                        setIsDateDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer text-left select-none ${
                        datePreset === 'week'
                          ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-zinc-900 dark:text-zinc-100">2. This Week (Mon – Sat)</div>
                        <div className="text-[10px] text-zinc-400">Current work week bounds</div>
                      </div>
                      {datePreset === 'week' && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                    </button>

                    {/* 3. This Month */}
                    <button
                      type="button"
                      onClick={() => {
                        setDatePreset('month');
                        setIsDateDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer text-left select-none ${
                        datePreset === 'month'
                          ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-zinc-900 dark:text-zinc-100">3. This Month</div>
                        <div className="text-[10px] text-zinc-400">All logs in {activeSheet}</div>
                      </div>
                      {datePreset === 'month' && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                    </button>

                    {/* 4. Custom Range Trigger */}
                    <button
                      type="button"
                      onClick={() => setDateDropdownView('calendar')}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer text-left select-none pt-2 border-t border-zinc-200 dark:border-zinc-800 ${
                        datePreset === 'custom'
                          ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                          <CalendarRange className="w-3.5 h-3.5 text-indigo-500" />
                          <span>4. Custom Date Range</span>
                        </div>
                        <div className="text-[10px] text-zinc-400">
                          {datePreset === 'custom' ? `${customStartDate} → ${customEndDate}` : 'Open interactive calendar'}
                        </div>
                      </div>
                      {datePreset === 'custom' && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {departmentOptions.length > 0 && (
            <div className="w-[200px] shrink-0">
              <CustomSelect
                value={selectedDept}
                onChange={setSelectedDept}
                options={departmentOptions}
                placeholder="Department"
                icon={Layers}
              />
            </div>
          )}

          {/* Add Entry Button (Hidden for Admin & Operations, and when viewing a rest day) */}
          {!isAdmin && !isOperations && !hideLogCreate && (
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold shadow-sm shadow-indigo-600/20 hover:shadow-md hover:shadow-indigo-600/30 hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer select-none shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Add Entry</span>
            </button>
          )}
        </div>

        {/* Right Tools: Export, Customize, Summarize, Reset columns */}
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {canExportLogs && (
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting || isLoading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700/80 hover:border-indigo-300 dark:hover:border-indigo-500/50 text-zinc-700 dark:text-zinc-200 text-xs font-semibold transition-all shadow-2xs cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed"
              title="Download the current date and department filters as an Excel sheet"
            >
              {isExporting ? (
                <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5 text-indigo-500" />
              )}
              <span>{isExporting ? 'Exporting…' : 'Export Excel'}</span>
            </button>
          )}

          {/* Manage Columns (Admin Only) */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setIsColumnModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-700 dark:text-zinc-300 text-xs font-semibold transition-all shadow-2xs cursor-pointer select-none"
            >
              <Settings2 className="w-3.5 h-3.5 text-indigo-500" />
              <span>Customize Fields</span>
            </button>
          )}

          {/* Reset column widths */}
          <button
            type="button"
            onClick={handleResetLayout}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-600 dark:text-zinc-300 transition-all shadow-2xs cursor-pointer"
            title="Reset column widths"
          >
            <RotateCcw className="w-3.5 h-3.5 text-indigo-500" />
          </button>

          {/* AI Summarize (Admin Only) */}
          {isAdmin && (
            <button
              type="button"
              onClick={handleAiSummarize}
              disabled={isSummarizing || entries.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 disabled:text-zinc-400 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer select-none"
            >
              {isSummarizing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-indigo-200" />
              )}
              <span>Summarize</span>
            </button>
          )}
        </div>
      </div>

      {hideLogCreate && (
        <div className="px-6 py-3 shrink-0">
          <OffDayBanner info={viewingOff} date={bannerDate} />
        </div>
      )}

      {canSubmitLogs && followUps.length > 0 && (
        <div className="px-5 py-2 border-b bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-100 shrink-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <ClipboardList className="w-3.5 h-3.5 shrink-0 opacity-80" />
            <span className="font-semibold">
              {followUps.length} {followUps.length === 1 ? 'request' : 'requests'}
              {followUpActorLabel}
            </span>
            <div className="flex items-center gap-1 flex-wrap">
              {visibleFollowUpChips.map((item) => {
                const isOpen = item.date === openFollowUpDate;
                const waiting = item.action_status === 'waiting_on_reviewer';
                return (
                  <button
                    key={`${item.date}-${item.action_status}`}
                    type="button"
                    onClick={() => openFollowUp(item.date)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold cursor-pointer border transition-colors ${
                      isOpen
                        ? 'bg-amber-600 text-white border-amber-600'
                        : waiting
                          ? 'bg-white/50 dark:bg-zinc-900/40 text-amber-800/80 dark:text-amber-100/80 border-amber-500/20'
                          : 'bg-white/80 dark:bg-zinc-900/50 text-amber-900 dark:text-amber-100 border-amber-500/30 hover:border-amber-500/60'
                    }`}
                    title={waiting ? 'Waiting on review' : 'Needs a reply'}
                  >
                    {formatChipDate(item.date)}
                  </button>
                );
              })}
              {hiddenFollowUpCount > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const hidden = followUps[FOLLOW_UP_CHIP_LIMIT];
                    if (hidden?.date) openFollowUp(hidden.date);
                  }}
                  className="text-[11px] font-semibold opacity-70 hover:opacity-100 cursor-pointer"
                >
                  +{hiddenFollowUpCount}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleNextFollowUp}
              className="ml-auto shrink-0 px-2.5 py-1 rounded-lg bg-amber-600 text-white text-[11px] font-bold cursor-pointer"
            >
              {openFollowUpItem ? 'Next' : 'Handle next'}
            </button>
          </div>

          {openFollowUpItem ? (
            <div className="mt-2 pt-2 border-t border-amber-500/20 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold inline-flex items-center flex-wrap gap-x-1.5 gap-y-1">
                  <span>{formatChipDate(openFollowUpItem.date)}</span>
                  <span className="font-normal opacity-80">
                    {formatHours(Number(openFollowUpItem.logged_hours) || 0)} logged /{' '}
                    {formatHours(Number(openFollowUpItem.worked_hours) || 0)} at work
                  </span>
                  {openFollowUpItem.is_missing_log ? (
                    <span className="text-amber-800 dark:text-amber-200">Didn't log</span>
                  ) : (openFollowUpItem.signed_gap_hours || 0) > 0.01 ? (
                    <span className="text-emerald-700 dark:text-emerald-400">
                      {formatSignedHours(Number(openFollowUpItem.signed_gap_hours))}
                    </span>
                  ) : (openFollowUpItem.signed_gap_hours || 0) < -0.01 ? (
                    <span className="text-rose-700 dark:text-rose-400">
                      {formatSignedHours(Number(openFollowUpItem.signed_gap_hours))}
                    </span>
                  ) : null}
                  {openFollowUpItem.action_status === 'waiting_on_reviewer' ? (
                    <span className="font-normal opacity-80">
                      — waiting on {openFollowUpItem.action_by_name || 'your lead'}
                    </span>
                  ) : openFollowUpItem.action_by_name ? (
                    <span className="font-normal opacity-80">
                      — {openFollowUpItem.action_by_name} asked you to{' '}
                      {openFollowUpItem.action_type === 'explain' ? 'send a reason' : 'add time'}
                    </span>
                  ) : null}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {openFollowUpItem.can_send_reason ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openAddTimeForDate(openFollowUpItem.date)}
                        className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-[11px] font-bold cursor-pointer"
                      >
                        Add missing time
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowReasonInput((prev) => !prev)}
                        className="px-2.5 py-1 rounded-lg border border-amber-600 text-amber-900 dark:text-amber-100 text-[11px] font-bold cursor-pointer"
                      >
                        Send a reason
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setOpenFollowUpDate(null);
                      setShowReasonInput(false);
                    }}
                    className="px-2 py-1 text-[11px] font-semibold opacity-70 hover:opacity-100 cursor-pointer"
                  >
                    Later
                  </button>
                </div>
              </div>
              {openFollowUpItem.action_status === 'waiting_on_reviewer' && openFollowUpItem.member_reason ? (
                <p className="text-[11px] opacity-80">Pending review: “{openFollowUpItem.member_reason}”</p>
              ) : null}
              {openFollowUpItem.can_send_reason && showReasonInput ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={reasonDrafts[openFollowUpItem.date] || ''}
                    onChange={(e) =>
                      setReasonDrafts((prev) => ({ ...prev, [openFollowUpItem.date]: e.target.value }))
                    }
                    placeholder="e.g. client meeting 2h — this is not a log row"
                    className="flex-1 px-3 py-1.5 rounded-lg bg-white/80 dark:bg-zinc-900/60 border border-amber-500/30 text-[11px] text-zinc-900 dark:text-zinc-100"
                  />
                  <button
                    type="button"
                    disabled={
                      sendingReasonDate === openFollowUpItem.date ||
                      !(reasonDrafts[openFollowUpItem.date] || '').trim()
                    }
                    onClick={() => submitFollowUpReason(openFollowUpItem.date)}
                    className="shrink-0 px-2.5 py-1 rounded-lg border border-amber-600 text-amber-900 dark:text-amber-100 text-[11px] font-bold cursor-pointer disabled:opacity-40"
                  >
                    {sendingReasonDate === openFollowUpItem.date ? 'Sending…' : 'Send reason'}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {/* Smart Missing Work Log Banner */}
      {(() => {
        if (isAdmin || isOperations || extraMissingDates.length === 0) return null;
        return (
          <div className="px-5 py-2 bg-amber-500/10 dark:bg-amber-950/30 border-b border-amber-500/30 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200 shrink-0">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <div>
                <span className="font-bold">Pending Log Submission: </span>
                <span>
                  You haven't recorded entries for{' '}
                  <strong className="underline font-mono font-bold">
                    {extraMissingDates.slice(0, 3).join(', ')}
                    {extraMissingDates.length > 3 ? ` (+${extraMissingDates.length - 3} more)` : ''}
                  </strong>
                  .
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setPrefilledDate(extraMissingDates[0]);
                setSelectedEntry(null);
                setEntryModalMode('create');
                setIsEntryModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer select-none"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Log for {extraMissingDates[0]}</span>
            </button>
          </div>
        );
      })()}

      {/* OCC Conflict Warning Banner */}
      {occConflictMessage && (
        <div className="px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/30 flex items-center justify-between text-xs text-amber-900 dark:text-amber-300 shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span>{occConflictMessage}</span>
          </div>
          <button
            type="button"
            onClick={fetchEntries}
            className="flex items-center gap-1 bg-amber-600 text-white px-2.5 py-1 rounded-lg text-xs font-bold hover:bg-amber-700 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Refresh View</span>
          </button>
        </div>
      )}

      {/* AI Summary Banner */}
      {isAdmin && aiSummary && (
        <div className="px-5 py-2.5 bg-indigo-50/90 dark:bg-indigo-950/40 border-b border-indigo-200 dark:border-indigo-800/40 flex items-center justify-between text-xs text-indigo-900 dark:text-indigo-200 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>{aiSummary}</span>
          </div>
          <button
            type="button"
            onClick={() => setAiSummary(null)}
            className="text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-100 text-xs font-bold px-2 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ─── Grid Canvas Table ─── */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto custom-scrollbar bg-white dark:bg-[#0b0b0e] relative w-full flex flex-col">
        {isLoading ? (
          <div className="flex-1 min-h-[400px] w-full flex flex-col items-center justify-center gap-3 text-zinc-400 dark:text-zinc-500">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Loading daily log entries...</span>
          </div>
        ) : (
          <div
            style={{
              width: `${totalTableWidth}px`,
              minWidth: `${totalTableWidth}px`,
            }}
            className="min-w-full flex flex-col"
          >
            <table
              className="border-separate border-spacing-0 text-xs text-left table-fixed w-full"
              style={{ width: `${totalTableWidth}px`, minWidth: `${totalTableWidth}px` }}
            >
              <thead className="sticky top-0 z-30 shadow-2xs">
                <tr className="bg-zinc-100 dark:bg-[#12141c] text-zinc-800 dark:text-zinc-200 font-semibold text-xs border-b border-zinc-200 dark:border-zinc-800">
                  <th
                    style={{ width: '56px', minWidth: '56px', maxWidth: '56px' }}
                    className="p-2.5 text-center font-mono text-xs font-bold text-zinc-500 dark:text-zinc-400 border-b border-r border-zinc-200 dark:border-zinc-800 sticky top-0 z-20 select-none bg-zinc-100 dark:bg-[#12141c]"
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
                        className="sticky top-0 z-20 p-2.5 font-semibold tracking-tight border-b border-r border-zinc-200 dark:border-zinc-800 bg-zinc-100/95 dark:bg-[#12141c]/95 backdrop-blur-md text-zinc-800 dark:text-zinc-200 relative group overflow-visible select-none hover:bg-zinc-200/50 dark:hover:bg-zinc-800/40 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="truncate text-xs font-bold text-zinc-900 dark:text-zinc-100" title={col.label}>
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
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                                hasActiveFilter
                                  ? 'bg-indigo-600 text-white font-bold shadow-2xs'
                                  : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/80 dark:hover:bg-zinc-800'
                              }`}
                              title={`Filter by ${col.label}`}
                            >
                              <Filter className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Column Resize Handle */}
                        <div
                          onMouseDown={(e) => handleColumnResizeStart(e, col.key)}
                          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/80 z-20"
                        />

                        {/* Popover Filter Menu */}
                        {isFilterOpen && (
                          <div
                            data-filter-popover={col.key}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute left-0 top-full mt-1 z-50 w-52 bg-white dark:bg-[#151722] border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl p-2.5 space-y-2 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 font-normal"
                          >
                            <div className="flex items-center justify-between pb-1 border-b border-zinc-100 dark:border-zinc-800">
                              <span className="text-[11px] font-bold text-zinc-500">Filter {col.label}</span>
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
                                  className="text-[10px] text-rose-500 hover:underline font-semibold cursor-pointer"
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
                              className="w-full px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                                      className={`w-full text-left px-2 py-1 rounded text-xs truncate transition-colors cursor-pointer ${
                                        isSelected
                                          ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold'
                                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                      }`}
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
                    className="p-2.5 text-center font-bold text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-20 bg-zinc-100 dark:bg-[#12141c]"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 font-normal">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 2} className="py-20 text-center text-zinc-400 dark:text-zinc-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Grid className="w-8 h-8 stroke-1 text-zinc-400" />
                        <span className="text-sm font-semibold">No daily logs recorded for this scope.</span>
                        {!isAdmin && !isOperations && !hideLogCreate && (
                          <button
                            type="button"
                            onClick={handleOpenCreateModal}
                            className="mt-2 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                          >
                            + Add Log Entry
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((row, idx) => {
                    const rowH = rowHeights[row.id] || DEFAULT_ROW_HEIGHT;
                    const rowFollowUp = canEditEntry(row) ? followUpByDate.get(row.date) : undefined;

                    return (
                      <tr
                        key={row.id}
                        style={{ height: `${rowH}px` }}
                        onDoubleClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target && target.closest('button, a, input, select')) return;
                          if (canEditEntry(row)) {
                            handleOpenEditModal(row);
                          }
                        }}
                        className={`hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-colors group ${
                          canEditEntry(row) ? 'cursor-pointer' : ''
                        } ${rowFollowUp ? 'bg-amber-50/50 dark:bg-amber-950/15' : ''}`}
                        title={canEditEntry(row) ? 'Double-click to edit your log entry' : undefined}
                      >
                        {/* Row Index */}
                        <td className="p-2 text-center font-mono text-xs font-semibold text-zinc-400 border-b border-r border-zinc-200 dark:border-zinc-800/60 bg-zinc-50/40 dark:bg-zinc-900/30 select-none">
                          {idx + 1}
                        </td>

                        {/* Column Cells */}
                        {columns.map((col) => {
                          const val = (row as any)[col.key] || row.custom_fields?.[col.key];

                          if (col.key === 'date') {
                            const dateStr = String(val || row.date || '');
                            return (
                              <td
                                key={col.key}
                                className="p-2 border-b border-r border-zinc-200 dark:border-zinc-800/60 overflow-hidden text-ellipsis whitespace-nowrap text-zinc-800 dark:text-zinc-200"
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
                                        className="inline-flex items-center gap-1.5 min-w-0 cursor-pointer"
                                        title={
                                          rowFollowUp.can_send_reason
                                            ? 'Needs a reply — open request'
                                            : 'Waiting on review'
                                        }
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                        <span className="truncate">{dateStr}</span>
                                        <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 shrink-0">
                                          {rowFollowUp.can_send_reason ? 'Needs reply' : 'Waiting'}
                                        </span>
                                      </button>
                                    ) : (
                                      <span className="truncate">{dateStr}</span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-zinc-300 dark:text-zinc-700 italic">—</span>
                                )}
                              </td>
                            );
                          }

                          if (col.key === 'task_status') {
                            const statusStr = String(val || 'Incomplete');
                            const isCompleted = statusStr === 'Completed';
                            const isBlocker = statusStr === 'Blocker';

                            return (
                              <td
                                key={col.key}
                                className="p-2 border-b border-r border-zinc-200 dark:border-zinc-800/60 overflow-hidden text-ellipsis whitespace-nowrap"
                              >
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold ${
                                    isCompleted
                                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                                      : isBlocker
                                      ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20'
                                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20'
                                  }`}
                                >
                                  {statusStr}
                                </span>
                              </td>
                            );
                          }

                          if (col.key === 'task_type') {
                            const typeStr = String(val || 'Scheduled Task');
                            return (
                              <td
                                key={col.key}
                                className="p-2 border-b border-r border-zinc-200 dark:border-zinc-800/60 overflow-hidden text-ellipsis whitespace-nowrap"
                              >
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${getTaskTypeBadgeClass(
                                    typeStr
                                  )}`}
                                >
                                  {typeStr}
                                </span>
                              </td>
                            );
                          }

                          if (col.key === 'task_description') {
                            const desc = String(val || '');
                            return (
                              <td
                                key={col.key}
                                className="p-2 border-b border-r border-zinc-200 dark:border-zinc-800/60"
                                title={desc}
                              >
                                {desc ? (
                                  <span className="line-clamp-2 text-zinc-800 dark:text-zinc-200 leading-snug">{desc}</span>
                                ) : (
                                  <span className="text-zinc-300 dark:text-zinc-700 italic">—</span>
                                )}
                              </td>
                            );
                          }

                          if (col.key === 'deliverables') {
                            if (!val || String(val).trim() === '') {
                              return (
                                <td
                                  key={col.key}
                                  className="p-2 border-b border-r border-zinc-200 dark:border-zinc-800/60 overflow-hidden text-ellipsis whitespace-nowrap text-zinc-300 dark:text-zinc-700 italic"
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
                                className="p-2 border-b border-r border-zinc-200 dark:border-zinc-800/60 overflow-hidden"
                              >
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {rawParts.map((item, itemIdx) => {
                                    // Markdown link format: [File: report.pdf](/uploads/...) or [Label](url)
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
                                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80 text-[11px] font-semibold transition cursor-pointer truncate max-w-[180px]"
                                          title={`Download / Open: ${fileName}`}
                                        >
                                          {isFile ? (
                                            <Download className="w-3 h-3 text-indigo-500 shrink-0" />
                                          ) : (
                                            <Paperclip className="w-3 h-3 text-indigo-500 shrink-0" />
                                          )}
                                          <span className="truncate">{fileName}</span>
                                        </button>
                                      );
                                    }

                                    // Direct upload URL
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
                                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80 text-[11px] font-semibold transition cursor-pointer truncate max-w-[180px]"
                                          title={`Download: ${fileName}`}
                                        >
                                          <Download className="w-3 h-3 text-indigo-500 shrink-0" />
                                          <span className="truncate">{fileName}</span>
                                        </button>
                                      );
                                    }

                                    // External web link
                                    if (item.startsWith('http://') || item.startsWith('https://')) {
                                      return (
                                        <a
                                          key={itemIdx}
                                          href={item}
                                          target="_blank"
                                          rel="noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/80 text-[11px] font-semibold transition cursor-pointer truncate max-w-[180px]"
                                          title={item}
                                        >
                                          <ExternalLink className="w-3 h-3 text-blue-500 shrink-0" />
                                          <span className="truncate">{item.replace(/^https?:\/\/(www\.)?/, '')}</span>
                                        </a>
                                      );
                                    }

                                    // Plain text deliverable name
                                    return (
                                      <span key={itemIdx} className="text-zinc-700 dark:text-zinc-300 text-xs truncate">
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
                                className="p-2 border-b border-r border-zinc-200 dark:border-zinc-800/60 overflow-hidden text-ellipsis whitespace-nowrap"
                              >
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${getRoleBadgeClass(
                                    roleStr
                                  )}`}
                                >
                                  {roleStr}
                                </span>
                              </td>
                            );
                          }

                          if (col.key === 'department') {
                            const deptStr = String(val || row.department || '');
                            if (!deptStr) {
                              return (
                                <td
                                  key={col.key}
                                  className="p-2 border-b border-r border-zinc-200 dark:border-zinc-800/60 overflow-hidden text-ellipsis whitespace-nowrap text-zinc-400 italic text-[11px]"
                                >
                                  —
                                </td>
                              );
                            }

                            return (
                              <td
                                key={col.key}
                                className="p-2 border-b border-r border-zinc-200 dark:border-zinc-800/60 overflow-hidden text-ellipsis whitespace-nowrap"
                              >
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${getDeptBadgeClass(
                                    deptStr
                                  )}`}
                                >
                                  {deptStr}
                                </span>
                              </td>
                            );
                          }

                          return (
                            <td
                              key={col.key}
                              className="p-2 border-b border-r border-zinc-200 dark:border-zinc-800/60 overflow-hidden text-ellipsis whitespace-nowrap text-zinc-800 dark:text-zinc-200"
                              title={String(val || '')}
                            >
                              {val !== undefined && val !== null && String(val) !== '' ? (
                                String(val)
                              ) : (
                                <span className="text-zinc-300 dark:text-zinc-700 italic">—</span>
                              )}
                            </td>
                          );
                        })}

                        {/* Actions */}
                        <td className="p-2 text-center border-b border-zinc-200 dark:border-zinc-800/60">
                          {canEditEntry(row) ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(row)}
                                className="p-1 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer"
                                title="Edit log entry"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(row.id)}
                                className="p-1 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition cursor-pointer"
                                title="Delete log entry"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-zinc-300 dark:text-zinc-700 italic text-[11px]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Bottom Sheet Tabs (Month Selector) ─── */}
      <div className="px-6 py-2 bg-white dark:bg-[#0f1117] border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 text-xs shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1 overflow-x-auto">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 px-2 shrink-0">
            Sheets:
          </span>
          {availableSheets.map((sheet) => {
            const isTabActive = activeSheet === sheet && datePreset === 'month';
            return (
              <button
                key={sheet}
                type="button"
                onClick={() => handleSheetChange(sheet)}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer select-none shrink-0 ${
                  isTabActive
                    ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-600/30'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200'
                }`}
              >
                {sheet}
              </button>
            );
          })}
        </div>

        <div className="text-[11px] text-zinc-400 font-medium shrink-0">
          Showing {filteredEntries.length} entries
        </div>
      </div>

      {/* Create / Edit Daily Log Modal with Locked Fields */}
      <DailyLogModal
        isOpen={isEntryModalOpen}
        mode={entryModalMode}
        initialData={selectedEntry}
        prefilledDate={prefilledDate}
        columns={columns}
        activeSheet={activeSheet}
        currentUser={
          user
            ? {
                name: user.name,
                full_name: user.full_name,
                role: user.role,
                department: user.department,
              }
            : null
        }
        existingEntries={entries.filter((e) => {
          const uid = user?.id;
          const uname = (user?.full_name || user?.name || '').trim().toLowerCase();
          if (uid && e.user_id === uid) return true;
          if (uname && (e.resource_name || '').trim().toLowerCase() === uname) return true;
          return false;
        })}
        onClose={() => {
          setIsEntryModalOpen(false);
          setPrefilledDate(undefined);
        }}
        onSaved={handleEntrySaved}
        onRefreshRequired={fetchEntries}
      />

      {/* Column Customization Modal (Admin Only) */}
      {isAdmin && isColumnModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Settings2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    Manage & Add Matrix Fields
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Configure columns and custom fields for this workspace
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsColumnModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form to Add New Column */}
            <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-3">
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-indigo-500" />
                <span>Add New Field Header</span>
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px_auto] gap-2.5 items-center">
                <input
                  type="text"
                  placeholder="Field Name (e.g. Priority)"
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  className="px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-2xs"
                />
                <FieldTypeSelect
                  value={newFieldType}
                  onChange={(val) => setNewFieldType(val)}
                />
                <button
                  type="button"
                  onClick={handleAddNewColumn}
                  disabled={!newFieldLabel.trim()}
                  className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all select-none ${
                    newFieldLabel.trim()
                      ? 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-xs cursor-pointer'
                      : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-700/60 cursor-not-allowed'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Add Field</span>
                </button>
              </div>
              {newFieldType === 'select' && (
                <input
                  type="text"
                  placeholder="Dropdown options separated by commas (e.g. High, Medium, Low)"
                  value={newFieldOptions}
                  onChange={(e) => setNewFieldOptions(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-2xs"
                />
              )}
            </div>

            {/* List of Existing Columns */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Active Columns ({columns.length})
              </span>
              {columns.map((col, idx) => (
                <div
                  key={col.key}
                  className="flex items-center gap-2.5 bg-zinc-50 dark:bg-zinc-900/70 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800"
                >
                  <input
                    type="text"
                    value={col.label}
                    onChange={(e) => {
                      const newCols = [...columns];
                      newCols[idx].label = e.target.value;
                      setColumns(newCols);
                    }}
                    className="flex-1 px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-2xs"
                  />
                  <div className="w-40 shrink-0">
                    <FieldTypeSelect
                      value={col.type as any}
                      onChange={(val) => {
                        const newCols = [...columns];
                        newCols[idx].type = val;
                        setColumns(newCols);
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteColumn(col.key)}
                    className="p-2 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer shrink-0"
                    title="Remove Column"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3.5 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setIsColumnModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveColumns}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-xs font-bold text-white shadow-sm shadow-indigo-600/20 hover:shadow-md hover:shadow-indigo-600/30 transition-all cursor-pointer"
              >
                Save Column Schema
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
