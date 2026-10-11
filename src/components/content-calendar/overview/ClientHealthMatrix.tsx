import React, { useState, useMemo } from 'react';
import {
  Building2,
  Search,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { ClientHealthItem } from '../../../utils/contentCalendarOverview';
import { getInitials } from '../../../utils/badgeStyles';

interface Props {
  matrix: ClientHealthItem[];
  isLoading?: boolean;
  onOpenClient: (clientName: string, viewMode: 'table' | 'pipeline') => void;
}

export const ClientHealthMatrix: React.FC<Props> = ({
  matrix,
  isLoading = false,
  onOpenClient,
}) => {
  const [filterSearch, setFilterSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  const filteredMatrix = useMemo(() => {
    if (!filterSearch.trim()) return matrix;
    const query = filterSearch.toLowerCase().trim();
    return matrix.filter((row) => row.clientName.toLowerCase().includes(query));
  }, [matrix, filterSearch]);

  const displayedRows = showAll ? filteredMatrix : filteredMatrix.slice(0, 8);

  return (
    <div className="w-full rounded-xl bg-surface border border-border shadow-xs p-4 flex flex-col">
      {/* Table Header / Toolbar */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-border shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-accent" />
            <h3 className="text-ui font-semibold text-fg">
              Client Portfolio
            </h3>
            <span className="font-numeric text-xs font-medium px-2 py-0.5 rounded-full bg-subtle text-fg-muted border border-border">
              {filteredMatrix.length} {filteredMatrix.length === 1 ? 'client' : 'clients'}
            </span>
          </div>
          <p className="text-caption text-fg-muted mt-0.5 hidden sm:block">
            Production volume, approval status, and upcoming deadlines per client
          </p>
        </div>

        {/* Client Search */}
        <div className="relative w-36 sm:w-48">
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

      {/* Table Area (Fixed 7 columns, no horizontal scroll at >=1024px) */}
      <div className="w-full overflow-hidden pt-1">
        <table className="w-full table-fixed text-left text-xs border-collapse">
          <thead>
            <tr className="text-fg-muted font-medium text-caption border-b border-border">
              {/* 1. Client */}
              <th className="py-2.5 px-2 w-[32%] sm:w-[28%] lg:w-[24%]">Client</th>
              {/* 2. Posts */}
              <th className="py-2.5 px-2 text-center w-[14%] sm:w-[12%] lg:w-[10%]">Posts</th>
              {/* 3. In production (hidden below lg) */}
              <th className="py-2.5 px-2 text-center hidden lg:table-cell lg:w-[14%]">In production</th>
              {/* 4. Client review (hidden below lg) */}
              <th className="py-2.5 px-2 text-center hidden lg:table-cell lg:w-[14%]">Client review</th>
              {/* 5. Overdue */}
              <th className="py-2.5 px-2 text-center w-[18%] sm:w-[16%] lg:w-[12%]">Overdue</th>
              {/* 6. Progress */}
              <th className="py-2.5 px-2 text-center w-[20%] sm:w-[24%] lg:w-[14%]">Progress</th>
              {/* 7. Next post */}
              <th className="py-2.5 px-2 text-right w-[16%] sm:w-[20%] lg:w-[12%]">Next post</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border font-medium">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="animate-pulse">
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-skel shrink-0" />
                      <div className="h-4 w-28 bg-skel rounded" />
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-center"><div className="h-4 w-8 bg-skel rounded mx-auto" /></td>
                  <td className="py-2.5 px-2 text-center hidden lg:table-cell"><div className="h-4 w-8 bg-skel rounded mx-auto" /></td>
                  <td className="py-2.5 px-2 text-center hidden lg:table-cell"><div className="h-4 w-8 bg-skel rounded mx-auto" /></td>
                  <td className="py-2.5 px-2 text-center"><div className="h-4 w-8 bg-skel rounded mx-auto" /></td>
                  <td className="py-2.5 px-2 text-center"><div className="h-2 w-16 bg-skel rounded-full mx-auto" /></td>
                  <td className="py-2.5 px-2 text-right"><div className="h-4 w-16 bg-skel rounded ml-auto" /></td>
                </tr>
              ))
            ) : displayedRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-fg-muted">
                  <p className="text-sm font-semibold text-fg">No clients match the active filter</p>
                  <p className="text-caption mt-0.5">Try clearing your search query or adjusting your filters.</p>
                </td>
              </tr>
            ) : (
              displayedRows.map((row) => {
                const initials = getInitials(row.clientName);
                const inProduction = row.contentPhase + row.creativePhase;

                return (
                  <tr
                    key={row.clientName}
                    className="group hover:bg-hover transition-colors cursor-pointer"
                    onClick={() => onOpenClient(row.clientName, 'table')}
                  >
                    {/* 1. Client Name + Avatar */}
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-5 h-5 rounded-md bg-subtle border border-border flex items-center justify-center text-[9px] font-medium text-fg-2 shrink-0">
                          {initials}
                        </div>
                        <span className="font-semibold text-fg text-xs group-hover:text-accent transition-colors truncate">
                          {row.clientName}
                        </span>
                      </div>
                    </td>

                    {/* 2. Posts */}
                    <td className="py-2.5 px-2 text-center font-numeric font-semibold text-fg">
                      {row.total}
                    </td>

                    {/* 3. In production (hidden below lg) */}
                    <td className="py-2.5 px-2 text-center hidden lg:table-cell">
                      <span className={`font-numeric ${inProduction > 0 ? 'font-medium text-fg' : 'text-fg-muted'}`}>
                        {inProduction}
                      </span>
                    </td>

                    {/* 4. Client review (hidden below lg) */}
                    <td className="py-2.5 px-2 text-center hidden lg:table-cell">
                      {row.clientReview > 0 ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10.5px] font-numeric font-medium bg-warning-bg text-warning-fg border border-warning-bd">
                          {row.clientReview}
                        </span>
                      ) : (
                        <span className="font-numeric text-fg-muted">0</span>
                      )}
                    </td>

                    {/* 5. Overdue */}
                    <td className="py-2.5 px-2 text-center">
                      {row.overdueCount > 0 ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10.5px] font-numeric font-semibold bg-danger-bg text-danger-fg border border-danger-bd">
                          {row.overdueCount}
                        </span>
                      ) : (
                        <span className="font-numeric text-fg-muted">0</span>
                      )}
                    </td>

                    {/* 6. Progress bar + % */}
                    <td className="py-2.5 px-2 text-center">
                      <div className="inline-flex items-center justify-center gap-1.5 w-full">
                        <div className="w-12 bg-subtle rounded-full h-1.5 overflow-hidden shrink-0 border border-border/40">
                          <div
                            className="bg-success-dot h-full rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(row.completionRate, 100)}%` }}
                          />
                        </div>
                        <span className="font-numeric text-[10.5px] font-medium text-fg-muted shrink-0">
                          {row.completionRate}%
                        </span>
                      </div>
                    </td>

                    {/* 7. Next post */}
                    <td className="py-2.5 px-2 text-right font-numeric text-fg-muted text-xs truncate">
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
