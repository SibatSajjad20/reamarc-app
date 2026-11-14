import React, { useCallback, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Bug,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  GitPullRequest,
  Globe,
  Layers,
  Layout,
  ListTodo,
  Plus,
  ShieldCheck,
  User,
} from 'lucide-react-native';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/theme';
import { Card } from '../../src/ui/Card';
import { PressScale } from '../../src/ui/motion';
import { TaskListSkeleton } from '../../src/ui/Skeleton';
import { WebsiteTaskSheet, type WebsitePipelineTask } from '../../src/components/website/WebsiteTaskSheet';
import { canManageWebsiteProject } from '../../src/lib/websiteAccess';

interface WebsiteProjectDetail {
  id: string;
  name: string;
  client_name: string;
  manager_id?: string;
  manager_name?: string;
  website_type: string;
  stage: string;
  health: string;
  progress: number;
  staging_url?: string;
  live_url?: string;
  description?: string;
  start_date?: string;
  target_launch_date?: string;
  total_tasks_count: number;
  completed_tasks_count: number;
  overdue_tasks_count: number;
}

interface WebsiteGate {
  id: string;
  gate_key: string;
  name: string;
  stage: string;
  status: string;
  round: number;
}

interface WebsiteTask extends WebsitePipelineTask {
  required: boolean;
}

export default function WebsiteProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const theme = useTheme();

  const [project, setProject] = useState<WebsiteProjectDetail | null>(null);
  const [gates, setGates] = useState<WebsiteGate[]>([]);
  const [tasks, setTasks] = useState<WebsiteTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'gates' | 'tasks'>('gates');
  const [taskKindFilter, setTaskKindFilter] = useState<'all' | 'task' | 'bug' | 'revision'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [openTask, setOpenTask] = useState<WebsiteTask | null>(null);

  const loadAll = useCallback(async () => {
    if (!id) return;
    try {
      const projPromise = api<WebsiteProjectDetail>(`/website-projects/${id}`);
      const gatesPromise = api<WebsiteGate[]>(`/website-projects/${id}/gates`).catch(() => []);
      const tasksPromise = api<WebsiteTask[]>(`/website-projects/${id}/tasks`).catch(() => []);

      const [projRes, gatesRes, tasksRes] = await Promise.all([projPromise, gatesPromise, tasksPromise]);
      setProject(projRes);
      setGates(gatesRes || []);
      setTasks(tasksRes || []);
    } catch (err: any) {
      Alert.alert('Load Error', err?.message || 'Failed to load project details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void loadAll();
    }, [loadAll]),
  );

  const handleOpenUrl = (url?: string) => {
    if (!url) return;
    const finalUrl = url.startsWith('http') ? url : `https://${url}`;
    Linking.openURL(finalUrl).catch(() => {
      Alert.alert('Cannot Open URL', 'Please check the address or internet connection.');
    });
  };

  const filteredTasks = tasks.filter((t) => {
    if (taskKindFilter !== 'all' && t.kind !== taskKindFilter) return false;
    return true;
  });

  const renderGateStatusBadge = (status: string) => {
    const s = (status || 'draft').toLowerCase();
    let bg = '#F1F5F9';
    let text = '#64748B';
    let label = 'Draft';

    if (s === 'approved') {
      bg = '#DCFCE7';
      text = '#166534';
      label = 'Approved';
    } else if (s === 'in_review') {
      bg = '#FEF3C7';
      text = '#92400E';
      label = 'In Review';
    } else if (s === 'changes_requested') {
      bg = '#FFE4E6';
      text = '#9F1239';
      label = 'Changes Req.';
    }

    return (
      <View style={[styles.badge, { backgroundColor: bg }]}>
        <Text style={[styles.badgeText, { color: text }]}>{label}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <TaskListSkeleton rows={6} />
      </View>
    );
  }

  if (!project) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.bg }]}>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>Project Not Found</Text>
        <Pressable
          style={[styles.backBtn, { backgroundColor: theme.primary }]}
          onPress={() => router.back()}
        >
          <Text style={styles.backBtnText}>Return to Projects</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.pad}
    >
      {/* Project Hero Card */}
      <Card style={styles.card}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={[styles.projectName, { color: theme.text }]}>{project.name}</Text>
            <Text style={[styles.clientSub, { color: theme.textMuted }]}>
              {project.client_name}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: theme.primaryLight }]}>
            <Text style={[styles.badgeText, { color: theme.primaryDark }]}>
              {project.stage.replace('_', ' ').toUpperCase()}
            </Text>
          </View>
        </View>

        {project.description ? (
          <Text style={[styles.descriptionText, { color: theme.textMuted }]}>
            {project.description}
          </Text>
        ) : null}

        {/* Manager & Launch date */}
        <View style={[styles.metaGrid, { borderTopColor: theme.border }]}>
          {project.manager_name ? (
            <View style={styles.metaCol}>
              <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Project Manager</Text>
              <Text style={[styles.metaVal, { color: theme.text }]}>
                {project.manager_name}
              </Text>
            </View>
          ) : null}

          {project.target_launch_date ? (
            <View style={styles.metaCol}>
              <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Target Launch</Text>
              <Text style={[styles.metaVal, { color: theme.text }]}>
                {project.target_launch_date}
              </Text>
            </View>
          ) : null}
        </View>

        {/* External Site Actions */}
        <View style={styles.sitesRow}>
          {project.staging_url ? (
            <Pressable
              style={[styles.siteBtn, { backgroundColor: theme.bgSubtle }]}
              onPress={() => handleOpenUrl(project.staging_url)}
            >
              <Globe size={14} color={theme.primary} />
              <Text style={[styles.siteBtnText, { color: theme.primary }]}>Open Staging Site</Text>
              <ExternalLink size={12} color={theme.primary} />
            </Pressable>
          ) : null}

          {project.live_url ? (
            <Pressable
              style={[styles.siteBtn, { backgroundColor: '#ECFDF5' }]}
              onPress={() => handleOpenUrl(project.live_url)}
            >
              <ArrowUpRight size={14} color="#059669" />
              <Text style={[styles.siteBtnText, { color: '#059669' }]}>Open Production Site</Text>
            </Pressable>
          ) : null}
        </View>
      </Card>

      {/* Segmented Tab: Gates vs Tasks */}
      <View style={[styles.segmentContainer, { backgroundColor: theme.isDark ? '#27272a' : '#F1F5F9' }]}>
        <Pressable
          style={[
            styles.segmentTab,
            activeTab === 'gates' && [styles.segmentTabActive, { backgroundColor: theme.surface }],
          ]}
          onPress={() => setActiveTab('gates')}
        >
          <ShieldCheck size={16} color={activeTab === 'gates' ? theme.primary : theme.textMuted} />
          <Text
            style={[
              styles.segmentLabel,
              { color: activeTab === 'gates' ? theme.text : theme.textMuted },
            ]}
          >
            Gates ({gates.length})
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.segmentTab,
            activeTab === 'tasks' && [styles.segmentTabActive, { backgroundColor: theme.surface }],
          ]}
          onPress={() => setActiveTab('tasks')}
        >
          <ListTodo size={16} color={activeTab === 'tasks' ? theme.primary : theme.textMuted} />
          <Text
            style={[
              styles.segmentLabel,
              { color: activeTab === 'tasks' ? theme.text : theme.textMuted },
            ]}
          >
            Tasks ({tasks.length})
          </Text>
        </Pressable>
      </View>

      {/* Gates View */}
      {activeTab === 'gates' ? (
        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Milestone Approval Gates</Text>
          <Text style={[styles.sectionDesc, { color: theme.textMuted }]}>
            Phase sign-offs required before production deployment.
          </Text>

          <View style={styles.gatesList}>
            {gates.map((g, idx) => (
              <View
                key={g.id || idx}
                style={[styles.gateItem, { borderColor: theme.border, backgroundColor: theme.bgSubtle }]}
              >
                <View style={styles.gateLeft}>
                  <View style={styles.gateNumber}>
                    <Text style={[styles.gateNumText, { color: theme.primary }]}>{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.gateName, { color: theme.text }]}>{g.name}</Text>
                    <Text style={[styles.gateStage, { color: theme.textMuted }]}>
                      Phase: {g.stage.replace(/_/g, ' ').toUpperCase()} • Round {g.round}
                    </Text>
                  </View>
                </View>
                {renderGateStatusBadge(g.status)}
              </View>
            ))}
          </View>
        </Card>
      ) : (
        /* Tasks View */
        <Card style={styles.card}>
          {canManageWebsiteProject(user, project) ? (
            <Pressable
              onPress={() => {
                setOpenTask(null);
                setFormOpen(true);
              }}
              style={[styles.addTaskBtn, { backgroundColor: theme.primary }]}
            >
              <Plus size={16} color="#fff" />
              <Text style={styles.addTaskBtnText}>Add task</Text>
            </Pressable>
          ) : null}
          <View style={styles.taskFilterRow}>
            {(['all', 'task', 'bug', 'revision'] as const).map((kind) => {
              const isSelected = taskKindFilter === kind;
              return (
                <Pressable
                  key={kind}
                  style={[
                    styles.taskKindPill,
                    {
                      backgroundColor: isSelected
                        ? theme.primary
                        : theme.isDark
                        ? '#27272a'
                        : '#F1F5F9',
                    },
                  ]}
                  onPress={() => setTaskKindFilter(kind)}
                >
                  <Text
                    style={[
                      styles.taskKindPillText,
                      { color: isSelected ? '#ffffff' : theme.textMuted },
                    ]}
                  >
                    {kind.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.tasksList}>
            {filteredTasks.length === 0 ? (
              <Text style={[styles.emptyTasks, { color: theme.textMuted }]}>
                No tasks found in this filter.
              </Text>
            ) : (
              filteredTasks.map((t) => {
                const isCompleted = t.status === 'completed';
                return (
                  <PressScale
                    key={t.id}
                    style={[styles.taskItem, { borderColor: theme.border }]}
                    contentStyle={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 }}
                    onPress={() => {
                      setFormOpen(false);
                      setOpenTask(t);
                    }}
                  >
                    <View style={styles.taskCheckbox}>
                      {isCompleted ? (
                        <CheckCircle2 size={20} color="#059669" />
                      ) : (
                        <Circle size={20} color={theme.border} />
                      )}
                    </View>

                    <View style={styles.taskContent}>
                      <Text
                        style={[
                          styles.taskTitle,
                          {
                            color: isCompleted ? theme.textMuted : theme.text,
                            textDecorationLine: isCompleted ? 'line-through' : 'none',
                          },
                        ]}
                      >
                        {t.name}
                      </Text>

                      <View style={styles.taskMetaRow}>
                        <View
                          style={[
                            styles.kindBadge,
                            {
                              backgroundColor:
                                t.kind === 'bug'
                                  ? '#FFE4E6'
                                  : t.kind === 'revision'
                                  ? '#FEF3C7'
                                  : theme.bgSubtle,
                            },
                          ]}
                        >
                          {t.kind === 'bug' ? (
                            <Bug size={10} color="#9F1239" />
                          ) : (
                            <GitPullRequest size={10} color={theme.textMuted} />
                          )}
                          <Text
                            style={[
                              styles.kindBadgeText,
                              {
                                color:
                                  t.kind === 'bug'
                                    ? '#9F1239'
                                    : t.kind === 'revision'
                                    ? '#92400E'
                                    : theme.textMuted,
                              },
                            ]}
                          >
                            {t.kind.toUpperCase()}
                          </Text>
                        </View>

                        {t.assignee_name ? (
                          <View style={styles.assigneePill}>
                            <User size={10} color={theme.textMuted} />
                            <Text style={[styles.assigneeText, { color: theme.textMuted }]}>
                              {t.assignee_name}
                            </Text>
                          </View>
                        ) : null}

                        {t.due_date ? (
                          <Text style={[styles.taskDueDate, { color: theme.textMuted }]}>
                            Due {t.due_date}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </PressScale>
                );
              })
            )}
          </View>
        </Card>
      )}
    </ScrollView>
      {id ? (
        <WebsiteTaskSheet
          visible={formOpen || Boolean(openTask)}
          projectId={id}
          projectStage={project.stage}
          task={openTask}
          createMode={formOpen}
          onClose={() => {
            setFormOpen(false);
            setOpenTask(null);
          }}
          onCreated={() => {
            setFormOpen(false);
            void loadAll();
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pad: { padding: 16, paddingBottom: 100, gap: 12 },
  card: { padding: 16, borderRadius: 16 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  projectName: { fontSize: 18, fontWeight: '600' },
  clientSub: { fontSize: 13, fontWeight: '400', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, flexShrink: 0 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  descriptionText: { fontSize: 13, lineHeight: 19, marginTop: 10, fontWeight: '400' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, paddingTop: 12, marginTop: 12, gap: 16 },
  metaCol: { flexGrow: 1, flexBasis: '40%', minWidth: 0 },
  metaLabel: { fontSize: 11, fontWeight: '500' },
  metaVal: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  sitesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  siteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  siteBtnText: { fontSize: 12, fontWeight: '600' },
  segmentContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    gap: 4,
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    gap: 6,
    borderRadius: 10,
    minWidth: 0,
  },
  segmentTabActive: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segmentLabel: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  sectionDesc: { fontSize: 12, lineHeight: 17, marginBottom: 12, fontWeight: '400' },
  gatesList: { gap: 10 },
  gateItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  gateLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  gateNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  gateNumText: { fontSize: 12, fontWeight: '600' },
  gateName: { fontSize: 13, fontWeight: '600' },
  gateStage: { fontSize: 11, marginTop: 2, fontWeight: '400' },
  taskFilterRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  taskKindPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  taskKindPillText: { fontSize: 11, fontWeight: '600' },
  tasksList: { gap: 8 },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  taskCheckbox: { width: 24, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  taskContent: { flex: 1, minWidth: 0 },
  taskTitle: { fontSize: 14, fontWeight: '500' },
  taskMetaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 6 },
  kindBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  kindBadgeText: { fontSize: 10, fontWeight: '600' },
  assigneePill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  assigneeText: { fontSize: 11 },
  taskDueDate: { fontSize: 11 },
  emptyTasks: { textAlign: 'center', paddingVertical: 20, fontSize: 13 },
  addTaskBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 12,
  },
  addTaskBtnText: { color: '#ffffff', fontWeight: '600', fontSize: 13 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  loadingText: { fontSize: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  backBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, marginTop: 10 },
  backBtnText: { color: '#ffffff', fontWeight: '700' },
});
