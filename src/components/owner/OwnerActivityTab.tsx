import React, { useState, useMemo } from 'react';
import {
  TableCard,
  TableToolbar,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
  TableSkeletonRows,
} from '@/components/ui/DataTable';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/input';
import { CompanyMark } from './CompanyMark';
import { type Company, type OwnerMember, type OwnerAuditEvent } from '@/services/ownerService';
import { Search, Link2 } from 'lucide-react';

export function formatAuditWhen(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timePart = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(d);
  if (isToday) {
    return `Today, ${timePart}`;
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export function formatAuditSentence(
  event: OwnerAuditEvent,
  companiesMap: Map<string, Company>,
  membersMap: Map<string, OwnerMember>
): { sentence: string; companyName?: string; companyDoc?: Company; secondary?: string } {
  const companyDoc = event.target_company_id ? companiesMap.get(event.target_company_id) : undefined;
  const companyName = companyDoc ? companyDoc.name : event.details?.company_name || 'a company';

  const targetUserId = event.details?.target_user_id || event.details?.user_id;
  const targetMember = targetUserId ? membersMap.get(targetUserId) : undefined;
  const personName = targetMember
    ? targetMember.name
    : event.details?.target_user_email || event.details?.email || 'a member';

  let sentence = '';
  let secondary: string | undefined = undefined;

  switch (event.action) {
    case 'create_company':
      sentence = `Created ${companyName}`;
      if (event.details?.admin_email) {
        secondary = `First admin: ${event.details.admin_email}`;
      }
      break;

    case 'update_company':
      if (event.details?.status === 'suspended') {
        sentence = `Paused ${companyName}`;
      } else if (event.details?.status === 'active') {
        sentence = `Resumed ${companyName}`;
      } else {
        sentence = `Changed details of ${companyName}`;
      }
      break;

    case 'enter_company':
      sentence = `Opened ${companyName} as owner (read-only)`;
      break;

    case 'reset_token_version':
      sentence = `Signed everyone out of ${companyName}`;
      break;

    case 'provision_member':
      sentence = `Added ${personName} to ${companyName}`;
      break;

    case 'grant_company_access':
      sentence = `Gave ${personName} access to ${companyName}`;
      break;

    case 'remove_company_access':
      sentence = `Removed ${personName}'s access to ${companyName}`;
      break;

    case 'set_starting_password':
      sentence = `Set a new starting password for ${personName}`;
      break;

    case 'company_branding_updated':
      sentence = `Updated branding for ${companyName}`;
      break;

    case 'company_logo_uploaded':
      sentence = `Uploaded a logo for ${companyName}`;
      break;

    case 'company_logo_removed':
      sentence = `Removed the logo for ${companyName}`;
      break;

    default:
      sentence = event.action
        ? event.action.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) +
          ` for ${companyName}`
        : `Activity in ${companyName}`;
      break;
  }

  return { sentence, companyName, companyDoc, secondary };
}

export interface OwnerActivityTabProps {
  logs: OwnerAuditEvent[];
  companies: Company[];
  members: OwnerMember[];
  isLoading: boolean;
  onLoadMore?: () => void;
  canLoadMore?: boolean;
  isLoadingMore?: boolean;
}

export const OwnerActivityTab: React.FC<OwnerActivityTabProps> = ({
  logs,
  companies,
  members,
  isLoading,
  onLoadMore,
  canLoadMore = false,
  isLoadingMore = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('all');
  const [dateRange, setDateRange] = useState<'7' | '30' | 'all'>('all');

  const companiesMap = useMemo(() => {
    const map = new Map<string, Company>();
    for (const c of companies) map.set(c.id, c);
    return map;
  }, [companies]);

  const membersMap = useMemo(() => {
    const map = new Map<string, OwnerMember>();
    for (const m of members) map.set(m.id, m);
    return map;
  }, [members]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const now = Date.now();
    const maxAgeMs =
      dateRange === '7'
        ? 7 * 86400000
        : dateRange === '30'
        ? 30 * 86400000
        : Infinity;

    return logs.filter((log) => {
      // Date range filter
      if (maxAgeMs !== Infinity && log.created_at) {
        const t = new Date(log.created_at).getTime();
        if (!isNaN(t) && now - t > maxAgeMs) return false;
      }

      // Company filter
      if (selectedCompanyId !== 'all' && log.target_company_id !== selectedCompanyId) {
        return false;
      }

      // Search query filter
      if (q) {
        const actor = log.actor_user_id ? membersMap.get(log.actor_user_id)?.name || '' : '';
        const comp = log.target_company_id ? companiesMap.get(log.target_company_id)?.name || '' : '';
        const actionStr = (log.action || '').replace(/_/g, ' ');
        const detailsStr = log.details?.email || log.details?.name || '';
        const match =
          actor.toLowerCase().includes(q) ||
          comp.toLowerCase().includes(q) ||
          actionStr.toLowerCase().includes(q) ||
          detailsStr.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [logs, searchQuery, selectedCompanyId, dateRange, companiesMap, membersMap]);

  return (
    <TableCard>
      {/* Toolbar */}
      <TableToolbar>
        <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
          {/* Search */}
          <div className="w-full sm:w-60 relative">
            <Input
              placeholder="Search activity"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={Search}
              inputSize="sm"
              clearable={Boolean(searchQuery)}
              onClear={() => setSearchQuery('')}
            />
          </div>

          {/* Company filter */}
          <select
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
            className="h-8 px-2.5 rounded-md border border-border-strong bg-surface text-fg text-small outline-none hover:border-fg-faint focus:border-ring-border transition-colors cursor-pointer"
          >
            <option value="all">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Date range filter */}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="h-8 px-2.5 rounded-md border border-border-strong bg-surface text-fg text-small outline-none hover:border-fg-faint focus:border-ring-border transition-colors cursor-pointer"
          >
            <option value="all">All time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
        </div>

        {/* Audit link notice */}
        <div className="text-caption text-fg-muted inline-flex items-center gap-1.5 ml-auto">
          <Link2 size={13} className="shrink-0 text-fg-muted" />
          <span>Entries are chained, so edits or deletions can be detected.</span>
        </div>
      </TableToolbar>

      {/* Content */}
      {isLoading ? (
        <Table compact>
          <THead>
            <tr>
              <TH className="w-44">When</TH>
              <TH className="w-48">Who</TH>
              <TH>What happened</TH>
              <TH align="right" className="w-24">Record</TH>
            </tr>
          </THead>
          <TBody>
            <TableSkeletonRows columns={4} rows={6} />
          </TBody>
        </Table>
      ) : filteredLogs.length === 0 ? (
        searchQuery ? (
          <div className="py-12 px-4">
            <EmptyState
              title={`No activity matches "${searchQuery}"`}
              description="Try adjusting your search query or filters."
              action={
                <Button variant="secondary" size="sm" onClick={() => setSearchQuery('')}>
                  Clear search
                </Button>
              }
            />
          </div>
        ) : (
          <div className="py-12 px-4">
            <EmptyState
              title="No owner activity yet"
              description="Actions taken across companies will appear here in chronological order."
            />
          </div>
        )
      ) : (
        <Table compact>
          <THead>
            <tr>
              <TH className="w-44">When</TH>
              <TH className="w-48">Who</TH>
              <TH>What happened</TH>
              <TH align="right" className="w-24">Record</TH>
            </tr>
          </THead>
          <TBody>
            {filteredLogs.map((log) => {
              const actorMember = log.actor_user_id ? membersMap.get(log.actor_user_id) : undefined;
              const actorName = actorMember
                ? actorMember.name
                : log.actor_user_id
                ? 'Unknown person'
                : 'System';

              const { sentence, companyDoc, secondary } = formatAuditSentence(
                log,
                companiesMap,
                membersMap
              );

              const hashShort = log.hash ? log.hash.substring(0, 6) : '—';

              return (
                <TR key={log.id || log.hash} compact>
                  {/* When */}
                  <TD className="whitespace-nowrap text-small text-fg-muted font-numeric">
                    {formatAuditWhen(log.created_at)}
                  </TD>

                  {/* Who */}
                  <TD>
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar name={actorName} size={24} />
                      <span className="text-small font-medium text-fg truncate">
                        {actorName}
                      </span>
                    </div>
                  </TD>

                  {/* What happened */}
                  <TD>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap text-small text-fg">
                        <span>{sentence}</span>
                        {companyDoc && (
                          <span className="inline-flex items-center gap-1.5 pl-1 pr-1.5 py-0.5 rounded-sm bg-subtle text-caption text-fg font-medium">
                            <CompanyMark
                              name={companyDoc.name}
                              logoUrl={companyDoc.logo_url}
                              accentColor={companyDoc.accent_color}
                              size={16}
                              singleLetter
                            />
                            <span className="truncate max-w-[10rem]">{companyDoc.name}</span>
                          </span>
                        )}
                      </div>
                      {secondary && (
                        <div className="text-caption text-fg-muted">{secondary}</div>
                      )}
                    </div>
                  </TD>

                  {/* Record */}
                  <TD align="right">
                    <span
                      className="font-mono text-micro text-fg-faint"
                      title={log.hash ? `Full hash: ${log.hash}` : undefined}
                    >
                      #{hashShort}
                    </span>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border flex items-center justify-between text-caption text-fg-muted flex-wrap gap-2">
        <div>Showing the latest {filteredLogs.length}</div>
        {canLoadMore && (
          <Button
            variant="ghost"
            size="sm"
            loading={isLoadingMore}
            onClick={onLoadMore}
          >
            Load more
          </Button>
        )}
      </div>
    </TableCard>
  );
};
