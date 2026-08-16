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
  ChevronLeft,
  ChevronRight,
  Loader2,
  Grid,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Calendar as CalendarIcon,
  X,
  Check,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { dailyLogService } from '../../services/dailyLogService';
import type { DailyLogEntry, DailyLogColumn, UserLogActivity } from '../../types/dailyLog';
import { useAuth } from '../../context/AuthContext';
import { DailyLogModal } from '../daily-log/DailyLogModal';

const DEFAULT_COLUMNS: DailyLogColumn[] = [
  { key: 'date', label: 'Date', type: 'date', editable: true, width: '130' },
  { key: 'resource_name', label: 'Resource Name', type: 'text', editable: true, width: '160' },
  { key: 'role', label: 'Role', type: 'text', editable: true, width: '140' },
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
const MIN_ZOOM = 70;
const MAX_ZOOM = 130;

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
  const { user, role } = useAuth();
  const isAdmin = role === 'admin' || user?.role === 'admin';

  const [columns, setColumns] = useState<DailyLogColumn[]>(DEFAULT_COLUMNS);
  const [entries, setEntries] = useState<DailyLogEntry[]>([]);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>('August - 2026');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState<boolean>(false);
  const dateDropdownRef = useRef<HTMLDivElement>(null);

  // Controlled Create / Edit Modal State
  const [isEntryModalOpen, setIsEntryModalOpen] = useState<boolean>(false);
  const [entryModalMode, setEntryModalMode] = useState<'create' | 'edit'>('create');
  const [selectedEntry, setSelectedEntry] = useState<DailyLogEntry | null>(null);
  const [prefilledDate, setPrefilledDate] = useState<string | undefined>(undefined);

  // User Activity & Missing Days State
  const [myActivity, setMyActivity] = useState<UserLogActivity | null>(null);

  // OCC Warning state
  const [occConflictMessage, setOccConflictMessage] = useState<string | null>(null);

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
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  // ─── Per-Column Filters State ────────────────────────────────────────────────
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [openFilterColKey, setOpenFilterColKey] = useState<string | null>(null);

  // Calendar State for Date Filter Popover
  const [calendarViewDate, setCalendarViewDate] = useState<Date>(new Date(2026, 7, 1)); // Default August 2026

  // New Field State inside Modal
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<'text' | 'select' | 'date' | 'number'>('text');
  const [newFieldOptions, setNewFieldOptions] = useState('');

  // ─── Zoom & Matrix Layout State ──────────────────────────────────────────────
  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('reamarc_daily_log_zoom');
      if (saved) return Number(saved);
    } catch (e) {}
    return 100;
  });

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

  // ─── Fetch Sheet Tabs & Initial Data ─────────────────────────────────────────
  const fetchSheetsAndData = useCallback(async () => {
    setIsLoading(true);
    setOccConflictMessage(null);
    try {
      const [sheets, cols, logs, activity] = await Promise.all([
        dailyLogService.getSheets(),
        dailyLogService.getColumns(),
        dailyLogService.getEntries(activeSheet),
        dailyLogService.getMyLogActivity(7).catch(() => null),
      ]);

      if (activity) {
        setMyActivity(activity);
      }

      if (sheets && sheets.length > 0) {
        setAvailableSheets(sheets);
        if (!sheets.includes(activeSheet)) {
          setActiveSheet(sheets[0]);
        }
      }

      if (cols && cols.length > 0) {
        setColumns(cols);
        setColumnWidths((prev) => {
          const next = { ...prev };
          cols.forEach((col) => {
            if (!next[col.key]) {
              next[col.key] = parseInt(col.width || '150', 10);
            }
          });
          return next;
        });
      }

      setEntries(logs || []);
    } catch (err) {
      console.error('Failed to fetch daily log sheets/entries:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeSheet]);

  useEffect(() => {
    fetchSheetsAndData();
  }, [fetchSheetsAndData]);

  // Switch Month Sheet Tab
  const handleSheetChange = async (sheetName: string) => {
    setActiveSheet(sheetName);
    setIsLoading(true);
    setColumnFilters({});
    setOccConflictMessage(null);
    try {
      const logs = await dailyLogService.getEntries(sheetName);
      setEntries(logs || []);
    } catch (err) {
      console.error(`Failed to fetch logs for sheet '${sheetName}':`, err);
    } finally {
      setIsLoading(false);
    }
  };

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setPrefilledDate(undefined);
    setSelectedEntry(null);
    setEntryModalMode('create');
    setIsEntryModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (entry: DailyLogEntry) => {
    setPrefilledDate(undefined);
    setSelectedEntry(entry);
    setEntryModalMode('edit');
    setIsEntryModalOpen(true);
  };

  // Handle entry saved from modal (Atomic Single Dispatch)
  const handleEntrySaved = (savedEntry: DailyLogEntry) => {
    if (entryModalMode === 'create') {
      setEntries((prev) => [savedEntry, ...prev]);
    } else {
      setEntries((prev) => prev.map((e) => (e.id === savedEntry.id ? savedEntry : e)));
    }
    // Refresh user activity to clear smart banner
    dailyLogService.getMyLogActivity(7).then(setMyActivity).catch(() => {});
  };

  // Delete Log Row
  const handleDeleteRow = async (entryId: string) => {
    if (!window.confirm('Are you sure you want to delete this log entry?')) return;
    setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
    try {
      await dailyLogService.deleteEntry(entryId);
    } catch (err) {
      console.error(`Failed to delete entry '${entryId}':`, err);
      // Refetch on error
      handleSheetChange(activeSheet);
    }
  };

  // ─── Column Schema Customization & Adding New Fields (Admin Only) ────────────
  const handleAddNewColumn = () => {
    if (!isAdmin || !newFieldLabel.trim()) return;

    const newKey = `custom_${newFieldLabel.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString().slice(-4)}`;
    const newCol: DailyLogColumn = {
      key: newKey,
      label: newFieldLabel.trim(),
      type: newFieldType,
      options:
        newFieldType === 'select' && newFieldOptions.trim()
          ? newFieldOptions.split(',').map((opt) => opt.trim()).filter(Boolean)
          : undefined,
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

  // ─── Column & Row Resizing Handlers ──────────────────────────────────────────
  const handleColumnResizeStart = (e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnWidths[colKey] || 150;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = (moveEvent.clientX - startX) * (100 / zoomLevel);
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

  const handleRowResizeStart = (e: React.MouseEvent, rowId: string, currentH: number) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = (moveEvent.clientY - startY) * (100 / zoomLevel);
      const newHeight = Math.max(34, Math.min(200, currentH + delta));
      setRowHeights((prev) => {
        const next = { ...prev, [rowId]: Math.round(newHeight) };
        try {
          localStorage.setItem('reamarc_daily_log_row_heights', JSON.stringify(next));
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
    setZoomLevel(100);
    try {
      localStorage.removeItem('reamarc_daily_log_col_widths');
      localStorage.removeItem('reamarc_daily_log_row_heights');
      localStorage.setItem('reamarc_daily_log_zoom', '100');
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
      setAiSummary(
        `AI Summary (${activeSheet}): ${entries.length} tasks recorded (${completed} completed, ${blockers} blockers). Total time utilized: ${totalHours.toFixed(1)} hrs.`
      );
      setIsSummarizing(false);
    }, 900);
  };

  // Helper to extract unique values for column filter popover
  const getUniqueValuesForColumn = (colKey: string): string[] => {
    const setVals = new Set<string>();
    entries.forEach((e) => {
      const val = (e as any)[colKey];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        setVals.add(String(val).trim());
      }
    });
    return Array.from(setVals).sort();
  };

  // Filtered Entries based on Search, Date Filter, and Column Filters
  const filteredEntries = useMemo(() => {
    let result = [...entries];

    // Global Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((e) =>
        Object.values(e).some((val) =>
          typeof val === 'string' ? val.toLowerCase().includes(q) : false
        )
      );
    }

    // Date Presets Filter
    if (dateFilter === 'today') {
      const today = new Date();
      const todayIso = today.toISOString().split('T')[0];
      const todayFormatted = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear().toString().slice(2)}`;
      result = result.filter((e) => e.date === todayIso || e.date === todayFormatted);
    } else if (dateFilter === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      result = result.filter((e) => {
        const entryDate = new Date(e.date);
        return !isNaN(entryDate.getTime()) && entryDate >= weekAgo;
      });
    }

    // Per-Column Discrete & Value Filters
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
  }, [entries, searchQuery, dateFilter, columnFilters, columns]);

  // Compute Total Table Width for reliable horizontal scrolling
  const totalTableWidth = useMemo(() => {
    return 56 + columns.reduce((sum, col) => sum + (columnWidths[col.key] || 150), 0) + 72;
  }, [columns, columnWidths]);

  // Calendar Helper functions for Date Picker Filter Popover
  const calendarDaysInMonth = useMemo(() => {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return { firstDay, daysInMonth, year, month };
  }, [calendarViewDate]);

  return (
    <div className="flex flex-col h-full bg-slate-100 dark:bg-[#09090b] text-slate-900 dark:text-zinc-100 font-sans select-none overflow-hidden">
      {/* Top Toolbar Bar */}
      <div className="px-6 py-3.5 bg-white dark:bg-[#0f1117] border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3.5 shadow-xs shrink-0">
        {/* Search & Date Filter & Add Log Button */}
        <div className="flex items-center gap-3 flex-1 min-w-[320px] max-w-2xl">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search logs by keyword, task, team member..."
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

          {/* Custom Date Filter Popover */}
          <div className="relative" ref={dateDropdownRef}>
            <button
              type="button"
              onClick={() => setIsDateDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2.5 bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 rounded-xl px-3.5 py-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200 transition-all shadow-2xs cursor-pointer select-none"
            >
              <CalendarIcon className="w-4 h-4 text-indigo-500 shrink-0" />
              <span>
                {dateFilter === 'today'
                  ? 'Today'
                  : dateFilter === 'week'
                  ? 'Past 7 Days'
                  : 'All Dates'}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 transition-transform duration-150 ${
                  isDateDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isDateDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 z-50 w-48 bg-white dark:bg-[#151722] border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-1.5 space-y-0.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100">
                {[
                  { id: 'all', label: 'All Dates', sub: 'Show all recorded entries' },
                  { id: 'today', label: 'Today', sub: 'Only entries logged for today' },
                  { id: 'week', label: 'Past 7 Days', sub: 'Entries from past 7 days' },
                ].map((opt) => {
                  const isSelected = dateFilter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setDateFilter(opt.id);
                        setIsDateDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-left select-none ${
                        isSelected
                          ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{opt.label}</span>
                        <span className="text-[10px] text-zinc-400 font-normal">{opt.sub}</span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add Entry Button (Opens Modal) */}
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-bold shadow-sm shadow-indigo-600/20 hover:shadow-md hover:shadow-indigo-600/30 hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer select-none shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Entry</span>
          </button>
        </div>

        {/* Controls Right: Zoom, Reset Layout, Custom Columns (Admin Only), AI Summary */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Zoom Level Widget */}
          <div
            className="flex items-center bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700/80 rounded-xl p-1 shadow-2xs"
            title="Canvas Zoom Level"
          >
            <button
              type="button"
              onClick={() => {
                const next = Math.max(MIN_ZOOM, zoomLevel - 5);
                setZoomLevel(next);
                try {
                  localStorage.setItem('reamarc_daily_log_zoom', String(next));
                } catch (e) {}
              }}
              disabled={zoomLevel <= MIN_ZOOM}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 disabled:opacity-40 transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2.5 text-xs font-mono font-bold text-zinc-700 dark:text-zinc-300 min-w-[48px] text-center select-none">
              {zoomLevel}%
            </span>
            <button
              type="button"
              onClick={() => {
                const next = Math.min(MAX_ZOOM, zoomLevel + 5);
                setZoomLevel(next);
                try {
                  localStorage.setItem('reamarc_daily_log_zoom', String(next));
                } catch (e) {}
              }}
              disabled={zoomLevel >= MAX_ZOOM}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 disabled:opacity-40 transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Reset Layout Button */}
          <button
            type="button"
            onClick={handleResetLayout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-400 text-xs font-semibold transition-all shadow-2xs cursor-pointer select-none"
            title="Reset columns width and zoom"
          >
            <RotateCcw className="w-3.5 h-3.5 text-indigo-500" />
            <span>Reset Layout</span>
          </button>

          {/* Manage Columns (Admin Only) */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setIsColumnModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-400 text-xs font-semibold transition-all shadow-2xs cursor-pointer select-none"
            >
              <Settings2 className="w-3.5 h-3.5 text-indigo-500" />
              <span>Customize Fields</span>
            </button>
          )}

          {/* AI Summarize Action Button (Strictly Restricted to Admins) */}
          {isAdmin && (
            <button
              type="button"
              onClick={handleAiSummarize}
              disabled={isSummarizing || entries.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 disabled:text-zinc-400 dark:disabled:text-zinc-500 text-white text-xs font-bold shadow-2xs hover:shadow-xs transition-all cursor-pointer disabled:cursor-not-allowed select-none"
            >
              {isSummarizing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-indigo-200" />
              )}
              <span>+ Summarize this data</span>
            </button>
          )}
        </div>
      </div>

      {/* Smart Missing Work Log Banner (Member In-App Prompt - Not shown to Admins) */}
      {!isAdmin && myActivity && myActivity.missing_dates && myActivity.missing_dates.length > 0 && (
        <div className="px-5 py-3 bg-amber-500/10 dark:bg-amber-950/30 border-b border-amber-500/30 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200 shrink-0 animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <div>
              <span className="font-bold">Pending Log Submission: </span>
              <span>
                You haven't recorded entries for{' '}
                <strong className="underline font-mono font-bold">
                  {myActivity.missing_dates.slice(0, 3).join(', ')}
                  {myActivity.missing_dates.length > 3 ? ` (+${myActivity.missing_dates.length - 3} more)` : ''}
                </strong>
                .
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPrefilledDate(myActivity.missing_dates[0]);
                setSelectedEntry(null);
                setEntryModalMode('create');
                setIsEntryModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer select-none"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Log for {myActivity.missing_dates[0]}</span>
            </button>
          </div>
        </div>
      )}

      {/* OCC Conflict Warning Banner */}
      {occConflictMessage && (
        <div className="px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/30 flex items-center justify-between text-xs text-amber-900 dark:text-amber-300 shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span>{occConflictMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => handleSheetChange(activeSheet)}
            className="flex items-center gap-1 bg-amber-600 text-white px-2.5 py-1 rounded-lg text-xs font-bold hover:bg-amber-700 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Refresh View</span>
          </button>
        </div>
      )}

      {/* AI Summary Notification Banner (Admin Only) */}
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

      {/* Grid Canvas Wrapper with Scaled Zoom */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto bg-white dark:bg-[#0b0b0e] relative w-full flex flex-col">
        {isLoading ? (
          <div className="flex-1 min-h-[400px] w-full flex flex-col items-center justify-center gap-3 text-zinc-400 dark:text-zinc-500">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Loading sheet entries...</span>
          </div>
        ) : (
          <div
            style={{
              zoom: `${zoomLevel}%`,
              width: `${totalTableWidth}px`,
              minWidth: `${totalTableWidth}px`,
            }}
            className="min-w-full flex flex-col"
          >
            {/* Table View */}
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

                        {/* ─── PER-COLUMN FILTER POPOVER ────────────────────────────── */}
                        {isFilterable && isFilterOpen && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute left-0 top-full mt-1 z-50 w-64 bg-white dark:bg-[#121217] border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl p-3 text-zinc-900 dark:text-zinc-100 space-y-3 font-normal"
                          >
                            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
                              <span className="font-bold text-xs flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                                <Filter className="w-3.5 h-3.5" />
                                <span>Filter: {col.label}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => setOpenFilterColKey(null)}
                                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* 1. DATE PICKER / CALENDAR FILTER POPOVER */}
                            {col.type === 'date' ? (
                              <div className="space-y-2.5">
                                {/* Calendar Month Header */}
                                <div className="flex items-center justify-between text-xs font-bold px-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCalendarViewDate(
                                        new Date(
                                          calendarDaysInMonth.year,
                                          calendarDaysInMonth.month - 1,
                                          1
                                        )
                                      )
                                    }
                                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-600 dark:text-zinc-300 cursor-pointer"
                                  >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                  </button>
                                  <span>
                                    {new Intl.DateTimeFormat('en-US', {
                                      month: 'short',
                                      year: 'numeric',
                                    }).format(calendarViewDate)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCalendarViewDate(
                                        new Date(
                                          calendarDaysInMonth.year,
                                          calendarDaysInMonth.month + 1,
                                          1
                                        )
                                      )
                                    }
                                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-600 dark:text-zinc-300 cursor-pointer"
                                  >
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                {/* Calendar Day Grid */}
                                <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
                                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                                    <span key={d} className="font-bold text-zinc-400 py-0.5">
                                      {d}
                                    </span>
                                  ))}
                                  {Array.from({ length: calendarDaysInMonth.firstDay }).map((_, i) => (
                                    <span key={`empty-${i}`} />
                                  ))}
                                  {Array.from({ length: calendarDaysInMonth.daysInMonth }).map((_, i) => {
                                    const day = i + 1;
                                    const m = String(calendarDaysInMonth.month + 1).padStart(2, '0');
                                    const dStr = String(day).padStart(2, '0');
                                    const fullDate = `${calendarDaysInMonth.year}-${m}-${dStr}`;
                                    const altDate = `${day}/${calendarDaysInMonth.month + 1}/${calendarDaysInMonth.year.toString().slice(2)}`;
                                    const isSelected =
                                      columnFilters[col.key] === fullDate ||
                                      columnFilters[col.key] === altDate;

                                    return (
                                      <button
                                        key={day}
                                        type="button"
                                        onClick={() => {
                                          setColumnFilters((prev) => ({
                                            ...prev,
                                            [col.key]: isSelected ? '' : fullDate,
                                          }));
                                          setOpenFilterColKey(null);
                                        }}
                                        className={`py-1 rounded font-medium transition-colors cursor-pointer ${
                                          isSelected
                                            ? 'bg-indigo-600 text-white font-bold'
                                            : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                                        }`}
                                      >
                                        {day}
                                      </button>
                                    );
                                  })}
                                </div>

                                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex justify-between">
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
                                    className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 font-semibold cursor-pointer"
                                  >
                                    Clear Filter
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* 2. DISCRETE VALUES SELECTOR / SEARCH FILTER POPOVER */
                              <div className="space-y-2">
                                <div className="relative">
                                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                  <input
                                    type="text"
                                    placeholder={`Search in ${col.label}...`}
                                    value={columnFilters[col.key] === '__ALL__' ? '' : columnFilters[col.key] || ''}
                                    onChange={(e) =>
                                      setColumnFilters((prev) => ({
                                        ...prev,
                                        [col.key]: e.target.value,
                                      }))
                                    }
                                    className="w-full pl-8 pr-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500"
                                  />
                                </div>

                                {existingUniqueValues.length > 0 && (
                                  <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
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
                                      className={`w-full flex items-center justify-between px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                                        !columnFilters[col.key]
                                          ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold'
                                          : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                      }`}
                                    >
                                      <span>(Select All)</span>
                                      {!columnFilters[col.key] && <Check className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />}
                                    </button>

                                    {existingUniqueValues.map((val) => {
                                      const isSelected = columnFilters[col.key] === val;
                                      return (
                                        <button
                                          key={val}
                                          type="button"
                                          onClick={() => {
                                            setColumnFilters((prev) => ({
                                              ...prev,
                                              [col.key]: isSelected ? '' : val,
                                            }));
                                            setOpenFilterColKey(null);
                                          }}
                                          className={`w-full flex items-center justify-between px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                                            isSelected
                                              ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold'
                                              : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                          }`}
                                        >
                                          <span className="truncate">{val}</span>
                                          {isSelected && <Check className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}

                                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex justify-between">
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
                                    className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 font-semibold cursor-pointer"
                                  >
                                    Clear
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setOpenFilterColKey(null)}
                                    className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-xs font-semibold shadow-2xs cursor-pointer"
                                  >
                                    Apply
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </th>
                    );
                  })}
                  <th
                    style={{ width: '72px', minWidth: '72px' }}
                    className="p-2.5 text-center font-bold text-zinc-500 dark:text-zinc-400 bg-zinc-100/95 dark:bg-[#12141c]/95 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-20 shrink-0 text-xs select-none"
                  >
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length + 2}
                      className="py-12 text-center text-zinc-400 dark:text-zinc-500 text-xs font-medium"
                    >
                      No daily log entries found matching criteria for{' '}
                      <span className="font-semibold text-indigo-500">{activeSheet}</span>.
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry, rowIndex) => {
                    const customH = rowHeights[entry.id] || DEFAULT_ROW_HEIGHT;
                    return (
                      <tr
                        key={entry.id}
                        style={{ height: `${customH}px` }}
                        onDoubleClick={() => handleOpenEditModal(entry)}
                        className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50 transition-colors group relative cursor-pointer"
                        title="Double-click row to edit entry"
                      >
                        {/* Serial Number Column Index */}
                        <td
                          style={{ width: '56px', minWidth: '56px', maxWidth: '56px' }}
                          className="p-2 text-center font-mono text-xs font-bold text-zinc-500 dark:text-zinc-400 border-b border-r border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-950/40 select-none group-hover:bg-zinc-100 dark:group-hover:bg-zinc-900"
                        >
                          {rowIndex + 1}
                        </td>

                        {/* Read-Only Formatted Matrix Columns */}
                        {columns.map((col) => {
                          const val = (entry as any)[col.key];
                          const colW = columnWidths[col.key] || 150;

                          return (
                            <td
                              key={col.key}
                              style={{ width: `${colW}px`, minWidth: `${colW}px` }}
                              className="p-2.5 border-b border-r border-zinc-200 dark:border-zinc-800/80 align-middle text-xs select-text"
                            >
                              {col.key === 'task_status' ? (
                                <div className="flex items-center justify-center">
                                  {val === 'Completed' ? (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                      <span>Completed</span>
                                    </span>
                                  ) : val === 'Blocker' ? (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 animate-pulse" />
                                      <span>Blocker</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                      <span>Incomplete</span>
                                    </span>
                                  )}
                                </div>
                              ) : col.key === 'task_type' ? (
                                <div className="flex items-center justify-center">
                                  {val === 'Runtime Task' ? (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-400/30">
                                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                                      <span>Runtime Task</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-400/30">
                                      <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
                                      <span>Scheduled Task</span>
                                    </span>
                                  )}
                                </div>
                              ) : col.key === 'hours_utilized' ? (
                                <div className="text-center font-mono font-bold text-zinc-800 dark:text-zinc-200">
                                  <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/60 dark:border-zinc-700/60 text-xs">
                                    {val !== undefined && val !== null && !isNaN(Number(val))
                                      ? `${Number(val).toFixed(2)}h`
                                      : val || '0.00h'}
                                  </span>
                                </div>
                              ) : col.key === 'date' ? (
                                <span className="font-mono text-zinc-700 dark:text-zinc-300 text-xs">{val || '—'}</span>
                              ) : col.key === 'deliverables' ? (
                                val ? (
                                  <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-medium">
                                    <span className="truncate max-w-[200px]" title={val}>
                                      {val}
                                    </span>
                                    {val.startsWith('http') && (
                                      <a
                                        href={val}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="hover:text-indigo-800 dark:hover:text-indigo-200 shrink-0"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </a>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-zinc-300 dark:text-zinc-700">—</span>
                                )
                              ) : col.key === 'task_description' || col.key === 'revisions_done' ? (
                                <p className="line-clamp-2 text-zinc-900 dark:text-zinc-100 text-xs leading-relaxed" title={val}>
                                  {val || '—'}
                                </p>
                              ) : (
                                <span className="text-zinc-900 dark:text-zinc-100 text-xs truncate block" title={String(val || '')}>
                                  {val || '—'}
                                </span>
                              )}
                            </td>
                          );
                        })}

                        {/* Row Actions: Edit & Delete */}
                        <td
                          style={{ width: '72px', minWidth: '72px' }}
                          className="p-2 text-center align-middle relative border-b border-zinc-200 dark:border-zinc-800/80"
                        >
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditModal(entry);
                              }}
                              className="p-1 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors cursor-pointer"
                              title="Edit Entry (Modal)"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRow(entry.id);
                              }}
                              className="p-1 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                              title="Delete Entry"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {/* Row Resize Handle */}
                          <div
                            onMouseDown={(e) => handleRowResizeStart(e, entry.id, customH)}
                            className="absolute left-0 right-0 bottom-0 h-1 cursor-row-resize hover:bg-indigo-500/50"
                          />
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

      {/* Modern Bottom Sheet Navigation Bar (August 2026 onwards) */}
      <div className="bg-zinc-100 dark:bg-[#0f1117] border-t border-zinc-200 dark:border-zinc-800 px-4 py-2 flex items-center justify-between gap-3 text-xs shrink-0 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
            title="Add New Entry (Modal)"
          >
            <Plus className="w-4 h-4" />
          </button>

          <button
            type="button"
            className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
          >
            <Grid className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />

          {/* Month Sheet Tabs (Aug 2026+) */}
          {availableSheets.map((sheet) => (
            <button
              key={sheet}
              type="button"
              onClick={() => handleSheetChange(sheet)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeSheet === sheet
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-zinc-200/70 dark:bg-zinc-800/70 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              <span>{sheet}</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
          ))}
        </div>

        {/* Count and Statistics Footer Indicator */}
        <div className="flex items-center gap-4 text-xs font-mono text-zinc-600 dark:text-zinc-400 shrink-0">
          <span>
            Total Rows:{' '}
            <strong className="text-zinc-900 dark:text-zinc-100 font-bold">{filteredEntries.length}</strong>
          </span>
        </div>
      </div>

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
                designation: user.designation,
              }
            : null
        }
        onClose={() => {
          setIsEntryModalOpen(false);
          setPrefilledDate(undefined);
        }}
        onSaved={handleEntrySaved}
        onRefreshRequired={() => handleSheetChange(activeSheet)}
      />

      {/* Enhanced Custom Column Management & Field Creation Modal (Strictly Restricted to Admins) */}
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

            {/* List of Existing Columns (A-F removed) */}
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
