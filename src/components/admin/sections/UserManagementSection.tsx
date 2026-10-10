import React, { useState, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Edit2,
  Trash2,
  Layers,
  Briefcase,
  Download,
  FolderKanban,
  MoreHorizontal,
  BellRing,
  UserX,
  UserCheck,
} from 'lucide-react';
import type { UserRole } from '../../../types/auth';
import type { AdminMember, AdAccount } from '../../../types/admin';
import type { Workspace } from '../../../types';
import type { AdminSectionType } from '../../../types/admin';
import { useAuth } from '../../../context/AuthContext';
import { CustomSelect } from '../../ui/CustomSelect';
import { PageHeader } from '../../ui/PageHeader';
import { KpiCard } from '../../ui/KpiCard';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Button, IconButton } from '../../ui/button';
import { Avatar } from '../../ui/Avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../../ui/dropdown-menu';
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
import {
  getRoleLabel,
} from '../../../utils/badgeStyles';
import { formatPhoneDisplay } from '../../../utils/phone';

export const SYSTEM_DEPARTMENTS = [
  'Website',
  'Creative',
  'Content',
  'SEO',
  'Performance Marketing',
  'AI',
  'Software Development',
  'HR',
  'Sales',
  'Social Media',
];

export const SYSTEM_ROLES = [
  { id: 'admin', label: 'Super Admin' },
  { id: 'hr', label: 'HR' },
  { id: 'operations', label: 'Operations' },
  { id: 'team_lead', label: 'Team Lead' },
  { id: 'team_member', label: 'Team Member' },
];

type DirectoryTab = 'team' | 'clients';

interface UserManagementSectionProps {
  members: AdminMember[];
  workspaces?: Workspace[];
  adAccounts?: AdAccount[];
  isLoading: boolean;
  onAddMember: (defaultRole?: UserRole) => void;
  onEditMember: (member: AdminMember) => void;
  onDeleteMember: (member: AdminMember) => void;
  onToggleStatus?: (member: AdminMember) => void;
  onNavigateSection?: (section: AdminSectionType) => void;
  canManageMembers?: boolean;
}

export const UserManagementSection: React.FC<UserManagementSectionProps> = ({
  members,
  workspaces = [],
  adAccounts = [],
  isLoading,
  onAddMember,
  onEditMember,
  onDeleteMember,
  onToggleStatus,
  onNavigateSection,
  canManageMembers = true,
}) => {
  const { user } = useAuth();
  const [directoryTab, setDirectoryTab] = useState<DirectoryTab>('team');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');

  const workspaceMap = useMemo(() => {
    const map: Record<string, Workspace> = {};
    workspaces.forEach((ws) => {
      map[ws.id] = ws;
    });
    return map;
  }, [workspaces]);

  const linkedClientWorkspaces = (member: AdminMember): Workspace[] => {
    const ids = member.workspace_ids || [];
    return ids.map((id) => workspaceMap[id]).filter(Boolean);
  };

  const tabMembers = useMemo(
    () => members.filter((m) => (directoryTab === 'clients' ? m.role === 'client' : m.role !== 'client')),
    [members, directoryTab],
  );

  const filteredMembers = useMemo(() => {
    return tabMembers.filter((m) => {
      const q = searchQuery.toLowerCase().trim();
      const isGlobalRole = m.role === 'admin' || m.role === 'operations';
      const effectiveDept = isGlobalRole ? 'All' : m.department || '';
      const clientNames = linkedClientWorkspaces(m).map((w) => w.name).join(' ');

      const matchesSearch =
        !q ||
        (m.full_name && m.full_name.toLowerCase().includes(q)) ||
        (m.email && m.email.toLowerCase().includes(q)) ||
        (m.phone && m.phone.toLowerCase().includes(q)) ||
        (effectiveDept && effectiveDept.toLowerCase().includes(q)) ||
        (m.role && m.role.toLowerCase().includes(q)) ||
        clientNames.toLowerCase().includes(q);

      const matchesRole = roleFilter === 'all' || m.role.toLowerCase() === roleFilter.toLowerCase();
      const memberDepts =
        Array.isArray(m.departments) && m.departments.length > 0
          ? m.departments.map((d) => d.toLowerCase())
          : (m.department || '')
              .toLowerCase()
              .split(/[,;/]|\band\b|&/i)
              .map((s) => s.trim())
              .filter(Boolean);

      const matchesDept =
        directoryTab === 'clients' ||
        departmentFilter === 'all' ||
        (isGlobalRole && departmentFilter === 'All') ||
        (!isGlobalRole &&
          (memberDepts.includes(departmentFilter.toLowerCase()) ||
            (m.department || '').toLowerCase() === departmentFilter.toLowerCase()));

      return matchesSearch && matchesRole && matchesDept;
    });
  }, [tabMembers, searchQuery, roleFilter, departmentFilter, directoryTab, workspaceMap]);

  // KPI Calculations
  const teamMembersTotal = members.filter((m) => m.role !== 'client');
  const activeMembersCount = teamMembersTotal.filter((m) => m.is_active).length;
  const deactivatedMembersCount = teamMembersTotal.length - activeMembersCount;

  // Department counts
  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    teamMembersTotal.forEach((m) => {
      const depts =
        Array.isArray(m.departments) && m.departments.length > 0
          ? m.departments
          : m.department
          ? [m.department]
          : [];
      depts.forEach((d) => {
        const clean = d.trim();
        if (clean && clean !== 'All') {
          counts[clean] = (counts[clean] || 0) + 1;
        }
      });
    });
    return counts;
  }, [teamMembersTotal]);

  const uniqueDeptsCount = Object.keys(deptCounts).length;
  const topDept = useMemo(() => {
    let topName = 'Website';
    let topVal = 0;
    Object.entries(deptCounts).forEach(([name, count]) => {
      if (count > topVal) {
        topVal = count;
        topName = name;
      }
    });
    return { name: topName, count: topVal };
  }, [deptCounts]);

  const highPriorityWorkspacesCount = workspaces.filter((w) => w.priority === 'High').length;
  const emergencyWorkspacesCount = workspaces.filter((w) => w.health === 'Emergency').length;
  const needsAttentionAdAccountsCount = adAccounts.filter((a) => a.status !== 'active').length;

  // Role Counts for Segmented Control
  const roleCounts = useMemo(() => {
    const teamOnly = members.filter((m) => m.role !== 'client');
    return {
      all: teamOnly.length,
      team_lead: teamOnly.filter((m) => m.role === 'team_lead').length,
      team_member: teamOnly.filter((m) => m.role === 'team_member').length,
      hr: teamOnly.filter((m) => m.role === 'hr').length,
      operations: teamOnly.filter((m) => m.role === 'operations').length,
      admin: teamOnly.filter((m) => m.role === 'admin').length,
    };
  }, [members]);

  const departmentOptions = useMemo(() => {
    return [
      { value: 'all', label: 'All Departments' },
      ...SYSTEM_DEPARTMENTS.map((dept) => ({ value: dept, label: dept })),
    ];
  }, []);

  const handleExportCsv = () => {
    const headers = ['Name', 'Email', 'Role', 'Department', 'Contact', 'Employment Type', 'Joining Date'];
    const rows = filteredMembers.map((m) => [
      `"${(m.full_name || '').replace(/"/g, '""')}"`,
      `"${(m.email || '').replace(/"/g, '""')}"`,
      `"${getRoleLabel(m.role)}"`,
      `"${(m.department || (m.departments || []).join(', ') || '').replace(/"/g, '""')}"`,
      `"${(m.phone || '').replace(/"/g, '""')}"`,
      `"${m.employment_type || 'contract'}"`,
      `"${m.joining_date || ''}"`,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'reamarc-team-directory.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto p-6 space-y-6">
      {/* Page Header matching Mock 08 */}
      <PageHeader
        title="Team directory"
        description="People, roles and access across Reamarc."
        actions={
          <div className="flex items-center gap-2">
            {onNavigateSection && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigateSection('compliance')}
                icon={BellRing}
              >
                Log compliance
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              icon={Download}
            >
              Export
            </Button>
            {canManageMembers && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => onAddMember(directoryTab === 'clients' ? 'client' : 'team_member')}
                icon={UserPlus}
              >
                {directoryTab === 'clients' ? 'Add client' : 'Add member'}
              </Button>
            )}
          </div>
        }
      />

      {/* 4 KPI Cards Row matching Mock 08 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Team members"
          value={teamMembersTotal.length}
          icon={Users}
          deltaContext={`${activeMembersCount} active · ${deactivatedMembersCount} deactivated`}
        />
        <KpiCard
          label="Departments"
          value={uniqueDeptsCount}
          icon={Layers}
          deltaContext={
            topDept.count > 0
              ? `${topDept.name} has the most people (${topDept.count})`
              : 'All departments active'
          }
        />
        <KpiCard
          label="Client workspaces"
          value={workspaces.length}
          icon={FolderKanban}
          deltaContext={`${highPriorityWorkspacesCount} high priority${
            emergencyWorkspacesCount > 0 ? ` · ${emergencyWorkspacesCount} emergency` : ''
          }`}
          onClick={onNavigateSection ? () => onNavigateSection('workspaces') : undefined}
        />
        <KpiCard
          label="Ad accounts"
          value={adAccounts.length}
          icon={Briefcase}
          deltaContext={
            needsAttentionAdAccountsCount > 0
              ? `${needsAttentionAdAccountsCount} needs credentials`
              : 'All accounts synced'
          }
          onClick={
            user?.role === 'admin'
              ? () => {
                  try {
                    window.history.pushState(null, '', '/settings/ad-accounts');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  } catch {}
                }
              : undefined
          }
        />
      </div>

      {/* Main Table Card */}
      <TableCard>
        {/* Directory Sub-tabs: Team vs Clients */}
        <div className="px-4 pt-3 border-b border-border flex items-center gap-4 bg-surface">
          <button
            type="button"
            onClick={() => {
              setDirectoryTab('team');
              setRoleFilter('all');
            }}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              directoryTab === 'team'
                ? 'border-accent text-accent-text'
                : 'border-transparent text-fg-muted hover:text-fg'
            }`}
          >
            <span>Team</span>
            <span className="px-1.5 py-0.2 rounded-full text-xs bg-subtle text-fg-muted font-normal tabular-nums">
              {teamMembersTotal.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDirectoryTab('clients');
              setRoleFilter('all');
              setDepartmentFilter('all');
            }}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              directoryTab === 'clients'
                ? 'border-accent text-accent-text'
                : 'border-transparent text-fg-muted hover:text-fg'
            }`}
          >
            <span>Clients</span>
            <span className="px-1.5 py-0.2 rounded-full text-xs bg-subtle text-fg-muted font-normal tabular-nums">
              {members.filter((m) => m.role === 'client').length}
            </span>
          </button>
        </div>

        {/* Toolbar */}
        <TableToolbar className="flex-wrap gap-3">
          {/* Role Filter Segments (Only on Team tab) */}
          {directoryTab === 'team' && (
            <SegmentedControl
              size="sm"
              value={roleFilter}
              onValueChange={setRoleFilter}
              options={[
                { value: 'all', label: 'All', count: roleCounts.all },
                { value: 'team_lead', label: 'Team leads', count: roleCounts.team_lead },
                { value: 'team_member', label: 'Team members', count: roleCounts.team_member },
                { value: 'hr', label: 'HR', count: roleCounts.hr },
                { value: 'operations', label: 'Operations', count: roleCounts.operations },
                { value: 'admin', label: 'Admins', count: roleCounts.admin },
              ]}
            />
          )}

          {/* Search Input */}
          <div className="relative min-w-[200px] max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search name or email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface border border-border rounded-md text-fg placeholder:text-fg-muted focus:outline-none focus:border-accent"
            />
          </div>

          {/* Department Select (Only on Team tab) */}
          {directoryTab === 'team' && (
            <div className="w-44">
              <CustomSelect
                value={departmentFilter}
                onChange={setDepartmentFilter}
                options={departmentOptions}
                icon={Layers}
                placeholder="Department"
              />
            </div>
          )}

          {/* Count Indicator */}
          <div className="ml-auto text-caption text-fg-muted tabular-nums">
            {filteredMembers.length} of {tabMembers.length}
          </div>
        </TableToolbar>

        {/* DataTable */}
        <Table>
          <THead>
            <TR>
              <TH>Member</TH>
              {directoryTab === 'clients' ? (
                <TH>Linked clients</TH>
              ) : (
                <>
                  <TH>Role</TH>
                  <TH>Department</TH>
                </>
              )}
              <TH>Contact</TH>
              {directoryTab === 'team' && <TH>Linked clients</TH>}
              <TH>Employment</TH>
              {canManageMembers && <TH align="right" className="w-12"></TH>}
            </TR>
          </THead>
          <TBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, idx) => (
                <TR key={`skeleton-${idx}`}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-subtle animate-pulse" />
                      <div className="space-y-1.5">
                        <div className="w-24 h-3 rounded bg-subtle animate-pulse" />
                        <div className="w-32 h-2.5 rounded bg-subtle animate-pulse" />
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <div className="w-16 h-5 rounded bg-subtle animate-pulse" />
                  </TD>
                  <TD>
                    <div className="w-20 h-5 rounded bg-subtle animate-pulse" />
                  </TD>
                  <TD>
                    <div className="w-24 h-3 rounded bg-subtle animate-pulse" />
                  </TD>
                  {directoryTab === 'team' && (
                    <TD>
                      <div className="w-12 h-5 rounded bg-subtle animate-pulse" />
                    </TD>
                  )}
                  <TD>
                    <div className="w-14 h-5 rounded bg-subtle animate-pulse" />
                  </TD>
                  {canManageMembers && (
                    <TD align="right">
                      <div className="w-6 h-6 rounded bg-subtle animate-pulse ml-auto" />
                    </TD>
                  )}
                </TR>
              ))
            ) : filteredMembers.length === 0 ? (
              <TableEmptyRow
                colSpan={canManageMembers ? (directoryTab === 'team' ? 8 : 7) : 7}
                title={directoryTab === 'clients' ? 'No client accounts found' : 'No members found'}
                description={
                  searchQuery || roleFilter !== 'all' || departmentFilter !== 'all'
                    ? 'Try adjusting your search query or filters.'
                    : 'Get started by adding your first member to the directory.'
                }
              />
            ) : (
              filteredMembers.map((m) => {
                const isGlobalRole = m.role === 'admin' || m.role === 'hr' || m.role === 'operations';
                const clientWs = linkedClientWorkspaces(m);

                return (
                  <TR
                    key={m.id}
                    className="hover:bg-hover transition-colors"
                  >
                    {/* Member: Avatar + Name + Email */}
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <Avatar
                          name={m.full_name || 'User'}
                          src={m.avatar_url}
                          size={32}
                          className="rounded-full shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-fg truncate">
                            {m.full_name || 'User'}
                          </div>
                          <div className="text-caption text-fg-muted truncate">{m.email}</div>
                        </div>
                      </div>
                    </TD>

                    {/* Role / Linked clients */}
                    {directoryTab === 'clients' ? (
                      <TD>
                        {clientWs.length === 0 ? (
                          <span className="text-fg-muted text-caption">—</span>
                        ) : (
                          <div className="flex -space-x-1.5 items-center">
                            {clientWs.map((ws) => (
                              <span
                                key={ws.id}
                                className="w-6 h-6 rounded-md text-[10px] font-semibold flex items-center justify-center border border-surface text-white shadow-xs"
                                style={{
                                  backgroundColor: ws.brandColor?.startsWith('#')
                                    ? ws.brandColor
                                    : '#6847E0',
                                }}
                                title={ws.name}
                              >
                                {ws.initials || ws.name.slice(0, 2).toUpperCase()}
                              </span>
                            ))}
                          </div>
                        )}
                      </TD>
                    ) : (
                      <>
                        {/* Role */}
                        <TD>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-surface text-fg">
                            {getRoleLabel(m.role)}
                          </span>
                        </TD>

                        {/* Department */}
                        <TD>
                          {!m.department && !isGlobalRole ? (
                            <span className="text-fg-muted text-caption">—</span>
                          ) : isGlobalRole ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-subtle text-fg-muted">
                              All
                            </span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1">
                              {(Array.isArray(m.departments) && m.departments.length > 0
                                ? m.departments
                                : (m.department || '')
                                    .split(/[,;/]|\band\b|&/i)
                                    .map((s) => s.trim())
                                    .filter(Boolean)
                              ).map((d) => (
                                <span
                                  key={d}
                                  className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-surface text-fg-muted"
                                >
                                  {d}
                                </span>
                              ))}
                            </div>
                          )}
                        </TD>
                      </>
                    )}

                    {/* Contact Phone */}
                    <TD className="text-fg-muted tabular-nums text-caption">
                      {formatPhoneDisplay(m.phone) || '—'}
                    </TD>

                    {/* Linked clients (on Team tab) */}
                    {directoryTab === 'team' && (
                      <TD>
                        {clientWs.length === 0 ? (
                          <span className="text-fg-muted text-caption">—</span>
                        ) : (
                          <div className="flex -space-x-1.5 items-center">
                            {clientWs.map((ws) => (
                              <span
                                key={ws.id}
                                className="w-6 h-6 rounded-md text-[10px] font-semibold flex items-center justify-center border border-surface text-white shadow-xs"
                                style={{
                                  backgroundColor: ws.brandColor?.startsWith('#')
                                    ? ws.brandColor
                                    : '#6847E0',
                                }}
                                title={ws.name}
                              >
                                {ws.initials || ws.name.slice(0, 2).toUpperCase()}
                              </span>
                            ))}
                          </div>
                        )}
                      </TD>
                    )}

                    {/* Employment Type */}
                    <TD>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-surface text-fg-muted capitalize">
                        {m.employment_type || 'Contract'}
                      </span>
                    </TD>

                    {/* Actions Menu */}
                    {canManageMembers && (
                      <TD align="right" className="w-12">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton
                              variant="ghost"
                              size="sm"
                              label={`Actions for ${m.full_name}`}
                              icon={MoreHorizontal}
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => onEditMember(m)}>
                              <Edit2 className="w-3.5 h-3.5 mr-2" />
                              <span>Edit details</span>
                            </DropdownMenuItem>

                            {onToggleStatus && m.role !== 'admin' && (
                              <DropdownMenuItem onClick={() => onToggleStatus(m)}>
                                {m.is_active ? (
                                  <>
                                    <UserX className="w-3.5 h-3.5 mr-2 text-warning-fg" />
                                    <span>Deactivate member</span>
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="w-3.5 h-3.5 mr-2 text-success-fg" />
                                    <span>Reactivate member</span>
                                  </>
                                )}
                              </DropdownMenuItem>
                            )}

                            {m.role !== 'admin' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => onDeleteMember(m)}
                                >
                                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                                  <span>Delete member</span>
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
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
