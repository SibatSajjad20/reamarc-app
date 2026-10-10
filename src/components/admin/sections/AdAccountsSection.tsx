import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  KeyRound,
} from 'lucide-react';
import type { AdAccount } from '../../../types/admin';
import type { Workspace } from '../../../types';
import { PageHeader } from '../../ui/PageHeader';
import { Button, IconButton } from '../../ui/button';
import { StatusPill } from '../../ui/StatusPill';
import { MetaIcon, GoogleAdsIcon } from '../../ui/brand-icons';
import {
  TableCard,
  TableToolbar,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
  TableEmptyRow,
} from '../../ui/DataTable';

interface AdAccountsSectionProps {
  adAccounts: AdAccount[];
  workspaces: Workspace[];
  onAddAccount: () => void;
  onEditAccount: (acc: AdAccount) => void;
  onDeleteAccount: (acc: AdAccount) => void;
  onOpenCredentials?: (acc: AdAccount) => void;
  canManageAdAccounts?: boolean;
}

export const AdAccountsSection: React.FC<AdAccountsSectionProps> = ({
  adAccounts,
  workspaces: _workspaces,
  onAddAccount,
  onEditAccount,
  onDeleteAccount,
  onOpenCredentials,
  canManageAdAccounts = true,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState<'all' | 'meta' | 'google'>('all');

  const filteredAccounts = useMemo(() => {
    return adAccounts.filter((acc) => {
      const q = searchQuery.toLowerCase().trim();

      const matchesQuery =
        !q ||
        acc.name.toLowerCase().includes(q) ||
        acc.platform.toLowerCase().includes(q) ||
        acc.account_id.toLowerCase().includes(q) ||
        (acc.pixel_id && acc.pixel_id.toLowerCase().includes(q));

      const pLower = (acc.platform || '').toLowerCase();
      let matchesPlatform = true;
      if (selectedPlatformFilter === 'meta') {
        matchesPlatform = pLower.includes('meta') || pLower.includes('facebook') || pLower.includes('instagram');
      } else if (selectedPlatformFilter === 'google') {
        matchesPlatform = pLower.includes('google');
      }

      return matchesQuery && matchesPlatform;
    });
  }, [adAccounts, searchQuery, selectedPlatformFilter]);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="Ad accounts"
        description="Meta Ads and Google Ads connections linked to client workspaces."
        actions={
          canManageAdAccounts && (
            <Button
              variant="primary"
              size="sm"
              onClick={onAddAccount}
              icon={Plus}
            >
              Connect ad account
            </Button>
          )
        }
      />

      {/* Table Card */}
      <TableCard>
        {/* Toolbar */}
        <TableToolbar className="flex-wrap gap-3">
          <div className="relative min-w-[240px] max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search ad accounts by name, account ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface border border-border rounded-md text-fg placeholder:text-fg-muted focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {[
              { id: 'all' as const, label: 'All platforms' },
              { id: 'meta' as const, label: 'Meta Ads' },
              { id: 'google' as const, label: 'Google Ads' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlatformFilter(p.id)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer font-medium ${
                  selectedPlatformFilter === p.id
                    ? 'bg-accent-soft text-accent-text font-semibold'
                    : 'text-fg-muted hover:text-fg hover:bg-hover'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="ml-auto text-caption text-fg-muted tabular-nums">
            {filteredAccounts.length} of {adAccounts.length}
          </div>
        </TableToolbar>

        {/* DataTable */}
        <Table>
          <THead>
            <TR>
              <TH>Platform & Account</TH>
              <TH>Account ID</TH>
              <TH>Connection status</TH>
              <TH>Currency</TH>
              <TH>Last sync</TH>
              {canManageAdAccounts && <TH align="right" className="w-24">Actions</TH>}
            </TR>
          </THead>
          <TBody>
            {filteredAccounts.length === 0 ? (
              <TableEmptyRow
                colSpan={canManageAdAccounts ? 6 : 5}
                title="No ad accounts yet"
                description={
                  searchQuery || selectedPlatformFilter !== 'all'
                    ? 'No accounts match your search or filter.'
                    : 'Connect an advertising account to link metrics with your client workspaces.'
                }
              />
            ) : (
              filteredAccounts.map((acc) => {
                const isMeta =
                  acc.platform.toLowerCase().includes('meta') ||
                  acc.platform.toLowerCase().includes('facebook');

                return (
                  <TR key={acc.id} className="hover:bg-hover transition-colors">
                    {/* Platform Brand Icon + Name */}
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-md bg-subtle border border-border flex items-center justify-center shrink-0 text-fg">
                          {isMeta ? (
                            <MetaIcon size={16} variant="brand" />
                          ) : (
                            <GoogleAdsIcon size={16} variant="brand" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-fg truncate">
                            {acc.name}
                          </div>
                          <div className="text-caption text-fg-muted">
                            {acc.platform}
                          </div>
                        </div>
                      </div>
                    </TD>

                    {/* Account ID (Mono) */}
                    <TD className="font-mono text-caption text-fg-muted">
                      {acc.account_id}
                    </TD>

                    {/* Connection Status Pill */}
                    <TD>
                      <StatusPill
                        variant={acc.status === 'active' ? 'success' : acc.status === 'paused' ? 'warning' : 'neutral'}
                        label={acc.status === 'active' ? 'Connected' : acc.status === 'paused' ? 'Needs attention' : 'Disconnected'}
                        dot
                      />
                    </TD>

                    {/* Currency */}
                    <TD className="font-mono text-caption text-fg-muted">
                      {acc.currency || 'USD'}
                    </TD>

                    {/* Last Sync */}
                    <TD className="text-caption text-fg-muted tabular-nums">
                      {acc.created_at ? new Date(acc.created_at).toLocaleDateString() : '—'}
                    </TD>

                    {/* Actions */}
                    {canManageAdAccounts && (
                      <TD align="right">
                        <div className="flex items-center justify-end gap-1">
                          {onOpenCredentials && (
                            <IconButton
                              variant="ghost"
                              size="sm"
                              label="API credentials & verification"
                              icon={KeyRound}
                              onClick={() => onOpenCredentials(acc)}
                            />
                          )}
                          <IconButton
                            variant="ghost"
                            size="sm"
                            label={`Edit ${acc.name}`}
                            icon={Edit2}
                            onClick={() => onEditAccount(acc)}
                          />
                          <IconButton
                            variant="ghost"
                            size="sm"
                            label={`Delete ${acc.name}`}
                            icon={Trash2}
                            onClick={() => onDeleteAccount(acc)}
                          />
                        </div>
                      </TD>
                    )}
                  </TR>
                );
              })
            )}
          </TBody>
        </Table>
      </TableCard>
    </div>
  );
};
