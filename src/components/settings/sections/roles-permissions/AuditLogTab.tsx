import React, { useState, useEffect } from 'react';
import { Search, ArrowRight, AlertCircle } from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import type { SelectOption } from '@/components/ui/CustomSelect';
import { permissionsService } from '@/services/permissionsService';
import type { PermissionAuditItem } from '@/services/permissionsService';

export const AuditLogTab: React.FC = () => {
  const [items, setItems] = useState<PermissionAuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState('30d');
  const [actorFilter, setActorFilter] = useState('Anyone');

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await permissionsService.getAuditLogs({
        search: search.trim() || undefined,
        time_filter: timeFilter,
        actor: actorFilter === 'Anyone' ? undefined : actorFilter,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [timeFilter, actorFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAuditLogs();
  };

  const timeOptions: SelectOption[] = [
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
    { value: 'all', label: 'All time' },
  ];

  // Distinct actors for actor select filter
  const actorsSet = Array.from(
    new Set(items.map((i) => i.actor_name || 'System'))
  );
  const actorOptions: SelectOption[] = [
    { value: 'Anyone', label: 'Anyone' },
    ...actorsSet.map((a) => ({ value: a, label: a })),
  ];

  // Format ISO timestamp to nice "11 Oct, 17:42" in PKT (UTC+5)
  const formatPktTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      // Format in Asia/Karachi timezone
      return d.toLocaleString('en-GB', {
        timeZone: 'Asia/Karachi',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).replace(',', '');
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search changes..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-background border border-border rounded-xl focus:outline-hidden focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground"
          />
        </form>

        <div className="flex items-center gap-3">
          <div className="w-40">
            <CustomSelect
              value={timeFilter}
              onChange={(val) => setTimeFilter(val)}
              options={timeOptions}
              size="sm"
            />
          </div>
          <div className="w-40">
            <CustomSelect
              value={actorFilter}
              onChange={(val) => setActorFilter(val)}
              options={actorOptions}
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

      {/* Table Container */}
      <div className="bg-card rounded-2xl border border-border shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-muted-foreground font-medium uppercase tracking-wider text-[11px]">
                <th className="py-3 px-6">When (PKT)</th>
                <th className="py-3 px-6">Changed by</th>
                <th className="py-3 px-6">Target</th>
                <th className="py-3 px-6">Module</th>
                <th className="py-3 px-6">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    Loading audit trail...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    No permission change events found for this filter.
                  </td>
                </tr>
              ) : (
                items.map((log) => {
                  const targetDisplay = log.target_name || log.target_id;

                  return (
                    <tr key={log.id} className="hover:bg-muted/10 transition-colors">
                      <td className="py-3.5 px-6 font-medium text-foreground whitespace-nowrap">
                        {formatPktTime(log.at)}
                      </td>
                      <td className="py-3.5 px-6 font-semibold text-foreground whitespace-nowrap">
                        {log.actor_name || 'System'}
                      </td>
                      <td className="py-3.5 px-6 text-foreground whitespace-nowrap">
                        {targetDisplay}
                      </td>
                      <td className="py-3.5 px-6 font-medium text-foreground whitespace-nowrap">
                        {log.module}
                      </td>
                      <td className="py-3.5 px-6">
                        <div className="inline-flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground border border-border/80">
                            {log.before}
                          </span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground" />
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40">
                            {log.after}
                          </span>
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
          {total} {total === 1 ? 'change' : 'changes'} · kept for 1 year
        </div>
      </div>
    </div>
  );
};
