import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  Clock,
  LayoutGrid,
  List,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { useToast } from '../../context/ToastContext';
import { crmService } from '../../services/crmService';
import { useCacheInvalidation } from '../../utils/cacheBus';
import { canAssignCrmLeads } from '../../utils/crmAccess';
import { toSafeWhatsAppUrl } from '../../utils/safeUrl';
import { followUpBucket, isClosedLeadOutcome } from '../../utils/followUpBuckets';
import { formatOpenDealTotals } from '../../utils/money';
import { Avatar } from '../ui/Avatar';
import { useMemberAvatars } from '../../hooks/useMemberAvatars';
import { CustomSelect } from '../ui/CustomSelect';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/button';
import { SegmentedControl } from '../ui/SegmentedControl';
import { StatusPill } from '../ui/StatusPill';
import { KanbanSkeleton, FollowUpSkeleton } from '../ui/Skeletons';
import { Skeleton } from '../ui/skeleton';
import { TableCard, Table, THead, TH, TBody, TR, TD, TableSkeletonRows } from '../ui/DataTable';
import { CrmCreateLeadModal } from '../crm/CrmCreateLeadModal';
import { CrmKanbanBoard } from '../crm/CrmKanbanBoard';
import { CrmDealKanbanBoard } from '../crm/CrmDealKanbanBoard';
import { CrmFollowUpView } from '../crm/CrmFollowUpView';
import { CrmProposalModal, dealFormConfigToPayload } from '../crm/CrmProposalModal';
import { CrmWonLeadMenu } from '../crm/CrmWonLeadMenu';
import { WorkspaceModal, type WorkspaceFormSeed } from '../modals/WorkspaceModal';
import type { WorkspaceCreatePayload } from '../../services/workspaceService';
import { CrmLeadDrawer, CrmLeadDrawerSkeleton } from '../crm/CrmLeadDrawer';
import { CrmDeleteConfirmModal } from '../crm/CrmDeleteConfirmModal';
import {
  CrmLostReasonModal,
  DEAL_LOST_REASON_OPTIONS,
  LEAD_LOST_REASON_OPTIONS,
} from '../crm/CrmLostReasonModal';
import { ApiError } from '../../services/apiClient';
import type {
  CrmAssignee,
  CrmCounts,
  CrmDeal,
  CrmLead,
  CrmLeadDetail,
  CrmPipelineStage,
  CrmSubSection,
  CrmTemplate,
} from '../../types/crm';

function formatWhen(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function CrmBoardSkeleton() {
  return (
    <div className="flex-1 overflow-x-auto overflow-y-hidden px-5 py-4 custom-scrollbar">
      <KanbanSkeleton columns={5} />
    </div>
  );
}

function CrmTableSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-5">
      <TableCard>
        <TableSkeletonRows rows={8} />
      </TableCard>
    </div>
  );
}


const EMPTY_COUNTS: CrmCounts = {
  incoming: 0,
  assigned: 0,
  uncontacted: 0,
  opened_not_confirmed: 0,
  contacted_under_15m: 0,
  won: 0,
  lost: 0,
  win_rate: null,
};

type QuickFilter = 'all' | 'overdue' | 'today' | 'scheduled' | 'idle';

export interface CrmViewProps {
  activeSection?: CrmSubSection;
  onSectionChange?: (section: CrmSubSection) => void;
}

export const CrmView: React.FC<CrmViewProps> = ({ activeSection = 'board', onSectionChange }) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const canAssign = canAssignCrmLeads(user);

  const cachedLeadsEntry = useMemo(() => crmService.getCachedLeads(), []);
  const cachedCountsEntry = useMemo(() => crmService.getCachedCounts(), []);
  const cachedPipelineEntry = useMemo(() => crmService.getCachedPipeline(), []);
  const cachedAssigneesEntry = useMemo(() => crmService.getCachedAssignees(), []);
  const cachedTemplatesEntry = useMemo(() => crmService.getCachedTemplates(), []);
  const cachedDealsEntry = useMemo(() => crmService.getCachedDeals(), []);
  const cachedDealPipelineEntry = useMemo(() => crmService.getCachedDealPipeline(), []);

  const hasCache = !!(cachedLeadsEntry || cachedPipelineEntry);

  const [leads, setLeads] = useState<CrmLead[]>(() => cachedLeadsEntry?.data.items || []);
  const [counts, setCounts] = useState<CrmCounts>(() => cachedCountsEntry?.data || EMPTY_COUNTS);
  const [stages, setStages] = useState<CrmPipelineStage[]>(() => cachedPipelineEntry?.data.stages || []);
  const [assignees, setAssignees] = useState<CrmAssignee[]>(() => cachedAssigneesEntry?.data || []);
  const [templates, setTemplates] = useState<CrmTemplate[]>(() => cachedTemplatesEntry?.data || []);
  const [pipelineDeals, setPipelineDeals] = useState<CrmDeal[]>(() => cachedDealsEntry?.data.deals || []);
  const [dealStages, setDealStages] = useState<CrmPipelineStage[]>(() => cachedDealPipelineEntry?.data.stages || []);
  const [isLoading, setIsLoading] = useState(!hasCache);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { getAvatarUrl } = useMemberAvatars();
  useModuleLoadGate(isLoading);

  const loadAbortRef = useRef<AbortController | null>(null);
  const loadReqIdRef = useRef(0);
  const detailAbortRef = useRef<AbortController | null>(null);
  const detailReqIdRef = useRef(0);
  const pollAbortRef = useRef<AbortController | null>(null);
  const hasLoadedOnceRef = useRef(hasCache);
  const selectedIdRef = useRef<string | null>(null);

  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'board' | 'deals' | 'followup'>('board');
  const [proposalModalLead, setProposalModalLead] = useState<CrmLead | null>(null);
  const [editingDeal, setEditingDeal] = useState<CrmDeal | null>(null);
  const [newDealFormKey, setNewDealFormKey] = useState(0);
  const [drawerInitialTab, setDrawerInitialTab] = useState<'overview' | 'brief' | 'activity' | 'deals'>('overview');
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CrmLeadDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [tableLeadToDelete, setTableLeadToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingTableLead, setIsDeletingTableLead] = useState(false);
  const [lostTarget, setLostTarget] = useState<{ kind: 'lead' | 'deal'; id: string } | null>(null);
  const [lostSubmitting, setLostSubmitting] = useState(false);

  // Synchronize with external activeSection prop from Sidebar
  useEffect(() => {
    if (!activeSection) return;
    if (activeSection === 'board' || activeSection === 'deals' || activeSection === 'list' || activeSection === 'followup') {
      setViewMode(activeSection);
    }
  }, [activeSection]);

  const handleToggleViewMode = (mode: 'list' | 'board' | 'deals' | 'followup') => {
    setViewMode(mode);
    onSectionChange?.(mode as CrmSubSection);
  };



  const load = useCallback(async () => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const reqId = ++loadReqIdRef.current;
    const soft = hasLoadedOnceRef.current;

    if (soft) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const signal = controller.signal;
      const [list, countDoc, pipe, people, tpls, dealPipe, dealList] = await Promise.all([
        // Include junk so trashed and legacy disqualified leads stay available for the Trash column.
        crmService.listLeads(
          {
            search: search.trim() || undefined,
            stage: stage || undefined,
            assigned_to: assignedTo || undefined,
            include_junk: true,
          },
          { signal }
        ),
        crmService.getCounts({ signal }),
        crmService.getPipeline({ signal }),
        crmService.getAssignees({ signal }),
        crmService.listTemplates({ signal }).catch(() => [] as CrmTemplate[]),
        crmService.getDealPipeline({ signal }).catch(() => ({ stages: [] as CrmPipelineStage[], statuses: [] })),
        crmService.listAllDeals({ search: search.trim() || undefined }, { signal }).catch(() => ({
          deals: [] as CrmDeal[],
          total_count: 0,
          total_value: 0,
        })),
      ]);
      if (reqId !== loadReqIdRef.current) return;
      setLeads(list.items);
      setCounts(countDoc);
      setStages(pipe.stages || []);
      setAssignees(people);
      setTemplates(tpls);
      setDealStages(dealPipe.stages || []);
      setPipelineDeals(dealList.deals || []);
      setRateLimited(false);
      hasLoadedOnceRef.current = true;
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.status === 499) return;
      if (reqId !== loadReqIdRef.current) return;
      if (err?.status === 429) {
        setRateLimited(true);
      }
      addToast('Sales Pipeline failed to load', err.message || 'Try again.', 'error');
    } finally {
      if (reqId === loadReqIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [addToast, assignedTo, search, stage]);

  const loadDeals = useCallback(async () => {
    try {
      const [dealPipe, dealList] = await Promise.all([
        crmService.getDealPipeline(),
        crmService.listAllDeals({ search: search.trim() || undefined }),
      ]);
      setDealStages(dealPipe.stages || []);
      setPipelineDeals(dealList.deals || []);
    } catch {
      // non-critical for lead views
    }
  }, [search]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 200);
    return () => {
      window.clearTimeout(t);
      loadAbortRef.current?.abort();
    };
  }, [load]);

  useCacheInvalidation(['crm', 'crm.leads', 'crm.deals', 'crm.counts'], () => {
    void load();
  });

  // Performance-optimized polling: 10s cadence, pause when hidden, backoff on 429
  useEffect(() => {
    if (assignedTo && assignedTo !== 'unassigned') return undefined;
    let cancelled = false;
    let timerId: number | null = null;
    let pollInterval = 10000;

    const schedulePoll = () => {
      timerId = window.setTimeout(async () => {
        if (cancelled) return;
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
          schedulePoll();
          return;
        }

        pollAbortRef.current?.abort();
        const controller = new AbortController();
        pollAbortRef.current = controller;
        try {
          const list = await crmService.listLeads(
            {
              search: search.trim() || undefined,
              stage: stage || undefined,
              assigned_to: assignedTo || undefined,
              include_junk: true,
            },
            { signal: controller.signal }
          );
          if (!cancelled) {
            setLeads(list.items);
            setRateLimited(false);
            pollInterval = 10000;
          }
        } catch (err: any) {
          if (err?.name === 'AbortError' || err?.status === 499) {
            // ignored — superseded or unmounted
          } else if (err?.status === 429) {
            setRateLimited(true);
            pollInterval = 30000;
          }
        } finally {
          if (!cancelled) {
            schedulePoll();
          }
        }
      }, pollInterval);
    };

    schedulePoll();

    return () => {
      cancelled = true;
      pollAbortRef.current?.abort();
      if (timerId) window.clearTimeout(timerId);
    };
  }, [assignedTo, search, stage]);

  const handleDeleteLead = async (leadId: string) => {
    try {
      await crmService.deleteLead(leadId);
      addToast('Lead deleted', 'Lead and related deals have been removed.', 'info');
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      const removedDealIds = new Set(
        pipelineDeals.filter((d) => d.lead_id === leadId).map((d) => d.id)
      );
      setPipelineDeals((prev) => prev.filter((d) => d.lead_id !== leadId));
      if (selectedDealId && removedDealIds.has(selectedDealId)) {
        setSelectedDealId(null);
      }
      if (selectedId === leadId) {
        detailAbortRef.current?.abort();
        selectedIdRef.current = null;
        setSelectedId(null);
        setDetail(null);
      }
      void crmService.getCounts().then(setCounts).catch(() => undefined);
    } catch (err: any) {
      addToast('Could not delete lead', err.message || 'Try again.', 'error');
    }
  };

  const openLead = useCallback(
    async (id: string) => {
      selectedIdRef.current = id;
      setSelectedId(id);
      // Drop stale drawer content immediately so skeleton shows while the new lead loads
      setDetail((prev) => (prev?.id === id ? prev : null));

      detailAbortRef.current?.abort();
      const controller = new AbortController();
      detailAbortRef.current = controller;
      const reqId = ++detailReqIdRef.current;

      try {
        const doc = await crmService.getLead(id, { signal: controller.signal });
        if (reqId !== detailReqIdRef.current || selectedIdRef.current !== id) return;
        setDetail(doc);
      } catch (err: any) {
        if (err?.name === 'AbortError' || err?.status === 499) return;
        if (reqId !== detailReqIdRef.current || selectedIdRef.current !== id) return;
        addToast('Could not open lead', err.message || 'Try again.', 'error');
        if (selectedIdRef.current === id) {
          selectedIdRef.current = null;
          setSelectedId(null);
          setDetail(null);
        }
      }
    },
    [addToast]
  );

  useEffect(() => {
    return () => {
      detailAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (selectedId && !leads.some((l) => l.id === selectedId)) {
      detailAbortRef.current?.abort();
      selectedIdRef.current = null;
      setSelectedId(null);
      setDetail(null);
    }
  }, [leads, selectedId]);

  const refreshOpen = async (id: string) => {
    const [doc, list, countDoc] = await Promise.all([
      crmService.getLead(id),
      crmService.listLeads({
        search: search.trim() || undefined,
        stage: stage || undefined,
        assigned_to: assignedTo || undefined,
        include_junk: true,
      }),
      crmService.getCounts(),
    ]);
    setLeads(list.items);
    setCounts(countDoc);
    if (selectedIdRef.current === id) {
      setDetail(doc);
    }
  };

  const run = async (fn: () => Promise<unknown>) => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await fn();
      await refreshOpen(selectedId);
    } catch (err: any) {
      addToast('CRM action failed', err.message || 'Try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const stageOptions = useMemo(
    () => [{ value: '', label: 'All stages' }, ...stages.map((s) => ({ value: s.id, label: s.name }))],
    [stages]
  );
  const assigneeOptions = useMemo(
    () => [
      { value: '', label: 'Anyone' },
      { value: 'unassigned', label: 'Unassigned' },
      ...assignees.map((a) => ({ value: a.id, label: a.full_name })),
    ],
    [assignees]
  );

  // Client-side quick filters — instant tab switches, no network round-trip
  const displayLeads = useMemo(() => {
    const closed = leads.filter((lead) => isClosedLeadOutcome(lead.outcome));
    const open = leads.filter((lead) => !isClosedLeadOutcome(lead.outcome));
    if (quickFilter === 'all') return [...open, ...closed];
    // Follow-up filters are for open leads only. Closed leads (won, lost, trashed)
    // stay on All and in the board's outcome columns.
    return open.filter((lead) => followUpBucket(lead) === quickFilter);
  }, [leads, quickFilter]);

  const activeLeadCount = useMemo(
    () => leads.filter((lead) => !isClosedLeadOutcome(lead.outcome)).length,
    [leads]
  );

  const overdueFollowUpCount = useMemo(() => {
    const now = Date.now();
    return leads.filter(
      (l) => !l.outcome && l.next_follow_up_at && new Date(l.next_follow_up_at).getTime() < now
    ).length;
  }, [leads]);

  const dueFollowUpsCount = useMemo(() => {
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const endTs = endOfDay.getTime();
    return leads.filter(
      (l) => !l.outcome && l.next_follow_up_at && new Date(l.next_follow_up_at).getTime() <= endTs
    ).length;
  }, [leads]);

  const [clientFormLead, setClientFormLead] = useState<CrmLead | null>(null);

  const pendingClientFormCount = useMemo(
    () => leads.filter((l) => l.outcome === 'won' && !l.converted_workspace_id).length,
    [leads]
  );

  const pendingOpsDealCount = useMemo(
    () =>
      pipelineDeals.filter(
        (d) =>
          d.status === 'won' &&
          !d.converted_workspace_id &&
          d.approval_status === 'pending_operations'
      ).length,
    [pipelineDeals]
  );

  const openDeals = useMemo(() => pipelineDeals.filter((d) => d.status === 'open'), [pipelineDeals]);
  const openDealValueLabel = useMemo(() => formatOpenDealTotals(openDeals), [openDeals]);

  const drawerReady = Boolean(detail && selectedId && detail.id === selectedId);
  const showDrawerSkeleton = Boolean(selectedId && !drawerReady);

  const alertHudVisible =
    viewMode === 'deals'
      ? pendingOpsDealCount > 0 || openDeals.length > 0
      : counts.uncontacted > 0 ||
        overdueFollowUpCount > 0 ||
        counts.opened_not_confirmed > 0 ||
        pendingClientFormCount > 0;

  const openRegisterClient = (lead: CrmLead) => {
    if (lead.converted_workspace_id) {
      addToast('Already a client', `${lead.company || lead.name} already has a workspace.`, 'info');
      return;
    }
    if (lead.outcome && lead.outcome !== 'won') {
      addToast('Lead is closed', 'Reopen this lead before registering it as a client.', 'warning');
      return;
    }
    setClientFormLead(lead);
  };

  const clientFormSeed = useMemo((): WorkspaceFormSeed | null => {
    if (!clientFormLead) return null;
    const phone = clientFormLead.phone_e164
      ? `+${clientFormLead.phone_e164}`
      : clientFormLead.phone_raw || '';
    const knownServices = [
      'Branding',
      'Website Dev',
      'Web Maintenance',
      'SEO',
      'Performance Marketing',
      'Video Shoot',
      'Software Dev',
      'Mobile App Dev',
      'UI/UX Designing',
      'Social Media Management',
    ];
    const service = clientFormLead.service && knownServices.includes(clientFormLead.service)
      ? [clientFormLead.service]
      : [];
    return {
      name: clientFormLead.company || clientFormLead.name,
      poc_name: clientFormLead.name,
      poc_email: clientFormLead.email || '',
      poc_phone: phone,
      billing_name: clientFormLead.name,
      billing_email: clientFormLead.email || '',
      billing_phone: phone,
      services: service,
    };
  }, [clientFormLead]);

  const openDealForWonLead = (lead: CrmLead) => {
    if (lead.outcome !== 'won') {
      addToast('Lead is not won', 'Mark the lead as won before creating a deal.', 'warning');
      return;
    }
    setEditingDeal(null);
    setNewDealFormKey((n) => n + 1);
    setProposalModalLead(lead);
  };


  return (
    <div className="flex-1 flex h-full min-w-0 overflow-hidden bg-canvas">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <div className="px-5 py-3 border-b border-border bg-surface shrink-0">
          <PageHeader
            title={
              <div className="flex items-center gap-2.5">
                <span>
                  {viewMode === 'deals'
                    ? 'Deal pipeline'
                    : viewMode === 'followup'
                      ? 'Follow-ups'
                      : viewMode === 'list'
                        ? 'All leads'
                        : 'Sales pipeline'}
                </span>
                {isLoading ? (
                  <Skeleton className="w-5 h-4 rounded-full" />
                ) : (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-subtle text-fg-muted border border-border font-numeric">
                    {viewMode === 'deals'
                      ? `${pipelineDeals.length}`
                      : `${quickFilter === 'all' ? activeLeadCount : displayLeads.filter((lead) => !isClosedLeadOutcome(lead.outcome)).length}`}
                  </span>
                )}
                {isRefreshing && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                    <span className="w-3 h-3 rounded-full border-2 border-border border-t-accent motion-safe:animate-spin" />
                    Updating…
                  </span>
                )}
              </div>
            }
            description={
              viewMode === 'deals'
                ? 'Qualified commercial opportunities with expected revenue.'
                : viewMode === 'followup'
                  ? 'Scheduled touchpoints across all active leads.'
                  : 'Leads from Meta, Google and website forms, by stage.'
            }
            actions={
              <>
                {!isLoading && alertHudVisible && (
                  viewMode === 'deals' ? (
                    <div className="flex items-center gap-3 text-xs me-2">
                      <span><strong className="font-semibold font-numeric text-fg">{openDeals.length}</strong> <span className="text-fg-muted">open deals</span></span>
                      {openDealValueLabel && <span><strong className="font-semibold font-numeric text-fg">{openDealValueLabel}</strong> <span className="text-fg-muted">pipeline</span></span>}
                      {pendingOpsDealCount > 0 && <span><strong className="font-semibold font-numeric text-warning-fg">{pendingOpsDealCount}</strong> <span className="text-fg-muted">pending ops</span></span>}
                      {counts.win_rate != null && <span><strong className="font-semibold font-numeric text-fg">{counts.win_rate}%</strong> <span className="text-fg-muted">win rate</span></span>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 text-xs me-2">
                      <span><strong className="font-semibold font-numeric text-fg">{activeLeadCount}</strong> <span className="text-fg-muted">open leads</span></span>
                      {counts.win_rate != null && <span><strong className="font-semibold font-numeric text-fg">{counts.win_rate}%</strong> <span className="text-fg-muted">win rate</span></span>}
                      {counts.uncontacted > 0 && <span><strong className="font-semibold font-numeric text-warning-fg">{counts.uncontacted}</strong> <span className="text-fg-muted">uncontacted</span></span>}
                      {overdueFollowUpCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setQuickFilter('overdue')}
                          className="cursor-pointer hover:underline text-xs"
                        >
                          <strong className="font-semibold font-numeric text-danger-fg">{overdueFollowUpCount}</strong> <span className="text-fg-muted">follow-up overdue</span>
                        </button>
                      )}
                      {counts.opened_not_confirmed > 0 && <span><strong className="font-semibold font-numeric text-warning-fg">{counts.opened_not_confirmed}</strong> <span className="text-fg-muted">opened, not confirmed</span></span>}
                      {pendingClientFormCount > 0 && <span><strong className="font-semibold font-numeric text-warning-fg">{pendingClientFormCount}</strong> <span className="text-fg-muted">need client form</span></span>}
                    </div>
                  )
                )}

                {viewMode === 'deals' ? (
                  <CrmWonLeadMenu onSelect={openDealForWonLead} />
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New lead
                  </Button>
                )}
              </>
            }
            className="mb-0"
          />
        </div>

        {/* Rate limit notification */}
        {rateLimited && (
          <div className="px-5 py-2 bg-warning-bg border-b border-warning-bd text-warning-fg text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 text-warning-fg shrink-0" />
            <span>Rate limit reached. Automatic sync paused briefly and will resume in 30 seconds.</span>
          </div>
        )}

        {/* Filter & View Toolbar */}
        <div className="px-5 py-2.5 border-b border-border bg-surface flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="w-3.5 h-3.5 absolute start-3 top-1/2 -translate-y-1/2 text-fg-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, phone, company..."
                className="w-full h-8 ps-8.5 pe-3 rounded-md border border-input bg-surface text-xs text-fg placeholder:text-fg-muted focus:ring-1 focus:ring-accent focus:border-accent focus:outline-none transition-colors"
              />
            </div>
            {viewMode !== 'deals' && (
              <>
                <div className="w-36">
                  <CustomSelect value={stage} onChange={setStage} options={stageOptions} size="sm" />
                </div>
                <div className="w-40">
                  <CustomSelect value={assignedTo} onChange={setAssignedTo} options={assigneeOptions} size="sm" />
                </div>
              </>
            )}

            {viewMode !== 'deals' && viewMode !== 'followup' && (
              <SegmentedControl
                size="sm"
                value={quickFilter}
                onValueChange={(val) => setQuickFilter(val as any)}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'overdue', label: 'Overdue' },
                  { value: 'today', label: 'Today' },
                  { value: 'scheduled', label: 'Scheduled' },
                  { value: 'idle', label: 'Idle' },
                ]}
              />
            )}
          </div>

          <SegmentedControl
            value={viewMode}
            onValueChange={(val) => handleToggleViewMode(val as any)}
            size="sm"
            options={[
              { value: 'board', label: 'Leads', icon: LayoutGrid },
              { value: 'deals', label: 'Deals', icon: Briefcase },
              { value: 'list', label: 'List', icon: List },
              {
                value: 'followup',
                label: 'Follow-ups',
                icon: Clock,
                count: dueFollowUpsCount > 0 ? dueFollowUpsCount : undefined,
              },
            ]}
          />
        </div>

        {/* View Mode Content */}
        {isLoading ? (
          viewMode === 'board' || viewMode === 'deals' ? (
            <CrmBoardSkeleton />
          ) : viewMode === 'followup' ? (
            <FollowUpSkeleton />
          ) : (
            <CrmTableSkeleton />
          )
        ) : (
          <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
            {isRefreshing && (
              <div className="h-0.5 w-full bg-accent/20 overflow-hidden shrink-0 absolute top-0 left-0 z-10">
                <div className="h-full bg-accent w-1/3 animate-pulse" />
              </div>
            )}
        {viewMode === 'followup' ? (
          <CrmFollowUpView
            leads={displayLeads}
            selectedId={selectedId}
            onOpen={(id) => void openLead(id)}
            onRefresh={async () => {
              await load();
            }}
            onOptimisticUpdate={(leadId, patch) => {
              setLeads((prev) =>
                prev.map((l) => (l.id === leadId ? { ...l, ...patch } : l))
              );
              if (selectedId === leadId) {
                setDetail((prev) => (prev ? { ...prev, ...patch } : null));
              }
            }}
          />
        ) : viewMode === 'deals' ? (
          <CrmDealKanbanBoard
            deals={pipelineDeals}
            stages={dealStages}
            selectedDealId={selectedDealId}
            canManageOutcomes={canAssign}
            onOpen={async (deal) => {
              setSelectedDealId(deal.id);
              setDrawerInitialTab('deals');
              await openLead(deal.lead_id);
            }}
            onMoveStage={async (dealId, nextStage) => {
              setPipelineDeals((prev) =>
                prev.map((d) => (d.id === dealId ? { ...d, stage: nextStage, status: 'open' } : d))
              );
              try {
                await crmService.updateDeal(dealId, { stage: nextStage, status: 'open' });
              } catch (err: any) {
                addToast('Could not move deal', err.message || 'Try again.', 'error');
                await loadDeals();
              }
            }}
            onWon={async (dealId) => {
              setPipelineDeals((prev) =>
                prev.map((d) =>
                  d.id === dealId
                    ? { ...d, status: 'won', approval_status: 'pending_operations', payment_cleared: false }
                    : d
                )
              );
              await crmService.markDealWon(dealId);
              addToast('Deal marked won', 'Waiting for operations to confirm this deal.', 'success');
              await loadDeals();
            }}
            onLost={async (dealId) => {
              setLostTarget({ kind: 'deal', id: dealId });
            }}
            onReopen={async (dealId, nextStage) => {
              await crmService.reopenDeal(dealId, { target_stage: nextStage || 'opportunity_created' });
              addToast('Deal Reopened', 'Deal restored to the active pipeline.', 'info');
              await loadDeals();
            }}
            onApproveWon={async (dealId) => {
              const approved = await crmService.approveWonDeal(dealId, { payment_cleared: true });
              addToast('Deal confirmed', `${approved.title} is a confirmed won deal.`, 'success');
              await load();
            }}
            createDealAction={<CrmWonLeadMenu label="Choose won lead" onSelect={openDealForWonLead} />}
          />
        ) : viewMode === 'board' ? (
          <CrmKanbanBoard
            leads={displayLeads}
            stages={stages}
            selectedId={selectedId}
            canAssign={canAssign}
            onOpen={(id) => {
              setDrawerInitialTab('overview');
              void openLead(id);
            }}
            onMoveStage={async (leadId, nextStage) => {
              setLeads((prev) =>
                prev.map((l) => (l.id === leadId ? { ...l, stage: nextStage } : l))
              );
              try {
                await crmService.updateLead(leadId, { stage: nextStage });
                if (selectedId === leadId) await refreshOpen(leadId);
              } catch (err: any) {
                addToast('Could not move lead', err.message || 'Try again.', 'error');
                await load();
              }
            }}
            onWon={async (leadId) => {
              const lead = leads.find((item) => item.id === leadId);
              if (lead) openRegisterClient(lead);
            }}
            onLost={async (leadId) => {
              setLostTarget({ kind: 'lead', id: leadId });
            }}
            onReopen={async (leadId, nextStage) => {
              setLeads((prev) =>
                prev.map((l) =>
                  l.id === leadId
                    ? { ...l, outcome: null, stage: nextStage || 'new' }
                    : l
                )
              );
              await crmService.reopenLead(leadId, { stage: nextStage || 'new' });
              addToast('Lead Reopened', 'Lead has been restored to the active pipeline.', 'info');
              await load();
              if (selectedId === leadId) await refreshOpen(leadId);
            }}
          />
        ) : (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            <TableCard>
              <Table>
                <THead>
                  <tr>
                    <TH>Lead</TH>
                    <TH>Stage</TH>
                    <TH>Source</TH>
                    <TH>Owner</TH>
                    <TH align="right">Value</TH>
                    <TH>Created</TH>
                    <TH>Next follow-up</TH>
                    <TH align="center" className="w-12"></TH>
                  </tr>
                </THead>
                <TBody>
                  {displayLeads.map((lead) => {
                    const active = selectedId === lead.id;
                    return (
                      <TR
                        key={lead.id}
                        selected={active}
                        clickable
                        onClick={() => void openLead(lead.id)}
                      >
                        <TD>
                          <div className="font-medium text-fg text-ui">{lead.name}</div>
                          {lead.company && <div className="text-fg-muted text-caption">{lead.company}</div>}
                        </TD>
                        <TD>
                          <StatusPill
                            variant={
                              lead.outcome === 'won'
                                ? 'success'
                                : lead.outcome === 'lost'
                                ? 'danger'
                                : lead.stage === 'new'
                                ? 'accent'
                                : 'neutral'
                            }
                            label={lead.stage.replace(/_/g, ' ')}
                          />
                        </TD>
                        <TD>
                          <span className="px-2 py-0.5 rounded text-caption font-medium bg-subtle text-fg-muted border border-border uppercase">
                            {lead.source}
                          </span>
                        </TD>
                        <TD>
                          {lead.assigned_to_name ? (
                            <div className="flex items-center gap-1.5">
                              <Avatar
                                name={lead.assigned_to_name}
                                src={getAvatarUrl(lead.assigned_to, lead.assigned_to_name)}
                                size={20}
                                className="rounded-full shrink-0 text-micro"
                              />
                              <span className="text-small font-medium text-fg">{lead.assigned_to_name}</span>
                            </div>
                          ) : (
                            <span className="text-micro font-medium text-warning-fg bg-warning-bg border border-warning-bd px-1.5 py-0.5 rounded-full">
                              Claim pool
                            </span>
                          )}
                        </TD>
                        <TD align="right" mono>
                          {lead.total_deal_value ? (
                            <span className="font-numeric text-fg">PKR {Number(lead.total_deal_value).toLocaleString()}</span>
                          ) : lead.budget ? (
                            <span className="font-numeric text-fg-muted">{lead.budget}</span>
                          ) : (
                            <span className="text-fg-muted">—</span>
                          )}
                        </TD>
                        <TD mono>
                          <span className="text-caption text-fg-muted font-numeric">
                            {formatWhen(lead.created_at)}
                          </span>
                        </TD>
                        <TD mono>
                          {lead.next_follow_up_at ? (
                            (() => {
                              const bucket = followUpBucket(lead);
                              const isOverdue = bucket === 'overdue';
                              return (
                                <span
                                  className={`text-caption font-numeric inline-flex items-center gap-1 ${
                                    isOverdue ? 'text-danger-fg font-medium' : 'text-fg-muted'
                                  }`}
                                >
                                  {isOverdue && <Clock className="w-3 h-3 text-danger-fg shrink-0" />}
                                  {formatWhen(lead.next_follow_up_at)}
                                </span>
                              );
                            })()
                          ) : (
                            <span className="text-fg-muted text-caption">—</span>
                          )}
                        </TD>
                        <TD align="center" className="w-12" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            title="Delete lead"
                            aria-label={`Delete ${lead.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setTableLeadToDelete({ id: lead.id, name: lead.name });
                            }}
                            className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted hover:text-danger-fg hover:bg-danger-bg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </TD>
                      </TR>
                    );
                  })}
                  {displayLeads.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-14 text-center text-fg-muted">
                        <p className="text-ui font-semibold text-fg">No leads found</p>
                        <p className="text-small text-fg-muted mt-1">Adjust filters or create a new lead to start the pipeline.</p>
                      </td>
                    </tr>
                  )}
                </TBody>
              </Table>
            </TableCard>
          </div>
        )}
          </div>
        )}
      </div>

      {showDrawerSkeleton && (
        <CrmLeadDrawerSkeleton
          onClose={() => {
            detailAbortRef.current?.abort();
            selectedIdRef.current = null;
            setSelectedId(null);
            setDetail(null);
          }}
        />
      )}

      {drawerReady && detail && (
        <CrmLeadDrawer
          lead={detail}
          stages={stages}
          assignees={assignees}
          templates={templates}
          canAssign={canAssign}
          busy={busy}
          onClose={() => {
            detailAbortRef.current?.abort();
            selectedIdRef.current = null;
            setSelectedId(null);
            setDetail(null);
          }}
          onDelete={handleDeleteLead}
          onAssign={(userId) => run(() => crmService.assignLead(detail.id, userId))}
          onStage={async (next) => {
            await run(() => crmService.updateLead(detail.id, { stage: next }));
          }}
          onNote={(body) => run(() => crmService.addNote(detail.id, body))}
          onWhatsApp={(templateId) =>
            run(async () => {
              const result = await crmService.logWhatsappOpened(detail.id, templateId);
              const wa = toSafeWhatsAppUrl(result.wa_url);
              if (wa) {
                window.open(wa, '_blank', 'noopener,noreferrer');
              }
            })
          }
          onContacted={() => run(() => crmService.markContacted(detail.id))}
          onFollowUp={(iso) => run(() => crmService.setFollowUp(detail.id, iso))}
          onClaim={() =>
            run(async () => {
              try {
                await crmService.claimLead(detail.id);
              } catch (err: any) {
                if (err instanceof ApiError && err.status === 409) {
                  const msg =
                    (typeof err.details?.detail === 'object' && err.details.detail?.message) ||
                    err.message ||
                    'Already claimed';
                  addToast('Already claimed', String(msg), 'warning');
                  detailAbortRef.current?.abort();
                  selectedIdRef.current = null;
                  setSelectedId(null);
                  setDetail(null);
                  await load();
                  return;
                }
                throw err;
              }
            })
          }
          onApplyRules={
            canAssign
              ? () => run(() => crmService.applyRules(detail.id))
              : undefined
          }
          onSaveForm={(payload) =>
            run(async () => {
              const updated = await crmService.updateLead(detail.id, payload);
              setDetail((prev) => (prev ? { ...prev, ...updated } : prev));
              setLeads((prev) => prev.map((lead) => (lead.id === updated.id ? { ...lead, ...updated } : lead)));
            })
          }
          onTrash={(reason) =>
            run(async () => {
              await crmService.trashLead(detail.id, reason);
              addToast('Moved to trash', detail.name, 'success');
              await load();
            })
          }
          onLost={async () => {
            setLostTarget({ kind: 'lead', id: detail.id });
          }}
          onWon={() => openRegisterClient(detail)}
          onReopen={async (leadId, stageName) => {
            await run(async () => {
              await crmService.reopenLead(leadId, { stage: stageName });
              addToast('Lead Reopened', 'Lead has been restored to the active pipeline.', 'info');
            });
          }}
          onReloadLead={async () => {
            if (selectedId) await refreshOpen(selectedId);
          }}
          onEditProposal={() => {
            if (detail.outcome !== 'won') {
              addToast('Lead is not won', 'Mark the lead as won before creating a deal.', 'warning');
              return;
            }
            setEditingDeal(null);
            setProposalModalLead(detail);
          }}
          onCreateDeal={() => {
            if (detail.outcome !== 'won') {
              addToast('Lead is not won', 'Mark the lead as won before creating a deal.', 'warning');
              return;
            }
            setEditingDeal(null);
            setNewDealFormKey((n) => n + 1);
            setProposalModalLead(detail);
            setDrawerInitialTab('deals');
          }}
          onEditDeal={(deal) => {
            setEditingDeal(deal);
            setProposalModalLead(detail);
          }}
          initialTab={drawerInitialTab}
        />
      )}



      <CrmCreateLeadModal
        isOpen={createOpen}
        assignees={assignees}
        canAssign={canAssign}
        onClose={() => setCreateOpen(false)}
        onSubmit={async (payload) => {
          await crmService.createLead(payload);
          addToast('Lead created', payload.name, 'success');
          await load();
        }}
      />

      <WorkspaceModal
        isOpen={Boolean(clientFormLead)}
        seed={clientFormSeed}
        onClose={() => setClientFormLead(null)}
        onSave={async (payload) => {
          if (!clientFormLead) return;
          const saved = await crmService.registerClient(clientFormLead.id, payload as WorkspaceCreatePayload);
          addToast('Active client created', saved.company || saved.name, 'success');
          setClientFormLead(null);
          await load();
          if (selectedId === clientFormLead.id) await refreshOpen(clientFormLead.id);
        }}
      />

      <CrmProposalModal
        key={editingDeal?.id || `new-${newDealFormKey}`}
        isOpen={Boolean(proposalModalLead)}
        lead={proposalModalLead}
        deal={editingDeal}
        onClose={() => {
          setProposalModalLead(null);
          setEditingDeal(null);
        }}
        onSave={async (config) => {
          if (!proposalModalLead) return;
          try {
            const payload = dealFormConfigToPayload(config, proposalModalLead);
            if (editingDeal?.id) {
              await crmService.updateDeal(editingDeal.id, payload);
              addToast('Deal updated', payload.title, 'success');
            } else if (proposalModalLead.outcome !== 'won') {
              throw new Error('Mark the lead as won before creating a deal.');
            } else {
              await crmService.createDeal(proposalModalLead.id, payload);
              addToast('Deal created', `${payload.title} · Opportunity Created`, 'success');
            }
            setProposalModalLead(null);
            setEditingDeal(null);
            await load();
            if (selectedId === proposalModalLead.id) {
              setDrawerInitialTab('deals');
              await refreshOpen(proposalModalLead.id);
            }
            if (viewMode === 'deals') {
              await loadDeals();
            }
          } catch (err: any) {
            addToast('Could not save deal', err.message || 'Try again.', 'error');
            throw err;
          }
        }}
      />

      <CrmDeleteConfirmModal
        isOpen={Boolean(tableLeadToDelete)}
        leadName={tableLeadToDelete?.name || ''}
        isDeleting={isDeletingTableLead}
        onClose={() => setTableLeadToDelete(null)}
        onConfirm={async () => {
          if (!tableLeadToDelete) return;
          setIsDeletingTableLead(true);
          try {
            await handleDeleteLead(tableLeadToDelete.id);
            setTableLeadToDelete(null);
          } finally {
            setIsDeletingTableLead(false);
          }
        }}
      />

      <CrmLostReasonModal
        isOpen={Boolean(lostTarget)}
        title={lostTarget?.kind === 'deal' ? 'Mark Deal Lost' : 'Mark Lead Lost'}
        subtitle={
          lostTarget?.kind === 'deal'
            ? 'Capture why this commercial opportunity was lost.'
            : 'Capture why this lead was lost so the team can improve.'
        }
        options={lostTarget?.kind === 'deal' ? DEAL_LOST_REASON_OPTIONS : LEAD_LOST_REASON_OPTIONS}
        isSubmitting={lostSubmitting}
        onClose={() => setLostTarget(null)}
        onConfirm={async (reason, note) => {
          if (!lostTarget) return;
          setLostSubmitting(true);
          try {
            if (lostTarget.kind === 'deal') {
              await crmService.markDealLost(lostTarget.id, reason, note);
              addToast('Deal marked lost', reason.replace(/_/g, ' '), 'info');
              await loadDeals();
            } else {
              await crmService.setOutcome(lostTarget.id, 'lost', note, reason);
              addToast('Lead marked lost', reason.replace(/_/g, ' '), 'info');
              await load();
              if (selectedId === lostTarget.id) await refreshOpen(lostTarget.id);
            }
            setLostTarget(null);
          } finally {
            setLostSubmitting(false);
          }
        }}
      />
    </div>
  );
};
