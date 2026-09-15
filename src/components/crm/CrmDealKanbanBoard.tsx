import React, { useMemo, useState } from 'react';
import {
  Briefcase,
  CheckCircle2,
  ChevronRight,
  Clock,
  RotateCcw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { NEUTRAL_METADATA_BADGE_COMPACT_CLASS } from '../../utils/badgeStyles';
import type { CrmDeal, CrmPipelineStage } from '../../types/crm';

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
  onCreateDeal?: () => void;
}

function formatStageTitle(name: string): string {
  return name
    .replace(/^Opportunity Created/i, 'Opportunity')
    .replace(/^Proposal Sent/i, 'Proposal');
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
  onCreateDeal,
}) => {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

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

  const closedCount = (byStage['won']?.length || 0) + (byStage['lost']?.length || 0);

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

  const columnClass = (key: string) =>
    `min-w-[220px] w-[230px] flex-shrink-0 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl bg-zinc-100/50 dark:bg-zinc-900/40 transition-all ${
      overKey === key ? 'ring-2 ring-indigo-500/50 border-indigo-500/50' : ''
    }`;

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
    const pendingOps =
      isWon && deal.approval_status === 'pending_operations' && !deal.converted_workspace_id;

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
        className={`group relative rounded-lg border bg-white dark:bg-zinc-950 p-2.5 transition-all cursor-grab active:cursor-grabbing ${
          isWon
            ? 'border-emerald-500/30 dark:border-emerald-500/20'
            : isLost
              ? 'border-rose-500/30 dark:border-rose-500/20 opacity-85'
              : 'border-zinc-200/90 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
        } ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-500' : ''} ${
          busyId === deal.id ? 'opacity-50' : ''
        } ${draggingId === deal.id ? 'opacity-40' : ''}`}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {deal.title}
          </p>
          {isWon ? (
            <span className="inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60 shrink-0">
              Won
            </span>
          ) : isLost ? (
            <span className="inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/60 shrink-0 capitalize max-w-[72px] truncate">
              {deal.lost_reason || 'Lost'}
            </span>
          ) : (
            <Briefcase className="w-3 h-3 text-zinc-300 dark:text-zinc-600 shrink-0" />
          )}
        </div>

        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-1">
          {leadName}
          {deal.lead?.company ? ` · ${deal.lead.company}` : ''}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {deal.service && (
            <span className={NEUTRAL_METADATA_BADGE_COMPACT_CLASS}>{deal.service}</span>
          )}
          <span className={`${NEUTRAL_METADATA_BADGE_COMPACT_CLASS} font-numeric font-semibold`}>
            {deal.currency === 'PKR' ? '₨' : '$'}
            {Number(deal.value || 0).toLocaleString()}
          </span>
          {deal.probability != null && (
            <span className={`${NEUTRAL_METADATA_BADGE_COMPACT_CLASS} font-numeric`}>
              {deal.probability}%
            </span>
          )}
          {deal.billing_type && (
            <span className={`${NEUTRAL_METADATA_BADGE_COMPACT_CLASS} capitalize`}>
              {deal.billing_type.replace('_', ' ')}
            </span>
          )}
        </div>

        {isWon && (
          <div className="mt-2">
            {deal.converted_workspace_id ? (
              <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-3 h-3" />
                <span>Workspace active</span>
              </div>
            ) : pendingOps ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-800/60 motion-safe:animate-pulse">
                  <Clock className="w-3 h-3" />
                  <span>Pending ops</span>
                </div>
                {canManageOutcomes && onApproveWon && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onApproveWon(deal.id);
                    }}
                    className="text-[11px] font-bold h-7 px-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
                  >
                    Approve
                  </button>
                )}
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-1 text-[11px]">
          <span className="text-zinc-500 dark:text-zinc-400 truncate max-w-[100px]">
            {assignee || 'Unassigned'}
          </span>

          <div className="flex items-center gap-1">
            {nextStage && deal.status === 'open' && (
              <button
                type="button"
                title={`Advance to ${formatStageTitle(nextStage.name)}`}
                aria-label={`Advance to ${formatStageTitle(nextStage.name)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void onMoveStage(deal.id, nextStage.id);
                }}
                className="inline-flex items-center justify-center size-7 rounded-md bg-zinc-100 hover:bg-indigo-50 dark:bg-zinc-800 dark:hover:bg-indigo-950/50 text-zinc-600 hover:text-indigo-700 dark:text-zinc-300 dark:hover:text-indigo-300 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
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
                className="inline-flex items-center justify-center size-7 rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </article>
    );
  };

  const totalOpen = deals.filter((d) => d.status === 'open').length;

  return (
    <div className="relative flex-1 overflow-x-auto overflow-y-hidden px-5 py-3">
      {draggingId && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700">
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
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed transition cursor-pointer ${
              overKey === 'outcome:won'
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700'
                : 'border-emerald-300 dark:border-emerald-800 text-emerald-600'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-xs font-bold">Drop to Won</span>
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
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed transition cursor-pointer ${
              overKey === 'outcome:lost'
                ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700'
                : 'border-rose-300 dark:border-rose-800 text-rose-600'
            }`}
          >
            <XCircle className="w-4 h-4" />
            <span className="text-xs font-bold">Drop to Lost</span>
          </div>
        </div>
      )}

      <div className="h-full flex gap-3 min-w-min">
        {openStages.map((stage, stageIndex) => {
          const columnDeals = byStage[stage.id] || [];
          const key = `stage:${stage.id}`;
          return (
            <div
              key={stage.id}
              className={`${columnClass(key)} flex flex-col max-h-full`}
              onDragOver={(e) => {
                e.preventDefault();
                if (overKey !== key) setOverKey(key);
              }}
              onDragLeave={() => setOverKey(null)}
              onDrop={(e) => {
                e.preventDefault();
                void drop({ kind: 'stage', stage: stage.id });
              }}
            >
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-200/60 dark:border-zinc-800/60">
                <h3 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  {formatStageTitle(stage.name)}
                </h3>
                <span className="text-[11px] font-bold font-numeric px-1.5 py-0.5 rounded-full bg-zinc-200/80 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  {columnDeals.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {columnDeals.map((d) => renderCard(d, stageIndex))}
                {columnDeals.length === 0 && (
                  <div className="py-6 text-center text-[11px] text-zinc-400">No deals</div>
                )}
              </div>
            </div>
          );
        })}

        <div className="min-w-[120px] flex-shrink-0 flex flex-col gap-2 py-1">
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 whitespace-nowrap"
          >
            {showClosed ? 'Hide closed' : `Closed (${closedCount})`}
          </button>
        </div>

        {showClosed && (
          <>
            <div
              className={`${columnClass('outcome:won')} flex flex-col max-h-full`}
              onDragOver={(e) => {
                e.preventDefault();
                if (overKey !== 'outcome:won') setOverKey('outcome:won');
              }}
              onDragLeave={() => setOverKey(null)}
              onDrop={(e) => {
                e.preventDefault();
                void drop({ kind: 'outcome', outcome: 'won' });
              }}
            >
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-emerald-200/60 dark:border-emerald-900/40">
                <h3 className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Won</h3>
                <span className="text-[11px] font-bold font-numeric px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                  {(byStage['won'] || []).length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {(byStage['won'] || []).map((d) => renderCard(d))}
                {(byStage['won'] || []).length === 0 && (
                  <div className="py-6 text-center text-[11px] text-zinc-400">None</div>
                )}
              </div>
            </div>

            <div
              className={`${columnClass('outcome:lost')} flex flex-col max-h-full`}
              onDragOver={(e) => {
                e.preventDefault();
                if (overKey !== 'outcome:lost') setOverKey('outcome:lost');
              }}
              onDragLeave={() => setOverKey(null)}
              onDrop={(e) => {
                e.preventDefault();
                void drop({ kind: 'outcome', outcome: 'lost' });
              }}
            >
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-rose-200/60 dark:border-rose-900/40">
                <h3 className="text-xs font-bold text-rose-700 dark:text-rose-400">Lost</h3>
                <span className="text-[11px] font-bold font-numeric px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400">
                  {(byStage['lost'] || []).length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {(byStage['lost'] || []).map((d) => renderCard(d))}
                {(byStage['lost'] || []).length === 0 && (
                  <div className="py-6 text-center text-[11px] text-zinc-400">None</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {totalOpen === 0 && deals.length === 0 && onCreateDeal && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto text-center p-6 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white/90 dark:bg-zinc-950/90 max-w-sm">
            <Briefcase className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">No deals yet</p>
            <p className="text-xs text-zinc-500 mt-1 mb-3">
              Create a deal from a qualified lead to start the commercial pipeline.
            </p>
            <button
              type="button"
              onClick={onCreateDeal}
              className="h-8 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
            >
              Create Deal
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
