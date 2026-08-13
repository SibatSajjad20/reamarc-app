import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Plus,
  Filter,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  ChevronDown,
  Loader2,
  Grid,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Calendar as CalendarIcon,
  X,
  ChevronLeft,
  ChevronRight,
  Check,
} from 'lucide-react';
import { dailyLogService } from '../../services/dailyLogService';
import type { DailyLogEntry, DailyLogColumn } from '../../types/dailyLog';
import { useAuth } from '../../context/AuthContext';

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

export const DailyLogView: React.FC = () => {
  const { activeWorkspaceId, user, role } = useAuth();
  const isAdmin = role === 'admin' || user?.role === 'admin';

  const [columns, setColumns] = useState<DailyLogColumn[]>(DEFAULT_COLUMNS);
  const [entries, setEntries] = useState<DailyLogEntry[]>([]);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>('August - 2026');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('all');
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

  useEffect(() => {
    try {
      localStorage.setItem('reamarc_daily_log_zoom', String(zoomLevel));
    } catch (e) {}
  }, [zoomLevel]);

  // ─── Resizing Logic (Columns & Rows) ──────────────────────────────────────────
  const [resizingColKey, setResizingColKey] = useState<string | null>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);
  const columnWidthsRef = useRef(columnWidths);
  columnWidthsRef.current = columnWidths;

  const handleColumnResizeStart = (e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColKey(colKey);
    startXRef.current = e.clientX;
    startWidthRef.current = columnWidths[colKey] || 150;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    if (!resizingColKey) return;
    let animFrame: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (animFrame !== null) cancelAnimationFrame(animFrame);
      animFrame = requestAnimationFrame(() => {
        const diff = e.clientX - startXRef.current;
        const newW = Math.max(80, Math.min(600, startWidthRef.current + diff));
        setColumnWidths((prev) => ({
          ...prev,
          [resizingColKey]: newW,
        }));
      });
    };

    const handleMouseUp = () => {
      if (animFrame !== null) cancelAnimationFrame(animFrame);
      setResizingColKey(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem('reamarc_daily_log_col_widths', JSON.stringify(columnWidthsRef.current));
      } catch (e) {}
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      if (animFrame !== null) cancelAnimationFrame(animFrame);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingColKey]);

  // Draggable Row Height
  const [resizingRowId, setResizingRowId] = useState<string | null>(null);
  const startYRef = useRef<number>(0);
  const startRowHeightRef = useRef<number>(DEFAULT_ROW_HEIGHT);
  const rowHeightsRef = useRef(rowHeights);
  rowHeightsRef.current = rowHeights;

  const handleRowResizeStart = (e: React.MouseEvent, rowId: string, currentH: number) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingRowId(rowId);
    startYRef.current = e.clientY;
    startRowHeightRef.current = currentH;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    if (!resizingRowId) return;
    let animFrame: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (animFrame !== null) cancelAnimationFrame(animFrame);
      animFrame = requestAnimationFrame(() => {
        const diff = e.clientY - startYRef.current;
        const newH = Math.max(36, Math.min(160, startRowHeightRef.current + diff));
        setRowHeights((prev) => ({
          ...prev,
          [resizingRowId]: newH,
        }));
      });
    };

    const handleMouseUp = () => {
      if (animFrame !== null) cancelAnimationFrame(animFrame);
      setResizingRowId(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem('reamarc_daily_log_row_heights', JSON.stringify(rowHeightsRef.current));
      } catch (e) {}
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      if (animFrame !== null) cancelAnimationFrame(animFrame);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingRowId]);

  const handleResetLayout = () => {
    const defaultW: Record<string, number> = {};
    DEFAULT_COLUMNS.forEach((col) => {
      defaultW[col.key] = parseInt(col.width || '150', 10);
    });
    setColumnWidths(defaultW);
    setRowHeights({});
    setZoomLevel(100);
    setColumnFilters({});
    try {
      localStorage.removeItem('reamarc_daily_log_col_widths');
      localStorage.removeItem('reamarc_daily_log_row_heights');
      localStorage.removeItem('reamarc_daily_log_zoom');
    } catch (e) {}
  };

  // ─── Data Loading ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const sheetsList = await dailyLogService.getSheets();
      const validSheets = sheetsList.filter((s) => {
        if (!s.includes(' - ')) return true;
        const [month, yearStr] = s.split(' - ');
        const year = parseInt(yearStr, 10);
        if (year < 2026) return false;
        if (year === 2026) {
          const monthsBeforeAug = ['January', 'February', 'March', 'April', 'May', 'June', 'July'];
          if (monthsBeforeAug.includes(month)) return false;
        }
        return true;
      });

      setAvailableSheets(validSheets.length > 0 ? validSheets : ['August - 2026']);

      const currentMonthSheet = `${new Date().toLocaleString('default', { month: 'long' })} - ${new Date().getFullYear()}`;
      const defaultSheet = validSheets.includes(currentMonthSheet)
        ? currentMonthSheet
        : validSheets[0] || 'August - 2026';

      setActiveSheet((prev) => (validSheets.includes(prev) ? prev : defaultSheet));

      const cols = await dailyLogService.getColumns();
      if (cols && cols.length > 0) {
        setColumns(cols);
        setColumnWidths((prev) => {
          const updated = { ...prev };
          cols.forEach((col) => {
            if (!updated[col.key]) {
              updated[col.key] = parseInt(col.width || '150', 10);
            }
          });
          return updated;
        });
      }

      const logs = await dailyLogService.getEntries(activeSheet);
      setEntries(logs);
    } catch (err) {
      console.error('Failed to load daily log data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeSheet]);

  useEffect(() => {
    loadData();
  }, [loadData, activeWorkspaceId]);

  // Handle Sheet Tab Change
  const handleSheetChange = async (sheetName: string) => {
    setActiveSheet(sheetName);
    setIsLoading(true);
    setColumnFilters({});
    try {
      const logs = await dailyLogService.getEntries(sheetName);
      setEntries(logs);
    } catch (err) {
      console.error(`Failed to fetch logs for sheet '${sheetName}':`, err);
    } finally {
      setIsLoading(false);
    }
  };

  // Add New Log Entry Row
  const handleAddRow = async () => {
    const today = new Date();
    const todayFormatted = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear().toString().slice(2)}`;

    const newEntryPayload: any = {
      date: todayFormatted,
      resource_name: 'Team Member',
      role: 'Contributor',
      client_project: 'Reamarc',
      task_description: 'New daily task entry...',
      task_type: 'Scheduled Task',
      task_status: 'Incomplete',
      revisions_done: '',
      deliverables: '',
      hours_utilized: '0:30',
      remarks: '',
      month_sheet: activeSheet,
    };

    try {
      const created = await dailyLogService.createEntry(newEntryPayload);
      setEntries((prev) => [created, ...prev]);
    } catch (err) {
      console.error('Failed to add new log entry:', err);
    }
  };

  // Update Field Inline
  const handleCellChange = async (entryId: string, field: string, value: any) => {
    setEntries((prev) =>
      prev.map((entry) => (entry.id === entryId ? { ...entry, [field]: value } : entry))
    );

    try {
      await dailyLogService.updateEntry(entryId, { [field]: value });
    } catch (err) {
      console.error(`Failed to update field '${field}' on entry '${entryId}':`, err);
    }
  };

  // Delete Log Row
  const handleDeleteRow = async (entryId: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
    try {
      await dailyLogService.deleteEntry(entryId);
    } catch (err) {
      console.error(`Failed to delete entry '${entryId}':`, err);
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
      options: newFieldType === 'select' ? newFieldOptions.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      editable: true,
      width: '160',
    };

    const updatedCols = [...columns, newCol];
    setColumns(updatedCols);
    setColumnWidths((prev) => ({ ...prev, [newKey]: 160 }));

    setNewFieldLabel('');
    setNewFieldOptions('');
  };

  const handleDeleteColumn = (colKey: string) => {
    if (!isAdmin) return;
    const updatedCols = columns.filter((c) => c.key !== colKey);
    setColumns(updatedCols);
  };

  const handleSaveColumns = async () => {
    if (!isAdmin) return;
    setIsColumnModalOpen(false);
    try {
      await dailyLogService.updateColumns(columns);
    } catch (err) {
      console.error('Failed to save updated columns configuration:', err);
    }
  };

  // ─── AI Summarization ────────────────────────────────────────────────────────
  const handleSummarizeAI = () => {
    setIsSummarizing(true);
    setAiSummary(null);
    setTimeout(() => {
      const totalHours = filteredEntries.reduce((acc, curr) => {
        const parsed = parseFloat(curr.hours_utilized?.replace(':', '.') || '0');
        return acc + (isNaN(parsed) ? 0 : parsed);
      }, 0);

      const completedCount = filteredEntries.filter((e) => e.task_status === 'Completed').length;
      const blockerCount = filteredEntries.filter((e) => e.task_status === 'Blocker').length;

      setAiSummary(
        `📊 AI Daily Log Summary (${activeSheet}): Total ${filteredEntries.length} tasks logged totaling approx. ${totalHours.toFixed(1)} hrs. ${completedCount} completed, ${blockerCount} blocker(s) flagged.`
      );
      setIsSummarizing(false);
    }, 1200);
  };

  // ─── Column Filter Helpers ───────────────────────────────────────────────────
  const handleSetColumnFilter = (colKey: string, val: string) => {
    setColumnFilters((prev) => {
      if (!val) {
        const copy = { ...prev };
        delete copy[colKey];
        return copy;
      }
      return { ...prev, [colKey]: val };
    });
  };

  const handleClearColumnFilter = (colKey: string) => {
    setColumnFilters((prev) => {
      const copy = { ...prev };
      delete copy[colKey];
      return copy;
    });
  };

  // Dynamically extract distinct existing values for any column from current entries
  const getUniqueValuesForColumn = useCallback(
    (colKey: string): string[] => {
      const set = new Set<string>();
      entries.forEach((e) => {
        const val = (e as any)[colKey];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          set.add(String(val).trim());
        }
      });
      return Array.from(set);
    },
    [entries]
  );

  // Helper to parse date string like "13/8/26" or "13/08/2026" or "2026-08-13" into day, month, year
  const parseEntryDate = (dateStr: string) => {
    if (!dateStr) return null;
    if (dateStr.includes('-')) {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return {
          year: parseInt(parts[0], 10),
          month: parseInt(parts[1], 10),
          day: parseInt(parts[2], 10),
        };
      }
    }
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length >= 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        let year = parseInt(parts[2], 10);
        if (year < 100) year += 2000;
        return { day, month, year };
      }
    }
    return null;
  };

  // Check if entry date matches target day, month, year
  const matchEntryDate = (entryDateStr: string, targetDay: number, targetMonth: number, targetYear: number) => {
    const parsed = parseEntryDate(entryDateStr);
    if (!parsed) return false;
    return parsed.day === targetDay && parsed.month === targetMonth && parsed.year === targetYear;
  };

  // ─── Filtered Entries (Global Search, Date Filter & Per-Column Filters) ──────
  const filteredEntries = useMemo(() => {
    let result = entries;

    // Global Search Filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.resource_name?.toLowerCase().includes(query) ||
          e.client_project?.toLowerCase().includes(query) ||
          e.task_description?.toLowerCase().includes(query) ||
          e.role?.toLowerCase().includes(query) ||
          e.task_type?.toLowerCase().includes(query) ||
          e.task_status?.toLowerCase().includes(query)
      );
    }

    // Top Date Preset Filter
    if (dateFilter !== 'all') {
      const today = new Date();
      result = result.filter((e) => {
        const parsed = parseEntryDate(e.date);
        if (!parsed) return true;

        if (dateFilter === 'today') {
          return (
            parsed.day === today.getDate() &&
            parsed.month === today.getMonth() + 1 &&
            parsed.year === today.getFullYear()
          );
        } else if (dateFilter === 'week') {
          const entryDate = new Date(parsed.year, parsed.month - 1, parsed.day);
          const diffTime = Math.abs(today.getTime() - entryDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return diffDays <= 7;
        }
        return true;
      });
    }

    // Per-Column Specific Filters
    Object.keys(columnFilters).forEach((colKey) => {
      const filterVal = columnFilters[colKey];
      if (!filterVal) return;

      const colDef = columns.find((c) => c.key === colKey);
      if (!colDef) return;

      if (colDef.type === 'date') {
        const parts = filterVal.split('-');
        if (parts.length === 3) {
          const targetYear = parseInt(parts[0], 10);
          const targetMonth = parseInt(parts[1], 10);
          const targetDay = parseInt(parts[2], 10);
          result = result.filter((e) => matchEntryDate((e as any)[colKey], targetDay, targetMonth, targetYear));
        }
      } else if (colDef.type === 'select') {
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

  // Compute Excel Column Header Letters A, B, C...
  const getColumnLetter = (index: number): string => {
    let letter = '';
    while (index >= 0) {
      letter = String.fromCharCode((index % 26) + 65) + letter;
      index = Math.floor(index / 26) - 1;
    }
    return letter;
  };

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
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search Filter */}
          <div className="relative w-72 sm:w-80 group">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 group-focus-within:text-indigo-500 transition-colors pointer-events-none" />
            <input
              type="text"
              placeholder="Search resource, project, task..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2 bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Date Filter Dropdown */}
          <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3.5 py-2 hover:border-zinc-300 dark:hover:border-zinc-600 transition-all shadow-2xs">
            <CalendarIcon className="w-4 h-4 text-indigo-500 shrink-0" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-transparent text-sm font-semibold text-zinc-800 dark:text-zinc-200 focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="week">Past 7 Days</option>
            </select>
          </div>

          {/* Add Row Button */}
          <button
            onClick={handleAddRow}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-bold shadow-sm shadow-indigo-600/20 hover:shadow-md hover:shadow-indigo-600/30 hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer select-none"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Row</span>
          </button>
        </div>

        {/* Controls Right: Zoom, Reset Layout, Custom Columns (Admin Only), AI Summary */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Active Column Filters Clear Indicator */}
          {Object.keys(columnFilters).length > 0 && (
            <button
              onClick={() => setColumnFilters({})}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-bold hover:bg-amber-500/25 transition-all cursor-pointer shadow-2xs"
              title="Clear all active column filters"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear Column Filters ({Object.keys(columnFilters).length})</span>
            </button>
          )}

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700/80 rounded-xl p-1 shadow-2xs">
            <button
              onClick={() => setZoomLevel((z) => Math.max(MIN_ZOOM, z - 10))}
              disabled={zoomLevel <= MIN_ZOOM}
              className="w-7 h-7 flex items-center justify-center hover:bg-white dark:hover:bg-zinc-800 rounded-lg text-zinc-600 dark:text-zinc-300 disabled:opacity-30 transition-all cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono text-xs font-bold text-zinc-800 dark:text-zinc-200 min-w-11 text-center select-none">
              {zoomLevel}%
            </span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(MAX_ZOOM, z + 10))}
              disabled={zoomLevel >= MAX_ZOOM}
              className="w-7 h-7 flex items-center justify-center hover:bg-white dark:hover:bg-zinc-800 rounded-lg text-zinc-600 dark:text-zinc-300 disabled:opacity-30 transition-all cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Reset Layout Button */}
          <button
            onClick={handleResetLayout}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/80 text-sm font-semibold shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-600 transition-all cursor-pointer"
            title="Reset Column Widths, Row Heights & Zoom"
          >
            <RotateCcw className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
            <span>Reset Layout</span>
          </button>

          {/* Custom Columns & Fields Modal Button — Strictly Restricted to Admins */}
          {isAdmin && (
            <button
              onClick={() => setIsColumnModalOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/80 text-sm font-semibold shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-600 transition-all cursor-pointer"
              title="Custom Field Configuration (Admin Only)"
            >
              <Settings2 className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              <span>Columns</span>
            </button>
          )}

          {/* AI Summarize Button */}
          <button
            onClick={handleSummarizeAI}
            disabled={isSummarizing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 text-white text-sm font-bold shadow-md shadow-indigo-600/25 hover:shadow-lg hover:shadow-indigo-600/35 hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer disabled:opacity-50 select-none"
          >
            {isSummarizing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 text-purple-200 animate-pulse" />
            )}
            <span>+ Summarize this data</span>
          </button>
        </div>
      </div>

      {/* AI Summary Notification Banner */}
      {aiSummary && (
        <div className="px-5 py-2.5 bg-indigo-50/90 dark:bg-indigo-950/40 border-b border-indigo-200 dark:border-indigo-800/40 flex items-center justify-between text-xs text-indigo-900 dark:text-indigo-200 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>{aiSummary}</span>
          </div>
          <button
            onClick={() => setAiSummary(null)}
            className="text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-100 text-xs font-bold px-2 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Grid Canvas Wrapper with Scaled Zoom */}
      <div className="flex-1 overflow-auto bg-white dark:bg-[#0b0b0e] relative flex flex-col">
        <div
          style={{
            zoom: `${zoomLevel}%`,
            minWidth: '100%',
          }}
          className="flex-1 flex flex-col"
        >
          {/* Excel Column Letters Header Bar (A, B, C, D...) */}
          <div className="flex items-center bg-slate-200 dark:bg-[#121217] border-b border-slate-300 dark:border-zinc-800 text-[11px] font-mono text-slate-600 dark:text-zinc-400 shrink-0">
            <div className="w-14 py-1 text-center font-bold border-r border-slate-300 dark:border-zinc-800 shrink-0 bg-slate-200 dark:bg-[#121217]">
              #
            </div>
            <div className="flex-1 flex overflow-hidden">
              {columns.map((col, idx) => {
                const colW = columnWidths[col.key] || 150;
                return (
                  <div
                    key={col.key}
                    style={{ width: `${colW}px` }}
                    className="py-1 text-center font-bold border-r border-slate-300 dark:border-zinc-800 shrink-0 relative group"
                  >
                    <span>{getColumnLetter(idx)}</span>
                    <div
                      onMouseDown={(e) => handleColumnResizeStart(e, col.key)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/50 group-hover:bg-slate-400/30 z-20"
                    />
                  </div>
                );
              })}
            </div>
            <div className="w-12 shrink-0"></div>
          </div>

          {/* Table View */}
          {isLoading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-zinc-500">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
              <span className="text-xs font-medium">Loading sheet entries...</span>
            </div>
          ) : (
            <div className="flex-1 overflow-x-auto">
              <table className="w-full border-collapse text-xs text-left table-fixed">
                <thead>
                  {/* Table Header Row (#1) matching screenshot dark blue styling */}
                  <tr className="bg-[#1e293b] text-white font-semibold text-xs border-b border-slate-700">
                    <th className="w-14 p-2 text-center font-mono text-[11px] text-slate-300 border-r border-slate-700/60 sticky left-0 bg-[#1e293b] z-10 shrink-0">
                      1
                    </th>
                    {columns.map((col) => {
                      const colW = columnWidths[col.key] || 150;
                      const hasActiveFilter = Boolean(columnFilters[col.key]);
                      const isFilterOpen = openFilterColKey === col.key;
                      const existingUniqueValues = getUniqueValuesForColumn(col.key);

                      return (
                        <th
                          key={col.key}
                          style={{ width: `${colW}px` }}
                          className="p-2.5 font-medium tracking-tight border-r border-slate-700/60 text-slate-100 relative group overflow-visible"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate" title={col.label}>
                              {col.label}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenFilterColKey(isFilterOpen ? null : col.key);
                              }}
                              className={`p-1 rounded transition-colors cursor-pointer shrink-0 ${
                                hasActiveFilter
                                  ? 'bg-indigo-500 text-white font-bold'
                                  : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
                              }`}
                              title={`Filter by ${col.label}`}
                            >
                              <Filter className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Column Resize Handle */}
                          <div
                            onMouseDown={(e) => handleColumnResizeStart(e, col.key)}
                            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-400 z-20"
                          />

                          {/* ─── PER-COLUMN FILTER POPOVER ────────────────────────────── */}
                          {isFilterOpen && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute left-0 top-full mt-1 z-50 w-64 bg-white dark:bg-[#121217] border border-slate-200 dark:border-zinc-700 rounded-xl shadow-2xl p-3 text-slate-900 dark:text-zinc-100 space-y-3 font-normal"
                            >
                              <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-2">
                                <span className="font-bold text-xs flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                                  <Filter className="w-3.5 h-3.5" />
                                  <span>Filter: {col.label}</span>
                                </span>
                                <button
                                  onClick={() => setOpenFilterColKey(null)}
                                  className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-0.5 cursor-pointer"
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
                                      onClick={() =>
                                        setCalendarViewDate(
                                          new Date(
                                            calendarDaysInMonth.year,
                                            calendarDaysInMonth.month - 1,
                                            1
                                          )
                                        )
                                      }
                                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 cursor-pointer"
                                    >
                                      <ChevronLeft className="w-3.5 h-3.5" />
                                    </button>
                                    <span className="text-slate-800 dark:text-zinc-200">
                                      {calendarViewDate.toLocaleString('default', {
                                        month: 'long',
                                        year: 'numeric',
                                      })}
                                    </span>
                                    <button
                                      onClick={() =>
                                        setCalendarViewDate(
                                          new Date(
                                            calendarDaysInMonth.year,
                                            calendarDaysInMonth.month + 1,
                                            1
                                          )
                                        )
                                      }
                                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 cursor-pointer"
                                    >
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  {/* Day Name Headers */}
                                  <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-400 dark:text-zinc-500">
                                    <span>Su</span>
                                    <span>Mo</span>
                                    <span>Tu</span>
                                    <span>We</span>
                                    <span>Th</span>
                                    <span>Fr</span>
                                    <span>Sa</span>
                                  </div>

                                  {/* Day Numbers Grid */}
                                  <div className="grid grid-cols-7 text-center gap-1 text-xs">
                                    {Array.from({ length: calendarDaysInMonth.firstDay }).map((_, i) => (
                                      <div key={`empty-${i}`} />
                                    ))}
                                    {Array.from({ length: calendarDaysInMonth.daysInMonth }).map((_, i) => {
                                      const dayNum = i + 1;
                                      const monthNum = calendarDaysInMonth.month + 1;
                                      const yearNum = calendarDaysInMonth.year;
                                      const formattedTarget = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                                      const isSelected = columnFilters[col.key] === formattedTarget;

                                      return (
                                        <button
                                          key={`day-${dayNum}`}
                                          onClick={() => {
                                            handleSetColumnFilter(col.key, formattedTarget);
                                            setOpenFilterColKey(null);
                                          }}
                                          className={`py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                                            isSelected
                                              ? 'bg-indigo-600 text-white shadow-xs'
                                              : 'hover:bg-indigo-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200'
                                          }`}
                                        >
                                          {dayNum}
                                        </button>
                                      );
                                    })}
                                  </div>

                                  {/* Clear Button */}
                                  {columnFilters[col.key] && (
                                    <button
                                      onClick={() => {
                                        handleClearColumnFilter(col.key);
                                        setOpenFilterColKey(null);
                                      }}
                                      className="w-full py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold hover:bg-rose-500/20 transition-colors cursor-pointer"
                                    >
                                      Clear Date Filter
                                    </button>
                                  )}
                                </div>
                              ) : col.type === 'select' ? (
                                /* 2. DROPDOWN OPTIONS FILTER POPOVER */
                                <div className="space-y-1.5">
                                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                    Select Option
                                  </div>
                                  {(col.options || []).map((opt) => {
                                    const isSelected = columnFilters[col.key] === opt;
                                    return (
                                      <button
                                        key={opt}
                                        onClick={() => {
                                          if (isSelected) {
                                            handleClearColumnFilter(col.key);
                                          } else {
                                            handleSetColumnFilter(col.key, opt);
                                          }
                                          setOpenFilterColKey(null);
                                        }}
                                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                          isSelected
                                            ? 'bg-indigo-600 text-white font-bold'
                                            : 'bg-slate-50 dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'
                                        }`}
                                      >
                                        <span>{opt}</span>
                                        {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                                      </button>
                                    );
                                  })}

                                  {columnFilters[col.key] && (
                                    <button
                                      onClick={() => {
                                        handleClearColumnFilter(col.key);
                                        setOpenFilterColKey(null);
                                      }}
                                      className="w-full mt-2 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-zinc-700 cursor-pointer"
                                    >
                                      Clear Filter
                                    </button>
                                  )}
                                </div>
                              ) : (
                                /* 3. TEXT / NUMBER SEARCH & AUTOMATIC EXISTING VALUES FILTER POPOVER */
                                <div className="space-y-2.5">
                                  <input
                                    type="text"
                                    placeholder={`Filter ${col.label}...`}
                                    value={columnFilters[col.key] || ''}
                                    onChange={(e) => handleSetColumnFilter(col.key, e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    autoFocus
                                  />

                                  {/* Auto-extracted existing dataset values (e.g. Ahmed, Haris, Ali) */}
                                  {existingUniqueValues.length > 0 && (
                                    <div className="space-y-1">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                        Existing Values ({existingUniqueValues.length})
                                      </span>
                                      <div className="max-h-36 overflow-y-auto space-y-1 pr-0.5">
                                        {existingUniqueValues.map((valStr) => {
                                          const isSelected = columnFilters[col.key] === valStr;
                                          return (
                                            <button
                                              key={valStr}
                                              onClick={() => {
                                                if (isSelected) {
                                                  handleClearColumnFilter(col.key);
                                                } else {
                                                  handleSetColumnFilter(col.key, valStr);
                                                }
                                                setOpenFilterColKey(null);
                                              }}
                                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer text-left truncate ${
                                                isSelected
                                                  ? 'bg-indigo-600 text-white font-bold'
                                                  : 'bg-slate-50 dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'
                                              }`}
                                            >
                                              <span className="truncate">{valStr}</span>
                                              {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0 ml-1" />}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200 dark:border-zinc-800">
                                    <button
                                      onClick={() => {
                                        handleClearColumnFilter(col.key);
                                        setOpenFilterColKey(null);
                                      }}
                                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-zinc-700 cursor-pointer"
                                    >
                                      Clear
                                    </button>
                                    <button
                                      onClick={() => setOpenFilterColKey(null)}
                                      className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-xs font-semibold shadow-xs cursor-pointer"
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
                    <th className="w-12 p-2.5 text-center bg-[#1e293b] shrink-0"></th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/60">
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td
                        colSpan={columns.length + 2}
                        className="py-12 text-center text-slate-400 dark:text-zinc-500 text-xs font-medium"
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
                          className="hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 transition-colors group relative"
                        >
                          {/* Serial Number Row Index — Fixes #1 bug: starts strictly at 1 */}
                          <td className="w-14 p-2 text-center font-mono text-[11px] text-slate-500 dark:text-zinc-400 border-r border-slate-200 dark:border-zinc-800/60 bg-slate-50/50 dark:bg-zinc-950/40 sticky left-0 group-hover:bg-slate-100 dark:group-hover:bg-zinc-900 select-none font-bold">
                            {rowIndex + 1}
                          </td>

                          {/* Dynamic Data Columns */}
                          {columns.map((col) => {
                            const val = (entry as any)[col.key] || '';
                            const colW = columnWidths[col.key] || 150;

                            return (
                              <td
                                key={col.key}
                                style={{ width: `${colW}px` }}
                                className="p-2 border-r border-slate-200 dark:border-zinc-800/60 align-middle overflow-hidden"
                              >
                                {col.type === 'select' ? (
                                  col.key === 'task_type' ? (
                                    <div className="flex items-center justify-center w-full">
                                      <select
                                        value={val}
                                        onChange={(e) => handleCellChange(entry.id, col.key, e.target.value)}
                                        className={`w-full px-3 py-1 rounded-full text-xs font-semibold text-center cursor-pointer outline-none transition-all shadow-xs ${
                                          val === 'Scheduled Task'
                                            ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-400/30'
                                            : 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-400/30'
                                        }`}
                                      >
                                        {(col.options || ['Scheduled Task', 'Runtime Task']).map((opt) => (
                                          <option
                                            key={opt}
                                            value={opt}
                                            className="bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100"
                                          >
                                            {opt}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  ) : col.key === 'task_status' ? (
                                    <div className="flex items-center justify-center w-full">
                                      <select
                                        value={val}
                                        onChange={(e) => handleCellChange(entry.id, col.key, e.target.value)}
                                        className={`w-full px-3 py-1 rounded-full text-xs font-semibold text-center cursor-pointer outline-none transition-all shadow-xs ${
                                          val === 'Completed'
                                            ? 'bg-emerald-600 text-white'
                                            : val === 'Blocker'
                                            ? 'bg-rose-600 text-white'
                                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-400/40'
                                        }`}
                                      >
                                        {(col.options || ['Completed', 'Incomplete', 'Blocker']).map((opt) => (
                                          <option
                                            key={opt}
                                            value={opt}
                                            className="bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100"
                                          >
                                            {opt}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  ) : (
                                    <select
                                      value={val}
                                      onChange={(e) => handleCellChange(entry.id, col.key, e.target.value)}
                                      className="w-full px-2 py-1 rounded bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-zinc-700 text-xs outline-none cursor-pointer"
                                    >
                                      <option value="">Select option...</option>
                                      {col.options?.map((opt) => (
                                        <option key={opt} value={opt} className="bg-white dark:bg-zinc-900">
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  )
                                ) : col.type === 'date' ? (
                                  <input
                                    type="text"
                                    value={val}
                                    onChange={(e) => handleCellChange(entry.id, col.key, e.target.value)}
                                    className="w-full px-2 py-1 rounded bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-zinc-700 text-xs font-mono outline-none"
                                  />
                                ) : col.key === 'task_description' || col.key === 'revisions_done' ? (
                                  <textarea
                                    rows={1}
                                    value={val}
                                    onChange={(e) => handleCellChange(entry.id, col.key, e.target.value)}
                                    className="w-full px-2 py-1 rounded bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-zinc-700 text-xs outline-none resize-none leading-relaxed align-middle"
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={val}
                                    onChange={(e) => handleCellChange(entry.id, col.key, e.target.value)}
                                    className="w-full px-2 py-1 rounded bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-zinc-700 text-xs outline-none"
                                  />
                                )}
                              </td>
                            );
                          })}

                          {/* Row Actions Delete */}
                          <td className="w-12 p-2 text-center align-middle relative">
                            <button
                              onClick={() => handleDeleteRow(entry.id)}
                              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-opacity p-1 cursor-pointer"
                              title="Delete Row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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
      </div>

      {/* Excel-Style Bottom Sheet Navigation Bar (August 2026 onwards) */}
      <div className="bg-slate-200 dark:bg-[#121217] border-t border-slate-300 dark:border-zinc-800 px-3 py-1.5 flex items-center justify-between gap-3 text-xs shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
          <button
            onClick={handleAddRow}
            className="p-1 rounded hover:bg-slate-300 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 cursor-pointer"
            title="Add New Row"
          >
            <Plus className="w-4 h-4" />
          </button>

          <button className="p-1 rounded hover:bg-slate-300 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 cursor-pointer">
            <Grid className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-slate-300 dark:bg-zinc-700 mx-1" />

          {/* Month Sheet Tabs (Aug 2026+) */}
          {availableSheets.map((sheet) => (
            <button
              key={sheet}
              onClick={() => handleSheetChange(sheet)}
              className={`flex items-center gap-1.5 px-3.5 py-1 rounded-t-md text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeSheet === sheet
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-zinc-900 text-slate-700 dark:text-zinc-400 hover:bg-slate-300 dark:hover:bg-zinc-800'
              }`}
            >
              <span>{sheet}</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
          ))}
        </div>

        {/* Count and Statistics Footer Indicator */}
        <div className="flex items-center gap-4 text-[11px] font-mono text-slate-600 dark:text-zinc-400 shrink-0">
          <span>
            Count:{' '}
            <strong className="text-slate-900 dark:text-zinc-100 font-bold">{filteredEntries.length}</strong>
          </span>
        </div>
      </div>

      {/* Enhanced Custom Column Management & Field Creation Modal (Strictly Restricted to Admins) */}
      {isAdmin && isColumnModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#121217] border border-slate-200 dark:border-zinc-800 rounded-xl max-w-xl w-full p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-indigo-500" />
                <span>Manage & Add Matrix Fields</span>
              </h3>
              <button
                onClick={() => setIsColumnModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 text-xs font-bold p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form to Add New Column */}
            <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-800/40 rounded-xl space-y-2.5">
              <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300 block">
                + Add New Field Header
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Field Name (e.g. Priority)"
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs text-slate-900 dark:text-zinc-100 focus:outline-none"
                />
                <select
                  value={newFieldType}
                  onChange={(e) => setNewFieldType(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs text-slate-800 dark:text-zinc-200 cursor-pointer"
                >
                  <option value="text">Text Input</option>
                  <option value="select">Dropdown Menu</option>
                  <option value="date">Date Picker</option>
                  <option value="number">Numeric</option>
                </select>
                <button
                  type="button"
                  onClick={handleAddNewColumn}
                  disabled={!newFieldLabel.trim()}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Field</span>
                </button>
              </div>
              {newFieldType === 'select' && (
                <input
                  type="text"
                  placeholder="Dropdown options separated by commas (e.g. High, Medium, Low)"
                  value={newFieldOptions}
                  onChange={(e) => setNewFieldOptions(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs text-slate-900 dark:text-zinc-100 focus:outline-none"
                />
              )}
            </div>

            {/* List of Existing Columns */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                Active Columns ({columns.length})
              </span>
              {columns.map((col, idx) => (
                <div
                  key={col.key}
                  className="flex items-center gap-2.5 bg-slate-50 dark:bg-zinc-900/80 p-2 rounded-lg border border-slate-200 dark:border-zinc-800"
                >
                  <span className="font-mono text-xs font-bold text-slate-400 w-5 text-center shrink-0">
                    {getColumnLetter(idx)}
                  </span>
                  <input
                    type="text"
                    value={col.label}
                    onChange={(e) => {
                      const newCols = [...columns];
                      newCols[idx].label = e.target.value;
                      setColumns(newCols);
                    }}
                    className="flex-1 px-2 py-1 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded text-xs text-slate-900 dark:text-zinc-100 focus:outline-none"
                  />
                  <select
                    value={col.type}
                    onChange={(e) => {
                      const newCols = [...columns];
                      newCols[idx].type = e.target.value as any;
                      setColumns(newCols);
                    }}
                    className="px-2 py-1 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded text-xs text-slate-800 dark:text-zinc-200 cursor-pointer"
                  >
                    <option value="text">Text</option>
                    <option value="select">Dropdown</option>
                    <option value="date">Date</option>
                    <option value="number">Number</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleDeleteColumn(col.key)}
                    className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                    title="Remove Column"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setIsColumnModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-xs font-medium text-slate-700 dark:text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveColumns}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-xs cursor-pointer"
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
