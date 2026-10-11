import React, { useState, useEffect } from 'react';
import { X, Plus, AlertCircle, RotateCcw } from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import type { SelectOption } from '@/components/ui/CustomSelect';
import { permissionsService } from '@/services/permissionsService';
import type {
  UserPermissionsProfile,
  UserOverrideItem,
} from '@/services/permissionsService';

interface MemberOverridesSheetProps {
  userId: string | null;
  onClose: () => void;
  onViewAs?: (userId: string) => void;
  onSaved?: () => void;
}

const AVAILABLE_DEPARTMENTS = [
  'Content',
  'Creative',
  'Social media',
  'Website',
  'Sales',
  'HR',
  'Operations',
];

const MODULE_OPTIONS: Record<string, [string, string][]> = {
  daily_log: [
    ['none', 'No access'],
    ['own', 'Own only'],
    ['department', 'Department'],
    ['all', 'All'],
  ],
  attendance: [
    ['none', 'No access'],
    ['own', 'Own only'],
    ['department', 'Department'],
    ['all', 'All'],
  ],
  exceptions: [
    ['none', 'No access'],
    ['department', 'Department'],
    ['all', 'All'],
  ],
  content_calendar: [
    ['none', 'No access'],
    ['view', 'View'],
    ['own_stages', 'Work on own stages'],
    ['manage', 'Manage'],
  ],
  website: [
    ['none', 'No access'],
    ['view', 'View'],
    ['assigned', 'Assigned tasks'],
    ['manage', 'Manage'],
  ],
  sales: [
    ['none', 'No access'],
    ['own', 'Own leads'],
    ['department', 'Department'],
    ['all', 'All'],
  ],
  active_clients: [
    ['none', 'No access'],
    ['view', 'View'],
    ['manage', 'Manage'],
  ],
  ads: [
    ['none', 'No access'],
    ['view', 'View'],
    ['manage', 'Manage'],
  ],
};

const MODULE_TITLES: Record<string, string> = {
  daily_log: 'Daily log',
  attendance: 'Attendance',
  exceptions: 'Exceptions',
  content_calendar: 'Content calendar',
  website: 'Website pipeline',
  sales: 'Sales pipeline',
  active_clients: 'Active clients',
  ads: 'Ads',
};

export const MemberOverridesSheet: React.FC<MemberOverridesSheetProps> = ({
  userId,
  onClose,
  onViewAs,
  onSaved,
}) => {
  const [profile, setProfile] = useState<UserPermissionsProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Editable local state
  const [departments, setDepartments] = useState<string[]>([]);
  const [primaryDept, setPrimaryDept] = useState<string>('');
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({});
  const [originalOverrides, setOriginalOverrides] = useState<Record<string, Record<string, string>>>({});
  const [showAddDept, setShowAddDept] = useState(false);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }

    const loadProfile = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await permissionsService.getUserPermissions(userId);
        setProfile(data);

        const depts = data.user.departments && data.user.departments.length > 0
          ? data.user.departments
          : [data.user.primary_department || 'General'];
        setDepartments(depts);
        setPrimaryDept(data.user.primary_department || depts[0] || '');

        const ovMap: Record<string, Record<string, string>> = {};
        data.overrides.forEach((o) => {
          if (!ovMap[o.department]) ovMap[o.department] = {};
          ovMap[o.department][o.module] = o.level;
        });
        setOverrides(ovMap);
        setOriginalOverrides(JSON.parse(JSON.stringify(ovMap)));
      } catch (err: any) {
        setError(err?.response?.data?.detail || err.message || 'Failed to load user permissions');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [userId]);

  if (!userId) return null;

  // Unsaved changes count
  let unsavedCount = 0;
  departments.forEach((d) => {
    const curDeptOvs = overrides[d] || {};
    const origDeptOvs = originalOverrides[d] || {};
    const allMods = Array.from(new Set([...Object.keys(curDeptOvs), ...Object.keys(origDeptOvs)]));
    allMods.forEach((m) => {
      if (curDeptOvs[m] !== origDeptOvs[m]) {
        unsavedCount++;
      }
    });
  });
  if (profile && primaryDept !== profile.user.primary_department) {
    unsavedCount++;
  }

  const handleModuleChange = (dept: string, module: string, level: string) => {
    setOverrides((prev) => ({
      ...prev,
      [dept]: {
        ...(prev[dept] || {}),
        [module]: level,
      },
    }));
  };

  const handleResetDeptToDefault = async (dept: string) => {
    setOverrides((prev) => {
      const copy = { ...prev };
      delete copy[dept];
      return copy;
    });
  };

  const handleAddDepartment = (dept: string) => {
    if (!departments.includes(dept)) {
      setDepartments([...departments, dept]);
    }
    setShowAddDept(false);
  };

  const handleSave = async () => {
    if (!userId) return;
    try {
      setSaving(true);
      setError(null);

      const overrideList: UserOverrideItem[] = [];
      Object.entries(overrides).forEach(([dept, modMap]) => {
        Object.entries(modMap).forEach(([mod, lvl]) => {
          if (lvl) {
            overrideList.push({ department: dept, module: mod, level: lvl });
          }
        });
      });

      await permissionsService.updateUserPermissions(userId, {
        primary_department: primaryDept,
        departments,
        overrides: overrideList,
      });

      onSaved?.();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'Failed to save user permissions');
    } finally {
      setSaving(false);
    }
  };

  const initials = profile?.user.name
    ? profile.user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  const overrideCount = Object.values(overrides).reduce(
    (acc, m) => acc + Object.keys(m).length,
    0
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div className="w-full sm:max-w-xl md:max-w-2xl bg-card border-l border-border h-full flex flex-col shadow-2xl relative">
        {/* Header */}
        <div className="p-6 border-b border-border space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold flex items-center justify-center text-sm border border-indigo-200 dark:border-indigo-800/40">
                {initials}
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground leading-tight">
                  {profile?.user.name || 'Loading user...'}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {profile?.user.role ? profile.user.role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : ''} · {profile?.user.email}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {overrideCount > 0 && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
                Custom · {overrideCount}
              </span>
            )}
            {onViewAs && (
              <button
                type="button"
                onClick={() => onViewAs(userId)}
                className="px-3 py-1 text-xs font-medium text-foreground bg-background hover:bg-muted/50 border border-border rounded-lg transition-colors"
              >
                View as
              </button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Access per department. Secondary departments start restricted.
          </p>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading && !profile ? (
            <div className="py-16 text-center text-xs text-muted-foreground">
              Loading permissions profile...
            </div>
          ) : (
            <>
              {departments.map((dept) => {
                const isPrimary = dept.toLowerCase() === primaryDept.toLowerCase();
                const deptOvs = overrides[dept] || {};

                return (
                  <div
                    key={dept}
                    className="bg-background rounded-xl border border-border overflow-hidden shadow-xs"
                  >
                    {/* Dept Card Header */}
                    <div className="px-5 py-3.5 border-b border-border/80 flex items-center justify-between bg-muted/20">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-foreground">{dept}</span>
                        {isPrimary ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40">
                            Primary
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground border border-border/60">
                            Secondary
                          </span>
                        )}
                      </div>

                      {isPrimary ? (
                        <span className="text-[11px] text-muted-foreground">
                          Role default: {profile?.user.role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleResetDeptToDefault(dept)}
                          className="text-[11px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reset to role default
                        </button>
                      )}
                    </div>

                    {/* Module Rows */}
                    <div className="divide-y divide-border/60">
                      {(isPrimary
                        ? ['daily_log', 'attendance', 'content_calendar', 'website']
                        : ['daily_log', 'exceptions', 'content_calendar']
                      ).map((mod) => {
                        const currentVal =
                          deptOvs[mod] ||
                          (isPrimary
                            ? (profile?.user.role === 'team_lead'
                                ? (mod === 'daily_log' ? 'department' : mod === 'content_calendar' || mod === 'website' ? 'manage' : 'own')
                                : (mod === 'content_calendar' ? 'own_stages' : mod === 'website' ? 'none' : 'own'))
                            : 'none');

                        const isOverridden = Boolean(deptOvs[mod]);
                        const options: SelectOption[] = (MODULE_OPTIONS[mod] || []).map(([v, l]) => ({
                          value: v,
                          label: l,
                        }));

                        let subtitle = 'Role default';
                        if (mod === 'daily_log') {
                          subtitle = isPrimary ? 'Role default · Own only' : 'Secondary default · logs stay private';
                        } else if (mod === 'content_calendar') {
                          subtitle = isPrimary
                            ? 'Content stages: Content, Content revision'
                            : (isOverridden ? 'Custom override' : 'Secondary default');
                        } else if (mod === 'exceptions') {
                          subtitle = 'Secondary default';
                        }

                        return (
                          <div
                            key={mod}
                            className="p-4 flex items-center justify-between gap-4 hover:bg-muted/10 transition-colors"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-foreground">
                                  {MODULE_TITLES[mod]}
                                </span>
                                {isOverridden && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
                                    Custom
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground">{subtitle}</p>
                            </div>

                            <div className="w-48 shrink-0">
                              <CustomSelect
                                value={currentVal}
                                onChange={(val) => handleModuleChange(dept, mod, val)}
                                options={options}
                                size="sm"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Add Department Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAddDept(!showAddDept)}
                  className="w-full py-2.5 px-4 rounded-xl border border-dashed border-border hover:border-foreground/40 bg-muted/20 hover:bg-muted/40 text-xs font-medium text-foreground flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus className="w-4 h-4 text-muted-foreground" />
                  Add department
                </button>

                {showAddDept && (
                  <div className="absolute left-0 right-0 mt-2 p-2 bg-popover rounded-xl border border-border shadow-lg z-20 space-y-1">
                    {AVAILABLE_DEPARTMENTS.filter((d) => !departments.includes(d)).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => handleAddDepartment(d)}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Sticky Form Footer */}
        <div className="p-4 border-t border-border bg-card flex items-center justify-between">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            {unsavedCount > 0 ? (
              <>
                <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400 inline-block" />
                <span className="font-medium text-foreground">
                  {unsavedCount} unsaved {unsavedCount === 1 ? 'change' : 'changes'}
                </span>
              </>
            ) : (
              <span>All changes saved</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-medium text-foreground bg-background hover:bg-muted/50 border border-border rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || unsavedCount === 0}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-xs disabled:opacity-50 disabled:pointer-events-none"
            >
              {saving ? 'Saving...' : 'Save permissions'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
