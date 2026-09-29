import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../src/theme';
import { useAuth } from '../../src/context/AuthContext';
import { canAccessCrm, canAssignCrmLeads } from '../../src/lib/roles';
import { crmApi } from '../../src/lib/crmApi';
import type {
  CrmAssignee,
  CrmCounts,
  CrmDeal,
  CrmLead,
  CrmLeadCreatePayload,
  CrmPipelineStage,
} from '../../src/types/crm';
import { LeadCard } from '../../src/components/crm/LeadCard';
import { CreateLeadModal } from '../../src/components/crm/CreateLeadModal';
import { CallLogModal } from '../../src/components/crm/CallLogModal';
import { DealModal } from '../../src/components/crm/DealModal';
import {
  filterSummary,
  PipelineFilterSheet,
  type QuickFilter,
} from '../../src/components/crm/PipelineFilterSheet';
import { StageSheet } from '../../src/components/crm/StageSheet';
import { openWhatsApp } from '../../src/lib/whatsapp';
import { formatCrmStage } from '../../src/ui/format';
import { PipelineListSkeleton } from '../../src/ui/Skeleton';
import {
  CRM_SETTLE_MS,
  getCachedAssignees,
  getCachedCounts,
  getCachedDealsList,
  getCachedLeadsList,
  getCachedPipeline,
  isCrmCacheStale,
  setCachedAssignees,
  setCachedCounts,
  setCachedDealsList,
  setCachedLeadsList,
  setCachedPipeline,
  updateCachedLeadStage,
} from '../../src/lib/crmCache';

export default function PipelineScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const hasAccess = canAccessCrm(user);
  const canAssign = canAssignCrmLeads(user);

  const [activeTab, setActiveTab] = useState<'leads' | 'deals'>('leads');
  const [stages, setStages] = useState<CrmPipelineStage[]>([]);
  const [dealStages, setDealStages] = useState<CrmPipelineStage[]>([]);
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [counts, setCounts] = useState<CrmCounts | null>(null);
  const [assignees, setAssignees] = useState<CrmAssignee[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals state
  const [createLeadOpen, setCreateLeadOpen] = useState(false);
  const [createDealOpen, setCreateDealOpen] = useState(false);
  const [callLogLead, setCallLogLead] = useState<CrmLead | null>(null);
  const [stageSheetLead, setStageSheetLead] = useState<CrmLead | null>(null);
  const [updatingStageId, setUpdatingStageId] = useState<string | null>(null);
  const isUpdatingStageRef = useRef(false);
  const hasSettledOnce = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input to avoid frame drops
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  // Safety watchdog: ensure loading never gets permanently stuck
  useEffect(() => {
    if (!loading) return;
    const watchdog = setTimeout(() => {
      setLoading(false);
    }, 6000);
    return () => clearTimeout(watchdog);
  }, [loading]);

  const loadData = useCallback(async (opts?: { force?: boolean }) => {
    if (!hasAccess) return;
    setLoadError(null);

    // Cache-first retrieval on cold load
    if (!opts?.force) {
      const cachedPipe = getCachedPipeline();
      const cachedCounts = getCachedCounts();
      const cachedAssignees = getCachedAssignees();
      const cachedLeads = getCachedLeadsList('default');
      const cachedDeals = getCachedDealsList('default');

      if (cachedPipe && cachedLeads) {
        setStages(cachedPipe.data.stages);
        setDealStages(cachedPipe.data.dealStages);
        if (cachedCounts) setCounts(cachedCounts.data);
        if (cachedAssignees) setAssignees(cachedAssignees.data);
        setLeads(cachedLeads.data.items);
        if (cachedDeals) setDeals(cachedDeals.data.deals);
        setLoading(false);

        // Skip network if all primary caches are still fresh
        if (
          !isCrmCacheStale(cachedPipe) &&
          !isCrmCacheStale(cachedLeads) &&
          (!cachedCounts || !isCrmCacheStale(cachedCounts))
        ) {
          setRefreshing(false);
          return;
        }
      }
    }

    try {
      const [pipe, dealPipe, c, asg, leadsRes, dealsRes] = await Promise.all([
        crmApi.getPipeline().catch((e) => {
          console.warn('[crm] getPipeline error:', e?.message);
          return [];
        }),
        crmApi.getDealPipeline().catch(() => []),
        crmApi.getCounts().catch(() => null),
        crmApi.getAssignees().catch(() => []),
        crmApi.listLeads({ limit: 100 }).catch((e) => {
          setLoadError(e?.message || 'Could not load leads.');
          return { items: [], total: 0 };
        }),
        crmApi.listDeals({ limit: 100 }).catch(() => ({ deals: [], total_count: 0, total_value: 0 })),
      ]);

      setStages(pipe);
      setDealStages(dealPipe);
      setCounts(c);
      setAssignees(asg);
      setLeads(leadsRes.items || []);
      setDeals(dealsRes.deals || []);

      // Persist to cache
      setCachedPipeline({ stages: pipe, dealStages: dealPipe });
      if (c) setCachedCounts(c);
      setCachedAssignees(asg);
      setCachedLeadsList('default', { items: leadsRes.items || [], total: leadsRes.total || 0 });
      setCachedDealsList('default', {
        deals: dealsRes.deals || [],
        total_count: dealsRes.total_count || 0,
        total_value: dealsRes.total_value || 0,
      });
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load CRM data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hasAccess]);

  useEffect(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    const delay = hasSettledOnce.current ? CRM_SETTLE_MS : 0;
    hasSettledOnce.current = true;
    settleTimer.current = setTimeout(() => {
      void loadData();
    }, delay);
    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData({ force: true });
  };

  // Stage change with confirmation popup and optimistic update
  const handleOpenStageSheet = useCallback((lead: CrmLead) => {
    setStageSheetLead(lead);
  }, []);

  const handleSelectStageFromList = useCallback(
    (newStage: string, stageName?: string) => {
      if (!stageSheetLead || isUpdatingStageRef.current) return;
      if (newStage === stageSheetLead.stage) {
        setStageSheetLead(null);
        return;
      }
      const targetLead = stageSheetLead;
      const targetName = stageName || formatCrmStage(newStage);

      Alert.alert(
        'Change Stage',
        `Move ${targetLead.name} to ${targetName}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Move Stage',
            onPress: async () => {
              isUpdatingStageRef.current = true;
              setUpdatingStageId(newStage);
              const previousStage = targetLead.stage;

              // 1. Optimistic UI update
              setLeads((prev) =>
                prev.map((l) => (l.id === targetLead.id ? { ...l, stage: newStage } : l))
              );
              updateCachedLeadStage(targetLead.id, newStage);
              setStageSheetLead(null);

              try {
                // 2. Persist to API
                const updated = await crmApi.updateLead(targetLead.id, { stage: newStage });
                setLeads((prev) =>
                  prev.map((l) => (l.id === targetLead.id ? { ...l, ...updated } : l))
                );
              } catch (err: any) {
                // 3. Rollback on failure
                setLeads((prev) =>
                  prev.map((l) => (l.id === targetLead.id ? { ...l, stage: previousStage } : l))
                );
                updateCachedLeadStage(targetLead.id, previousStage);
                Alert.alert(
                  'Update Failed',
                  err?.message || 'Could not update stage. Please try again.'
                );
              } finally {
                isUpdatingStageRef.current = false;
                setUpdatingStageId(null);
              }
            },
          },
        ]
      );
    },
    [stageSheetLead]
  );

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    return leads.filter((lead) => {
      // Search
      if (q) {
        const matchName = lead.name?.toLowerCase().includes(q);
        const matchCompany = lead.company?.toLowerCase().includes(q);
        const matchPhone = lead.phone_e164?.includes(q) || lead.phone_raw?.includes(q);
        if (!matchName && !matchCompany && !matchPhone) return false;
      }

      // Quick filter
      if (quickFilter === 'uncontacted') {
        if (lead.contacted || lead.whatsapp_opened_at || lead.outcome) return false;
      } else if (quickFilter === 'due') {
        if (!lead.next_follow_up_at || lead.outcome) return false;
        if (new Date(lead.next_follow_up_at).getTime() > Date.now() + 86400000) return false;
      } else if (quickFilter === 'won') {
        if (lead.outcome !== 'won') return false;
      } else if (quickFilter === 'lost') {
        if (lead.outcome !== 'lost' && lead.outcome !== 'disqualified') return false;
      }

      // Stage filter
      if (selectedStage !== 'all') {
        if (lead.stage !== selectedStage) return false;
      }

      return true;
    });
  }, [leads, debouncedSearch, quickFilter, selectedStage]);

  // Filtered Deals
  const filteredDeals = useMemo(() => {
    return deals.filter((deal) => {
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchTitle = deal.title?.toLowerCase().includes(q);
        const matchClient = deal.lead?.name?.toLowerCase().includes(q);
        if (!matchTitle && !matchClient) return false;
      }
      if (selectedStage !== 'all') {
        if (deal.stage !== selectedStage) return false;
      }
      return true;
    });
  }, [deals, search, selectedStage]);

  // WhatsApp Action Handler — uses default template text from API
  const handleWhatsApp = async (lead: CrmLead) => {
    if (!lead.phone_valid || !lead.phone_e164) {
      Alert.alert('Invalid Phone', 'This lead does not have a valid phone number.');
      return;
    }

    try {
      const res = await crmApi.logWhatsappOpened(lead.id);
      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, whatsapp_opened_at: new Date().toISOString() } : l))
      );
      await openWhatsApp({
        phoneE164: lead.phone_e164,
        waUrl: res.wa_url,
        text: res.rendered_text,
      });
    } catch (err: any) {
      Alert.alert('WhatsApp Error', err?.message || 'Could not initiate WhatsApp message.');
    }
  };

  // Phone Call Action Handler
  const handleCall = async (lead: CrmLead) => {
    if (!lead.phone_e164) {
      Alert.alert('No Phone', 'This lead does not have a valid phone number.');
      return;
    }

    const cleanPhone = lead.phone_e164.replace(/\D/g, '');
    const telUrl = `tel:+${cleanPhone}`;

    try {
      await Linking.openURL(telUrl);
      // Open Call Log sheet so when rep returns, they can record call notes
      setCallLogLead(lead);
    } catch (err: any) {
      Alert.alert('Call Error', err?.message || 'Could not open phone dialer.');
    }
  };

  // Log Call Outcome from sheet
  const handleSaveCallLog = async (outcome: string, note?: string) => {
    if (!callLogLead) return;
    try {
      const outcomeNote = `[Call: ${outcome.replace(/_/g, ' ')}] ${note || ''}`.trim();
      await crmApi.addNote(callLogLead.id, outcomeNote);
      if (outcome === 'connected') {
        await crmApi.markContacted(callLogLead.id);
        setLeads((prev) =>
          prev.map((l) => (l.id === callLogLead.id ? { ...l, contacted: true } : l))
        );
      }
      loadData();
    } catch (err: any) {
      Alert.alert('Log Error', err?.message || 'Could not save call log.');
    }
  };

  // Claim Lead
  const handleClaim = async (lead: CrmLead) => {
    try {
      const updated = await crmApi.claimLead(lead.id);
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? updated : l)));
      Alert.alert('Lead Claimed!', `You are now the owner of ${lead.name}.`);
    } catch (err: any) {
      Alert.alert('Claim Failed', err?.message || 'Lead could not be claimed.');
    }
  };

  // Create Lead
  const handleCreateLead = async (payload: CrmLeadCreatePayload) => {
    const created = await crmApi.createLead(payload);
    setLeads((prev) => [created, ...prev]);
    loadData();
    router.push({ pathname: '/pipeline/lead/[id]', params: { id: created.id } });
  };

  if (!hasAccess) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <Ionicons name="lock-closed" size={48} color={colors.muted} />
        <Text style={styles.deniedTitle}>Access Restricted</Text>
        <Text style={styles.deniedSubtitle}>
          The Sales Pipeline is reserved for Sales Team, Admin, and Operations personnel only.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.screenTitle}>Sales Pipeline</Text>
          <Text style={styles.screenSubtitle}>
            {counts
              ? `${counts.incoming} incoming • ${counts.uncontacted} uncontacted`
              : 'Live Opportunities'}
          </Text>
        </View>

        <View style={styles.topActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setIsSearchOpen((prev) => !prev)}
          >
            <Ionicons
              name={isSearchOpen ? 'close' : 'search'}
              size={20}
              color={isSearchOpen ? colors.indigo : '#52525B'}
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconBtn} onPress={handleRefresh}>
            <Ionicons name="refresh" size={20} color="#52525B" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Input Bar */}
      {isSearchOpen && (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color="#71717A" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search leads, companies, phones..."
            placeholderTextColor="#A1A1AA"
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="#71717A" />
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Error Alert Banner */}
      {loadError ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={colors.rose} />
          <Text style={styles.errorBannerText} numberOfLines={2}>
            {loadError}
          </Text>
          <TouchableOpacity onPress={handleRefresh} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Main View Mode Selector (Leads vs. Deals) */}
      <View style={styles.viewModeContainer}>
        <TouchableOpacity
          style={[styles.viewModeBtn, activeTab === 'leads' ? styles.viewModeBtnActive : null]}
          onPress={() => {
            setActiveTab('leads');
            setSelectedStage('all');
          }}
        >
          <Ionicons
            name="people"
            size={16}
            color={activeTab === 'leads' ? colors.indigo : colors.muted}
          />
          <Text
            style={[
              styles.viewModeText,
              activeTab === 'leads' ? styles.viewModeTextActive : null,
            ]}
          >
            Leads ({leads.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.viewModeBtn, activeTab === 'deals' ? styles.viewModeBtnActive : null]}
          onPress={() => {
            setActiveTab('deals');
            setSelectedStage('all');
          }}
        >
          <Ionicons
            name="briefcase"
            size={16}
            color={activeTab === 'deals' ? colors.indigo : colors.muted}
          />
          <Text
            style={[
              styles.viewModeText,
              activeTab === 'deals' ? styles.viewModeTextActive : null,
            ]}
          >
            Deals ({deals.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filter bar */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={[
            styles.filterBtn,
            (activeTab === 'leads' ? filterSummary(quickFilter, selectedStage) : selectedStage !== 'all')
              ? styles.filterBtnActive
              : null,
          ]}
          onPress={() => setFilterSheetOpen(true)}
        >
          <Ionicons
            name="options-outline"
            size={16}
            color={
              (activeTab === 'leads' && filterSummary(quickFilter, selectedStage)) ||
              selectedStage !== 'all'
                ? colors.indigo
                : colors.muted
            }
          />
          <Text
            style={[
              styles.filterBtnText,
              ((activeTab === 'leads' && filterSummary(quickFilter, selectedStage)) ||
                selectedStage !== 'all') &&
                styles.filterBtnTextActive,
            ]}
            numberOfLines={1}
          >
            {activeTab === 'leads'
              ? filterSummary(quickFilter, selectedStage) || 'Filter'
              : selectedStage !== 'all'
                ? `Stage · ${formatCrmStage(selectedStage)}`
                : 'Filter'}
          </Text>
        </TouchableOpacity>

        {((activeTab === 'leads' && (quickFilter !== 'all' || selectedStage !== 'all')) ||
          (activeTab === 'deals' && selectedStage !== 'all')) && (
          <TouchableOpacity
            onPress={() => {
              setQuickFilter('all');
              setSelectedStage('all');
            }}
            hitSlop={8}
          >
            <Text style={styles.clearFilterText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content Feed */}
      {loading ? (
        <PipelineListSkeleton cardRows={5} />
      ) : activeTab === 'leads' ? (
        <FlatList
          data={filteredLeads}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.feedContent}
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          renderItem={({ item }) => (
            <LeadCard
              lead={item}
              onPress={() =>
                router.push({ pathname: '/pipeline/lead/[id]', params: { id: item.id } })
              }
              onWhatsApp={handleWhatsApp}
              onCall={handleCall}
              onClaim={handleClaim}
              onChangeStage={handleOpenStageSheet}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              {debouncedSearch.trim() ? (
                <>
                  <Ionicons name="search-outline" size={44} color={colors.muted} />
                  <Text style={styles.emptyTitle}>No matching leads</Text>
                  <Text style={styles.emptySubtitle}>
                    No leads found matching "{debouncedSearch.trim()}". Check spelling or try clearing search.
                  </Text>
                  <TouchableOpacity style={styles.emptyBtn} onPress={() => setSearch('')}>
                    <Text style={styles.emptyBtnText}>Clear search</Text>
                  </TouchableOpacity>
                </>
              ) : selectedStage !== 'all' ? (
                <>
                  <Ionicons name="filter-outline" size={44} color={colors.muted} />
                  <Text style={styles.emptyTitle}>No leads in this stage</Text>
                  <Text style={styles.emptySubtitle}>
                    There are currently no active leads in the "{formatCrmStage(selectedStage)}" stage.
                  </Text>
                  <TouchableOpacity style={styles.emptyBtn} onPress={() => setSelectedStage('all')}>
                    <Text style={styles.emptyBtnText}>Show all stages</Text>
                  </TouchableOpacity>
                </>
              ) : quickFilter !== 'all' ? (
                <>
                  <Ionicons name="funnel-outline" size={44} color={colors.muted} />
                  <Text style={styles.emptyTitle}>No {quickFilter} leads</Text>
                  <Text style={styles.emptySubtitle}>
                    No leads currently match the "{quickFilter}" quick filter.
                  </Text>
                  <TouchableOpacity style={styles.emptyBtn} onPress={() => setQuickFilter('all')}>
                    <Text style={styles.emptyBtnText}>Show all leads</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Ionicons name="folder-open-outline" size={48} color={colors.muted} />
                  <Text style={styles.emptyTitle}>No leads in pipeline</Text>
                  <Text style={styles.emptySubtitle}>
                    Get started by adding your first lead to begin tracking opportunities.
                  </Text>
                  <TouchableOpacity
                    style={styles.emptyBtnPrimary}
                    onPress={() => setCreateLeadOpen(true)}
                  >
                    <Ionicons name="add" size={16} color="#FFFFFF" />
                    <Text style={styles.emptyBtnPrimaryText}>Create lead</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          }
        />
      ) : (
        <FlatList
          data={filteredDeals}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.feedContent}
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          renderItem={({ item }) => (
            <View style={styles.dealCard}>
              <View style={styles.dealCardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dealTitle}>{item.title}</Text>
                  {item.lead?.name ? (
                    <Text style={styles.dealClient}>Client: {item.lead.name}</Text>
                  ) : null}
                </View>
                <View style={styles.dealValueBadge}>
                  <Text style={styles.dealValueText}>
                    ${item.value?.toLocaleString()} {item.currency}
                  </Text>
                </View>
              </View>

              <View style={styles.dealMetaRow}>
                <View style={styles.dealStageTag}>
                  <Text style={styles.dealStageText}>{item.stage?.replace(/_/g, ' ')}</Text>
                </View>
                <Text style={styles.dealBillingTag}>
                  {item.billing_type === 'retainer' ? 'Retainer' : 'Project'}
                </Text>
                {item.approval_status === 'pending_operations' ? (
                  <View style={styles.pendingApprovalTag}>
                    <Text style={styles.pendingApprovalText}>Pending Approval</Text>
                  </View>
                ) : null}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="briefcase-outline" size={48} color={colors.muted} />
              <Text style={styles.emptyTitle}>No commercial deals</Text>
              <Text style={styles.emptySubtitle}>Deals attached to leads will appear here.</Text>
            </View>
          }
        />
      )}

      {/* Floating Action Button (+ New Lead) */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => setCreateLeadOpen(true)}
      >
        <Ionicons name="add" size={24} color="#FFFFFF" />
        <Text style={styles.fabText}>New Lead</Text>
      </TouchableOpacity>

      {/* Modals */}
      <PipelineFilterSheet
        visible={filterSheetOpen}
        mode={activeTab}
        stages={activeTab === 'leads' ? stages : dealStages}
        quickFilter={quickFilter}
        selectedStage={selectedStage}
        onClose={() => setFilterSheetOpen(false)}
        onChangeQuickFilter={setQuickFilter}
        onChangeStage={setSelectedStage}
        onClear={() => {
          setQuickFilter('all');
          setSelectedStage('all');
        }}
      />

      <CreateLeadModal
        visible={createLeadOpen}
        assignees={assignees}
        canAssign={canAssign}
        onClose={() => setCreateLeadOpen(false)}
        onSubmit={handleCreateLead}
      />

      <CallLogModal
        visible={Boolean(callLogLead)}
        lead={callLogLead}
        onClose={() => setCallLogLead(null)}
        onLogOutcome={handleSaveCallLog}
      />

      <StageSheet
        visible={Boolean(stageSheetLead)}
        stages={stages}
        currentStage={stageSheetLead?.stage}
        outcome={stageSheetLead?.outcome}
        leadName={stageSheetLead?.name}
        updatingStageId={updatingStageId}
        onClose={() => {
          if (!updatingStageId) setStageSheetLead(null);
        }}
        onSelectStage={handleSelectStageFromList}
        onMarkWon={() => {
          if (!stageSheetLead) return;
          const target = stageSheetLead;
          setStageSheetLead(null);
          Alert.alert(
            'Mark as Won',
            `Confirm marking "${target.name}" as WON? Deals will be submitted for Operations approval.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Confirm Won',
                onPress: async () => {
                  try {
                    await crmApi.setOutcome(target.id, 'won');
                    loadData({ force: true });
                  } catch (err: any) {
                    Alert.alert('Error', err?.message || 'Could not mark won.');
                  }
                },
              },
            ]
          );
        }}
        onMarkLost={() => {
          if (!stageSheetLead) return;
          const target = stageSheetLead;
          setStageSheetLead(null);
          router.push({ pathname: '/pipeline/lead/[id]', params: { id: target.id } });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
    marginTop: 2,
  },
  topActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
  },
  viewModeContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    padding: 3,
    marginBottom: 8,
  },
  viewModeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 11,
  },
  viewModeBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  viewModeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  viewModeTextActive: {
    color: colors.indigo,
    fontWeight: '700',
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    maxWidth: '80%',
  },
  filterBtnActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  filterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  filterBtnTextActive: {
    color: colors.indigo,
  },
  clearFilterText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.indigo,
  },
  feedContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 130,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 10,
    fontWeight: '500',
  },
  deniedTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 16,
  },
  deniedSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 280,
    lineHeight: 18,
  },
  emptyBtn: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  emptyBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.indigo,
  },
  emptyBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.indigo,
  },
  emptyBtnPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: Platform.OS === 'ios' ? 96 : 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.indigo,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 30,
    elevation: 6,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  dealCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dealCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  dealTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  dealClient: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  dealValueBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  dealValueText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },
  dealMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  dealStageTag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dealStageText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'capitalize',
  },
  dealBillingTag: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  pendingApprovalTag: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 'auto',
  },
  pendingApprovalText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 11,
    color: '#BE123C',
    fontWeight: '600',
  },
  retryBtn: {
    backgroundColor: '#BE123C',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  retryText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
