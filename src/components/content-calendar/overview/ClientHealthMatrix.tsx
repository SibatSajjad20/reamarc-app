import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2,
  Table,
  Kanban,
  Search,
  MoreHorizontal,
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
  const [activeMenu, setActiveMenu] = useState<{
    clientName: string;
    top: number;
    right: number;
  } | null>(null);

  // Close actions menu when clicking outside, scrolling, or pressing Escape
  useEffect(() => {
    if (!activeMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-client-actions-menu]') && !target.closest('[data-client-menu-btn]')) {
        setActiveMenu(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveMenu(null);
    };

    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target?.closest?.('[data-client-actions-menu]')) {
        setActiveMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [activeMenu]);

  const filteredMatrix = useMemo(() => {
    if (!filterSearch.trim()) return matrix;
    const query = filterSearch.toLowerCase().trim();
    return matrix.filter((row) => row.clientName.toLowerCase().includes(query));
  }, [matrix, filterSearch]);

  const handleToggleMenu = (e: React.MouseEvent<HTMLButtonElement>, clientName: string) => {
    e.stopPropagation();
    if (activeMenu?.clientName === clientName) {
      setActiveMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setActiveMenu({
      clientName,
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
  };

  return (
    <div className="w-full rounded-lg bg-surface border border-border shadow-xs overflow-hidden flex flex-col">
      {/* Table Header / Sub-toolbar */}
      <div className="px-4 py-3 flex items-center justify-between gap-2 shrink-0 bg-subtle border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-accent" />
            <h3 className="text-ui font-semibold text-fg">
              Client Portfolio
            </h3>
            <span className="font-numeric text-xs font-medium px-2 py-0.5 rounded-full bg-surface text-fg-muted border border-border">
              {filteredMatrix.length} {filteredMatrix.length === 1 ? 'client' : 'clients'}
            </span>
          </div>
          <p className="text-caption text-fg-muted mt-0.5 hidden sm:block">
            Production volume, approval status, and upcoming deadlines per client
          </p>
        </div>

        {/* Client Search within table */}
        <div className="relative w-36 sm:w-44">
          <Search className="w-3.5 h-3.5 text-fg-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Filter clients..."
            className="w-full pl-8 pr-2.5 py-1 text-xs rounded-md bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {/* Table Scroll Area */}
      <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 min-w-0 divide-y divide-border">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-subtle border-b border-border shadow-xs">
            <tr className="text-fg-muted font-medium text-caption">
              <th className="py-2.5 px-3">Client</th>
              <th className="py-2.5 px-3 text-center">Posts</th>
              <th className="py-2.5 px-3 text-center">In production</th>
              <th className="py-2.5 px-3 text-center">Client review</th>
              <th className="py-2.5 px-3 text-center">Ready</th>
              <th className="py-2.5 px-3 text-center">Posted</th>
              <th className="py-2.5 px-3 text-center">Progress</th>
              <th className="py-2.5 px-3 text-right">Next post</th>
              <th className="py-2.5 px-3 text-right w-8">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border font-medium">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="animate-pulse">
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-skel" />
                      <div className="h-4 w-28 bg-skel rounded" />
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-center"><div className="h-4 w-8 bg-skel rounded mx-auto" /></td>
                  <td className="py-2.5 px-3 text-center"><div className="h-4 w-8 bg-skel rounded mx-auto" /></td>
                  <td className="py-2.5 px-3 text-center"><div className="h-4 w-8 bg-skel rounded mx-auto" /></td>
                  <td className="py-2.5 px-3 text-center"><div className="h-4 w-8 bg-skel rounded mx-auto" /></td>
                  <td className="py-2.5 px-3 text-center"><div className="h-4 w-8 bg-skel rounded mx-auto" /></td>
                  <td className="py-2.5 px-3 text-center"><div className="h-2 w-16 bg-skel rounded-full mx-auto" /></td>
                  <td className="py-2.5 px-3 text-right"><div className="h-4 w-16 bg-skel rounded ml-auto" /></td>
                  <td className="py-2.5 px-3 text-right"><div className="h-6 w-6 bg-skel rounded-md ml-auto" /></td>
                </tr>
              ))
            ) : filteredMatrix.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-fg-muted">
                  <p className="text-sm font-semibold text-fg">No clients match the active filter</p>
                  <p className="text-xs mt-1">Try clearing your search query or adjusting your filters.</p>
                </td>
              </tr>
            ) : (
              filteredMatrix.map((row) => {
                const initials = getInitials(row.clientName);
                const isMenuOpen = activeMenu?.clientName === row.clientName;
                const inProduction = row.contentPhase + row.creativePhase;

                return (
                  <tr
                    key={row.clientName}
                    className="group hover:bg-hover transition-colors cursor-pointer"
                    onClick={() => onOpenClient(row.clientName, 'table')}
                  >
                    {/* Client Name + Avatar */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-subtle border border-border flex items-center justify-center text-[9px] font-medium text-fg-2 shrink-0">
                          {initials}
                        </div>
                        <span className="font-semibold text-fg text-xs group-hover:text-accent transition-colors">
                          {row.clientName}
                        </span>
                      </div>
                    </td>

                    {/* 1. Posts */}
                    <td className="py-2 px-3 text-center font-numeric font-semibold text-fg whitespace-nowrap">
                      {row.total}
                    </td>

                    {/* 2. In production */}
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      <span className={`font-numeric ${inProduction > 0 ? 'font-medium text-fg' : 'text-fg-muted'}`}>
                        {inProduction}
                      </span>
                    </td>

                    {/* 3. Client review */}
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      {row.clientReview > 0 ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10.5px] font-numeric font-medium bg-warning-bg text-warning-fg border border-warning-bd">
                          {row.clientReview}
                        </span>
                      ) : (
                        <span className="font-numeric text-fg-muted">0</span>
                      )}
                    </td>

                    {/* 4. Ready */}
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      {row.readyToPost > 0 ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10.5px] font-numeric font-medium bg-info-bg text-info-fg border border-info-bd">
                          {row.readyToPost}
                        </span>
                      ) : (
                        <span className="font-numeric text-fg-muted">0</span>
                      )}
                    </td>

                    {/* 5. Posted */}
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      {row.posted > 0 ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10.5px] font-numeric font-medium bg-success-bg text-success-fg border border-success-bd">
                          {row.posted}
                        </span>
                      ) : (
                        <span className="font-numeric text-fg-muted">0</span>
                      )}
                    </td>

                    {/* 6. Progress */}
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <div className="w-14 bg-subtle rounded-full h-1 overflow-hidden">
                          <div
                            className="bg-success-dot h-1 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(row.completionRate, 100)}%` }}
                          />
                        </div>
                        <span className="font-numeric text-[10.5px] font-medium text-fg-muted w-7 text-right">
                          {row.completionRate}%
                        </span>
                      </div>
                    </td>

                    {/* 7. Next post */}
                    <td className="py-2 px-3 text-right font-numeric text-fg-muted whitespace-nowrap text-xs">
                      {row.nextScheduledDate ? row.nextScheduledDate.split('T')[0] : '—'}
                    </td>

                    {/* Actions Menu */}
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        data-client-menu-btn
                        onClick={(e) => handleToggleMenu(e, row.clientName)}
                        aria-expanded={isMenuOpen}
                        className={`p-1 rounded-md text-fg-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer ${
                          isMenuOpen ? 'bg-hover text-fg' : ''
                        }`}
                        title="Open client views"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Floating Actions Menu Portal */}
      {activeMenu &&
        createPortal(
          <div
            data-client-actions-menu
            style={{
              position: 'fixed',
              top: `${activeMenu.top}px`,
              right: `${activeMenu.right}px`,
              zIndex: 100,
            }}
            className="w-44 bg-surface border border-border rounded-lg shadow-md py-1 text-xs animate-in fade-in-0 zoom-in-95 duration-100"
          >
            <div className="px-2.5 py-1 text-[10.5px] font-semibold text-fg-muted border-b border-border/50 truncate">
              {activeMenu.clientName}
            </div>
            <button
              type="button"
              onClick={() => {
                onOpenClient(activeMenu.clientName, 'table');
                setActiveMenu(null);
              }}
              className="w-full px-2.5 py-1.5 flex items-center gap-2 text-fg hover:bg-hover transition-colors text-left cursor-pointer"
            >
              <Table className="w-3.5 h-3.5 text-fg-muted" />
              <span>Open in Table view</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onOpenClient(activeMenu.clientName, 'pipeline');
                setActiveMenu(null);
              }}
              className="w-full px-2.5 py-1.5 flex items-center gap-2 text-fg hover:bg-hover transition-colors text-left cursor-pointer"
            >
              <Kanban className="w-3.5 h-3.5 text-fg-muted" />
              <span>Open in Pipeline view</span>
            </button>
          </div>,
          document.body
        )}
    </div>
  );
};
