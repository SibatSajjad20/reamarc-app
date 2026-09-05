import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Search,
  Layers,
  HeartPulse,
  Flame,
  Calendar,
  Paperclip,
  Download,
  User,
  Mail,
  Phone,
  ShieldAlert,
  Sparkles,
  X,
  ChevronRight,
} from 'lucide-react';
import type { Workspace } from '../../types';
import type { AdAccount } from '../../types/admin';
import { downloadFileAttachment } from '../../utils/fileUrl';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { LoadingScreen } from '../ui/LoadingScreen';

interface ActiveClientsViewProps {
  workspaces?: Workspace[];
  adAccounts?: AdAccount[];
}

type ClientFilter = 'All' | 'Retainer' | 'One-Time Project' | 'High Priority' | 'Emergency';

function avatarStyle(ws: Workspace): React.CSSProperties | undefined {
  if (ws.brandColor?.startsWith('#')) return { backgroundColor: ws.brandColor };
  if (ws.brandColor?.startsWith('bg-')) return undefined;
  return { backgroundColor: '#4f46e5' };
}

function Avatar({ ws, size = 'md' }: { ws: Workspace; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-9 h-9 text-xs rounded-xl' : 'w-10 h-10 text-sm rounded-2xl';
  return (
    <div
      className={`${dim} text-white flex items-center justify-center font-black shrink-0`}
      style={avatarStyle(ws)}
    >
      <span className={ws.brandColor?.startsWith('bg-') ? ws.brandColor : ''}>
        {ws.initials || ws.name.substring(0, 2).toUpperCase()}
      </span>
    </div>
  );
}

function HealthBadge({ health }: { health?: string }) {
  switch (health) {
    case 'Emergency':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse whitespace-nowrap">
          <ShieldAlert className="w-3 h-3 text-rose-500" />
          Emergency
        </span>
      );
    case 'Moderate':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 whitespace-nowrap">
          <HeartPulse className="w-3 h-3 text-amber-500" />
          Moderate
        </span>
      );
    case 'Excellent':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
          <HeartPulse className="w-3 h-3 text-emerald-500" />
          Excellent
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 whitespace-nowrap">
          <HeartPulse className="w-3 h-3 text-blue-500" />
          Good
        </span>
      );
  }
}

function PriorityBadge({ priority }: { priority?: string }) {
  switch (priority) {
    case 'High':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 whitespace-nowrap">
          <Flame className="w-3 h-3 text-rose-500 shrink-0" />
          High
        </span>
      );
    case 'Low':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 whitespace-nowrap">
          <Sparkles className="w-3 h-3 text-sky-500 shrink-0" />
          Low
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 whitespace-nowrap">
          <Flame className="w-3 h-3 text-amber-500 shrink-0" />
          Medium
        </span>
      );
  }
}

export const ActiveClientsView: React.FC<ActiveClientsViewProps> = ({
  workspaces: propWorkspaces,
  adAccounts = [],
}) => {
  const { workspaces: liveWorkspaces, isLoading } = useWorkspaces();
  const workspaces = useMemo(
    () => (liveWorkspaces && liveWorkspaces.length > 0 ? liveWorkspaces : propWorkspaces || []),
    [liveWorkspaces, propWorkspaces]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<ClientFilter>('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeWorkspaces = useMemo(
    () => workspaces.filter((w) => w.status !== 'inactive'),
    [workspaces]
  );

  const filteredWorkspaces = useMemo(() => {
    return activeWorkspaces.filter((w) => {
      const q = searchQuery.toLowerCase().trim();
      const servicesStr = (w.services || []).join(' ').toLowerCase();
      const matchesQuery =
        !q ||
        w.name.toLowerCase().includes(q) ||
        (w.poc_name && w.poc_name.toLowerCase().includes(q)) ||
        (w.poc_email && w.poc_email.toLowerCase().includes(q)) ||
        (w.poc_phone && w.poc_phone.toLowerCase().includes(q)) ||
        (w.project_cycle && w.project_cycle.toLowerCase().includes(q)) ||
        servicesStr.includes(q);

      let matchesFilter = true;
      if (activeFilter === 'Retainer') {
        matchesFilter = (w.project_cycle || 'Retainer') === 'Retainer';
      } else if (activeFilter === 'One-Time Project') {
        matchesFilter = w.project_cycle === 'One-Time Project';
      } else if (activeFilter === 'High Priority') {
        matchesFilter = w.priority === 'High';
      } else if (activeFilter === 'Emergency') {
        matchesFilter = w.health === 'Emergency';
      }

      return matchesQuery && matchesFilter;
    });
  }, [activeWorkspaces, searchQuery, activeFilter]);

  const selectedClient = useMemo(
    () => (selectedId ? activeWorkspaces.find((w) => w.id === selectedId) ?? null : null),
    [selectedId, activeWorkspaces]
  );

  const selectedAdCount = useMemo(() => {
    if (!selectedClient) return 0;
    return adAccounts.filter((a) => a.workspace_id === selectedClient.id).length;
  }, [adAccounts, selectedClient]);

  // Close drawer if selected client disappears from the active set
  useEffect(() => {
    if (selectedId && !activeWorkspaces.some((w) => w.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, activeWorkspaces]);

  useEffect(() => {
    if (!selectedClient) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedClient]);

  const linkedCountFor = (wsId: string) =>
    adAccounts.filter((a) => a.workspace_id === wsId).length;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-zinc-50/50 dark:bg-[#0c0d12]">
      {/* Header */}
      <div className="p-5 border-b border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#10121a]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-bold text-zinc-950 dark:text-zinc-50">Active Clients</h1>
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                {filteredWorkspaces.length}{' '}
                {filteredWorkspaces.length === 1 ? 'client' : 'clients'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
              Scan accounts quickly — open a row for contracts, services, POC, and proposals
            </p>
          </div>
        </div>
      </div>

      {/* Search + filters */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800/80 bg-white/70 dark:bg-[#10121a]/70 backdrop-blur-sm flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-md w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by name, services, or POC..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none text-zinc-900 dark:text-zinc-100 transition-all"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            ['All', 'Retainer', 'One-Time Project', 'High Priority', 'Emergency'] as const
          ).map((tab) => {
            const isSelected = activeFilter === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveFilter(tab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isSelected
                    ? tab === 'Emergency'
                      ? 'bg-rose-600 text-white'
                      : tab === 'High Priority'
                        ? 'bg-amber-600 text-white'
                        : 'bg-indigo-600 text-white'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                {tab === 'All' ? 'All Active' : tab}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {isLoading && workspaces.length === 0 ? (
          <LoadingScreen message="Loading active client accounts..." size={72} />
        ) : filteredWorkspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 mb-3">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              No active clients found
            </h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm">
              {searchQuery || activeFilter !== 'All'
                ? 'Try adjusting your search query or filter.'
                : 'No active client workspaces are currently registered.'}
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
            {/* Column headers — desktop */}
            <div className="hidden md:grid grid-cols-[minmax(0,1.6fr)_100px_110px_minmax(0,1fr)_88px_28px] gap-3 px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/80 dark:bg-zinc-900/40 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              <span>Client</span>
              <span>Health</span>
              <span>Cycle</span>
              <span>POC</span>
              <span className="text-right">Services</span>
              <span />
            </div>

            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {filteredWorkspaces.map((ws) => {
                const serviceCount = ws.services?.length ?? 0;
                const isOpen = selectedId === ws.id;
                const ads = linkedCountFor(ws.id);

                return (
                  <li key={ws.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(ws.id)}
                      aria-pressed={isOpen}
                      className={`w-full text-left px-4 py-3.5 transition cursor-pointer group ${
                        isOpen
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/25'
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/50'
                      }`}
                    >
                      {/* Mobile stacked row */}
                      <div className="md:hidden flex items-start gap-3">
                        <Avatar ws={ws} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                              {ws.name}
                            </h3>
                            <HealthBadge health={ws.health} />
                          </div>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                            {ws.project_cycle || 'Retainer'}
                            {ws.poc_name ? ` · ${ws.poc_name}` : ''}
                            {serviceCount > 0
                              ? ` · ${serviceCount} service${serviceCount === 1 ? '' : 's'}`
                              : ''}
                            {ads > 0 ? ` · ${ads} ads` : ''}
                          </p>
                        </div>
                        <ChevronRight
                          className={`w-4 h-4 text-zinc-300 dark:text-zinc-600 shrink-0 mt-1 transition ${
                            isOpen ? 'text-indigo-500' : 'group-hover:text-zinc-400'
                          }`}
                        />
                      </div>

                      {/* Desktop columns */}
                      <div className="hidden md:grid grid-cols-[minmax(0,1.6fr)_100px_110px_minmax(0,1fr)_88px_28px] gap-3 items-center">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar ws={ws} size="sm" />
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                              {ws.name}
                            </h3>
                            {ads > 0 && (
                              <p className="text-[10px] font-semibold text-zinc-400 mt-0.5 flex items-center gap-1">
                                <Layers className="w-3 h-3 text-indigo-500" />
                                {ads} ad{ads === 1 ? '' : 's'}
                              </p>
                            )}
                          </div>
                        </div>

                        <div>
                          <HealthBadge health={ws.health} />
                        </div>

                        <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 truncate">
                          {ws.project_cycle || 'Retainer'}
                        </span>

                        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 truncate">
                          {ws.poc_name || '—'}
                        </span>

                        <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 text-right tabular-nums">
                          {serviceCount > 0
                            ? `${serviceCount} service${serviceCount === 1 ? '' : 's'}`
                            : '—'}
                        </span>

                        <ChevronRight
                          className={`w-4 h-4 justify-self-end transition ${
                            isOpen
                              ? 'text-indigo-500'
                              : 'text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-400'
                          }`}
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selectedClient && (
        <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setSelectedId(null)}
            aria-hidden="true"
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-white dark:bg-[#11131a] border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
              {/* Drawer header */}
              <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar ws={selectedClient} />
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                      {selectedClient.name}
                    </h2>
                    <p className="text-xs text-zinc-400 truncate mt-0.5">
                      {selectedClient.project_cycle || 'Retainer'}
                      {selectedClient.industry ? ` · ${selectedClient.industry}` : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer shrink-0"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
                {/* Status signals */}
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        Health
                      </p>
                      <HealthBadge health={selectedClient.health} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        Priority
                      </p>
                      <PriorityBadge priority={selectedClient.priority} />
                    </div>
                  </div>
                </div>

                {/* Contract */}
                {(selectedClient.contract_start_date || selectedClient.contract_end_date) && (
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200 dark:border-zinc-800 space-y-2">
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                      Contract
                    </h3>
                    <p className="text-[12px] text-zinc-600 dark:text-zinc-300 font-medium">
                      {selectedClient.contract_start_date || 'Start'} →{' '}
                      {selectedClient.contract_end_date || 'Ongoing'}
                    </p>
                  </div>
                )}

                {/* Services */}
                {selectedClient.services && selectedClient.services.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      Services ({selectedClient.services.length})
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedClient.services.map((service) => (
                        <span
                          key={service}
                          className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60"
                        >
                          {service}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Proposal */}
                {selectedClient.proposal_url && (
                  <button
                    type="button"
                    onClick={() =>
                      downloadFileAttachment(
                        selectedClient.proposal_url!,
                        selectedClient.proposal_name || `${selectedClient.name}_Proposal`
                      )
                    }
                    className="w-full flex items-center justify-between p-3 rounded-2xl bg-indigo-50/70 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:hover:bg-indigo-900/50 border border-indigo-200/70 dark:border-indigo-800/70 text-xs font-semibold text-indigo-700 dark:text-indigo-300 transition cursor-pointer group/proposal"
                    title="Download proposal"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span className="truncate">
                        {selectedClient.proposal_name || 'Client Proposal Document'}
                      </span>
                    </div>
                    <Download className="w-3.5 h-3.5 text-indigo-500 shrink-0 group-hover/proposal:translate-y-0.5 transition-transform" />
                  </button>
                )}

                {/* POC */}
                {(selectedClient.poc_name ||
                  selectedClient.poc_email ||
                  selectedClient.poc_phone) && (
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200 dark:border-zinc-800 space-y-2.5">
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-indigo-500" />
                      Point of contact
                    </h3>
                    {selectedClient.poc_name && (
                      <p className="font-bold text-zinc-900 dark:text-zinc-100 text-[12px]">
                        {selectedClient.poc_name}
                      </p>
                    )}
                    <div className="flex flex-col gap-1.5">
                      {selectedClient.poc_email && (
                        <a
                          href={`mailto:${selectedClient.poc_email}`}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1.5 truncate"
                          title={selectedClient.poc_email}
                        >
                          <Mail className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{selectedClient.poc_email}</span>
                        </a>
                      )}
                      {selectedClient.poc_phone && (
                        <a
                          href={`tel:${selectedClient.poc_phone}`}
                          className="text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center gap-1.5"
                          title={selectedClient.poc_phone}
                        >
                          <Phone className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                          <span>{selectedClient.poc_phone}</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Ad accounts */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800/80">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/90 text-zinc-600 dark:text-zinc-300 border border-zinc-200/70 dark:border-zinc-700/70">
                    <Layers className="w-3.5 h-3.5 text-indigo-500" />
                    {selectedAdCount}{' '}
                    {selectedAdCount === 1 ? 'Ad Account' : 'Ad Accounts'}
                  </span>
                  {selectedClient.tagline && (
                    <span className="text-[10px] text-zinc-400 truncate max-w-[55%]">
                      {selectedClient.tagline}
                    </span>
                  )}
                </div>

                {selectedClient.description && (
                  <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {selectedClient.description}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
