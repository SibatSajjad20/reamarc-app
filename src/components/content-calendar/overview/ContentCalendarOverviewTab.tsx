import React, { useState, useMemo } from 'react';
import { RefreshCw, LayoutDashboard } from 'lucide-react';
import type {
  ContentCalendarItem,
  ContentCalendarViewMode,
} from '../../../types/contentCalendar';
import {
  calculateOverviewMetrics,
  calculateClientHealthMatrix,
  calculateDepartmentFunnel,
  calculateUrgentWatchlist,
  calculateTeamWorkload,
  filterItemsByTimeRange,
  type OverviewTimeRange,
} from '../../../utils/contentCalendarOverview';
import { OverviewKpiCards } from './OverviewKpiCards';
import { ClientHealthMatrix } from './ClientHealthMatrix';
import { DepartmentFunnelCard } from './DepartmentFunnelCard';
import { UrgentWatchlistCard } from './UrgentWatchlistCard';
import { TeamWorkloadCard } from './TeamWorkloadCard';
import { CustomSelect } from '../../ui/CustomSelect';

interface Props {
  items: ContentCalendarItem[];
  activeClients: Array<{ id: string; name: string }>;
  isLoading: boolean;
  activeClientFilter: string;
  onSelectClientFilter: (clientName: string) => void;
  onSwitchViewMode: (mode: ContentCalendarViewMode) => void;
  onSelectItem: (item: ContentCalendarItem) => void;
  onRefresh: () => void;
}

export const ContentCalendarOverviewTab: React.FC<Props> = ({
  items,
  activeClients,
  isLoading,
  activeClientFilter,
  onSelectClientFilter,
  onSwitchViewMode,
  onSelectItem,
  onRefresh,
}) => {
  // 1. Time Range State (with localStorage cache)
  const [timeRange, setTimeRange] = useState<OverviewTimeRange>(() => {
    try {
      const saved = localStorage.getItem('reamarc_cc_overview_timerange') as OverviewTimeRange;
      if (saved && ['all', 'this_month', 'last_30', 'next_30'].includes(saved)) {
        return saved;
      }
    } catch {}
    return 'all';
  });

  const handleTimeRangeChange = (range: OverviewTimeRange) => {
    setTimeRange(range);
    try {
      localStorage.setItem('reamarc_cc_overview_timerange', range);
    } catch {}
  };

  // 3. Client Options for Dropdown
  const clientOptions = useMemo(() => {
    const names = new Set<string>();
    for (const it of items) {
      const n = (it.client_name || '').trim();
      if (n) names.add(n);
    }
    for (const c of activeClients) {
      if (c.name?.trim()) names.add(c.name.trim());
    }
    return [
      { value: 'all', label: 'All Clients (Portfolio)' },
      ...[...names].sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name })),
    ];
  }, [items, activeClients]);

  // 4. Filter Items by Selected Client
  const clientFilteredItems = useMemo(() => {
    if (activeClientFilter === 'all') return items;
    return items.filter((it) => (it.client_name || '').trim() === activeClientFilter);
  }, [items, activeClientFilter]);

  // 5. Filter Items by Selected Time Range
  const scopedItems = useMemo(() => {
    return filterItemsByTimeRange(clientFilteredItems, timeRange);
  }, [clientFilteredItems, timeRange]);

  // 6. Compute Metrics and Aggregations
  const overviewMetrics = useMemo(() => calculateOverviewMetrics(scopedItems), [scopedItems]);
  const clientHealthMatrix = useMemo(
    () => calculateClientHealthMatrix(filterItemsByTimeRange(items, timeRange), activeClients),
    [items, timeRange, activeClients]
  );
  const departmentFunnel = useMemo(() => calculateDepartmentFunnel(scopedItems), [scopedItems]);
  const urgentWatchlist = useMemo(() => calculateUrgentWatchlist(scopedItems), [scopedItems]);
  const teamWorkload = useMemo(() => calculateTeamWorkload(scopedItems), [scopedItems]);

  const handleOpenClient = (clientName: string, viewMode: 'table' | 'pipeline') => {
    onSelectClientFilter(clientName);
    onSwitchViewMode(viewMode);
  };

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 overflow-y-auto bg-canvas p-3 sm:p-4 space-y-3">
      {/* Overview Filter Bar */}
      <div className="rounded-xl bg-surface border border-border p-2 flex flex-wrap items-center justify-between gap-2.5 shadow-xs">
        {/* Left: Client Scope & Time Range */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Client Filter */}
          <div className="w-48 sm:w-52">
            <CustomSelect
              size="sm"
              value={activeClientFilter}
              onChange={onSelectClientFilter}
              options={clientOptions}
            />
          </div>

          {/* Time Range Pills */}
          <div className="flex items-center bg-subtle border border-border rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => handleTimeRangeChange('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                timeRange === 'all'
                  ? 'bg-surface text-fg shadow-xs'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              All Time
            </button>
            <button
              type="button"
              onClick={() => handleTimeRangeChange('this_month')}
              className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                timeRange === 'this_month'
                  ? 'bg-surface text-fg shadow-xs'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => handleTimeRangeChange('last_30')}
              className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                timeRange === 'last_30'
                  ? 'bg-surface text-fg shadow-xs'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              Last 30 Days
            </button>
            <button
              type="button"
              onClick={() => handleTimeRangeChange('next_30')}
              className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                timeRange === 'next_30'
                  ? 'bg-surface text-fg shadow-xs'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              Next 30 Days
            </button>
          </div>
        </div>

        {/* Right: Refresh */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="p-1.5 rounded-md bg-surface hover:bg-hover border border-border text-fg-2 transition-colors cursor-pointer inline-flex items-center gap-1.5 text-xs font-medium"
            title="Refresh overview metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {items.length === 0 && !isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 rounded-xl bg-surface border border-dashed border-border text-center my-auto min-h-[360px]">
          <div className="w-12 h-12 rounded-xl bg-accent-soft text-accent flex items-center justify-center mb-3">
            <LayoutDashboard className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-fg mb-1">
            No Campaigns Found
          </h3>
          <p className="text-xs text-fg-muted max-w-sm mb-4 leading-relaxed">
            Create or import campaigns in the Content Calendar to track portfolio health, team workload, and approval funnels.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSwitchViewMode('table')}
              className="px-3.5 py-1.5 rounded-md bg-subtle hover:bg-hover text-fg-2 border border-border text-xs font-medium transition cursor-pointer"
            >
              Go to Table View
            </button>
            <button
              type="button"
              onClick={() => onSwitchViewMode('pipeline')}
              className="px-3.5 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-medium shadow-xs transition cursor-pointer"
            >
              Go to Pipeline Board
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Row 1: Executive KPI Cards */}
          <OverviewKpiCards metrics={overviewMetrics} isLoading={isLoading} />

          {/* Row 2: Balanced Bento Command Center (Left Data Tables + Right Visual Analytics) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
            {/* Left Column (7 cols): Client Health Matrix & Escalation Watchlist */}
            <div className="lg:col-span-7 flex flex-col gap-3">
              <ClientHealthMatrix
                matrix={clientHealthMatrix}
                isLoading={isLoading}
                onOpenClient={handleOpenClient}
              />
              <UrgentWatchlistCard
                watchlist={urgentWatchlist}
                isLoading={isLoading}
                onSelectItem={onSelectItem}
              />
            </div>

            {/* Right Column (5 cols): Pipeline Funnel and Team Workload */}
            <div className="lg:col-span-5 flex flex-col gap-3">
              <DepartmentFunnelCard
                funnel={departmentFunnel}
                totalItems={scopedItems.length}
                isLoading={isLoading}
              />
              <TeamWorkloadCard
                workload={teamWorkload}
                isLoading={isLoading}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};
