import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, Search, X } from 'lucide-react-native';
import { api } from '../../src/lib/api';
import { peekModuleCache, setModuleCache } from '../../src/lib/moduleCache';
import { isGenericFileIcon } from '../../src/lib/mediaUrl';
import { useTheme } from '../../src/theme';
import { AuthImage } from '../../src/ui/AuthImage';
import { Card } from '../../src/ui/Card';
import { PressScale } from '../../src/ui/motion';
import { FilterChips } from '../../src/ui/FilterChips';
import { TaskListSkeleton } from '../../src/ui/Skeleton';
import { useTabBarOffset } from '../../src/ui/layout';

interface CreativeAsset {
  id: string;
  url: string;
  filename: string;
  kind?: string;
  thumbnail_url?: string | null;
}

interface ContentCalendarItem {
  id: string;
  serial?: string;
  client_name?: string;
  content_concept: string;
  stage: string;
  creative_category?: string;
  publish_date?: string;
  design_due?: string;
  attachments?: CreativeAsset[];
}

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'drafting', label: 'Drafting' },
  { key: 'review', label: 'In Review' },
  { key: 'revision', label: 'Revision' },
  { key: 'ready', label: 'Ready' },
  { key: 'posted', label: 'Posted' },
];

const CACHE_KEY = 'content-calendar:list';

function stageGroup(stageName: string) {
  const s = (stageName || '').toLowerCase();
  if (s.includes('revision')) return 'revision';
  if (s.includes('review')) return 'review';
  if (s === 'ready to post' || s === 'ready') return 'ready';
  if (s === 'posted') return 'posted';
  return 'drafting';
}

function stageTone(stage: string, isDark: boolean) {
  const grp = stageGroup(stage);
  if (grp === 'posted') return { bg: '#ECFDF5', color: '#059669', label: 'Posted' };
  if (grp === 'ready') return { bg: '#EEF2FF', color: '#4338CA', label: 'Ready' };
  if (grp === 'review') return { bg: '#FEF3C7', color: '#B45309', label: 'In Review' };
  if (grp === 'revision') return { bg: '#FFF1F2', color: '#E11D48', label: 'Revision' };
  return { bg: isDark ? '#27272a' : '#F1F5F9', color: isDark ? '#A1A1AA' : '#6B7280', label: 'Drafting' };
}

function previewUri(item: ContentCalendarItem): string {
  const assets = item.attachments || [];
  const realThumb = assets.find((a) => a.thumbnail_url && !isGenericFileIcon(a.thumbnail_url));
  if (realThumb?.thumbnail_url) return realThumb.thumbnail_url;
  const image = assets.find((a) => a.kind === 'image' || /\.(jpe?g|png|webp|gif)$/i.test(a.filename || a.url || ''));
  if (image) return image.thumbnail_url || image.url;
  const video = assets.find((a) => a.kind === 'video' || /\.(mp4|mov|webm|m4v)$/i.test(a.filename || a.url || ''));
  if (video) return video.thumbnail_url || video.url;
  return '';
}

export default function ContentCalendarScreen() {
  const router = useRouter();
  const theme = useTheme();
  const tabOffset = useTabBarOffset();
  const [items, setItems] = useState<ContentCalendarItem[]>(
    () => peekModuleCache<ContentCalendarItem[]>(CACHE_KEY) || [],
  );
  const [loading, setLoading] = useState(() => !peekModuleCache<ContentCalendarItem[]>(CACHE_KEY));
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async (force = false) => {
    const cached = peekModuleCache<ContentCalendarItem[]>(CACHE_KEY);
    if (cached && !force) {
      setItems(cached);
      setLoading(false);
      return;
    }
    if (cached) {
      setItems(cached);
      setLoading(false);
    } else if (!force) {
      setLoading(true);
    }
    try {
      const res = await api<{ items: ContentCalendarItem[]; total: number }>('/content-calendar?limit=100');
      const next = res.items || [];
      setModuleCache(CACHE_KEY, next);
      setItems(next);
    } catch (err: any) {
      if (!cached) {
        setItems([]);
        Alert.alert('Load Error', err?.message || 'Failed to load content calendar');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const cached = peekModuleCache<ContentCalendarItem[]>(CACHE_KEY);
      if (cached) {
        setItems(cached);
        setLoading(false);
        return;
      }
      void load(false);
    }, [load]),
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filter !== 'all' && stageGroup(item.stage) !== filter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (item.serial || '').toLowerCase().includes(q) ||
        (item.client_name || '').toLowerCase().includes(q) ||
        (item.content_concept || '').toLowerCase().includes(q)
      );
    });
  }, [items, filter, search]);

  const renderItemCard = ({ item }: { item: ContentCalendarItem }) => {
    const tone = stageTone(item.stage, theme.isDark);
    const thumb = previewUri(item);
    const meta = [item.client_name, item.publish_date ? `Pub ${item.publish_date}` : null]
      .filter(Boolean)
      .join(' · ');

    return (
      <Card style={styles.card}>
        <PressScale
          onPress={() => router.push(`/content-calendar/${item.id}` as any)}
          style={styles.cardPressable}
        >
          <View style={styles.cardHeader}>
            <Text style={[styles.serial, { color: theme.primary }]} numberOfLines={1}>
              {item.serial || 'BRIEF'}
            </Text>
            <View style={[styles.stageBadge, { backgroundColor: tone.bg }]}>
              <Text style={[styles.stageBadgeText, { color: tone.color }]} numberOfLines={1}>
                {tone.label}
              </Text>
            </View>
          </View>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
            {item.content_concept}
          </Text>
          {thumb ? (
            <AuthImage uri={thumb} width={400} style={styles.thumb} wrapStyle={styles.thumb} />
          ) : null}
          <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
            <Text style={[styles.meta, { color: theme.textMuted }]} numberOfLines={1}>
              {meta || item.creative_category || 'Creative brief'}
            </Text>
            <View style={styles.viewRow}>
              <Text style={[styles.viewText, { color: theme.primary }]}>View</Text>
              <ChevronRight size={16} color={theme.primary} />
            </View>
          </View>
        </PressScale>
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.topBar, { backgroundColor: theme.bg }]}>
        <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Search size={16} color={theme.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search brief, serial, or client..."
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')}>
              <X size={16} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <FilterChips items={FILTER_TABS} value={filter} onChange={setFilter} />
      </View>

      {loading && !items.length ? (
        <TaskListSkeleton />
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItemCard}
          contentContainerStyle={[styles.list, { paddingBottom: tabOffset }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(true);
              }}
            />
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textMuted }]}>
              {search ? 'No briefs match this search.' : 'No briefs in this view.'}
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, gap: 10 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  list: { padding: 16, gap: 10 },
  card: { padding: 0, overflow: 'hidden' },
  cardPressable: { padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  serial: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: '600' },
  stageBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
  stageBadgeText: { fontSize: 11, fontWeight: '600' },
  title: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  thumb: {
    width: '100%',
    height: 132,
    borderRadius: 14,
    marginTop: 10,
    overflow: 'hidden',
    backgroundColor: '#EEF0F7',
  },
  cardFooter: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  meta: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: '500' },
  viewRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  viewText: { fontSize: 13, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 36, paddingHorizontal: 24 },
});
