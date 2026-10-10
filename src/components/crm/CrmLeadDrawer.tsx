import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  History,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Trash2,
  Clock,
  User,
  UserCheck,
  Video,
  X,
  Briefcase,
} from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import { CrmDeleteConfirmModal } from './CrmDeleteConfirmModal';
import type {
  CrmActivity,
  CrmAssignee,
  CrmDeal,
  CrmLeadDetail,
  CrmPipelineStage,
  CrmTemplate,
} from '../../types/crm';
import type { CrmLeadCreatePayload } from '../../types/crm';
import { crmService } from '../../services/crmService';
import { formatDealMoney, formatOpenDealTotals } from '../../utils/money';
import { CrmCreateLeadModal } from './CrmCreateLeadModal';
import { DrawerSkeleton } from '../ui/Skeletons';
import { Button } from '../ui/button';
import { StatusPill } from '../ui/StatusPill';
import { CustomDateTimePicker } from '../ui/CustomDateTimePicker';

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
      ? 'text-success-fg'
      : type === 'outcome_set' || type === 'meeting_canceled'
        ? 'text-danger-fg'
        : type === 'follow_up_set' || type === 'follow_up_cleared' || type === 'meeting_rescheduled'
          ? 'text-warning-fg'
          : 'text-fg-muted';

  if (type === 'meeting_scheduled' || type === 'meeting_rescheduled') {
    return <Video className={`w-3.5 h-3.5 ${tone}`} />;
  }
  if (type === 'meeting_canceled') {
    return <Calendar className="w-3.5 h-3.5 text-danger-fg" />;
  }
  if (type === 'whatsapp_opened') {
    return <MessageCircle className={`w-3.5 h-3.5 ${tone}`} />;
  }
  if (type === 'contacted') {
    return <CheckCircle2 className={`w-3.5 h-3.5 ${tone}`} />;
  }
  return <History className={`w-3.5 h-3.5 ${tone}`} />;
}

function formatWhen(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function toLocalInputValue(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const CrmLeadDrawerSkeleton: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <aside className="w-full sm:max-w-[640px] xl:w-[640px] shrink-0 h-full border-l border-border bg-surface flex flex-col min-w-0 shadow-lg z-20">
    <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
      <div className="space-y-1">
        <div className="h-5 w-44 bg-subtle rounded animate-pulse" />
        <div className="h-3.5 w-32 bg-subtle rounded animate-pulse" />
      </div>
      <button
        type="button"
        onClick={onClose}
        className="p-1.5 text-fg-muted hover:text-fg rounded cursor-pointer"
        aria-label="Close drawer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
    <div className="flex-1 overflow-y-auto">
      <DrawerSkeleton />
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
  onSaveForm: (payload: CrmLeadCreatePayload & { mark_form_complete?: boolean }) => Promise<void>;
  onNote: (body: string) => Promise<void>;
  onWhatsApp: (templateId?: string) => Promise<void>;
  onContacted: () => Promise<void>;
  onFollowUp: (iso: string | null) => Promise<void>;
  onClaim?: () => Promise<void>;
  onApplyRules?: () => Promise<void>;
  onTrash: (reason: string) => Promise<void>;
  onLost: () => Promise<void>;
  onWon: () => void | Promise<void>;
  onReopen?: (leadId: string, stage?: string) => Promise<void>;
  onReloadLead?: () => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onEditProposal?: () => void;
  onCreateDeal?: () => void;
  onEditDeal?: (deal: CrmDeal) => void;
  initialTab?: 'overview' | 'brief' | 'activity' | 'deals';
}

type DrawerTab = 'overview' | 'brief' | 'activity' | 'deals';

function BriefGroup({ title, rows }: { title: string; rows: Array<[string, string | null | undefined]> }) {
  const visible = rows.filter(([, value]) => value);
  if (!visible.length) return null;
  return (
    <section className="mb-6 last:mb-0">
      <h3 className="text-[13px] font-semibold text-fg mb-2.5">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        {visible.map(([label, value]) => (
          <div key={label} className={String(value).length > 42 ? 'col-span-2' : undefined}>
            <dt className="text-micro text-fg-muted">{label}</dt>
            <dd className="text-small text-fg mt-0.5 break-words font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

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
  onSaveForm,
  onNote,
  onWhatsApp,
  onContacted,
  onFollowUp,
  onClaim,
  onApplyRules,
  onTrash,
  onLost,
  onWon,
  onReopen,
  onReloadLead,
  onDelete,
  onEditProposal,
  onCreateDeal,
  onEditDeal,
  initialTab = 'overview',
}) => {
  const [activeTab, setActiveTab] = useState<DrawerTab>(initialTab);
  const [note, setNote] = useState('');
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [stagePrompt, setStagePrompt] = useState<string | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashReason, setTrashReason] = useState('');
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
  const [newDealBilling] = useState('one_time');
  const [newDealNotes, setNewDealNotes] = useState('');
  const [savingDeal, setSavingDeal] = useState(false);

  // Reopen State
  const [reopenTargetStage, setReopenTargetStage] = useState('contacted');
  const [reopening, setReopening] = useState(false);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab, lead?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !formOpen && !trashOpen && !stagePrompt && !confirmDelete) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, formOpen, trashOpen, stagePrompt, confirmDelete]);

  useEffect(() => {
    setNote('');
    setFollowUpLocal(toLocalInputValue(lead?.next_follow_up_at));
    setCopiedPhone(false);
    setConfirmDelete(false);
    setIsAddingDeal(false);
  }, [lead?.id, lead?.next_follow_up_at]);

  useEffect(() => {
    setFormOpen(false);
    setTemplateMenuOpen(false);
    setStagePrompt(null);
    setTrashOpen(false);
    setTrashReason('');
    if (lead && !lead.form_completed_at && !lead.outcome) {
      setFormOpen(true);
    }
  }, [lead?.id]);

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
  const canCreateDeal = lead.outcome === 'won';
  const followUpOverdue =
    Boolean(lead.next_follow_up_at) &&
    !lead.outcome &&
    new Date(lead.next_follow_up_at as string).getTime() < Date.now();

  const openDealLabel = formatOpenDealTotals(deals);

  const handleCopyPhone = (num: string) => {
    void navigator.clipboard.writeText(num);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  const handleCreateDeal = async () => {
    if (lead.outcome !== 'won' || !newDealTitle.trim()) return;
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
    } catch {
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
    } catch {
      // non-blocking
    }
  };

  return (
    <aside className="w-full sm:max-w-[640px] xl:w-[640px] shrink-0 h-full border-l border-border bg-surface flex flex-col min-w-0 shadow-lg z-20">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-border bg-surface flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[18px] font-semibold text-fg tracking-tight truncate">
                {lead.name}
              </h2>
              {lead.outcome ? (
                <StatusPill
                  variant={lead.outcome === 'won' ? 'success' : 'danger'}
                  dot
                >
                  {lead.outcome === 'won' ? 'Won' : lead.outcome}
                </StatusPill>
              ) : (
                <span className="text-micro font-medium px-2 py-0.5 rounded bg-subtle text-fg-muted uppercase">
                  {lead.stage.replace(/_/g, ' ')}
                </span>
              )}
            </div>
            <p className="text-small text-fg-muted truncate mt-0.5">
              {lead.company || 'No company specified'} · <span className="capitalize">{lead.source}</span>
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="p-1.5 rounded hover:bg-hover text-fg-muted hover:text-fg transition cursor-pointer"
              title="Edit lead brief & info"
              aria-label="Edit lead brief"
            >
              <Pencil className="w-4 h-4" />
            </button>

            {onDelete && canAssign && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded hover:bg-danger-bg text-fg-muted hover:text-danger-fg transition cursor-pointer"
                title="Delete lead"
                aria-label="Delete lead"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded hover:bg-hover text-fg-muted hover:text-fg transition cursor-pointer"
              title="Close drawer"
              aria-label="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stage selection in header */}
        {!closed && (
          <div className="flex items-center gap-2 pt-1 border-t border-border/50">
            <span className="text-micro font-medium text-fg-muted uppercase shrink-0">Stage</span>
            <div className="flex-1 max-w-[240px]">
              <CustomSelect
                value={lead.stage}
                onChange={(v) => {
                  if (!v || v === lead.stage) return;
                  const label = stages.find((s) => s.id === v)?.name || v;
                  setStagePrompt(label + '\n' + v);
                }}
                options={stages.map((s) => ({ value: s.id, label: s.name }))}
                size="sm"
                disabled={busy}
              />
            </div>
          </div>
        )}
      </div>

      {/* Hero Contact Action Bar (Persistent for open leads) */}
      {!closed && (
        <div className="px-5 py-2.5 bg-subtle/50 border-b border-border flex flex-wrap items-center gap-2">
          {lead.phone_valid ? (
            <div className="relative">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (!templates.length) {
                    void onWhatsApp(undefined);
                    return;
                  }
                  setTemplateMenuOpen((open) => !open);
                }}
              >
                <MessageCircle className="w-3.5 h-3.5 mr-1 text-success-fg" />
                WhatsApp
              </Button>
              {templateMenuOpen && (
                <div className="absolute z-30 top-9 left-0 w-56 rounded-md border border-border bg-surface shadow-lg py-1">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-xs text-fg hover:bg-hover cursor-pointer"
                      onClick={() => {
                        setTemplateMenuOpen(false);
                        void onWhatsApp(template.id);
                      }}
                    >
                      {template.is_default ? `${template.name} (default)` : template.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-xs text-fg-muted hover:bg-hover cursor-pointer border-t border-border"
                    onClick={() => {
                      setTemplateMenuOpen(false);
                      void onWhatsApp(undefined);
                    }}
                  >
                    Open chat only
                  </button>
                </div>
              )}
            </div>
          ) : (
            <span className="h-8 px-2.5 inline-flex items-center text-micro text-fg-muted italic">
              WhatsApp unavailable
            </span>
          )}

          {lead.phone_e164 && (
            <a
              href={`tel:+${lead.phone_e164}`}
              className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-border bg-surface text-xs font-medium text-fg hover:bg-hover transition"
            >
              <Phone className="w-3.5 h-3.5 text-fg-muted" />
              Call
            </a>
          )}

          {!lead.contacted && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => void onContacted()}
            >
              <Check className="w-3.5 h-3.5 mr-1 text-warning-fg" />
              Mark contacted
            </Button>
          )}

          {!lead.assigned_to && onClaim && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => void onClaim()}
            >
              <UserCheck className="w-3.5 h-3.5 mr-1" />
              Claim
            </Button>
          )}

          {!lead.assigned_to && onApplyRules && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void onApplyRules()}
            >
              Run rules
            </Button>
          )}
        </div>
      )}

      {/* Underline Tabs */}
      <div className="px-5 border-b border-border bg-surface">
        <div className="flex items-center gap-6">
          {(
            [
              { id: 'overview' as const, label: 'Overview', icon: User, count: undefined as string | number | undefined },
              { id: 'brief' as const, label: 'Brief', icon: FileText, count: undefined as string | number | undefined },
              { id: 'activity' as const, label: 'Activity', icon: History, count: activities.length as string | number | undefined },
              { id: 'deals' as const, label: 'Deals', icon: Briefcase, count: (dealsLoading ? '·' : deals.length) as string | number | undefined },
            ]
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 text-xs flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                  active
                    ? 'border-accent text-fg font-medium'
                    : 'border-transparent text-fg-muted hover:text-fg font-normal'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="text-micro font-numeric tabular-nums text-fg-muted bg-subtle px-1.5 py-0.2 rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 custom-scrollbar">
          {/* Operations Approval / Client Form status */}
          {lead.outcome === 'won' && (
            <div className="p-3.5 rounded-lg bg-success-bg/40 border border-success-bd space-y-2">
              <div className="flex items-start gap-2.5">
                {lead.converted_workspace_id ? (
                  <CheckCircle2 className="w-4 h-4 text-success-fg shrink-0 mt-0.5" />
                ) : (
                  <Clock className="w-4 h-4 text-warning-fg shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-semibold text-fg">
                    {lead.converted_workspace_id ? 'Active client workspace' : 'Client form still needed'}
                  </h4>
                  <p className="text-micro text-fg-muted mt-0.5 leading-normal">
                    {lead.converted_workspace_id
                      ? `Workspace ID: ${lead.converted_workspace_id}`
                      : 'Save the client workspace form to finish registering this lead.'}
                  </p>
                </div>
              </div>

              {!lead.converted_workspace_id && (
                <div className="pt-2 border-t border-success-bd">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => void onWon()}
                    className="w-full"
                  >
                    Complete client workspace
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Admin Reopen Controls */}
          {closed && canAssign && (
            <div className="p-3.5 rounded-lg bg-subtle/50 border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-fg">
                  Admin controls
                </span>
                <span className="text-micro text-fg-muted capitalize">
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
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  loading={reopening}
                  loadingText="Reopening…"
                  icon={RotateCcw}
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
                >
                  Reopen
                </Button>
              </div>
            </div>
          )}

          {/* Key-Value Details Grid */}
          <div className="rounded-lg border border-border bg-subtle/30 p-3.5 space-y-3">
            <h3 className="text-[13px] font-semibold text-fg">Contact details</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
              <div>
                <dt className="text-micro text-fg-muted">Phone</dt>
                <dd className="font-numeric text-fg font-medium flex items-center gap-1.5 mt-0.5">
                  <span>{lead.phone_e164 ? `+${lead.phone_e164}` : lead.phone_raw || '—'}</span>
                  {(lead.phone_e164 || lead.phone_raw) && (
                    <button
                      type="button"
                      onClick={() => handleCopyPhone(lead.phone_e164 ? `+${lead.phone_e164}` : lead.phone_raw || '')}
                      className="text-fg-muted hover:text-fg p-0.5 cursor-pointer"
                      title={copiedPhone ? 'Copied!' : 'Copy phone'}
                    >
                      {copiedPhone ? <Check className="w-3 h-3 text-success-fg" /> : <Copy className="w-3 h-3" />}
                    </button>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-micro text-fg-muted">Email</dt>
                <dd className="text-fg break-all mt-0.5 font-medium">
                  {lead.email ? (
                    <a href={`mailto:${lead.email}`} className="hover:underline text-accent">
                      {lead.email}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-micro text-fg-muted">Owner</dt>
                <dd className="text-fg font-medium mt-0.5">
                  {lead.assigned_to_name || <span className="text-warning-fg">Unassigned</span>}
                </dd>
              </div>
              <div>
                <dt className="text-micro text-fg-muted">City</dt>
                <dd className="text-fg font-medium mt-0.5">
                  {lead.city || '—'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Need snippet */}
          {lead.brief && (
            <div
              onClick={() => setActiveTab('brief')}
              className="rounded-lg border border-border p-3.5 cursor-pointer hover:bg-hover transition-colors"
            >
              <p className="text-micro font-medium text-fg-muted">Client need</p>
              <p className="mt-1 text-xs text-fg line-clamp-3 leading-normal">{lead.brief}</p>
            </div>
          )}

          {/* Follow-up scheduler */}
          {!closed && (
            <div className="space-y-2 rounded-lg border border-border bg-subtle/30 p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-fg">Next follow-up</p>
                {lead.next_follow_up_at && (
                  <span className={`text-micro font-numeric ${followUpOverdue ? 'text-danger-fg font-semibold' : 'text-fg-muted'}`}>
                    Due {formatWhen(lead.next_follow_up_at)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <CustomDateTimePicker
                  value={followUpLocal}
                  onChange={setFollowUpLocal}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  disabled={busy}
                  onClick={() => {
                    if (!followUpLocal) {
                      void onFollowUp(null);
                      return;
                    }
                    const d = new Date(followUpLocal);
                    void onFollowUp(Number.isNaN(d.getTime()) ? null : d.toISOString());
                  }}
                >
                  Save
                </Button>
                {lead.next_follow_up_at && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    disabled={busy}
                    onClick={() => {
                      setFollowUpLocal('');
                      void onFollowUp(null);
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Assign Owner */}
          {!closed && canAssign && (
            <div className="space-y-1.5 rounded-lg border border-border bg-subtle/30 p-3.5">
              <p className="text-[13px] font-semibold text-fg">Assign owner</p>
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

      {/* Tab 2: Brief */}
      {activeTab === 'brief' && (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 custom-scrollbar">
          <div className="space-y-1">
            <h3 className="text-[13px] font-semibold text-fg">What they need</h3>
            <p className="text-small text-fg leading-normal whitespace-pre-wrap">
              {lead.brief || 'No description yet.'}
            </p>
          </div>

          <BriefGroup
            title="Business details"
            rows={[
              ['Company', lead.company],
              ['Website', lead.no_website ? 'No website' : lead.website],
              ['Role', lead.role],
              ['Industry', lead.industry],
              ['Business stage', lead.business_stage],
              ['Employees', lead.employee_count],
              ['Sales team', lead.sales_team],
              ['City', lead.city],
            ]}
          />

          <BriefGroup
            title="Project scope"
            rows={[
              ['Help with', (lead.help_with || []).map((item) => (item === 'Other' && lead.help_other ? `Other: ${lead.help_other}` : item)).join(', ') || lead.service],
              ['Main objective', lead.objective],
              ['Start timeline', lead.start_timeline],
              ['Budget', lead.budget],
            ]}
          />

          <BriefGroup
            title="Form answers"
            rows={(lead.form_answers || []).map((answer) => [answer.label, answer.value])}
          />

          <BriefGroup
            title="Attribution source"
            rows={[
              ['Source', lead.source],
              ['Campaign', lead.attribution?.campaign_name || lead.campaign],
              ['Ad set', lead.attribution?.adset_name],
              ['Ad', lead.attribution?.ad_name],
              ['Form', lead.attribution?.form_name],
              ['UTM', [lead.attribution?.utm_source, lead.attribution?.utm_medium].filter(Boolean).join(' / ') || null],
            ]}
          />

          <div className="pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setFormOpen(true)}
              className="w-full"
            >
              <Pencil className="w-3.5 h-3.5 mr-1" />
              Edit brief and qualification
            </Button>
          </div>
        </div>
      )}

      {/* Tab 3: Activity History */}
      {activeTab === 'activity' && (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 custom-scrollbar">
          {!closed && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!note.trim()) return;
                void onNote(note.trim()).then(() => setNote(''));
              }}
            >
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Write a timeline note or call summary…"
                className="flex-1 h-8 px-2.5 rounded-md border border-border bg-surface text-xs text-fg focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={busy || !note.trim()}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add
              </Button>
            </form>
          )}

          <div className="space-y-2.5 pt-2">
            {activities.map((act) => (
              <div
                key={act.id}
                className="p-3 rounded-md border border-border bg-subtle/30 flex items-start gap-2.5"
              >
                <div className="mt-0.5 shrink-0">
                  <ActivityIcon type={act.type} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-fg capitalize">
                      {activityLabel(act.type)}
                    </p>
                    <span className="text-micro font-numeric text-fg-muted shrink-0">
                      {formatWhen(act.created_at)}
                    </span>
                  </div>
                  {act.body && (
                    <p className="text-small text-fg-muted mt-1 whitespace-pre-wrap leading-normal">
                      {act.body}
                    </p>
                  )}
                  {act.actor_name && (
                    <p className="text-micro text-fg-muted mt-1">
                      By {act.actor_name}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {activities.length === 0 && (
              <div className="py-10 text-center text-xs text-fg-muted border border-dashed border-border rounded-lg">
                No activity logged yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Deals */}
      {activeTab === 'deals' && (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 custom-scrollbar">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[13px] font-semibold text-fg">Commercial deals</h3>
              <p className="text-micro text-fg-muted mt-0.5">
                {deals.length > 0 ? (
                  <span>
                    Open pipeline: <strong className="font-numeric font-medium text-fg">{openDealLabel || '—'}</strong>
                  </span>
                ) : canCreateDeal ? (
                  'Create a deal to enter the commercial pipeline'
                ) : (
                  'Mark this lead as won before a deal can be created'
                )}
              </p>
            </div>
            {canCreateDeal && !isAddingDeal && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (onCreateDeal) {
                    onCreateDeal();
                  } else if (onEditProposal) {
                    onEditProposal();
                  } else {
                    setIsAddingDeal(true);
                  }
                }}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add deal
              </Button>
            )}
          </div>

          {/* Add deal inline fallback form */}
          {canCreateDeal && isAddingDeal && !onCreateDeal && (
            <div className="p-3.5 rounded-lg border border-border bg-subtle/50 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-fg">Add new deal</h4>
                <button
                  type="button"
                  onClick={() => setIsAddingDeal(false)}
                  className="text-fg-muted hover:text-fg p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                type="text"
                value={newDealTitle}
                onChange={(e) => setNewDealTitle(e.target.value)}
                placeholder="Deal title"
                className="w-full text-xs h-8 px-2.5 rounded-md border border-border bg-surface text-fg"
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
                  placeholder="Value"
                  className="w-full text-xs h-8 px-2.5 rounded-md border border-border bg-surface text-fg font-numeric"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  loading={savingDeal}
                  loadingText="Saving…"
                  disabled={!newDealTitle.trim()}
                  onClick={handleCreateDeal}
                >
                  Save deal
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsAddingDeal(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Deals List */}
          <div className="space-y-2">
            {dealsLoading ? (
              <div className="space-y-2 animate-pulse">
                {[1, 2].map((i) => (
                  <div key={i} className="h-16 rounded-lg bg-subtle" />
                ))}
              </div>
            ) : (
              <>
                {deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="p-3.5 rounded-lg border border-border bg-surface flex items-center justify-between gap-3 shadow-xs hover:border-border-strong transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-semibold text-fg truncate">{deal.title}</p>
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-subtle text-fg-muted uppercase">
                          {deal.status === 'open' ? (deal.stage || 'proposal').replace(/_/g, ' ') : deal.status}
                        </span>
                      </div>
                      <p className="text-micro text-fg-muted mt-1">
                        {deal.service} · <span className="font-numeric font-medium text-fg">{formatDealMoney(deal.value, deal.currency)}</span>
                        {deal.probability != null && <span> · {deal.probability}%</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {onEditDeal && (
                        <button
                          type="button"
                          onClick={() => onEditDeal(deal)}
                          className="p-1.5 text-fg-muted hover:text-fg rounded hover:bg-hover transition cursor-pointer"
                          title="Edit deal"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleDeleteDeal(deal.id)}
                        className="p-1.5 text-fg-muted hover:text-danger-fg rounded hover:bg-danger-bg transition cursor-pointer"
                        title="Remove deal"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {deals.length === 0 && !isAddingDeal && (
                  <div className="py-10 text-center border border-dashed border-border rounded-lg text-xs text-fg-muted">
                    No deals attached yet.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Sticky Footer */}
      {!closed ? (
        <div className="sticky bottom-0 bg-surface border-t border-border px-5 py-3 flex items-center justify-between gap-2.5 z-10 shrink-0">
          <Button
            type="button"
            variant="primary"
            disabled={busy}
            onClick={() => void onWon()}
            className="flex-1"
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            Register as client
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void onLost()}
          >
            Mark lost
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => setTrashOpen(true)}
          >
            Trash
          </Button>
        </div>
      ) : (
        <div className="sticky bottom-0 bg-surface border-t border-border px-5 py-3 flex items-center justify-between gap-2.5 z-10 shrink-0">
          <span className="text-xs text-fg-muted">
            This lead is <strong className="capitalize text-fg">{lead.outcome}</strong>.
          </span>
          {canAssign && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                if (onReopen) void onReopen(lead.id, 'contacted');
              }}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Reopen
            </Button>
          )}
        </div>
      )}

      {/* Modals & Confirmation */}
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

      {stagePrompt && (
        <div className="fixed inset-0 z-[var(--z-overlay,50)] flex items-center justify-center p-4 bg-overlay animate-in fade-in-0 duration-150">
          <div className="w-full max-w-[400px] rounded-lg bg-surface border border-border p-5 shadow-lg space-y-4">
            <h3 className="text-h2 font-semibold text-fg">
              Move {lead.name} to {stagePrompt.split('\n')[0]}?
            </h3>
            <p className="text-body text-fg-muted">
              Update pipeline stage for this lead.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setStagePrompt(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  const next = stagePrompt.split('\n')[1];
                  setStagePrompt(null);
                  if (next) void onStage(next);
                }}
              >
                Move
              </Button>
            </div>
          </div>
        </div>
      )}

      {trashOpen && (
        <div className="fixed inset-0 z-[var(--z-overlay,50)] flex items-center justify-center p-4 bg-overlay animate-in fade-in-0 duration-150">
          <form
            className="w-full max-w-[400px] rounded-lg bg-surface border border-border p-5 shadow-lg space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const reason = trashReason.trim();
              if (reason.length < 10) return;
              setTrashOpen(false);
              void onTrash(reason);
            }}
          >
            <h3 className="text-h2 font-semibold text-fg">Move {lead.name} to trash</h3>
            <p className="text-body text-fg-muted">Trash is distinct from lost. Please write a reason (minimum 10 characters).</p>
            <textarea
              value={trashReason}
              onChange={(e) => setTrashReason(e.target.value)}
              rows={3}
              className="w-full text-xs p-2.5 rounded-md border border-border bg-subtle/50 text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="Why is this lead being trashed?"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setTrashOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                disabled={trashReason.trim().length < 10 || busy}
              >
                Trash lead
              </Button>
            </div>
          </form>
        </div>
      )}

      {lead && (
        <CrmCreateLeadModal
          isOpen={formOpen}
          mode="edit"
          initialLead={lead}
          assignees={assignees}
          canAssign={false}
          onClose={() => setFormOpen(false)}
          onSubmit={async (payload) => {
            await onSaveForm(payload);
            setFormOpen(false);
          }}
        />
      )}
    </aside>
  );
};
