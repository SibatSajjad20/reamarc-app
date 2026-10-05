import React, { useState, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Edit2,
  Trash2,
  Shield,
  Layers,
  Lock,
  Briefcase,
} from 'lucide-react';
import type { UserRole } from '../../../types/auth';
import type { AdminMember } from '../../../types/admin';
import type { Workspace } from '../../../types';
import { CustomSelect } from '../../ui/CustomSelect';
import {
  getDeptBadgeClass,
  getRoleBadgeClass,
  getRoleLabel,
  getInitials,
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
  isLoading: boolean;
  onAddMember: (defaultRole?: UserRole) => void;
  onEditMember: (member: AdminMember) => void;
  onDeleteMember: (member: AdminMember) => void;
  canManageMembers?: boolean;
}

export const UserManagementSection: React.FC<UserManagementSectionProps> = ({
  members,
  workspaces = [],
  isLoading,
  onAddMember,
  onEditMember,
  onDeleteMember,
  canManageMembers = true,
}) => {
  const [directoryTab, setDirectoryTab] = useState<DirectoryTab>('team');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');

  const workspaceNameById = useMemo(() => {
    const map: Record<string, string> = {};
    workspaces.forEach((ws) => {
      map[ws.id] = ws.name;
    });
    return map;
  }, [workspaces]);

  const linkedClientNames = (member: AdminMember) => {
    const ids = member.workspace_ids || [];
    if (ids.length === 0) return '—';
    return ids.map((id) => workspaceNameById[id] || 'Unknown client').join(', ');
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
      const clientLabel = linkedClientNames(m);

      const matchesSearch =
        !q ||
        (m.full_name && m.full_name.toLowerCase().includes(q)) ||
        (m.email && m.email.toLowerCase().includes(q)) ||
        (m.phone && m.phone.toLowerCase().includes(q)) ||
        (effectiveDept && effectiveDept.toLowerCase().includes(q)) ||
        (m.role && m.role.toLowerCase().includes(q)) ||
        clientLabel.toLowerCase().includes(q);

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
  }, [tabMembers, searchQuery, roleFilter, departmentFilter, directoryTab, workspaceNameById]);

  const departmentOptions = useMemo(() => {
    return [
      { value: 'all', label: 'All Departments' },
      ...SYSTEM_DEPARTMENTS.map((dept) => ({ value: dept, label: dept })),
    ];
  }, []);

  const roleOptions = useMemo(() => {
    return [
      { value: 'all', label: 'All Roles' },
      ...SYSTEM_ROLES.map((r) => ({ value: r.id, label: r.label })),
    ];
  }, []);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-zinc-50/50 dark:bg-[#0c0d12]">
      {/* Top Section Header & Controls */}
      <div className="p-5 border-b border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#10121a] flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-base font-bold text-zinc-950 dark:text-zinc-50">Team & Role Directory</h1>
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
              {isLoading ? (
                <span className="inline-block w-10 h-3 bg-zinc-300 dark:bg-zinc-700 rounded animate-pulse align-middle" />
              ) : (
                `${filteredMembers.length} ${filteredMembers.length === 1 ? 'user' : 'users'}`
              )}
            </span>
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
            {directoryTab === 'clients'
              ? 'Client portal logins, kept separate from the internal team'
              : 'Manage organization members, assign departmental roles, and manage access'}
          </p>
          <div className="mt-3 flex items-center gap-1 p-0.5 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 w-fit">
            <button
              type="button"
              onClick={() => {
                setDirectoryTab('team');
                setRoleFilter('all');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                directoryTab === 'team'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              Team
            </button>
            <button
              type="button"
              onClick={() => {
                setDirectoryTab('clients');
                setRoleFilter('all');
                setDepartmentFilter('all');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                directoryTab === 'clients'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              Client Accounts
            </button>
          </div>
        </div>

        {canManageMembers && (
          <button
            type="button"
            onClick={() => onAddMember(directoryTab === 'clients' ? 'client' : 'team_member')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-indigo-600/20 hover:shadow-indigo-600/30 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer select-none"
          >
            <UserPlus className="w-4 h-4" />
            <span>{directoryTab === 'clients' ? 'Add Client Account' : 'Add Member'}</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800/80 bg-white/70 dark:bg-[#10121a]/70 backdrop-blur-sm flex flex-wrap items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder={
              directoryTab === 'clients'
                ? 'Search by name, email, phone, or client...'
                : 'Search by name, email, department, phone...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-xl focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none text-zinc-900 dark:text-zinc-100 transition-all shadow-2xs"
          />
        </div>

        {directoryTab === 'team' && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-48">
              <CustomSelect
                value={departmentFilter}
                onChange={setDepartmentFilter}
                options={departmentOptions}
                icon={Layers}
                placeholder="All Departments"
              />
            </div>
            <div className="w-40">
              <CustomSelect
                value={roleFilter}
                onChange={setRoleFilter}
                options={roleOptions}
                icon={Shield}
                placeholder="All Roles"
              />
            </div>
          </div>
        )}
      </div>

      {/* Directory Table */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                <th className="py-3 px-4">Member</th>
                {directoryTab === 'clients' ? (
                  <th className="py-3 px-4">Linked clients</th>
                ) : (
                  <>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Department</th>
                  </>
                )}
                <th className="py-3 px-4">Contact</th>
                {canManageMembers && <th className="py-3 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 text-xs">
              {isLoading ? (
                Array.from({ length: 12 }).map((_, idx) => (
                  <tr key={`member-skeleton-${idx}`} className="animate-pulse">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
                        <div className="space-y-1">
                          <div className="h-3.5 w-28 bg-zinc-200 dark:bg-zinc-800 rounded" />
                          <div className="h-2.5 w-36 bg-zinc-200 dark:bg-zinc-800 rounded" />
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-5 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
                    </td>
                    {directoryTab === 'team' && (
                      <td className="py-3.5 px-4">
                        <div className="h-5 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
                      </td>
                    )}
                    <td className="py-3.5 px-4">
                      <div className="h-3.5 w-24 bg-zinc-200 dark:bg-zinc-800 rounded" />
                    </td>
                    {canManageMembers && (
                      <td className="py-3.5 px-4 text-right">
                        <div className="h-6 w-14 bg-zinc-200 dark:bg-zinc-800 rounded-lg ml-auto" />
                      </td>
                    )}
                  </tr>
                ))
              ) : filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={canManageMembers ? (directoryTab === 'clients' ? 4 : 5) : (directoryTab === 'clients' ? 3 : 4)} className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 mb-3">
                        {directoryTab === 'clients' ? <Briefcase className="w-6 h-6" /> : <Users className="w-6 h-6" />}
                      </div>
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        {directoryTab === 'clients' ? 'No client accounts found' : 'No members found'}
                      </h3>
                      <p className="text-xs text-zinc-400 mt-1 max-w-sm">
                        {directoryTab === 'clients'
                          ? 'Client portal logins appear here, separate from the internal team directory.'
                          : 'Try adjusting your search query or department/role filters.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredMembers.map((m) => {
                  const initials = getInitials(m.full_name, m.email);
                  const isGlobalRole = m.role === 'admin' || m.role === 'hr' || m.role === 'operations';

                  return (
                    <tr
                      key={m.id}
                      className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors group"
                    >
                      {/* Member Name + Email */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-zinc-900 dark:text-zinc-100 truncate">
                              {m.full_name || 'User'}
                            </div>
                            <div className="text-[11px] text-zinc-400 truncate">{m.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role / Linked clients */}
                      {directoryTab === 'clients' ? (
                        <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-400 text-[11px]">
                          {linkedClientNames(m)}
                        </td>
                      ) : (
                        <>
                          <td className="py-3.5 px-4">
                            <span className={getRoleBadgeClass(m.role)}>
                              {getRoleLabel(m.role)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            {!m.department && !isGlobalRole ? (
                              <span className="text-zinc-400 italic text-[11px]">—</span>
                            ) : isGlobalRole ? (
                              <span className={getDeptBadgeClass('All')}>All</span>
                            ) : (
                              <div className="flex flex-wrap items-center gap-1">
                                {(Array.isArray(m.departments) && m.departments.length > 0
                                  ? m.departments
                                  : (m.department || '')
                                      .split(/[,;/]|\band\b|&/i)
                                      .map((s) => s.trim())
                                      .filter(Boolean)
                                ).map((d) => (
                                  <span key={d} className={getDeptBadgeClass(d)}>
                                    {d}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </>
                      )}

                      {/* Contact Phone */}
                      <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-400 font-numeric text-[11px]">
                        {formatPhoneDisplay(m.phone)}
                      </td>

                      {/* Actions */}
                      {canManageMembers && (
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {m.role === 'admin' ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/60 dark:border-zinc-700/60"
                                title="Super Admin accounts cannot be edited from the directory"
                              >
                                <Lock className="w-3 h-3" />
                                <span>Protected</span>
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onEditMember(m)}
                                  className="p-1.5 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition cursor-pointer"
                                  title="Edit member"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDeleteMember(m)}
                                  className="p-1.5 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition cursor-pointer"
                                  title="Delete member"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

