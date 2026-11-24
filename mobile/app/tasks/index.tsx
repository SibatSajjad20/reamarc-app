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
import { ChevronRight, Mic, Plus, Search, X } from 'lucide-react-native';
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
import { VoiceTaskModal } from '../../src/components/tasks/VoiceTaskModal';
import { canAccessTasks } from '../../src/lib/roles';
import {
  filterTaskList,
  listAllTasks,
  stageLabel,
  stageTone,
  TASK_STAGES,
  type Task,
  type TaskStatus,
} from '../../src/lib/tasks';

const FILTER_TABS: { key: string; label: string; scope?: string; stage?: string }[] = [
  { key: 'all', label: 'All', scope: 'all' },
  { key: 'mine', label: 'Mine', scope: 'mine' },
  ...TASK_STAGES.map((s) => ({ key: s.value, label: s.label, scope: 'all', stage: s.value })),
];

export default function TasksScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const tabOffset = useTabBarOffset();
  const canCreate = canAccessTasks(user) && (!user?.permissions?.view_only || user?.role === 'operations');
  const isAdmin = user?.role === 'admin';
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
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
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={[styles.meta, { color: theme.textMuted }]} numberOfLines={1}>
                {item.assignee_name || 'Unassigned'}
                {item.client_name ? ` · ${item.client_name}` : ''}
                {item.due_date ? ` · ${item.due_date}` : ''}
                {item.priority ? ` · ${item.priority}` : ''}
              </Text>
              {(item.logged_hours != null || item.estimate_hours != null) ? (
                <Text style={[styles.hoursMeta, { color: theme.primary }]}>
                  {item.logged_hours || 0}h
                  {item.estimate_hours ? ` / ${item.estimate_hours}h` : ' logged'}
                </Text>
              ) : null}
            </View>
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
            <View style={styles.headerRightGroup}>
              {isAdmin ? (
                <Pressable
                  onPress={() => setVoiceOpen(true)}
                  style={({ pressed }) => [
                    styles.headerBtn,
                    styles.voiceBtn,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <Mic size={15} color={theme.primary} />
                  <Text style={[styles.headerBtnText, { color: theme.text }]}>Voice</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => setFormOpen(true)}
                style={({ pressed }) => [
                  styles.headerBtn,
                  styles.addBtn,
                  {
                    backgroundColor: theme.primary,
                    borderColor: theme.primary,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Plus size={15} color="#fff" />
                <Text style={[styles.headerBtnText, { color: '#fff' }]}>Add</Text>
              </Pressable>
            </View>
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
      {isAdmin ? (
        <VoiceTaskModal
          visible={voiceOpen}
          onClose={() => setVoiceOpen(false)}
          onSaved={() => {
            setVoiceOpen(false);
            void load(true);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  headerBtnText: {
    fontWeight: '600',
    fontSize: 13,
  },
  voiceBtn: {},
  addBtn: {},
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
  hoursMeta: { fontSize: 11, fontWeight: '700' },
  viewRow: { flexDirection: 'row', alignItems: 'center' },
  viewText: { fontSize: 13, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 36, paddingHorizontal: 24 },
});
