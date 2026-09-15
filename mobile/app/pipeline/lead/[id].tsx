import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../../src/theme';
import { useAuth } from '../../../src/context/AuthContext';
import { canAccessCrm } from '../../../src/lib/roles';
import { crmApi } from '../../../src/lib/crmApi';
import type {
  CrmDeal,
  CrmDealCreatePayload,
  CrmLeadDetail,
  CrmPipelineStage,
  CrmTemplate,
} from '../../../src/types/crm';
import { CallLogModal } from '../../../src/components/crm/CallLogModal';
import { LostReasonModal } from '../../../src/components/crm/LostReasonModal';
import { DealModal } from '../../../src/components/crm/DealModal';
import { StageSheet } from '../../../src/components/crm/StageSheet';
import { FollowUpSheet } from '../../../src/components/crm/FollowUpSheet';
import { WhatsAppTemplateSheet } from '../../../src/components/crm/WhatsAppTemplateSheet';
import { openWhatsApp } from '../../../src/lib/whatsapp';
import {
  formatCrmStage,
  formatFollowUp,
  formatPhoneDisplay,
  getOutreachStatus,
  relativeTime,
  titleCaseName,
} from '../../../src/ui/format';
import { PipelineLeadDetailSkeleton } from '../../../src/ui/Skeleton';
import {
  getCachedLeadDetail,
  getCachedPipeline,
  isCrmCacheStale,
  setCachedLeadDetail,
  setCachedPipeline,
  updateCachedLeadStage,
} from '../../../src/lib/crmCache';

const OUTREACH_COLOR = {
  muted: colors.muted,
  amber: colors.amber,
  emerald: colors.emerald,
} as const;

function Field({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

export default function LeadDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const hasAccess = canAccessCrm(user);

  const [lead, setLead] = useState<CrmLeadDetail | null>(null);
  const [stages, setStages] = useState<CrmPipelineStage[]>([]);
  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'deals' | 'timeline'>('overview');

  const [newNote, setNewNote] = useState('');
  const [postingNote, setPostingNote] = useState(false);

  const [stageSheetOpen, setStageSheetOpen] = useState(false);
  const [followUpSheetOpen, setFollowUpSheetOpen] = useState(false);
  const [waSheetOpen, setWaSheetOpen] = useState(false);
  const [templates, setTemplates] = useState<CrmTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [dealModalOpen, setDealModalOpen] = useState(false);
  const [callLogOpen, setCallLogOpen] = useState(false);
  const [updatingStageId, setUpdatingStageId] = useState<string | null>(null);
  const isUpdatingStageRef = useRef(false);

  // Safety watchdog: ensure loading never gets permanently stuck
  useEffect(() => {
    if (!loading) return;
    const watchdog = setTimeout(() => {
      setLoading(false);
    }, 6000);
    return () => clearTimeout(watchdog);
  }, [loading]);

  const loadLead = useCallback(async (opts?: { force?: boolean }) => {
    if (!id || !hasAccess) return;

    // Cache-first paint
    if (!opts?.force) {
      const cached = getCachedLeadDetail(id);
      if (cached) {
        setLead(cached.data);
        setLoading(false);
      }
      const cachedPipe = getCachedPipeline();
      if (cachedPipe?.data.stages?.length) {
        setStages(cachedPipe.data.stages);
      }
    }

    try {
      const cachedPipe = getCachedPipeline();
      const pipeFresh = cachedPipe && !isCrmCacheStale(cachedPipe) && !opts?.force;

      const [data, pipe, dealRes] = await Promise.all([
        crmApi.getLead(id),
        pipeFresh
          ? Promise.resolve(cachedPipe!.data.stages)
          : crmApi.getPipeline().catch(() => cachedPipe?.data.stages || []),
        crmApi.listDeals({ lead_id: id }).catch(() => ({ deals: [], total_count: 0, total_value: 0 })),
      ]);
      setLead(data);
      setStages(pipe);
      setDeals(dealRes.deals || []);
      setCachedLeadDetail(id, data);
      if (!pipeFresh && Array.isArray(pipe)) {
        setCachedPipeline({
          stages: pipe,
          dealStages: cachedPipe?.data.dealStages || [],
        });
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not load lead.');
    } finally {
      setLoading(false);
    }
  }, [id, hasAccess]);

  useEffect(() => {
    loadLead();
  }, [loadLead]);

  const openWhatsAppSheet = async () => {
    if (!lead || !lead.phone_valid || !lead.phone_e164) {
      Alert.alert('Invalid Phone', 'This lead does not have a valid phone number.');
      return;
    }
    setWaSheetOpen(true);
    if (templates.length === 0) {
      setTemplatesLoading(true);
      try {
        const list = await crmApi.listTemplates();
        setTemplates(list);
      } catch {
        setTemplates([]);
      } finally {
        setTemplatesLoading(false);
      }
    }
  };

  const handleWhatsAppSelect = async (templateId: string | null) => {
    if (!lead || !lead.phone_e164) return;
    setWaSheetOpen(false);
    try {
      if (templateId === null) {
        // Chat only — still log outreach, open without prefilled text
        await crmApi.logWhatsappOpened(lead.id);
        setLead((prev) => (prev ? { ...prev, whatsapp_opened_at: new Date().toISOString() } : prev));
        await openWhatsApp({ phoneE164: lead.phone_e164, text: '' });
        loadLead();
        return;
      }

      const res = await crmApi.logWhatsappOpened(lead.id, templateId);
      setLead((prev) => (prev ? { ...prev, whatsapp_opened_at: new Date().toISOString() } : prev));
      await openWhatsApp({
        phoneE164: lead.phone_e164,
        waUrl: res.wa_url,
        text: res.rendered_text,
      });
      loadLead();
    } catch (err: any) {
      Alert.alert('WhatsApp Error', err?.message || 'Could not initiate WhatsApp.');
    }
  };

  const handleSetFollowUp = async (iso: string | null) => {
    if (!lead) return;
    try {
      const updated = await crmApi.setFollowUp(lead.id, iso);
      setLead((prev) => (prev ? { ...prev, ...updated } : prev));
      loadLead();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not update follow-up.');
      throw err;
    }
  };

  const handleCall = async () => {
    if (!lead?.phone_e164) {
      Alert.alert('No Phone', 'This lead does not have a valid phone number.');
      return;
    }
    const cleanPhone = lead.phone_e164.replace(/\D/g, '');
    try {
      await Linking.openURL(`tel:+${cleanPhone}`);
      setCallLogOpen(true);
    } catch (err: any) {
      Alert.alert('Call Error', err?.message || 'Could not open phone dialer.');
    }
  };

  const handleSaveCallLog = async (outcome: string, note?: string) => {
    if (!lead) return;
    try {
      const outcomeNote = `[Call: ${outcome.replace(/_/g, ' ')}] ${note || ''}`.trim();
      await crmApi.addNote(lead.id, outcomeNote);
      if (outcome === 'connected') {
        await crmApi.markContacted(lead.id);
      }
      loadLead();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not log call.');
    }
  };

  const handleMarkContacted = async () => {
    if (!lead) return;
    try {
      await crmApi.markContacted(lead.id);
      setLead((prev) => (prev ? { ...prev, contacted: true } : prev));
      loadLead();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not mark contacted.');
    }
  };

  const handleClaim = async () => {
    if (!lead) return;
    try {
      const updated = await crmApi.claimLead(lead.id);
      setLead((prev) => (prev ? { ...prev, ...updated } : prev));
      Alert.alert('Claimed', 'You have claimed this lead.');
      loadLead();
    } catch (err: any) {
      Alert.alert('Claim Failed', err?.message || 'Could not claim lead.');
    }
  };

  const doExecuteStageChange = async (newStage: string, currentLead: NonNullable<typeof lead>) => {
    if (isUpdatingStageRef.current) return;
    isUpdatingStageRef.current = true;
    setUpdatingStageId(newStage);
    setStageSheetOpen(false);
    const previousStage = currentLead.stage;

    // 1. Optimistic UI update
    setLead((prev) => (prev ? { ...prev, stage: newStage } : prev));
    updateCachedLeadStage(currentLead.id, newStage);

    try {
      // 2. Persist to backend without triggering full 3-call reload
      const updated = await crmApi.updateLead(currentLead.id, { stage: newStage });
      setLead((prev) => (prev ? { ...prev, ...updated } : prev));
      setCachedLeadDetail(currentLead.id, {
        ...currentLead,
        ...updated,
        stage: newStage,
      });
    } catch (err: any) {
      // 3. Rollback on failure
      setLead((prev) => (prev ? { ...prev, stage: previousStage } : prev));
      updateCachedLeadStage(currentLead.id, previousStage);
      Alert.alert(
        'Update Failed',
        err?.message || 'Could not update stage. Please try again.'
      );
    } finally {
      isUpdatingStageRef.current = false;
      setUpdatingStageId(null);
    }
  };

  const handleRequestChangeStage = useCallback(
    (newStage: string, stageName?: string) => {
      if (!lead || isUpdatingStageRef.current) return;
      if (newStage === lead.stage) {
        setStageSheetOpen(false);
        return;
      }
      const targetName = stageName || formatCrmStage(newStage);
      Alert.alert(
        'Change Stage',
        `Move ${lead.name} to ${targetName}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Move Stage',
            onPress: () => doExecuteStageChange(newStage, lead),
          },
        ]
      );
    },
    [lead]
  );

  const handleMarkWon = async () => {
    if (!lead) return;
    setStageSheetOpen(false);
    Alert.alert(
      'Mark as won',
      'Commercial deals will be submitted for Operations approval.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await crmApi.setOutcome(lead.id, 'won');
              loadLead({ force: true });
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Could not mark won.');
            }
          },
        },
      ]
    );
  };

  const handleMarkLost = async (reason: string, note?: string) => {
    if (!lead) return;
    try {
      await crmApi.setOutcome(lead.id, 'lost', reason, note);
      loadLead({ force: true });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not mark lost.');
    }
  };

  const handleAddNote = async () => {
    if (!lead || !newNote.trim()) return;
    setPostingNote(true);
    try {
      await crmApi.addNote(lead.id, newNote.trim());
      setNewNote('');
      loadLead({ force: true });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not post note.');
    } finally {
      setPostingNote(false);
    }
  };

  const handleCreateDeal = async (payload: CrmDealCreatePayload) => {
    if (!lead) return;
    await crmApi.createDeal(lead.id, payload);
    loadLead({ force: true });
  };

  if (!hasAccess) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <Text style={styles.deniedTitle}>Access restricted</Text>
      </SafeAreaView>
    );
  }

  if (loading || !lead) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <PipelineLeadDetailSkeleton />
      </SafeAreaView>
    );
  }

  const outreach = getOutreachStatus(lead);
  const displayName = titleCaseName(lead.name);
  const stageLabel = lead.outcome
    ? String(lead.outcome).toUpperCase()
    : formatCrmStage(lead.stage);
  const isUnassigned = !lead.assigned_to;
  const activities = lead.activities || [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.topBarTitleContainer}>
            <Text style={styles.topBarTitle} numberOfLines={1}>
              {displayName}
            </Text>
            {lead.company ? (
              <Text style={styles.topBarSubtitle} numberOfLines={1}>
                {lead.company}
              </Text>
            ) : null}
          </View>

          <TouchableOpacity
            style={styles.stagePickerBtn}
            onPress={() => setStageSheetOpen(true)}
          >
            <Text style={styles.stagePickerText} numberOfLines={1}>
              {stageLabel}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.indigo} />
          </TouchableOpacity>
        </View>

        <View style={styles.tabBar}>
          {(
            [
              { id: 'overview' as const, label: 'Overview', icon: 'information-circle-outline' },
              { id: 'deals' as const, label: `Deals (${deals.length})`, icon: 'briefcase-outline' },
              {
                id: 'timeline' as const,
                label: `Timeline (${activities.length})`,
                icon: 'time-outline',
              },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tabItem, active ? styles.tabItemActive : null]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Ionicons
                  name={tab.icon}
                  size={16}
                  color={active ? colors.indigo : colors.muted}
                />
                <Text style={[styles.tabItemText, active ? styles.tabItemTextActive : null]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <ScrollView
          style={styles.bodyScroll}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
        >
          {activeTab === 'overview' && (
            <View style={styles.sectionContainer}>
              <View style={styles.infoCard}>
                <Text style={styles.cardHeader}>Contact</Text>
                <Field label="Phone" value={formatPhoneDisplay(lead.phone_e164 || lead.phone_raw)} />
                <Field label="Email" value={lead.email || '—'} />
                <Field label="City" value={lead.city || '—'} />
              </View>

              <View style={styles.infoCard}>
                <Text style={styles.cardHeader}>Requirement</Text>
                <Field label="Service" value={lead.service || '—'} />
                <Field
                  label="Source"
                  value={lead.source ? titleCaseName(lead.source) : 'Manual'}
                />
                <Field
                  label="Assigned to"
                  value={lead.assigned_to_name || 'Unassigned'}
                />
                <Field
                  label="Outreach"
                  value={outreach.label}
                  valueColor={OUTREACH_COLOR[outreach.tone]}
                />
              </View>

              <View style={styles.infoCard}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardHeader}>Follow-up</Text>
                  <TouchableOpacity
                    style={styles.inlineAction}
                    onPress={() => setFollowUpSheetOpen(true)}
                  >
                    <Ionicons name="calendar-outline" size={14} color={colors.indigo} />
                    <Text style={styles.inlineActionText}>
                      {lead.next_follow_up_at ? 'Change' : 'Set'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Field
                  label="Next follow-up"
                  value={formatFollowUp(lead.next_follow_up_at)}
                />
                <Field
                  label="Last activity"
                  value={lead.last_activity_at ? relativeTime(lead.last_activity_at) || '—' : '—'}
                />
              </View>
            </View>
          )}

          {activeTab === 'deals' && (
            <View style={styles.sectionContainer}>
              <TouchableOpacity style={styles.addDealBtn} onPress={() => setDealModalOpen(true)}>
                <Ionicons name="add-circle" size={18} color={colors.indigo} />
                <Text style={styles.addDealText}>Create deal</Text>
              </TouchableOpacity>

              {deals.map((d) => (
                <View key={d.id} style={styles.dealCardItem}>
                  <View style={styles.dealItemHeader}>
                    <Text style={styles.dealItemTitle}>{d.title}</Text>
                    <Text style={styles.dealItemValue}>
                      ${d.value?.toLocaleString()} {d.currency}
                    </Text>
                  </View>
                  <View style={styles.dealItemMeta}>
                    <Text style={styles.dealItemStage}>{formatCrmStage(d.stage)}</Text>
                    <Text style={styles.dealItemBilling}>
                      {d.billing_type === 'retainer' ? 'Retainer' : 'Project'}
                    </Text>
                    {d.approval_status === 'pending_operations' ? (
                      <Text style={styles.dealPendingText}>Pending ops</Text>
                    ) : null}
                  </View>
                </View>
              ))}

              {deals.length === 0 ? (
                <View style={styles.emptyTabBox}>
                  <Ionicons name="briefcase-outline" size={32} color={colors.muted} />
                  <Text style={styles.emptyTabText}>No deals yet. Create one when ready.</Text>
                </View>
              ) : null}
            </View>
          )}

          {activeTab === 'timeline' && (
            <View style={styles.sectionContainer}>
              <View style={styles.noteComposer}>
                <TextInput
                  style={styles.noteInput}
                  placeholder="Add a note, call summary, or next action..."
                  placeholderTextColor={colors.muted}
                  multiline
                  value={newNote}
                  onChangeText={setNewNote}
                />
                <TouchableOpacity
                  style={[
                    styles.notePostBtn,
                    !newNote.trim() || postingNote ? styles.disabledBtn : null,
                  ]}
                  onPress={handleAddNote}
                  disabled={!newNote.trim() || postingNote}
                >
                  {postingNote ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="send" size={16} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.activityFeed}>
                {activities.map((act, index) => (
                  <View key={act.id} style={styles.activityItem}>
                    <View style={styles.timelineRail}>
                      <View style={styles.activityDot} />
                      {index < activities.length - 1 ? <View style={styles.timelineLine} /> : null}
                    </View>
                    <View style={styles.activityBody}>
                      <View style={styles.activityHeaderRow}>
                        <Text style={styles.activityActor} numberOfLines={1}>
                          {act.actor_name || 'System'}
                        </Text>
                        <Text style={styles.activityTime}>{relativeTime(act.created_at)}</Text>
                      </View>
                      <Text style={styles.activityText}>{act.body}</Text>
                    </View>
                  </View>
                ))}
                {activities.length === 0 ? (
                  <View style={styles.emptyTabBox}>
                    <Ionicons name="time-outline" size={32} color={colors.muted} />
                    <Text style={styles.emptyTabText}>No activity yet.</Text>
                    <Text style={styles.emptyTabHint}>
                      Log a note, call summary, or next action above to start tracking this lead.
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          )}
        </ScrollView>

        <View style={styles.bottomBar}>
          {isUnassigned ? (
            <TouchableOpacity style={styles.claimHeroBtn} onPress={handleClaim}>
              <Ionicons name="hand-right" size={18} color="#FFFFFF" />
              <Text style={styles.heroBtnText}>Claim lead</Text>
            </TouchableOpacity>
          ) : (
            <>
              {!lead.contacted ? (
                <TouchableOpacity style={styles.markContactedBtn} onPress={handleMarkContacted}>
                  <Ionicons name="checkmark-done" size={16} color={colors.slate} />
                  <Text style={styles.markContactedText}>Mark contacted</Text>
                </TouchableOpacity>
              ) : null}

              <View style={styles.primaryActions}>
                {lead.phone_valid ? (
                  <TouchableOpacity style={styles.whatsappHeroBtn} onPress={openWhatsAppSheet}>
                    <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
                    <Text style={styles.heroBtnText}>WhatsApp</Text>
                  </TouchableOpacity>
                ) : null}

                {lead.phone_e164 ? (
                  <TouchableOpacity style={styles.callHeroBtn} onPress={handleCall}>
                    <Ionicons name="call" size={18} color="#FFFFFF" />
                    <Text style={styles.heroBtnText}>Call</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </>
          )}
        </View>

        <StageSheet
          visible={stageSheetOpen}
          stages={stages}
          currentStage={lead.stage}
          outcome={lead.outcome}
          leadName={lead.name}
          updatingStageId={updatingStageId}
          onClose={() => {
            if (!updatingStageId) setStageSheetOpen(false);
          }}
          onSelectStage={handleRequestChangeStage}
          onMarkWon={handleMarkWon}
          onMarkLost={() => {
            setStageSheetOpen(false);
            setLostModalOpen(true);
          }}
        />

        <FollowUpSheet
          visible={followUpSheetOpen}
          currentFollowUp={lead.next_follow_up_at}
          onClose={() => setFollowUpSheetOpen(false)}
          onSave={handleSetFollowUp}
        />

        <WhatsAppTemplateSheet
          visible={waSheetOpen}
          templates={templates}
          loading={templatesLoading}
          leadName={displayName}
          onClose={() => setWaSheetOpen(false)}
          onSelect={handleWhatsAppSelect}
        />

        <CallLogModal
          visible={callLogOpen}
          lead={lead}
          onClose={() => setCallLogOpen(false)}
          onLogOutcome={handleSaveCallLog}
        />

        <LostReasonModal
          visible={lostModalOpen}
          onClose={() => setLostModalOpen(false)}
          onSubmit={handleMarkLost}
        />

        <DealModal
          visible={dealModalOpen}
          leadName={lead.name}
          onClose={() => setDealModalOpen(false)}
          onSubmit={handleCreateDeal}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.bg,
  },
  loadingText: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 12,
  },
  deniedTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.card,
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  topBarTitleContainer: {
    flex: 1,
    minWidth: 0,
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  topBarSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 1,
  },
  stagePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    maxWidth: 120,
  },
  stagePickerText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.indigo,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: colors.indigo,
  },
  tabItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  tabItemTextActive: {
    color: colors.indigo,
    fontWeight: '700',
  },
  bodyScroll: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
    paddingBottom: 24,
  },
  sectionContainer: {
    gap: 12,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  cardHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inlineAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  inlineActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.indigo,
  },
  field: {
    gap: 2,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.muted,
  },
  fieldValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  addDealBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  addDealText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.indigo,
  },
  dealCardItem: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dealItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  dealItemTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  dealItemValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.emerald,
  },
  dealItemMeta: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dealItemStage: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  dealItemBilling: {
    fontSize: 11,
    color: colors.muted,
  },
  dealPendingText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.amber,
    marginLeft: 'auto',
  },
  emptyTabBox: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 6,
    paddingHorizontal: 24,
  },
  emptyTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.slate,
    textAlign: 'center',
  },
  emptyTabHint: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 260,
  },
  noteComposer: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'flex-end',
    gap: 8,
  },
  noteInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 90,
    fontSize: 14,
    color: colors.text,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  notePostBtn: {
    backgroundColor: colors.indigo,
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: {
    opacity: 0.5,
  },
  activityFeed: {
    marginTop: 4,
    gap: 0,
  },
  activityItem: {
    flexDirection: 'row',
    gap: 12,
    minHeight: 56,
  },
  timelineRail: {
    width: 12,
    alignItems: 'center',
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.indigo,
    marginTop: 6,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.line,
    marginTop: 4,
    marginBottom: 0,
  },
  activityBody: {
    flex: 1,
    paddingBottom: 16,
  },
  activityHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 2,
  },
  activityActor: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  activityTime: {
    fontSize: 11,
    color: colors.muted,
  },
  activityText: {
    fontSize: 13,
    color: colors.slate,
    lineHeight: 18,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 12 : 10,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: 8,
  },
  markContactedBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  markContactedText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.slate,
  },
  primaryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  claimHeroBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.amber,
    paddingVertical: 14,
    borderRadius: 14,
  },
  whatsappHeroBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.emerald,
    paddingVertical: 14,
    borderRadius: 14,
  },
  callHeroBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.indigo,
    paddingVertical: 14,
    borderRadius: 14,
  },
  heroBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
