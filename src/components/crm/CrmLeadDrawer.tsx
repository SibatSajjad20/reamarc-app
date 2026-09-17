import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Flag,
  History,
  Loader2,
  MessageCircle,
  Phone,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Clock,
  Download,
  User,
  UserCheck,
  Megaphone,
  Video,
  X,
} from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import { CrmDeleteConfirmModal } from './CrmDeleteConfirmModal';
import { NEUTRAL_METADATA_BADGE_CLASS } from '../../utils/badgeStyles';
import { openFileAttachment, downloadFileAttachment } from '../../utils/fileUrl';
import type {
  CrmActivity,
  CrmAssignee,
  CrmDeal,
  CrmLeadDetail,
  CrmPipelineStage,
  CrmTemplate,
} from '../../types/crm';
import { crmService } from '../../services/crmService';

const AVAILABLE_SERVICES = [
  'Website Dev',
  'Social Media Management',
  'Performance Marketing',
  'Branding',
  'SEO',
  'Web Maintenance',
  'Video Shoot',
  'Software Dev',
  'Mobile App Dev',
  'UI/UX Designing',
];

function activityLabel(type: string): string {
  if (type === 'whatsapp_opened') return 'WhatsApp opened';
  if (type === 'contacted') return 'Marked contacted';
  if (type === 'claimed') return 'Claimed';
  if (type === 'claim_opened') return 'Opened for claim';
  if (type === 'duplicate_ingest') return 'Duplicate ingest';
  if (type === 'converted') return 'Converted to client';
  if (type === 'outcome_set') return 'Outcome';
  if (type === 'stage_changed') return 'Stage changed';
  if (type === 'follow_up_set') return 'Follow-up set';
  if (type === 'follow_up_cleared') return 'Follow-up cleared';
  if (type === 'won_approved') return 'Won approved by Operations';
  if (type === 'lead_reopened') return 'Lead reopened by Admin';
  if (type === 'deal_added') return 'Deal added';
  if (type === 'deal_updated') return 'Deal updated';
  if (type === 'deal_removed') return 'Deal removed';
  if (type === 'meeting_scheduled') return 'Meeting scheduled';
  if (type === 'meeting_rescheduled') return 'Meeting rescheduled';
  if (type === 'meeting_canceled') return 'Meeting canceled';
  return type.replace(/_/g, ' ');
}

function ActivityIcon({ type }: { type: string }) {
  const tone =
    type === 'converted' || type === 'won_approved' || type === 'meeting_scheduled'
      ? 'text-emerald-600 dark:text-emerald-400'
      : type === 'outcome_set' || type === 'meeting_canceled'
        ? 'text-rose-600 dark:text-rose-400'
        : type === 'follow_up_set' || type === 'follow_up_cleared' || type === 'meeting_rescheduled'
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-zinc-500 dark:text-zinc-400';

  if (type === 'meeting_scheduled' || type === 'meeting_rescheduled') {
    return <Video className={`w-3.5 h-3.5 ${tone}`} />;
  }
  if (type === 'meeting_canceled') {
    return <Calendar className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />;
  }
  if (type === 'whatsapp_opened') {
    return <MessageCircle className={`w-3.5 h-3.5 ${tone}`} />;
  }
  if (type === 'contacted') {
    return <CheckCircle2 className={`w-3.5 h-3.5 ${tone}`} />;
  }
  if (type === 'claimed') {
    return <UserCheck className={`w-3.5 h-3.5 ${tone}`} />;
  }
  if (type === 'stage_changed' || type === 'lead_reopened') {
    return <ArrowRight className={`w-3.5 h-3.5 ${tone}`} />;
  }
  if (type === 'follow_up_set' || type === 'follow_up_cleared') {
    return <Calendar className={`w-3.5 h-3.5 ${tone}`} />;
  }
  if (type === 'converted' || type === 'won_approved') {
    return <Sparkles className={`w-3.5 h-3.5 ${tone}`} />;
  }
  if (type === 'deal_added' || type === 'deal_updated' || type === 'deal_removed') {
    return <Briefcase className={`w-3.5 h-3.5 ${tone}`} />;
  }
  if (type === 'outcome_set') {
    return <Flag className={`w-3.5 h-3.5 ${tone}`} />;
  }
  return <FileText className={`w-3.5 h-3.5 ${tone}`} />;
}

function formatWhen(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function toLocalInputValue(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const CrmLeadDrawerSkeleton: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <aside className="w-full sm:max-w-lg h-full border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#11131a] flex flex-col min-w-0 shadow-2xl z-20 animate-pulse">
    <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800/80 flex items-start justify-between gap-3">
      <div className="space-y-2 flex-1">
        <div className="h-5 w-44 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
        <div className="h-3.5 w-32 bg-zinc-100 dark:bg-zinc-800/60 rounded-md" />
      </div>
      <button type="button" onClick={onClose} className="p-1.5 text-zinc-400 cursor-pointer">
        <X className="w-4 h-4" />
      </button>
    </div>
    {/* Tab bar skeleton */}
    <div className="px-5 py-2.5 border-b border-zinc-200 dark:border-zinc-800/80">
      <div className="h-9 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl" />
    </div>
    <div className="flex-1 p-5 space-y-4 overflow-hidden">
      <div className="h-36 bg-zinc-100 dark:bg-zinc-900/40 rounded-xl border border-zinc-200/60 dark:border-zinc-800" />
      <div className="h-28 bg-zinc-100 dark:bg-zinc-900/40 rounded-xl border border-zinc-200/60 dark:border-zinc-800" />
    </div>
  </aside>
);

interface CrmLeadDrawerProps {
  lead: CrmLeadDetail | null;
  stages: CrmPipelineStage[];
  assignees: CrmAssignee[];
  templates: CrmTemplate[];
  canAssign: boolean;
  busy: boolean;
  onClose: () => void;
  onAssign: (userId: string) => Promise<void>;
  onStage: (stage: string) => Promise<void>;
  onNote: (body: string) => Promise<void>;
  onWhatsApp: (templateId?: string) => Promise<void>;
  onContacted: () => Promise<void>;
  onFollowUp: (iso: string | null) => Promise<void>;
  onClaim?: () => Promise<void>;
  onApplyRules?: () => Promise<void>;
  onDisqualify: (reason: string) => Promise<void>;
  onLost: () => Promise<void>;
  onWon: () => Promise<void>;
  onReopen?: (leadId: string, stage?: string) => Promise<void>;
  onApproveWon?: (leadId: string) => Promise<void>;
  onReloadLead?: () => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onEditProposal?: () => void;
  onCreateDeal?: () => void;
  onEditDeal?: (deal: CrmDeal) => void;
  initialTab?: 'overview' | 'activity' | 'deals';
}

type DrawerTab = 'overview' | 'activity' | 'deals';

export const CrmLeadDrawer: React.FC<CrmLeadDrawerProps> = ({
  lead,
  stages,
  assignees,
  templates,
  canAssign,
  busy,
  onClose,
  onAssign,
  onStage,
  onNote,
  onWhatsApp,
  onContacted,
  onFollowUp,
  onClaim,
  onApplyRules,
  onDisqualify,
  onLost,
  onWon,
  onReopen,
  onApproveWon,
  onReloadLead,
  onDelete,
  onEditProposal,
  onCreateDeal,
  onEditDeal,
  initialTab = 'overview',
}) => {
  const [activeTab, setActiveTab] = useState<DrawerTab>(initialTab);
  const [note, setNote] = useState('');
  const [junkReason, setJunkReason] = useState('spam');
  const [templateId, setTemplateId] = useState('');
  const [followUpLocal, setFollowUpLocal] = useState('');
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Deals State
  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [isAddingDeal, setIsAddingDeal] = useState(false);
  const [newDealTitle, setNewDealTitle] = useState('');
  const [newDealService, setNewDealService] = useState('Website Dev');
  const [newDealValue, setNewDealValue] = useState('');
  const [newDealBilling, setNewDealBilling] = useState('one_time');
  const [newDealNotes, setNewDealNotes] = useState('');
  const [savingDeal, setSavingDeal] = useState(false);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab, lead?.id]);

  // Operations Approval State
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [approvingWon, setApprovingWon] = useState(false);

  // Admin Reopen State
  const [reopenTargetStage, setReopenTargetStage] = useState('contacted');
  const [reopening, setReopening] = useState(false);

  useEffect(() => {
    setNote('');
    const def = templates.find((t) => t.is_default) || templates[0];
    setTemplateId(def?.id || '');
    setFollowUpLocal(toLocalInputValue(lead?.next_follow_up_at));
    setCopiedPhone(false);
    setConfirmDelete(false);
    setIsAddingDeal(false);
    setPaymentVerified(Boolean(lead?.payment_cleared));
  }, [lead?.id, lead?.next_follow_up_at, lead?.payment_cleared, templates]);

  useEffect(() => {
    if (!lead) {
      setDeals([]);
      setDealsLoading(false);
      return;
    }

    if (lead.deals && lead.deals.length > 0) {
      setDeals(lead.deals);
      setDealsLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setDeals([]);
    setDealsLoading(true);
    const leadId = lead.id;

    crmService
      .listDeals(leadId, { signal: controller.signal })
      .then((res) => {
        if (!cancelled) setDeals(res.deals || []);
      })
      .catch((err: any) => {
        if (err?.name === 'AbortError' || err?.status === 499) return;
        if (!cancelled) setDeals([]);
      })
      .finally(() => {
        if (!cancelled) setDealsLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [lead?.id, lead?.deals?.length]);

  if (!lead) return null;

  const activities: CrmActivity[] = lead.activities || [];
  const closed = Boolean(lead.outcome);
  const followUpOverdue =
    Boolean(lead.next_follow_up_at) &&
    !lead.outcome &&
    new Date(lead.next_follow_up_at as string).getTime() < Date.now();

  const totalDealsValue = deals
    .filter((deal) => deal.status === 'open')
    .reduce((acc, deal) => acc + (Number(deal.value) || 0), 0);

  const handleCopyPhone = (num: string) => {
    void navigator.clipboard.writeText(num);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  const handlePresetFollowUp = (hoursToAdd: number) => {
    const d = new Date();
    d.setHours(d.getHours() + hoursToAdd);
    setFollowUpLocal(toLocalInputValue(d.toISOString()));
    void onFollowUp(d.toISOString());
  };

  const handleCreateDeal = async () => {
    if (!newDealTitle.trim()) return;
    setSavingDeal(true);
    try {
      const created = await crmService.createDeal(lead.id, {
        title: newDealTitle.trim(),
        service: newDealService,
        value: parseFloat(newDealValue) || 0,
        billing_type: newDealBilling as any,
        notes: newDealNotes.trim() || undefined,
      });
      setDeals((prev) => [created, ...prev]);
      setIsAddingDeal(false);
      setNewDealTitle('');
      setNewDealValue('');
      setNewDealNotes('');
      if (onReloadLead) void onReloadLead();
    } catch (err) {
      // non-blocking
    } finally {
      setSavingDeal(false);
    }
  };

  const handleDeleteDeal = async (dealId: string) => {
    try {
      await crmService.deleteDeal(dealId);
      setDeals((prev) => prev.filter((d) => d.id !== dealId));
      if (onReloadLead) void onReloadLead();
    } catch (err) {
      // non-blocking
    }
  };

  return (
    <aside className="w-full sm:max-w-lg h-full border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#11131a] flex flex-col min-w-0 shadow-2xl z-20">
      {/* Drawer Header */}
      <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800/80 flex items-start justify-between gap-3 bg-white dark:bg-[#11131a]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-zinc-950 dark:text-zinc-50 truncate">{lead.name}</h2>
            {lead.outcome === 'won' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <Sparkles className="w-3 h-3 text-emerald-500" />
                Won
              </span>
            ) : lead.outcome === 'lost' ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                Lost
              </span>
            ) : (
              <span className={NEUTRAL_METADATA_BADGE_CLASS}>{lead.stage.replace(/_/g, ' ')}</span>
            )}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
            {lead.company || lead.email || 'No company specified'}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onDelete && canAssign && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
              title="Delete lead"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
            title="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Dedicated Confirm Delete Modal */}
      <CrmDeleteConfirmModal
        isOpen={confirmDelete}
        leadName={lead.name}
        isDeleting={deleting}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await onDelete?.(lead.id);
            setConfirmDelete(false);
            onClose();
          } finally {
            setDeleting(false);
          }
        }}
      />

      {/* Hero Contact Action Bar (Persistent for open leads) */}
      {!closed && (
        <div className="px-5 py-2.5 bg-zinc-50/80 dark:bg-zinc-900/40 border-b border-zinc-200/80 dark:border-zinc-800/80 flex flex-wrap items-center gap-2">
          {lead.phone_valid ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onWhatsApp(templateId || undefined)}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-xs font-semibold cursor-pointer transition shadow-2xs"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              WhatsApp
            </button>
          ) : (
            <span className="h-8 px-2.5 inline-flex items-center text-[11px] text-zinc-400 italic">
              WhatsApp unavailable
            </span>
          )}

          {lead.phone_e164 && (
            <a
              href={`tel:+${lead.phone_e164}`}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition shadow-2xs"
            >
              <Phone className="w-3.5 h-3.5 text-zinc-500" />
              Call
            </a>
          )}

          {!lead.contacted && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onContacted()}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-xl border border-amber-300 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100 text-xs font-semibold cursor-pointer transition shadow-2xs"
            >
              <Check className="w-3.5 h-3.5 text-amber-600" />
              Mark contacted
            </button>
          )}

          {!lead.assigned_to && onClaim && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onClaim()}
              className="h-8 px-3.5 inline-flex items-center gap-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer transition shadow-xs"
            >
              <UserCheck className="w-3.5 h-3.5" />
              Claim
            </button>
          )}

          {!lead.assigned_to && onApplyRules && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onApplyRules()}
              className="h-8 px-2.5 inline-flex items-center rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 transition cursor-pointer shadow-2xs"
            >
              Run rules
            </button>
          )}
        </div>
      )}

      {/* Segmented Tabs Bar */}
      <div className="px-5 py-2.5 border-b border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#11131a]">
        <div className="flex items-center p-1 bg-zinc-100 dark:bg-zinc-800/70 rounded-xl border border-zinc-200/80 dark:border-zinc-700/60">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('activity')}
            className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'activity'
                ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Activity</span>
            {activities.length > 0 && (
              <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-numeric font-semibold leading-none ${
                activeTab === 'activity'
                  ? 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200'
                  : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              {activities.length}
            </span>
          )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('deals')}
            className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'deals'
                ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Deals</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-numeric font-semibold leading-none bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
              {dealsLoading ? '·' : deals.length}
            </span>
          </button>
        </div>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Status & Metadata Badges */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={NEUTRAL_METADATA_BADGE_CLASS}>{lead.source}</span>

            {!lead.contacted && !lead.outcome && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Uncontacted
              </span>
            )}

            {followUpOverdue && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 motion-safe:animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                Follow-up overdue
              </span>
            )}

            {lead.outcome === 'won' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <Sparkles className="w-3 h-3 text-emerald-500" />
                Won
              </span>
            )}

            {lead.outcome === 'lost' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                Lost
              </span>
            )}
          </div>

          {/* Operations Approval & Payment Clearance Panel (Won Leads) */}
          {lead.outcome === 'won' && (
            <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-500/30 space-y-2.5">
              <div className="flex items-start gap-2.5">
                {lead.converted_workspace_id ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 animate-pulse" />
                )}
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    {lead.converted_workspace_id
                      ? 'Workspace linked'
                      : 'Pending ops approval'}
                  </h4>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                    {lead.converted_workspace_id
                      ? `Workspace ID: ${lead.converted_workspace_id}`
                      : 'Verify payment before creating the client workspace.'}
                  </p>
                </div>
              </div>

              {/* Proposal link if present */}
              {lead.proposal_config?.proposal_url && (
                <div className="pt-1 flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() =>
                      openFileAttachment(
                        lead.proposal_config!.proposal_url!,
                        lead.proposal_config!.proposal_name || 'Proposal'
                      )
                    }
                    className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>View Attached Proposal ({lead.proposal_config.proposal_name || 'Document'})</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadFileAttachment(
                        lead.proposal_config!.proposal_url!,
                        lead.proposal_config!.proposal_name || 'Proposal'
                      )
                    }
                    className="inline-flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition cursor-pointer"
                    title="Download Proposal"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download</span>
                  </button>
                </div>
              )}

              {/* Operations Approval Action (if not yet converted) */}
              {!lead.converted_workspace_id && canAssign && onApproveWon && (
                <div className="pt-2 border-t border-emerald-500/20 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={paymentVerified}
                      onChange={(e) => setPaymentVerified(e.target.checked)}
                      className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Payment has been cleared &amp; verified by Operations</span>
                  </label>

                  <button
                    type="button"
                    disabled={!paymentVerified || approvingWon}
                    onClick={async () => {
                      setApprovingWon(true);
                      try {
                        await onApproveWon(lead.id);
                      } finally {
                        setApprovingWon(false);
                      }
                    }}
                    className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    {approvingWon ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>Approve &amp; Create Active Client Workspace</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Admin Reopen Controls for Closed Leads */}
          {closed && canAssign && (
            <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  Admin Controls (Fix Closed Lead)
                </span>
                <span className="text-[10px] text-zinc-400 capitalize">
                  Status: {lead.outcome}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <CustomSelect
                    value={reopenTargetStage}
                    onChange={setReopenTargetStage}
                    options={stages.map((s) => ({ value: s.id, label: s.name }))}
                    size="sm"
                  />
                </div>

                <button
                  type="button"
                  disabled={reopening}
                  onClick={async () => {
                    setReopening(true);
                    try {
                      if (onReopen) {
                        await onReopen(lead.id, reopenTargetStage);
                      } else {
                        await onStage(reopenTargetStage);
                      }
                    } finally {
                      setReopening(false);
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-xs shrink-0"
                >
                  {reopening ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  <span>Reopen Deal</span>
                </button>
              </div>
            </div>
          )}

          {/* Scheduled Meeting Card (Calendly / Video Consultation) */}
          {lead.meeting && (
            <div className={`rounded-2xl border p-4 space-y-3 ${
              lead.meeting.status === 'canceled'
                ? 'border-rose-500/30 bg-rose-50/50 dark:bg-rose-950/20'
                : 'border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase border ${
                      lead.meeting.status === 'canceled'
                        ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20'
                        : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                    }`}>
                      <Video className="w-3 h-3" />
                      {lead.meeting.status === 'canceled' ? 'Meeting Canceled' : 'Upcoming Meeting'}
                    </span>
                    {lead.meeting.timezone && (
                      <span className="text-[10px] text-zinc-400">({lead.meeting.timezone})</span>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-1.5 truncate">
                    {lead.meeting.event_name || 'Consultancy Session'}
                  </h4>
                  {lead.meeting.host_name && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Host: <span className="font-medium text-zinc-700 dark:text-zinc-300">{lead.meeting.host_name}</span>
                    </p>
                  )}
                </div>

                {lead.meeting.join_url && lead.meeting.status !== 'canceled' && /^https:\/\//i.test(lead.meeting.join_url) && (
                  <a
                    href={lead.meeting.join_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>Join Call</span>
                    <ExternalLink className="w-3 h-3 opacity-70" />
                  </a>
                )}
              </div>

              {/* Time Display */}
              {lead.meeting.start_time && (
                <div className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl ${
                  lead.meeting.status === 'canceled'
                    ? 'text-rose-950 dark:text-rose-200 bg-rose-100/60 dark:bg-rose-900/30'
                    : 'text-emerald-950 dark:text-emerald-200 bg-emerald-100/60 dark:bg-emerald-900/30'
                }`}>
                  <Clock className={`w-4 h-4 shrink-0 ${
                    lead.meeting.status === 'canceled' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                  }`} />
                  <span>
                    {new Date(lead.meeting.start_time).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}{' '}
                    at{' '}
                    {new Date(lead.meeting.start_time).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {lead.meeting.end_time && (
                      <>
                        {' – '}
                        {new Date(lead.meeting.end_time).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </>
                    )}
                  </span>
                </div>
              )}

              {/* Cancellation details */}
              {lead.meeting.status === 'canceled' && lead.meeting.cancellation_reason && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300">
                  <span className="font-semibold">Reason: </span>
                  {lead.meeting.cancellation_reason}
                </div>
              )}

              {/* Form Responses / Questions */}
              {lead.meeting.questions_and_answers && lead.meeting.questions_and_answers.length > 0 && (
                <div className="pt-2 border-t border-emerald-500/15 dark:border-emerald-500/10 space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                    Booking Form Responses
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {lead.meeting.questions_and_answers.map((qa, idx) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-white/70 dark:bg-zinc-900/60 border border-emerald-500/15">
                        <p className="text-[10px] font-medium text-zinc-400 truncate">{qa.question}</p>
                        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mt-0.5 break-words">
                          {qa.answer}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Proposal Document Card (Visible across all stages whenever attached or during proposal/negotiation) */}
          {(lead.proposal_config?.proposal_url ||
            (lead.deals && lead.deals.length > 0) ||
            ((lead.stage === 'qualified' ||
              lead.stage === 'session_booked' ||
              lead.stage === 'session_done') &&
              (onEditProposal || onCreateDeal))) && (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
                    {lead.deals_count
                      ? `Deals (${lead.deals_count})`
                      : lead.proposal_config?.proposal_url
                        ? 'Attached Proposal'
                        : 'Commercial Deal'}
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    {lead.total_deal_value
                      ? `Open value $${Number(lead.total_deal_value).toLocaleString()}`
                      : lead.proposal_config?.proposal_url
                        ? 'Document ready — create a deal to track it commercially'
                        : 'Create a deal to enter the proposal pipeline'}
                  </p>
                </div>
                {(onCreateDeal || onEditProposal) && (
                  <button
                    type="button"
                    onClick={() => (onCreateDeal ? onCreateDeal() : onEditProposal?.())}
                    className="shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 cursor-pointer"
                  >
                    Create Deal
                  </button>
                )}
              </div>
              {lead.proposal_config?.proposal_url && (
                <div className="flex items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                  <FileText className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="truncate">{lead.proposal_config.proposal_name || 'Proposal Document'}</span>
                </div>
              )}
              {lead.proposal_config?.proposal_notes && (
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/50 p-2 rounded-lg border border-zinc-100 dark:border-zinc-800">
                  <p className="whitespace-pre-wrap">{lead.proposal_config.proposal_notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Contact Info Details Grid */}
          <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/40 dark:bg-zinc-900/20 p-3.5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div>
                <dt className="text-zinc-400 dark:text-zinc-500 text-[11px] font-medium">Phone</dt>
                <dd className="font-numeric text-zinc-900 dark:text-zinc-100 font-semibold flex items-center gap-1.5 mt-0.5">
                  <span>{lead.phone_e164 ? `+${lead.phone_e164}` : lead.phone_raw || '—'}</span>
                  {(lead.phone_e164 || lead.phone_raw) && (
                    <button
                      type="button"
                      onClick={() => handleCopyPhone(lead.phone_e164 ? `+${lead.phone_e164}` : lead.phone_raw || '')}
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5 cursor-pointer"
                      title={copiedPhone ? 'Copied!' : 'Copy phone'}
                    >
                      {copiedPhone ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                  )}
                </dd>
              </div>

              <div>
                <dt className="text-zinc-400 dark:text-zinc-500 text-[11px] font-medium">Email</dt>
                <dd className="text-zinc-900 dark:text-zinc-100 break-all mt-0.5">
                  {lead.email ? (
                    <a href={`mailto:${lead.email}`} className="hover:underline text-indigo-600 dark:text-indigo-400">
                      {lead.email}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>

              <div>
                <dt className="text-zinc-400 dark:text-zinc-500 text-[11px] font-medium">City</dt>
                <dd className="text-zinc-900 dark:text-zinc-100 mt-0.5">{lead.city || '—'}</dd>
              </div>

              <div>
                <dt className="text-zinc-400 dark:text-zinc-500 text-[11px] font-medium">Primary Service</dt>
                <dd className="text-zinc-900 dark:text-zinc-100 mt-0.5">{lead.service || '—'}</dd>
              </div>

              <div className="col-span-2 pt-1.5 border-t border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between">
                <dt className="text-zinc-400 dark:text-zinc-500 text-[11px] font-medium">Assigned Owner</dt>
                <dd className="text-zinc-900 dark:text-zinc-100 font-medium">
                  {lead.assigned_to_name ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      {lead.assigned_to_name}
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 italic">Unassigned (Claim pool)</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          {/* Campaign & Attribution Insight Card */}
          {(lead.attribution || lead.source || lead.campaign) && (
            <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/40 dark:bg-zinc-900/20 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Megaphone className="w-3.5 h-3.5 text-indigo-500" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Source &amp; Attribution
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                  {lead.attribution?.platform || lead.source || 'Direct'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                {(lead.attribution?.campaign_name || lead.campaign) && (
                  <div className="col-span-2">
                    <span className="text-[10px] text-zinc-400 font-medium block">Campaign</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {lead.attribution?.campaign_name || lead.campaign}
                    </span>
                  </div>
                )}

                {lead.attribution?.adset_name && (
                  <div>
                    <span className="text-[10px] text-zinc-400 font-medium block">Ad Set</span>
                    <span className="text-zinc-700 dark:text-zinc-300 truncate block" title={lead.attribution.adset_name}>
                      {lead.attribution.adset_name}
                    </span>
                  </div>
                )}

                {lead.attribution?.ad_name && (
                  <div>
                    <span className="text-[10px] text-zinc-400 font-medium block">Ad Creative</span>
                    <span className="text-zinc-700 dark:text-zinc-300 truncate block" title={lead.attribution.ad_name}>
                      {lead.attribution.ad_name}
                    </span>
                  </div>
                )}

                {lead.attribution?.form_name && (
                  <div className="col-span-2">
                    <span className="text-[10px] text-zinc-400 font-medium block">Lead Form</span>
                    <span className="text-zinc-700 dark:text-zinc-300">{lead.attribution.form_name}</span>
                  </div>
                )}

                {lead.attribution?.utm_source && (
                  <div>
                    <span className="text-[10px] text-zinc-400 font-medium block">UTM Source</span>
                    <span className="text-zinc-700 dark:text-zinc-300">{lead.attribution.utm_source}</span>
                  </div>
                )}

                {lead.attribution?.utm_medium && (
                  <div>
                    <span className="text-[10px] text-zinc-400 font-medium block">UTM Medium</span>
                    <span className="text-zinc-700 dark:text-zinc-300">{lead.attribution.utm_medium}</span>
                  </div>
                )}

                {lead.attribution?.click_id && (
                  <div className="col-span-2">
                    <span className="text-[10px] text-zinc-400 font-medium block">Click ID</span>
                    <code className="text-[10px] text-zinc-500 font-numeric break-all bg-zinc-100 dark:bg-zinc-800/60 px-1 py-0.5 rounded">
                      {lead.attribution.click_id}
                    </code>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pipeline Stage & Assignment Dropdowns */}
          {!closed && (
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Stage</p>
                <CustomSelect
                  value={lead.stage}
                  onChange={(v) => void onStage(v)}
                  options={stages.map((s) => ({ value: s.id, label: s.name }))}
                  size="sm"
                  disabled={busy}
                />
              </div>
              {canAssign && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Assign Owner</p>
                  <CustomSelect
                    value={lead.assigned_to || ''}
                    onChange={(v) => {
                      if (v) void onAssign(v);
                    }}
                    options={assignees.map((a) => ({ value: a.id, label: a.full_name }))}
                    placeholder="Unassigned"
                    size="sm"
                    disabled={busy}
                  />
                </div>
              )}
            </div>
          )}

          {/* Next Follow-up Section */}
          {!closed && (
            <div className="space-y-2 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/40 dark:bg-zinc-900/20 p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Next follow-up</p>
                {lead.next_follow_up_at && (
                  <span className={`text-[11px] font-numeric font-medium ${followUpOverdue ? 'text-rose-600 animate-pulse' : 'text-zinc-500'}`}>
                    Due {formatWhen(lead.next_follow_up_at)}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  value={followUpLocal}
                  onChange={(e) => setFollowUpLocal(e.target.value)}
                  className="flex-1 h-8.5 px-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-numeric focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (!followUpLocal) {
                      void onFollowUp(null);
                      return;
                    }
                    const d = new Date(followUpLocal);
                    void onFollowUp(Number.isNaN(d.getTime()) ? null : d.toISOString());
                  }}
                  className="h-8.5 px-3 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 cursor-pointer transition shadow-2xs"
                >
                  Save
                </button>
                {lead.next_follow_up_at && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setFollowUpLocal('');
                      void onFollowUp(null);
                    }}
                    className="h-8.5 px-2.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => handlePresetFollowUp(2)}
                  className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition cursor-pointer"
                >
                  +2 hours
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetFollowUp(24)}
                  className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition cursor-pointer"
                >
                  Tomorrow
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetFollowUp(72)}
                  className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition cursor-pointer"
                >
                  In 3 days
                </button>
              </div>
            </div>
          )}

          {/* WhatsApp Template Selector (if open & valid phone) */}
          {!closed && lead.phone_valid && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">WhatsApp message template</p>
              <CustomSelect
                value={templateId}
                onChange={setTemplateId}
                options={
                  templates.length
                    ? templates.map((t) => ({
                        value: t.id,
                        label: t.is_default ? `${t.name} (default)` : t.name,
                      }))
                    : [{ value: '', label: 'No templates available' }]
                }
                size="sm"
                disabled={busy || templates.length === 0}
              />
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Activity History */}
      {activeTab === 'activity' && (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Inline Note Composer at TOP of feed */}
          {!closed && (
            <form
              className="flex gap-2 p-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/30"
              onSubmit={(e) => {
                e.preventDefault();
                if (!note.trim()) return;
                void onNote(note.trim()).then(() => setNote(''));
              }}
            >
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Write a timeline note or call summary..."
                className="flex-1 h-8.5 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-hidden"
              />
              <button
                type="submit"
                disabled={busy || !note.trim()}
                className="h-8.5 px-3.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer disabled:opacity-40 transition shadow-2xs flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Note</span>
              </button>
            </form>
          )}

          {/* Timeline Feed */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Timeline</p>
              <span className="text-[10px] text-zinc-400 font-numeric">{activities.length} events</span>
            </div>

            <ol className="relative border-l border-zinc-200 dark:border-zinc-800 ml-2 space-y-3.5">
              {activities.map((act) => (
                <li key={act.id} className="ml-4">
                  <span className="absolute -left-2 mt-1 w-4 h-4 rounded-full bg-white dark:bg-[#11131a] border border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
                    <ActivityIcon type={act.type} />
                  </span>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {activityLabel(act.type)}
                    </span>
                    <span className="text-[10px] font-numeric text-zinc-400 shrink-0">
                      {formatWhen(act.created_at)}
                    </span>
                  </div>
                  {act.body && (
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 leading-relaxed bg-zinc-50 dark:bg-zinc-900/50 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800/60">
                      {act.body}
                    </p>
                  )}
                  {act.actor_name && (
                    <p className="text-[10px] text-zinc-400 mt-0.5">by {act.actor_name}</p>
                  )}
                </li>
              ))}
              {activities.length === 0 && (
                <li className="ml-4 py-8 text-center text-xs text-zinc-400 italic">
                  No activity recorded yet.
                </li>
              )}
            </ol>
          </div>
        </div>
      )}

      {/* Tab 3: Multi-Deals Management */}
      {activeTab === 'deals' && (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Commercial Deals Header & Value Summary */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Commercial Deals</h3>
              <p className="text-[11px] text-zinc-400">
                {deals.length > 0 ? (
                  <span>
                    Open pipeline:{' '}
                    <strong className="text-emerald-600 dark:text-emerald-400 font-numeric font-semibold">
                      ${totalDealsValue.toLocaleString()}
                    </strong>
                  </span>
                ) : (
                  'Create a deal to enter the commercial pipeline'
                )}
              </p>
            </div>
            {!isAddingDeal && (
              <button
                type="button"
                onClick={() => {
                  if (onCreateDeal) {
                    onCreateDeal();
                  } else {
                    setIsAddingDeal(true);
                  }
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer transition shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Deal</span>
              </button>
            )}
          </div>

          {/* Add Deal Form (fallback if no modal handler) */}
          {isAddingDeal && !onCreateDeal && (
            <div className="p-3.5 rounded-2xl border border-indigo-500/30 bg-indigo-50/20 dark:bg-indigo-950/20 space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Add New Commercial Deal</h4>
                <button
                  type="button"
                  onClick={() => setIsAddingDeal(false)}
                  className="text-zinc-400 hover:text-zinc-600 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                type="text"
                value={newDealTitle}
                onChange={(e) => setNewDealTitle(e.target.value)}
                placeholder="Deal Title (e.g. Website Redesign & SEO)"
                className="w-full text-xs px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              />
              <div className="grid grid-cols-2 gap-2">
                <CustomSelect
                  value={newDealService}
                  onChange={setNewDealService}
                  options={AVAILABLE_SERVICES.map((s) => ({ value: s, label: s }))}
                  size="sm"
                />
                <input
                  type="number"
                  value={newDealValue}
                  onChange={(e) => setNewDealValue(e.target.value)}
                  placeholder="Value ($)"
                  className="w-full text-xs px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-numeric"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={newDealBilling}
                  onChange={(e) => setNewDealBilling(e.target.value)}
                  className="text-xs px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 flex-1"
                >
                  <option value="one_time">One-Time Project</option>
                  <option value="retainer">Monthly Retainer</option>
                </select>
                <button
                  type="button"
                  disabled={savingDeal || !newDealTitle.trim()}
                  onClick={handleCreateDeal}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {savingDeal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save Deal'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingDeal(false)}
                  className="px-2.5 py-1.5 rounded-xl text-xs text-zinc-500 hover:text-zinc-700 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Deals List */}
          <div className="space-y-2">
            {dealsLoading ? (
              <div className="space-y-2.5 animate-pulse">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-16 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/40"
                  />
                ))}
              </div>
            ) : (
              <>
            {deals.map((deal) => (
              <div
                key={deal.id}
                className="p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 flex items-center justify-between gap-3 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{deal.title}</p>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-semibold capitalize shrink-0 ${
                        deal.status === 'won'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                          : deal.status === 'lost'
                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400'
                            : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                      }`}
                    >
                      {deal.status === 'open' ? (deal.stage || 'proposal').replace(/_/g, ' ') : deal.status}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 capitalize shrink-0">
                      {deal.billing_type?.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    {deal.service} •{' '}
                    <span className="font-numeric font-semibold text-emerald-600 dark:text-emerald-400">
                      {deal.currency === 'PKR' ? '₨' : '$'}
                      {deal.value.toLocaleString()} {deal.currency}
                    </span>
                    {deal.probability != null && (
                      <span className="ml-1 text-zinc-400">· {deal.probability}%</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {onEditDeal && (
                    <button
                      type="button"
                      onClick={() => onEditDeal(deal)}
                      className="p-1.5 text-zinc-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition cursor-pointer"
                      title="Edit Deal"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDeleteDeal(deal.id)}
                    className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                    title="Remove Deal"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {deals.length === 0 && !isAddingDeal && (
              <div className="py-12 px-4 text-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/20">
                <Briefcase className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">No deals attached yet</p>
                <p className="text-[11px] text-zinc-400 mt-0.5 max-w-xs mx-auto">
                  Track project scope, contract pricing, and retainer agreements for this lead.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (onCreateDeal) onCreateDeal();
                    else setIsAddingDeal(true);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/60 cursor-pointer transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create First Deal</span>
                </button>
              </div>
            )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Outcome Footer Actions (Persistent across tabs for open leads) */}
      {!closed && (
        <div className="px-5 py-3.5 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-900/30 space-y-2.5 shrink-0">
          <div className="flex gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onWon()}
              className="flex-1 h-9 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50 transition-all shadow-xs inline-flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Won → Opportunity
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onLost()}
              className="flex-1 h-9 rounded-xl text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800/80 cursor-pointer disabled:opacity-50 transition-all inline-flex items-center justify-center gap-1.5"
            >
              Lost Lead
            </button>
          </div>

          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <CustomSelect
                value={junkReason}
                onChange={setJunkReason}
                options={[
                  { value: 'spam', label: 'Reason: Spam' },
                  { value: 'test', label: 'Reason: Test' },
                  { value: 'competitor', label: 'Reason: Competitor' },
                  { value: 'duplicate', label: 'Reason: Duplicate' },
                  { value: 'unqualified', label: 'Reason: Unqualified' },
                ]}
                size="sm"
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onDisqualify(junkReason)}
              className="h-8 px-3 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer shadow-2xs shrink-0"
            >
              Disqualify
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
