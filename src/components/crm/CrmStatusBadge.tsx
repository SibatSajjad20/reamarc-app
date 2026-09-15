import React from 'react';
import type { CrmLead } from '../../types/crm';

const DOT = 'w-1.5 h-1.5 rounded-full';

const base =
  'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border';

const styles = {
  won: `${base} bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800`,
  lost: `${base} bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800`,
  overdue: `${base} bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 motion-safe:animate-pulse`,
  uncontacted: `${base} bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800`,
  pending: `${base} bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 motion-safe:animate-pulse`,
  inert: `${base} font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700`,
} as const;

export function leadOperationalStatus(lead: Pick<
  CrmLead,
  'outcome' | 'contacted' | 'next_follow_up_at' | 'approval_status' | 'converted_workspace_id'
>): {
  kind: keyof typeof styles;
  label: string;
  dotClass: string;
} {
  if (lead.outcome === 'won') {
    if (!lead.converted_workspace_id && lead.approval_status === 'pending_operations') {
      return { kind: 'pending', label: 'Pending ops', dotClass: 'bg-amber-500' };
    }
    return { kind: 'won', label: 'Won', dotClass: 'bg-emerald-500' };
  }
  if (lead.outcome === 'lost') {
    return { kind: 'lost', label: 'Lost', dotClass: 'bg-rose-500' };
  }
  if (lead.outcome === 'disqualified') {
    return { kind: 'inert', label: 'Disqualified', dotClass: 'bg-zinc-400' };
  }
  const isOverdue =
    Boolean(lead.next_follow_up_at) && new Date(lead.next_follow_up_at as string).getTime() < Date.now();
  if (isOverdue) {
    return { kind: 'overdue', label: 'Follow-up due', dotClass: 'bg-rose-500' };
  }
  if (!lead.contacted) {
    return { kind: 'uncontacted', label: 'Uncontacted', dotClass: 'bg-amber-500' };
  }
  return { kind: 'inert', label: 'Contacted', dotClass: 'bg-zinc-400' };
}

export const CrmStatusBadge: React.FC<{
  lead: Pick<
    CrmLead,
    'outcome' | 'contacted' | 'next_follow_up_at' | 'approval_status' | 'converted_workspace_id'
  >;
  className?: string;
}> = ({ lead, className = '' }) => {
  const status = leadOperationalStatus(lead);
  return (
    <span className={`${styles[status.kind]} ${className}`.trim()}>
      <span className={`${DOT} ${status.dotClass}`} />
      {status.label}
    </span>
  );
};

/** Compact card signal: colored dot only (title via native tooltip). */
export const CrmStatusDot: React.FC<{
  lead: Pick<CrmLead, 'outcome' | 'contacted' | 'next_follow_up_at'>;
}> = ({ lead }) => {
  if (lead.outcome === 'won' || lead.outcome === 'lost' || lead.outcome === 'disqualified') {
    return null;
  }
  const isOverdue =
    Boolean(lead.next_follow_up_at) && new Date(lead.next_follow_up_at as string).getTime() < Date.now();
  if (isOverdue) {
    return (
      <span
        className="w-2 h-2 rounded-full bg-rose-500 motion-safe:animate-pulse shrink-0"
        title="Follow-up overdue"
      />
    );
  }
  if (!lead.contacted) {
    return <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Uncontacted" />;
  }
  return <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700 shrink-0" />;
};
