import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import { crmService } from '../../services/crmService';
import type { CrmAssignee, CrmAssignmentRule } from '../../types/crm';

const METHODS = [
  { value: 'round_robin', label: 'Round robin (in-shift)' },
  { value: 'claim', label: 'Claim pool' },
  { value: 'manual', label: 'Always fallback owner' },
];

interface CrmRulesPanelProps {
  assignees: CrmAssignee[];
  onClose: () => void;
}

export const CrmRulesPanel: React.FC<CrmRulesPanelProps> = ({ assignees, onClose }) => {
  const [rules, setRules] = useState<CrmAssignmentRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('Default round robin');
  const [method, setMethod] = useState('round_robin');
  const [priority, setPriority] = useState('100');
  const [pool, setPool] = useState<string[]>([]);
  const [fallback, setFallback] = useState('');
  const [source, setSource] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setRules(await crmService.listRules());
    } catch (err: any) {
      setError(err?.message || 'Could not load rules.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const togglePool = (id: string) => {
    setPool((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
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
        conditions: source.trim() ? [{ field: 'source', op: 'eq', value: source.trim().toLowerCase() }] : [],
      });
      setName('Rule');
      setPool([]);
      setSource('');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not save rule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div
        className="w-full max-w-2xl max-h-[86vh] overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#11131a] flex flex-col shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-bold text-zinc-950 dark:text-zinc-50">Assignment rules</h2>
            <p className="text-xs text-zinc-500">Automate how incoming leads are distributed to sales reps.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <p className="text-xs text-zinc-400">Loading rules…</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase font-bold tracking-wider text-zinc-400 bg-zinc-50/80 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
                    <th className="py-2.5 px-3">Rule</th>
                    <th className="py-2.5 px-3">Method</th>
                    <th className="py-2.5 px-3">Pool Size</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {rules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100">{rule.name}</div>
                        <div className="text-[11px] text-zinc-400 font-numeric">Priority {rule.priority}</div>
                      </td>
                      <td className="py-2.5 px-3 capitalize text-zinc-600 dark:text-zinc-400">
                        {rule.method.replace('_', ' ')}
                      </td>
                      <td className="py-2.5 px-3 font-numeric text-zinc-800 dark:text-zinc-200">
                        {rule.pool.length} {rule.pool.length === 1 ? 'member' : 'members'}
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full cursor-pointer transition ${
                            rule.enabled
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border border-zinc-200 dark:border-zinc-700'
                          }`}
                          onClick={() => void crmService.updateRule(rule.id, { enabled: !rule.enabled }).then(load)}
                        >
                          {rule.enabled ? 'Active' : 'Disabled'}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          className="p-1 text-zinc-400 hover:text-rose-600 cursor-pointer"
                          onClick={() => void crmService.deleteRule(rule.id).then(load)}
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {rules.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-zinc-400">
                        No rules yet. New unassigned leads stay in the claim pool.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <form onSubmit={handleCreate} className="border-t border-zinc-200 dark:border-zinc-800 pt-4 space-y-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Add new rule</p>
            <div className="grid grid-cols-2 gap-2.5">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                placeholder="Rule Name (e.g. In-shift Round Robin)"
                required
              />
              <input
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-numeric focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                placeholder="Priority (1 first)"
              />
              <CustomSelect value={method} onChange={setMethod} options={METHODS} size="sm" />
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="h-8.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                placeholder="Only if source equals… (optional)"
              />
            </div>
            <div>
              <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
                Assignee Pool (members off-shift or on leave are skipped automatically):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {assignees.map((a) => {
                  const selected = pool.includes(a.id);
                  return (
                    <button
                      type="button"
                      key={a.id}
                      onClick={() => togglePool(a.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition cursor-pointer ${
                        selected
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-semibold'
                          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {a.full_name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="w-56">
              <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Fallback Assignee</p>
              <CustomSelect
                value={fallback}
                onChange={setFallback}
                options={[{ value: '', label: 'No fallback (stay in claim pool)' }, ...assignees.map((a) => ({ value: a.id, label: a.full_name }))]}
                size="sm"
              />
            </div>
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="h-8.5 px-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60 transition shadow-xs"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Save rule
            </button>
          </form>
        </div>
        <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
