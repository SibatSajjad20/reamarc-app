import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  useVirtualizer,
  observeElementOffset,
  observeElementRect,
  elementScroll,
} from '@tanstack/react-virtual';
import {
  RefreshCw,
  Download,
  SlidersHorizontal,
  MoveVertical,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Search,
  X,
  ChevronDown,
  Check,
} from 'lucide-react';
import type { Workspace } from '../../types';
import type { AdAccount } from '../../types/admin';
import { useMarketingMatrix } from '../../hooks/useMarketingMatrix';
import { marketingService } from '../../services/marketingService';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { useToast } from '../../context/ToastContext';
import { PageHeader } from '../ui/PageHeader';
import { KpiCard } from '../ui/KpiCard';
import { StatusPill } from '../ui/StatusPill';
import { Button } from '../ui/button';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { CustomSelect } from '../ui/CustomSelect';
import { Switch } from '../ui/switch';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorState';
import { MetaIcon, GoogleAdsIcon, TikTokIcon, WhatsAppIcon } from '../ui/brand-icons';

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
  { key: 'workspace_name', label: 'Client / account', width: 160, align: 'left' },
  { key: 'industry', label: 'Industry', width: 110, align: 'left' },
  { key: 'platform', label: 'Platform', width: 85, align: 'center' },
  { key: 'campaign_name', label: 'Campaign name', width: 220, align: 'left' },
  { key: 'objective', label: 'Objective', width: 120, align: 'left' },
  { key: 'status', label: 'Status', width: 95, align: 'center' },
  { key: 'budget_set', label: 'Budget set', width: 100, align: 'right' },
  { key: 'ad_spend', label: 'Ad spend', width: 105, align: 'right' },
  { key: 'reach', label: 'Reach', width: 90, align: 'right' },
  { key: 'impressions', label: 'Impressions', width: 105, align: 'right' },
  { key: 'clicks', label: 'Clicks', width: 85, align: 'right' },
  { key: 'avg_frequency', label: 'Avg freq', width: 80, align: 'right' },
  { key: 'leads_conversions', label: 'Leads / conv.', width: 95, align: 'right' },
  { key: 'cpl_cpa', label: 'CPL / CPA', width: 95, align: 'right' },
  { key: 'remarks', label: 'Remarks', width: 150, align: 'left' },
];

const DEFAULT_ROW_HEIGHT = 40;
const DEFAULT_ZOOM = 100;
const MIN_ZOOM = 60;
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
  const { addToast } = useToast();

  const accountsList = useMemo(() => {
    if (adAccounts && adAccounts.length > 0) return adAccounts;
    return workspaces;
  }, [adAccounts, workspaces]);

  const {
    rows,
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
  const [isSyncing, setIsSyncing] = useState(false);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [selectedObjective, setSelectedObjective] = useState<string>('all');

  // Ad Account Dropdown State
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const accountMenuRef = useRef<HTMLDivElement>(null);

  // View Options Popover State
  const [isViewOptionsMenuOpen, setIsViewOptionsMenuOpen] = useState(false);
  const viewOptionsMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
      if (viewOptionsMenuRef.current && !viewOptionsMenuRef.current.contains(event.target as Node)) {
        setIsViewOptionsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter Ad Accounts in dropdown
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

  // Layout Zoom & Resizing State
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
    } catch {}
    const initial: Record<string, number> = {};
    DEFAULT_COLUMNS.forEach((col) => {
      initial[col.key] = col.width;
    });
    return initial;
  });

  const [defaultRowHeight, setDefaultRowHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('reamarc_perf_def_row_height');
      if (saved) return Number(saved);
    } catch {}
    return DEFAULT_ROW_HEIGHT;
  });

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableInnerRef = useRef<HTMLDivElement>(null);
  const resizeGuideRef = useRef<HTMLDivElement>(null);
  const resizeTooltipRef = useRef<HTMLDivElement>(null);
  const currentResizingWidthRef = useRef<number>(100);

  const handleColumnResizeStart = (e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnWidths[colKey] || 100;
    currentResizingWidthRef.current = startWidth;

    const handleElement = e.currentTarget as HTMLElement;
    const innerRect = tableInnerRef.current?.getBoundingClientRect();
    const initialHandleLeft = innerRect
      ? (handleElement.getBoundingClientRect().right - innerRect.left) * (100 / zoomLevel)
      : 0;

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
      const delta = (moveEvent.clientX - startX) * (100 / zoomLevel);
      const newWidth = Math.max(50, Math.min(600, startWidth + delta));
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
          localStorage.setItem('reamarc_perf_col_widths', JSON.stringify(next));
        } catch {}
        return next;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleResetLayout = () => {
    const initial: Record<string, number> = {};
    DEFAULT_COLUMNS.forEach((col) => {
      initial[col.key] = col.width;
    });
    setColumnWidths(initial);
    setDefaultRowHeight(DEFAULT_ROW_HEIGHT);
    setZoomLevel(DEFAULT_ZOOM);
    try {
      localStorage.removeItem('reamarc_perf_col_widths');
      localStorage.removeItem('reamarc_perf_def_row_height');
      localStorage.setItem('reamarc_perf_zoom', String(DEFAULT_ZOOM));
    } catch {}
    addToast('Layout reset', 'Column widths, row heights, and zoom reset to default.', 'info');
  };

  // Distinct objectives from data
  const objectiveOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.objective?.trim()) set.add(r.objective.trim());
    });
    const opts = [{ value: 'all', label: 'All objectives' }];
    Array.from(set).sort().forEach((obj) => {
      opts.push({ value: obj, label: obj });
    });
    return opts;
  }, [rows]);

  // Filtered & Grouped Rows
  const sortedAndFilteredRows = useMemo(() => {
    let list = [...rows];

    if (selectedPlatform !== 'all') {
      const p = selectedPlatform.toLowerCase();
      list = list.filter((r) => (r.platform || '').toLowerCase().includes(p));
    }

    if (selectedObjective !== 'all') {
      const obj = selectedObjective.toLowerCase();
      list = list.filter((r) => (r.objective || '').toLowerCase().trim() === obj);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          (r.workspace_name || '').toLowerCase().includes(q) ||
          (r.campaign_name || '').toLowerCase().includes(q) ||
          (r.industry || '').toLowerCase().includes(q) ||
          (r.remarks || '').toLowerCase().includes(q)
      );
    }

    const statusPriority: Record<string, number> = {
      Active: 1,
      Paused: 2,
      Error: 3,
      Stopped: 4,
    };

    return list.sort((a, b) => {
      const clientA = a.workspace_name || '';
      const clientB = b.workspace_name || '';
      const cmpClient = clientA.localeCompare(clientB, undefined, { sensitivity: 'base' });
      if (cmpClient !== 0) return cmpClient;

      const priorityA = statusPriority[a.status] || 99;
      const priorityB = statusPriority[b.status] || 99;
      if (priorityA !== priorityB) return priorityA - priorityB;

      return (Number(b.ad_spend) || 0) - (Number(a.ad_spend) || 0);
    });
  }, [rows, selectedPlatform, selectedObjective, searchQuery]);

  // Aggregate Totals for KPI cards & footer (computed across current data rows)
  const totals = useMemo(() => {
    let ad_spend = 0;
    let impressions = 0;
    let clicks = 0;
    let leads_conversions = 0;
    let budget_set = 0;
    let reach = 0;

    sortedAndFilteredRows.forEach((r) => {
      ad_spend += Number(r.ad_spend) || 0;
      impressions += Number(r.impressions) || 0;
      clicks += Number(r.clicks) || 0;
      leads_conversions += Number(r.leads_conversions) || 0;
      budget_set += Number(r.budget_set) || 0;
      reach += Number(r.reach) || 0;
    });

    const cpl_cpa = leads_conversions > 0 ? ad_spend / leads_conversions : 0;
    const avg_freq = reach > 0 ? impressions / reach : 0;

    return {
      ad_spend,
      impressions,
      clicks,
      leads_conversions,
      cpl_cpa,
      budget_set,
      reach,
      avg_freq,
    };
  }, [sortedAndFilteredRows]);

  // Row Virtualization
  const zoomLevelRef = useRef(zoomLevel);
  zoomLevelRef.current = zoomLevel;

  const rowVirtualizer = useVirtualizer({
    count: sortedAndFilteredRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => defaultRowHeight,
    overscan: 10,
    observeElementOffset: (instance, cb) => {
      return observeElementOffset(instance, (offset, isScrolling) => {
        const scale = (zoomLevelRef.current || 100) / 100;
        cb(offset / scale, isScrolling);
      });
    },
    observeElementRect: (instance, cb) => {
      return observeElementRect(instance, (rect) => {
        const scale = (zoomLevelRef.current || 100) / 100;
        cb({
          width: Math.round(rect.width / scale),
          height: Math.round(rect.height / scale),
        });
      });
    },
    scrollToFn: (offset, options, instance) => {
      const scale = (zoomLevelRef.current || 100) / 100;
      elementScroll(offset * scale, options, instance);
    },
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalVirtualSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start ?? 0 : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? totalVirtualSize - (virtualRows[virtualRows.length - 1]?.end ?? 0)
      : 0;

  useEffect(() => {
    rowVirtualizer.measure();
  }, [defaultRowHeight, zoomLevel, rowVirtualizer]);

  // Sync Handling
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
            addToast('Sync complete', `Updated ${statusRes.synced_campaigns_count} campaigns.`, 'success');
          } else if (statusRes.status === 'error' || attempts >= 20) {
            if (syncPollIntervalRef.current) {
              clearInterval(syncPollIntervalRef.current);
              syncPollIntervalRef.current = null;
            }
            setIsSyncing(false);
            refetch();
            addToast('Sync warning', statusRes.message || 'Sync finished with warnings.', 'warning');
          }
        } catch {
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
      addToast('Sync failed', err.message || 'Could not initiate ad sync.', 'error');
    }
  };

  // CSV Export
  const handleExport = () => {
    const headers = DEFAULT_COLUMNS.map((col) => col.label);
    const csvRows = [
      headers.join(','),
      ...sortedAndFilteredRows.map((row) =>
        DEFAULT_COLUMNS.map((col) => {
          const val = (row as any)[col.key];
          const str = val !== undefined && val !== null ? String(val) : '';
          return `"${str.replace(/"/g, '""')}"`;
        }).join(',')
      ),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `performance_marketing_${selectedDate || 'today'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addToast('Export complete', 'Performance marketing matrix downloaded as CSV.', 'success');
  };

  const totalTableWidth = useMemo(() => {
    return DEFAULT_COLUMNS.reduce((sum, col) => sum + (columnWidths[col.key] || col.width), 0);
  }, [columnWidths]);

  const renderPlatformIcon = (platform: string) => {
    const p = (platform || '').toLowerCase();
    if (p.includes('meta') || p.includes('facebook') || p.includes('instagram')) {
      return <MetaIcon size={14} variant="brand" />;
    }
    if (p.includes('google')) {
      return <GoogleAdsIcon size={14} variant="brand" />;
    }
    if (p.includes('tiktok')) {
      return <TikTokIcon size={14} variant="brand" />;
    }
    if (p.includes('whatsapp')) {
      return <WhatsAppIcon size={14} variant="brand" />;
    }
    return <span className="text-small text-fg-muted">{platform || '—'}</span>;
  };

  return (
    <div className="flex flex-col h-full bg-canvas text-fg select-none overflow-hidden p-6 lg:px-8 lg:py-6">
      {/* ─── Page Header (§13.16) ─── */}
      <PageHeader
        title="Performance marketing"
        description="Spend and results across every connected ad account."
        actions={
          <>
            <CustomDatePicker
              value={selectedDate}
              onChange={changeDate}
              className="w-40"
              clearable={false}
            />

            <CustomSelect
              value={selectedPlatform}
              onChange={setSelectedPlatform}
              options={[
                { value: 'all', label: 'All platforms' },
                { value: 'Meta', label: 'Meta', icon: MetaIcon },
                { value: 'Google', label: 'Google', icon: GoogleAdsIcon },
                { value: 'TikTok', label: 'TikTok', icon: TikTokIcon },
                { value: 'WhatsApp', label: 'WhatsApp', icon: WhatsAppIcon },
              ]}
              className="w-36"
              size="sm"
            />



            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              loading={isSyncing}
              onClick={handleManualSync}
            >
              Sync
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={Download}
              onClick={handleExport}
            >
              Export
            </Button>
          </>
        }
      />

      {/* ─── KPI Row (5 KpiCards with aggregate totals) ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-4 shrink-0">
        <KpiCard
          label="Ad spend"
          value={formatCellValue(totals.ad_spend, 'currency')}
        />
        <KpiCard
          label="Impressions"
          value={formatCellValue(totals.impressions, 'number')}
        />
        <KpiCard
          label="Clicks"
          value={formatCellValue(totals.clicks, 'number')}
        />
        <KpiCard
          label="Leads / conv."
          value={formatCellValue(totals.leads_conversions, 'number')}
        />
        <KpiCard
          label="CPL / CPA"
          value={formatCellValue(totals.cpl_cpa, 'currency')}
        />
      </div>

      {/* ─── Table Card Shell ("All ad accounts") ─── */}
      <div className="flex-1 min-h-0 flex flex-col bg-surface border border-border rounded-xl shadow-xs overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-3 border-b border-border flex items-center justify-between gap-3 flex-wrap shrink-0 bg-surface">
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Ad Account Dropdown Trigger */}
            <div className="relative" ref={accountMenuRef}>
              <button
                type="button"
                onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
                className="inline-flex items-center gap-2 h-8 px-2.5 rounded-md border border-border-strong bg-surface text-small font-medium text-fg hover:bg-hover transition-colors shadow-xs cursor-pointer select-none"
              >
                <div
                  className={`w-4 h-4 rounded text-white text-[9px] font-semibold flex items-center justify-center shrink-0 ${
                    (selectedWorkspace as any)?.brandColor || 'bg-accent'
                  }`}
                >
                  {(selectedWorkspace as any)?.initials ||
                    (selectedWorkspace ? selectedWorkspace.name.slice(0, 2).toUpperCase() : 'ALL')}
                </div>
                <span className="truncate max-w-[160px] text-fg font-medium">
                  {selectedWorkspace ? selectedWorkspace.name : 'All ad accounts (aggregated)'}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-fg-muted transition-transform duration-150 ${
                    isAccountMenuOpen ? 'rotate-180 text-accent' : ''
                  }`}
                />
              </button>

              {/* Account Dropdown Popover */}
              {isAccountMenuOpen && (
                <div className="absolute left-0 top-full mt-1.5 z-50 w-72 bg-surface border border-border rounded-lg shadow-md p-2 space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-fg-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder={`Search ${accountsList.length} ad accounts…`}
                      value={dropdownSearch}
                      onChange={(e) => setDropdownSearch(e.target.value)}
                      className="w-full pl-8 pr-7 py-1 text-small bg-subtle border border-border rounded-md text-fg placeholder:text-fg-faint focus-visible:focus-ring"
                      autoFocus
                    />
                    {dropdownSearch && (
                      <button
                        type="button"
                        onClick={() => setDropdownSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg p-0.5 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-0.5 pr-0.5">
                    {!dropdownSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectWorkspace?.(null);
                          setIsAccountMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-md text-small transition-colors cursor-pointer ${
                          !selectedWorkspace
                            ? 'bg-accent-soft text-accent-text font-semibold'
                            : 'text-fg-2 hover:bg-hover'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded bg-accent text-accent-fg text-[9px] font-semibold flex items-center justify-center">
                            ALL
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-small">All ad accounts (aggregated)</p>
                            <p className="text-caption text-fg-muted">Portfolio metrics</p>
                          </div>
                        </div>
                        {!selectedWorkspace && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
                      </button>
                    )}

                    {filteredDropdownAccounts.length === 0 ? (
                      <div className="p-3 text-center text-caption text-fg-muted">
                        No ad accounts found for "{dropdownSearch}".
                      </div>
                    ) : (
                      filteredDropdownAccounts.map((ws) => {
                        const isSelected = selectedWorkspace?.id === ws.id;
                        return (
                          <button
                            key={ws.id}
                            type="button"
                            onClick={() => {
                              onSelectWorkspace?.(ws);
                              setIsAccountMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between p-2 rounded-md text-small transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-accent-soft text-accent-text font-semibold'
                                : 'text-fg-2 hover:bg-hover'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 text-left">
                              <div
                                className={`w-5 h-5 rounded text-[9px] font-semibold flex items-center justify-center text-white shrink-0 ${
                                  (ws as any).brandColor || 'bg-accent'
                                }`}
                              >
                                {(ws as any).initials || ws.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-small truncate">{ws.name}</p>
                                <p className="text-caption text-fg-muted truncate">
                                  {(ws as any).industry || 'Ad account'}
                                </p>
                              </div>
                            </div>
                            {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0 ml-1.5" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* In-table Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-fg-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder={`Search ${sortedAndFilteredRows.length} ad accounts…`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 pr-7 text-small bg-surface border border-border-strong rounded-md text-fg placeholder:text-fg-faint focus-visible:focus-ring w-48 sm:w-56"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg cursor-pointer p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Objective Filter */}
            {objectiveOptions.length > 2 && (
              <CustomSelect
                value={selectedObjective}
                onChange={setSelectedObjective}
                options={objectiveOptions}
                size="sm"
                className="w-36"
              />
            )}
          </div>

          {/* Right Toolbar: View Options & Show Paused Toggle */}
          <div className="flex items-center gap-3">
            {/* View Options Menu */}
            <div className="relative" ref={viewOptionsMenuRef}>
              <button
                type="button"
                onClick={() => setIsViewOptionsMenuOpen(!isViewOptionsMenuOpen)}
                className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-small font-medium transition-colors shadow-xs cursor-pointer select-none ${
                  isViewOptionsMenuOpen
                    ? 'bg-hover border-border-strong text-fg'
                    : 'bg-surface border-border-strong text-fg-2 hover:bg-hover hover:text-fg'
                }`}
                title="View options"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-fg-muted" />
                <span>View options</span>
                <ChevronDown className="w-3 h-3 text-fg-muted" />
              </button>

              {isViewOptionsMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-50 w-64 bg-surface border border-border rounded-lg shadow-md p-3 space-y-3">
                  <div className="text-caption font-semibold text-fg-muted uppercase tracking-wider">
                    Display settings
                  </div>

                  {/* Row Height Control */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-small font-medium text-fg-2">
                      <MoveVertical className="w-3.5 h-3.5 text-fg-muted" />
                      <span>Row height</span>
                    </div>
                    <div className="flex items-center bg-subtle border border-border rounded-md p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.max(28, defaultRowHeight - 4);
                          setDefaultRowHeight(next);
                          try {
                            localStorage.setItem('reamarc_perf_def_row_height', String(next));
                          } catch {}
                        }}
                        className="w-6 h-6 flex items-center justify-center text-small font-semibold text-fg-2 hover:bg-hover rounded transition-colors cursor-pointer"
                        title="Decrease row height"
                      >
                        -
                      </button>
                      <span className="text-small font-numeric font-semibold px-1.5 min-w-[34px] text-center text-fg">
                        {defaultRowHeight}px
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.min(80, defaultRowHeight + 4);
                          setDefaultRowHeight(next);
                          try {
                            localStorage.setItem('reamarc_perf_def_row_height', String(next));
                          } catch {}
                        }}
                        className="w-6 h-6 flex items-center justify-center text-small font-semibold text-fg-2 hover:bg-hover rounded transition-colors cursor-pointer"
                        title="Increase row height"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Zoom Level Control */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-small font-medium text-fg-2">
                      <ZoomIn className="w-3.5 h-3.5 text-fg-muted" />
                      <span>Zoom</span>
                    </div>
                    <div className="flex items-center bg-subtle border border-border rounded-md p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.max(MIN_ZOOM, zoomLevel - 5);
                          setZoomLevel(next);
                          try {
                            localStorage.setItem('reamarc_perf_zoom', String(next));
                          } catch {}
                        }}
                        disabled={zoomLevel <= MIN_ZOOM}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-hover text-fg-2 disabled:opacity-40 transition-colors cursor-pointer"
                        title="Zoom out"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-small font-numeric font-semibold px-1.5 min-w-[42px] text-center text-fg">
                        {zoomLevel}%
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.min(MAX_ZOOM, zoomLevel + 5);
                          setZoomLevel(next);
                          try {
                            localStorage.setItem('reamarc_perf_zoom', String(next));
                          } catch {}
                        }}
                        disabled={zoomLevel >= MAX_ZOOM}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-hover text-fg-2 disabled:opacity-40 transition-colors cursor-pointer"
                        title="Zoom in"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Reset Layout to Default Button */}
                  <div className="pt-2 border-t border-border">
                    <button
                      type="button"
                      onClick={handleResetLayout}
                      className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md bg-subtle hover:bg-hover text-fg-2 hover:text-fg text-small font-medium transition-colors cursor-pointer"
                      title="Reset column widths, row heights, and zoom"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-fg-muted" />
                      <span>Reset layout to default</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Show Paused Switch */}
            <label className="flex items-center gap-2 text-small text-fg-2 cursor-pointer select-none">
              <Switch checked={showInactive} onCheckedChange={toggleShowInactive} />
              <span>Show paused</span>
            </label>
          </div>
        </div>

        {/* ─── Virtualized Grid Canvas ─── */}
        <div
          ref={tableContainerRef}
          className="flex-1 min-h-0 overflow-auto bg-surface relative w-full flex flex-col"
        >
          <div
            ref={tableInnerRef}
            style={{
              zoom: `${zoomLevel}%`,
              width: `${totalTableWidth}px`,
              minWidth: `${totalTableWidth}px`,
              '--pm-row-height': `${defaultRowHeight}px`,
            } as React.CSSProperties}
            className="min-w-full flex flex-col flex-1 relative"
          >
            {/* Column Resize Visual Guide */}
            <div
              ref={resizeGuideRef}
              style={{ display: 'none', left: 0 }}
              className="absolute top-0 bottom-0 w-0.5 bg-accent z-40 pointer-events-none"
            >
              <div
                ref={resizeTooltipRef}
                className="absolute top-2 -left-6 px-1.5 py-0.5 bg-accent text-accent-fg text-caption font-semibold rounded shadow-md pointer-events-none select-none font-numeric"
              />
            </div>

            <table
              className="border-collapse text-small text-left table-fixed w-full"
              style={{
                width: `${totalTableWidth}px`,
                minWidth: `${totalTableWidth}px`,
                '--pm-row-height': `${defaultRowHeight}px`,
              } as React.CSSProperties}
            >
              {/* Table Header ("All ad accounts") */}
              <thead className="sticky top-0 z-20 shadow-2xs">
                <tr className="bg-canvas text-fg-muted font-medium text-caption border-b border-border">
                  {DEFAULT_COLUMNS.map((col, idx) => {
                    const colW = columnWidths[col.key] || col.width;
                    const isFirst = idx === 0;
                    const alignClass =
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left';

                    return (
                      <th
                        key={col.key}
                        style={{
                          width: `${colW}px`,
                          minWidth: `${colW}px`,
                          ...(isFirst ? { left: 0, position: 'sticky', zIndex: 30 } : {}),
                        }}
                        className={`h-9 px-3 font-medium bg-canvas border-b border-border text-fg-muted select-none relative group ${alignClass}`}
                      >
                        <div
                          className={`flex items-center gap-1 ${
                            col.align === 'right'
                              ? 'justify-end'
                              : col.align === 'center'
                              ? 'justify-center'
                              : 'justify-start'
                          }`}
                        >
                          <span className="truncate" title={col.label}>
                            {col.label}
                          </span>
                        </div>

                        {/* Column Resize Handle */}
                        <div
                          onMouseDown={(e) => handleColumnResizeStart(e, col.key)}
                          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-accent/80 z-20"
                          title="Drag to resize column"
                        />
                      </th>
                    );
                  })}
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 12 }).map((_, idx) => (
                    <tr key={`pm-skel-${idx}`} className="animate-pulse h-[var(--pm-row-height)]">
                      {DEFAULT_COLUMNS.map((col, cIdx) => (
                        <td
                          key={col.key}
                          style={cIdx === 0 ? { left: 0, position: 'sticky', zIndex: 10 } : undefined}
                          className="px-3 border-b border-border bg-surface align-middle"
                        >
                          <div className="h-3.5 bg-subtle rounded w-3/4" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : error ? (
                  <tr>
                    <td colSpan={DEFAULT_COLUMNS.length} className="py-16 text-center">
                      <ErrorState
                        title="Failed to load performance metrics"
                        message={error}
                        onRetry={refetch}
                      />
                    </td>
                  </tr>
                ) : sortedAndFilteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={DEFAULT_COLUMNS.length} className="py-16 text-center">
                      <EmptyState
                        isFiltered={Boolean(searchQuery || selectedPlatform !== 'all' || selectedObjective !== 'all')}
                        title="No campaigns found"
                        description={
                          showInactive
                            ? `No recorded marketing metrics found for ${selectedDate}. Click 'Sync' to fetch latest data.`
                            : `All campaigns on ${selectedDate} may be paused. Try enabling 'Show paused'.`
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  <>
                    {paddingTop > 0 && (
                      <tr style={{ height: `${paddingTop}px` }} aria-hidden="true">
                        <td
                          colSpan={DEFAULT_COLUMNS.length}
                          style={{ height: `${paddingTop}px`, padding: 0, border: 0 }}
                        />
                      </tr>
                    )}
                    {virtualRows.map((virtualRow) => {
                      const row = sortedAndFilteredRows[virtualRow.index];
                      if (!row) return null;
                      const leadsVal = Number(row.leads_conversions) || 0;

                      return (
                        <tr
                          key={row.campaign_id}
                          ref={rowVirtualizer.measureElement}
                          data-index={virtualRow.index}
                          className="h-[var(--pm-row-height)] hover:bg-hover transition-colors group cursor-default"
                        >
                          {DEFAULT_COLUMNS.map((col, colIdx) => {
                            const colW = columnWidths[col.key] || col.width;
                            const isFirst = colIdx === 0;
                            const alignClass =
                              col.align === 'right'
                                ? 'text-right'
                                : col.align === 'center'
                                ? 'text-center'
                                : 'text-left';

                            return (
                              <td
                                key={col.key}
                                style={{
                                  width: `${colW}px`,
                                  minWidth: `${colW}px`,
                                  ...(isFirst
                                    ? {
                                        position: 'sticky',
                                        left: 0,
                                        zIndex: 10,
                                      }
                                    : {}),
                                }}
                                className={`h-[var(--pm-row-height)] px-3 border-b border-border align-middle text-small text-fg-2 overflow-hidden ${
                                  isFirst ? 'bg-surface group-hover:bg-hover' : ''
                                } ${alignClass}`}
                              >
                                {col.key === 'workspace_name' ? (
                                  <span className="font-medium text-fg truncate block">
                                    {row.workspace_name || '—'}
                                  </span>
                                ) : col.key === 'industry' ? (
                                  <span className="text-fg-muted truncate block">
                                    {row.industry || '—'}
                                  </span>
                                ) : col.key === 'platform' ? (
                                  <div className="flex items-center justify-center">
                                    {renderPlatformIcon(row.platform)}
                                  </div>
                                ) : col.key === 'campaign_name' ? (
                                  <span
                                    className="font-medium text-fg truncate block"
                                    title={row.campaign_name}
                                  >
                                    {row.campaign_name}
                                  </span>
                                ) : col.key === 'objective' ? (
                                  <span className="text-fg-muted truncate block">
                                    {row.objective || '—'}
                                  </span>
                                ) : col.key === 'status' ? (
                                  <div className="flex items-center justify-center">
                                    <StatusPill
                                      status={row.status?.toLowerCase()}
                                      label={row.status}
                                    />
                                  </div>
                                ) : col.key === 'budget_set' ? (
                                  <span className="font-numeric tabular-nums text-fg-2">
                                    {formatCellValue(row.budget_set, 'currency')}
                                  </span>
                                ) : col.key === 'ad_spend' ? (
                                  <span className="font-numeric tabular-nums font-medium text-fg">
                                    {formatCellValue(row.ad_spend, 'currency')}
                                  </span>
                                ) : col.key === 'reach' ? (
                                  <span className="font-numeric tabular-nums text-fg-2">
                                    {formatCellValue(row.reach, 'number')}
                                  </span>
                                ) : col.key === 'impressions' ? (
                                  <span className="font-numeric tabular-nums text-fg-2">
                                    {formatCellValue(row.impressions, 'number')}
                                  </span>
                                ) : col.key === 'clicks' ? (
                                  <span className="font-numeric tabular-nums text-fg-2">
                                    {formatCellValue(row.clicks, 'number')}
                                  </span>
                                ) : col.key === 'avg_frequency' ? (
                                  <span className="font-numeric tabular-nums text-fg-2">
                                    {formatCellValue(row.avg_frequency, 'number')}
                                  </span>
                                ) : col.key === 'leads_conversions' ? (
                                  <span className="font-numeric tabular-nums font-medium text-fg">
                                    {leadsVal > 0 ? formatCellValue(row.leads_conversions, 'number') : '0'}
                                  </span>
                                ) : col.key === 'cpl_cpa' ? (
                                  <span className="font-numeric tabular-nums text-fg-2">
                                    {formatCellValue(row.cpl_cpa, 'currency')}
                                  </span>
                                ) : col.key === 'remarks' ? (
                                  <span className="text-fg-muted truncate block" title={row.remarks || ''}>
                                    {row.remarks || '—'}
                                  </span>
                                ) : (
                                  <span>{formatCellValue((row as any)[col.key])}</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    {paddingBottom > 0 && (
                      <tr style={{ height: `${paddingBottom}px` }} aria-hidden="true">
                        <td
                          colSpan={DEFAULT_COLUMNS.length}
                          style={{ height: `${paddingBottom}px`, padding: 0, border: 0 }}
                        />
                      </tr>
                    )}
                  </>
                )}
              </tbody>

              {/* Total Row (§13.16 footer reference) */}
              {!isLoading && !error && sortedAndFilteredRows.length > 0 && (
                <tfoot className="sticky bottom-0 z-20">
                  <tr className="bg-canvas border-t-2 border-border text-small font-medium">
                    <td
                      colSpan={6}
                      style={{ position: 'sticky', left: 0, zIndex: 30 }}
                      className="h-10 px-3 text-fg font-semibold bg-canvas border-t border-border select-none"
                    >
                      Total · {sortedAndFilteredRows.length} campaigns
                    </td>
                    <td className="h-10 px-3 text-right font-numeric tabular-nums text-fg-2 bg-canvas border-t border-border">
                      {formatCellValue(totals.budget_set, 'currency')}
                    </td>
                    <td className="h-10 px-3 text-right font-numeric tabular-nums font-semibold text-fg bg-canvas border-t border-border">
                      {formatCellValue(totals.ad_spend, 'currency')}
                    </td>
                    <td className="h-10 px-3 text-right font-numeric tabular-nums text-fg-2 bg-canvas border-t border-border">
                      {formatCellValue(totals.reach, 'number')}
                    </td>
                    <td className="h-10 px-3 text-right font-numeric tabular-nums text-fg-2 bg-canvas border-t border-border">
                      {formatCellValue(totals.impressions, 'number')}
                    </td>
                    <td className="h-10 px-3 text-right font-numeric tabular-nums text-fg-2 bg-canvas border-t border-border">
                      {formatCellValue(totals.clicks, 'number')}
                    </td>
                    <td className="h-10 px-3 text-right font-numeric tabular-nums text-fg-2 bg-canvas border-t border-border">
                      {totals.avg_freq > 0 ? totals.avg_freq.toFixed(2) : '—'}
                    </td>
                    <td className="h-10 px-3 text-right font-numeric tabular-nums font-semibold text-fg bg-canvas border-t border-border">
                      {formatCellValue(totals.leads_conversions, 'number')}
                    </td>
                    <td className="h-10 px-3 text-right font-numeric tabular-nums text-fg-2 bg-canvas border-t border-border">
                      {formatCellValue(totals.cpl_cpa, 'currency')}
                    </td>
                    <td className="h-10 px-3 bg-canvas border-t border-border" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

    </div>
  );
};
