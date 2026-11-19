import React, { useState, useMemo } from 'react';
import {
  Building2,
  Search,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { ClientHealthItem } from '../../../utils/contentCalendarOverview';
import { ClientAvatar } from '../../ui/ClientAvatar';
import { useResolvedClient } from '../../../hooks/useClientLookup';

interface Props {
  matrix: ClientHealthItem[];
  isLoading?: boolean;
  onOpenClient: (clientName: string, viewMode: 'table' | 'pipeline') => void;
}

const SHORT_CREATIVE_LABELS: Record<string, string> = {
  'Animated Post': 'Animated',
  'Cover Image': 'Cover',
};

function compactCreativeLabel(type: string): string {
  return SHORT_CREATIVE_LABELS[type] || type;
}

export const ClientHealthMatrix: React.FC<Props> = ({
  matrix,
  isLoading = false,
  onOpenClient,
}) => {
  const resolveClient = useResolvedClient();
  const [filterSearch, setFilterSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  const filteredMatrix = useMemo(() => {
    if (!filterSearch.trim()) return matrix;
    const query = filterSearch.toLowerCase().trim();
    return matrix.filter((row) => row.clientName.toLowerCase().includes(query));
  }, [matrix, filterSearch]);

  const portfolioCreativeMix = useMemo(() => {
    const totals = new Map<string, { total: number; posted: number }>();
    let grandTotal = 0;
    for (const row of filteredMatrix) {
      for (const ct of row.creativeTypes || []) {
        const entry = totals.get(ct.type) || { total: 0, posted: 0 };
        entry.total += ct.total;
        entry.posted += ct.posted;
        totals.set(ct.type, entry);
        grandTotal += ct.total;
      }
    }
    const items = Array.from(totals.entries())
      .map(([type, counts]) => ({
        type,
        total: counts.total,
        posted: counts.posted,
        pct: grandTotal > 0 ? Math.round((counts.total / grandTotal) * 100) : 0,
      }))
      .sort((a, b) => (b.total !== a.total ? b.total - a.total : a.type.localeCompare(b.type)));
    return { grandTotal, items };
  }, [filteredMatrix]);

  const displayedRows = showAll ? filteredMatrix : filteredMatrix.slice(0, 8);

  return (
    <div className="w-full rounded-xl bg-surface border border-border shadow-xs p-4 flex flex-col">
      {/* Table Header / Toolbar */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-border shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-accent shrink-0" />
            <h3 className="text-ui font-semibold text-fg">
              Client Portfolio
            </h3>
            <span className="font-numeric text-xs font-medium px-2 py-0.5 rounded-full bg-subtle text-fg-muted border border-border shrink-0">
              {filteredMatrix.length} {filteredMatrix.length === 1 ? 'client' : 'clients'}
            </span>
          </div>
          <p className="text-caption text-fg-muted mt-0.5 hidden sm:block">
            Production volume, posted counts, creative mix, and upcoming deadlines per client
          </p>
        </div>

        {/* Client Search */}
        <div className="relative w-36 sm:w-48 shrink-0">
          <Search className="w-3.5 h-3.5 text-fg-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Filter clients..."
            className="w-full pl-8 pr-2.5 py-1 text-xs rounded-md bg-subtle border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {/* Portfolio-wide Creative Type Distribution Strip */}
      {!isLoading && portfolioCreativeMix.items.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 py-2.5 border-b border-border text-xs">
          <span className="text-caption font-medium text-fg-muted shrink-0 mr-0.5">
            Creative mix:
          </span>
          {portfolioCreativeMix.items.slice(0, 7).map((ct) => (
            <span
              key={ct.type}
              title={`${ct.type}: ${ct.posted} posted of ${ct.total} total (${ct.pct}%)`}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-subtle border border-border/80 text-caption font-numeric"
            >
              <span className="text-fg-2 font-medium">{ct.type}</span>
              <span className="font-semibold text-fg">{ct.total}</span>
              <span className="text-fg-muted">({ct.pct}%)</span>
            </span>
          ))}
          {portfolioCreativeMix.items.length > 7 && (
            <span
              title={portfolioCreativeMix.items
                .slice(7)
                .map((ct) => `${ct.type}: ${ct.total} (${ct.posted} posted)`)
                .join(', ')}
              className="inline-flex items-center px-2 py-0.5 rounded-md bg-subtle border border-border/80 text-caption text-fg-muted font-numeric"
            >
              +{portfolioCreativeMix.items.length - 7} more
            </span>
          )}
        </div>
      )}

      {/* Table Area (Fixed 8 columns, clean widths summing to 100% at every breakpoint) */}
      <div className="w-full overflow-hidden pt-1">
        <table className="w-full table-fixed text-left text-xs border-collapse">
          <thead>
            <tr className="text-fg-muted font-medium text-caption border-b border-border">
              {/* 1. Client + creative distribution */}
              <th className="py-2.5 px-2.5 w-[42%] sm:w-[34%] lg:w-[30%]">Client</th>
              {/* 2. Posts */}
              <th className="py-2.5 px-2 text-center whitespace-nowrap w-[13%] sm:w-[11%] lg:w-[7%]">Posts</th>
              {/* 3. Posted */}
              <th className="py-2.5 px-2 text-center whitespace-nowrap w-[14%] sm:w-[11%] lg:w-[8%]">Posted</th>
              {/* 4. Production (hidden below lg) */}
              <th className="py-2.5 px-2 text-center whitespace-nowrap hidden lg:table-cell lg:w-[10%]">Production</th>
              {/* 5. Client review (hidden below lg) */}
              <th className="py-2.5 px-2 text-center whitespace-nowrap hidden lg:table-cell lg:w-[11%]">Client review</th>
              {/* 6. Overdue */}
              <th className="py-2.5 px-2 text-center whitespace-nowrap w-[15%] sm:w-[12%] lg:w-[9%]">Overdue</th>
              {/* 7. Progress (hidden below sm) */}
              <th className="py-2.5 px-2 text-center whitespace-nowrap hidden sm:table-cell sm:w-[16%] lg:w-[13%]">Progress</th>
              {/* 8. Next post */}
              <th className="py-2.5 px-2.5 text-right whitespace-nowrap w-[16%] sm:w-[16%] lg:w-[12%]">Next post</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border font-medium">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="animate-pulse">
                  <td className="py-3 px-2.5">
                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-md bg-skel shrink-0" />
                      <div className="space-y-1.5 flex-1">
                        <div className="h-3.5 w-28 bg-skel rounded" />
                        <div className="flex items-center gap-1">
                          <div className="h-4 w-14 bg-skel rounded" />
                          <div className="h-4 w-12 bg-skel rounded" />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-center"><div className="h-4 w-7 bg-skel rounded mx-auto" /></td>
                  <td className="py-3 px-2 text-center"><div className="h-4 w-7 bg-skel rounded mx-auto" /></td>
                  <td className="py-3 px-2 text-center hidden lg:table-cell"><div className="h-4 w-7 bg-skel rounded mx-auto" /></td>
                  <td className="py-3 px-2 text-center hidden lg:table-cell"><div className="h-4 w-7 bg-skel rounded mx-auto" /></td>
                  <td className="py-3 px-2 text-center"><div className="h-4 w-7 bg-skel rounded mx-auto" /></td>
                  <td className="py-3 px-2 text-center hidden sm:table-cell"><div className="h-2 w-16 bg-skel rounded-full mx-auto" /></td>
                  <td className="py-3 px-2.5 text-right"><div className="h-4 w-16 bg-skel rounded ml-auto" /></td>
                </tr>
              ))
            ) : displayedRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-fg-muted">
                  <p className="text-sm font-semibold text-fg">No clients match the active filter</p>
                  <p className="text-caption mt-0.5">Try clearing your search query or adjusting your filters.</p>
                </td>
              </tr>
            ) : (
              displayedRows.map((row) => {
                const client = resolveClient({ client_name: row.clientName });
                const inProduction = row.contentPhase + row.creativePhase + row.revisionCount;
                const creativeTypes = row.creativeTypes || [];

                return (
                  <tr
                    key={row.clientName}
                    className="group hover:bg-hover transition-colors cursor-pointer align-middle"
                    onClick={() => onOpenClient(row.clientName, 'table')}
                  >
                    {/* 1. Client Name + Avatar + Creative Type Distribution */}
                    <td className="py-3 px-2.5">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="pt-0.5 shrink-0">
                          <ClientAvatar
                            name={row.clientName}
                            logoUrl={client?.logo_url}
                            clientId={client?.id}
                            brandColor={client?.brandColor}
                            initials={client?.initials}
                            size={24}
                            decorative
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-fg text-xs group-hover:text-accent transition-colors truncate leading-5">
                            {row.clientName}
                          </div>
                          {creativeTypes.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 mt-1">
                              {creativeTypes.slice(0, 4).map((ct) => (
                                <span
                                  key={ct.type}
                                  title={`${ct.type}: ${ct.posted} posted of ${ct.total} total`}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-subtle border border-border/75 text-[10.5px] leading-tight text-fg-2 font-numeric"
                                >
                                  <span className="truncate max-w-[78px]">{compactCreativeLabel(ct.type)}</span>
                                  <span className="font-semibold text-fg">{ct.total}</span>
                                </span>
                              ))}
                              {creativeTypes.length > 4 && (
                                <span
                                  title={creativeTypes
                                    .slice(4)
                                    .map((ct) => `${ct.type}: ${ct.total} (${ct.posted} posted)`)
                                    .join(', ')}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded bg-subtle border border-border/75 text-[10.5px] leading-tight text-fg-muted font-numeric"
                                >
                                  +{creativeTypes.length - 4}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 2. Posts */}
                    <td className="py-3 px-2 text-center font-numeric font-semibold text-fg">
                      {row.total}
                    </td>

                    {/* 3. Posted */}
                    <td className="py-3 px-2 text-center">
                      {row.posted > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[22px] px-1.5 py-0.5 rounded-full text-[10.5px] font-numeric font-semibold bg-success-bg text-success-fg border border-success-bd">
                          {row.posted}
                        </span>
                      ) : (
                        <span className="font-numeric text-fg-muted">0</span>
                      )}
                    </td>

                    {/* 4. Production (hidden below lg) */}
                    <td className="py-3 px-2 text-center hidden lg:table-cell">
                      <span className={`font-numeric ${inProduction > 0 ? 'font-medium text-fg' : 'text-fg-muted'}`}>
                        {inProduction}
                      </span>
                    </td>

                    {/* 5. Client review (hidden below lg) */}
                    <td className="py-3 px-2 text-center hidden lg:table-cell">
                      {row.clientReview > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[22px] px-1.5 py-0.5 rounded-full text-[10.5px] font-numeric font-medium bg-warning-bg text-warning-fg border border-warning-bd">
                          {row.clientReview}
                        </span>
                      ) : (
                        <span className="font-numeric text-fg-muted">0</span>
                      )}
                    </td>

                    {/* 6. Overdue */}
                    <td className="py-3 px-2 text-center">
                      {row.overdueCount > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[22px] px-1.5 py-0.5 rounded-full text-[10.5px] font-numeric font-semibold bg-danger-bg text-danger-fg border border-danger-bd">
                          {row.overdueCount}
                        </span>
                      ) : (
                        <span className="font-numeric text-fg-muted">0</span>
                      )}
                    </td>

                    {/* 7. Progress bar + % */}
                    <td className="py-3 px-2 text-center hidden sm:table-cell">
                      <div className="inline-flex items-center justify-center gap-1.5 w-full">
                        <div className="w-12 bg-subtle rounded-full h-1.5 overflow-hidden shrink-0 border border-border/40">
                          <div
                            className="bg-success-dot h-full rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(row.completionRate, 100)}%` }}
                          />
                        </div>
                        <span className="font-numeric text-[10.5px] font-medium text-fg-muted shrink-0 w-8 text-right">
                          {row.completionRate}%
                        </span>
                      </div>
                    </td>

                    {/* 8. Next post */}
                    <td className="py-3 px-2.5 text-right font-numeric text-fg-muted text-xs truncate">
                      {row.nextScheduledDate ? row.nextScheduledDate.split('T')[0] : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Show all / Show less toggle */}
      {filteredMatrix.length > 8 && (
        <div className="pt-3 mt-1 border-t border-border flex items-center justify-center shrink-0">
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-accent-text hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
          >
            <span>{showAll ? 'Show less' : `Show all (${filteredMatrix.length} clients)`}</span>
            {showAll ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
};
