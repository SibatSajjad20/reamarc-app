import React, { useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Clock, RotateCcw, Sparkles, XCircle } from 'lucide-react';
import { getInitials, NEUTRAL_METADATA_BADGE_COMPACT_CLASS } from '../../utils/badgeStyles';
import type { CrmLead, CrmPipelineStage } from '../../types/crm';
import { CrmStatusDot } from './CrmStatusBadge';

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
  const [showClosed, setShowClosed] = useState(false);

  const openStages = useMemo(
    () => [...stages].sort((a, b) => a.order - b.order),
    [stages]
  );

  const byStage = useMemo(() => {
    const map: Record<string, CrmLead[]> = {};
    for (const s of openStages) map[s.id] = [];
    map['won'] = [];
    map['lost'] = [];

    for (const lead of leads) {
      if (lead.outcome === 'won') {
        map['won'].push(lead);
      } else if (lead.outcome === 'lost' || lead.outcome === 'disqualified') {
        map['lost'].push(lead);
      } else {
        const stage = lead.stage || 'new';
        if (!map[stage]) map[stage] = [];
        map[stage].push(lead);
      }
    }
    return map;
  }, [leads, openStages]);

  const closedCount = (byStage['won']?.length || 0) + (byStage['lost']?.length || 0);

  const drop = async (target: DropTarget) => {
    if (!draggingId) return;
    const lead = leads.find((l) => l.id === draggingId);
    setOverKey(null);
    setDraggingId(null);
    if (!lead) return;

    if (target.kind === 'stage') {
      if (lead.stage === target.stage && !lead.outcome) return;
      setBusyId(lead.id);
      try {
        if (lead.outcome && onReopen) {
          await onReopen(lead.id, target.stage);
        } else {
          await onMoveStage(lead.id, target.stage);
        }
      } finally {
        setBusyId(null);
      }
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

  const columnClass = (key: string) =>
    `min-w-[220px] w-[230px] flex-shrink-0 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl bg-zinc-100/50 dark:bg-zinc-900/40 transition-all ${
      overKey === key ? 'ring-2 ring-indigo-500/50 border-indigo-500/50' : ''
    }`;

  const renderCard = (lead: CrmLead, currentStageIndex?: number) => {
    const isOverdue =
      lead.next_follow_up_at && new Date(lead.next_follow_up_at).getTime() < Date.now();
    const isSelected = selectedId === lead.id;
    const isWon = lead.outcome === 'won';
    const isLost = lead.outcome === 'lost' || lead.outcome === 'disqualified';
    const hasNextStage =
      currentStageIndex !== undefined &&
      currentStageIndex >= 0 &&
      currentStageIndex < openStages.length - 1;
    const nextStage = hasNextStage ? openStages[currentStageIndex + 1] : null;

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
        className={`group relative rounded-lg border bg-white dark:bg-zinc-950 p-2.5 transition-all cursor-grab active:cursor-grabbing ${
          isWon
            ? 'border-emerald-500/30 dark:border-emerald-500/20'
            : isLost
              ? 'border-rose-500/30 dark:border-rose-500/20 opacity-85'
              : 'border-zinc-200/90 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
        } ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-500' : ''} ${
          busyId === lead.id ? 'opacity-50' : ''
        } ${draggingId === lead.id ? 'opacity-40' : ''}`}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {lead.name}
          </p>
          {isWon ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60 shrink-0">
              Won
            </span>
          ) : isLost ? (
            <span
              className="inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/60 shrink-0 capitalize max-w-[72px] truncate"
              title={lead.lost_reason || lead.disqualify_reason || 'Lost'}
            >
              {lead.lost_reason || lead.disqualify_reason || 'Lost'}
            </span>
          ) : (
            <CrmStatusDot lead={lead} />
          )}
        </div>

        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-1">
          {lead.company || (lead.phone_e164 ? `+${lead.phone_e164}` : lead.email || '—')}
        </p>

        {(Boolean(lead.total_deal_value) || Boolean(lead.service)) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {lead.service && (
              <span className={NEUTRAL_METADATA_BADGE_COMPACT_CLASS}>{lead.service}</span>
            )}
            {lead.total_deal_value ? (
              <span className={`${NEUTRAL_METADATA_BADGE_COMPACT_CLASS} font-numeric font-semibold`}>
                ${lead.total_deal_value.toLocaleString()}
                {lead.deals_count && lead.deals_count > 1 ? ` (${lead.deals_count})` : ''}
              </span>
            ) : lead.budget ? (
              <span className={`${NEUTRAL_METADATA_BADGE_COMPACT_CLASS} font-numeric`}>{lead.budget}</span>
            ) : null}
          </div>
        )}

        {isWon && (
          <div className="mt-2">
            {lead.converted_workspace_id ? (
              <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-3 h-3" />
                <span>Workspace active</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-800/60 motion-safe:animate-pulse">
                <Clock className="w-3 h-3" />
                <span>Pending ops</span>
              </div>
            )}
          </div>
        )}

        {!lead.outcome && lead.next_follow_up_at && (
          <div
            className={`mt-1.5 flex items-center gap-1 text-[11px] font-numeric ${
              isOverdue ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-zinc-400'
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>
              {new Date(lead.next_follow_up_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        )}

        <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-1 text-[11px]">
          <span className={`${NEUTRAL_METADATA_BADGE_COMPACT_CLASS} capitalize`}>{lead.source}</span>

          <div className="flex items-center gap-1">
            {nextStage && !lead.outcome && (
              <button
                type="button"
                title={`Advance to ${formatStageTitle(nextStage.name)}`}
                aria-label={`Advance to ${formatStageTitle(nextStage.name)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void onMoveStage(lead.id, nextStage.id);
                }}
                className="inline-flex items-center justify-center size-7 rounded-md bg-zinc-100 hover:bg-indigo-50 dark:bg-zinc-800 dark:hover:bg-indigo-950/50 text-zinc-600 hover:text-indigo-700 dark:text-zinc-300 dark:hover:text-indigo-300 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            {(isWon || isLost) && canAssign && onReopen && (
              <button
                type="button"
                title="Reopen lead"
                aria-label="Reopen lead"
                onClick={(e) => {
                  e.stopPropagation();
                  void onReopen(lead.id, 'contacted');
                }}
                className="inline-flex items-center justify-center size-7 rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}

            {lead.assigned_to_name ? (
              <span
                className="size-7 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center text-[10px] uppercase"
                title={lead.assigned_to_name}
              >
                {getInitials(lead.assigned_to_name)}
              </span>
            ) : (
              <span className="font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/80 px-1.5 py-0.5 rounded-md text-[11px]">
                Claim
              </span>
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="relative flex-1 overflow-x-auto overflow-y-hidden px-5 py-3">
      {draggingId && canAssign && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700">
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
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed transition-all cursor-pointer ${
              overKey === 'outcome:won'
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold'
                : 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400 font-semibold'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
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
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed transition-all cursor-pointer ${
              overKey === 'outcome:lost'
                ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold'
                : 'border-rose-500/40 text-rose-700 dark:text-rose-400 font-semibold'
            }`}
          >
            <XCircle className="w-3.5 h-3.5 text-rose-500" />
            <span className="text-xs">Drop to Lost</span>
          </div>
        </div>
      )}

      <div className="h-full flex gap-3 min-w-min pb-2">
        {openStages.map((stage, idx) => {
          const key = `stage:${stage.id}`;
          const cards = byStage[stage.id] || [];
          return (
            <section
              key={stage.id}
              className={`${columnClass(key)} flex flex-col max-h-full`}
              onDragOver={(e) => {
                e.preventDefault();
                if (overKey !== key) setOverKey(key);
              }}
              onDragLeave={() => setOverKey((cur) => (cur === key ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                void drop({ kind: 'stage', stage: stage.id });
              }}
            >
              <header className="px-3 py-2.5 border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate" title={stage.name}>
                  {formatStageTitle(stage.name)}
                </h3>
                <span className="font-numeric text-[11px] font-bold px-2 py-0.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  {cards.length}
                </span>
              </header>

              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {cards.map((lead) => renderCard(lead, idx))}
                {cards.length === 0 && (
                  <div className="h-20 flex flex-col items-center justify-center text-[11px] text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800/80 rounded-lg m-1">
                    No leads
                  </div>
                )}
              </div>
            </section>
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
            <section
              className={`${columnClass('outcome:won')} flex flex-col max-h-full border-emerald-500/20`}
              onDragOver={(e) => {
                e.preventDefault();
                if (overKey !== 'outcome:won') setOverKey('outcome:won');
              }}
              onDragLeave={() => setOverKey((cur) => (cur === 'outcome:won' ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                void drop({ kind: 'outcome', outcome: 'won' });
              }}
            >
              <header className="px-3 py-2.5 border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Won</h3>
                <span className="font-numeric text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                  {(byStage['won'] || []).length}
                </span>
              </header>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {(byStage['won'] || []).map((lead) => renderCard(lead))}
                {(byStage['won'] || []).length === 0 && (
                  <div className="h-20 flex items-center justify-center text-[11px] text-zinc-400">None</div>
                )}
              </div>
            </section>

            <section
              className={`${columnClass('outcome:lost')} flex flex-col max-h-full border-rose-500/20`}
              onDragOver={(e) => {
                e.preventDefault();
                if (overKey !== 'outcome:lost') setOverKey('outcome:lost');
              }}
              onDragLeave={() => setOverKey((cur) => (cur === 'outcome:lost' ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                void drop({ kind: 'outcome', outcome: 'lost' });
              }}
            >
              <header className="px-3 py-2.5 border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-rose-800 dark:text-rose-300">Lost</h3>
                <span className="font-numeric text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400">
                  {(byStage['lost'] || []).length}
                </span>
              </header>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {(byStage['lost'] || []).map((lead) => renderCard(lead))}
                {(byStage['lost'] || []).length === 0 && (
                  <div className="h-20 flex items-center justify-center text-[11px] text-zinc-400">None</div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};
