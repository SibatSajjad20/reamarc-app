import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Clock,
  Calendar,
  Check,
  ChevronDown,
} from 'lucide-react';
import type { CrmLead } from '../../types/crm';
import { crmService } from '../../services/crmService';
import { followUpBucket } from '../../utils/followUpBuckets';
import { CustomDateTimePicker } from '../ui/CustomDateTimePicker';
import { Avatar } from '../ui/Avatar';
import { useMemberAvatars } from '../../hooks/useMemberAvatars';

interface CrmFollowUpViewProps {
  leads: CrmLead[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  onRefresh: () => Promise<void>;
  onOptimisticUpdate?: (leadId: string, patch: Partial<CrmLead>) => void;
}

function RescheduleMenu({
  lead,
  onClose,
  onSave,
  onClear,
  customDateTime,
  setCustomDateTime,
  anchorEl,
}: {
  lead: CrmLead;
  onClose: () => void;
  onSave: (leadId: string) => void;
  onClear: (leadId: string) => void;
  customDateTime: string;
  setCustomDateTime: (v: string) => void;
  anchorEl: HTMLElement | null;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; openUp: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!anchorEl) return;
    const place = () => {
      const rect = anchorEl.getBoundingClientRect();
      const menuHeight = 220;
      const menuWidth = 260;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < menuHeight && rect.top > spaceBelow;
      const top = openUp ? rect.top - 8 : rect.bottom + 8;
      let left = rect.right - menuWidth;
      left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
      setPos({ top, left, openUp });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchorEl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (anchorEl?.contains(t)) return;
      if ((t as Element).closest?.('[data-radix-popper-content-wrapper], [role="dialog"]')) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [anchorEl, onClose]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: pos.openUp ? undefined : pos.top,
        bottom: pos.openUp ? window.innerHeight - pos.top : undefined,
        left: pos.left,
        width: 260,
      }}
      className="rounded-lg bg-surface shadow-lg border border-border p-3 z-[100]"
      onClick={(e) => e.stopPropagation()}
    >
      <label className="text-micro font-medium text-fg-muted uppercase tracking-wider block mb-1.5">
        Pick date & time
      </label>
      <CustomDateTimePicker
        value={customDateTime}
        onChange={setCustomDateTime}
        layout="stacked"
      />
      {customDateTime ? (
        <button
          type="button"
          onClick={() => onSave(lead.id)}
          className="mt-2 w-full py-1.5 rounded-md bg-accent text-accent-fg text-xs font-medium hover:bg-accent/90 transition-colors cursor-pointer"
        >
          Set follow-up
        </button>
      ) : null}
      {lead.next_follow_up_at ? (
        <button
          type="button"
          onClick={() => onClear(lead.id)}
          className="mt-1.5 w-full text-left px-1 py-1 text-xs font-medium text-danger-fg hover:bg-danger-bg rounded transition-colors cursor-pointer"
        >
          Clear follow-up
        </button>
      ) : null}
    </div>,
    document.body
  );
}

export const CrmFollowUpView: React.FC<CrmFollowUpViewProps> = ({
  leads,
  selectedId,
  onOpen,
  onRefresh,
  onOptimisticUpdate,
}) => {
  const { getAvatarUrl } = useMemberAvatars();
  const [rescheduleLeadId, setRescheduleLeadId] = useState<string | null>(null);
  const [customDateTime, setCustomDateTime] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const rescheduleBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Filter only open/active leads (unclosed)
  const activeLeads = useMemo(
    () => leads.filter((l) => !l.outcome),
    [leads]
  );

  const now = Date.now();
  const endOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }, []);

  const { overdueLeads, todayLeads, scheduledLeads, idleLeads } = useMemo(() => {
    const overdue: CrmLead[] = [];
    const today: CrmLead[] = [];
    const scheduled: CrmLead[] = [];
    const idle: CrmLead[] = [];

    for (const lead of activeLeads) {
      const bucket = followUpBucket(lead, now);
      if (bucket === 'overdue') overdue.push(lead);
      else if (bucket === 'today') today.push(lead);
      else if (bucket === 'scheduled') scheduled.push(lead);
      else if (bucket === 'idle') idle.push(lead);
    }

    const byTime = (a: CrmLead, b: CrmLead) =>
      new Date(a.next_follow_up_at!).getTime() - new Date(b.next_follow_up_at!).getTime();
    overdue.sort(byTime);
    today.sort(byTime);
    scheduled.sort(byTime);
    idle.sort(
      (a, b) =>
        new Date(b.last_activity_at || b.updated_at).getTime() -
        new Date(a.last_activity_at || a.updated_at).getTime()
    );

    return { overdueLeads: overdue, todayLeads: today, scheduledLeads: scheduled, idleLeads: idle };
  }, [activeLeads, now]);

  const formatFollowUpTime = (
    iso: string | null | undefined,
    bucket: 'today' | 'scheduled' | 'idle' | 'overdue'
  ) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const ts = d.getTime();
    const isOverdue = ts < now;
    const isToday = ts <= endOfToday && !isOverdue;
    const text =
      bucket === 'scheduled' && !isOverdue
        ? d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })
        : d.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });
    return { text, isOverdue, isToday };
  };

  const handleCustomReschedule = async (leadId: string) => {
    if (!customDateTime) return;
    setBusyId(leadId);
    try {
      const iso = new Date(customDateTime).toISOString();
      onOptimisticUpdate?.(leadId, { next_follow_up_at: iso });
      await crmService.setFollowUp(leadId, iso);
      setRescheduleLeadId(null);
      setCustomDateTime('');
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleClearFollowUp = async (leadId: string) => {
    setBusyId(leadId);
    try {
      onOptimisticUpdate?.(leadId, { next_follow_up_at: null });
      await crmService.setFollowUp(leadId, null);
      setRescheduleLeadId(null);
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  const renderFollowUpRow = (lead: CrmLead, bucket: 'overdue' | 'today' | 'scheduled' | 'idle') => {
    const timeInfo = formatFollowUpTime(lead.next_follow_up_at, bucket);
    const isSelected = selectedId === lead.id;
    const isRescheduling = rescheduleLeadId === lead.id;
    const isBusy = busyId === lead.id;

    return (
      <div
        key={lead.id}
        role="button"
        tabIndex={0}
        onClick={() => onOpen(lead.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onOpen(lead.id);
        }}
        className={`flex items-center gap-3 px-3.5 py-3 bg-surface hover:bg-hover transition-colors cursor-pointer border-b border-border last:border-b-0 ${
          isSelected ? 'ring-2 ring-inset ring-accent' : ''
        } ${isBusy ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-fg truncate">
            {lead.name}
          </p>
          <p className="text-small text-fg-muted truncate">
            {[lead.company, lead.phone_raw || lead.email].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          <span className="text-micro px-2 py-0.5 rounded bg-subtle text-fg-muted border border-border capitalize">
            {lead.stage.replace(/_/g, ' ')}
          </span>
          {lead.assigned_to_name && (
            <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
              <Avatar
                name={lead.assigned_to_name}
                src={getAvatarUrl(lead.assigned_to, lead.assigned_to_name)}
                size={20}
                className="rounded-full shrink-0 text-micro"
              />
              <span>{lead.assigned_to_name}</span>
            </span>
          )}
        </div>

        {/* Time Badge */}
        <div className="shrink-0">
          {timeInfo ? (
            <span
              className={`inline-flex items-center gap-1 text-micro font-medium px-2 py-0.5 rounded font-mono ${
                timeInfo.isOverdue
                  ? 'bg-danger-bg text-danger-fg border border-danger-bd'
                  : timeInfo.isToday
                  ? 'bg-warning-bg text-warning-fg border border-warning-bd'
                  : 'bg-subtle text-fg-muted border border-border'
              }`}
            >
              <Clock className="w-3 h-3 shrink-0" />
              <span>{timeInfo.text}</span>
            </span>
          ) : bucket === 'idle' ? null : (
            <span className="text-micro font-medium px-2 py-0.5 rounded bg-subtle text-fg-muted border border-border">
              No follow-up set
            </span>
          )}
        </div>

        {/* Actions */}
        <div
          className="flex items-center gap-1.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative">
            <button
              type="button"
              ref={(el) => {
                rescheduleBtnRefs.current[lead.id] = el;
              }}
              onClick={() => setRescheduleLeadId(isRescheduling ? null : lead.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border hover:bg-hover text-xs font-medium text-fg transition-colors cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-fg-muted" />
              <span className="hidden md:inline">{bucket === 'idle' ? 'Set follow-up' : 'Reschedule'}</span>
              <ChevronDown className="w-3 h-3 text-fg-muted" />
            </button>

            {isRescheduling && (
              <RescheduleMenu
                lead={lead}
                anchorEl={rescheduleBtnRefs.current[lead.id] || null}
                customDateTime={customDateTime}
                setCustomDateTime={setCustomDateTime}
                onClose={() => setRescheduleLeadId(null)}
                onSave={(id) => void handleCustomReschedule(id)}
                onClear={(id) => void handleClearFollowUp(id)}
              />
            )}
          </div>

          {lead.next_follow_up_at && (
            <button
              type="button"
              title="Mark follow-up done"
              onClick={() => void handleClearFollowUp(lead.id)}
              className="w-7 h-7 rounded-md border border-border hover:border-success-bd hover:bg-success-bg text-fg-muted hover:text-success-fg transition-colors flex items-center justify-center cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Overdue */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-danger-dot" />
          <h3 className="text-ui font-semibold text-fg">Overdue</h3>
          <span className="text-micro font-medium font-numeric px-2 py-0.5 rounded-full bg-danger-bg text-danger-fg border border-danger-bd">
            {overdueLeads.length}
          </span>
        </div>
        {overdueLeads.length > 0 ? (
          <div className="rounded-lg border border-border overflow-hidden bg-surface">
            {overdueLeads.map((l) => renderFollowUpRow(l, 'overdue'))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center bg-subtle/30">
            <p className="text-xs text-fg-muted">No overdue follow-ups</p>
          </div>
        )}
      </section>

      {/* Today */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-warning-dot" />
          <h3 className="text-ui font-semibold text-fg">Today</h3>
          <span className="text-micro font-medium font-numeric px-2 py-0.5 rounded-full bg-warning-bg text-warning-fg border border-warning-bd">
            {todayLeads.length}
          </span>
        </div>
        {todayLeads.length > 0 ? (
          <div className="rounded-lg border border-border overflow-hidden bg-surface">
            {todayLeads.map((l) => renderFollowUpRow(l, 'today'))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center bg-subtle/30">
            <p className="text-xs text-fg-muted">No follow-ups later today</p>
          </div>
        )}
      </section>

      {/* Category 2: Scheduled */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-fg-muted" />
          <h3 className="text-ui font-semibold text-fg">Scheduled</h3>
          <span className="text-micro font-medium font-numeric px-2 py-0.5 rounded-full bg-subtle text-fg-muted border border-border">
            {scheduledLeads.length}
          </span>
        </div>
        {scheduledLeads.length > 0 ? (
          <div className="rounded-lg border border-border overflow-hidden bg-surface">
            {scheduledLeads.map((l) => renderFollowUpRow(l, 'scheduled'))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-xs text-fg-muted">
            No upcoming follow-ups
          </div>
        )}
      </section>

      {/* Category 3: Idle / No Follow-up */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-fg-faint" />
          <h3 className="text-ui font-semibold text-fg">Idle</h3>
          <span className="text-micro font-medium font-numeric px-2 py-0.5 rounded-full bg-subtle text-fg-muted border border-border">
            {idleLeads.length}
          </span>
        </div>
        {idleLeads.length > 0 ? (
          <div className="rounded-lg border border-border overflow-hidden bg-surface">
            {idleLeads.map((l) => renderFollowUpRow(l, 'idle'))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-xs text-fg-muted">
            Every active lead has a follow-up
          </div>
        )}
      </section>
    </div>
  );
};
