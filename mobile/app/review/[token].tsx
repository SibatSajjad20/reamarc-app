import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL, colors } from '../../src/theme';

interface Attachment {
  id: string;
  filename: string;
  url: string;
  kind: string;
  size_bytes?: number;
}

interface ReviewItem {
  id: string;
  serial: string;
  client_name?: string | null;
  content_concept: string;
  post_copy?: string | null;
  primary_hook?: string | null;
  secondary_hook?: string | null;
  captions_hashtags?: string | null;
  platform?: string | null;
  creative_type?: string | null;
  stage: string;
  created_by_name?: string | null;
  assigned_to_name?: string | null;
  publish_date?: string | null;
  attachments?: Attachment[];
}

export default function MobileClientReviewScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const token = typeof params.token === 'string' ? params.token : '';

  const [item, setItem] = useState<ReviewItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeAssetIndex, setActiveAssetIndex] = useState(0);

  // Review interaction state
  const [reviewerName, setReviewerName] = useState('');
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');

  const loadItem = useCallback(async () => {
    if (!token) {
      setError('Invalid or missing review link.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/content-calendar/public/review/${token}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('This review link does not exist, has expired, or is invalid.');
        }
        throw new Error(`Failed to load review item (${res.status})`);
      }
      const data = await res.json();
      setItem(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to connect to review server');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadItem();
  }, [loadItem]);

  const handleApprove = async () => {
    if (!item) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/content-calendar/public/review/${token}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
          reviewer_name: reviewerName.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || 'Approval request failed');
      }

      setActionSuccess(data.message || 'Deliverable approved successfully!');
      if (data.new_stage) {
        setItem((prev) => (prev ? { ...prev, stage: data.new_stage } : prev));
      }
    } catch (err: unknown) {
      Alert.alert('Approval Error', err instanceof Error ? err.message : 'Could not submit approval');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestRevision = async () => {
    if (!revisionNote.trim()) {
      Alert.alert('Feedback Required', 'Please enter your revision feedback or requested changes.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/content-calendar/public/review/${token}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          action: 'revision',
          note: revisionNote.trim(),
          reviewer_name: reviewerName.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || 'Revision submission failed');
      }

      setActionSuccess(data.message || 'Feedback submitted to the production team!');
      setIsRevisionModalOpen(false);
      setRevisionNote('');
      if (data.new_stage) {
        setItem((prev) => (prev ? { ...prev, stage: data.new_stage } : prev));
      }
    } catch (err: unknown) {
      Alert.alert('Submission Error', err instanceof Error ? err.message : 'Could not submit feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isContentStage = Boolean(
    item &&
      ['Content', 'Content Internal Review', 'Content Client Review', 'Content Revision'].includes(
        item.stage,
      ),
  );

  const isPendingReview = Boolean(
    item && (item.stage === 'Content Client Review' || item.stage === 'Creative Client Review'),
  );

  const isApproved = Boolean(
    item &&
      ['Creative Production', 'Creative Internal Review', 'Ready to Post', 'Posted'].includes(
        item.stage,
      ),
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.indigo} />
        <Text style={styles.loadingText}>Loading campaign for review...</Text>
      </SafeAreaView>
    );
  }

  if (error || !item) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <View style={styles.errorCard}>
          <View style={styles.errorIconCircle}>
            <Ionicons name="alert-circle-outline" size={32} color={colors.rose} />
          </View>
          <Text style={styles.errorTitle}>Review Unavailable</Text>
          <Text style={styles.errorSubtitle}>{error || 'The requested item could not be found.'}</Text>
          <Pressable style={styles.retryButton} onPress={loadItem}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const assets = item.attachments || [];
  const activeAsset = assets[activeAssetIndex];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Top Navbar */}
      <View style={styles.navBar}>
        <View style={styles.navLeft}>
          <View style={styles.brandIcon}>
            <Text style={styles.brandIconText}>R</Text>
          </View>
          <View>
            <View style={styles.badgeRow}>
              <Text style={styles.clientLabel}>{item.client_name || 'Client Review'}</Text>
              <Text style={styles.dot}>•</Text>
              <Text style={styles.serialPill}>{item.serial}</Text>
            </View>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {item.content_concept}
            </Text>
          </View>
        </View>
        <View style={styles.secureBadge}>
          <Ionicons name="shield-checkmark" size={13} color={colors.indigo} />
          <Text style={styles.secureText}>Client</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Success Banner */}
        {Boolean(actionSuccess) && (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={20} color={colors.indigo} />
            <Text style={styles.successBannerText}>{actionSuccess}</Text>
          </View>
        )}

        {/* Status & Scheduled Details */}
        <View style={styles.card}>
          <View style={styles.stageHeader}>
            <Text style={styles.cardLabel}>Pipeline Status</Text>
            <View style={styles.stagePill}>
              <Text style={styles.stagePillText}>{item.stage}</Text>
            </View>
          </View>

          {isApproved && (
            <View style={styles.approvedNotice}>
              <Ionicons name="checkmark-circle" size={16} color={colors.indigo} />
              <Text style={styles.approvedNoticeText}>
                Approved! Deliverable is progressing in production.
              </Text>
            </View>
          )}

          {Boolean(item.publish_date) && (
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={14} color={colors.muted} />
              <Text style={styles.metaText}>
                Scheduled Publish: <Text style={styles.metaTextBold}>{item.publish_date}</Text>
              </Text>
            </View>
          )}

          {Boolean(item.platform) && (
            <View style={styles.metaRow}>
              <Ionicons name="globe-outline" size={14} color={colors.muted} />
              <Text style={styles.metaText}>
                Target Platform: <Text style={styles.metaTextBold}>{item.platform}</Text>
              </Text>
            </View>
          )}
        </View>

        {/* Option 2: Visual Deliverables Preview (Hidden during Content stages) */}
        {!isContentStage && assets.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.rowAlign}>
                <Ionicons name="images-outline" size={16} color={colors.indigo} />
                <Text style={[styles.cardLabel, { marginLeft: 6 }]}>
                  Visual Deliverables ({assets.length})
                </Text>
              </View>
              {Boolean(item.creative_type) && (
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{item.creative_type}</Text>
                </View>
              )}
            </View>

            {/* Main Asset Display */}
            {activeAsset && (
              <View style={styles.mediaContainer}>
                {activeAsset.kind === 'image' ? (
                  <Image
                    source={{ uri: activeAsset.url }}
                    style={styles.mediaImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.filePlaceholder}>
                    <Ionicons
                      name={activeAsset.kind === 'video' ? 'videocam-outline' : 'document-text-outline'}
                      size={40}
                      color={colors.indigo}
                    />
                    <Text style={styles.filenameText} numberOfLines={2}>
                      {activeAsset.filename}
                    </Text>
                    <Pressable
                      style={styles.openAssetBtn}
                      onPress={() => Linking.openURL(activeAsset.url)}
                    >
                      <Text style={styles.openAssetBtnText}>
                        {activeAsset.kind === 'video' ? 'Play / View Video' : 'Open Document'}
                      </Text>
                      <Ionicons name="open-outline" size={14} color="#FFFFFF" style={{ marginLeft: 4 }} />
                    </Pressable>
                  </View>
                )}
              </View>
            )}

            {/* Thumbnail Strip */}
            {assets.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbScroll}>
                {assets.map((asset, idx) => (
                  <Pressable
                    key={asset.id || idx}
                    onPress={() => setActiveAssetIndex(idx)}
                    style={[
                      styles.thumbItem,
                      activeAssetIndex === idx && styles.thumbItemActive,
                    ]}
                  >
                    {asset.kind === 'image' ? (
                      <Image source={{ uri: asset.url }} style={styles.thumbImage} />
                    ) : (
                      <View style={styles.thumbFallback}>
                        <Ionicons
                          name={asset.kind === 'video' ? 'videocam' : 'document'}
                          size={18}
                          color={colors.indigo}
                        />
                      </View>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* Option 2 Info Message if in Content stage */}
        {isContentStage && (
          <View style={styles.infoCallout}>
            <Ionicons name="information-circle-outline" size={18} color={colors.indigo} />
            <Text style={styles.infoCalloutText}>
              Creative media & visual production will begin right after content copy approval.
            </Text>
          </View>
        )}

        {/* Content Brief & Copy */}
        <View style={styles.card}>
          <View style={styles.rowAlign}>
            <Ionicons name="document-text-outline" size={16} color={colors.indigo} />
            <Text style={[styles.cardLabel, { marginLeft: 6 }]}>Content Details</Text>
          </View>

          {/* Primary Hook */}
          {Boolean(item.primary_hook) && (
            <View style={styles.hookBox}>
              <Text style={styles.hookLabel}>Primary Hook / Angle</Text>
              <Text style={styles.hookText}>"{item.primary_hook}"</Text>
            </View>
          )}

          {/* Secondary Hook */}
          {Boolean(item.secondary_hook) && (
            <View style={styles.secondaryHookBox}>
              <Text style={styles.hookLabel}>Alternative Hook</Text>
              <Text style={styles.secondaryHookText}>"{item.secondary_hook}"</Text>
            </View>
          )}

          {/* Post Copy / Caption */}
          {Boolean(item.post_copy) && (
            <View style={styles.copySection}>
              <Text style={styles.hookLabel}>Post Caption / Copy</Text>
              <View style={styles.copyContainer}>
                <Text style={styles.copyText}>{item.post_copy}</Text>
              </View>
            </View>
          )}

          {/* Hashtags */}
          {Boolean(item.captions_hashtags) && (
            <View style={styles.hashtagSection}>
              <Text style={styles.hookLabel}>Hashtags & Tags</Text>
              <View style={styles.hashtagBox}>
                <Text style={styles.hashtagText}>{item.captions_hashtags}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Client Decision Action Box */}
        <View style={styles.card}>
          <Text style={styles.actionCardTitle}>
            {isPendingReview ? 'Client Action Required' : 'Review & Decision'}
          </Text>
          <Text style={styles.actionCardSub}>
            Please review the material above and confirm approval or request any edits.
          </Text>

          {/* Reviewer Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Your Name (Optional)</Text>
            <TextInput
              style={styles.textInput}
              value={reviewerName}
              onChangeText={setReviewerName}
              placeholder="e.g. Sarah Jenkins"
              placeholderTextColor={colors.muted}
            />
          </View>

          {/* Approve Button */}
          <Pressable
            style={[styles.approveBtn, isSubmitting && styles.btnDisabled]}
            disabled={isSubmitting}
            onPress={handleApprove}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                <Text style={styles.approveBtnText}>
                  {item.stage === 'Content Client Review'
                    ? 'Approve Content Copy'
                    : item.stage === 'Creative Client Review'
                    ? 'Approve Creative & Visuals'
                    : 'Approve Campaign'}
                </Text>
              </>
            )}
          </Pressable>

          {/* Request Changes Button */}
          <Pressable
            style={[styles.revisionBtn, isSubmitting && styles.btnDisabled]}
            disabled={isSubmitting}
            onPress={() => setIsRevisionModalOpen(true)}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.rose} />
            <Text style={styles.revisionBtnText}>Request Changes / Revision</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Revision Modal */}
      <Modal
        visible={isRevisionModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsRevisionModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.rowAlign}>
                <Ionicons name="create-outline" size={20} color={colors.rose} />
                <Text style={[styles.modalTitle, { marginLeft: 8 }]}>Request Changes</Text>
              </View>
              <Pressable onPress={() => setIsRevisionModalOpen(false)}>
                <Ionicons name="close" size={22} color={colors.muted} />
              </Pressable>
            </View>

            <Text style={styles.modalDescription}>
              Please describe the changes or corrections you would like our team to make:
            </Text>

            <TextInput
              style={styles.textArea}
              value={revisionNote}
              onChangeText={setRevisionNote}
              placeholder="e.g., Please change the offer in the second paragraph, or make the logo larger..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setIsRevisionModalOpen(false)}
                disabled={isSubmitting}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.modalSubmitBtn, isSubmitting && styles.btnDisabled]}
                onPress={handleRequestRevision}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Submit Revision</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.muted,
    fontWeight: '500',
  },
  errorCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: colors.line,
  },
  errorIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFE4E6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  errorSubtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  retryButton: {
    backgroundColor: colors.indigo,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  navLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.indigo,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  brandIconText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clientLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.indigo,
    textTransform: 'uppercase',
  },
  dot: {
    marginHorizontal: 4,
    color: colors.muted,
    fontSize: 10,
  },
  serialPill: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginTop: 1,
  },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    gap: 4,
  },
  secureText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.indigo,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 8,
  },
  successBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#1E40AF',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  stageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stagePill: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  stagePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.indigo,
  },
  approvedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    padding: 10,
    borderRadius: 12,
    marginTop: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 6,
  },
  approvedNoticeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E40AF',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  metaText: {
    fontSize: 12,
    color: colors.muted,
  },
  metaTextBold: {
    fontWeight: '600',
    color: colors.text,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rowAlign: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.indigo,
  },
  mediaContainer: {
    backgroundColor: '#000000',
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 220,
    maxHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaImage: {
    width: '100%',
    height: 280,
  },
  filePlaceholder: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filenameText: {
    color: '#D4D4D8',
    fontSize: 13,
    marginTop: 8,
    marginBottom: 14,
    textAlign: 'center',
  },
  openAssetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.indigo,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  openAssetBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  thumbScroll: {
    marginTop: 10,
  },
  thumbItem: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: 'hidden',
    marginRight: 8,
    borderWidth: 2,
    borderColor: colors.line,
  },
  thumbItemActive: {
    borderColor: colors.indigo,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  infoCalloutText: {
    flex: 1,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  hookBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.indigo,
  },
  hookLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  hookText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    fontStyle: 'italic',
  },
  secondaryHookBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#93C5FD',
  },
  secondaryHookText: {
    fontSize: 13,
    color: colors.slate,
    fontStyle: 'italic',
  },
  copySection: {
    marginTop: 12,
  },
  copyContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  copyText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text,
  },
  hashtagSection: {
    marginTop: 12,
  },
  hashtagBox: {
    backgroundColor: '#F4F4F5',
    borderRadius: 10,
    padding: 10,
  },
  hashtagText: {
    fontSize: 12,
    color: colors.indigo,
    fontWeight: '500',
  },
  actionCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  actionCardSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    marginBottom: 14,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.text,
  },
  approveBtn: {
    backgroundColor: colors.indigo,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  approveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  revisionBtn: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  revisionBtnText: {
    color: colors.rose,
    fontWeight: '700',
    fontSize: 13,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  modalDescription: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 14,
    lineHeight: 18,
  },
  textArea: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    fontSize: 13,
    color: colors.text,
    minHeight: 100,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F4F5',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  modalSubmitBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.rose,
  },
  modalSubmitBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
