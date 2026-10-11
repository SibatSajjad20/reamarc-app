import React, { useState, useEffect } from 'react';
import { Info, RotateCcw, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CustomSelect, type SelectOption } from '@/components/ui/CustomSelect';
import {
  permissionsService,
  type RoleDefaultsResponse,
} from '@/services/permissionsService';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  hr: 'HR',
  operations: 'Operations',
  team_lead: 'Team lead',
  team_member: 'Team member',
};

const MODULE_DISPLAY_ORDER = [
  'daily_log',
  'attendance',
  'exceptions',
  'content_calendar',
  'website',
  'sales',
  'active_clients',
  'ads',
];

const MODULE_AVAILABLE_STRINGS: Record<string, string> = {
  daily_log: 'Own only · Department · All',
  attendance: 'Own only · Department · All',
  exceptions: 'No access · Department · All',
  content_calendar: 'No access · View · Work on own stages · Manage',
  website: 'No access · View · Assigned tasks · Manage',
  sales: 'No access · Own leads · Department · All',
  active_clients: 'No access · View · Manage',
  ads: 'No access · View · Manage',
};

export const RoleDefaultsTab: React.FC = () => {
  const [data, setData] = useState<RoleDefaultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('team_lead');
  const [editedDefaults, setEditedDefaults] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchDefaults = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await permissionsService.getRoleDefaults();
      setData(res);
      setEditedDefaults(res.defaults);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'Failed to load role defaults');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDefaults();
  }, []);

  const currentRoleDefaults = editedDefaults[selectedRole] || data?.defaults[selectedRole] || {};
  const originalRoleDefaults = data?.defaults[selectedRole] || {};

  const hasChanges = Object.keys(currentRoleDefaults).some(
    (mod) => currentRoleDefaults[mod] !== originalRoleDefaults[mod]
  );

  const handleLevelChange = (mod: string, level: string) => {
    setEditedDefaults((prev) => ({
      ...prev,
      [selectedRole]: {
        ...(prev[selectedRole] || {}),
        [mod]: level,
      },
    }));
  };

  const handleDiscard = () => {
    if (!data) return;
    setEditedDefaults((prev) => ({
      ...prev,
      [selectedRole]: { ...data.defaults[selectedRole] },
    }));
  };

  const handleSave = async () => {
    if (selectedRole === 'admin') return;
    try {
      setSaving(true);
      setError(null);
      await permissionsService.updateRoleDefaults(selectedRole, currentRoleDefaults);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await fetchDefaults();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToSystemDefaults = async () => {
    if (selectedRole === 'admin') return;
    if (!window.confirm(`Reset ${ROLE_LABELS[selectedRole]} permissions to system defaults?`)) return;
    try {
      setSaving(true);
      setError(null);
      await permissionsService.resetRoleDefaults(selectedRole);
      await fetchDefaults();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'Failed to reset role defaults');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="py-12 flex justify-center items-center text-muted-foreground text-sm">
        Loading role defaults...
      </div>
    );
  }

  const memberCount = data?.member_counts[selectedRole] ?? 0;
  const overrideCount = data?.override_counts[selectedRole] ?? 0;
  const roleLabel = ROLE_LABELS[selectedRole] || selectedRole;

  return (
    <div className="space-y-6">
      {/* Role Picker Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="inline-flex p-1 bg-muted/60 dark:bg-muted/40 rounded-xl border border-border/50 max-w-fit">
          {['admin', 'hr', 'operations', 'team_lead', 'team_member'].map((r) => {
            const isSelected = selectedRole === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setSelectedRole(r)}
                className={cn(
                  'px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all',
                  isSelected
                    ? 'bg-card text-foreground shadow-xs border border-border/80'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {ROLE_LABELS[r]}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Changes apply to everyone with this role unless they have a custom override.
        </p>
      </div>

      {/* Amber Callout Notice */}
      <div className="flex items-start gap-3 p-3.5 rounded-xl border border-amber-200/80 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-xs leading-relaxed">
        <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div>
          Team members never see team leads' logs. Secondary departments grant module work (stages, tasks) only, not logs or attendance, unless enabled per person.
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Role Defaults Card */}
      <div className="bg-card rounded-2xl border border-border shadow-xs overflow-hidden">
        {/* Card Header */}
        <div className="px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {roleLabel}{' '}
              <span className="font-normal text-muted-foreground">
                · {memberCount} {memberCount === 1 ? 'person' : 'people'}
                {overrideCount > 0 && ` · ${overrideCount} with custom overrides`}
              </span>
            </h3>
          </div>
          {selectedRole !== 'admin' && (
            <button
              type="button"
              onClick={handleResetToSystemDefaults}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-background hover:bg-muted/50 border border-border rounded-lg transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
              Reset to system defaults
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-muted-foreground font-medium uppercase tracking-wider text-[11px]">
                <th className="py-3 px-6 w-1/4">Module</th>
                <th className="py-3 px-6 w-1/4">Access level</th>
                <th className="py-3 px-6 w-1/3">Available levels</th>
                <th className="py-3 px-6">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {MODULE_DISPLAY_ORDER.map((mod) => {
                const cfg = data?.module_config[mod];
                if (!cfg) return null;

                const currentLevel = currentRoleDefaults[mod] || 'none';
                const options: SelectOption[] = cfg.levels.map(([val, lbl]) => ({
                  value: val,
                  label: lbl,
                }));

                const isAdmin = selectedRole === 'admin';

                return (
                  <tr key={mod} className="hover:bg-muted/10 transition-colors">
                    <td className="py-3.5 px-6 font-semibold text-foreground">
                      {cfg.label}
                    </td>
                    <td className="py-3.5 px-6">
                      <div className="w-48">
                        <CustomSelect
                          value={currentLevel}
                          onChange={(val) => handleLevelChange(mod, val)}
                          options={options}
                          size="sm"
                          disabled={isAdmin}
                        />
                      </div>
                    </td>
                    <td className="py-3.5 px-6 text-muted-foreground">
                      {MODULE_AVAILABLE_STRINGS[mod] || '—'}
                    </td>
                    <td className="py-3.5 px-6 text-muted-foreground">
                      {cfg.notes || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Footer */}
      {selectedRole !== 'admin' && (
        <div className="flex items-center justify-end gap-3 pt-2">
          {saveSuccess && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium mr-2">
              <Check className="w-3.5 h-3.5" /> Defaults saved successfully
            </span>
          )}
          <button
            type="button"
            onClick={handleDiscard}
            disabled={!hasChanges || saving}
            className="px-4 py-2 text-xs font-medium text-foreground bg-background hover:bg-muted/50 border border-border rounded-xl transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-xs disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5"
          >
            {saving ? 'Saving...' : 'Save role defaults'}
          </button>
        </div>
      )}
    </div>
  );
};
