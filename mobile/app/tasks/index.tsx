import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight, Plus, Search, X } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/theme';
import { Card } from '../../src/ui/Card';
import { PressScale } from '../../src/ui/motion';
import { ModuleHeader } from '../../src/ui/ModuleHeader';
import { FilterChips } from '../../src/ui/FilterChips';
import { TaskListSkeleton } from '../../src/ui/Skeleton';
import { useTabBarOffset } from '../../src/ui/layout';
import { peekModuleCache, setModuleCache } from '../../src/lib/moduleCache';
import { TaskFormModal } from '../../src/components/tasks/TaskFormModal';
import { canAccessTasks } from '../../src/lib/roles';
import {
  filterTaskList,
  listAllTasks,
  stageLabel,
  TASK_STAGES,
  type Task,
  type TaskStatus,
} from '../../src/lib/tasks';

const FILTER_TABS: { key: string; label: string; scope?: string; stage?: string }[] = [
  { key: 'all', label: 'All', scope: 'all' },
  { key: 'mine', label: 'Mine', scope: 'mine' },
  ...TASK_STAGES.map((s) => ({ key: s.value, label: s.label, scope: 'all', stage: s.value })),
];

function stageTone(status: string, theme: { isDark: boolean; text: string; textMuted: string }) {
  if (status === 'completed') return { bg: '#ECFDF5', color: '#059669' };
  if (status === 'review' || status === 'in_review') return { bg: '#FEF3C7', color: '#B45309' };
  if (status === 'in_progress') return { bg: '#EEF2FF', color: '#4338CA' };
  if (status === 'cancelled') return { bg: '#FFF1F2', color: '#E11D48' };
  return { bg: theme.isDark ? '#27272a' : '#F1F5F9', color: theme.textMuted };
}

export default function TasksScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const tabOffset = useTabBarOffset();
  const canCreate = canAccessTasks(user) && !user?.permissions?.view_only;
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const cacheKey = 'tasks:all';
  const [items, setItems] = useState<Task[]>(() => peekModuleCache<Task[]>(cacheKey) || []);
  const [loading, setLoading] = useState(() => !peekModuleCache<Task[]>(cacheKey));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    const cached = peekModuleCache<Task[]>(cacheKey);
    if (cached && !force) {
      setItems(cached);
      setLoading(false);
      return;
    }
    if (!cached) setLoading(true);
    setError(null);
    try {
      const res = await listAllTasks({ scope: 'all' });
      const next = res.items || [];
      setModuleCache(cacheKey, next);
      setItems(next);
    } catch (err: any) {
      if (!cached) {
        setItems([]);
        setError(err?.message || 'Could not load tasks');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load]),
  );

  const filtered = useMemo(
    () => filterTaskList(items, { filter, search, userId: user?.id }),
    [items, filter, search, user?.id],
  );

  const summary = useMemo(() => {
    const pool = filter === 'mine' ? filterTaskList(items, { filter: 'mine', userId: user?.id }) : items;
    return {
      todo: pool.filter((t) => t.status === 'todo').length,
      in_progress: pool.filter((t) => t.status === 'in_progress').length,
      completed: pool.filter((t) => t.status === 'completed').length,
    };
  }, [items, filter, user?.id]);

  const renderItem = ({ item }: { item: Task }) => {
    const tone = stageTone(item.status, theme);
    return (
      <Card style={styles.card}>
        <PressScale
          onPress={() => router.push({ pathname: '/tasks/[id]', params: { id: item.id } })}
          style={styles.cardPressable}
        >
          <View style={styles.cardHeader}>
            <Text style={[styles.serial, { color: theme.primary }]}>{item.serial || 'TASK'}</Text>
            <View style={[styles.stageBadge, { backgroundColor: tone.bg }]}>
              <Text style={[styles.stageBadgeText, { color: tone.color }]}>
                {stageLabel(item.status as TaskStatus)}
              </Text>
            </View>
          </View>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
            <Text style={[styles.meta, { color: theme.textMuted }]} numberOfLines={1}>
              {item.assignee_name || 'Unassigned'}
              {item.client_name ? ` · ${item.client_name}` : ''}
              {item.due_date ? ` · ${item.due_date}` : ''}
              {item.priority ? ` · ${item.priority}` : ''}
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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <ModuleHeader
        title="Tasks"
        right={
          canCreate ? (
            <Pressable
              onPress={() => setFormOpen(true)}
              style={[styles.addBtn, { backgroundColor: theme.primary }]}
            >
              <Plus size={16} color="#fff" />
              <Text style={styles.addBtnText}>Add</Text>
            </Pressable>
          ) : null
        }
      />
      <View style={[styles.topBar, { backgroundColor: theme.bg }]}>
        <View
          style={[
            styles.searchBox,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Search size={16} color={theme.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search title, serial, or assignee..."
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={() => void load()}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')}>
              <X size={16} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <FilterChips items={FILTER_TABS} value={filter} onChange={setFilter} />
        {filter === 'all' || filter === 'mine' ? (
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: theme.isDark ? theme.card : '#F5F3FF' }]}>
              <Text style={styles.summaryLabel}>To Do</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{summary.todo}</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: theme.isDark ? theme.card : '#EEF2FF' }]}>
              <Text style={styles.summaryLabel}>In Progress</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{summary.in_progress}</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: theme.isDark ? theme.card : '#ECFDF5' }]}>
              <Text style={styles.summaryLabel}>Completed</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{summary.completed}</Text>
            </View>
          </View>
        ) : null}
      </View>

      {loading && !items.length ? (
        <TaskListSkeleton />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
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
              {error || 'No tasks in this view.'}
            </Text>
          }
        />
      )}
      <TaskFormModal
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          void load(true);
        }}
      />
    </SafeAreaView>
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
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryCard: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  summaryLabel: { fontSize: 11, fontWeight: '500', color: '#6B7280', marginBottom: 4 },
  summaryValue: { fontSize: 20, fontWeight: '700' },
  list: { padding: 16, gap: 10 },
  card: { padding: 0, overflow: 'hidden' },
  cardPressable: { padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  serial: { fontSize: 12, fontWeight: '500' },
  stageBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  stageBadgeText: { fontSize: 11, fontWeight: '500' },
  title: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  cardFooter: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  meta: { flex: 1, fontSize: 12, fontWeight: '400' },
  viewRow: { flexDirection: 'row', alignItems: 'center' },
  viewText: { fontSize: 13, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 36, paddingHorizontal: 24 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
