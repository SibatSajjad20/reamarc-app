import React, { useCallback, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Check, Copy, ExternalLink, RotateCcw, Share2, Undo2 } from 'lucide-react-native';
import { api } from '../../src/lib/api';
import { invalidateModuleCache } from '../../src/lib/moduleCache';
import { isGenericFileIcon } from '../../src/lib/mediaUrl';
import { useTheme } from '../../src/theme';
import { AuthImage } from '../../src/ui/AuthImage';
import { Card } from '../../src/ui/Card';
import { TaskListSkeleton } from '../../src/ui/Skeleton';
import { useTabBarOffset } from '../../src/ui/layout';

interface CreativeAsset {
  id: string;
  url: string;
  filename: string;
  kind?: string;
  thumbnail_url?: string | null;
  google_drive_url?: string | null;
}

interface ContentCalendarDetail {
  id: string;
  serial?: string;
  client_name?: string;
  content_concept: string;
  stage: string;
  creative_category?: string;
  content_type?: string;
  primary_text?: string;
  headlines_hooks?: string;
  captions_hashtags?: string;
  production_direction?: string;
  design_due?: string;
  publish_date?: string;
  channels?: string[];
  revision_note?: string;
  share_token?: string;
  attachments?: CreativeAsset[];
}

const WORKFLOW_ACTIONS: {
  action: string;
  label: string;
  hint: string;
  tone: 'primary' | 'muted' | 'success' | 'warn';
}[] = [
  { action: 'approve', label: 'Approve stage', hint: 'Move this brief forward', tone: 'primary' },
  { action: 'request_revision', label: 'Request revision', hint: 'Send notes back to production', tone: 'warn' },
  { action: 'send_back', label: 'Send back', hint: 'Return to the previous stage', tone: 'muted' },
  { action: 'post', label: 'Mark as posted', hint: 'Confirm this brief is live', tone: 'success' },
];

function previewFor(att: CreativeAsset): string {
  if (att.thumbnail_url && !isGenericFileIcon(att.thumbnail_url)) return att.thumbnail_url;
  if (att.kind === 'image' || /\.(jpe?g|png|webp|gif)$/i.test(att.filename || att.url || '')) {
    return att.thumbnail_url || att.url;
  }
  if (att.kind === 'video' || /\.(mp4|mov|webm|m4v)$/i.test(att.filename || att.url || '')) {
    return att.thumbnail_url || att.url;
  }
  return '';
}

export default function ContentCalendarDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const tabOffset = useTabBarOffset();
  const [item, setItem] = useState<ContentCalendarDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [movingStage, setMovingStage] = useState(false);

  const loadItem = useCallback(async () => {
    if (!id) return;
    try {
      setItem(await api<ContentCalendarDetail>(`/content-calendar/${id}`));
    } catch (err: any) {
      Alert.alert('Load Error', err?.message || 'Could not fetch creative brief');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void loadItem();
    }, [loadItem]),
  );

  const handleShareReview = async () => {
    if (!item?.share_token) {
      Alert.alert('No Share Link', 'This item does not have a client review link.');
      return;
    }
    const reviewUrl = `https://oneworklane.com/review/${item.share_token}`;
    try {
      await Share.share({
        title: `Client Review - ${item.serial || item.content_concept}`,
        message: `Please review the creative brief for ${item.client_name || 'OneWorkLane'}: ${reviewUrl}`,
        url: reviewUrl,
      });
    } catch {
      /* ignore */
    }
  };

  const handleShareCaptions = async () => {
    if (!item?.captions_hashtags) return;
    try {
      await Share.share({
        title: `Captions - ${item.serial || 'OneWorkLane'}`,
        message: item.captions_hashtags,
      });
    } catch {
      /* ignore */
    }
  };

  const handleMoveStage = (action: string, actionLabel: string) => {
    Alert.alert(actionLabel, `Run “${actionLabel}” on this brief?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          try {
            setMovingStage(true);
            const updated = await api<ContentCalendarDetail>(`/content-calendar/${id}/stage`, {
              method: 'PATCH',
              body: JSON.stringify({ action }),
            });
            setItem(updated);
            invalidateModuleCache('content-calendar');
          } catch (err: any) {
            Alert.alert('Update Failed', err?.message || 'Could not update stage');
          } finally {
            setMovingStage(false);
          }
        },
      },
    ]);
  };

  const actionColors = (tone: 'primary' | 'muted' | 'success' | 'warn') => {
    if (tone === 'primary') return { bg: '#EEF2FF', fg: '#4338CA', border: '#C7D2FE', icon: Check };
    if (tone === 'success') return { bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0', icon: Check };
    if (tone === 'warn') return { bg: '#FFF7ED', fg: '#C2410C', border: '#FED7AA', icon: RotateCcw };
    return { bg: '#F8FAFC', fg: '#475569', border: '#E2E8F0', icon: Undo2 };
  };

  if (loading && !item) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <TaskListSkeleton rows={4} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={{ color: theme.textMuted }}>Brief not found.</Text>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const channels = (item.channels || []).slice(0, 4);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={[styles.pad, { paddingBottom: tabOffset }]}
    >
      <Text style={[styles.serial, { color: theme.textMuted }]}>{item.serial || 'BRIEF'}</Text>
      <Text style={[styles.title, { color: theme.text }]}>{item.content_concept}</Text>
      <View style={styles.pills}>
        <View style={[styles.pill, { backgroundColor: theme.primaryLight }]}>
          <Text style={[styles.pillText, { color: theme.primary }]} numberOfLines={1}>
            {item.stage}
          </Text>
        </View>
        {item.creative_category ? (
          <View style={[styles.pill, { backgroundColor: theme.bgSubtle }]}>
            <Text style={[styles.pillText, { color: theme.textMuted }]} numberOfLines={1}>
              {item.creative_category}
            </Text>
          </View>
        ) : null}
      </View>

      <Card style={styles.card}>
        <Text style={[styles.label, { color: theme.textMuted }]}>Client</Text>
        <Text style={[styles.value, { color: theme.text }]} numberOfLines={2}>
          {item.client_name || '—'}
        </Text>
        <View style={styles.datesRow}>
          <View style={styles.dateCol}>
            <Text style={[styles.label, { color: theme.textMuted }]}>Publish</Text>
            <Text style={[styles.value, { color: theme.text }]}>{item.publish_date || '—'}</Text>
          </View>
          <View style={styles.dateCol}>
            <Text style={[styles.label, { color: theme.textMuted }]}>Design due</Text>
            <Text style={[styles.value, { color: theme.text }]}>{item.design_due || '—'}</Text>
          </View>
        </View>
        {channels.length ? (
          <Text style={[styles.metaLine, { color: theme.textMuted }]} numberOfLines={1}>
            {channels.join(' · ')}
          </Text>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <Text style={[styles.section, { color: theme.text }]}>Workflow</Text>
        <Text style={[styles.hint, { color: theme.textMuted }]}>Move this brief through production.</Text>
        <View style={styles.workflowList}>
          {WORKFLOW_ACTIONS.map((sa) => {
            const tone = actionColors(sa.tone);
            const Icon = tone.icon;
            return (
              <Pressable
                key={sa.action}
                disabled={movingStage}
                onPress={() => handleMoveStage(sa.action, sa.label)}
                style={[
                  styles.actionBtn,
                  {
                    backgroundColor: tone.bg,
                    borderColor: tone.border,
                    opacity: movingStage ? 0.6 : 1,
                  },
                ]}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#ffffff' }]}>
                  <Icon size={16} color={tone.fg} />
                </View>
                <View style={styles.actionCopy}>
                  <Text style={[styles.actionBtnText, { color: tone.fg }]}>{sa.label}</Text>
                  <Text style={[styles.actionHint, { color: theme.textMuted }]}>{sa.hint}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        {item.share_token ? (
          <Pressable
            onPress={handleShareReview}
            style={[styles.shareBtn, { borderColor: '#DDD6FE', backgroundColor: '#F5F3FF' }]}
          >
            <Share2 size={16} color={theme.primary} />
            <Text style={[styles.shareBtnText, { color: theme.primary }]} numberOfLines={1}>
              Share client review link
            </Text>
          </Pressable>
        ) : null}
      </Card>

      {item.attachments && item.attachments.length > 0 ? (
        <Card style={styles.card}>
          <Text style={[styles.section, { color: theme.text }]}>
            Assets · {item.attachments.length}
          </Text>
          <View style={styles.assets}>
            {item.attachments.map((att) => {
              const preview = previewFor(att);
              const openUrl = att.google_drive_url || att.url;
              return (
                <Pressable
                  key={att.id}
                  onPress={() => {
                    if (openUrl) void Linking.openURL(openUrl.startsWith('http') ? openUrl : `https://${openUrl}`);
                  }}
                  style={[styles.assetRow, { borderColor: theme.border, backgroundColor: theme.bgSubtle }]}
                >
                  <AuthImage uri={preview} width={200} style={styles.assetThumb} wrapStyle={styles.assetThumb} />
                  <View style={styles.assetInfo}>
                    <Text style={[styles.assetName, { color: theme.text }]} numberOfLines={1}>
                      {att.filename || 'Asset'}
                    </Text>
                    <Text style={[styles.assetKind, { color: theme.textMuted }]} numberOfLines={1}>
                      {att.google_drive_url ? 'Google Drive' : att.kind || 'File'}
                    </Text>
                  </View>
                  <ExternalLink size={16} color={theme.textMuted} />
                </Pressable>
              );
            })}
          </View>
        </Card>
      ) : null}

      {item.headlines_hooks ? (
        <Card style={styles.card}>
          <Text style={[styles.section, { color: theme.text }]}>Hook / headline</Text>
          <Text style={[styles.body, { color: theme.text }]}>{item.headlines_hooks}</Text>
        </Card>
      ) : null}

      {item.primary_text ? (
        <Card style={styles.card}>
          <Text style={[styles.section, { color: theme.text }]}>Primary copy</Text>
          <Text style={[styles.body, { color: theme.text }]}>{item.primary_text}</Text>
        </Card>
      ) : null}

      {item.captions_hashtags ? (
        <Card style={styles.card}>
          <View style={styles.captionsHead}>
            <Text style={[styles.section, { color: theme.text, marginBottom: 0 }]}>Captions</Text>
            <Pressable onPress={handleShareCaptions} style={styles.copyBtn} hitSlop={8}>
              <Copy size={14} color={theme.primary} />
              <Text style={[styles.copyBtnText, { color: theme.primary }]}>Share</Text>
            </Pressable>
          </View>
          <Text style={[styles.body, { color: theme.text }]}>{item.captions_hashtags}</Text>
        </Card>
      ) : null}

      {item.production_direction ? (
        <Card style={styles.card}>
          <Text style={[styles.section, { color: theme.text }]}>Production direction</Text>
          <Text style={[styles.body, { color: theme.text }]}>{item.production_direction}</Text>
        </Card>
      ) : null}

      {item.revision_note ? (
        <Card style={styles.card}>
          <Text style={[styles.section, { color: theme.rose }]}>Revision request</Text>
          <Text style={[styles.body, { color: theme.text }]}>{item.revision_note}</Text>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, gap: 12 },
  serial: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
  title: { fontSize: 22, fontWeight: '700', lineHeight: 28, letterSpacing: -0.3 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '100%' },
  pillText: { fontSize: 12, fontWeight: '600' },
  card: { padding: 16 },
  label: { fontSize: 12, fontWeight: '500', marginBottom: 4 },
  value: { fontSize: 15, fontWeight: '600' },
  datesRow: { flexDirection: 'row', gap: 16, marginTop: 14 },
  dateCol: { flex: 1, minWidth: 0 },
  metaLine: { marginTop: 12, fontSize: 12, fontWeight: '500' },
  section: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  hint: { fontSize: 13, fontWeight: '400', marginBottom: 12 },
  workflowList: { gap: 8 },
  actionBtn: {
    width: '100%',
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCopy: { flex: 1, minWidth: 0 },
  actionBtnText: { fontSize: 14, fontWeight: '600' },
  actionHint: { fontSize: 12, fontWeight: '400', marginTop: 2 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  shareBtnText: { fontSize: 13, fontWeight: '600' },
  assets: { gap: 8, marginTop: 4 },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
  },
  assetThumb: { width: 52, height: 52, borderRadius: 8, overflow: 'hidden' },
  assetInfo: { flex: 1, minWidth: 0 },
  assetName: { fontSize: 14, fontWeight: '600' },
  assetKind: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  captionsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  copyBtnText: { fontSize: 13, fontWeight: '600' },
  body: { fontSize: 14, lineHeight: 22, fontWeight: '500' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  backBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  backBtnText: { color: '#ffffff', fontWeight: '700' },
});
