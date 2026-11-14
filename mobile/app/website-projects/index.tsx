import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle,
  ChevronRight,
  Clock,
  ExternalLink,
  Globe,
  Layers,
  Layout,
  Search,
  Sliders,
  X,
} from 'lucide-react-native';
import { api } from '../../src/lib/api';
import { peekModuleCache, setModuleCache } from '../../src/lib/moduleCache';
import { useTheme } from '../../src/theme';
import { Card } from '../../src/ui/Card';
import { FilterChips } from '../../src/ui/FilterChips';
import { TaskListSkeleton } from '../../src/ui/Skeleton';

interface WebsiteSummaryMetrics {
  active_projects: number;
  waiting_on_client: number;
  at_risk: number;
  overdue_tasks: number;
  launches_next_30_days: number;
  pending_approvals: number;
  on_hold: number;
}

interface WebsiteProject {
  id: string;
  name: string;
  client_name: string;
  website_type: string;
  stage: string;
  health: string;
  progress: number;
  staging_url?: string;
  live_url?: string;
  overdue_tasks_count: number;
  total_tasks_count: number;
  completed_tasks_count: number;
  target_launch_date?: string;
}

const STAGE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'strategy', label: 'Strategy' },
  { key: 'content', label: 'Content' },
  { key: 'design', label: 'Design' },
  { key: 'assets', label: 'Assets' },
  { key: 'development', label: 'Dev' },
  { key: 'qa', label: 'QA' },
  { key: 'client_review', label: 'Review' },
  { key: 'production', label: 'Launch' },
  { key: 'completed', label: 'Done' },
];

const PROJECTS_CACHE = 'website:projects';
const METRICS_CACHE = 'website:metrics';

export default function WebsiteProjectsScreen() {
  const router = useRouter();
  const theme = useTheme();

  const [metrics, setMetrics] = useState<WebsiteSummaryMetrics | null>(
    () => peekModuleCache<WebsiteSummaryMetrics>(METRICS_CACHE),
  );
  const [projects, setProjects] = useState<WebsiteProject[]>(
    () => peekModuleCache<WebsiteProject[]>(PROJECTS_CACHE) || [],
  );
  const [loading, setLoading] = useState(() => !peekModuleCache<WebsiteProject[]>(PROJECTS_CACHE));
  const [refreshing, setRefreshing] = useState(false);
  const [stageFilter, setStageFilter] = useState('all');
  const [search, setSearch] = useState('');

  const loadData = useCallback(async (force = false) => {
    if (!force) {
      const cachedProjects = peekModuleCache<WebsiteProject[]>(PROJECTS_CACHE);
      const cachedMetrics = peekModuleCache<WebsiteSummaryMetrics>(METRICS_CACHE);
      if (cachedProjects) {
        setProjects(cachedProjects);
        if (cachedMetrics) setMetrics(cachedMetrics);
        setLoading(false);
        return;
      }
    }
    try {
      const metricsPromise = api<WebsiteSummaryMetrics>('/website-projects/metrics/summary').catch(() => null);
      const listPromise = api<{ items: WebsiteProject[]; total: number }>('/website-projects?limit=100');
      const [mRes, lRes] = await Promise.all([metricsPromise, listPromise]);
      const nextProjects = lRes.items || [];
      setModuleCache(PROJECTS_CACHE, nextProjects);
      if (mRes) setModuleCache(METRICS_CACHE, mRes);
      if (mRes) setMetrics(mRes);
      setProjects(nextProjects);
    } catch (err: any) {
      Alert.alert('Load Error', err?.message || 'Failed to load website projects');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadData(true);
  }, [loadData]);

  const handleOpenUrl = (url?: string) => {
    if (!url) return;
    const finalUrl = url.startsWith('http') ? url : `https://${url}`;
    Linking.openURL(finalUrl).catch(() => {
      Alert.alert('Cannot Open URL', 'Please check the website address.');
    });
  };

  const filteredProjects = projects.filter((p) => {
    if (stageFilter !== 'all' && p.stage.toLowerCase() !== stageFilter) {
      return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.client_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const renderHealthBadge = (health: string) => {
    const h = (health || 'on_track').toLowerCase();
    let bg = '#DCFCE7';
    let text = '#166534';
    let label = 'On Track';

    if (h === 'at_risk') {
      bg = '#FFE4E6';
      text = '#9F1239';
      label = 'At Risk';
    } else if (h === 'waiting_on_client') {
      bg = '#FEF3C7';
      text = '#92400E';
      label = 'Waiting Client';
    } else if (h === 'on_hold') {
      bg = '#F1F5F9';
      text = '#475569';
      label = 'On Hold';
    } else if (h === 'completed') {
      bg = '#E0E7FF';
      text = '#3730A3';
      label = 'Completed';
    }

    return (
      <View style={[styles.badge, { backgroundColor: bg }]}>
        <Text style={[styles.badgeText, { color: text }]}>{label}</Text>
      </View>
    );
  };

  const renderProjectCard = ({ item }: { item: WebsiteProject }) => {
    return (
      <Card style={styles.card}>
        <Pressable
          onPress={() => router.push(`/website-projects/${item.id}` as any)}
          style={styles.cardPressable}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <Text style={[styles.projectName, { color: theme.text }]}>{item.name}</Text>
              <Text style={[styles.clientSub, { color: theme.textMuted }]}>
                {item.client_name}
              </Text>
            </View>
            {renderHealthBadge(item.health)}
          </View>

          {/* Type & Stage */}
          <View style={styles.metaRow}>
            <View style={[styles.metaPill, { backgroundColor: theme.bgSubtle }]}>
              <Layout size={11} color={theme.textMuted} />
              <Text style={[styles.metaPillText, { color: theme.textMuted }]}>
                {item.website_type.replace('_', ' ').toUpperCase()}
              </Text>
            </View>

            <View style={[styles.metaPill, { backgroundColor: theme.primaryLight }]}>
              <Text style={[styles.metaPillText, { color: theme.primaryDark, fontWeight: '700' }]}>
                {item.stage.replace('_', ' ').toUpperCase()}
              </Text>
            </View>

            {item.target_launch_date ? (
              <View style={[styles.metaPill, { backgroundColor: theme.bgSubtle }]}>
                <Clock size={11} color={theme.textMuted} />
                <Text style={[styles.metaPillText, { color: theme.textMuted }]}>
                  Launch: {item.target_launch_date}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressHeader}>
              <Text style={[styles.progressLabel, { color: theme.textMuted }]}>
                Progress ({item.progress}%)
              </Text>
              <Text style={[styles.progressTasks, { color: theme.textMuted }]}>
                {item.completed_tasks_count}/{item.total_tasks_count} tasks
              </Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(100, Math.max(0, item.progress))}%`,
                    backgroundColor: item.health === 'at_risk' ? theme.rose : theme.primary,
                  },
                ]}
              />
            </View>
          </View>

          {/* Quick Action Links & Open Arrow */}
          <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
            <View style={styles.linksRow}>
              {item.staging_url ? (
                <Pressable
                  style={[styles.linkBtn, { backgroundColor: theme.bgSubtle }]}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleOpenUrl(item.staging_url);
                  }}
                >
                  <Globe size={12} color={theme.primary} />
                  <Text style={[styles.linkBtnText, { color: theme.primary }]}>Staging</Text>
                </Pressable>
              ) : null}

              {item.live_url ? (
                <Pressable
                  style={[styles.linkBtn, { backgroundColor: theme.bgSubtle }]}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleOpenUrl(item.live_url);
                  }}
                >
                  <ArrowUpRight size={12} color="#059669" />
                  <Text style={[styles.linkBtnText, { color: '#059669' }]}>Live Site</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.detailsBtn}>
              <Text style={[styles.detailsText, { color: theme.primary }]}>Details</Text>
              <ChevronRight size={16} color={theme.primary} />
            </View>
          </View>
        </Pressable>
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Top Header / Metrics Bar */}
      <View style={[styles.topSection, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        {metrics ? (
          <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, { backgroundColor: theme.bgSubtle }]}>
              <Text style={[styles.metricNumber, { color: theme.text }]}>
                {metrics.active_projects}
              </Text>
              <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Active</Text>
            </View>

            <View style={[styles.metricCard, { backgroundColor: theme.bgSubtle }]}>
              <Text
                style={[
                  styles.metricNumber,
                  { color: metrics.at_risk > 0 ? theme.rose : theme.text },
                ]}
              >
                {metrics.at_risk}
              </Text>
              <Text style={[styles.metricLabel, { color: theme.textMuted }]}>At Risk</Text>
            </View>

            <View style={[styles.metricCard, { backgroundColor: theme.bgSubtle }]}>
              <Text
                style={[
                  styles.metricNumber,
                  { color: metrics.waiting_on_client > 0 ? theme.amber : theme.text },
                ]}
              >
                {metrics.waiting_on_client}
              </Text>
              <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Client Wait</Text>
            </View>

            <View style={[styles.metricCard, { backgroundColor: theme.bgSubtle }]}>
              <Text style={[styles.metricNumber, { color: theme.text }]}>
                {metrics.launches_next_30_days}
              </Text>
              <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Due 30d</Text>
            </View>
          </View>
        ) : null}

        {/* Search */}
        <View
          style={[
            styles.searchBox,
            { backgroundColor: theme.isDark ? '#18181b' : '#FFFFFF', borderColor: theme.border },
          ]}
        >
          <Search size={16} color={theme.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search projects or clients..."
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

        <FilterChips items={STAGE_FILTERS} value={stageFilter} onChange={setStageFilter} />
      </View>

      {/* Main Project List */}
      {loading ? (
        <TaskListSkeleton rows={6} />
      ) : (
        <FlatList
          data={filteredProjects}
          keyExtractor={(item) => item.id}
          renderItem={renderProjectCard}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Globe size={42} color={theme.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No Projects Found</Text>
              <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
                {search
                  ? 'No website projects match your search.'
                  : 'There are no website projects currently in this stage.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  metricsGrid: { flexDirection: 'row', gap: 8 },
  metricCard: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricNumber: { fontSize: 16, fontWeight: '800' },
  metricLabel: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 13, paddingVertical: 0 },
  listContent: { padding: 16, paddingBottom: 140, gap: 12 },
  card: { padding: 0, borderRadius: 16, overflow: 'hidden' },
  cardPressable: { padding: 16 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardHeaderLeft: { flex: 1, marginRight: 8 },
  projectName: { fontSize: 16, fontWeight: '800' },
  clientSub: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  metaPillText: { fontSize: 11, fontWeight: '600' },
  progressContainer: { marginBottom: 12 },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  progressLabel: { fontSize: 11, fontWeight: '600' },
  progressTasks: { fontSize: 11, fontWeight: '600' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 10,
  },
  linksRow: { flexDirection: 'row', gap: 8 },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  linkBtnText: { fontSize: 11, fontWeight: '700' },
  detailsBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  detailsText: { fontSize: 13, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptySubtitle: { fontSize: 13, textAlign: 'center', maxWidth: 260 },
});
