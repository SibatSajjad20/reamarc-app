import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { SettingsCard } from '../../settings/SettingsCard';
import { ClientAvatar } from '../../ui/ClientAvatar';
import { StatusPill } from '../../ui/StatusPill';
import { Callout } from '../../ui/Callout';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { FormFooter } from '../../ui/FormFooter';
import { CardListSkeleton } from '../../ui/Skeletons';
import { ErrorState } from '../../ui/ErrorState';
import { EmptyState } from '../../ui/EmptyState';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useToast } from '../../../context/ToastContext';
import { useAuth } from '../../../context/AuthContext';
import { canEditContentCalendarFields } from '../../../utils/settingsAccess';
import { contentCalendarService } from '../../../services/contentCalendarService';
import { openFileAttachment } from '../../../utils/fileUrl';
import { emitInvalidation } from '../../../utils/cacheBus';
import { normalizeCreativeType } from '../../../utils/contentCalendarExpectations';
import type { ClientExpectationClient } from '../../../types/contentCalendar';
import { cn } from '../../../lib/utils';

interface Props {
  initialClientId?: string | null;
  onOpenOverview?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

const TYPE_COLORS: Record<string, string> = {
  video: 'var(--chart-1)',
  static: 'var(--text-2)',
  carousel: 'var(--chart-3)',
  'animated post': 'var(--chart-4)',
  reel: 'var(--chart-5)',
};

function typeDot(name: string): string {
  const canon = normalizeCreativeType(name);
  return TYPE_COLORS[canon] || (canon === 'cover image' ? 'var(--chart-2)' : 'var(--text-muted)');
}

function formatMonthLabel(m: string): string {
  const parts = m.split('-');
  if (parts.length === 2) {
    const year = parts[0];
    const monthNum = parseInt(parts[1], 10);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (monthNum >= 1 && monthNum <= 12) {
      return `${months[monthNum - 1]} ${year}`;
    }
  }
  return m;
}

export const ContentCalendarSettingsTab: React.FC<Props> = ({
  initialClientId,
  onOpenOverview,
  onDirtyChange,
}) => {
  const confirm = useConfirm();
  const { addToast } = useToast();
  const { user } = useAuth();
  const canEdit = useMemo(() => canEditContentCalendarFields(user), [user]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creativeTypes, setCreativeTypes] = useState<string[]>([]);
  const [clients, setClients] = useState<ClientExpectationClient[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Form counts per type: string (e.g. '5', '0', or '' for empty)
  const [formCounts, setFormCounts] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await contentCalendarService.getClientExpectations();
      setCreativeTypes(res.creative_types || []);
      setClients(res.clients || []);
      if (res.clients && res.clients.length > 0) {
        if (initialClientId && res.clients.some((c) => c.workspace_id === initialClientId)) {
          setSelectedClientId(initialClientId);
        } else {
          setSelectedClientId(res.clients[0].workspace_id);
        }
      } else {
        setSelectedClientId(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not load client expectations.');
    } finally {
      setIsLoading(false);
    }
  }, [initialClientId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedClient = useMemo(() => {
    return clients.find((c) => c.workspace_id === selectedClientId) || null;
  }, [clients, selectedClientId]);

  // Compute shown rows for selected client
  const clientRows = useMemo(() => {
    if (!selectedClient) return [];
    const existingLines = selectedClient.content_expectations?.lines || [];

    // Map existing lines by normalized key
    const existingMap = new Map<string, (typeof existingLines)[0]>();
    existingLines.forEach((l) => {
      existingMap.set(normalizeCreativeType(l.creative_type), l);
    });

    const rows: Array<{
      type: string;
      isLegacy: boolean;
      existingLine?: (typeof existingLines)[0];
    }> = [];

    // 1. Company enum types (Story already filtered out backend-side)
    const seenNormals = new Set<string>();
    creativeTypes.forEach((t) => {
      const norm = normalizeCreativeType(t);
      if (norm === 'story' || seenNormals.has(norm)) return;
      seenNormals.add(norm);
      rows.push({
        type: t,
        isLegacy: false,
        existingLine: existingMap.get(norm),
      });
    });

    // 2. Legacy types on client not in company enum
    existingLines.forEach((l) => {
      const norm = normalizeCreativeType(l.creative_type);
      if (norm !== 'story' && !seenNormals.has(norm)) {
        seenNormals.add(norm);
        rows.push({
          type: l.creative_type,
          isLegacy: true,
          existingLine: l,
        });
      }
    });

    return rows;
  }, [selectedClient, creativeTypes]);

  // Initial counts for selected client
  const initialCounts = useMemo(() => {
    const counts: Record<string, string> = {};
    clientRows.forEach((r) => {
      const exp = r.existingLine?.expected;
      counts[r.type] = exp != null ? String(exp) : '';
    });
    return counts;
  }, [clientRows]);

  // Reset form counts whenever selectedClient changes
  useEffect(() => {
    setFormCounts(initialCounts);
    setFieldErrors({});
    setServerError(null);
  }, [initialCounts]);

  // Check dirty state
  const isDirty = useMemo(() => {
    return clientRows.some((r) => {
      const cur = formCounts[r.type] ?? (initialCounts[r.type] ?? '');
      const init = initialCounts[r.type] ?? '';
      return cur !== init;
    });
  }, [clientRows, formCounts, initialCounts]);

  const onDirtyChangeRef = React.useRef(onDirtyChange);
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    return () => {
      onDirtyChangeRef.current?.(false);
    };
  }, []);

  // Handle client selection with unsaved changes guard
  const handleSelectClient = async (workspaceId: string) => {
    if (workspaceId === selectedClientId) return;
    if (isDirty) {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        description: 'You have unsaved changes to this client plan. If you switch clients, your changes will be lost.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setSelectedClientId(workspaceId);
  };

  // Handle overview navigation with unsaved changes guard
  const handleOpenOverview = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        description: 'You have unsaved changes to this client plan. If you leave, your changes will be lost.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        tone: 'danger',
      });
      if (!ok) return;
    }
    onOpenOverview?.();
  };

  // Handle count input change
  const handleCountChange = (type: string, rawVal: string) => {
    if (rawVal !== '' && !/^\d+$/.test(rawVal)) {
      return;
    }
    setFormCounts((prev) => ({ ...prev, [type]: rawVal }));

    if (rawVal !== '') {
      const n = parseInt(rawVal, 10);
      if (n > 500) {
        setFieldErrors((prev) => ({ ...prev, [type]: 'Must be between 0 and 500.' }));
      } else {
        setFieldErrors((prev) => {
          const next = { ...prev };
          delete next[type];
          return next;
        });
      }
    } else {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[type];
        return next;
      });
    }
  };

  const hasErrors = Object.keys(fieldErrors).length > 0;

  // Calculate total monthly posts
  const totalPosts = useMemo(() => {
    return clientRows.reduce((acc, r) => {
      const val = formCounts[r.type] ?? (initialCounts[r.type] ?? '');
      if (val !== '' && !Number.isNaN(Number(val))) {
        return acc + parseInt(val, 10);
      }
      return acc;
    }, 0);
  }, [clientRows, formCounts, initialCounts]);

  // Save handler
  const handleSave = async () => {
    if (!selectedClient || !canEdit || isSaving || hasErrors) return;

    // Check for confirmations: removing a counted line or dropping expected_max
    const changes: string[] = [];
    clientRows.forEach((r) => {
      const originalExpected = r.existingLine?.expected;
      const newExpectedStr = formCounts[r.type] ?? (initialCounts[r.type] ?? '');
      const newExpected = newExpectedStr === '' ? null : parseInt(newExpectedStr, 10);

      if (originalExpected != null && newExpected == null) {
        changes.push(`• ${r.type} (${originalExpected} posts) will be removed from the plan`);
      }

      const originalMax = r.existingLine?.expected_max;
      if (originalMax != null && newExpected != null && newExpected > originalMax) {
        changes.push(`• ${r.type}: maximum bound (${originalMax}) will be dropped to accommodate ${newExpected} posts`);
      }
    });

    if (changes.length > 0) {
      const ok = await confirm({
        title: 'Confirm plan changes',
        description: `Please review the following modifications before saving:\n\n${changes.join('\n')}`,
        confirmLabel: 'Save changes',
        cancelLabel: 'Keep editing',
        tone: 'default',
      });
      if (!ok) return;
    }

    setIsSaving(true);
    setServerError(null);
    try {
      const lines = clientRows.map((r) => {
        const val = formCounts[r.type] ?? (initialCounts[r.type] ?? '');
        return {
          creative_type: r.type,
          expected: val === '' || val == null ? null : parseInt(val, 10),
        };
      });

      const updated = await contentCalendarService.saveClientExpectations(selectedClient.workspace_id, lines);

      // Update local client list
      setClients((prev) =>
        prev.map((c) =>
          c.workspace_id === (updated?.workspace_id || selectedClient.workspace_id)
            ? { ...c, ...updated, content_expectations: updated?.content_expectations || { period: 'month', lines } }
            : c
        )
      );

      addToast('Plan saved', `Plan saved for ${selectedClient.name}`, 'success');
      emitInvalidation('workspaces');
      window.dispatchEvent(new Event('reamarc_workspaces_updated'));
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Could not save client expectations.';
      setServerError(typeof detail === 'string' ? detail : JSON.stringify(detail));
      addToast('Save failed', typeof detail === 'string' ? detail : 'Failed to save client plan', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Filter clients by search
  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => (c.name || '').toLowerCase().includes(q));
  }, [clients, search]);

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-y-auto bg-canvas p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-fg m-0">Settings</h2>
        </div>
        <div className="rounded-xl border border-border p-5 bg-surface shadow-xs">
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
            <CardListSkeleton rows={5} />
            <div className="h-64 rounded-xl bg-subtle animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-y-auto bg-canvas p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-fg m-0">Settings</h2>
        </div>
        <div className="rounded-xl border border-border p-8 bg-surface shadow-xs">
          <ErrorState title="Failed to load client expectations" message={error} onRetry={() => void loadData()} />
        </div>
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-y-auto bg-canvas p-3 sm:p-4 space-y-3" data-testid="cc-settings-tab">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-fg m-0">Settings</h2>
        </div>
        <div className="rounded-xl border border-border p-8 bg-surface shadow-xs">
          <EmptyState
            title="No active clients yet"
            description="Add clients in Active clients to set their monthly plan."
          />
        </div>
      </div>
    );
  }

  const hasLegacyTypes = clientRows.some((r) => r.isLegacy);
  const clientHasNoPlan = !selectedClient?.content_expectations?.lines || selectedClient.content_expectations.lines.every((l) => l.expected == null);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 overflow-y-auto bg-canvas p-3 sm:p-4 space-y-3" data-testid="cc-settings-tab">
      {/* Title bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-fg m-0">Settings</h2>
        {onOpenOverview && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleOpenOverview}
          >
            View in Overview
          </Button>
        )}
      </div>

      <SettingsCard
        title="Client expectations"
        description="Monthly posts per content type for each client. Used by Overview and Generate report."
      >
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 items-start">
          {/* Left: Client List */}
          <div className="flex flex-col gap-2 rounded-lg border border-border p-2 bg-subtle/40">
            <div className="relative">
              <Input
                placeholder="Search clients…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={Search}
                inputSize="sm"
              />
            </div>

            <div className="flex flex-col gap-1 max-h-[480px] overflow-y-auto min-h-[140px]" role="list">
              {filteredClients.map((c) => {
                const isSelected = c.workspace_id === selectedClientId;
                const hasPlan = Boolean(
                  c.content_expectations?.lines &&
                    c.content_expectations.lines.some((l) => typeof l.expected === 'number')
                );
                const hasProposal = Boolean(c.proposal_url);

                return (
                  <button
                    key={c.workspace_id}
                    type="button"
                    role="listitem"
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => void handleSelectClient(c.workspace_id)}
                    className={cn(
                      'flex items-center justify-between gap-2 p-2 rounded-lg text-left transition-colors cursor-pointer w-full',
                      isSelected
                        ? 'bg-accent-soft-2 text-accent-text font-medium'
                        : 'hover:bg-hover text-fg'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ClientAvatar
                        name={c.name}
                        logoUrl={c.logo_url || undefined}
                        clientId={c.workspace_id}
                        brandColor={c.brandColor || undefined}
                        initials={c.initials || undefined}
                        size={24}
                        decorative
                      />
                      <span className="text-xs truncate">{c.name}</span>
                    </div>

                    <div className="shrink-0">
                      {hasPlan ? (
                        <StatusPill variant="success" label="Plan set" />
                      ) : hasProposal ? (
                        <StatusPill variant="warning" label="Proposal, no plan" />
                      ) : (
                        <StatusPill variant="neutral" label="No plan" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Selected Client Editor */}
          {selectedClient ? (
            <div className="flex flex-col gap-4">
              {/* Header */}
              <div className="flex items-center gap-2.5 pb-3 border-b border-border">
                <ClientAvatar
                  name={selectedClient.name}
                  logoUrl={selectedClient.logo_url || undefined}
                  clientId={selectedClient.workspace_id}
                  brandColor={selectedClient.brandColor || undefined}
                  initials={selectedClient.initials || undefined}
                  size={32}
                  decorative
                />
                <div>
                  <h3 className="text-sm font-semibold text-fg m-0">{selectedClient.name}</h3>
                  {clientHasNoPlan && (
                    <p className="text-caption text-fg-muted m-0 mt-0.5">
                      No monthly plan yet. Enter counts below.
                    </p>
                  )}
                </div>
              </div>

              {/* Proposal row */}
              <div className="p-3 rounded-lg border border-border bg-subtle/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                {selectedClient.proposal_url ? (
                  <>
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-fg-muted shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-fg truncate">
                          {selectedClient.proposal_name || 'Proposal Document'}
                        </div>
                        <div className="text-caption text-fg-muted">
                          Enter the monthly counts agreed in this proposal.
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        void openFileAttachment(
                          selectedClient.proposal_url!,
                          selectedClient.proposal_name || undefined
                        )
                      }
                      className="shrink-0"
                    >
                      Open
                    </Button>
                  </>
                ) : (
                  <p className="text-caption text-fg-muted m-0">No proposal on file for this client.</p>
                )}
              </div>

              {/* Permission Banner */}
              {!canEdit && (
                <div className="p-3.5 rounded-xl border border-warning-bd bg-warning-bg/30 text-warning-fg text-xs flex items-center gap-2.5">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>
                    Only admins and content or creative team leads can change client expectations.
                  </span>
                </div>
              )}

              {/* Legacy Types Callout */}
              {hasLegacyTypes && (
                <Callout variant="warning">
                  Some types in this client's plan are missing from Field values. Add them under Settings → Content calendar → Field values.
                </Callout>
              )}

              {/* Type Grid */}
              <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                {clientRows.map((r) => {
                  const val = formCounts[r.type] ?? (initialCounts[r.type] ?? '');
                  const err = fieldErrors[r.type];
                  const line = r.existingLine;

                  // Compute preserved attributes caption
                  const captions: string[] = [];
                  if (line) {
                    if (line.expected_max != null) {
                      const curNum = val !== '' ? parseInt(val, 10) : line.expected;
                      if (curNum != null && curNum <= line.expected_max) {
                        captions.push(`Range ${curNum}–${line.expected_max}`);
                      } else if (curNum == null) {
                        captions.push(`Max ${line.expected_max}`);
                      }
                    }
                    if (line.skip_months && line.skip_months.length > 0) {
                      captions.push(`Paused ${line.skip_months.map(formatMonthLabel).join(', ')}`);
                    }
                    if (line.layout) {
                      captions.push(`Layout ${line.layout}`);
                    }
                    if (line.included) {
                      captions.push('Included');
                    }
                  }
                  const captionStr = captions.length > 0 ? `${captions.join(' · ')} (edit in Active clients)` : null;

                  return (
                    <div key={r.type} className="p-3 bg-surface hover:bg-subtle/30 transition-colors">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ background: typeDot(r.type) }}
                            aria-hidden="true"
                          />
                          <span className="text-sm font-medium text-fg truncate">{r.type}</span>
                          {r.isLegacy && (
                            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-warning-bg text-warning-fg border border-warning-bd shrink-0">
                              Not in field values
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <Input
                            type="number"
                            min={0}
                            max={500}
                            inputMode="numeric"
                            disabled={!canEdit || isSaving}
                            aria-invalid={Boolean(err)}
                            data-testid={`cc-expect-input-${r.type.toLowerCase().replace(/\s+/g, '-')}`}
                            value={val}
                            onChange={(e) => handleCountChange(r.type, e.target.value)}
                            className="w-24 text-right font-numeric"
                          />
                          <span className="text-caption text-fg-muted">/ month</span>
                        </div>
                      </div>

                      {err && (
                        <p className="text-caption text-danger-fg mt-1 mb-0 text-right">{err}</p>
                      )}

                      {captionStr && (
                        <p className="text-caption text-fg-muted mt-1 mb-0 pl-4">{captionStr}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="pt-2 flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs text-fg-muted">Total per month:</span>
                  <span className="font-numeric text-sm font-semibold text-fg">
                    {totalPosts} {totalPosts === 1 ? 'post' : 'posts'}
                  </span>
                </div>

                {canEdit && (
                  <FormFooter
                    serverError={serverError}
                    errorCount={Object.keys(fieldErrors).length}
                    className="rounded-lg border border-border"
                  >
                    <div className="flex items-center gap-2 ml-auto">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!isDirty || isSaving}
                        onClick={() => {
                          setFormCounts(initialCounts);
                          setFieldErrors({});
                          setServerError(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={!isDirty || isSaving || hasErrors}
                        onClick={() => void handleSave()}
                      >
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                        Save
                      </Button>
                    </div>
                  </FormFooter>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-fg-muted text-sm">
              Select a client to manage its expectations.
            </div>
          )}
        </div>
      </SettingsCard>
    </div>
  );
};
