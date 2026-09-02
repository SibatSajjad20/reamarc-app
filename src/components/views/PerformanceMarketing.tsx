import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  TrendingUp,
  Loader2,
  RefreshCcw,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  MoveVertical,
  ChevronDown,
  Check,
  Search,
  X,
  Calendar as CalendarIcon,
} from 'lucide-react';
import type { Workspace } from '../../types';
import type { AdAccount } from '../../types/admin';
import { useMarketingMatrix } from '../../hooks/useMarketingMatrix';
import { marketingService } from '../../services/marketingService';
import { useAuth } from '../../context/AuthContext';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { useToast } from '../../context/ToastContext';
import { AdAccountCredentialsModal } from '../modals/AdAccountCredentialsModal';
import { LoadingScreen } from '../ui/LoadingScreen';

interface Props {
  selectedWorkspace?: (Workspace | AdAccount) | null;
  workspaces?: (Workspace | AdAccount)[];
  adAccounts?: AdAccount[];
  onSelectWorkspace?: (ws: (Workspace | AdAccount) | null) => void;
  onOpenCreateAccount?: () => void;
}

interface MarketingColumnDef {
  key: string;
  label: string;
  width: number;
  align?: 'left' | 'center' | 'right';
}

const DEFAULT_COLUMNS: MarketingColumnDef[] = [
  { key: 'workspace_name', label: 'Client / Account', width: 140, align: 'left' },
  { key: 'industry', label: 'Industry', width: 110, align: 'left' },
  { key: 'objective', label: 'Objective', width: 130, align: 'left' },
  { key: 'platform', label: 'Platform', width: 80, align: 'center' },
  { key: 'campaign_name', label: 'Campaign Name', width: 240, align: 'left' },
  { key: 'budget_set', label: 'Budget Set', width: 95, align: 'right' },
  { key: 'ad_spend', label: 'Ad Spend', width: 95, align: 'right' },
  { key: 'cpl_cpa', label: 'CPL / CPA', width: 90, align: 'right' },
  { key: 'leads_conversions', label: 'Leads / Conv.', width: 85, align: 'right' },
  { key: 'avg_frequency', label: 'Avg Freq', width: 75, align: 'right' },
  { key: 'impressions', label: 'Impressions', width: 95, align: 'right' },
  { key: 'clicks', label: 'Clicks', width: 75, align: 'right' },
  { key: 'reach', label: 'Reach', width: 85, align: 'right' },
  { key: 'remarks', label: 'Remarks', width: 160, align: 'left' },
  { key: 'status', label: 'Status', width: 95, align: 'center' },
];

const PLATFORM_COLORS: Record<string, string> = {
  Meta: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  Google: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  TikTok: 'bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30',
  WhatsApp: 'bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30',
  Other: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
};

const DEFAULT_ROW_HEIGHT = 32;
const DEFAULT_ZOOM = 80;
const MIN_ZOOM = 50;
const MAX_ZOOM = 130;

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

export const PerformanceMarketing: React.FC<Props> = ({
  selectedWorkspace = null,
  workspaces = [],
  adAccounts = [],
  onSelectWorkspace,
}) => {
  const { role } = useAuth();
  const { addToast } = useToast();

  // Use adAccounts if provided, otherwise fallback to workspaces
  const accountsList = useMemo(() => {
    if (adAccounts && adAccounts.length > 0) return adAccounts;
    return workspaces;
  }, [adAccounts, workspaces]);

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
  useModuleLoadGate(isLoading);

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
    const sorted = [...accountsList].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
    if (!dropdownSearch.trim()) return sorted;
    const q = dropdownSearch.toLowerCase();
    return sorted.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        ((w as any).platform && (w as any).platform.toLowerCase().includes(q)) ||
        ((w as any).industry && (w as any).industry.toLowerCase().includes(q))
    );
  }, [accountsList, dropdownSearch]);

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

  // ── Zoom & Matrix Layout State — exact DailyLog pattern ──────────────────
  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('reamarc_perf_zoom');
      if (saved) return Number(saved);
    } catch (e) {}
    return DEFAULT_ZOOM;
  });

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('reamarc_perf_col_widths');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    const initial: Record<string, number> = {};
    DEFAULT_COLUMNS.forEach((col) => {
      initial[col.key] = col.width;
    });
    return initial;
  });

  const [rowHeights, setRowHeights] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('reamarc_perf_row_heights');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  });

  const [defaultRowHeight, setDefaultRowHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('reamarc_perf_def_row_height');
      if (saved) return Number(saved);
    } catch (e) {}
    return DEFAULT_ROW_HEIGHT;
  });

  // ── Column & Row Resizing Handlers — exact DailyLog pattern ──────────────
  const handleColumnResizeStart = (e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnWidths[colKey] || 100;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = (moveEvent.clientX - startX) * (100 / zoomLevel);
      const newWidth = Math.max(35, Math.min(800, startWidth + delta));
      setColumnWidths((prev) => {
        const next = { ...prev, [colKey]: Math.round(newWidth) };
        try {
          localStorage.setItem('reamarc_perf_col_widths', JSON.stringify(next));
        } catch (err) {}
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
      const newHeight = Math.max(24, Math.min(180, currentH + delta));
      setRowHeights((prev) => {
        const next = { ...prev, [rowId]: Math.round(newHeight) };
        try {
          localStorage.setItem('reamarc_perf_row_heights', JSON.stringify(next));
        } catch (err) {}
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

  // Reset Layout — exact DailyLog pattern
  const handleResetLayout = () => {
    const initial: Record<string, number> = {};
    DEFAULT_COLUMNS.forEach((col) => {
      initial[col.key] = col.width;
    });
    setColumnWidths(initial);
    setRowHeights({});
    setDefaultRowHeight(DEFAULT_ROW_HEIGHT);
    setZoomLevel(DEFAULT_ZOOM);
    try {
      localStorage.removeItem('reamarc_perf_col_widths');
      localStorage.removeItem('reamarc_perf_row_heights');
      localStorage.removeItem('reamarc_perf_def_row_height');
      localStorage.setItem('reamarc_perf_zoom', String(DEFAULT_ZOOM));
    } catch (e) {}
    addToast('Layout Reset', 'Grid column widths, row heights (32px), and zoom (80%) reset to default.', 'info');
  };

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

  // ── Progressive Batch Loading (Default 50, +50 Load More, Show All) ───────
  const [visibleLimit, setVisibleLimit] = useState<number>(50);

  useEffect(() => {
    setVisibleLimit(50);
  }, [selectedWorkspace?.id, selectedDate]);

  const visibleRows = useMemo(() => {
    return sortedRows.slice(0, visibleLimit);
  }, [sortedRows, visibleLimit]);

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

  // Compute Total Table Width for reliable horizontal scrolling — exact DailyLog pattern
  const totalTableWidth = useMemo(() => {
    return 44 + DEFAULT_COLUMNS.reduce((sum, col) => sum + (columnWidths[col.key] || col.width), 0);
  }, [columnWidths]);

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
    <div className="flex flex-col h-full bg-slate-100 dark:bg-[#09090b] text-slate-900 dark:text-zinc-100 font-sans select-none overflow-hidden performance-marketing-view">
      {/* Top Toolbar Bar — matching DailyLogView styling & layout */}
      <div className="px-6 py-3.5 bg-white dark:bg-[#0f1117] border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3.5 shadow-xs shrink-0">
        {/* Left: Ad Account Switcher & Live KPI Counters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Ad Account Dropdown Trigger */}
          <div className="relative" ref={accountMenuRef}>
            <button
              type="button"
              onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
              className="flex items-center gap-2.5 bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 rounded-xl px-3 py-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-all shadow-2xs cursor-pointer select-none"
            >
              <div
                className={`w-6 h-6 rounded-lg text-white font-extrabold text-[10px] flex items-center justify-center shadow-2xs shrink-0 ${
                  (selectedWorkspace as any)?.brandColor || 'bg-indigo-600'
                }`}
              >
                {(selectedWorkspace as any)?.initials || (selectedWorkspace ? selectedWorkspace.name.slice(0, 2).toUpperCase() : 'ALL')}
              </div>
              <div className="text-left min-w-[100px]">
                <div className="flex items-center gap-1.5 leading-tight">
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[150px]">
                    {selectedWorkspace ? selectedWorkspace.name : 'All Ad Accounts'}
                  </span>
                  {selectedWorkspace &&
                    (() => {
                      const nameLower = selectedWorkspace.name.toLowerCase();
                      const pLower = ((selectedWorkspace as any).platform || '').toLowerCase();
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
                <span className="text-[10px] text-zinc-400 font-medium block leading-tight">
                  {selectedWorkspace ? (selectedWorkspace as any).industry || 'Ad Account' : 'Consolidated Agency Matrix'}
                </span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 transition-transform duration-150 ${
                  isAccountMenuOpen ? 'rotate-180 text-indigo-500' : ''
                }`}
              />
            </button>

            {/* Dropdown Menu Popover with Search & Scrollbar */}
            {isAccountMenuOpen && (
              <div className="absolute left-0 top-full mt-1.5 z-50 w-80 max-w-[90vw] bg-white dark:bg-[#151722] border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-2 space-y-2 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100">
                {/* Search Input Box */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search 28+ ad accounts..."
                    value={dropdownSearch}
                    onChange={(e) => setDropdownSearch(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-indigo-500"
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
                <div className="max-h-[300px] overflow-y-auto space-y-0.5 pr-1 custom-scrollbar">
                  {/* All Accounts Option */}
                  {!dropdownSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectWorkspace?.(null);
                        setIsAccountMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition-colors cursor-pointer ${
                        !selectedWorkspace
                          ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center">
                          ALL
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-xs">All Ad Accounts (Aggregated)</p>
                          <p className="text-[10px] text-zinc-400">Total blended portfolio metrics</p>
                        </div>
                      </div>
                      {!selectedWorkspace && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                    </button>
                  )}

                  {filteredDropdownAccounts.length === 0 ? (
                    <div className="p-4 text-center text-xs text-zinc-400">
                      No ad accounts found for "{dropdownSearch}".
                    </div>
                  ) : (
                    filteredDropdownAccounts.map((ws) => {
                      const isSelected = selectedWorkspace?.id === ws.id;
                      const nameLower = ws.name.toLowerCase();
                      const pLower = ((ws as any).platform || '').toLowerCase();
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
                          className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold'
                              : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 text-left">
                            <div
                              className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center text-white shrink-0 ${
                                (ws as any).brandColor || (isGoogle ? 'bg-emerald-600' : 'bg-indigo-600')
                              }`}
                            >
                              {(ws as any).initials || ws.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-xs truncate">{ws.name}</p>
                              <div className="flex items-center gap-1 mt-0.5">
                                {isMulti ? (
                                  <div className="flex items-center gap-1">
                                    <span className="px-1 py-0.2 rounded text-[8px] font-extrabold bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                      Meta
                                    </span>
                                    <span className="px-1 py-0.2 rounded text-[8px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                      Google
                                    </span>
                                  </div>
                                ) : isGoogle ? (
                                  <span className="px-1 py-0.2 rounded text-[8px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                    Google Ads
                                  </span>
                                ) : (
                                  <span className="px-1 py-0.2 rounded text-[8px] font-extrabold bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                    Meta Ads
                                  </span>
                                )}
                                <span className="text-[10px] text-zinc-400 truncate">• {(ws as any).industry || 'Ad Account'}</span>
                              </div>
                            </div>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0 ml-1.5" />}
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

        {/* Right Controls — Zoom, Row, Reset, Calendar, Sync, Credentials */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Show Paused Toggle */}
          <button
            type="button"
            onClick={toggleShowInactive}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-colors cursor-pointer select-none shadow-2xs ${
              showInactive
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
                : 'bg-zinc-50 dark:bg-zinc-900/90 border-zinc-200 dark:border-zinc-700/80 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600'
            }`}
          >
            <span
              className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                showInactive ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-700'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transform transition-transform ${
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

          {/* Row Height Controls */}
          <div
            className="flex items-center bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700/80 rounded-xl p-1 shadow-2xs"
            title="Row Height"
          >
            <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 pl-1.5 pr-0.5 flex items-center gap-1">
              <MoveVertical className="w-3.5 h-3.5 text-indigo-500" />
              <span className="hidden xl:inline">Row:</span>
            </span>
            <button
              type="button"
              onClick={() => {
                const next = Math.max(24, defaultRowHeight - 4);
                setDefaultRowHeight(next);
                try {
                  localStorage.setItem('reamarc_perf_def_row_height', String(next));
                } catch (e) {}
              }}
              className="w-6 h-6 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              title="Decrease row height"
            >
              -
            </button>
            <span className="text-xs font-numeric font-bold px-1 min-w-[34px] text-center text-zinc-900 dark:text-zinc-100">
              {defaultRowHeight}px
            </span>
            <button
              type="button"
              onClick={() => {
                const next = Math.min(100, defaultRowHeight + 4);
                setDefaultRowHeight(next);
                try {
                  localStorage.setItem('reamarc_perf_def_row_height', String(next));
                } catch (e) {}
              }}
              className="w-6 h-6 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              title="Increase row height"
            >
              +
            </button>
          </div>

          {/* Zoom Level Controls — exact match with DailyLogView */}
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
                  localStorage.setItem('reamarc_perf_zoom', String(next));
                } catch (e) {}
              }}
              disabled={zoomLevel <= MIN_ZOOM}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 disabled:opacity-40 transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2.5 text-xs font-numeric font-bold text-zinc-700 dark:text-zinc-300 min-w-[48px] text-center select-none">
              {zoomLevel}%
            </span>
            <button
              type="button"
              onClick={() => {
                const next = Math.min(MAX_ZOOM, zoomLevel + 5);
                setZoomLevel(next);
                try {
                  localStorage.setItem('reamarc_perf_zoom', String(next));
                } catch (e) {}
              }}
              disabled={zoomLevel >= MAX_ZOOM}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 disabled:opacity-40 transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Reset Layout Button — exact match with DailyLogView */}
          <button
            type="button"
            onClick={handleResetLayout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-400 text-xs font-semibold transition-all shadow-2xs cursor-pointer select-none"
            title="Reset column widths, row heights (32px), and zoom (80%)"
          >
            <RotateCcw className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden sm:inline">Reset Layout</span>
          </button>

          {/* Custom Calendar Date Navigator */}
          <div
            className="relative flex items-center gap-1 bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700/80 rounded-xl p-1 shadow-2xs"
            ref={calendarDropdownRef}
          >
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 transition-colors cursor-pointer"
              title="Previous Day"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setIsCalendarOpen(!isCalendarOpen)}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Open Calendar Picker"
            >
              <CalendarIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{formattedDateLabel}</span>
              <ChevronDown
                className={`w-3 h-3 text-zinc-400 transition-transform duration-150 ${
                  isCalendarOpen ? 'rotate-180 text-indigo-500' : ''
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => shiftDate(1)}
              className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 transition-colors cursor-pointer"
              title="Next Day"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => changeDate(new Date().toISOString().split('T')[0])}
              className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer"
            >
              Today
            </button>

            {/* Custom Interactive Calendar Popover */}
            {isCalendarOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-50 w-72 bg-white dark:bg-[#151722] border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-3 space-y-3 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none">
                {/* Month and Year Header */}
                <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => {
                      const prev = new Date(calendarViewDate);
                      prev.setMonth(prev.getMonth() - 1);
                      setCalendarViewDate(prev);
                    }}
                    className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
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
                    className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
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
                        className={`h-7 w-7 mx-auto rounded-lg text-xs font-semibold flex items-center justify-center transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white font-bold shadow-2xs'
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
                    className="px-2 py-1 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer font-medium"
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
                    className="px-2 py-1 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer font-medium"
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
                    className="px-2 py-1 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer font-medium"
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
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 disabled:text-zinc-400 dark:disabled:text-zinc-500 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer disabled:cursor-not-allowed select-none"
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
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-400 text-xs font-semibold transition-all shadow-2xs cursor-pointer select-none"
              title="Configure API credentials & Pixel IDs"
            >
              <KeyRound className="w-3.5 h-3.5 text-indigo-500" />
              <span>Credentials</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid Canvas Wrapper with Scaled Zoom & Progressive Batch Rendering */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto bg-white dark:bg-[#0b0b0e] relative w-full flex flex-col">
        <div
          style={{
            zoom: `${zoomLevel}%`,
            width: `${totalTableWidth}px`,
            minWidth: `${totalTableWidth}px`,
          }}
          className="min-w-full flex flex-col flex-1"
        >
          {isLoading ? (
            <LoadingScreen message="Loading marketing matrix data..." size={72} />
          ) : error ? (
            <div className="h-64 flex flex-col items-center justify-center p-8 text-center">
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
          ) : sortedRows.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center p-8 text-center">
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
            <>
              <table
                className="border-separate border-spacing-0 text-xs text-left table-fixed w-full"
                style={{ width: `${totalTableWidth}px`, minWidth: `${totalTableWidth}px` }}
              >
                <thead className="sticky top-0 z-30 shadow-2xs">
                  <tr className="bg-zinc-100 dark:bg-[#12141c] text-zinc-800 dark:text-zinc-200 font-semibold text-xs border-b border-zinc-200 dark:border-zinc-800">
                    <th
                      style={{ width: '44px', minWidth: '44px', maxWidth: '44px' }}
                      className="p-2.5 text-center font-numeric text-xs font-bold text-zinc-500 dark:text-zinc-400 border-b border-r border-zinc-200 dark:border-zinc-800 sticky top-0 z-20 select-none bg-zinc-100 dark:bg-[#12141c]"
                    >
                      #
                    </th>
                    {DEFAULT_COLUMNS.map((col) => {
                      const colW = columnWidths[col.key] || col.width;
                      const alignClass =
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
                      const justifyClass =
                        col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start';

                      return (
                        <th
                          key={col.key}
                          style={{ width: `${colW}px`, minWidth: `${colW}px` }}
                          className={`sticky top-0 z-20 p-2.5 font-semibold tracking-tight border-b border-r border-zinc-200 dark:border-zinc-800 bg-zinc-100/95 dark:bg-[#12141c]/95 backdrop-blur-md text-zinc-800 dark:text-zinc-200 relative group overflow-visible select-none hover:bg-zinc-200/50 dark:hover:bg-zinc-800/40 transition-colors ${alignClass}`}
                        >
                          <div className={`flex items-center gap-1 ${justifyClass}`}>
                            <span className="truncate text-xs font-bold text-zinc-900 dark:text-zinc-100" title={col.label}>
                              {col.label}
                            </span>
                          </div>

                          {/* Column Resize Handle — exact match with DailyLogView */}
                          <div
                            onMouseDown={(e) => handleColumnResizeStart(e, col.key)}
                            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/80 z-20"
                            title="Drag to resize column"
                          />
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                  {visibleRows.map((row, idx) => {
                    const isWarning = row.status === 'Stopped' || row.status === 'Error';
                    const rHeight = rowHeights[row.campaign_id] || defaultRowHeight;
                    const spendVal = Number(row.ad_spend) || 0;
                    const leadsVal = Number(row.leads_conversions) || 0;
                    const rowNumber = idx + 1;

                    return (
                      <tr
                        key={row.campaign_id}
                        style={{ height: `${rHeight}px` }}
                        className={`hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50 transition-colors group relative cursor-pointer ${
                          isWarning ? 'bg-rose-500/5 dark:bg-rose-900/10' : ''
                        }`}
                      >
                        {/* Serial Number */}
                        <td
                          style={{ width: '44px', minWidth: '44px', maxWidth: '44px', height: `${rHeight}px` }}
                          className="p-2 text-center font-numeric text-xs font-bold text-zinc-500 dark:text-zinc-400 border-b border-r border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-950/40 select-none group-hover:bg-zinc-100 dark:group-hover:bg-zinc-900 overflow-hidden py-0 align-middle relative"
                        >
                          <span>{rowNumber}</span>
                          {/* Row Height Resize Handle */}
                          <div
                            onMouseDown={(e) => handleRowResizeStart(e, row.campaign_id, rHeight)}
                            className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-indigo-500/80 z-20"
                            title="Drag to adjust row height"
                          />
                        </td>

                        {/* Columns */}
                        {DEFAULT_COLUMNS.map((col) => {
                          const colW = columnWidths[col.key] || col.width;
                          const alignClass =
                            col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';

                          return (
                            <td
                              key={col.key}
                              style={{ width: `${colW}px`, minWidth: `${colW}px`, height: `${rHeight}px` }}
                              className={`p-2.5 border-b border-r border-zinc-200 dark:border-zinc-800/80 align-middle text-xs select-text overflow-hidden ${alignClass}`}
                            >
                              {col.key === 'workspace_name' ? (
                                <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate block">
                                  {row.workspace_name || '—'}
                                </span>
                              ) : col.key === 'industry' ? (
                                <span className="text-zinc-600 dark:text-zinc-400 truncate block">
                                  {row.industry || '—'}
                                </span>
                              ) : col.key === 'objective' ? (
                                <span className="font-medium text-zinc-700 dark:text-zinc-300 truncate block">
                                  {row.objective || '—'}
                                </span>
                              ) : col.key === 'platform' ? (
                                <span
                                  className={`inline-block px-2 py-0.2 rounded-md text-[10px] font-bold border ${
                                    PLATFORM_COLORS[row.platform] || PLATFORM_COLORS.Other
                                  }`}
                                >
                                  {row.platform}
                                </span>
                              ) : col.key === 'campaign_name' ? (
                                <span
                                  className="font-bold text-zinc-900 dark:text-zinc-100 truncate block"
                                  title={row.campaign_name}
                                >
                                  {row.campaign_name}
                                </span>
                              ) : col.key === 'budget_set' ? (
                                <span className="font-numeric text-zinc-600 dark:text-zinc-300">
                                  {formatCellValue(row.budget_set, 'currency')}
                                </span>
                              ) : col.key === 'ad_spend' ? (
                                spendVal > 0 ? (
                                  <span className="font-numeric font-extrabold text-indigo-600 dark:text-indigo-400">
                                    {formatCellValue(row.ad_spend, 'currency')}
                                  </span>
                                ) : (
                                  <span className="font-numeric text-zinc-400 dark:text-zinc-600">0.00</span>
                                )
                              ) : col.key === 'cpl_cpa' ? (
                                <span className="font-numeric text-zinc-700 dark:text-zinc-300">
                                  {formatCellValue(row.cpl_cpa, 'currency')}
                                </span>
                              ) : col.key === 'leads_conversions' ? (
                                leadsVal > 0 ? (
                                  <span className="font-numeric font-extrabold text-emerald-600 dark:text-emerald-400">
                                    {formatCellValue(row.leads_conversions, 'number')}
                                  </span>
                                ) : (
                                  <span className="font-numeric text-zinc-400 dark:text-zinc-600">0</span>
                                )
                              ) : col.key === 'avg_frequency' ? (
                                <span className="font-numeric text-zinc-600 dark:text-zinc-400">
                                  {formatCellValue(row.avg_frequency, 'number')}
                                </span>
                              ) : col.key === 'impressions' ? (
                                <span className="font-numeric text-zinc-600 dark:text-zinc-400">
                                  {formatCellValue(row.impressions, 'number')}
                                </span>
                              ) : col.key === 'clicks' ? (
                                <span className="font-numeric text-zinc-600 dark:text-zinc-400">
                                  {formatCellValue(row.clicks, 'number')}
                                </span>
                              ) : col.key === 'reach' ? (
                                <span className="font-numeric text-zinc-600 dark:text-zinc-400">
                                  {formatCellValue(row.reach, 'number')}
                                </span>
                              ) : col.key === 'remarks' ? (
                                <span className="text-zinc-600 dark:text-zinc-400 truncate block" title={row.remarks || ''}>
                                  {row.remarks || '—'}
                                </span>
                              ) : col.key === 'status' ? (
                                <div className="flex items-center justify-center">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] font-extrabold border ${
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
                                </div>
                              ) : (
                                <span>{formatCellValue((row as any)[col.key])}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Table Footer with Progressive Batch Loading Controls */}
              <div
                style={{ width: `${totalTableWidth}px`, minWidth: `${totalTableWidth}px` }}
                className="px-5 py-3.5 bg-zinc-50 dark:bg-[#12141c] border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-4 text-xs select-none sticky bottom-0 z-20 shadow-xs"
              >
                <div className="flex items-center gap-3 text-zinc-500 dark:text-zinc-400 font-medium">
                  <span>
                    Showing <strong className="text-zinc-900 dark:text-zinc-100 font-bold">{visibleRows.length}</strong> of{' '}
                    <strong className="text-zinc-900 dark:text-zinc-100 font-bold">{sortedRows.length}</strong> campaigns
                  </span>
                  {hiddenCount > 0 && !showInactive && (
                    <span className="text-zinc-400 dark:text-zinc-500 text-[11px]">
                      ({hiddenCount} paused hidden)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {visibleLimit < sortedRows.length ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setVisibleLimit((prev) => Math.min(sortedRows.length, prev + 50))}
                        className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs transition-all shadow-2xs hover:shadow-xs cursor-pointer flex items-center gap-1.5 select-none"
                      >
                        <span>+ Load 50 More</span>
                        <span className="text-[10px] opacity-80 font-numeric">({sortedRows.length - visibleLimit} left)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisibleLimit(sortedRows.length)}
                        className="px-3 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 active:bg-zinc-400 dark:active:bg-zinc-600 text-zinc-800 dark:text-zinc-200 font-bold text-xs transition cursor-pointer select-none"
                      >
                        Show All ({sortedRows.length})
                      </button>
                    </>
                  ) : sortedRows.length > 50 ? (
                    <div className="flex items-center gap-2.5">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>All {sortedRows.length} campaigns loaded</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setVisibleLimit(50)}
                        className="px-2.5 py-1 rounded-lg text-[11px] bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium transition cursor-pointer select-none"
                      >
                        Collapse to Top 50
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Ad Account Credentials Modal */}
      <AdAccountCredentialsModal
        isOpen={isCredsModalOpen}
        onClose={() => setIsCredsModalOpen(false)}
        selectedWorkspace={selectedWorkspace}
        workspaces={accountsList as any}
      />
    </div>
  );
};

