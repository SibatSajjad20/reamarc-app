import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Users, SlidersHorizontal, AlertCircle } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { CustomSelect } from '../../ui/CustomSelect';
import { StatusPill } from '../../ui/StatusPill';
import { Table, THead, TH, TBody, TR, TD } from '../../ui/DataTable';
import { crmService } from '../../../services/crmService';
import { useToast } from '../../../context/ToastContext';
import { useConfirm } from '../../ui/ConfirmProvider';
import type { CrmAssignee, CrmAssignmentRule } from '../../../types/crm';

const METHODS = [
  {
    value: 'round_robin',
    label: 'Round robin (in-shift only)',
    description: 'Distributes evenly across reps who are currently clocked in and on shift.',
  },
  {
    value: 'claim',
    label: 'Claim pool (first to accept)',
    description: 'Places lead in unassigned pool; first rep to accept owns the lead.',
  },
  {
    value: 'manual',
    label: 'Always fallback owner',
    description: 'Assigns directly to the selected fallback owner account.',
  },
];

interface CrmSettingsRulesProps {
  assignees?: CrmAssignee[];
}

function getInitials(name?: string | null): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const CrmSettingsRules: React.FC<CrmSettingsRulesProps> = ({ assignees: initialAssignees }) => {
  const { addToast } = useToast();
  const confirm = useConfirm();
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
        after_hours: fallback ? 'fallback' : 'claim',
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
      addToast('Error', err?.message || 'Could not update rule.', 'error');
    }
  };

  const handleDeleteRule = async (rule: CrmAssignmentRule) => {
    const ok = await confirm({
      title: `Delete rule "${rule.name}"?`,
      confirmLabel: 'Delete rule',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await crmService.deleteRule(rule.id);
      addToast('Rule deleted', `"${rule.name}" removed.`, 'info');
      await load();
    } catch (err: any) {
      addToast('Error', err?.message || 'Could not delete rule.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Intro Card */}
      <div className="p-4 rounded-lg bg-surface border border-border flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-accent-soft text-accent flex items-center justify-center shrink-0">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-ui font-semibold text-fg">Lead routing</h2>
            <p className="text-small text-fg-muted mt-0.5">
              Automate how new incoming leads are distributed across on-duty sales reps, claim pools, or fallback owners.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          <span className="px-2.5 py-1 text-small font-medium rounded-md bg-subtle text-fg border border-border font-numeric">
            {rules.length} {rules.length === 1 ? 'rule' : 'rules'}
          </span>
          <span className="px-2.5 py-1 text-small font-medium rounded-md bg-subtle text-fg border border-border font-numeric">
            {assignees.length} team members
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-danger-bg border border-danger-bd text-small text-danger-fg flex items-center gap-2">
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
              <h3 className="text-ui font-semibold text-fg">
                Active assignment rules
              </h3>
              {loading && (
                <span className="text-small text-fg-muted flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin text-accent" /> Loading…
                </span>
              )}
            </div>

            {loading && rules.length === 0 ? (
              <div className="p-8 rounded-lg bg-surface border border-border text-center space-y-2">
                <Loader2 className="w-5 h-5 animate-spin text-accent mx-auto" />
                <p className="text-small text-fg-muted">Loading routing rules…</p>
              </div>
            ) : rules.length === 0 ? (
              <div className="p-8 rounded-lg bg-surface border border-dashed border-border text-center space-y-2">
                <SlidersHorizontal className="w-8 h-8 text-fg-muted mx-auto" />
                <p className="text-ui font-medium text-fg">No assignment rules defined yet</p>
                <p className="text-small text-fg-muted">Incoming leads will remain in the unassigned claim pool until claimed.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
                <Table>
                  <THead>
                    <TR>
                      <TH>Rule name</TH>
                      <TH>Method</TH>
                      <TH>Pool size</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {rules.map((rule) => (
                      <TR key={rule.id}>
                        <TD>
                          <div className="font-medium text-ui text-fg">{rule.name}</div>
                          <div className="text-caption text-fg-muted font-numeric">Priority {rule.priority}</div>
                        </TD>
                        <TD>
                          <span className="px-2 py-0.5 rounded text-caption font-medium bg-subtle text-fg border border-border capitalize">
                            {rule.method.replace('_', ' ')}
                          </span>
                        </TD>
                        <TD className="font-numeric text-fg">
                          {rule.pool.length} {rule.pool.length === 1 ? 'rep' : 'reps'}
                        </TD>
                        <TD>
                          <button
                            type="button"
                            onClick={() => void handleToggleRule(rule)}
                            className="cursor-pointer"
                          >
                            <StatusPill
                              variant={rule.enabled ? 'success' : 'neutral'}
                              label={rule.enabled ? 'Active' : 'Disabled'}
                            />
                          </button>
                        </TD>
                        <TD className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleDeleteRule(rule)}
                            className="text-fg-muted hover:text-danger-fg"
                            aria-label={`Delete rule ${rule.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </div>

          {/* Sales Team Reps Roster Card */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-ui font-semibold text-fg flex items-center gap-1.5">
                <Users className="w-4 h-4 text-accent" />
                <span>Sales team members ({assignees.length})</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {assignees.map((a) => (
                <div
                  key={a.id}
                  className="p-3 rounded-md bg-surface border border-border flex items-center gap-3 shadow-xs"
                >
                  <div className="w-8 h-8 rounded-full bg-accent-soft text-accent font-semibold text-caption flex items-center justify-center shrink-0">
                    {getInitials(a.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-ui font-medium text-fg truncate">{a.full_name}</div>
                    <div className="text-caption text-fg-muted truncate">{a.email}</div>
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-micro font-medium bg-subtle text-fg-muted border border-border shrink-0">
                    {a.role || 'sales'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Create Assignment Rule Form */}
        <div className="lg:col-span-5 space-y-4">
          <h3 className="text-ui font-semibold text-fg">
            Create assignment rule
          </h3>

          <form
            onSubmit={handleCreate}
            className="p-5 rounded-lg bg-surface border border-border shadow-xs space-y-4"
          >
            <div>
              <label className="text-label text-fg block mb-1.5">
                Rule name
              </label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Website in-shift round robin"
                required
              />
            </div>

            <div>
              <label className="text-label text-fg block mb-1.5">
                Distribution method
              </label>
              <div className="space-y-2" role="radiogroup" aria-label="Distribution method">
                {METHODS.map((m) => {
                  const selected = method === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setMethod(m.value)}
                      className={`w-full flex items-start justify-between p-3 rounded-md border text-left transition cursor-pointer ${
                        selected
                          ? 'border-accent bg-accent-soft text-fg'
                          : 'border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-small font-medium text-fg">{m.label}</div>
                        <div className="text-caption text-fg-muted mt-0.5">{m.description}</div>
                      </div>
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                          selected ? 'border-accent bg-accent' : 'border-border-strong'
                        }`}
                      >
                        {selected && <span className="w-1.5 h-1.5 rounded-full bg-accent-fg" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-label text-fg block mb-1.5">
                  Priority (1 = highest)
                </label>
                <Input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                />
              </div>

              <div>
                <label className="text-label text-fg block mb-1.5">
                  Source filter (optional)
                </label>
                <Input
                  type="text"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="e.g. meta, wordpress"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-label text-fg">
                  Assignee pool ({pool.length} selected)
                </label>
                <button
                  type="button"
                  onClick={handleSelectAllAssignees}
                  className="text-caption font-medium text-accent hover:underline cursor-pointer"
                >
                  {pool.length === assignees.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <p className="text-caption text-fg-muted mb-2">
                Team members off shift or on approved leave are skipped automatically during round robin.
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 rounded-md bg-subtle border border-border">
                {assignees.map((a) => {
                  const selected = pool.includes(a.id);
                  return (
                    <button
                      type="button"
                      key={a.id}
                      onClick={() => togglePool(a.id)}
                      className={`px-2.5 py-1 rounded-sm text-small transition cursor-pointer border ${
                        selected
                          ? 'bg-accent text-accent-fg border-accent font-medium shadow-xs'
                          : 'bg-surface border-border text-fg-muted hover:border-border-strong hover:text-fg'
                      }`}
                    >
                      {a.full_name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-label text-fg block mb-1.5">
                Fallback assignee (if pool is unavailable)
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

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={saving}
              loadingText="Saving rule…"
              icon={Plus}
            >
              Save assignment rule
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};
