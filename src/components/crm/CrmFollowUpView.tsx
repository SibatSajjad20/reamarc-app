import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Clock,
  Calendar,
  MessageSquare,
  Check,
  Phone,
  User,
  ChevronDown,
} from 'lucide-react';
import type { CrmLead } from '../../types/crm';
import { crmService } from '../../services/crmService';
import { toSafeWhatsAppUrl } from '../../utils/safeUrl';

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
      const menuHeight = 160;
      const menuWidth = 220;
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
        width: 220,
      }}
      className="rounded-2xl bg-white dark:bg-[#161824] shadow-xl border border-zinc-200 dark:border-zinc-700 p-3 z-[100]"
      onClick={(e) => e.stopPropagation()}
    >
      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">
        Pick Date & Time
      </label>
      <input
        type="datetime-local"
        value={customDateTime}
        onChange={(e) => setCustomDateTime(e.target.value)}
        className="w-full text-[11px] px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
      />
      {customDateTime ? (
        <button
          type="button"
          onClick={() => onSave(lead.id)}
          className="mt-2 w-full py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-500 transition cursor-pointer"
        >
          Set Follow-up
        </button>
      ) : null}
      {lead.next_follow_up_at ? (
        <button
          type="button"
          onClick={() => onClear(lead.id)}
          className="mt-1.5 w-full text-left px-1 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition cursor-pointer"
        >
          Clear Follow-up
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

  const { todayLeads, scheduledLeads, idleLeads } = useMemo(() => {
    const today: CrmLead[] = [];
    const scheduled: CrmLead[] = [];
    const idle: CrmLead[] = [];

    for (const lead of activeLeads) {
      if (!lead.next_follow_up_at) {
        idle.push(lead);
        continue;
      }
      const t = new Date(lead.next_follow_up_at).getTime();
      if (Number.isNaN(t)) {
        idle.push(lead);
        continue;
      }
      if (t <= endOfToday) today.push(lead);
      else scheduled.push(lead);
    }

    const byTime = (a: CrmLead, b: CrmLead) =>
      new Date(a.next_follow_up_at!).getTime() - new Date(b.next_follow_up_at!).getTime();
    today.sort(byTime);
    scheduled.sort(byTime);
    idle.sort(
      (a, b) =>
        new Date(b.last_activity_at || b.updated_at).getTime() -
        new Date(a.last_activity_at || a.updated_at).getTime()
    );

    return { todayLeads: today, scheduledLeads: scheduled, idleLeads: idle };
  }, [activeLeads, endOfToday]);

  const formatFollowUpTime = (
    iso: string | null | undefined,
    bucket: 'today' | 'scheduled' | 'idle'
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

  const handleOpenWhatsApp = async (lead: CrmLead) => {
    const wa = toSafeWhatsAppUrl(lead.wa_url);
    if (!wa) return;
    window.open(wa, '_blank', 'noopener,noreferrer');
    try {
      await crmService.logWhatsappOpened(lead.id);
      onOptimisticUpdate?.(lead.id, {
        whatsapp_opened_at: new Date().toISOString(),
        contacted: true,
      });
    } catch {
      /* non-blocking */
    }
  };

  const renderFollowUpRow = (lead: CrmLead, bucket: 'today' | 'scheduled' | 'idle') => {
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
        className={`flex items-center gap-3 px-3.5 py-3 bg-white dark:bg-[#11131a] hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition cursor-pointer ${
          isSelected ? 'ring-2 ring-inset ring-indigo-500/40' : ''
        } ${isBusy ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            {lead.name}
          </p>
          <p className="text-[11px] text-zinc-500 truncate">
            {[lead.company, lead.phone_raw || lead.email].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>

        {/* Stage & Service Badges */}
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 capitalize">
            {lead.stage.replace(/_/g, ' ')}
          </span>
          {lead.service && (
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {lead.service}
            </span>
          )}
          {lead.total_deal_value ? (
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-semibold font-numeric text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              ${lead.total_deal_value.toLocaleString()}
            </span>
          ) : null}
          {lead.assigned_to_name && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              <User className="w-3 h-3" />
              <span>{lead.assigned_to_name}</span>
            </span>
          )}
        </div>

        {/* Time Badge */}
        <div className="shrink-0">
          {timeInfo ? (
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full font-numeric ${
                timeInfo.isOverdue
                  ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 motion-safe:animate-pulse'
                  : timeInfo.isToday
                  ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700'
              }`}
            >
              <Clock className="w-3 h-3 shrink-0" />
              <span>{timeInfo.text}</span>
            </span>
          ) : (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
              No follow-up set
            </span>
          )}
        </div>

        {/* Actions */}
        <div
          className="flex items-center gap-1.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {lead.wa_url ? (
            <button
              type="button"
              onClick={() => void handleOpenWhatsApp(lead)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold transition cursor-pointer border border-emerald-500/20"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden md:inline">WhatsApp</span>
            </button>
          ) : lead.phone_raw ? (
            <a
              href={`tel:${lead.phone_raw}`}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300 text-xs font-semibold transition"
            >
              <Phone className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Call</span>
            </a>
          ) : null}

          <div className="relative">
            <button
              type="button"
              ref={(el) => {
                rescheduleBtnRefs.current[lead.id] = el;
              }}
              onClick={() => setRescheduleLeadId(isRescheduling ? null : lead.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-zinc-500" />
              <span className="hidden md:inline">Reschedule</span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
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
              className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-zinc-400 hover:text-emerald-600 transition flex items-center justify-center cursor-pointer"
            >
              <Check className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Category 1: Today & Overdue */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-rose-500 motion-safe:animate-pulse" />
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            Today &amp; Overdue
          </h3>
          <span className="text-xs font-bold font-numeric px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400">
            {todayLeads.length}
          </span>
        </div>

        {todayLeads.length > 0 ? (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
            {todayLeads.map((l) => renderFollowUpRow(l, 'today'))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-4 py-6 text-center bg-zinc-50/50 dark:bg-zinc-900/20">
            <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              No follow-ups due today
            </p>
          </div>
        )}
      </section>

      {/* Category 2: Scheduled (Upcoming) */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-zinc-400" />
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            Scheduled
          </h3>
          <span className="text-xs font-bold font-numeric px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
            {scheduledLeads.length}
          </span>
        </div>

        {scheduledLeads.length > 0 ? (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
            {scheduledLeads.map((l) => renderFollowUpRow(l, 'scheduled'))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-4 py-5 text-center text-xs text-zinc-400">
            No upcoming follow-ups
          </div>
        )}
      </section>

      {/* Category 3: Idle / No Follow-up */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-zinc-400" />
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            No follow-up set
          </h3>
          <span className="text-xs font-bold font-numeric px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
            {idleLeads.length}
          </span>
        </div>

        {idleLeads.length > 0 ? (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
            {idleLeads.map((l) => renderFollowUpRow(l, 'idle'))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-4 py-5 text-center text-xs text-zinc-400">
            Every active lead has a follow-up
          </div>
        )}
      </section>
    </div>
  );
};
