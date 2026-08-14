import React, { useState, useRef, useMemo, useEffect } from 'react';
import type { Workspace } from '../../types';
import { useMarketingMatrix } from '../../hooks/useMarketingMatrix';
import { marketingService } from '../../services/marketingService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { AdAccountCredentialsModal } from '../modals/AdAccountCredentialsModal';
import {
  TrendingUp, Loader2, CalendarDays, RefreshCcw,
  AlertTriangle, ChevronLeft, ChevronRight, KeyRound,
  ZoomIn, ZoomOut, RotateCcw, MoveVertical,
  ChevronDown, Check, Plus
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

const STATUS_COLORS: Record<string, string> = {
  Active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  Paused: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  Stopped: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  Error: 'bg-red-600/20 text-red-700 dark:text-red-300 border-red-500/40',
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

export const PerformanceMarketing: React.FC<Props> = ({
  selectedWorkspace = null,
  workspaces = [],
  onSelectWorkspace,
  onOpenCreateAccount,
}) => {
  const { role } = useAuth();
  const { addToast } = useToast();
  
  const { rows, hiddenCount, showInactive, toggleShowInactive, isLoading, error, selectedDate, changeDate, triggerSyncNow, refetch } = useMarketingMatrix(selectedWorkspace?.id);
  const [isCredsModalOpen, setIsCredsModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('reamarc_perf_zoom');
      if (saved) return Number(saved);
    } catch (e) {}
    return 100;
  });

  useEffect(() => {
    try {
      localStorage.setItem('reamarc_perf_zoom', String(zoomLevel));
    } catch (e) {}
  }, [zoomLevel]);

  // ─── Column & Row Resizing State ──────────────────────────────────────────────
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('reamarc_perf_col_widths');
      if (saved) return { ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(saved) };
    } catch (e) {}
    return DEFAULT_COLUMN_WIDTHS;
  });

  const [defaultRowHeight, setDefaultRowHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('reamarc_perf_def_row_height');
      if (saved) return Number(saved);
    } catch (e) {}
    return DEFAULT_ROW_HEIGHT;
  });

  const [rowHeights, setRowHeights] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('reamarc_perf_row_heights');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  });

  // Draggable Column Width Mouse Handler
  const [resizingCol, setResizingCol] = useState<string | null>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);
  const columnWidthsRef = useRef(columnWidths);
  columnWidthsRef.current = columnWidths;

  const handleColumnResizeStart = (e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingCol(colKey);
    startXRef.current = e.clientX;
    startWidthRef.current = columnWidths[colKey] || 100;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    if (!resizingCol) return;
    let animationFrameId: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        const diff = e.clientX - startXRef.current;
        const newWidth = Math.max(60, Math.min(400, startWidthRef.current + diff));
        setColumnWidths((prev) => ({
          ...prev,
          [resizingCol]: newWidth,
        }));
      });
    };

    const handleMouseUp = () => {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      setResizingCol(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem('reamarc_perf_col_widths', JSON.stringify(columnWidthsRef.current));
      } catch (e) {}
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingCol]);

  // Draggable Row Height Mouse Handler for specific row ID
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
    let animationFrameId: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        const diff = e.clientY - startYRef.current;
        const newHeight = Math.max(36, Math.min(100, startRowHeightRef.current + diff));
        setRowHeights((prev) => ({
          ...prev,
          [resizingRowId]: newHeight,
        }));
      });
    };

    const handleMouseUp = () => {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      setResizingRowId(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem('reamarc_perf_row_heights', JSON.stringify(rowHeightsRef.current));
      } catch (e) {}
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingRowId]);

  const resetLayout = () => {
    setColumnWidths(DEFAULT_COLUMN_WIDTHS);
    setRowHeights({});
    setDefaultRowHeight(DEFAULT_ROW_HEIGHT);
    setZoomLevel(100);
    try {
      localStorage.removeItem('reamarc_perf_col_widths');
      localStorage.removeItem('reamarc_perf_row_heights');
      localStorage.removeItem('reamarc_perf_def_row_height');
      localStorage.removeItem('reamarc_perf_zoom');
    } catch (e) {}
    addToast('Layout Reset', 'Grid column widths, individual row heights, and zoom reset to default.', 'info');
  };

  // ─── Status Counts ────────────────────────────────────────────────────────────
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
      Stopped: 3,
      Draft: 4,
      Archived: 5,
    };
    return [...rows].sort((a, b) => {
      const prioA = statusPriority[a.status] || 99;
      const prioB = statusPriority[b.status] || 99;
      if (prioA !== prioB) return prioA - prioB;
      return a.campaign_name.localeCompare(b.campaign_name);
    });
  }, [rows]);

  const syncPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const shiftDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    changeDate(d.toISOString().split('T')[0]);
  };

  // Current Ad Account Header Label
  const currentAdAccountInfo = useMemo(() => {
    if (!selectedWorkspace || selectedWorkspace.id === 'ALL' || selectedWorkspace.id === 'all') {
      return {
        title: 'All Ad Accounts (Aggregated View)',
        subtitle: 'Viewing performance metrics and campaigns across all connected client ad accounts',
        badge: 'All Ad Accounts',
        color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
      };
    }
    return {
      title: `${selectedWorkspace.name} Ad Account`,
      subtitle: `Viewing active performance metrics & campaign matrix for ${selectedWorkspace.name}`,
      badge: selectedWorkspace.industry || 'Performance Marketing',
      color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    };
  }, [selectedWorkspace]);

  const columns = [
    { key: 'sr', label: 'Sr', minW: 50, align: 'center' as const },
    { key: 'workspace_name', label: 'Client / Account', minW: 140, align: 'left' as const },
    { key: 'industry', label: 'Industry', minW: 110, align: 'left' as const },
    { key: 'objective', label: 'Objective', minW: 130, align: 'left' as const },
    { key: 'platform', label: 'Platform', minW: 95, align: 'center' as const },
    { key: 'campaign_name', label: 'Campaign Name', minW: 220, align: 'left' as const },
    { key: 'budget_set', label: 'Budget Set', minW: 110, type: 'currency' as const, align: 'right' as const },
    { key: 'ad_spend', label: 'Ad Spend', minW: 110, type: 'currency' as const, align: 'right' as const },
    { key: 'cpl_cpa', label: 'CPL / CPA', minW: 100, type: 'currency' as const, align: 'right' as const },
    { key: 'leads_conversions', label: 'Leads', minW: 85, type: 'number' as const, align: 'right' as const },
    { key: 'avg_frequency', label: 'Avg Freq', minW: 85, type: 'number' as const, align: 'right' as const },
    { key: 'impressions', label: 'Impressions', minW: 105, type: 'number' as const, align: 'right' as const },
    { key: 'clicks', label: 'Clicks', minW: 85, type: 'number' as const, align: 'right' as const },
    { key: 'reach', label: 'Reach', minW: 95, type: 'number' as const, align: 'right' as const },
    { key: 'remarks', label: 'Remarks', minW: 180, type: 'text' as const, align: 'left' as const },
    { key: 'status', label: 'Status', minW: 110, type: 'status' as const, align: 'center' as const },
  ];

  const totalW = useMemo(() => {
    return columns.reduce((sum, c) => sum + (columnWidths[c.key] || c.minW), 0);
  }, [columnWidths]);

  const formatCellValue = (value: any, type?: string) => {
    if (value === undefined || value === null || value === '') return '—';
    if (type === 'currency') {
      const num = Number(value);
      return isNaN(num) ? '—' : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (type === 'number') {
      const num = Number(value);
      return isNaN(num) ? '—' : num.toLocaleString('en-US');
    }
    return String(value);
  };

  return (
    <div className="flex flex-col h-full min-w-0 bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 p-6 overflow-hidden transition-colors">
      {/* Dynamic Header with Integrated Ad Account Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3.5">
          {/* Ad Account Selector Dropdown */}
          <div className="relative" ref={accountMenuRef}>
            <button
              type="button"
              onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 shadow-2xs transition-all cursor-pointer select-none"
            >
              <div
                className={`w-6 h-6 rounded-lg text-[10px] font-extrabold flex items-center justify-center text-white ${
                  selectedWorkspace?.brandColor || 'bg-indigo-600'
                }`}
              >
                {selectedWorkspace?.initials || 'ALL'}
              </div>
              <div className="text-left">
                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block leading-tight">
                  {selectedWorkspace ? selectedWorkspace.name : 'All Ad Accounts'}
                </span>
                <span className="text-[10px] text-zinc-400 block leading-tight">
                  {selectedWorkspace ? (selectedWorkspace.platform || 'Client Brand') : 'Consolidated Overview'}
                </span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ml-1 ${isAccountMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {isAccountMenuOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-64 bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl z-50 p-2 space-y-1 animate-scaleIn">
                <div className="px-2 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  Filter by Ad Account
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSelectWorkspace?.(null);
                    setIsAccountMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-colors cursor-pointer ${
                    !selectedWorkspace
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                      ALL
                    </div>
                    <span>All Ad Accounts (Aggregated)</span>
                  </div>
                  {!selectedWorkspace && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                </button>

                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => {
                      onSelectWorkspace?.(ws);
                      setIsAccountMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-colors cursor-pointer ${
                      selectedWorkspace?.id === ws.id
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold'
                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center text-white shrink-0 ${ws.brandColor || 'bg-indigo-600'}`}>
                        {ws.initials}
                      </div>
                      <span className="truncate">{ws.name}</span>
                    </div>
                    {selectedWorkspace?.id === ws.id && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                  </button>
                ))}

                {onOpenCreateAccount && (
                  <>
                    <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-1" />
                    <button
                      type="button"
                      onClick={() => {
                        setIsAccountMenuOpen(false);
                        onOpenCreateAccount();
                      }}
                      className="w-full flex items-center gap-2 p-2 rounded-xl text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 font-bold transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Connect New Ad Account</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              {currentAdAccountInfo.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-bold shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active: {statusCounts.Active}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-[11px] font-bold shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Paused: {statusCounts.Paused}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 text-[11px] font-bold shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                Errors: {statusCounts.Error + statusCounts.Stopped}
              </span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-1">
                • Showing {rows.length} Campaigns {hiddenCount > 0 && !showInactive ? `(${hiddenCount} Hidden)` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Show Paused ($0 Spend) Toggle */}
          <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm cursor-pointer hover:border-orange-500/30 transition-all select-none">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={toggleShowInactive}
              className="w-4 h-4 rounded text-orange-500 focus:ring-orange-500 focus:ring-offset-0 bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 cursor-pointer"
            />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Show Paused ($0 Spend)
            </span>
            {hiddenCount > 0 && !showInactive && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                +{hiddenCount}
              </span>
            )}
          </label>

          {/* Date Picker */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <button onClick={() => shiftDate(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"><ChevronLeft className="w-4 h-4 text-slate-500" /></button>
            <div className="flex items-center gap-1.5 px-2">
              <CalendarDays className="w-3.5 h-3.5 text-orange-500" />
              <input type="date" value={selectedDate} onChange={(e) => changeDate(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-900 dark:text-zinc-100 focus:outline-none cursor-pointer" />
            </div>
            <button onClick={() => shiftDate(1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"><ChevronRight className="w-4 h-4 text-slate-500" /></button>
            <button onClick={() => changeDate(new Date().toISOString().split('T')[0])}
              className="px-2 py-1 rounded-lg text-[10px] font-bold text-orange-600 dark:text-orange-400 hover:bg-orange-500/10 transition-colors cursor-pointer">Today</button>
          </div>

          {/* Row Height Control */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm" title="Global Default Row Height (36px - 100px)">
            <MoveVertical className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
            <button
              onClick={() => {
                const next = Math.max(36, defaultRowHeight - 4);
                setDefaultRowHeight(next);
                try { localStorage.setItem('reamarc_perf_def_row_height', String(next)); } catch (e) {}
              }}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors cursor-pointer text-xs font-bold"
              title="Decrease Default Row Height"
            >
              -
            </button>
            <span className="px-1 text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 min-w-[32px] text-center">
              {defaultRowHeight}px
            </span>
            <button
              onClick={() => {
                const next = Math.min(100, defaultRowHeight + 4);
                setDefaultRowHeight(next);
                try { localStorage.setItem('reamarc_perf_def_row_height', String(next)); } catch (e) {}
              }}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors cursor-pointer text-xs font-bold"
              title="Increase Default Row Height"
            >
              +
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm" title="Grid Zoom Level (80% - 120%)">
            <button
              onClick={() => setZoomLevel((prev) => Math.max(80, prev - 5))}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1 text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 min-w-[36px] text-center">
              {zoomLevel}%
            </span>
            <button
              onClick={() => setZoomLevel((prev) => Math.min(120, prev + 5))}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Reset Layout Button */}
          <button
            onClick={resetLayout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-orange-600 text-xs font-semibold shadow-sm cursor-pointer transition-all"
            title="Reset columns width, row height & zoom to defaults"
          >
            <RotateCcw className="w-3.5 h-3.5 text-orange-500" />
            <span>Reset Layout</span>
          </button>

          {/* Refresh Data Button */}
          <button onClick={refetch} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-orange-600 text-xs font-semibold shadow-sm cursor-pointer transition-all">
            <RefreshCcw className="w-3.5 h-3.5" /> Refresh
          </button>

          {/* Sync Ads API Button (Admin/Member Only) */}
          {(role === 'admin' || role === 'member') && (
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600/10 border border-blue-500/30 text-blue-700 dark:text-blue-300 hover:bg-blue-600/20 text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" /> : <RefreshCcw className="w-3.5 h-3.5 text-blue-500" />}
              <span>{isSyncing ? 'Syncing...' : 'Sync Ads API'}</span>
            </button>
          )}

          {/* Ad Credentials Modal Trigger (Admin Only) */}
          {role === 'admin' && (
            <button
              onClick={() => setIsCredsModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-orange-500 text-xs font-semibold shadow-sm transition-all cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-orange-500" />
              <span>Ad Credentials</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid Container */}
      <div className="flex-1 min-h-0 flex flex-col min-w-0 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl relative overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm z-40 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Loading Performance Data...</p>
          </div>
        )}

        {error && (
          <div className="p-4 m-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
            <p className="text-xs text-rose-700 dark:text-rose-300 font-semibold">{error}</p>
          </div>
        )}

        {!isLoading && rows.length === 0 && !error ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-rose-500/20 border border-orange-500/30 text-orange-600 dark:text-orange-400 flex items-center justify-center shadow-lg">
              <TrendingUp className="w-8 h-8" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">No Campaigns Tracked</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">No active marketing campaigns found for this date. Connect an Ad Account or sync data to start tracking daily performance.</p>
            </div>
          </div>
        ) : rows.length > 0 && (
          <div className="matrix-grid-scroll flex-1 min-h-0 overflow-x-auto overflow-y-auto w-full relative">
            <div
              style={{
                zoom: `${zoomLevel}%`,
                width: `${totalW}px`,
                minWidth: `${totalW}px`,
              }}
            >
              <table className="border-separate border-spacing-0 table-fixed text-left text-xs" style={{ width: `${totalW}px`, minWidth: `${totalW}px` }}>
                <colgroup>
                  {columns.map((c) => (
                    <col key={c.key} style={{ width: `${columnWidths[c.key] || c.minW}px` }} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-30 shadow-xs">
                  <tr className="bg-slate-100 dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800">
                    {columns.map((c) => {
                      const alignClass = c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left';
                      const justifyClass = c.align === 'right' ? 'justify-end' : c.align === 'center' ? 'justify-center' : 'justify-start';
                      return (
                        <th
                          key={c.key}
                          style={{ width: `${columnWidths[c.key] || c.minW}px` }}
                          className={`sticky top-0 z-30 relative px-2.5 py-3 text-[11px] uppercase font-extrabold tracking-wider text-slate-700 dark:text-slate-200 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 whitespace-nowrap select-none group ${alignClass}`}
                        >
                          <div className={`flex items-center gap-1 ${justifyClass}`}>
                            <span className="truncate">{c.label}</span>
                          </div>
                          {/* Draggable Column Resizer Handle */}
                          <div
                            onMouseDown={(e) => handleColumnResizeStart(e, c.key)}
                            className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-orange-500/60 active:bg-orange-600 transition-colors z-30 flex items-center justify-center"
                            title="Drag to resize column"
                          />
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, idx) => {
                    const isWarning = row.status === 'Stopped' || row.status === 'Error';
                    const rHeight = rowHeights[row.campaign_id] || defaultRowHeight;
                    const spendVal = Number(row.ad_spend) || 0;
                    const leadsVal = Number(row.leads_conversions) || 0;

                    return (
                      <tr
                        key={row.campaign_id}
                        style={{ height: `${rHeight}px` }}
                        className={`relative border-b border-slate-200/80 dark:border-slate-800/80 transition-colors group ${
                          isWarning ? 'bg-rose-500/5 dark:bg-rose-900/10' : 'hover:bg-orange-500/5 dark:hover:bg-orange-500/5'
                        }`}
                      >
                        {/* Sr */}
                        <td className="px-2 text-center text-xs font-semibold tabular-nums text-slate-400 dark:text-slate-500 border-r border-slate-200/80 dark:border-slate-800/60 select-none">
                          {idx + 1}
                        </td>
                        {/* Client / Account */}
                        <td className="px-2.5 text-left text-xs font-bold text-slate-900 dark:text-slate-100 truncate border-r border-slate-200/80 dark:border-slate-800/60">
                          {row.workspace_name || '—'}
                        </td>
                        {/* Industry */}
                        <td className="px-2 text-left text-xs text-slate-600 dark:text-slate-400 truncate border-r border-slate-200/80 dark:border-slate-800/60">
                          {row.industry || '—'}
                        </td>
                        {/* Objective */}
                        <td className="px-2 text-left text-xs font-medium text-slate-700 dark:text-slate-300 truncate border-r border-slate-200/80 dark:border-slate-800/60">
                          {row.objective}
                        </td>
                        {/* Platform Badge */}
                        <td className="px-2 text-center border-r border-slate-200/80 dark:border-slate-800/60">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${PLATFORM_COLORS[row.platform] || PLATFORM_COLORS.Other}`}>
                            {row.platform}
                          </span>
                        </td>
                        {/* Campaign Name */}
                        <td className="px-2 text-left text-xs font-bold text-slate-900 dark:text-white truncate border-r border-slate-200/80 dark:border-slate-800/60" title={row.campaign_name}>
                          {row.campaign_name}
                        </td>
                        {/* Budget Set */}
                        <td className="px-2.5 text-right text-xs tabular-nums font-semibold text-slate-700 dark:text-slate-200 truncate border-r border-slate-200/80 dark:border-slate-800/60">
                          {formatCellValue(row.budget_set, 'currency')}
                        </td>
                        {/* Ad Spend */}
                        <td className={`px-2.5 text-right text-xs tabular-nums truncate border-r border-slate-200/80 dark:border-slate-800/60 ${spendVal > 0 ? 'font-extrabold text-slate-900 dark:text-white' : 'font-semibold text-slate-400 dark:text-slate-500'}`}>
                          {formatCellValue(row.ad_spend, 'currency')}
                        </td>
                        {/* CPL / CPA */}
                        <td className="px-2.5 text-right text-xs tabular-nums font-semibold text-slate-700 dark:text-slate-300 truncate border-r border-slate-200/80 dark:border-slate-800/60">
                          {formatCellValue(row.cpl_cpa, 'currency')}
                        </td>
                        {/* Leads */}
                        <td className={`px-2.5 text-right text-xs tabular-nums truncate border-r border-slate-200/80 dark:border-slate-800/60 ${leadsVal > 0 ? 'font-extrabold text-emerald-600 dark:text-emerald-400' : 'font-semibold text-slate-400 dark:text-slate-500'}`}>
                          {formatCellValue(row.leads_conversions, 'number')}
                        </td>
                        {/* Avg Freq */}
                        <td className="px-2.5 text-right text-xs tabular-nums font-semibold text-slate-600 dark:text-slate-300 truncate border-r border-slate-200/80 dark:border-slate-800/60">
                          {formatCellValue(row.avg_frequency, 'number')}
                        </td>
                        {/* Impressions */}
                        <td className="px-2.5 text-right text-xs tabular-nums font-semibold text-slate-700 dark:text-slate-200 truncate border-r border-slate-200/80 dark:border-slate-800/60">
                          {formatCellValue(row.impressions, 'number')}
                        </td>
                        {/* Clicks */}
                        <td className="px-2.5 text-right text-xs tabular-nums font-semibold text-slate-700 dark:text-slate-200 truncate border-r border-slate-200/80 dark:border-slate-800/60">
                          {formatCellValue(row.clicks, 'number')}
                        </td>
                        {/* Reach */}
                        <td className="px-2.5 text-right text-xs tabular-nums font-semibold text-slate-700 dark:text-slate-200 truncate border-r border-slate-200/80 dark:border-slate-800/60">
                          {formatCellValue(row.reach, 'number')}
                        </td>
                        {/* Remarks */}
                        <td className="px-2 text-left text-xs text-slate-500 dark:text-slate-400 truncate border-r border-slate-200/80 dark:border-slate-800/60" title={row.remarks}>
                          {row.remarks || '—'}
                        </td>
                        {/* Status Badge */}
                        <td className="px-2 text-center border-r border-slate-200/80 dark:border-slate-800/60">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${STATUS_COLORS[row.status] || STATUS_COLORS.Active}`}>
                            {row.status}
                          </span>
                        </td>

                        {/* Draggable Row Height Resizer Handle for Specific Row */}
                        <td className="p-0 border-0 pointer-events-none">
                          <div
                            onMouseDown={(e) => handleRowResizeStart(e, row.campaign_id, rHeight)}
                            className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-orange-500/60 active:bg-orange-600 transition-colors z-20 pointer-events-auto"
                            title="Drag to resize this specific row height"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <AdAccountCredentialsModal isOpen={isCredsModalOpen} onClose={() => setIsCredsModalOpen(false)}
        selectedWorkspace={selectedWorkspace} workspaces={workspaces} />
    </div>
  );
};
