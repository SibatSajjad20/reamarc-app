import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  Lock,
  MoreVertical,
  RotateCcw,
  Search,
  Shield,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { CustomSelect } from '@/components/ui/CustomSelect';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  accessService,
  type AccessUserRow,
} from '@/services/accessService';
import { cn } from '@/lib/utils';

type ModuleKey =
  | 'attendance'
  | 'daily_log'
  | 'sales'
  | 'content_calendar'
  | 'website'
  | 'ads';

interface ModuleColumnMeta {
  key: ModuleKey;
  label: string;
  shortLabel: string;
}

const MODULE_COLUMNS: ModuleColumnMeta[] = [
  { key: 'attendance', label: 'Attendance', shortLabel: 'Attendance' },
  { key: 'daily_log', label: 'Daily log', shortLabel: 'Daily log' },
  { key: 'sales', label: 'Sales pipeline', shortLabel: 'Sales' },
  { key: 'content_calendar', label: 'Content calendar', shortLabel: 'Content' },
  { key: 'website', label: 'Website pipeline', shortLabel: 'Website' },
  { key: 'ads', label: 'Performance marketing', shortLabel: 'Marketing' },
];

const STAGE_OPTIONS = [
  { id: 'content', label: 'Content' },
  { id: 'creative', label: 'Creative' },
  { id: 'social_media', label: 'Social media' },
];

const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'team_lead', label: 'Team Lead' },
  { value: 'team_member', label: 'Team Member' },
  { value: 'operations', label: 'Operations' },
  { value: 'hr', label: 'HR' },
  { value: 'admin', label: 'Admin' },
];

export const AccessSection: React.FC = () => {
  const { user: currentUser, refreshUser } = useAuth();
  const { addToast } = useToast();
  const confirm = useConfirm();

  const [users, setUsers] = useState<AccessUserRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [changedOnly, setChangedOnly] = useState<boolean>(false);
  const [mutatingUsers, setMutatingUsers] = useState<Record<string, boolean>>({});

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await accessService.getUsers({
        department: selectedDept || undefined,
        role: selectedRole || undefined,
        q: searchQuery.trim() || undefined,
        changed_only: changedOnly,
      });
      setUsers(data || []);
    } catch (err: any) {
      addToast(
        'Failed to load access settings',
        err.message || 'Could not fetch employee list',
        'error'
      );
    } finally {
      setIsLoading(false);
    }
  }, [selectedDept, selectedRole, searchQuery, changedOnly, addToast]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // Distinct department list from loaded users for the dropdown
  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    users.forEach((u) => {
      if (u.primary_department) set.add(u.primary_department);
    });
    const depts = Array.from(set).sort();
    return [
      { value: '', label: 'All departments' },
      ...depts.map((d) => ({ value: d, label: d })),
    ];
  }, [users]);

  // Optimistic switch toggle handler
  const handleToggleModule = async (
    targetUser: AccessUserRow,
    mod: ModuleKey,
    nextValue: boolean
  ) => {
    const prevUsers = users;

    // Optimistically update
    setUsers((current) =>
      current.map((u) => {
        if (u.id !== targetUser.id) return u;
        return {
          ...u,
          modules: {
            ...u.modules,
            [mod]: {
              ...u.modules[mod],
              value: nextValue,
              changed: nextValue !== u.modules[mod].default,
            },
          },
        };
      })
    );

    setMutatingUsers((prev) => ({ ...prev, [`${targetUser.id}:${mod}`]: true }));

    try {
      const updated = await accessService.patchUser(targetUser.id, {
        module: mod,
        value: nextValue,
      });

      // Update with server truth
      setUsers((current) =>
        current.map((u) => (u.id === targetUser.id ? updated : u))
      );

      const modMeta = MODULE_COLUMNS.find((c) => c.key === mod);
      addToast(
        `${modMeta?.label || mod} ${nextValue ? 'turned on' : 'turned off'} for ${targetUser.name}`,
        undefined,
        'success'
      );

      // Invalidate auth/me if editing own profile
      if (targetUser.id === currentUser?.id) {
        void refreshUser();
      }
    } catch (err: any) {
      // Rollback
      setUsers(prevUsers);
      addToast(
        'Update failed',
        err.message || `Could not update access for ${targetUser.name}`,
        'error'
      );
    } finally {
      setMutatingUsers((prev) => {
        const next = { ...prev };
        delete next[`${targetUser.id}:${mod}`];
        return next;
      });
    }
  };

  // Reset a single module or whole row
  const handleResetUser = async (targetUser: AccessUserRow, mod?: ModuleKey) => {
    const prevUsers = users;
    setMutatingUsers((prev) => ({
      ...prev,
      [`${targetUser.id}:${mod || 'all'}`]: true,
    }));

    try {
      const updated = await accessService.resetUser(targetUser.id, mod);
      setUsers((current) =>
        current.map((u) => (u.id === targetUser.id ? updated : u))
      );

      const label = mod ? MODULE_COLUMNS.find((c) => c.key === mod)?.label : 'All settings';
      addToast(
        `${label} reset to default for ${targetUser.name}`,
        undefined,
        'success'
      );

      if (targetUser.id === currentUser?.id) {
        void refreshUser();
      }
    } catch (err: any) {
      setUsers(prevUsers);
      addToast(
        'Reset failed',
        err.message || `Could not reset access for ${targetUser.name}`,
        'error'
      );
    } finally {
      setMutatingUsers((prev) => {
        const next = { ...prev };
        delete next[`${targetUser.id}:${mod || 'all'}`];
        return next;
      });
    }
  };

  // Extra content stages toggle
  const handleToggleStage = async (
    targetUser: AccessUserRow,
    stageId: string,
    checked: boolean
  ) => {
    const lockedStage = targetUser.content_stages.locked;
    if (lockedStage === stageId) return; // Locked primary stage cannot be toggled

    const currentExtra = targetUser.content_stages.extra;
    const newExtra = checked
      ? Array.from(new Set([...currentExtra, stageId]))
      : currentExtra.filter((s) => s !== stageId);

    const allStagesToSubmit = lockedStage
      ? Array.from(new Set([lockedStage, ...newExtra]))
      : newExtra;

    try {
      const updated = await accessService.patchUser(targetUser.id, {
        content_stages: allStagesToSubmit,
      });

      setUsers((current) =>
        current.map((u) => (u.id === targetUser.id ? updated : u))
      );

      addToast(
        `Updated content calendar stages for ${targetUser.name}`,
        undefined,
        'success'
      );

      if (targetUser.id === currentUser?.id) {
        void refreshUser();
      }
    } catch (err: any) {
      addToast(
        'Failed to update stages',
        err.message || 'Could not update content stages',
        'error'
      );
    }
  };

  // Bulk apply ON/OFF across current filter
  const handleBulkApply = async (mod: ModuleKey, value: boolean) => {
    const modMeta = MODULE_COLUMNS.find((c) => c.key === mod);
    const deptLabel = selectedDept ? selectedDept : 'all departments';
    const roleLabel = selectedRole ? selectedRole.replace('_', ' ') : 'all roles';

    // Count eligible candidates in current view
    const eligibleCount = users.filter((u) => {
      if (u.role === 'admin' || u.role === 'client') return false;
      return true;
    }).length;

    const ok = await confirm({
      title: `Apply ${value ? 'ON' : 'OFF'} to ${modMeta?.label}?`,
      description: `This will turn ${modMeta?.label} ${value ? 'ON' : 'OFF'} for ${eligibleCount} employee(s) in ${deptLabel} (${roleLabel}).`,
      confirmLabel: `Apply ${value ? 'ON' : 'OFF'}`,
      tone: value ? 'default' : 'danger',
    });

    if (!ok) return;

    try {
      const result = await accessService.bulkApply({
        department: selectedDept || undefined,
        role: selectedRole || undefined,
        module: mod,
        value,
      });

      addToast(
        `Applied to ${result.changed} user(s)`,
        `${modMeta?.label} is now ${value ? 'ON' : 'OFF'}`,
        'success'
      );
      void loadUsers();
    } catch (err: any) {
      addToast(
        'Bulk update failed',
        err.message || 'Could not perform bulk apply',
        'error'
      );
    }
  };

  const formatRoleLabel = (role: string) => {
    switch (role) {
      case 'team_lead':
        return 'Team Lead';
      case 'team_member':
        return 'Team Member';
      case 'operations':
        return 'Operations';
      case 'hr':
        return 'HR';
      case 'admin':
        return 'Admin';
      default:
        return role;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-fg flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-accent" strokeWidth={1.5} />
            <span>Access</span>
          </h2>
          <p className="text-sm text-fg-muted mt-0.5">
            Turn modules on or off per person. Levels follow each person's role.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="p-3.5 bg-surface border border-border rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search
              size={15}
              strokeWidth={1.5}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search by employee name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8.5 pl-9 pr-3 text-sm bg-subtle/60 border border-border rounded-lg text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-colors"
            />
          </div>

          {/* Department Filter */}
          <div className="w-44">
            <CustomSelect
              value={selectedDept}
              onChange={setSelectedDept}
              options={departmentOptions}
              placeholder="All departments"
            />
          </div>

          {/* Role Filter */}
          <div className="w-40">
            <CustomSelect
              value={selectedRole}
              onChange={setSelectedRole}
              options={ROLE_OPTIONS}
              placeholder="All roles"
            />
          </div>
        </div>

        {/* Changed Only Toggle */}
        <div className="flex items-center gap-2 pl-2 border-l border-border/80">
          <Switch
            id="changed-only-switch"
            checked={changedOnly}
            onCheckedChange={setChangedOnly}
          />
          <label
            htmlFor="changed-only-switch"
            className="text-xs font-medium text-fg cursor-pointer select-none whitespace-nowrap"
          >
            Changed only
          </label>
        </div>
      </div>

      {/* Table Container */}
      <div className="border border-border rounded-xl bg-surface overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse min-w-[960px]">
            <thead>
              <tr className="bg-subtle/50 border-b border-border text-[12px] font-semibold text-fg-muted uppercase tracking-wider select-none">
                <th className="py-3 px-4 w-[240px] font-medium">Employee</th>
                {MODULE_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="py-3 px-3 text-center font-medium w-[120px]"
                  >
                    <div className="inline-flex items-center justify-center gap-1 group/header">
                      <span>{col.shortLabel}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="w-5 h-5 rounded hover:bg-hover inline-flex items-center justify-center text-fg-muted hover:text-fg transition-colors"
                            title={`Batch actions for ${col.label}`}
                          >
                            <ChevronDown size={12} strokeWidth={1.5} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" className="w-52">
                          <DropdownMenuItem
                            onClick={() => void handleBulkApply(col.key, true)}
                            className="cursor-pointer text-xs"
                          >
                            <Check size={13} className="mr-2 text-success-fg" />
                            <span>Apply ON to all filtered</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => void handleBulkApply(col.key, false)}
                            className="cursor-pointer text-xs text-danger-fg focus:text-danger-fg"
                          >
                            <RotateCcw size={13} className="mr-2" />
                            <span>Apply OFF to all filtered</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </th>
                ))}
                <th className="py-3 px-3 w-12 text-center">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-fg-muted">
                    <div className="inline-flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      <span>Loading access permissions...</span>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-fg-muted">
                    No employees matched the selected filters.
                  </td>
                </tr>
              ) : (
                users.map((row) => {
                  const isAdmin = row.role === 'admin';
                  const isOps = row.role === 'operations';

                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-subtle/30 transition-colors group/row"
                    >
                      {/* Employee Cell */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <Avatar
                            name={row.name}
                            src={row.avatar || undefined}
                            size={32}
                            className="shrink-0"
                          />
                          <div className="min-w-0 flex flex-col">
                            <span className="font-medium text-fg truncate leading-5">
                              {row.name}
                            </span>
                            <span className="text-xs text-fg-muted truncate leading-4">
                              {formatRoleLabel(row.role)}
                              {row.primary_department
                                ? ` · ${row.primary_department}`
                                : isOps
                                ? ' · Company-wide'
                                : ''}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Admin Row Spanning or Regular Module Cells */}
                      {isAdmin ? (
                        <td
                          colSpan={6}
                          className="py-3 px-3 text-center bg-subtle/10"
                        >
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-accent-soft text-accent-text border border-accent/20">
                            <Shield className="w-3.5 h-3.5" strokeWidth={1.5} />
                            <span>Full access · not tracked</span>
                          </span>
                        </td>
                      ) : (
                        MODULE_COLUMNS.map((col) => {
                          const status = row.modules[col.key];
                          const isMutating = Boolean(
                            mutatingUsers[`${row.id}:${col.key}`]
                          );

                          return (
                            <td
                              key={col.key}
                              className="py-3 px-3 text-center align-middle relative group/cell"
                            >
                              <div className="flex flex-col items-center justify-center gap-1.5">
                                <div className="inline-flex items-center gap-1.5">
                                  {/* Operations "View" tag */}
                                  {isOps && col.key !== 'attendance' && (
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted bg-subtle px-1 py-0.5 rounded leading-3 border border-border/40">
                                      View
                                    </span>
                                  )}

                                  {/* The Switch */}
                                  <Switch
                                    checked={status.value}
                                    disabled={isMutating}
                                    onCheckedChange={(checked) =>
                                      void handleToggleModule(
                                        row,
                                        col.key,
                                        checked
                                      )
                                    }
                                    className="data-[state=checked]:bg-[#6847E0]"
                                    aria-label={`${col.label} for ${row.name}`}
                                  />

                                  {/* Changed from default Dot indicator */}
                                  {status.changed && (
                                    <span
                                      className="w-1.5 h-1.5 rounded-full bg-[#6847E0] shrink-0"
                                      title={`Changed from default (${status.default ? 'ON' : 'OFF'})`}
                                    />
                                  )}
                                </div>

                                {/* Content calendar Stages button */}
                                {col.key === 'content_calendar' && status.value && (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        className={cn(
                                          'text-[11px] font-medium px-1.5 py-0.5 rounded border border-border hover:bg-hover text-fg-muted hover:text-fg transition-colors inline-flex items-center gap-1 cursor-pointer',
                                          row.content_stages.extra.length > 0 &&
                                            'bg-accent-soft text-accent-text border-accent/20'
                                        )}
                                      >
                                        <span>
                                          {row.content_stages.extra.length > 0
                                            ? `+${row.content_stages.extra.length} stages`
                                            : 'Stages'}
                                        </span>
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent
                                      align="center"
                                      className="w-64 p-3.5 space-y-3"
                                    >
                                      <div>
                                        <div className="text-xs font-semibold text-fg">
                                          Content Calendar Stages
                                        </div>
                                        <div className="text-[11px] text-fg-muted mt-0.5 leading-tight">
                                          Primary department stage is locked. Check
                                          extra stages to grant access.
                                        </div>
                                      </div>

                                      <div className="space-y-2 pt-1 border-t border-border">
                                        {STAGE_OPTIONS.map((st) => {
                                          const isLocked =
                                            row.content_stages.locked === st.id;
                                          const isChecked =
                                            isLocked ||
                                            row.content_stages.extra.includes(
                                              st.id
                                            );

                                          return (
                                            <div
                                              key={st.id}
                                              className="flex items-center justify-between text-xs py-0.5"
                                            >
                                              <label
                                                htmlFor={`stage-${row.id}-${st.id}`}
                                                className="flex items-center gap-2 cursor-pointer select-none text-fg"
                                              >
                                                <Checkbox
                                                  id={`stage-${row.id}-${st.id}`}
                                                  checked={isChecked}
                                                  disabled={isLocked}
                                                  onCheckedChange={(val) =>
                                                    void handleToggleStage(
                                                      row,
                                                      st.id,
                                                      Boolean(val)
                                                    )
                                                  }
                                                />
                                                <span>{st.label}</span>
                                              </label>
                                              {isLocked && (
                                                <span
                                                  className="inline-flex items-center gap-1 text-[10px] text-fg-muted bg-subtle px-1.5 py-0.5 rounded"
                                                  title="Primary department"
                                                >
                                                  <Lock size={10} />
                                                  <span>Primary</span>
                                                </span>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                )}

                                {/* Reset to default hover link */}
                                {status.changed && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleResetUser(row, col.key)
                                    }
                                    className="text-[10px] text-accent hover:underline opacity-0 group-hover/cell:opacity-100 transition-opacity cursor-pointer mt-0.5"
                                  >
                                    Reset
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        })
                      )}

                      {/* Row Menu Actions */}
                      <td className="py-3 px-3 text-center">
                        {!isAdmin && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="w-7 h-7 rounded hover:bg-hover inline-flex items-center justify-center text-fg-muted hover:text-fg transition-colors"
                              >
                                <MoreVertical size={14} strokeWidth={1.5} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                onClick={() => void handleResetUser(row)}
                                className="cursor-pointer text-xs"
                              >
                                <RotateCcw size={13} className="mr-2" />
                                <span>Reset row to defaults</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Legend */}
        <div className="py-2.5 px-4 bg-subtle/30 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs text-fg-muted select-none">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#6847E0]" />
              <span>Dot = changed from default</span>
            </span>
            <span>·</span>
            <span>Switch off = hidden, not tracked, no reminders</span>
          </div>
          <div>{users.length} employee(s) listed</div>
        </div>
      </div>
    </div>
  );
};
