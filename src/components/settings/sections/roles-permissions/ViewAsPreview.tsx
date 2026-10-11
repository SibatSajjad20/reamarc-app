import React, { useState, useEffect } from 'react';
import { LogOut, AlertCircle } from 'lucide-react';
import { CustomSelect, type SelectOption } from '@/components/ui/CustomSelect';
import {
  permissionsService,
  type ViewAsEffectiveResponse,
  type PermissionMember,
} from '@/services/permissionsService';

interface ViewAsPreviewProps {
  initialUserId: string;
  membersList?: PermissionMember[];
  onExit: () => void;
}

export const ViewAsPreview: React.FC<ViewAsPreviewProps> = ({
  initialUserId,
  membersList = [],
  onExit,
}) => {
  const [selectedUserId, setSelectedUserId] = useState<string>(initialUserId);
  const [data, setData] = useState<ViewAsEffectiveResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedUserId) return;
    const fetchEffective = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await permissionsService.getViewAsEffective(selectedUserId);
        setData(res);
      } catch (err: any) {
        setError(err?.response?.data?.detail || err.message || 'Failed to load preview');
      } finally {
        setLoading(false);
      }
    };
    fetchEffective();
  }, [selectedUserId]);

  const memberOptions: SelectOption[] = membersList.map((m) => ({
    value: m.id,
    label: m.name,
    description: m.role.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
  }));

  const user = data?.user;
  const secondaryDepts = (user?.departments || []).filter(
    (d) => d.toLowerCase() !== user?.primary_department?.toLowerCase()
  );
  const deptSummary = user
    ? `${user.primary_department} (primary)${
        secondaryDepts.length > 0 ? `, ${secondaryDepts.join(', ')}` : ''
      }`
    : '';

  return (
    <div className="space-y-6">
      {/* Top User Picker Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="w-64">
          <CustomSelect
            value={selectedUserId}
            onChange={(val) => setSelectedUserId(val)}
            options={memberOptions}
            placeholder="Select person..."
            size="sm"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Preview uses the same resolver the server enforces.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="py-16 text-center text-xs text-muted-foreground">
          Loading diagnostic preview...
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Card: Allowed Access & Visibility */}
          <div className="lg:col-span-7 bg-card rounded-2xl border border-border shadow-xs overflow-hidden">
            <div className="p-6 border-b border-border flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Viewing as {user?.name}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {user?.role ? user.role.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase()) : ''} · {deptSummary}
                </p>
              </div>
              <button
                type="button"
                onClick={onExit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-background hover:bg-muted/50 border border-border rounded-lg transition-colors"
              >
                <LogOut className="w-3.5 h-3.5 text-muted-foreground" />
                Exit preview
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Sidebar She Sees */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Sidebar she sees
                </h4>
                <div className="flex flex-wrap items-center gap-2">
                  {data.sidebar_items.map((item) => (
                    <span
                      key={item}
                      className="px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/40"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              {/* Module Scope Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground font-medium uppercase tracking-wider text-[11px]">
                      <th className="py-2.5 w-1/4">Module</th>
                      <th className="py-2.5 w-1/2">Scope</th>
                      <th className="py-2.5 w-1/4">Why</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {data.table_rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-muted/10 transition-colors">
                        <td className="py-3 font-semibold text-foreground">
                          {row.module}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {row.scope}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {row.why}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Card: Can't See */}
          <div className="lg:col-span-5 bg-card rounded-2xl border border-border shadow-xs overflow-hidden">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Can't see</h3>
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground border border-border">
                {data.cannot_see.length} items
              </span>
            </div>

            <div className="divide-y divide-border/60">
              {data.cannot_see.map((blocked, idx) => (
                <div
                  key={idx}
                  className="px-6 py-3.5 flex items-center justify-between gap-3 hover:bg-muted/10 transition-colors"
                >
                  <span className="text-xs font-medium text-foreground">
                    {blocked.item}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200/80 dark:border-red-900/40 shrink-0">
                    {blocked.reason}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
