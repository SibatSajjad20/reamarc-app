import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  RotateCcw,
  XCircle,
  Globe,
} from 'lucide-react';
import { getInitials } from '../../utils/badgeStyles';
import type { CrmLead, CrmPipelineStage } from '../../types/crm';
import { CrmStatusBadge, CrmStatusDot } from './CrmStatusBadge';
import { formatLeadOpenValue } from '../../utils/money';
import { MetaIcon, GoogleIcon } from '../ui/brand-icons';
import { Button } from '../ui/button';

type DropTarget = { kind: 'stage'; stage: string } | { kind: 'outcome'; outcome: 'won' | 'lost' };

interface CrmKanbanBoardProps {
  leads: CrmLead[];
  stages: CrmPipelineStage[];
  selectedId: string | null;
  canAssign: boolean;
  onOpen: (id: string) => void;
  onMoveStage: (leadId: string, stage: string) => Promise<void>;
  onWon: (leadId: string) => Promise<void>;
  onLost: (leadId: string) => Promise<void>;
  onReopen?: (leadId: string, stage?: string) => Promise<void>;
}

function formatStageTitle(name: string): string {
  return name
    .replace(/^Strategy Session Booked/i, 'Meeting Booked')
    .replace(/^Strategy Session Completed/i, 'Meeting Completed')
    .replace(/^Strategy Session /i, 'Session ')
    .replace(/^Proposal Sent/i, 'Proposal')
    .replace(/^New Leads/i, 'New');
}

function formatStageMoney(stageLeads: CrmLead[]): string | null {
  let total = 0;
  for (const l of stageLeads) {
    if (l.total_deal_value) {
      total += Number(l.total_deal_value);
    }
  }
  if (total <= 0) return null;
  if (total >= 1_000_000) {
    return `PKR ${(total / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (total >= 1_000) {
    return `PKR ${(total / 1_000).toFixed(0)}k`;
  }
  return `PKR ${total.toLocaleString()}`;
}

function SourceIcon({ source }: { source?: string | null }) {
  if (!source) return null;
  const s = source.toLowerCase();
  if (s.includes('meta') || s.includes('facebook') || s.includes('instagram')) {
    return (
      <span className="text-fg-muted inline-flex items-center" title={source}>
        <MetaIcon size={12} />
      </span>
    );
  }
  if (s.includes('google')) {
    return (
      <span className="text-fg-muted inline-flex items-center" title={source}>
        <GoogleIcon size={12} />
      </span>
    );
  }
  if (s.includes('website') || s.includes('web')) {
    return (
      <span className="text-fg-muted inline-flex items-center" title={source}>
        <Globe className="w-3 h-3" />
      </span>
    );
  }
  return (
    <span className="text-micro text-fg-muted uppercase font-medium" title={source}>
      {source.slice(0, 3)}
    </span>
  );
}

export const CrmKanbanBoard: React.FC<CrmKanbanBoardProps> = ({
  leads,
  stages,
  selectedId,
  canAssign,
  onOpen,
  onMoveStage,
  onWon,
  onLost,
  onReopen,
}) => {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const openStages = useMemo(
    () => [...stages].sort((a, b) => a.order - b.order),
    [stages]
  );

  const byStage = useMemo(() => {
    const map: Record<string, CrmLead[]> = {};
    for (const s of openStages) map[s.id] = [];
    map['won'] = [];
    map['lost'] = [];
    map['trash'] = [];

    for (const lead of leads) {
      if (lead.outcome === 'won') {
        map['won'].push(lead);
      } else if (lead.outcome === 'lost') {
        map['lost'].push(lead);
      } else if (lead.outcome === 'trashed' || lead.outcome === 'disqualified') {
        map['trash'].push(lead);
      } else {
        const stage = lead.stage || 'new';
        if (!map[stage]) map[stage] = [];
        map[stage].push(lead);
      }
    }
    return map;
  }, [leads, openStages]);

  const [pendingMove, setPendingMove] = useState<{ id: string; stage: string; name: string; label: string } | null>(null);

  const drop = async (target: DropTarget) => {
    if (!draggingId) return;
    const lead = leads.find((l) => l.id === draggingId);
    setOverKey(null);
    setDraggingId(null);
    if (!lead) return;

    if (target.kind === 'stage') {
      if (lead.stage === target.stage && !lead.outcome) return;
      if (lead.outcome && onReopen) {
        setBusyId(lead.id);
        try {
          await onReopen(lead.id, target.stage);
        } finally {
          setBusyId(null);
        }
        return;
      }
      const label = openStages.find((stage) => stage.id === target.stage)?.name || target.stage;
      setPendingMove({ id: lead.id, stage: target.stage, name: lead.name, label });
      return;
    }

    if (!canAssign) return;
    setBusyId(lead.id);
    try {
      if (target.outcome === 'won') {
        if (lead.outcome === 'won') return;
        await onWon(lead.id);
      } else {
        if (lead.outcome === 'lost') return;
        await onLost(lead.id);
      }
    } finally {
      setBusyId(null);
    }
  };

  const renderCard = (lead: CrmLead, currentStageIndex?: number) => {
    const isOverdue =
      Boolean(lead.next_follow_up_at) && new Date(lead.next_follow_up_at as string).getTime() < Date.now();
    const isSelected = selectedId === lead.id;
    const isWon = lead.outcome === 'won';
    const isLost = lead.outcome === 'lost';
    const isTrash = lead.outcome === 'trashed' || lead.outcome === 'disqualified';
    const hasNextStage =
      currentStageIndex !== undefined &&
      currentStageIndex >= 0 &&
      currentStageIndex < openStages.length - 1;
    const nextStage = hasNextStage ? openStages[currentStageIndex + 1] : null;

    const valueLabel = formatLeadOpenValue(lead) || (lead.budget ? lead.budget : null);

    return (
      <article
        key={lead.id}
        draggable={!busyId}
        onDragStart={() => setDraggingId(lead.id)}
        onDragEnd={() => {
          setDraggingId(null);
          setOverKey(null);
        }}
        onClick={() => onOpen(lead.id)}
        className={`group relative rounded-lg border bg-surface p-3 transition-all cursor-grab active:cursor-grabbing select-none ${
          isWon
            ? 'border-success/30'
            : isLost || isTrash
              ? 'border-danger/30 opacity-85'
              : 'border-border hover:border-border-strong hover:shadow-xs'
        } ${isSelected ? 'ring-2 ring-accent border-accent' : ''} ${
          busyId === lead.id ? 'opacity-50' : ''
        } ${draggingId === lead.id ? 'opacity-40 shadow-md' : ''}`}
      >
        {/* Row 1: Lead Name + Company + Owner Avatar */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="text-[13px] font-medium text-fg truncate group-hover:text-accent transition-colors">
              {lead.name}
            </h4>
            <p className="text-micro text-fg-muted truncate mt-0.5">
              {lead.company || (lead.phone_e164 ? `+${lead.phone_e164}` : lead.email || '—')}
            </p>
          </div>
          {lead.assigned_to_name ? (
            <span
              className="w-5 h-5 rounded-full bg-subtle border border-border text-fg-muted font-medium flex items-center justify-center text-[10px] uppercase shrink-0"
              title={lead.assigned_to_name}
            >
              {getInitials(lead.assigned_to_name)}
            </span>
          ) : (
            <CrmStatusDot lead={lead} />
          )}
        </div>

        {/* Row 2: Service and Deal Value Tags */}
        {(Boolean(lead.service) || Boolean(valueLabel)) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {lead.service && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-micro font-normal bg-subtle text-fg-muted truncate max-w-[140px]">
                {lead.service}
              </span>
            )}
            {valueLabel && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-micro font-numeric text-fg-muted tabular-nums bg-subtle">
                {valueLabel}
              </span>
            )}
          </div>
        )}

        {/* Row 3: Status / Qualification Indicator + Source Icon */}
        <div className="mt-2.5 pt-2 border-t border-border/50 flex items-center justify-between gap-2 text-micro">
          <div className="min-w-0 flex items-center gap-1.5">
            {isWon ? (
              lead.converted_workspace_id ? (
                <span className="inline-flex items-center gap-1 text-micro font-medium text-success-fg">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Active</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-micro font-medium text-warning-fg">
                  <Clock className="w-3 h-3" />
                  <span>Pending ops</span>
                </span>
              )
            ) : isLost || isTrash ? (
              <span
                className="inline-flex items-center text-micro font-medium text-danger-fg capitalize truncate max-w-[90px]"
                title={lead.trash_reason || lead.lost_reason || lead.disqualify_reason || (isTrash ? 'Trash' : 'Lost')}
              >
                {isTrash ? 'Trash' : lead.lost_reason || 'Lost'}
              </span>
            ) : (
              <CrmStatusBadge lead={lead} className="scale-90 origin-left" />
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <SourceIcon source={lead.source} />

            {/* Advance button */}
            {nextStage && !lead.outcome && (
              <button
                type="button"
                title={`Advance to ${formatStageTitle(nextStage.name)}`}
                aria-label={`Advance to ${formatStageTitle(nextStage.name)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingMove({
                    id: lead.id,
                    stage: nextStage.id,
                    name: lead.name,
                    label: formatStageTitle(nextStage.name),
                  });
                }}
                className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-hover text-fg-muted hover:text-fg transition cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Reopen button */}
            {(isWon || isLost) && canAssign && onReopen && (
              <button
                type="button"
                title="Reopen lead"
                aria-label="Reopen lead"
                onClick={(e) => {
                  e.stopPropagation();
                  void onReopen(lead.id, 'contacted');
                }}
                className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-hover text-fg-muted hover:text-fg transition cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Follow up line if scheduled */}
        {!lead.outcome && lead.next_follow_up_at && (
          <div
            className={`mt-1.5 flex items-center gap-1 text-xs font-numeric ${
              isOverdue ? 'text-danger-fg font-medium' : 'text-fg-muted'
            }`}
          >
            <Clock className="w-3 h-3 shrink-0" />
            <span className="truncate">
              {new Date(lead.next_follow_up_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="relative flex-1 overflow-x-auto overflow-y-hidden px-5 py-3 custom-scrollbar">
      {/* Dragging targets */}
      {draggingId && canAssign && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border shadow-lg animate-in fade-in-0 zoom-in-95 duration-150">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (overKey !== 'outcome:won') setOverKey('outcome:won');
            }}
            onDragLeave={() => setOverKey((cur) => (cur === 'outcome:won' ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              void drop({ kind: 'outcome', outcome: 'won' });
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border border-dashed transition-all cursor-pointer ${
              overKey === 'outcome:won'
                ? 'border-success bg-success-bg text-success-fg font-semibold'
                : 'border-success/40 text-success-fg hover:bg-success-bg/20'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 text-success-fg" />
            <span className="text-xs">Drop to Won</span>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (overKey !== 'outcome:lost') setOverKey('outcome:lost');
            }}
            onDragLeave={() => setOverKey((cur) => (cur === 'outcome:lost' ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              void drop({ kind: 'outcome', outcome: 'lost' });
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border border-dashed transition-all cursor-pointer ${
              overKey === 'outcome:lost'
                ? 'border-danger bg-danger-bg text-danger-fg font-semibold'
                : 'border-danger/40 text-danger-fg hover:bg-danger-bg/20'
            }`}
          >
            <XCircle className="w-4 h-4 text-danger-fg" />
            <span className="text-xs">Drop to Lost</span>
          </div>
        </div>
      )}

      {/* Columns row */}
      <div className="h-full flex gap-3 min-w-min pb-2 items-start">
        {openStages.map((stage, idx) => {
          const key = `stage:${stage.id}`;
          const cards = byStage[stage.id] || [];
          const stageTotal = formatStageMoney(cards);
          const isDrop = overKey === key;

          return (
            <div key={stage.id} className="w-[186px] shrink-0 flex flex-col gap-1.5">
              {/* Column Header */}
              <div className="h-7 px-1 flex items-center justify-between gap-1 text-ui select-none">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[13px] font-semibold text-fg truncate" title={stage.name}>
                    {formatStageTitle(stage.name)}
                  </span>
                  <span className="text-micro font-numeric tabular-nums text-fg-muted bg-subtle px-1.5 py-0.2 rounded-full">
                    {cards.length}
                  </span>
                </div>
                {stageTotal && (
                  <span className="text-micro font-numeric tabular-nums text-fg-muted">
                    {stageTotal}
                  </span>
                )}
              </div>

              {/* Column Body */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overKey !== key) setOverKey(key);
                }}
                onDragLeave={() => setOverKey((cur) => (cur === key ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  void drop({ kind: 'stage', stage: stage.id });
                }}
                className={`bg-subtle rounded-lg p-2 flex flex-col gap-2 min-h-[480px] max-h-full overflow-y-auto custom-scrollbar transition-colors ${
                  isDrop ? 'bg-accent-soft outline-1 outline-dashed outline-accent-ring' : ''
                }`}
              >
                {cards.map((lead) => renderCard(lead, idx))}
                {cards.length === 0 && (
                  <div className="h-20 border border-dashed border-border-strong rounded-lg flex items-center justify-center text-small text-fg-muted select-none">
                    No leads
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Won Terminal Column */}
        {(() => {
          const cards = byStage['won'] || [];
          const isDrop = overKey === 'outcome:won';
          return (
            <div className="w-[186px] shrink-0 flex flex-col gap-1.5">
              <div className="h-7 px-1 flex items-center justify-between gap-1 text-ui select-none">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[13px] font-semibold text-success-fg">Won</span>
                  <span className="text-micro font-numeric tabular-nums text-success-fg bg-success-bg px-1.5 py-0.2 rounded-full">
                    {cards.length}
                  </span>
                </div>
              </div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overKey !== 'outcome:won') setOverKey('outcome:won');
                }}
                onDragLeave={() => setOverKey((cur) => (cur === 'outcome:won' ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  void drop({ kind: 'outcome', outcome: 'won' });
                }}
                className={`bg-subtle rounded-lg p-2 flex flex-col gap-2 min-h-[480px] max-h-full overflow-y-auto custom-scrollbar border border-success/20 transition-colors ${
                  isDrop ? 'bg-accent-soft outline-1 outline-dashed outline-accent-ring' : ''
                }`}
              >
                {cards.map((lead) => renderCard(lead))}
                {cards.length === 0 && (
                  <div className="h-20 border border-dashed border-border-strong rounded-lg flex items-center justify-center text-small text-fg-muted select-none">
                    None
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Lost Terminal Column */}
        {(() => {
          const cards = byStage['lost'] || [];
          const isDrop = overKey === 'outcome:lost';
          return (
            <div className="w-[186px] shrink-0 flex flex-col gap-1.5">
              <div className="h-7 px-1 flex items-center justify-between gap-1 text-ui select-none">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[13px] font-semibold text-danger-fg">Lost</span>
                  <span className="text-micro font-numeric tabular-nums text-danger-fg bg-danger-bg px-1.5 py-0.2 rounded-full">
                    {cards.length}
                  </span>
                </div>
              </div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overKey !== 'outcome:lost') setOverKey('outcome:lost');
                }}
                onDragLeave={() => setOverKey((cur) => (cur === 'outcome:lost' ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  void drop({ kind: 'outcome', outcome: 'lost' });
                }}
                className={`bg-subtle rounded-lg p-2 flex flex-col gap-2 min-h-[480px] max-h-full overflow-y-auto custom-scrollbar border border-danger/20 transition-colors ${
                  isDrop ? 'bg-accent-soft outline-1 outline-dashed outline-accent-ring' : ''
                }`}
              >
                {cards.map((lead) => renderCard(lead))}
                {cards.length === 0 && (
                  <div className="h-20 border border-dashed border-border-strong rounded-lg flex items-center justify-center text-small text-fg-muted select-none">
                    None
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Trash Terminal Column */}
        {(() => {
          const cards = byStage['trash'] || [];
          return (
            <div className="w-[186px] shrink-0 flex flex-col gap-1.5">
              <div className="h-7 px-1 flex items-center justify-between gap-1 text-ui select-none">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[13px] font-semibold text-fg-muted">Trash</span>
                  <span className="text-micro font-numeric tabular-nums text-fg-muted bg-subtle px-1.5 py-0.2 rounded-full">
                    {cards.length}
                  </span>
                </div>
              </div>
              <div className="bg-subtle rounded-lg p-2 flex flex-col gap-2 min-h-[480px] max-h-full overflow-y-auto custom-scrollbar border border-border">
                {cards.map((lead) => renderCard(lead))}
                {cards.length === 0 && (
                  <div className="h-20 border border-dashed border-border-strong rounded-lg flex items-center justify-center text-small text-fg-muted select-none">
                    None
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Confirmation modal for stage change */}
      {pendingMove && (
        <div className="fixed inset-0 z-[var(--z-overlay,50)] flex items-center justify-center p-4 bg-overlay animate-in fade-in-0 duration-150">
          <div className="w-full max-w-[400px] rounded-lg bg-surface border border-border p-5 shadow-lg space-y-4">
            <h3 className="text-h2 font-semibold text-fg">
              Move {pendingMove.name} to {pendingMove.label}?
            </h3>
            <p className="text-body text-fg-muted">
              This will update the pipeline stage for this lead.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => setPendingMove(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const move = pendingMove;
                  setPendingMove(null);
                  setBusyId(move.id);
                  void onMoveStage(move.id, move.stage).finally(() => setBusyId(null));
                }}
              >
                Move
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
