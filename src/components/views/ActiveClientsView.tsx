import React, { useState, useMemo } from 'react';
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
  CheckCircle2,
} from 'lucide-react';
import type { Workspace } from '../../types';
import type { AdAccount } from '../../types/admin';
import { downloadFileAttachment } from '../../utils/fileUrl';
import { useWorkspaces } from '../../hooks/useWorkspaces';

interface ActiveClientsViewProps {
  workspaces?: Workspace[];
  adAccounts?: AdAccount[];
}

export const ActiveClientsView: React.FC<ActiveClientsViewProps> = ({
  workspaces: propWorkspaces,
  adAccounts = [],
}) => {
  const { workspaces: liveWorkspaces } = useWorkspaces();
  const workspaces = liveWorkspaces && liveWorkspaces.length > 0 ? liveWorkspaces : (propWorkspaces || []);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<
    'All' | 'Retainer' | 'One-Time Project' | 'High Priority' | 'Emergency'
  >('All');

  // Filter only active workspaces
  const activeWorkspaces = useMemo(() => {
    return workspaces.filter((w) => w.status !== 'inactive');
  }, [workspaces]);

  const filteredWorkspaces = useMemo(() => {
    return activeWorkspaces.filter((w) => {
      const q = searchQuery.toLowerCase().trim();

      // Search match across name, POC, project cycle, and services
      const servicesStr = (w.services || []).join(' ').toLowerCase();
      const matchesQuery =
        !q ||
        w.name.toLowerCase().includes(q) ||
        (w.poc_name && w.poc_name.toLowerCase().includes(q)) ||
        (w.poc_email && w.poc_email.toLowerCase().includes(q)) ||
        (w.poc_phone && w.poc_phone.toLowerCase().includes(q)) ||
        (w.project_cycle && w.project_cycle.toLowerCase().includes(q)) ||
        servicesStr.includes(q);

      // Filter match
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

  const getHealthBadge = (health?: string) => {
    switch (health) {
      case 'Emergency':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse">
            <ShieldAlert className="w-3 h-3 text-rose-500" />
            <span>Emergency</span>
          </span>
        );
      case 'Moderate':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            <HeartPulse className="w-3 h-3 text-amber-500" />
            <span>Moderate</span>
          </span>
        );
      case 'Excellent':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <HeartPulse className="w-3 h-3 text-emerald-500" />
            <span>Excellent</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
            <HeartPulse className="w-3 h-3 text-blue-500" />
            <span>Good</span>
          </span>
        );
    }
  };

  const getPriorityBadge = (priority?: string) => {
    switch (priority) {
      case 'High':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 whitespace-nowrap shrink-0">
            <Flame className="w-3 h-3 text-rose-500 shrink-0" />
            <span>High Priority</span>
          </span>
        );
      case 'Low':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 whitespace-nowrap shrink-0">
            <Sparkles className="w-3 h-3 text-sky-500 shrink-0" />
            <span>Low Priority</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 whitespace-nowrap shrink-0">
            <Flame className="w-3 h-3 text-amber-500 shrink-0" />
            <span>Medium Priority</span>
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-zinc-50/50 dark:bg-[#0c0d12]">
      {/* Header Bar */}
      <div className="p-5 border-b border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#10121a] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-bold text-zinc-950 dark:text-zinc-50">Active Clients</h1>
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                {filteredWorkspaces.length} {filteredWorkspaces.length === 1 ? 'client' : 'clients'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
              Overview of active client accounts, contract timelines, services scope, POC contacts, and proposals
            </p>
          </div>
        </div>
      </div>

      {/* Controls & Quick Filter Tabs */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800/80 bg-white/70 dark:bg-[#10121a]/70 backdrop-blur-sm flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-md w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search active clients by name, services, POC details..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none text-zinc-900 dark:text-zinc-100 transition-all"
          />
        </div>

        {/* Quick Filter Tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              'All',
              'Retainer',
              'One-Time Project',
              'High Priority',
              'Emergency',
            ] as const
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
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : tab === 'High Priority'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                {tab === 'All' ? 'All Active' : tab}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid of Active Workspace Cards */}
      <div className="flex-1 overflow-y-auto p-5">
        {filteredWorkspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 mb-3">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">No active clients found</h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm">
              {searchQuery || activeFilter !== 'All'
                ? 'Try adjusting your search query or filter.'
                : 'No active client workspaces are currently registered.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredWorkspaces.map((ws) => {
              const linkedCount = adAccounts.filter((a) => a.workspace_id === ws.id).length;

              return (
                <div
                  key={ws.id}
                  className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-3xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-4">
                    {/* Top Row: Avatar + Name + Status & Health Badges */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-11 h-11 rounded-2xl text-white flex items-center justify-center font-black text-sm shadow-xs shrink-0 transition-colors"
                          style={{
                            backgroundColor: ws.brandColor?.startsWith('#')
                              ? ws.brandColor
                              : ws.brandColor?.startsWith('bg-')
                              ? undefined
                              : '#4f46e5',
                          }}
                        >
                          <span className={ws.brandColor?.startsWith('bg-') ? ws.brandColor : ''}>
                            {ws.initials || ws.name.substring(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                              {ws.name}
                            </h3>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                              {ws.project_cycle || 'Retainer'}
                            </span>
                            <span className="text-zinc-300 dark:text-zinc-700">•</span>
                            {getPriorityBadge(ws.priority)}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {getHealthBadge(ws.health)}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          <span>Active</span>
                        </span>
                      </div>
                    </div>

                    {/* Contract Timeline */}
                    {(ws.contract_start_date || ws.contract_end_date) && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800/80 text-[11px] text-zinc-600 dark:text-zinc-400">
                        <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">Contract:</span>
                        <span>{ws.contract_start_date || 'Start'}</span>
                        <span>→</span>
                        <span>{ws.contract_end_date || 'Ongoing'}</span>
                      </div>
                    )}

                    {/* Services Tags */}
                    {ws.services && ws.services.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          Services Scope
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {ws.services.map((service) => (
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

                    {/* Proposal Document Download Chip */}
                    {ws.proposal_url && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            downloadFileAttachment(
                              ws.proposal_url!,
                              ws.proposal_name || `${ws.name}_Proposal`
                            )
                          }
                          className="w-full flex items-center justify-between p-2.5 rounded-2xl bg-indigo-50/70 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:hover:bg-indigo-900/50 border border-indigo-200/70 dark:border-indigo-800/70 text-xs font-semibold text-indigo-700 dark:text-indigo-300 transition cursor-pointer group/proposal"
                          title="Click to Download Proposal Attachment"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Paperclip className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span className="truncate">{ws.proposal_name || 'Client Proposal Document'}</span>
                          </div>
                          <Download className="w-3.5 h-3.5 text-indigo-500 shrink-0 group-hover/proposal:translate-y-0.5 transition-transform" />
                        </button>
                      </div>
                    )}

                    {/* Point of Contact (POC) Info Box */}
                    {(ws.poc_name || ws.poc_email || ws.poc_phone) && (
                      <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 space-y-1.5 text-xs">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                          <User className="w-3 h-3 text-indigo-500" />
                          <span>POC Details</span>
                        </span>

                        {ws.poc_name && (
                          <p className="font-bold text-zinc-900 dark:text-zinc-100 text-xs truncate">
                            {ws.poc_name}
                          </p>
                        )}

                        <div className="flex items-center gap-3 flex-wrap text-[11px]">
                          {ws.poc_email && (
                            <a
                              href={`mailto:${ws.poc_email}`}
                              className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 truncate max-w-[170px]"
                              title={ws.poc_email}
                            >
                              <Mail className="w-3 h-3 shrink-0" />
                              <span className="truncate">{ws.poc_email}</span>
                            </a>
                          )}
                          {ws.poc_phone && (
                            <a
                              href={`tel:${ws.poc_phone}`}
                              className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 flex items-center gap-1"
                              title={ws.poc_phone}
                            >
                              <Phone className="w-3 h-3 shrink-0 text-emerald-500" />
                              <span>{ws.poc_phone}</span>
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Linked Ads (Read-Only) */}
                  <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/90 text-zinc-600 dark:text-zinc-300 border border-zinc-200/70 dark:border-zinc-700/70">
                      <Layers className="w-3.5 h-3.5 text-indigo-500" />
                      <span>{linkedCount} {linkedCount === 1 ? 'Ad Account' : 'Ad Accounts'}</span>
                    </span>

                    <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">
                      View Only
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
