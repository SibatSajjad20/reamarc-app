import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Edit2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { Workspace } from '../../../types';
import type { AdAccount, AdminMember } from '../../../types/admin';
import { PageHeader } from '../../ui/PageHeader';
import { Button, IconButton } from '../../ui/button';
import { StatusPill } from '../../ui/StatusPill';
import { HealthBadge, PriorityBadge } from '../../ui/WorkspaceBadges';
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

interface WorkspacesSectionProps {
  workspaces: Workspace[];
  members?: AdminMember[];
  adAccounts?: AdAccount[];
  onAddWorkspace: () => void;
  onEditWorkspace: (workspace: Workspace) => void;
  onToggleStatus?: (workspace: Workspace) => void;
  canManageWorkspaces?: boolean;
}

export const WorkspacesSection: React.FC<WorkspacesSectionProps> = ({
  workspaces,
  members = [],
  adAccounts = [],
  onAddWorkspace,
  onEditWorkspace,
  onToggleStatus,
  canManageWorkspaces = true,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Ad accounts lookup by workspace id
  const adAccountsCountByWorkspace = useMemo(() => {
    const map: Record<string, number> = {};
    adAccounts.forEach((acc) => {
      if (acc.workspace_id) {
        map[acc.workspace_id] = (map[acc.workspace_id] || 0) + 1;
      }
    });
    return map;
  }, [adAccounts]);

  const filteredWorkspaces = useMemo(() => {
    return workspaces.filter((w) => {
      const q = searchQuery.toLowerCase().trim();
      const servicesStr = (w.services || []).join(' ').toLowerCase();

      const matchesSearch =
        !q ||
        w.name.toLowerCase().includes(q) ||
        (w.poc_name && w.poc_name.toLowerCase().includes(q)) ||
        (w.poc_email && w.poc_email.toLowerCase().includes(q)) ||
        (w.project_cycle && w.project_cycle.toLowerCase().includes(q)) ||
        servicesStr.includes(q);

      const isInactive = w.status === 'inactive';
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && !isInactive) ||
        (statusFilter === 'inactive' && isInactive);

      return matchesSearch && matchesStatus;
    });
  }, [workspaces, searchQuery, statusFilter]);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto p-6 space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Client workspaces"
        description="Manage client lifecycle, services scope, contract timelines, and account health."
        actions={
          canManageWorkspaces && (
            <Button
              variant="primary"
              size="sm"
              onClick={onAddWorkspace}
              icon={Plus}
            >
              Add workspace
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
              placeholder="Search workspaces by client name, POC..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface border border-border rounded-md text-fg placeholder:text-fg-muted focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {(['all', 'active', 'inactive'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors capitalize cursor-pointer font-medium ${
                  statusFilter === filter
                    ? 'bg-accent-soft text-accent-text font-semibold'
                    : 'text-fg-muted hover:text-fg hover:bg-hover'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="ml-auto text-caption text-fg-muted tabular-nums">
            {filteredWorkspaces.length} of {workspaces.length}
          </div>
        </TableToolbar>

        {/* DataTable */}
        <Table>
          <THead>
            <TR>
              <TH>Workspace</TH>
              <TH>Industry / Scope</TH>
              <TH>Engagement</TH>
              <TH>Health & Priority</TH>
              <TH>Members</TH>
              <TH>Ad accounts</TH>
              <TH>Status</TH>
              {canManageWorkspaces && <TH align="right" className="w-20">Actions</TH>}
            </TR>
          </THead>
          <TBody>
            {filteredWorkspaces.length === 0 ? (
              <TableEmptyRow
                colSpan={canManageWorkspaces ? 8 : 7}
                title="No workspaces yet"
                description={
                  searchQuery || statusFilter !== 'all'
                    ? 'No workspaces match your search or filter.'
                    : 'Get started by creating your first client workspace profile.'
                }
              />
            ) : (
              filteredWorkspaces.map((ws) => {
                const isInactive = ws.status === 'inactive';
                const adCount = adAccountsCountByWorkspace[ws.id] || 0;
                const membersCount = members.filter((m) => (m.workspace_ids || []).includes(ws.id)).length;
                const initials = ws.initials || ws.name.slice(0, 2).toUpperCase();
                const brandColor = ws.brandColor?.startsWith('#') ? ws.brandColor : '#6847E0';

                return (
                  <TR key={ws.id} className="hover:bg-hover transition-colors">
                    {/* ClientMark + Name */}
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-md flex items-center justify-center font-semibold text-xs text-white shadow-xs shrink-0"
                          style={{ backgroundColor: brandColor }}
                        >
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-fg truncate">
                            {ws.name}
                          </div>
                          {ws.poc_name && (
                            <div className="text-caption text-fg-muted truncate">
                              {ws.poc_name} {ws.poc_email ? `• ${ws.poc_email}` : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    </TD>

                    {/* Industry / Services */}
                    <TD>
                      {ws.services && ws.services.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {ws.services.slice(0, 2).map((s) => (
                            <span
                              key={s}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs border border-border bg-surface text-fg-muted"
                            >
                              {s}
                            </span>
                          ))}
                          {ws.services.length > 2 && (
                            <span className="text-[10px] text-fg-faint self-center">
                              +{ws.services.length - 2}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-fg-muted text-caption">Retainer Scope</span>
                      )}
                    </TD>

                    {/* Engagement / Cycle */}
                    <TD>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-surface text-fg">
                        {ws.project_cycle || 'Retainer'}
                      </span>
                    </TD>

                    {/* Health & Priority */}
                    <TD>
                      <div className="flex items-center gap-1.5">
                        <HealthBadge health={ws.health} />
                        <PriorityBadge priority={ws.priority} />
                      </div>
                    </TD>

                    {/* Members */}
                    <TD className="tabular-nums text-caption text-fg-muted">
                      {membersCount > 0 ? `${membersCount} assigned` : '—'}
                    </TD>

                    {/* Ad Accounts */}
                    <TD className="tabular-nums text-caption text-fg-muted">
                      {adCount > 0 ? `${adCount} linked` : '—'}
                    </TD>

                    {/* Status */}
                    <TD>
                      <StatusPill
                        variant={isInactive ? 'neutral' : 'success'}
                        label={isInactive ? 'Inactive' : 'Active'}
                        dot
                      />
                    </TD>

                    {/* Actions */}
                    {canManageWorkspaces && (
                      <TD align="right">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            variant="ghost"
                            size="sm"
                            label={`Edit ${ws.name}`}
                            icon={Edit2}
                            onClick={() => onEditWorkspace(ws)}
                          />

                          {onToggleStatus && (
                            <IconButton
                              variant="ghost"
                              size="sm"
                              label={isInactive ? 'Activate workspace' : 'Deactivate workspace'}
                              icon={isInactive ? CheckCircle2 : XCircle}
                              onClick={() => onToggleStatus(ws)}
                            />
                          )}
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
