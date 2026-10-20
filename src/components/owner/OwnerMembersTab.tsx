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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Button, IconButton } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/input';
import { CompanyMark } from './CompanyMark';
import { formatCreatedDate } from './CompanyDetailSheet';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/context/ToastContext';
import { getRoleDisplayName } from '@/lib/roleLabel';
import { ownerService, type Company, type OwnerMember, type OwnerMemberMembership } from '@/services/ownerService';
import { Search, RotateCw, Plus, KeyRound, MoreHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OwnerMembersTabProps {
  members: OwnerMember[];
  companies: Company[];
  isLoading: boolean;
  onRefreshData: () => Promise<void>;
  onOpenGiveAccess: (user: OwnerMember) => void;
  onOpenSetPassword: (user: OwnerMember) => void;
  onOpenNewMemberModal: () => void;
  highlightUserId?: string | null;
  presetCompanyFilter?: string | null;
}

export const OwnerMembersTab: React.FC<OwnerMembersTabProps> = ({
  members,
  companies,
  isLoading,
  onRefreshData,
  onOpenGiveAccess,
  onOpenSetPassword,
  onOpenNewMemberModal,
  highlightUserId,
  presetCompanyFilter,
}) => {
  const confirm = useConfirm();
  const { addToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(presetCompanyFilter || 'all');
  const [segmentFilter, setSegmentFilter] = useState<'everyone' | 'needs_setup' | 'multi'>('everyone');
  const [showRemoved, setShowRemoved] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync presetCompanyFilter if changed externally
  React.useEffect(() => {
    if (presetCompanyFilter) {
      setSelectedCompanyId(presetCompanyFilter);
    }
  }, [presetCompanyFilter]);

  // Segment counts
  const counts = useMemo(() => {
    let needsSetupCount = 0;
    let multiCount = 0;

    for (const m of members) {
      const activeMems = (m.memberships || []).filter((mem) => mem.status === 'active');
      if (activeMems.some((mem) => mem.needs_setup)) {
        needsSetupCount++;
      }
      if (activeMems.length >= 2) {
        multiCount++;
      }
    }

    return {
      everyone: members.length,
      needsSetup: needsSetupCount,
      multi: multiCount,
    };
  }, [members]);

  // Filtered members
  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return members.filter((m) => {
      const activeMems = (m.memberships || []).filter((mem) => mem.status === 'active');

      // Segment filter
      if (segmentFilter === 'needs_setup') {
        if (!activeMems.some((mem) => mem.needs_setup)) return false;
      } else if (segmentFilter === 'multi') {
        if (activeMems.length < 2) return false;
      }

      // Company select filter
      if (selectedCompanyId !== 'all') {
        const hasCompany = (m.memberships || []).some(
          (mem) => mem.company_id === selectedCompanyId && (showRemoved || mem.status === 'active')
        );
        if (!hasCompany) return false;
      }

      // Search query filter (matches person name, email, company names)
      if (q) {
        const nameMatch = (m.name || m.full_name || '').toLowerCase().includes(q);
        const emailMatch = (m.email || '').toLowerCase().includes(q);
        const companyMatch = (m.memberships || []).some((mem) =>
          (mem.company_name || '').toLowerCase().includes(q)
        );
        if (!nameMatch && !emailMatch && !companyMatch) return false;
      }

      return true;
    });
  }, [members, searchQuery, selectedCompanyId, segmentFilter, showRemoved]);

  const handleRemoveAccess = async (user: OwnerMember, membership: OwnerMemberMembership) => {
    const activeMems = (user.memberships || []).filter(
      (m) => m.status === 'active' && m.company_id !== membership.company_id
    );
    const otherCompanyNames = activeMems.map((m) => m.company_name).filter(Boolean);

    let bodyText = `${user.name} won't be able to open ${membership.company_name}. Their past records there are kept.`;
    if (otherCompanyNames.length > 0) {
      bodyText += ` Their login and their access to ${otherCompanyNames.join(', ')} don't change.`;
    } else {
      bodyText += ` Their login stays, but they won't be able to open any company until you give access again.`;
    }

    const ok = await confirm({
      title: `Remove access to ${membership.company_name}?`,
      description: bodyText,
      confirmLabel: 'Remove access',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      await ownerService.removeCompanyAccess(user.id, membership.company_id);
      addToast(
        'Access removed',
        `${user.name} can no longer open ${membership.company_name}.`,
        'success'
      );
      await onRefreshData();
    } catch (err: any) {
      addToast("Couldn't remove access", err.message, 'error');
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshData();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <TableCard>
      {/* Toolbar */}
      <TableToolbar>
        <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
          {/* Search */}
          <div className="w-full sm:w-60 relative">
            <Input
              placeholder="Search name or email"
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

          {/* Segmented Control */}
          <SegmentedControl
            size="sm"
            value={segmentFilter}
            onValueChange={(val) => setSegmentFilter(val as any)}
            options={[
              { value: 'everyone', label: 'Everyone', count: counts.everyone },
              { value: 'needs_setup', label: 'Needs setup', count: counts.needsSetup },
              { value: 'multi', label: '2+ companies', count: counts.multi },
            ]}
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <label className="inline-flex items-center gap-1.5 text-small text-fg-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showRemoved}
              onChange={(e) => setShowRemoved(e.target.checked)}
              className="rounded border-border text-accent focus:ring-accent"
            />
            <span>Show removed</span>
          </label>

          <IconButton
            variant="ghost"
            size="sm"
            icon={RotateCw}
            label="Reload"
            loading={isRefreshing}
            onClick={handleManualRefresh}
          />
        </div>
      </TableToolbar>

      {/* Content */}
      {isLoading ? (
        <Table>
          <THead>
            <tr>
              <TH>Person</TH>
              <TH>Companies they can open</TH>
              <TH>Account</TH>
              <TH align="right">Actions</TH>
            </tr>
          </THead>
          <TBody>
            <TableSkeletonRows columns={4} rows={6} />
          </TBody>
        </Table>
      ) : filteredMembers.length === 0 ? (
        searchQuery ? (
          <div className="py-12 px-4">
            <EmptyState
              title={`No one matches "${searchQuery}"`}
              description="Try adjusting your search query or company filter."
              action={
                <Button variant="secondary" size="sm" onClick={() => setSearchQuery('')}>
                  Clear search
                </Button>
              }
            />
          </div>
        ) : segmentFilter === 'needs_setup' ? (
          <div className="py-12 px-4">
            <EmptyState
              title="Nobody needs setup"
              description="Everyone you've given access to has been set up by their company's admin."
            />
          </div>
        ) : (
          <div className="py-12 px-4">
            <EmptyState
              title="No members yet"
              description="Add the first member to grant them company access."
              action={
                <Button variant="primary" size="sm" onClick={onOpenNewMemberModal}>
                  New member
                </Button>
              }
            />
          </div>
        )
      ) : (
        <>
          {/* Desktop Table (md+) */}
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH className="w-[270px]">Person</TH>
                  <TH>Companies they can open</TH>
                  <TH className="w-28">Account</TH>
                  <TH align="right" className="w-40">Actions</TH>
                </tr>
              </THead>
              <TBody>
                {filteredMembers.map((m) => {
                  const isOwner = Boolean(m.is_super_admin);
                  const isHighlighted = highlightUserId === m.id;

                  const membershipsToRender = (m.memberships || []).filter((mem) =>
                    showRemoved ? true : mem.status === 'active'
                  );

                  return (
                    <TR
                      key={m.id}
                      className={cn(
                        'transition-colors duration-500',
                        isHighlighted && 'bg-hover'
                      )}
                    >
                      {/* Person */}
                      <TD>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={m.name || m.full_name} size={32} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-fg truncate">
                                {m.name || m.full_name || 'Member'}
                              </span>
                              {isOwner && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-subtle text-fg-muted border border-border">
                                  Owner
                                </span>
                              )}
                            </div>
                            <div className="text-caption text-fg-muted truncate">{m.email}</div>
                          </div>
                        </div>
                      </TD>

                      {/* Companies chips */}
                      <TD>
                        <div className="flex flex-wrap items-center gap-1.5 py-1">
                          {membershipsToRender.map((mem) => {
                            const isRemoved = mem.status === 'removed';
                            const compDoc = companies.find((c) => c.id === mem.company_id);
                            const accentColor = compDoc?.accent_color;
                            const isHomeMem = isOwner && mem.company_id === 'company_reamarc';

                            return (
                              <span
                                key={mem.id || mem.company_id}
                                className={cn(
                                  'inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 rounded-sm border text-xs transition-colors',
                                  isRemoved
                                    ? 'bg-subtle/50 border-border text-fg-muted line-through opacity-75'
                                    : mem.needs_setup
                                    ? 'bg-warning-bg/40 border-warning-bd text-fg'
                                    : 'bg-surface border-border text-fg'
                                )}
                              >
                                <CompanyMark
                                  name={mem.company_name}
                                  logoUrl={mem.company_logo_url}
                                  accentColor={accentColor}
                                  size={20}
                                  singleLetter
                                />
                                <span
                                  className="font-medium max-w-[12rem] truncate"
                                  title={mem.company_name}
                                >
                                  {mem.company_name}
                                </span>
                                {isRemoved ? (
                                  <span className="text-fg-muted font-normal text-caption">
                                    · Removed {formatCreatedDate(mem.removed_at)}
                                  </span>
                                ) : mem.needs_setup ? (
                                  <StatusPill
                                    variant="warning"
                                    dot={false}
                                    label="Needs setup"
                                    className="h-4 px-1 text-[11px]"
                                  />
                                ) : (
                                  <span className="text-fg-muted font-normal text-caption">
                                    · {getRoleDisplayName(mem.role)}
                                  </span>
                                )}

                                {!isRemoved && !isHomeMem && (
                                  <button
                                    type="button"
                                    aria-label={`Remove access to ${mem.company_name}`}
                                    onClick={() => handleRemoveAccess(m, mem)}
                                    className="p-0.5 ml-0.5 text-fg-muted hover:text-danger-fg hover:bg-danger-bg rounded-sm cursor-pointer transition-colors"
                                  >
                                    <X size={12} />
                                  </button>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </TD>

                      {/* Account */}
                      <TD>
                        <StatusPill
                          variant={m.is_active ? 'success' : 'neutral'}
                          label={m.is_active ? 'Active' : 'Deactivated'}
                        />
                      </TD>

                      {/* Actions */}
                      <TD align="right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {!isOwner && (
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={Plus}
                              onClick={() => onOpenGiveAccess(m)}
                            >
                              Give access
                            </Button>
                          )}

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton
                                variant="ghost"
                                size="sm"
                                icon={MoreHorizontal}
                                label="Member actions"
                              />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel className="font-semibold text-fg truncate">
                                {m.name || m.full_name}
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator />

                              {!isOwner && (
                                <DropdownMenuItem onClick={() => onOpenSetPassword(m)}>
                                  <KeyRound size={14} className="mr-2 text-fg-muted" />
                                  <span>Set starting password</span>
                                </DropdownMenuItem>
                              )}

                              {!isOwner && (
                                <DropdownMenuItem onClick={() => onOpenGiveAccess(m)}>
                                  <Plus size={14} className="mr-2 text-fg-muted" />
                                  <span>Give access to a company</span>
                                </DropdownMenuItem>
                              )}

                              {/* Remove access group */}
                              {m.memberships?.some((mem) => mem.status === 'active') && !isOwner && (
                                <>
                                  <DropdownMenuSeparator />
                                  <div className="px-2 py-1.5 text-caption font-semibold text-fg-muted uppercase tracking-wider">
                                    Remove access
                                  </div>
                                  {m.memberships
                                    .filter((mem) => mem.status === 'active')
                                    .map((mem) => (
                                      <DropdownMenuItem
                                        key={mem.id || mem.company_id}
                                        className="text-danger-fg focus:text-danger-fg"
                                        onClick={() => handleRemoveAccess(m, mem)}
                                      >
                                        <X size={14} className="mr-2" />
                                        <span>From {mem.company_name}</span>
                                      </DropdownMenuItem>
                                    ))}
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>

          {/* Mobile Cards (<md) */}
          <div className="block md:hidden divide-y divide-border">
            {filteredMembers.map((m) => {
              const isOwner = Boolean(m.is_super_admin);
              const activeMems = (m.memberships || []).filter((mem) => mem.status === 'active');

              return (
                <div key={m.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar name={m.name || m.full_name} size={36} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-fg text-ui truncate">
                            {m.name || m.full_name || 'Member'}
                          </span>
                          {isOwner && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-subtle text-fg-muted border border-border">
                              Owner
                            </span>
                          )}
                        </div>
                        <div className="text-caption text-fg-muted truncate">{m.email}</div>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton
                          variant="ghost"
                          size="sm"
                          icon={MoreHorizontal}
                          label="Member actions"
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="font-semibold text-fg truncate">
                          {m.name || m.full_name}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />

                        {!isOwner && (
                          <DropdownMenuItem onClick={() => onOpenGiveAccess(m)}>
                            <Plus size={14} className="mr-2 text-fg-muted" />
                            <span>Give access to a company</span>
                          </DropdownMenuItem>
                        )}

                        {!isOwner && (
                          <DropdownMenuItem onClick={() => onOpenSetPassword(m)}>
                            <KeyRound size={14} className="mr-2 text-fg-muted" />
                            <span>Set starting password</span>
                          </DropdownMenuItem>
                        )}

                        {activeMems.length > 0 && !isOwner && (
                          <>
                            <DropdownMenuSeparator />
                            <div className="px-2 py-1 text-caption font-semibold text-fg-muted uppercase tracking-wider">
                              Remove access
                            </div>
                            {activeMems.map((mem) => (
                              <DropdownMenuItem
                                key={mem.id || mem.company_id}
                                className="text-danger-fg focus:text-danger-fg"
                                onClick={() => handleRemoveAccess(m, mem)}
                              >
                                <span>From {mem.company_name}</span>
                              </DropdownMenuItem>
                            ))}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {activeMems.map((mem) => {
                      const compDoc = companies.find((c) => c.id === mem.company_id);
                      return (
                        <span
                          key={mem.id || mem.company_id}
                          className={cn(
                            'inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-sm border text-xs',
                            mem.needs_setup
                              ? 'bg-warning-bg/40 border-warning-bd text-fg'
                              : 'bg-surface border-border text-fg'
                          )}
                        >
                          <CompanyMark
                            name={mem.company_name}
                            logoUrl={mem.company_logo_url}
                            accentColor={compDoc?.accent_color}
                            size={18}
                            singleLetter
                          />
                          <span className="font-medium truncate max-w-[9rem]">
                            {mem.company_name}
                          </span>
                          {mem.needs_setup ? (
                            <StatusPill
                              variant="warning"
                              dot={false}
                              label="Needs setup"
                              className="h-4 px-1 text-[11px]"
                            />
                          ) : (
                            <span className="text-fg-muted font-normal text-caption">
                              · {getRoleDisplayName(mem.role)}
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border flex items-center justify-between text-caption text-fg-muted flex-wrap gap-2">
        <div>
          Showing {filteredMembers.length} of {members.length}
        </div>
        <div>Roles, departments and modules are set by each company's admin.</div>
      </div>
    </TableCard>
  );
};
