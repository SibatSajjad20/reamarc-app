import React, { useState, useMemo } from 'react';
import {
  Briefcase,
  Plus,
  Search,
  Edit2,
  Trash2,
  Building2,
  Layers,
} from 'lucide-react';
import type { AdAccount } from '../../../types/admin';
import type { Workspace } from '../../../types';

interface AdAccountsSectionProps {
  adAccounts: AdAccount[];
  workspaces: Workspace[];
  onAddAccount: () => void;
  onEditAccount: (acc: AdAccount) => void;
  onDeleteAccount: (acc: AdAccount) => void;
  canManageAdAccounts?: boolean;
}

export const AdAccountsSection: React.FC<AdAccountsSectionProps> = ({
  adAccounts,
  workspaces,
  onAddAccount,
  onEditAccount,
  onDeleteAccount,
  canManageAdAccounts = true,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState<'All' | 'Meta Ads' | 'Google Ads'>('All');

  // Build a fast lookup map for workspace names
  const workspaceMap = useMemo(() => {
    const map: Record<string, string> = {};
    workspaces.forEach((w) => {
      map[w.id] = w.name;
    });
    return map;
  }, [workspaces]);

  const filteredAccounts = useMemo(() => {
    return adAccounts.filter((acc) => {
      const q = searchQuery.toLowerCase().trim();
      const wsName = (acc.workspace_name || workspaceMap[acc.workspace_id || ''] || '').toLowerCase();

      const matchesQuery =
        !q ||
        acc.name.toLowerCase().includes(q) ||
        acc.platform.toLowerCase().includes(q) ||
        acc.account_id.toLowerCase().includes(q) ||
        (acc.pixel_id && acc.pixel_id.toLowerCase().includes(q)) ||
        wsName.includes(q);

      const pLower = (acc.platform || '').toLowerCase();
      let matchesPlatform = true;
      if (selectedPlatformFilter === 'Meta Ads') {
        matchesPlatform = pLower.includes('meta') || pLower.includes('facebook') || pLower.includes('instagram');
      } else if (selectedPlatformFilter === 'Google Ads') {
        matchesPlatform = pLower.includes('google');
      }

      return matchesQuery && matchesPlatform;
    });
  }, [adAccounts, searchQuery, selectedPlatformFilter, workspaceMap]);

  const getPlatformBadge = (platform: string) => {
    const p = platform.toLowerCase();
    if (p.includes('google')) {
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    }
    return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-zinc-50/50 dark:bg-[#0c0d12]">
      {/* Header */}
      <div className="p-5 border-b border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#10121a] flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-base font-bold text-zinc-950 dark:text-zinc-50">Advertising Accounts</h1>
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
              {filteredAccounts.length} {filteredAccounts.length === 1 ? 'account' : 'accounts'}
            </span>
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
            Meta Ads & Google Ads configuration linked to agency workspaces
          </p>
        </div>

        {canManageAdAccounts && (
          <button
            type="button"
            onClick={onAddAccount}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-indigo-600/20 hover:shadow-indigo-600/30 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer select-none"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Connect Ad Account</span>
          </button>
        )}
      </div>

      {/* Controls & Quick Filter Tabs */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800/80 bg-white/70 dark:bg-[#10121a]/70 backdrop-blur-sm flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-md w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search accounts by name, account ID, pixel, workspace..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none text-zinc-900 dark:text-zinc-100 transition-all"
          />
        </div>

        {/* Quick Platform Filter Tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['All', 'Meta Ads', 'Google Ads'] as const).map((p) => {
            const isSelected = selectedPlatformFilter === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setSelectedPlatformFilter(p)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isSelected
                    ? p === 'Google Ads'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : p === 'Meta Ads'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid of Ad Account Cards */}
      <div className="flex-1 overflow-y-auto p-5">
        {filteredAccounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 mb-3">
              <Briefcase className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">No ad accounts found</h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm">
              {searchQuery || selectedPlatformFilter !== 'All'
                ? 'Try adjusting your search or platform filter.'
                : 'Connect your first Meta Ads or Google Ads Account.'}
            </p>
            {canManageAdAccounts && !searchQuery && selectedPlatformFilter === 'All' && (
              <button
                type="button"
                onClick={onAddAccount}
                className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Connect Ad Account</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredAccounts.map((acc) => {
              const associatedWorkspaceName =
                acc.workspace_name || workspaceMap[acc.workspace_id || ''];
              const isGoogle = (acc.platform || '').toLowerCase().includes('google');

              return (
                <div
                  key={acc.id}
                  className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 transition-all space-y-4 flex flex-col justify-between"
                >
                  {/* Card Header */}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-bold rounded-lg border ${getPlatformBadge(
                          acc.platform
                        )}`}
                      >
                        <Layers className="w-3 h-3" />
                        <span>{isGoogle ? 'Google Ads' : 'Meta Ads'}</span>
                      </span>

                      <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/80 px-2 py-0.5 rounded-md">
                        {acc.currency || 'USD'}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                        {acc.name}
                      </h3>
                      <p className="text-xs text-zinc-400 font-numeric mt-0.5 truncate">
                        ID: {acc.account_id}
                      </p>
                    </div>
                  </div>

                  {/* Details / Association Box */}
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400 text-[11px] flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-indigo-500" />
                        <span>Associated Workspace:</span>
                      </span>
                      {associatedWorkspaceName ? (
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20 text-[11px] truncate max-w-[140px]">
                          {associatedWorkspaceName}
                        </span>
                      ) : (
                        <span className="font-semibold text-zinc-400 text-[11px] italic">
                          Standalone / Unassigned
                        </span>
                      )}
                    </div>

                    {acc.pixel_id && (
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400 text-[11px]">Pixel ID:</span>
                        <span className="font-numeric font-semibold text-zinc-700 dark:text-zinc-300 text-[11px]">
                          {acc.pixel_id}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions Footer */}
                  {canManageAdAccounts && (
                    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onEditAccount(acc)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-bold transition cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Edit & Credentials</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteAccount(acc)}
                        className="p-1.5 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition cursor-pointer"
                        title="Delete Ad Account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

