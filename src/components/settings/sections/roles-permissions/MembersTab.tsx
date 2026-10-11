import React, { useState, useEffect } from 'react';
import { Search, AlertCircle } from 'lucide-react';
import { CustomSelect, type SelectOption } from '@/components/ui/CustomSelect';
import {
  permissionsService,
  type MembersListResponse,
} from '@/services/permissionsService';
import { MemberOverridesSheet } from './MemberOverridesSheet';
import { ViewAsPreview } from './ViewAsPreview';

const ROLE_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'All roles' },
  { value: 'admin', label: 'Admin' },
  { value: 'hr', label: 'HR' },
  { value: 'operations', label: 'Operations' },
  { value: 'team_lead', label: 'Team lead' },
  { value: 'team_member', label: 'Team member' },
];

const DEPT_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'All departments' },
  { value: 'Content', label: 'Content' },
  { value: 'Creative', label: 'Creative' },
  { value: 'Social media', label: 'Social media' },
  { value: 'Website', label: 'Website' },
  { value: 'Sales', label: 'Sales' },
  { value: 'HR', label: 'HR' },
];

const OVERRIDE_OPTIONS: SelectOption[] = [
  { value: 'any', label: 'Any overrides' },
  { value: 'has_overrides', label: 'Has overrides' },
  { value: 'role_default_only', label: 'Role default only' },
];

// Consistent color palette for initials avatar
const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/40',
  'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800/40',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800/40',
  'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800/40',
  'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800/40',
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export const MembersTab: React.FC = () => {
  const [data, setData] = useState<MembersListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [overrideFilter, setOverrideFilter] = useState('any');

  // Interactive sheet / preview modals
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [viewAsUserId, setViewAsUserId] = useState<string | null>(null);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await permissionsService.listUsers({
        search: search.trim() || undefined,
        role: roleFilter,
        dept: deptFilter,
        custom: overrideFilter,
      });
      setData(res);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [roleFilter, deptFilter, overrideFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMembers();
  };

  const members = data?.members || [];
  const total = data?.total_directory || 0;
  const customCount = data?.total_custom || 0;

  // If in View As preview mode, render the ViewAs diagnostic panel
  if (viewAsUserId) {
    return (
      <ViewAsPreview
        initialUserId={viewAsUserId}
        membersList={members}
        onExit={() => setViewAsUserId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-background border border-border rounded-xl focus:outline-hidden focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground"
          />
        </form>

        <div className="flex flex-wrap items-center gap-3">
          <div className="w-36">
            <CustomSelect
              value={roleFilter}
              onChange={(val) => setRoleFilter(val)}
              options={ROLE_OPTIONS}
              size="sm"
            />
          </div>
          <div className="w-40">
            <CustomSelect
              value={deptFilter}
              onChange={(val) => setDeptFilter(val)}
              options={DEPT_OPTIONS}
              size="sm"
            />
          </div>
          <div className="w-40">
            <CustomSelect
              value={overrideFilter}
              onChange={(val) => setOverrideFilter(val)}
              options={OVERRIDE_OPTIONS}
              size="sm"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Members Table */}
      <div className="bg-card rounded-2xl border border-border shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-muted-foreground font-medium uppercase tracking-wider text-[11px]">
                <th className="py-3 px-6">Person</th>
                <th className="py-3 px-6">Role</th>
                <th className="py-3 px-6">Departments</th>
                <th className="py-3 px-6">Permissions</th>
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading && members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    Loading directory...
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    No members found matching filter criteria.
                  </td>
                </tr>
              ) : (
                members.map((member) => {
                  const initials = member.name
                    ? member.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()
                    : 'U';

                  const roleFormatted = member.role
                    .replace('_', ' ')
                    .replace(/\b\w/g, (l) => l.toUpperCase());

                  const depts = member.departments || [];
                  const primary = member.primary_department || depts[0] || '';

                  return (
                    <tr key={member.id} className="hover:bg-muted/10 transition-colors">
                      {/* Person */}
                      <td className="py-3.5 px-6">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-full font-semibold flex items-center justify-center text-xs border ${getAvatarColor(
                              member.name
                            )}`}
                          >
                            {initials}
                          </div>
                          <span className="font-semibold text-foreground">
                            {member.name}
                          </span>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-3.5 px-6 font-medium text-foreground">
                        {roleFormatted}
                      </td>

                      {/* Departments */}
                      <td className="py-3.5 px-6">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {depts.map((d) => {
                            const isPrimary = d.toLowerCase() === primary.toLowerCase();
                            return isPrimary ? (
                              <span
                                key={d}
                                className="px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/40"
                              >
                                {d} · primary
                              </span>
                            ) : (
                              <span
                                key={d}
                                className="px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground border border-border/60"
                              >
                                {d}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      {/* Permissions */}
                      <td className="py-3.5 px-6">
                        {member.has_custom ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/40">
                            Custom · {member.override_count}
                          </span>
                        ) : (
                          <span className="text-muted-foreground font-normal">
                            Role default
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-6 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setViewAsUserId(member.id)}
                            className="px-3 py-1 text-xs font-medium text-foreground bg-background hover:bg-muted/50 border border-border rounded-lg transition-colors"
                          >
                            View as
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingUserId(member.id)}
                            className="px-3 py-1 text-xs font-medium text-foreground bg-background hover:bg-muted/50 border border-border rounded-lg transition-colors"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border bg-muted/10 text-xs text-muted-foreground">
          {members.length} of {total} people · {customCount} have custom permissions
        </div>
      </div>

      {/* Member Overrides Sheet Drawer */}
      {editingUserId && (
        <MemberOverridesSheet
          userId={editingUserId}
          onClose={() => setEditingUserId(null)}
          onViewAs={(uid) => {
            setEditingUserId(null);
            setViewAsUserId(uid);
          }}
          onSaved={() => {
            fetchMembers();
          }}
        />
      )}
    </div>
  );
};
