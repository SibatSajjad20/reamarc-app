import React, { useMemo, useState } from 'react';
import {
  Briefcase,
  CheckCircle2,
  ChevronRight,
  Clock,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import type { CrmDeal, CrmPipelineStage } from '../../types/crm';
import { formatDealMoney } from '../../utils/money';
import { getInitials } from '../../utils/badgeStyles';

type DropTarget = { kind: 'stage'; stage: string } | { kind: 'outcome'; outcome: 'won' | 'lost' };

interface CrmDealKanbanBoardProps {
  deals: CrmDeal[];
  stages: CrmPipelineStage[];
  selectedDealId: string | null;
  canManageOutcomes: boolean;
  onOpen: (deal: CrmDeal) => void;
  onMoveStage: (dealId: string, stage: string) => Promise<void>;
  onWon: (dealId: string) => Promise<void>;
  onLost: (dealId: string) => Promise<void>;
  onReopen?: (dealId: string, stage?: string) => Promise<void>;
  onApproveWon?: (dealId: string) => Promise<void>;
  createDealAction?: React.ReactNode;
}

function formatStageTitle(name: string): string {
  return name
    .replace(/^Opportunity Created/i, 'Opportunity')
    .replace(/^Proposal Sent/i, 'Proposal');
}

function computeDealsStageTotal(stageDeals: CrmDeal[]): { total: string | null; weighted?: string | null } {
  let total = 0;
  let weighted = 0;
  for (const d of stageDeals) {
    const val = Number(d.value) || 0;
    total += val;
    const prob = d.probability != null ? d.probability : 100;
    weighted += (val * prob) / 100;
  }
  if (total <= 0) return { total: null };

  const formatVal = (val: number) => {
    if (val >= 1_000_000) return `PKR ${(val / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (val >= 1_000) return `PKR ${(val / 1_000).toFixed(0)}k`;
    return `PKR ${val.toLocaleString()}`;
  };

  return {
    total: formatVal(total),
    weighted: weighted > 0 ? formatVal(weighted) : undefined,
  };
}

export const CrmDealKanbanBoard: React.FC<CrmDealKanbanBoardProps> = ({
  deals,
  stages,
  selectedDealId,
  canManageOutcomes,
  onOpen,
  onMoveStage,
  onWon,
  onLost,
  onReopen,
  onApproveWon,
}) => {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const openStages = useMemo(
    () => [...stages].sort((a, b) => a.order - b.order),
    [stages]
  );

  const byStage = useMemo(() => {
    const map: Record<string, CrmDeal[]> = {};
    for (const s of openStages) map[s.id] = [];
    map['won'] = [];
    map['lost'] = [];

    for (const deal of deals) {
      if (deal.status === 'won') {
        map['won'].push(deal);
      } else if (deal.status === 'lost') {
        map['lost'].push(deal);
      } else {
        const stage = deal.stage || 'proposal';
        if (!map[stage]) map[stage] = [];
        map[stage].push(deal);
      }
    }
    return map;
  }, [deals, openStages]);

  const drop = async (target: DropTarget) => {
    if (!draggingId) return;
    const deal = deals.find((d) => d.id === draggingId);
    setOverKey(null);
    setDraggingId(null);
    if (!deal) return;

    if (target.kind === 'stage') {
      if (deal.stage === target.stage && deal.status === 'open') return;
      setBusyId(deal.id);
      try {
        if (deal.status !== 'open' && onReopen) {
          await onReopen(deal.id, target.stage);
        } else {
          await onMoveStage(deal.id, target.stage);
        }
      } finally {
        setBusyId(null);
      }
      return;
    }

    setBusyId(deal.id);
    try {
      if (target.outcome === 'won') {
        if (deal.status === 'won') return;
        await onWon(deal.id);
      } else {
        if (deal.status === 'lost') return;
        await onLost(deal.id);
      }
    } finally {
      setBusyId(null);
    }
  };

  const renderCard = (deal: CrmDeal, currentStageIndex?: number) => {
    const isWon = deal.status === 'won';
    const isLost = deal.status === 'lost';
    const isSelected = selectedDealId === deal.id;
    const leadName = deal.lead?.name || 'Lead';
    const assignee = deal.lead?.assigned_to_name;
    const hasNextStage =
      currentStageIndex !== undefined &&
      currentStageIndex >= 0 &&
      currentStageIndex < openStages.length - 1;
    const nextStage = hasNextStage ? openStages[currentStageIndex + 1] : null;
    const pendingOps = isWon && deal.approval_status === 'pending_operations';
    const confirmed = isWon && deal.approval_status === 'approved';

    return (
      <article
        key={deal.id}
        draggable={!busyId}
        onDragStart={() => setDraggingId(deal.id)}
        onDragEnd={() => {
          setDraggingId(null);
          setOverKey(null);
        }}
        onClick={() => onOpen(deal)}
        className={`group relative rounded-lg border bg-surface p-3 transition-all cursor-grab active:cursor-grabbing select-none ${
          isWon
            ? 'border-success/30'
            : isLost
              ? 'border-danger/30 opacity-85'
              : 'border-border hover:border-border-strong hover:shadow-xs'
        } ${isSelected ? 'ring-2 ring-accent border-accent' : ''} ${
          busyId === deal.id ? 'opacity-50' : ''
        } ${draggingId === deal.id ? 'opacity-40 shadow-md' : ''}`}
      >
        {/* Row 1: Title + Lead Name & Company + Avatar */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="text-[13px] font-medium text-fg truncate group-hover:text-accent transition-colors">
              {deal.title}
            </h4>
            <p className="text-micro text-fg-muted truncate mt-0.5">
              {leadName}
              {deal.lead?.company ? ` · ${deal.lead.company}` : ''}
            </p>
          </div>
          {assignee ? (
            <span
              className="w-5 h-5 rounded-full bg-subtle border border-border text-fg-muted font-medium flex items-center justify-center text-[10px] uppercase shrink-0"
              title={assignee}
            >
              {getInitials(assignee)}
            </span>
          ) : (
            <Briefcase className="w-3.5 h-3.5 text-fg-muted shrink-0 mt-0.5" />
          )}
        </div>

        {/* Row 2: Value + Probability + Service + Billing */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {deal.service && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-micro font-normal bg-subtle text-fg-muted truncate max-w-[140px]">
              {deal.service}
            </span>
          )}
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-micro font-numeric font-medium text-fg tabular-nums bg-subtle">
            {formatDealMoney(deal.value, deal.currency)}
          </span>
          {deal.probability != null && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-micro font-numeric text-fg-muted tabular-nums bg-subtle">
              {deal.probability}% likely
            </span>
          )}
          {deal.billing_type && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-micro text-fg-muted capitalize bg-subtle">
              {deal.billing_type.replace('_', ' ')}
            </span>
          )}
        </div>

        {/* Row 3: Status / Approvals / Advance */}
        <div className="mt-2.5 pt-2 border-t border-border/50 flex items-center justify-between gap-2 text-micro">
          <div className="min-w-0 flex items-center gap-1.5">
            {isWon ? (
              confirmed ? (
                <span className="inline-flex items-center gap-1 text-micro font-medium text-success-fg">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Confirmed</span>
                </span>
              ) : pendingOps ? (
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-micro font-medium text-warning-fg">
                    <Clock className="w-3 h-3" />
                    <span>Pending ops</span>
                  </span>
                  {canManageOutcomes && onApproveWon && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onApproveWon(deal.id);
                      }}
                      className="text-micro font-semibold h-5 px-1.5 rounded bg-success-fg text-white hover:opacity-90 cursor-pointer"
                    >
                      Confirm
                    </button>
                  )}
                </div>
              ) : null
            ) : isLost ? (
              <span className="inline-flex items-center text-micro font-medium text-danger-fg capitalize truncate max-w-[90px]">
                {deal.lost_reason || 'Lost'}
              </span>
            ) : (
              <span className="text-micro text-fg-muted truncate max-w-[110px]">
                {assignee || 'Unassigned'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {nextStage && deal.status === 'open' && (
              <button
                type="button"
                title={`Advance to ${formatStageTitle(nextStage.name)}`}
                aria-label={`Advance to ${formatStageTitle(nextStage.name)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void onMoveStage(deal.id, nextStage.id);
                }}
                className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-hover text-fg-muted hover:text-fg transition cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            {(isWon || isLost) && canManageOutcomes && onReopen && (
              <button
                type="button"
                title="Reopen deal"
                aria-label="Reopen deal"
                onClick={(e) => {
                  e.stopPropagation();
                  void onReopen(deal.id, 'opportunity_created');
                }}
                className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-hover text-fg-muted hover:text-fg transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="relative flex-1 overflow-x-auto overflow-y-hidden px-5 py-3 custom-scrollbar">
      {/* Drop targets */}
      {draggingId && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border shadow-lg animate-in fade-in-0 zoom-in-95 duration-150">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (overKey !== 'outcome:won') setOverKey('outcome:won');
            }}
            onDragLeave={() => setOverKey(null)}
            onDrop={(e) => {
              e.preventDefault();
              void drop({ kind: 'outcome', outcome: 'won' });
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border border-dashed transition cursor-pointer ${
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
            onDragLeave={() => setOverKey(null)}
            onDrop={(e) => {
              e.preventDefault();
              void drop({ kind: 'outcome', outcome: 'lost' });
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border border-dashed transition cursor-pointer ${
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

      {/* Columns */}
      <div className="h-full flex gap-3 min-w-min pb-2 items-start">
        {openStages.map((stage, stageIndex) => {
          const columnDeals = byStage[stage.id] || [];
          const key = `stage:${stage.id}`;
          const isDrop = overKey === key;
          const { total, weighted } = computeDealsStageTotal(columnDeals);

          return (
            <div key={stage.id} className="w-[210px] shrink-0 flex flex-col gap-1.5">
              {/* Header */}
              <div className="h-7 px-1 flex items-center justify-between gap-1 text-ui select-none">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[13px] font-semibold text-fg truncate" title={stage.name}>
                    {formatStageTitle(stage.name)}
                  </span>
                  <span className="text-micro font-numeric tabular-nums text-fg-muted bg-subtle px-1.5 py-0.2 rounded-full">
                    {columnDeals.length}
                  </span>
                </div>
                {total && (
                  <span
                    className="text-micro font-numeric tabular-nums text-fg-muted"
                    title={weighted ? `Weighted: ${weighted}` : undefined}
                  >
                    {total}
                  </span>
                )}
              </div>

              {/* Body */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overKey !== key) setOverKey(key);
                }}
                onDragLeave={() => setOverKey(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  void drop({ kind: 'stage', stage: stage.id });
                }}
                className={`bg-subtle rounded-lg p-2 flex flex-col gap-2 min-h-[480px] max-h-full overflow-y-auto custom-scrollbar transition-colors ${
                  isDrop ? 'bg-accent-soft outline-1 outline-dashed outline-accent-ring' : ''
                }`}
              >
                {columnDeals.map((deal) => renderCard(deal, stageIndex))}
                {columnDeals.length === 0 && (
                  <div className="h-20 border border-dashed border-border-strong rounded-lg flex items-center justify-center text-small text-fg-muted select-none">
                    No deals
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Won column */}
        {(() => {
          const columnDeals = byStage['won'] || [];
          const isDrop = overKey === 'outcome:won';
          const { total } = computeDealsStageTotal(columnDeals);

          return (
            <div className="w-[210px] shrink-0 flex flex-col gap-1.5">
              <div className="h-7 px-1 flex items-center justify-between gap-1 text-ui select-none">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[13px] font-semibold text-success-fg">Won</span>
                  <span className="text-micro font-numeric tabular-nums text-success-fg bg-success-bg px-1.5 py-0.2 rounded-full">
                    {columnDeals.length}
                  </span>
                </div>
                {total && (
                  <span className="text-micro font-numeric tabular-nums text-success-fg">
                    {total}
                  </span>
                )}
              </div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overKey !== 'outcome:won') setOverKey('outcome:won');
                }}
                onDragLeave={() => setOverKey(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  void drop({ kind: 'outcome', outcome: 'won' });
                }}
                className={`bg-subtle rounded-lg p-2 flex flex-col gap-2 min-h-[480px] max-h-full overflow-y-auto custom-scrollbar border border-success/20 transition-colors ${
                  isDrop ? 'bg-accent-soft outline-1 outline-dashed outline-accent-ring' : ''
                }`}
              >
                {columnDeals.map((deal) => renderCard(deal))}
                {columnDeals.length === 0 && (
                  <div className="h-20 border border-dashed border-border-strong rounded-lg flex items-center justify-center text-small text-fg-muted select-none">
                    None
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Lost column */}
        {(() => {
          const columnDeals = byStage['lost'] || [];
          const isDrop = overKey === 'outcome:lost';
          const { total } = computeDealsStageTotal(columnDeals);

          return (
            <div className="w-[210px] shrink-0 flex flex-col gap-1.5">
              <div className="h-7 px-1 flex items-center justify-between gap-1 text-ui select-none">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[13px] font-semibold text-danger-fg">Lost</span>
                  <span className="text-micro font-numeric tabular-nums text-danger-fg bg-danger-bg px-1.5 py-0.2 rounded-full">
                    {columnDeals.length}
                  </span>
                </div>
                {total && (
                  <span className="text-micro font-numeric tabular-nums text-danger-fg">
                    {total}
                  </span>
                )}
              </div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overKey !== 'outcome:lost') setOverKey('outcome:lost');
                }}
                onDragLeave={() => setOverKey(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  void drop({ kind: 'outcome', outcome: 'lost' });
                }}
                className={`bg-subtle rounded-lg p-2 flex flex-col gap-2 min-h-[480px] max-h-full overflow-y-auto custom-scrollbar border border-danger/20 transition-colors ${
                  isDrop ? 'bg-accent-soft outline-1 outline-dashed outline-accent-ring' : ''
                }`}
              >
                {columnDeals.map((deal) => renderCard(deal))}
                {columnDeals.length === 0 && (
                  <div className="h-20 border border-dashed border-border-strong rounded-lg flex items-center justify-center text-small text-fg-muted select-none">
                    None
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
