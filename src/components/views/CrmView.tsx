import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  Clock,
  LayoutGrid,
  List,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModuleLoadGate } from '../../context/ModuleLoadGate';
import { useToast } from '../../context/ToastContext';
import { crmService } from '../../services/crmService';
import { canAssignCrmLeads } from '../../utils/crmAccess';
import { toSafeWhatsAppUrl } from '../../utils/safeUrl';
import { followUpBucket, isClosedLeadOutcome } from '../../utils/followUpBuckets';
import { formatOpenDealTotals } from '../../utils/money';
import { NEUTRAL_METADATA_BADGE_CLASS } from '../../utils/badgeStyles';
import { CustomSelect } from '../ui/CustomSelect';
import { CrmCreateLeadModal } from '../crm/CrmCreateLeadModal';
import { CrmKanbanBoard } from '../crm/CrmKanbanBoard';
import { CrmDealKanbanBoard } from '../crm/CrmDealKanbanBoard';
import { CrmFollowUpView } from '../crm/CrmFollowUpView';
import { CrmProposalModal, dealFormConfigToPayload } from '../crm/CrmProposalModal';
import { CrmWonLeadMenu } from '../crm/CrmWonLeadMenu';
import { WorkspaceModal, type WorkspaceFormSeed } from '../modals/WorkspaceModal';
import type { WorkspaceCreatePayload } from '../../services/workspaceService';
import { CrmLeadDrawer, CrmLeadDrawerSkeleton } from '../crm/CrmLeadDrawer';
import { CrmSettingsView } from '../crm/settings/CrmSettingsView';
import type { CrmSettingsTab } from '../crm/settings/CrmSettingsView';
import { CrmDeleteConfirmModal } from '../crm/CrmDeleteConfirmModal';
import {
  CrmLostReasonModal,
  DEAL_LOST_REASON_OPTIONS,
  LEAD_LOST_REASON_OPTIONS,
} from '../crm/CrmLostReasonModal';
import { CrmStatusBadge } from '../crm/CrmStatusBadge';
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
      <div className="h-full flex gap-3 min-w-min">
        {[1, 2, 3, 4, 5].map((col) => (
          <div
            key={col}
            className="min-w-[230px] w-[240px] flex-shrink-0 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl bg-zinc-100/40 dark:bg-[#12141e]/40 p-3 space-y-3 animate-pulse"
          >
            <div className="flex items-center justify-between pb-2 border-b border-zinc-200/60 dark:border-zinc-800/60">
              <div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
              <div className="h-4 w-6 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
            </div>
            <div className="space-y-2.5">
              {[1, 2, 3].map((card) => (
                <div
                  key={card}
                  className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white/70 dark:bg-[#151722]/70 p-3 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="h-3.5 w-28 bg-zinc-200 dark:bg-zinc-800 rounded" />
                    <div className="h-2 w-2 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                  </div>
                  <div className="h-3 w-36 bg-zinc-100 dark:bg-zinc-800/60 rounded" />
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
                    <div className="h-4 w-12 bg-zinc-100 dark:bg-zinc-800 rounded" />
                    <div className="h-5 w-5 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CrmTableSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-5">
      <div className="w-full overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800/90 bg-white dark:bg-[#11131a] shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-zinc-50/80 dark:bg-[#161822] text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 font-bold uppercase tracking-wider text-[11px]">
              <th className="py-2.5 px-4">Lead</th>
              <th className="py-2.5 px-4">Contact</th>
              <th className="py-2.5 px-4">Source</th>
              <th className="py-2.5 px-4">Stage</th>
              <th className="py-2.5 px-4">Assigned</th>
              <th className="py-2.5 px-4">Last Activity</th>
              <th className="py-2.5 px-4 text-right">Status</th>
              <th className="py-2.5 px-3 w-12 text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 animate-pulse">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
              <tr key={row}>
                <td className="py-3 px-4">
                  <div className="h-3.5 w-32 bg-zinc-200 dark:bg-zinc-800 rounded mb-1" />
                  <div className="h-2.5 w-20 bg-zinc-100 dark:bg-zinc-800/60 rounded" />
                </td>
                <td className="py-3 px-4">
                  <div className="h-3.5 w-28 bg-zinc-200 dark:bg-zinc-800 rounded mb-1" />
                  <div className="h-2.5 w-36 bg-zinc-100 dark:bg-zinc-800/60 rounded" />
                </td>
                <td className="py-3 px-4">
                  <div className="h-4 w-16 bg-zinc-100 dark:bg-zinc-800 rounded" />
                </td>
                <td className="py-3 px-4">
                  <div className="h-4 w-20 bg-zinc-100 dark:bg-zinc-800 rounded" />
                </td>
                <td className="py-3 px-4">
                  <div className="h-4 w-24 bg-zinc-100 dark:bg-zinc-800 rounded" />
                </td>
                <td className="py-3 px-4">
                  <div className="h-3.5 w-16 bg-zinc-100 dark:bg-zinc-800 rounded" />
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="h-5 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-full ml-auto" />
                </td>
                <td className="py-3 px-3 text-center">
                  <div className="h-4 w-4 bg-zinc-100 dark:bg-zinc-800 rounded mx-auto" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [counts, setCounts] = useState<CrmCounts>(EMPTY_COUNTS);
  const [stages, setStages] = useState<CrmPipelineStage[]>([]);
  const [assignees, setAssignees] = useState<CrmAssignee[]>([]);
  const [templates, setTemplates] = useState<CrmTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  useModuleLoadGate(isLoading);

  const loadAbortRef = useRef<AbortController | null>(null);
  const loadReqIdRef = useRef(0);
  const detailAbortRef = useRef<AbortController | null>(null);
  const detailReqIdRef = useRef(0);
  const pollAbortRef = useRef<AbortController | null>(null);
  const hasLoadedOnceRef = useRef(false);
  const selectedIdRef = useRef<string | null>(null);

  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<CrmSettingsTab>('templates');
  const [viewMode, setViewMode] = useState<'list' | 'board' | 'deals' | 'followup' | 'settings'>('board');
  const [proposalModalLead, setProposalModalLead] = useState<CrmLead | null>(null);
  const [editingDeal, setEditingDeal] = useState<CrmDeal | null>(null);
  const [newDealFormKey, setNewDealFormKey] = useState(0);
  const [drawerInitialTab, setDrawerInitialTab] = useState<'overview' | 'brief' | 'activity' | 'deals'>('overview');
  const [pipelineDeals, setPipelineDeals] = useState<CrmDeal[]>([]);
  const [dealStages, setDealStages] = useState<CrmPipelineStage[]>([]);
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
    if (activeSection === 'board') {
      setViewMode('board');
    } else if (activeSection === 'deals') {
      setViewMode('deals');
    } else if (activeSection === 'list') {
      setViewMode('list');
    } else if (activeSection === 'followup') {
      setViewMode('followup');
    } else if (activeSection === 'settings') {
      setViewMode('settings');
    } else if (activeSection === 'templates') {
      setViewMode('settings');
      setSettingsTab('templates');
    } else if (activeSection === 'ingest') {
      setViewMode('settings');
      setSettingsTab('ingest');
    } else if (activeSection === 'rules') {
      setViewMode('settings');
      setSettingsTab('rules');
    }
  }, [activeSection]);

  const handleToggleViewMode = (mode: 'list' | 'board' | 'deals' | 'followup' | 'settings') => {
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
      addToast('Sales Pipeline failed to load', err.message || 'Try again.', 'warning');
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
      addToast('Could not delete lead', err.message || 'Try again.', 'warning');
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
        addToast('Could not open lead', err.message || 'Try again.', 'warning');
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
      addToast('CRM action failed', err.message || 'Try again.', 'warning');
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

  if (viewMode === 'settings') {
    return (
      <CrmSettingsView
        initialTab={settingsTab}
        assignees={assignees}
        onBackToPipeline={() => handleToggleViewMode('board')}
      />
    );
  }

  return (
    <div className="flex-1 flex h-full min-w-0 overflow-hidden bg-zinc-50/50 dark:bg-[#0c0d12]">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <h1 className="text-base font-bold text-zinc-950 dark:text-zinc-50 truncate">
              {viewMode === 'deals'
                ? 'Deal Pipeline'
                : viewMode === 'followup'
                  ? 'Follow-ups'
                  : viewMode === 'list'
                    ? 'All Leads'
                    : 'Sales Pipeline'}
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 font-numeric shrink-0">
              {viewMode === 'deals'
                ? `${pipelineDeals.length}`
                : `${quickFilter === 'all' ? activeLeadCount : displayLeads.filter((lead) => !isClosedLeadOutcome(lead.outcome)).length}`}
            </span>
            {isRefreshing && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                <span className="w-3 h-3 rounded-full border-2 border-zinc-300 dark:border-zinc-600 border-t-indigo-500 motion-safe:animate-spin" />
                Updating…
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canAssign && (
              <button
                type="button"
                onClick={() => handleToggleViewMode('settings')}
                className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-semibold transition cursor-pointer"
                title="Pipeline Settings (Templates, Ingest Sources, Rules & Team)"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Settings</span>
              </button>
            )}
            {viewMode === 'deals' ? (
              <CrmWonLeadMenu onSelect={openDealForWonLead} />
            ) : (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="h-8 px-3.5 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
              >
                <Plus className="w-3.5 h-3.5" />
                New lead
              </button>
            )}
          </div>
        </header>

        {/* Rate limit notification */}
        {rateLimited && (
          <div className="px-5 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Rate limit reached. Automatic sync paused briefly and will resume in 30 seconds.</span>
          </div>
        )}

        {/* Alert-only operational strip */}
        {!isLoading && alertHudVisible && (
          <div className="px-5 py-1.5 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30 flex flex-wrap items-center gap-2 text-xs">
            {viewMode === 'deals' ? (
              <>
                {openDeals.length > 0 && (
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800"
                    title="Open deals"
                  >
                    <span className="w-2 h-2 rounded-full bg-zinc-400" />
                    <span className="font-bold font-numeric text-zinc-900 dark:text-zinc-100">
                      {openDeals.length}
                    </span>
                    <span className="text-zinc-500 dark:text-zinc-400 font-medium">open</span>
                    {openDealValueLabel && (
                      <span className="font-numeric font-semibold text-zinc-700 dark:text-zinc-300">
                        · {openDealValueLabel}
                      </span>
                    )}
                  </div>
                )}
                {pendingOpsDealCount > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-amber-200/80 dark:border-amber-800/60">
                    <span className="w-2 h-2 rounded-full bg-amber-500 motion-safe:animate-pulse" />
                    <span className="font-bold font-numeric text-amber-700 dark:text-amber-400">
                      {pendingOpsDealCount}
                    </span>
                    <span className="text-amber-700 dark:text-amber-400 font-medium">pending ops</span>
                  </div>
                )}
                {counts.win_rate != null && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 ms-auto">
                    <span className="text-zinc-500 dark:text-zinc-400 font-medium">Win rate</span>
                    <span className="font-bold font-numeric text-zinc-900 dark:text-zinc-100">
                      {counts.win_rate}%
                    </span>
                  </div>
                )}
              </>
            ) : (
              <>
                {counts.uncontacted > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-amber-200/80 dark:border-amber-800/60">
                    <span className="w-2 h-2 rounded-full bg-amber-500 motion-safe:animate-pulse" />
                    <span className="font-bold font-numeric text-amber-700 dark:text-amber-400">
                      {counts.uncontacted}
                    </span>
                    <span className="text-amber-700 dark:text-amber-400 font-medium">uncontacted</span>
                  </div>
                )}
                {overdueFollowUpCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setQuickFilter('overdue')}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-rose-200/80 dark:border-rose-800/60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-500 motion-safe:animate-pulse" />
                    <span className="font-bold font-numeric text-rose-700 dark:text-rose-400">
                      {overdueFollowUpCount}
                    </span>
                    <span className="text-rose-700 dark:text-rose-400 font-medium">follow-up due</span>
                  </button>
                )}
                {counts.opened_not_confirmed > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-amber-200/80 dark:border-amber-800/60">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="font-bold font-numeric text-amber-700 dark:text-amber-400">
                      {counts.opened_not_confirmed}
                    </span>
                    <span className="text-amber-700 dark:text-amber-400 font-medium">opened, not confirmed</span>
                  </div>
                )}
                {pendingClientFormCount > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-amber-200/80 dark:border-amber-800/60">
                    <span className="w-2 h-2 rounded-full bg-amber-500 motion-safe:animate-pulse" />
                    <span className="font-bold font-numeric text-amber-700 dark:text-amber-400">
                      {pendingClientFormCount}
                    </span>
                    <span className="text-amber-700 dark:text-amber-400 font-medium">need client form</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {isLoading && (
          <div className="px-5 py-1.5 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center gap-2 animate-pulse">
            <div className="h-7 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
            <div className="h-7 w-28 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
          </div>
        )}

        {/* Filter & View Toolbar */}
        <div className="px-5 py-2.5 border-b border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="w-3.5 h-3.5 absolute start-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, phone, company..."
                className="w-full h-8 ps-8.5 pe-3 rounded-lg border border-zinc-200 dark:border-zinc-700/80 bg-zinc-50/70 dark:bg-zinc-900/70 text-xs focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all text-zinc-900 dark:text-zinc-100"
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
              <div className="flex items-center gap-1 bg-zinc-100/80 dark:bg-zinc-800/80 p-0.5 rounded-lg border border-zinc-200/60 dark:border-zinc-700/60">
                {(
                  [
                    ['all', 'All'],
                    ['overdue', 'Overdue'],
                    ['today', 'Today'],
                    ['scheduled', 'Scheduled'],
                    ['idle', 'Idle'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setQuickFilter(id)}
                    className={`h-8 px-2.5 rounded-md text-xs font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
                      quickFilter === id
                        ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-0.5 bg-zinc-100/80 dark:bg-zinc-800/80 p-0.5 rounded-lg border border-zinc-200/60 dark:border-zinc-700/60">
            {(
              [
                { mode: 'board' as const, icon: LayoutGrid, label: 'Leads' },
                { mode: 'deals' as const, icon: Briefcase, label: 'Deals' },
                { mode: 'list' as const, icon: List, label: 'List' },
                { mode: 'followup' as const, icon: Clock, label: 'Follow-ups' },
              ] as const
            ).map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleToggleViewMode(mode)}
                className={`h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold rounded-md transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
                  viewMode === mode
                    ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-100'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {mode === 'followup' && dueFollowUpsCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white leading-none font-numeric">
                    {dueFollowUpsCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* View Mode Content */}
        {isLoading ? (
          viewMode === 'board' || viewMode === 'deals' ? <CrmBoardSkeleton /> : <CrmTableSkeleton />
        ) : (
          <div className={`flex-1 flex flex-col min-h-0 min-w-0 ${isRefreshing ? 'opacity-90' : ''}`}>
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
                addToast('Could not move deal', err.message || 'Try again.', 'warning');
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
                addToast('Could not move lead', err.message || 'Try again.', 'warning');
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
            <div className="w-full overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800/90 bg-white dark:bg-[#11131a] shadow-xs">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-50/80 dark:bg-[#161822] text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-2.5 px-4">Lead</th>
                      <th className="py-2.5 px-4">Contact</th>
                      <th className="py-2.5 px-4">Source</th>
                      <th className="py-2.5 px-4">Stage</th>
                      <th className="py-2.5 px-4">Assigned</th>
                      <th className="py-2.5 px-4">Last Activity</th>
                      <th className="py-2.5 px-4 text-right">Status</th>
                      <th className="py-2.5 px-3 w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-medium">
                    {displayLeads.map((lead) => {
                      const active = selectedId === lead.id;
                      return (
                        <tr
                          key={lead.id}
                          onClick={() => void openLead(lead.id)}
                          className={`cursor-pointer transition-colors ${
                            active
                              ? 'bg-zinc-100 dark:bg-zinc-800/60'
                              : 'hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40'
                          }`}
                        >
                          <td className="py-2.5 px-4">
                            <div className="font-bold text-zinc-900 dark:text-zinc-100">{lead.name}</div>
                            {lead.company && <div className="text-zinc-500 text-[11px]">{lead.company}</div>}
                          </td>
                          <td className="py-2.5 px-4">
                            {lead.phone_e164 ? (
                              <div className="font-numeric text-zinc-800 dark:text-zinc-200 font-semibold">
                                +{lead.phone_e164}
                              </div>
                            ) : lead.phone_raw ? (
                              <div className="font-numeric text-zinc-500">{lead.phone_raw}</div>
                            ) : null}
                            {lead.email && <div className="text-zinc-400 text-[11px]">{lead.email}</div>}
                            {!lead.phone_e164 && !lead.phone_raw && !lead.email && (
                              <span className="text-zinc-400">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="text-zinc-600 dark:text-zinc-400 capitalize">{lead.source}</span>
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="text-zinc-800 dark:text-zinc-200 capitalize font-medium">
                              {lead.stage.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-zinc-700 dark:text-zinc-300">
                            {lead.assigned_to_name ? (
                              <span className="font-medium text-zinc-800 dark:text-zinc-200">{lead.assigned_to_name}</span>
                            ) : (
                              <span className={`${NEUTRAL_METADATA_BADGE_CLASS} text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800`}>
                                Claim pool
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-numeric text-zinc-600 dark:text-zinc-400">
                            {formatWhen(lead.last_activity_at)}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <CrmStatusBadge lead={lead} />
                          </td>
                          <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              title="Delete lead"
                              aria-label="Delete lead"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTableLeadToDelete({ id: lead.id, name: lead.name });
                              }}
                              className="inline-flex size-8 items-center justify-center rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {displayLeads.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-14 text-center text-zinc-400">
                          <p className="text-sm font-semibold">No leads found</p>
                          <p className="text-xs mt-1">Adjust filters or create a new lead to start the pipeline.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
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
            addToast('Could not save deal', err.message || 'Try again.', 'warning');
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
