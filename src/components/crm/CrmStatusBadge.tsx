import React from 'react';
import type { CrmLead } from '../../types/crm';
import { StatusPill, type statusPillVariants } from '../ui/StatusPill';
import type { VariantProps } from 'class-variance-authority';

type PillVariant = NonNullable<VariantProps<typeof statusPillVariants>['variant']>;

export function leadOperationalStatus(lead: Pick<
  CrmLead,
  'outcome' | 'contacted' | 'next_follow_up_at' | 'approval_status' | 'converted_workspace_id'
>): {
  variant: PillVariant;
  label: string;
  dotClass: string;
} {
  if (lead.outcome === 'won') {
    if (!lead.converted_workspace_id) {
      return { variant: 'warning', label: 'Needs client form', dotClass: 'bg-warning-fg' };
    }
    return { variant: 'success', label: 'Won', dotClass: 'bg-success-fg' };
  }
  if (lead.outcome === 'lost') {
    return { variant: 'danger', label: 'Lost', dotClass: 'bg-danger-fg' };
  }
  if (lead.outcome === 'disqualified') {
    return { variant: 'neutral', label: 'Disqualified', dotClass: 'bg-fg-muted' };
  }
  if (lead.outcome === 'trashed') {
    return { variant: 'neutral', label: 'Trashed', dotClass: 'bg-fg-muted' };
  }
  const isOverdue =
    Boolean(lead.next_follow_up_at) && new Date(lead.next_follow_up_at as string).getTime() < Date.now();
  if (isOverdue) {
    return { variant: 'danger', label: 'Follow-up due', dotClass: 'bg-danger-fg' };
  }
  if (!lead.contacted) {
    return { variant: 'neutral', label: 'Uncontacted', dotClass: 'bg-fg-muted' };
  }
  return { variant: 'success', label: 'Contacted', dotClass: 'bg-success-fg' };
}

export const CrmStatusBadge: React.FC<{
  lead: Pick<
    CrmLead,
    'outcome' | 'contacted' | 'next_follow_up_at' | 'approval_status' | 'converted_workspace_id'
  >;
  className?: string;
}> = ({ lead, className }) => {
  const status = leadOperationalStatus(lead);
  return (
    <StatusPill
      variant={status.variant}
      dot
      className={className}
    >
      {status.label}
    </StatusPill>
  );
};

/** Compact card signal: colored dot only (title via native tooltip). */
export const CrmStatusDot: React.FC<{
  lead: Pick<CrmLead, 'outcome' | 'contacted' | 'next_follow_up_at'>;
}> = ({ lead }) => {
  if (
    lead.outcome === 'won' ||
    lead.outcome === 'lost' ||
    lead.outcome === 'disqualified' ||
    lead.outcome === 'trashed'
  ) {
    return null;
  }
  const isOverdue =
    Boolean(lead.next_follow_up_at) && new Date(lead.next_follow_up_at as string).getTime() < Date.now();
  if (isOverdue) {
    return (
      <span
        className="w-1.5 h-1.5 rounded-full bg-danger-fg shrink-0"
        title="Follow-up overdue"
      />
    );
  }
  if (!lead.contacted) {
    return (
      <span
        className="w-1.5 h-1.5 rounded-full bg-warning-dot shrink-0"
        title="Uncontacted"
      />
    );
  }
  return (
    <span
      className="w-1.5 h-1.5 rounded-full bg-fg-muted/40 shrink-0"
      title="Contacted"
    />
  );
};
