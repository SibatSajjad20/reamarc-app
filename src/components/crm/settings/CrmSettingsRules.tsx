import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Users, SlidersHorizontal, AlertCircle } from 'lucide-react';
import { CustomSelect } from '../../ui/CustomSelect';
import { crmService } from '../../../services/crmService';
import { useToast } from '../../../context/ToastContext';
import type { CrmAssignee, CrmAssignmentRule } from '../../../types/crm';

const METHODS = [
  { value: 'round_robin', label: 'Round robin (in-shift only)' },
  { value: 'claim', label: 'Claim pool (first to accept)' },
  { value: 'manual', label: 'Always fallback owner' },
];

interface CrmSettingsRulesProps {
  assignees?: CrmAssignee[];
}

export const CrmSettingsRules: React.FC<CrmSettingsRulesProps> = ({ assignees: initialAssignees }) => {
  const { addToast } = useToast();
  const [rules, setRules] = useState<CrmAssignmentRule[]>([]);
  const [assignees, setAssignees] = useState<CrmAssignee[]>(initialAssignees || []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('Default round robin');
  const [method, setMethod] = useState('round_robin');
  const [priority, setPriority] = useState('100');
  const [pool, setPool] = useState<string[]>([]);
  const [fallback, setFallback] = useState('');
  const [source, setSource] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rList, aList] = await Promise.all([
        crmService.listRules(),
        initialAssignees && initialAssignees.length > 0
          ? Promise.resolve(initialAssignees)
          : crmService.getAssignees(),
      ]);
      setRules(rList);
      setAssignees(aList);
    } catch (err: any) {
      setError(err?.message || 'Could not load assignment rules.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [initialAssignees]);

  const togglePool = (id: string) => {
    setPool((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSelectAllAssignees = () => {
    if (pool.length === assignees.length) {
      setPool([]);
    } else {
      setPool(assignees.map((a) => a.id));
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await crmService.createRule({
        name: name.trim(),
        method,
        priority: Number(priority) || 100,
        pool,
        fallback_user_id: fallback || null,
        after_hours: 'claim',
        conditions: source.trim()
          ? [{ field: 'source', op: 'eq', value: source.trim().toLowerCase() }]
          : [],
      });
      setName('In-shift distribution rule');
      setPool([]);
      setSource('');
      addToast('Assignment rule created', `Rule "${name.trim()}" is active.`, 'success');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not save rule.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRule = async (rule: CrmAssignmentRule) => {
    try {
      await crmService.updateRule(rule.id, { enabled: !rule.enabled });
      addToast('Rule updated', `"${rule.name}" is now ${!rule.enabled ? 'active' : 'disabled'}.`, 'info');
      await load();
    } catch (err: any) {
      addToast('Error', err?.message || 'Could not update rule.', 'warning');
    }
  };

  const handleDeleteRule = async (rule: CrmAssignmentRule) => {
    if (!window.confirm(`Delete rule "${rule.name}"?`)) return;
    try {
      await crmService.deleteRule(rule.id);
      addToast('Rule deleted', `"${rule.name}" removed.`, 'info');
      await load();
    } catch (err: any) {
      addToast('Error', err?.message || 'Could not delete rule.', 'warning');
    }
  };

  return (
    <div className="space-y-6">
      {/* Intro Card */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-950/60 border border-violet-200/60 dark:border-violet-800 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-950 dark:text-zinc-50">Lead Routing Rules &amp; Sales Team</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Automate how new incoming leads are distributed across on-duty sales reps, claim pools, or dedicated account executives.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          <span className="px-3 py-1 text-xs font-semibold rounded-lg bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 font-numeric">
            {rules.length} {rules.length === 1 ? 'rule' : 'rules'}
          </span>
          <span className="px-3 py-1 text-xs font-semibold rounded-lg bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 font-numeric">
            {assignees.length} team members
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Grid: Active Rules + Add Rule Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Active Rules Table & Sales Team */}
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Active Assignment Rules
              </h3>
              {loading && <span className="text-xs text-zinc-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</span>}
            </div>

            {loading && rules.length === 0 ? (
              <div className="p-8 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 text-center space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mx-auto" />
                <p className="text-xs text-zinc-400">Loading routing rules…</p>
              </div>
            ) : rules.length === 0 ? (
              <div className="p-8 rounded-2xl bg-white dark:bg-[#11131a] border border-dashed border-zinc-300 dark:border-zinc-800 text-center space-y-2">
                <SlidersHorizontal className="w-8 h-8 text-zinc-400 mx-auto" />
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">No assignment rules defined yet</p>
                <p className="text-[11px] text-zinc-400">Incoming leads will remain in the unassigned claim pool until claimed.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-[#11131a] shadow-2xs">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[11px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 bg-zinc-50/70 dark:bg-zinc-900/50 border-b border-zinc-200/80 dark:border-zinc-800">
                      <th className="py-3 px-4">Rule Name</th>
                      <th className="py-3 px-4">Method</th>
                      <th className="py-3 px-4">Pool Size</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                    {rules.map((rule) => (
                      <tr key={rule.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition">
                        <td className="py-3 px-4">
                          <div className="font-bold text-zinc-900 dark:text-zinc-100">{rule.name}</div>
                          <div className="text-[11px] text-zinc-400 font-numeric">Priority {rule.priority}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 capitalize">
                            {rule.method.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-numeric text-zinc-800 dark:text-zinc-200">
                          {rule.pool.length} {rule.pool.length === 1 ? 'rep' : 'reps'}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => void handleToggleRule(rule)}
                            className={`text-xs font-semibold px-2.5 py-0.5 rounded-full cursor-pointer transition ${
                              rule.enabled
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border border-zinc-200 dark:border-zinc-700'
                            }`}
                          >
                            {rule.enabled ? 'Active' : 'Disabled'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => void handleDeleteRule(rule)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                            title="Delete rule"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sales Team Reps Roster Card */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-500" />
                <span>Sales Team Members ({assignees.length})</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {assignees.map((a) => (
                <div
                  key={a.id}
                  className="p-3 rounded-xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 flex items-center gap-3 shadow-2xs"
                >
                  <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center justify-center shrink-0">
                    {a.full_name?.charAt(0) || 'U'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{a.full_name}</div>
                    <div className="text-[11px] text-zinc-400 truncate">{a.email}</div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 shrink-0">
                    {a.role || 'sales'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Create Assignment Rule Form */}
        <div className="lg:col-span-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Create Assignment Rule
          </h3>

          <form
            onSubmit={handleCreate}
            className="p-5 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200/80 dark:border-zinc-800 shadow-2xs space-y-4"
          >
            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                Rule Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Website In-shift Round Robin"
                className="w-full h-9 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                  Distribution Method
                </label>
                <CustomSelect value={method} onChange={setMethod} options={METHODS} size="sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                  Priority (1 = highest)
                </label>
                <input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs font-numeric text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                Source Filter (Optional)
              </label>
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="e.g. meta, wordpress (leave blank for all sources)"
                className="w-full h-9 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Assignee Pool ({pool.length} selected)
                </label>
                <button
                  type="button"
                  onClick={handleSelectAllAssignees}
                  className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  {pool.length === assignees.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <p className="text-[10px] text-zinc-400 mb-2">
                Note: Team members off-shift or on approved leave are skipped automatically during round robin.
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 rounded-xl bg-zinc-50/60 dark:bg-zinc-900/50 border border-zinc-200/60 dark:border-zinc-800">
                {assignees.map((a) => {
                  const selected = pool.includes(a.id);
                  return (
                    <button
                      type="button"
                      key={a.id}
                      onClick={() => togglePool(a.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition cursor-pointer ${
                        selected
                          ? 'bg-indigo-600 text-white border-indigo-600 font-semibold shadow-xs'
                          : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50'
                      }`}
                    >
                      {a.full_name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                Fallback Assignee (If pool is unavailable)
              </label>
              <CustomSelect
                value={fallback}
                onChange={setFallback}
                options={[
                  { value: '', label: 'No fallback (leave in claim pool)' },
                  ...assignees.map((a) => ({ value: a.id, label: a.full_name })),
                ]}
                size="sm"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition cursor-pointer disabled:opacity-60 shadow-xs"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Save Assignment Rule
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
