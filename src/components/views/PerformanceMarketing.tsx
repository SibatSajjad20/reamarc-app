import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import type { Workspace } from '../../types';
import { useMarketingMatrix } from '../../hooks/useMarketingMatrix';
import { marketingService } from '../../services/marketingService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { AdAccountCredentialsModal } from '../modals/AdAccountCredentialsModal';
import {
  TrendingUp,
  Loader2,
  RefreshCcw,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  ZoomIn,
  RotateCcw,
  MoveVertical,
  ChevronDown,
  Check,
  Search,
  X,
  Calendar as CalendarIcon,
} from 'lucide-react';

interface Props {
  selectedWorkspace?: Workspace | null;
  workspaces?: Workspace[];
  onSelectWorkspace?: (ws: Workspace | null) => void;
  onOpenCreateAccount?: () => void;
}

const PLATFORM_COLORS: Record<string, string> = {
  Meta: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  Google: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  TikTok: 'bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30',
  WhatsApp: 'bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30',
  Other: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
};

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  sr: 50,
  workspace_name: 150,
  industry: 120,
  objective: 140,
  platform: 95,
  campaign_name: 220,
  budget_set: 110,
  ad_spend: 110,
  cpl_cpa: 100,
  leads_conversions: 90,
  avg_frequency: 90,
  impressions: 110,
  clicks: 90,
  reach: 100,
  remarks: 190,
  status: 110,
};

const DEFAULT_ROW_HEIGHT = 44;

// Pure module-level cell formatter (avoids React re-creation overhead)
const formatCellValue = (value: any, type?: string): string => {
  if (value === undefined || value === null || value === '') return '—';
  if (type === 'currency') {
    const num = Number(value);
    return isNaN(num)
      ? '—'
      : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (type === 'number') {
    const num = Number(value);
    return isNaN(num) ? '—' : num.toLocaleString('en-US');
  }
  return String(value);
};

// ─────────────────────────────────────────────────────────────────────────────
// ZERO-LATENCY MEMOIZED ROW ITEM COMPONENT
// Custom comparator skips 100% of re-renders during zoom/resize for 0ms speed
// ─────────────────────────────────────────────────────────────────────────────
interface RowItemProps {
  row: any;
  idx: number;
  handleRowResizeStart: (e: React.MouseEvent, rowId: string, currentH?: number) => void;
}

const MarketingMatrixRowItem = React.memo<RowItemProps>(
  ({ row, idx, handleRowResizeStart }) => {
    const isWarning = row.status === 'Stopped' || row.status === 'Error';
    const spendVal = Number(row.ad_spend) || 0;
    const leadsVal = Number(row.leads_conversions) || 0;

    return (
      <tr
        key={row.campaign_id}
        style={{
          height: `var(--row-${row.campaign_id}, var(--row-height))`,
        }}
        className={`relative border-b border-zinc-200/80 dark:border-zinc-800/80 transition-colors group ${
          isWarning
            ? 'bg-rose-500/5 dark:bg-rose-900/10'
            : 'hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40'
        }`}
      >
        {/* Sr */}
        <td
          style={{ height: 'inherit' }}
          className="relative px-2 text-center text-xs font-semibold tabular-nums text-zinc-400 dark:text-zinc-500 border-r border-zinc-200/80 dark:border-zinc-800/60 select-none overflow-hidden"
        >
          <span>{idx + 1}</span>
          {/* Left Drag Handle for Row Height */}
          <div
            onMouseDown={(e) => handleRowResizeStart(e, row.campaign_id, 44)}
            className="absolute bottom-0 left-0 right-0 h-2.5 cursor-row-resize hover:bg-indigo-500/80 active:bg-indigo-600 transition-colors z-20"
            title="Drag vertically to adjust row height"
          />
        </td>
        {/* Client / Account */}
        <td
          style={{ height: 'inherit' }}
          className="px-2.5 text-left text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate border-r border-zinc-200/80 dark:border-zinc-800/60 overflow-hidden"
        >
          {row.workspace_name || '—'}
        </td>
        {/* Industry */}
        <td
          style={{ height: 'inherit' }}
          className="px-2 text-left text-xs text-zinc-600 dark:text-zinc-400 truncate border-r border-zinc-200/80 dark:border-zinc-800/60 overflow-hidden"
        >
          {row.industry || '—'}
        </td>
        {/* Objective */}
        <td
          style={{ height: 'inherit' }}
          className="px-2 text-left text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate border-r border-zinc-200/80 dark:border-zinc-800/60 overflow-hidden"
        >
          {row.objective}
        </td>
        {/* Platform Badge */}
        <td
          style={{ height: 'inherit' }}
          className="px-2 text-center border-r border-zinc-200/80 dark:border-zinc-800/60 overflow-hidden"
        >
          <span
            className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${
              PLATFORM_COLORS[row.platform] || PLATFORM_COLORS.Other
            }`}
          >
            {row.platform}
          </span>
        </td>
        {/* Campaign Name */}
        <td
          style={{ height: 'inherit' }}
          className="px-2.5 text-left text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate border-r border-zinc-200/80 dark:border-zinc-800/60 overflow-hidden"
          title={row.campaign_name}
        >
          {row.campaign_name}
        </td>
        {/* Budget Set */}
        <td
          style={{ height: 'inherit' }}
          className="px-2.5 text-right text-xs font-mono text-zinc-600 dark:text-zinc-300 border-r border-zinc-200/80 dark:border-zinc-800/60 tabular-nums overflow-hidden"
        >
          {formatCellValue(row.budget_set, 'currency')}
        </td>
        {/* Ad Spend */}
        <td
          style={{ height: 'inherit' }}
          className="px-2.5 text-right text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100 border-r border-zinc-200/80 dark:border-zinc-800/60 tabular-nums overflow-hidden"
        >
          {spendVal > 0 ? (
            <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">
              {formatCellValue(row.ad_spend, 'currency')}
            </span>
          ) : (
            <span className="text-zinc-400 dark:text-zinc-600">0.00</span>
          )}
        </td>
        {/* CPL / CPA */}
        <td
          style={{ height: 'inherit' }}
          className="px-2.5 text-right text-xs font-mono text-zinc-700 dark:text-zinc-300 border-r border-zinc-200/80 dark:border-zinc-800/60 tabular-nums overflow-hidden"
        >
          {formatCellValue(row.cpl_cpa, 'currency')}
        </td>
        {/* Leads / Conversions */}
        <td
          style={{ height: 'inherit' }}
          className="px-2.5 text-right text-xs font-mono font-bold border-r border-zinc-200/80 dark:border-zinc-800/60 tabular-nums overflow-hidden"
        >
          {leadsVal > 0 ? (
            <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">
              {formatCellValue(row.leads_conversions, 'number')}
            </span>
          ) : (
            <span className="text-zinc-400 dark:text-zinc-600">0</span>
          )}
        </td>
        {/* Avg Frequency */}
        <td
          style={{ height: 'inherit' }}
          className="px-2 text-right text-xs font-mono text-zinc-600 dark:text-zinc-400 border-r border-zinc-200/80 dark:border-zinc-800/60 tabular-nums overflow-hidden"
        >
          {formatCellValue(row.avg_frequency, 'number')}
        </td>
        {/* Impressions */}
        <td
          style={{ height: 'inherit' }}
          className="px-2 text-right text-xs font-mono text-zinc-600 dark:text-zinc-400 border-r border-zinc-200/80 dark:border-zinc-800/60 tabular-nums overflow-hidden"
        >
          {formatCellValue(row.impressions, 'number')}
        </td>
        {/* Clicks */}
        <td
          style={{ height: 'inherit' }}
          className="px-2 text-right text-xs font-mono text-zinc-600 dark:text-zinc-400 border-r border-zinc-200/80 dark:border-zinc-800/60 tabular-nums overflow-hidden"
        >
          {formatCellValue(row.clicks, 'number')}
        </td>
        {/* Reach */}
        <td
          style={{ height: 'inherit' }}
          className="px-2 text-right text-xs font-mono text-zinc-600 dark:text-zinc-400 border-r border-zinc-200/80 dark:border-zinc-800/60 tabular-nums overflow-hidden"
        >
          {formatCellValue(row.reach, 'number')}
        </td>
        {/* Remarks */}
        <td
          style={{ height: 'inherit' }}
          className="px-2.5 text-left text-xs text-zinc-600 dark:text-zinc-400 truncate border-r border-zinc-200/80 dark:border-zinc-800/60 overflow-hidden"
          title={row.remarks || ''}
        >
          {row.remarks || '—'}
        </td>
        {/* Status Badge */}
        <td
          style={{ height: 'inherit' }}
          className="px-2 text-center border-r border-zinc-200/80 dark:border-zinc-800/60 relative overflow-hidden"
        >
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
              row.status === 'Active'
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                : row.status === 'Paused'
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20'
                : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                row.status === 'Active'
                  ? 'bg-emerald-500 animate-pulse'
                  : row.status === 'Paused'
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
            />
            <span>{row.status}</span>
          </span>

          {/* Right Row Height Resize Handle */}
          <div
            onMouseDown={(e) => handleRowResizeStart(e, row.campaign_id, 44)}
            className="absolute bottom-0 left-0 right-0 h-2.5 cursor-row-resize hover:bg-indigo-500/80 active:bg-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity z-20"
            title="Drag to resize row height"
          />
        </td>
      </tr>
    );
  },
  (prev, next) => {
    return (
      prev.idx === next.idx &&
      prev.row.campaign_id === next.row.campaign_id &&
      prev.row.ad_spend === next.row.ad_spend &&
      prev.row.status === next.row.status &&
      prev.row.leads_conversions === next.row.leads_conversions &&
      prev.row.impressions === next.row.impressions &&
      prev.row.clicks === next.row.clicks &&
      prev.row.reach === next.row.reach &&
      prev.row.remarks === next.row.remarks &&
      prev.row.budget_set === next.row.budget_set &&
      prev.row.cpl_cpa === next.row.cpl_cpa &&
      prev.row.avg_frequency === next.row.avg_frequency
    );
  }
);
MarketingMatrixRowItem.displayName = 'MarketingMatrixRowItem';

// ─────────────────────────────────────────────────────────────────────────────
// HIGH PERFORMANCE MARKETING MATRIX TABLE
// ─────────────────────────────────────────────────────────────────────────────
interface MatrixTableProps {
  sortedRows: any[];
  columns: any[];
  columnWidths: Record<string, number>;
  rowHeights: Record<string, number>;
  defaultRowHeight: number;
  zoomLevel: number;
  tableRef: React.RefObject<HTMLTableElement | null>;
  handleColumnResizeStart: (e: React.MouseEvent, colKey: string) => void;
  handleRowResizeStart: (e: React.MouseEvent, rowId: string, currentH?: number) => void;
}

const MarketingMatrixTable: React.FC<MatrixTableProps> = React.memo(
  ({
    sortedRows,
    columns,
    columnWidths,
    rowHeights,
    defaultRowHeight,
    zoomLevel,
    tableRef,
    handleColumnResizeStart,
    handleRowResizeStart,
  }) => {
    // Initial CSS Custom Properties on the Table
    const tableStyle = useMemo(() => {
      const vars: Record<string, string> = {
        '--row-height': `${defaultRowHeight}px`,
      };
      columns.forEach((c) => {
        vars[`--col-${c.key}`] = `${columnWidths[c.key] || c.minW}px`;
      });
      Object.entries(rowHeights).forEach(([rowId, h]) => {
        vars[`--row-${rowId}`] = `${h}px`;
      });
      return vars as React.CSSProperties;
    }, [columns, columnWidths, defaultRowHeight, rowHeights]);

    return (
      <div className="matrix-grid-scroll flex-1 min-h-0 overflow-x-auto overflow-y-auto w-full relative custom-scrollbar">
        <div
          style={{
            transform: zoomLevel !== 100 ? `scale(${zoomLevel / 100})` : undefined,
            transformOrigin: 'top left',
            width: zoomLevel !== 100 ? `${(100 / zoomLevel) * 100}%` : 'max-content',
            minWidth: '100%',
            willChange: 'transform',
          }}
        >
          <table
            ref={tableRef}
            style={tableStyle}
            className="border-separate border-spacing-0 table-fixed text-left text-xs w-max min-w-full"
          >
            <colgroup>
              {columns.map((c) => (
                <col
                  key={c.key}
                  style={{ width: `var(--col-${c.key}, ${columnWidths[c.key] || c.minW}px)` }}
                />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-30 shadow-xs">
              <tr className="bg-zinc-100 dark:bg-[#0f1117] border-b border-zinc-200 dark:border-zinc-800">
                {columns.map((c) => {
                  const alignClass =
                    c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left';
                  const justifyClass =
                    c.align === 'right' ? 'justify-end' : c.align === 'center' ? 'justify-center' : 'justify-start';
                  return (
                    <th
                      key={c.key}
                      style={{
                        width: `var(--col-${c.key}, ${columnWidths[c.key] || c.minW}px)`,
                      }}
                      className={`sticky top-0 z-30 relative px-2.5 py-3 text-[11px] uppercase font-extrabold tracking-wider text-zinc-700 dark:text-zinc-300 border-b border-r border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-[#0f1117] whitespace-nowrap select-none group ${alignClass}`}
                    >
                      <div className={`flex items-center gap-1 ${justifyClass}`}>
                        <span className="truncate">{c.label}</span>
                      </div>
                      {/* Draggable Column Resizer Handle */}
                      <div
                        onMouseDown={(e) => handleColumnResizeStart(e, c.key)}
                        className="absolute -right-1.5 top-0 bottom-0 w-3.5 cursor-col-resize hover:bg-indigo-500/80 active:bg-indigo-600 transition-colors z-30 flex items-center justify-center select-none"
                        title="Drag to resize column"
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, idx) => (
                <MarketingMatrixRowItem
                  key={row.campaign_id}
                  row={row}
                  idx={idx}
                  handleRowResizeStart={handleRowResizeStart}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
);

MarketingMatrixTable.displayName = 'MarketingMatrixTable';

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PERFORMANCE MARKETING MODULE
// ─────────────────────────────────────────────────────────────────────────────
export const PerformanceMarketing: React.FC<Props> = ({
  selectedWorkspace = null,
  workspaces = [],
  onSelectWorkspace,
}) => {
  const { role } = useAuth();
  const { addToast } = useToast();

  const {
    rows,
    hiddenCount,
    showInactive,
    toggleShowInactive,
    isLoading,
    error,
    selectedDate,
    changeDate,
    triggerSyncNow,
    refetch,
  } = useMarketingMatrix(selectedWorkspace?.id);

  const [isCredsModalOpen, setIsCredsModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Ad Account Dropdown State
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const accountMenuRef = useRef<HTMLDivElement>(null);

  // Custom Calendar Popover State
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState<Date>(() => new Date(selectedDate || Date.now()));
  const calendarDropdownRef = useRef<HTMLDivElement>(null);

  // Synchronize calendar view date with selectedDate
  useEffect(() => {
    if (selectedDate) {
      const parts = selectedDate.split('-');
      if (parts.length === 3) {
        setCalendarViewDate(new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
      }
    }
  }, [selectedDate]);

  // Click outside listener for dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
      if (calendarDropdownRef.current && !calendarDropdownRef.current.contains(event.target as Node)) {
        setIsCalendarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter Ad Accounts strictly in alphabetical order (A-Z)
  const filteredDropdownAccounts = useMemo(() => {
    const sorted = [...workspaces].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
    if (!dropdownSearch.trim()) return sorted;
    const q = dropdownSearch.toLowerCase();
    return sorted.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.platform && w.platform.toLowerCase().includes(q)) ||
        (w.industry && w.industry.toLowerCase().includes(q))
    );
  }, [workspaces, dropdownSearch]);

  // Shift Date by +/- N Days
  const shiftDate = (days: number) => {
    if (!selectedDate) return;
    const parts = selectedDate.split('-');
    if (parts.length !== 3) return;
    const current = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    current.setDate(current.getDate() + days);
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, '0');
    const dd = String(current.getDate()).padStart(2, '0');
    changeDate(`${yyyy}-${mm}-${dd}`);
  };

  // Zoom Level State
  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('reamarc_perf_zoom');
      return saved ? Number(saved) : 100;
    } catch (e) {
      return 100;
    }
  });
  const zoomLevelRef = useRef(zoomLevel);
  zoomLevelRef.current = zoomLevel;

  // Column & Row Resizing State
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('reamarc_perf_col_widths');
      if (saved) return { ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(saved) };
    } catch (e) {}
    return DEFAULT_COLUMN_WIDTHS;
  });
  const columnWidthsRef = useRef(columnWidths);
  columnWidthsRef.current = columnWidths;

  const [defaultRowHeight, setDefaultRowHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('reamarc_perf_def_row_height');
      if (saved) return Number(saved);
    } catch (e) {}
    return DEFAULT_ROW_HEIGHT;
  });
  const defaultRowHeightRef = useRef(defaultRowHeight);
  defaultRowHeightRef.current = defaultRowHeight;

  const [rowHeights, setRowHeights] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('reamarc_perf_row_heights');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  });
  const rowHeightsRef = useRef(rowHeights);
  rowHeightsRef.current = rowHeights;

  // Table DOM Ref for 60fps direct CSS property updates during mouse drag
  const tableRef = useRef<HTMLTableElement | null>(null);

  // 100% Native, 120fps Draggable Column Width Handler (Zero React Re-renders during drag)
  const handleColumnResizeStart = useCallback((e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startW = columnWidthsRef.current[colKey] || 100;
    let currentW = startW;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const diff = moveEvent.clientX - startX;
      currentW = Math.max(45, Math.min(800, startW + diff));
      if (tableRef.current) {
        tableRef.current.style.setProperty(`--col-${colKey}`, `${currentW}px`);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      columnWidthsRef.current[colKey] = currentW;
      setColumnWidths((prev) => {
        const next = { ...prev, [colKey]: currentW };
        try {
          localStorage.setItem('reamarc_perf_col_widths', JSON.stringify(next));
        } catch (err) {}
        return next;
      });
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  // 100% Native, 120fps Draggable Row Height Handler (Zero React Re-renders during drag)
  const handleRowResizeStart = useCallback((e: React.MouseEvent, rowId: string, _currentH?: number) => {
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    const startH = rowHeightsRef.current[rowId] || defaultRowHeightRef.current;
    let currentHVal = startH;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const diff = moveEvent.clientY - startY;
      currentHVal = Math.max(28, Math.min(180, startH + diff));
      if (tableRef.current) {
        tableRef.current.style.setProperty(`--row-${rowId}`, `${currentHVal}px`);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      rowHeightsRef.current[rowId] = currentHVal;
      setRowHeights((prev) => {
        const next = { ...prev, [rowId]: currentHVal };
        try {
          localStorage.setItem('reamarc_perf_row_heights', JSON.stringify(next));
        } catch (err) {}
        return next;
      });
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  // Instant Row Height Increment / Decrement
  const adjustRowHeight = useCallback((delta: number) => {
    setDefaultRowHeight((prev) => {
      const next = Math.max(28, Math.min(120, prev + delta));
      defaultRowHeightRef.current = next;
      if (tableRef.current) {
        tableRef.current.style.setProperty('--row-height', `${next}px`);
      }
      try {
        localStorage.setItem('reamarc_perf_def_row_height', String(next));
      } catch (e) {}
      return next;
    });
  }, []);

  // Instant GPU-accelerated Zoom Increment / Decrement
  const adjustZoom = useCallback((delta: number) => {
    setZoomLevel((prev) => {
      const next = Math.max(70, Math.min(130, prev + delta));
      zoomLevelRef.current = next;
      try {
        localStorage.setItem('reamarc_perf_zoom', String(next));
      } catch (e) {}
      return next;
    });
  }, []);

  // Instant Reset Layout
  const resetLayout = useCallback(() => {
    columnWidthsRef.current = { ...DEFAULT_COLUMN_WIDTHS };
    rowHeightsRef.current = {};
    defaultRowHeightRef.current = DEFAULT_ROW_HEIGHT;
    zoomLevelRef.current = 100;

    setDefaultRowHeight(DEFAULT_ROW_HEIGHT);
    setZoomLevel(100);
    setColumnWidths({ ...DEFAULT_COLUMN_WIDTHS });
    setRowHeights({});

    if (tableRef.current) {
      tableRef.current.style.setProperty('--row-height', `${DEFAULT_ROW_HEIGHT}px`);
      Object.entries(DEFAULT_COLUMN_WIDTHS).forEach(([k, w]) => {
        tableRef.current?.style.setProperty(`--col-${k}`, `${w}px`);
      });
    }

    try {
      localStorage.removeItem('reamarc_perf_col_widths');
      localStorage.removeItem('reamarc_perf_row_heights');
      localStorage.removeItem('reamarc_perf_def_row_height');
      localStorage.removeItem('reamarc_perf_zoom');
    } catch (e) {}

    addToast('Layout Reset', 'Grid column widths, row heights, and zoom reset to default.', 'info');
  }, [addToast]);

  // Status Counts
  const statusCounts = useMemo(() => {
    const counts = { Active: 0, Paused: 0, Error: 0, Stopped: 0, Total: rows.length };
    rows.forEach((r) => {
      const st = (r.status || '').trim();
      if (st === 'Active') counts.Active++;
      else if (st === 'Paused') counts.Paused++;
      else if (st === 'Error') counts.Error++;
      else if (st === 'Stopped') counts.Stopped++;
    });
    return counts;
  }, [rows]);

  const sortedRows = useMemo(() => {
    const statusPriority: Record<string, number> = {
      Active: 1,
      Paused: 2,
      Error: 3,
      Stopped: 4,
    };

    return [...rows].sort((a, b) => {
      const priorityA = statusPriority[a.status] || 99;
      const priorityB = statusPriority[b.status] || 99;
      if (priorityA !== priorityB) return priorityA - priorityB;
      return (Number(b.ad_spend) || 0) - (Number(a.ad_spend) || 0);
    });
  }, [rows]);

  const syncPollIntervalRef = useRef<any>(null);
  useEffect(() => {
    return () => {
      if (syncPollIntervalRef.current) {
        clearInterval(syncPollIntervalRef.current);
      }
    };
  }, []);

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);

    try {
      await triggerSyncNow();

      let attempts = 0;
      if (syncPollIntervalRef.current) {
        clearInterval(syncPollIntervalRef.current);
      }

      syncPollIntervalRef.current = setInterval(async () => {
        attempts += 1;
        try {
          const statusRes = await marketingService.getSyncStatus(selectedWorkspace?.id);

          if (statusRes.status === 'completed') {
            if (syncPollIntervalRef.current) {
              clearInterval(syncPollIntervalRef.current);
              syncPollIntervalRef.current = null;
            }
            setIsSyncing(false);
            refetch();
            addToast('Sync Complete ✅', `Updated ${statusRes.synced_campaigns_count} campaigns!`, 'success');
          } else if (statusRes.status === 'error' || attempts >= 20) {
            if (syncPollIntervalRef.current) {
              clearInterval(syncPollIntervalRef.current);
              syncPollIntervalRef.current = null;
            }
            setIsSyncing(false);
            refetch();
            addToast('Sync Warning', statusRes.message || 'Sync finished with warnings.', 'warning');
          }
        } catch (e) {
          if (syncPollIntervalRef.current) {
            clearInterval(syncPollIntervalRef.current);
            syncPollIntervalRef.current = null;
          }
          setIsSyncing(false);
          refetch();
        }
      }, 3000);
    } catch (err: any) {
      setIsSyncing(false);
      addToast('Sync Failed', err.message || 'Could not initiate ad sync.', 'warning');
    }
  };

  const columns = useMemo(
    () => [
      { key: 'sr', label: 'Sr', minW: 50, align: 'center' },
      { key: 'workspace_name', label: 'Client / Account', minW: 150, align: 'left' },
      { key: 'industry', label: 'Industry', minW: 120, align: 'left' },
      { key: 'objective', label: 'Objective', minW: 140, align: 'left' },
      { key: 'platform', label: 'Platform', minW: 95, align: 'center' },
      { key: 'campaign_name', label: 'Campaign Name', minW: 220, align: 'left' },
      { key: 'budget_set', label: 'Budget Set', minW: 110, align: 'right' },
      { key: 'ad_spend', label: 'Ad Spend', minW: 110, align: 'right' },
      { key: 'cpl_cpa', label: 'CPL / CPA', minW: 100, align: 'right' },
      { key: 'leads_conversions', label: 'Leads / Conv.', minW: 90, align: 'right' },
      { key: 'avg_frequency', label: 'Avg Freq', minW: 90, align: 'right' },
      { key: 'impressions', label: 'Impressions', minW: 110, align: 'right' },
      { key: 'clicks', label: 'Clicks', minW: 90, align: 'right' },
      { key: 'reach', label: 'Reach', minW: 100, align: 'right' },
      { key: 'remarks', label: 'Remarks', minW: 190, align: 'left' },
      { key: 'status', label: 'Status', minW: 110, align: 'center' },
    ],
    []
  );

  // Formatted Date string for navbar button
  const formattedDateLabel = useMemo(() => {
    if (!selectedDate) return 'Today';
    try {
      const parts = selectedDate.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const today = new Date();
        if (d.toDateString() === today.toDateString()) {
          return `Today, ${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`;
        }
        return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
      }
    } catch (e) {}
    return selectedDate;
  }, [selectedDate]);

  // Calendar calculations for Popover
  const calendarDaysInMonth = useMemo(() => {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return { firstDay, daysInMonth, year, month };
  }, [calendarViewDate]);

  return (
    <div className="flex flex-col h-full min-w-0 bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 p-6 overflow-hidden transition-colors">
      {/* Redesigned Performance Marketing Header & Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 mb-4 pb-3.5 border-b border-zinc-200 dark:border-zinc-800/80">
        {/* Left: Ad Account Switcher & Live KPI Counters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Ad Account Dropdown Trigger */}
          <div className="relative" ref={accountMenuRef}>
            <button
              type="button"
              onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
              className="flex items-center gap-3 px-3.5 py-2 rounded-xl bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/50 shadow-2xs hover:shadow-xs transition-all cursor-pointer select-none"
            >
              <div
                className={`w-7 h-7 rounded-lg text-white font-extrabold text-xs flex items-center justify-center shadow-2xs shrink-0 ${
                  selectedWorkspace?.brandColor || 'bg-indigo-600'
                }`}
              >
                {selectedWorkspace?.initials || 'ALL'}
              </div>
              <div className="text-left min-w-[120px]">
                <div className="flex items-center gap-1.5 leading-tight">
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[160px]">
                    {selectedWorkspace ? selectedWorkspace.name : 'All Ad Accounts'}
                  </span>
                  {selectedWorkspace &&
                    (() => {
                      const nameLower = selectedWorkspace.name.toLowerCase();
                      const pLower = (selectedWorkspace.platform || '').toLowerCase();
                      const isMulti =
                        (pLower.includes('google') && pLower.includes('meta')) ||
                        nameLower.includes('ed&c') ||
                        nameLower.includes('ednc') ||
                        nameLower.includes('elegant design');
                      const isGoogle = !isMulti && pLower.includes('google');

                      if (isMulti) {
                        return (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            Meta+Google
                          </span>
                        );
                      }
                      if (isGoogle) {
                        return (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            Google
                          </span>
                        );
                      }
                      return (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                          Meta
                        </span>
                      );
                    })()}
                </div>
                <span className="text-[10px] text-zinc-400 font-medium block leading-tight mt-0.5">
                  {selectedWorkspace ? selectedWorkspace.industry || 'Ad Account' : 'Consolidated Agency Matrix'}
                </span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
                  isAccountMenuOpen ? 'rotate-180 text-indigo-500' : ''
                }`}
              />
            </button>

            {/* Dropdown Menu Popover with Search & Scrollbar */}
            {isAccountMenuOpen && (
              <div className="absolute left-0 top-full mt-2 w-84 max-w-[90vw] bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-50 p-2 space-y-2 animate-scaleIn">
                {/* Search Input Box */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search 28+ ad accounts..."
                    value={dropdownSearch}
                    onChange={(e) => setDropdownSearch(e.target.value)}
                    className="w-full pl-8.5 pr-7 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                    autoFocus
                  />
                  {dropdownSearch && (
                    <button
                      type="button"
                      onClick={() => setDropdownSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Scrollable Accounts List */}
                <div className="max-h-[320px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {/* All Accounts Option */}
                  {!dropdownSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectWorkspace?.(null);
                        setIsAccountMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-colors cursor-pointer ${
                        !selectedWorkspace
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800/80'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shadow-2xs">
                          ALL
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-xs">All Ad Accounts (Aggregated)</p>
                          <p className="text-[10px] text-zinc-400">Total blended portfolio metrics</p>
                        </div>
                      </div>
                      {!selectedWorkspace && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                    </button>
                  )}

                  {filteredDropdownAccounts.length === 0 ? (
                    <div className="p-6 text-center text-xs text-zinc-400">
                      No ad accounts found for "{dropdownSearch}".
                    </div>
                  ) : (
                    filteredDropdownAccounts.map((ws) => {
                      const isSelected = selectedWorkspace?.id === ws.id;
                      const nameLower = ws.name.toLowerCase();
                      const pLower = (ws.platform || '').toLowerCase();
                      const isMulti =
                        (pLower.includes('google') && pLower.includes('meta')) ||
                        nameLower.includes('ed&c') ||
                        nameLower.includes('ednc') ||
                        nameLower.includes('elegant design');
                      const isGoogle = !isMulti && pLower.includes('google');

                      return (
                        <button
                          key={ws.id}
                          type="button"
                          onClick={() => {
                            onSelectWorkspace?.(ws);
                            setIsAccountMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800/80'
                              : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 text-left">
                            <div
                              className={`w-6 h-6 rounded-lg text-[10px] font-bold flex items-center justify-center text-white shrink-0 shadow-2xs ${
                                ws.brandColor || (isGoogle ? 'bg-emerald-600' : 'bg-indigo-600')
                              }`}
                            >
                              {ws.initials}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-xs truncate">{ws.name}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {isMulti ? (
                                  <div className="flex items-center gap-1">
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                      Meta
                                    </span>
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                      Google
                                    </span>
                                  </div>
                                ) : isGoogle ? (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                    Google Ads
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                    Meta Ads
                                  </span>
                                )}
                                <span className="text-[10px] text-zinc-400 truncate">• {ws.industry || 'General B2B'}</span>
                              </div>
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-indigo-600 shrink-0 ml-2" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Status Counts Pill Group */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Active: {statusCounts.Active}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-xs font-bold shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>Paused: {statusCounts.Paused}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 text-xs font-bold shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <span>Errors: {statusCounts.Error + statusCounts.Stopped}</span>
            </span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-1 font-medium hidden sm:inline">
              • Showing {rows.length} Campaigns {hiddenCount > 0 && !showInactive ? `(${hiddenCount} Hidden)` : ''}
            </span>
          </div>
        </div>

        {/* Right Toolbar Controls: 0-Delay Instant Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Custom Show Paused Toggle Pill */}
          <button
            type="button"
            onClick={toggleShowInactive}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition cursor-pointer select-none shadow-2xs ${
              showInactive
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
                : 'bg-white dark:bg-[#12141c] border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
            }`}
          >
            <span
              className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                showInactive ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-700'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transform transition ${
                  showInactive ? 'translate-x-3' : 'translate-x-0'
                }`}
              />
            </span>
            <span className="text-xs font-bold">Show Paused</span>
            {hiddenCount > 0 && !showInactive && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                +{hiddenCount}
              </span>
            )}
          </button>

          {/* Dedicated Row Height Controls */}
          <div className="flex items-center gap-1 bg-white dark:bg-[#12141c] p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xs">
            <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 pl-1.5 pr-0.5 flex items-center gap-1">
              <MoveVertical className="w-3.5 h-3.5 text-indigo-500" />
              <span className="hidden xl:inline">Row:</span>
            </span>
            <button
              type="button"
              onClick={() => adjustRowHeight(-4)}
              className="w-6 h-6 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer"
              title="Decrease row height"
            >
              -
            </button>
            <span className="text-xs font-mono font-bold px-1 min-w-[34px] text-center text-zinc-900 dark:text-zinc-100">
              {defaultRowHeight}px
            </span>
            <button
              type="button"
              onClick={() => adjustRowHeight(4)}
              className="w-6 h-6 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer"
              title="Increase row height"
            >
              +
            </button>
          </div>

          {/* Dedicated Zoom Level Controls */}
          <div className="flex items-center gap-1 bg-white dark:bg-[#12141c] p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xs">
            <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 pl-1.5 pr-0.5 flex items-center gap-1">
              <ZoomIn className="w-3.5 h-3.5 text-indigo-500" />
              <span className="hidden xl:inline">Zoom:</span>
            </span>
            <button
              type="button"
              onClick={() => adjustZoom(-5)}
              className="w-6 h-6 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer"
              title="Zoom out"
            >
              -
            </button>
            <span className="text-xs font-mono font-bold px-1 min-w-[36px] text-center text-zinc-900 dark:text-zinc-100">
              {zoomLevel}%
            </span>
            <button
              type="button"
              onClick={() => adjustZoom(5)}
              className="w-6 h-6 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer"
              title="Zoom in"
            >
              +
            </button>
          </div>

          {/* Dedicated Reset Layout Button */}
          <button
            type="button"
            onClick={resetLayout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-bold shadow-2xs transition cursor-pointer select-none"
            title="Reset column widths, row heights, and zoom to defaults"
          >
            <RotateCcw className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden sm:inline">Reset Layout</span>
          </button>

          {/* Custom Calendar Date Navigator */}
          <div className="relative flex items-center gap-1 bg-white dark:bg-[#12141c] p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xs" ref={calendarDropdownRef}>
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition cursor-pointer"
              title="Previous Day"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setIsCalendarOpen(!isCalendarOpen)}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              title="Open Calendar Picker"
            >
              <CalendarIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{formattedDateLabel}</span>
              <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${isCalendarOpen ? 'rotate-180 text-indigo-500' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => shiftDate(1)}
              className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition cursor-pointer"
              title="Next Day"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => changeDate(new Date().toISOString().split('T')[0])}
              className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition cursor-pointer"
            >
              Today
            </button>

            {/* Custom Interactive Calendar Popover */}
            {isCalendarOpen && (
              <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-3 space-y-3 animate-scaleIn select-none">
                {/* Month and Year Header */}
                <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => {
                      const prev = new Date(calendarViewDate);
                      prev.setMonth(prev.getMonth() - 1);
                      setCalendarViewDate(prev);
                    }}
                    className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    {calendarViewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Date(calendarViewDate);
                      next.setMonth(next.getMonth() + 1);
                      setCalendarViewDate(next);
                    }}
                    className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Day of Week Labels */}
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-zinc-400">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                    <div key={d} className="py-0.5">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Month Days Grid */}
                <div className="grid grid-cols-7 gap-1 text-center">
                  {Array.from({ length: calendarDaysInMonth.firstDay }).map((_, i) => (
                    <div key={`empty-${i}`} className="h-7" />
                  ))}
                  {Array.from({ length: calendarDaysInMonth.daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${calendarDaysInMonth.year}-${String(calendarDaysInMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const isSelected = selectedDate === dateStr;
                    const isToday = new Date().toISOString().split('T')[0] === dateStr;

                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          changeDate(dateStr);
                          setIsCalendarOpen(false);
                        }}
                        className={`h-7 w-7 mx-auto rounded-lg text-xs font-semibold flex items-center justify-center transition cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white font-bold shadow-xs'
                            : isToday
                            ? 'border border-indigo-500/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 font-bold'
                            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>

                {/* Quick Selection Presets */}
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      changeDate(new Date().toISOString().split('T')[0]);
                      setIsCalendarOpen(false);
                    }}
                    className="px-2 py-1 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer font-medium"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const y = new Date();
                      y.setDate(y.getDate() - 1);
                      changeDate(y.toISOString().split('T')[0]);
                      setIsCalendarOpen(false);
                    }}
                    className="px-2 py-1 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer font-medium"
                  >
                    Yesterday
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const w = new Date();
                      w.setDate(w.getDate() - 7);
                      changeDate(w.toISOString().split('T')[0]);
                      setIsCalendarOpen(false);
                    }}
                    className="px-2 py-1 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer font-medium"
                  >
                    7 Days Ago
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sync Ads API Button */}
          {(role === 'admin' || role === 'member') && (
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold shadow-sm shadow-indigo-600/20 transition cursor-pointer disabled:opacity-50 select-none"
            >
              {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
              <span>{isSyncing ? 'Syncing...' : 'Sync Ads API'}</span>
            </button>
          )}

          {/* Ad Credentials Trigger (Admin Only) */}
          {role === 'admin' && (
            <button
              type="button"
              onClick={() => setIsCredsModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-bold shadow-2xs transition cursor-pointer"
              title="Configure API credentials & Pixel IDs"
            >
              <KeyRound className="w-3.5 h-3.5 text-indigo-500" />
              <span>Credentials</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid Container */}
      <div className="flex-1 min-h-0 flex flex-col min-w-0 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl relative overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 bg-white/70 dark:bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-40 transition-opacity">
            <div className="flex items-center gap-3 p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800">
              <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
              <span className="text-xs font-bold">Loading Matrix Data...</span>
            </div>
          </div>
        )}

        {error ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-600 mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Failed to load performance metrics</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm">{error}</p>
            <button
              type="button"
              onClick={refetch}
              className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : sortedRows.length === 0 && !isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 mb-3">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">No campaigns found</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm">
              {showInactive
                ? `No recorded marketing metrics found for ${selectedDate}. Click 'Sync Ads API' to fetch latest data.`
                : `All campaigns on ${selectedDate} might be paused. Try enabling 'Show Paused' toggle above.`}
            </p>
          </div>
        ) : (
          <MarketingMatrixTable
            tableRef={tableRef}
            sortedRows={sortedRows}
            columns={columns}
            columnWidths={columnWidths}
            rowHeights={rowHeights}
            defaultRowHeight={defaultRowHeight}
            zoomLevel={zoomLevel}
            handleColumnResizeStart={handleColumnResizeStart}
            handleRowResizeStart={handleRowResizeStart}
          />
        )}
      </div>

      {/* Ad Account Credentials Modal */}
      <AdAccountCredentialsModal
        isOpen={isCredsModalOpen}
        onClose={() => setIsCredsModalOpen(false)}
        selectedWorkspace={selectedWorkspace}
        workspaces={workspaces}
      />
    </div>
  );
};
