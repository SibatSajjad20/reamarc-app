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
} from '@/components/ui/dropdown-menu';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Button, IconButton } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/StatusPill';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/context/ToastContext';
import { CompanyMark } from './CompanyMark';
import { formatCreatedDate } from './CompanyDetailSheet';
import { CompanyBrandingSheet } from '@/components/owner/CompanyBrandingSheet';
import { ownerService, type Company } from '@/services/ownerService';
import { Palette, MoreHorizontal, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

function peopleLabel(count: number): string {
  return `${count} ${count === 1 ? 'person' : 'people'}`;
}

export interface OwnerCompaniesTabProps {
  companies: Company[];
  isLoading: boolean;
  currentUserCompanyId?: string;
  memberCompanyIds?: Set<string>;
  onSelectCompany: (companyId: string) => void;
  onGiveAccess: (company: Company) => void;
  onOpenCreateModal: () => void;
  onRefreshData: () => Promise<void>;
}

export const OwnerCompaniesTab: React.FC<OwnerCompaniesTabProps> = ({
  companies,
  isLoading,
  currentUserCompanyId,
  memberCompanyIds = new Set(),
  onSelectCompany,
  onGiveAccess,
  onOpenCreateModal,
  onRefreshData,
}) => {
  const confirm = useConfirm();
  const { addToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [brandingCompany, setBrandingCompany] = useState<Company | null>(null);

  const counts = useMemo(() => {
    let active = 0;
    let paused = 0;
    let totalPeople = 0;
    for (const c of companies) {
      if (c.status === 'suspended') paused++;
      else active++;
      totalPeople += c.user_count || 0;
    }
    return { all: companies.length, active, paused, totalPeople };
  }, [companies]);

  const filteredCompanies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return companies.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (q) {
        const matchName = c.name.toLowerCase().includes(q);
        const matchSlug = c.slug.toLowerCase().includes(q);
        if (!matchName && !matchSlug) return false;
      }
      return true;
    });
  }, [companies, searchQuery, statusFilter]);

  const handlePauseCompany = async (company: Company) => {
    const isPaused = company.status === 'suspended';
    if (!isPaused) {
      const ok = await confirm({
        title: `Pause ${company.name}?`,
        description: `Nobody in ${company.name} can log in until you resume it. People who are signed in are signed out. Nothing is deleted.`,
        confirmLabel: 'Pause company',
        tone: 'danger',
      });
      if (!ok) return;

      try {
        await ownerService.updateCompany(company.id, { status: 'suspended' });
        addToast(`${company.name} paused`, undefined, 'success');
        await onRefreshData();
      } catch (err: any) {
        addToast(`Couldn't pause ${company.name}`, err.message, 'error');
      }
    } else {
      const ok = await confirm({
        title: `Resume ${company.name}?`,
        description: `People in ${company.name} can log in again.`,
        confirmLabel: 'Resume',
        tone: 'default',
      });
      if (!ok) return;

      try {
        await ownerService.updateCompany(company.id, { status: 'active' });
        addToast(`${company.name} resumed`, undefined, 'success');
        await onRefreshData();
      } catch (err: any) {
        addToast(`Couldn't resume ${company.name}`, err.message, 'error');
      }
    }
  };

  const handleSignEveryoneOut = async (company: Company) => {
    const ok = await confirm({
      title: `Sign everyone out of ${company.name}?`,
      description: 'Everyone has to log in again. Nothing is deleted.',
      confirmLabel: 'Sign everyone out',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      await ownerService.resetTokenVersion(company.id);
      addToast(`Everyone in ${company.name} was signed out`, undefined, 'success');
    } catch (err: any) {
      addToast(`Couldn't sign everyone out of ${company.name}`, err.message, 'error');
    }
  };

  const rowAction = (c: Company) => {
    const isOwn = c.id === currentUserCompanyId;
    const isMember = isOwn || memberCompanyIds.has(c.id);
    if (isOwn) return null;
    if (isMember) return null;
    return (
      <Button variant="secondary" size="sm" onClick={() => onGiveAccess(c)}>
        Give access
      </Button>
    );
  };

  const companyNameCell = (c: Company, size: number) => {
    const isOwn = c.id === currentUserCompanyId;
    return (
      <div className="flex items-center gap-3 min-w-0">
        <CompanyMark
          name={c.name}
          logoUrl={c.logo_url}
          accentColor={c.accent_color}
          size={size}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-fg truncate">{c.name}</span>
            {isOwn && <Badge variant="default">Current</Badge>}
          </div>
          <div className="text-caption text-fg-muted mt-0.5">
            Created {formatCreatedDate(c.created_at)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <TableCard>
        <TableToolbar>
          <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
            <div className="w-full sm:w-64 relative">
              <Input
                placeholder="Search companies"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={Search}
                inputSize="sm"
                clearable={Boolean(searchQuery)}
                onClear={() => setSearchQuery('')}
              />
            </div>

            <SegmentedControl
              size="sm"
              value={statusFilter}
              onValueChange={(val) => setStatusFilter(val as any)}
              options={[
                { value: 'all', label: 'All', count: counts.all },
                { value: 'active', label: 'Active', count: counts.active },
                { value: 'suspended', label: 'Paused', count: counts.paused },
              ]}
            />
          </div>

          <div className="text-small text-fg-muted font-numeric whitespace-nowrap ml-auto">
            <span className="font-semibold text-fg">{counts.totalPeople}</span> people across{' '}
            <span className="font-semibold text-fg">{counts.all}</span> companies
          </div>
        </TableToolbar>

        {isLoading ? (
          <Table>
            <THead>
              <tr>
                <TH>Company</TH>
                <TH>Status</TH>
                <TH>People</TH>
                <TH>Time zone</TH>
                <TH align="right">Actions</TH>
              </tr>
            </THead>
            <TBody>
              <TableSkeletonRows columns={5} rows={4} />
            </TBody>
          </Table>
        ) : filteredCompanies.length === 0 ? (
          searchQuery ? (
            <div className="py-12 px-4">
              <EmptyState
                title={`No companies match "${searchQuery}"`}
                description="Try clearing your search or adjusting filters."
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
                title="No companies yet"
                description="Create the first one to give a team its own space."
                action={
                  <Button variant="primary" size="sm" onClick={onOpenCreateModal}>
                    New company
                  </Button>
                }
              />
            </div>
          )
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr>
                    <TH>Company</TH>
                    <TH>Status</TH>
                    <TH>People</TH>
                    <TH>Time zone</TH>
                    <TH align="right">Actions</TH>
                  </tr>
                </THead>
                <TBody>
                  {filteredCompanies.map((c) => {
                    const isOwn = c.id === currentUserCompanyId;
                    const isPaused = c.status === 'suspended';
                    const userCount = c.user_count || 0;

                    return (
                      <TR
                        key={c.id}
                        clickable
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onSelectCompany(c.id);
                        }}
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest('button') || target.closest('[role="menuitem"]')) return;
                          onSelectCompany(c.id);
                        }}
                      >
                        <TD>{companyNameCell(c, 28)}</TD>
                        <TD>
                          <StatusPill
                            variant={isPaused ? 'warning' : 'success'}
                            label={isPaused ? 'Paused' : 'Active'}
                          />
                        </TD>
                        <TD>
                          <span className="font-numeric text-ui text-fg whitespace-nowrap">
                            {peopleLabel(userCount)}
                          </span>
                        </TD>
                        <TD>
                          <span className="text-ui text-fg-2">{c.timezone || 'Asia/Karachi'}</span>
                        </TD>
                        <TD align="right">
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            {rowAction(c)}
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={Palette}
                              onClick={() => setBrandingCompany(c)}
                            >
                              Branding
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <IconButton
                                  variant="ghost"
                                  size="sm"
                                  icon={MoreHorizontal}
                                  label="Company actions"
                                />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuItem onClick={() => onSelectCompany(c.id)}>
                                  View details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setBrandingCompany(c)}>
                                  Branding
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleSignEveryoneOut(c)}>
                                  Sign everyone out
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={isOwn}
                                  className={cn(
                                    !isOwn && (isPaused ? 'text-fg' : 'text-danger-fg focus:text-danger-fg')
                                  )}
                                  onClick={() => !isOwn && handlePauseCompany(c)}
                                >
                                  <div>
                                    <div>{isPaused ? 'Resume company' : 'Pause company'}</div>
                                    {isOwn && (
                                      <div className="text-caption text-fg-muted font-normal">
                                        You can't pause your own company
                                      </div>
                                    )}
                                  </div>
                                </DropdownMenuItem>
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

            <div className="block md:hidden divide-y divide-border">
              {filteredCompanies.map((c) => {
                const isOwn = c.id === currentUserCompanyId;
                const isPaused = c.status === 'suspended';
                const userCount = c.user_count || 0;

                return (
                  <div
                    key={c.id}
                    className="p-4 space-y-3 cursor-pointer hover:bg-hover transition-colors"
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest('button') || target.closest('[role="menuitem"]')) return;
                      onSelectCompany(c.id);
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {companyNameCell(c, 32)}
                      <StatusPill
                        variant={isPaused ? 'warning' : 'success'}
                        label={isPaused ? 'Paused' : 'Active'}
                      />
                    </div>
                    <div className="text-caption text-fg-muted">{peopleLabel(userCount)}</div>

                    <div className="flex items-center gap-2 pt-1 justify-end flex-wrap">
                      {rowAction(c)}
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={Palette}
                        onClick={() => setBrandingCompany(c)}
                      >
                        Branding
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton
                            variant="ghost"
                            size="sm"
                            icon={MoreHorizontal}
                            label="Company actions"
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => onSelectCompany(c.id)}>
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setBrandingCompany(c)}>
                            Branding
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleSignEveryoneOut(c)}>
                            Sign everyone out
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={isOwn}
                            className={cn(
                              !isOwn && (isPaused ? 'text-fg' : 'text-danger-fg focus:text-danger-fg')
                            )}
                            onClick={() => !isOwn && handlePauseCompany(c)}
                          >
                            <div>
                              <div>{isPaused ? 'Resume company' : 'Pause company'}</div>
                              {isOwn && (
                                <div className="text-caption text-fg-muted font-normal">
                                  You can't pause your own company
                                </div>
                              )}
                            </div>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </TableCard>

      <CompanyBrandingSheet
        company={brandingCompany}
        onClose={() => setBrandingCompany(null)}
        onSaved={onRefreshData}
      />
    </>
  );
};
