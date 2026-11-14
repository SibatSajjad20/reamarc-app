import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { MessageSquare, SquarePen, Trash2 } from 'lucide-react-native';
import { useTheme } from '../../src/theme';
import { Card } from '../../src/ui/Card';
import { TaskListSkeleton } from '../../src/ui/Skeleton';
import { useTabBarOffset } from '../../src/ui/layout';
import { TaskFormModal } from '../../src/components/tasks/TaskFormModal';
import { useAuth } from '../../src/context/AuthContext';
import {
  addTaskComment,
  asCommentList,
  changeTaskStage,
  deleteTask,
  getTask,
  nextAllowedStage,
  stageLabel,
  type Task,
} from '../../src/lib/tasks';

function prettyDate(iso?: string | null) {
  if (!iso) return '';
  try {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const theme = useTheme();
  const tabOffset = useTabBarOffset();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [commentText, setCommentText] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setTask(await getTask(String(id)));
    } catch (err: any) {
      Alert.alert('Could not open task', err?.message || 'Try again');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const canEdit = Boolean(task && !task.view_only);
  const upcoming = task ? nextAllowedStage(user, task) : null;

  const confirmAdvance = () => {
    if (!task || !upcoming || task.view_only) return;
    Alert.alert(`Move to ${stageLabel(upcoming)}?`, `This will change the status from ${stageLabel(task.status)}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: `Move to ${stageLabel(upcoming)}`,
        onPress: async () => {
          setBusy(true);
          try {
            setTask(await changeTaskStage(task.id, upcoming));
          } catch (err: any) {
            Alert.alert('Could not update status', err?.message || 'Try again');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const sendComment = async () => {
    if (!task || !commentText.trim()) return;
    setBusy(true);
    try {
      const comments = asCommentList(await addTaskComment(task.id, commentText.trim()));
      setTask({ ...task, comments, comments_count: comments.length });
      setCommentText('');
    } catch (err: any) {
      Alert.alert('Comment failed', err?.message || 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = () => {
    if (!task) return;
    Alert.alert(`Delete task "${task.title}"?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete task',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deleteTask(task.id);
            router.back();
          } catch (err: any) {
            Alert.alert('Delete failed', err?.message || 'Try again');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  if (loading && !task) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <TaskListSkeleton rows={4} />
      </View>
    );
  }
  if (!task) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={{ color: theme.textMuted }}>Task not found.</Text>
      </View>
    );
  }

  const comments = asCommentList(task.comments);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: tabOffset + 24 }]}>
        <View style={styles.topRow}>
          <Text style={[styles.serial, { color: theme.textMuted }]}>{task.serial || 'TASK'}</Text>
          <View style={styles.actions}>
            {canEdit ? (
              <Pressable
                onPress={() => setFormOpen(true)}
                style={[styles.iconBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}
              >
                <SquarePen size={20} color={theme.primary} strokeWidth={2.2} />
              </Pressable>
            ) : null}
            {canEdit ? (
              <Pressable
                onPress={onDelete}
                disabled={busy}
                style={[styles.iconBtn, { backgroundColor: theme.roseLight, borderColor: theme.rose }]}
              >
                <Trash2 size={20} color={theme.rose} strokeWidth={2.2} />
              </Pressable>
            ) : null}
          </View>
        </View>
        <Text style={[styles.title, { color: theme.text }]}>{task.title}</Text>

        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Status</Text>
        <Text style={[styles.statusNow, { color: theme.text }]}>{stageLabel(task.status)}</Text>
        {canEdit && upcoming ? (
          <Pressable
            onPress={confirmAdvance}
            disabled={busy}
            style={[styles.nextBtn, { backgroundColor: theme.primary, opacity: busy ? 0.6 : 1 }]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.nextBtnText}>Move to {stageLabel(upcoming)}</Text>
            )}
          </Pressable>
        ) : null}

        <Card>
          <Text style={[styles.label, { color: theme.textMuted }]}>Assignee</Text>
          <Text style={[styles.value, { color: theme.text }]}>
            {task.assignee_name || 'Unassigned'}
            {task.department ? ` · ${task.department}` : ''}
          </Text>
          <Text style={[styles.label, { color: theme.textMuted, marginTop: 12 }]}>Start date</Text>
          <Text style={[styles.value, { color: theme.text }]}>{prettyDate(task.start_date) || 'Not set'}</Text>
          <Text style={[styles.label, { color: theme.textMuted, marginTop: 12 }]}>Due</Text>
          <Text style={[styles.value, { color: theme.text }]}>
            {task.due_date
              ? `${prettyDate(task.due_date)}${task.due_time ? ` · ${task.due_time}` : ''}`
              : 'No due date'}
          </Text>
          <Text style={[styles.label, { color: theme.textMuted, marginTop: 12 }]}>Estimate</Text>
          <Text style={[styles.value, { color: theme.text }]}>
            {task.estimate_hours != null ? `${task.estimate_hours} hours` : 'Not set'}
          </Text>
          <Text style={[styles.label, { color: theme.textMuted, marginTop: 12 }]}>Related client</Text>
          <Text style={[styles.value, { color: theme.text }]}>{task.client_name || 'None'}</Text>
          <Text style={[styles.label, { color: theme.textMuted, marginTop: 12 }]}>Priority</Text>
          <Text style={[styles.value, { color: theme.text, textTransform: 'capitalize' }]}>{task.priority}</Text>
        </Card>

        {task.description ? (
          <Card>
            <Text style={[styles.label, { color: theme.textMuted }]}>Description</Text>
            <Text style={[styles.body, { color: theme.text }]}>{task.description}</Text>
          </Card>
        ) : null}

        <Card>
          <View style={styles.commentHead}>
            <MessageSquare size={16} color={theme.primary} />
            <Text style={[styles.label, { color: theme.text }]}>
              Discussion ({comments.length})
            </Text>
          </View>
          {comments.length === 0 ? (
            <Text style={[styles.emptyComments, { color: theme.textMuted }]}>No comments yet.</Text>
          ) : (
            comments.map((c) => (
              <View
                key={c.id}
                style={[styles.comment, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}
              >
                <View style={styles.commentMeta}>
                  <Text style={[styles.commentName, { color: theme.text }]}>{c.user_name}</Text>
                  <Text style={[styles.commentTime, { color: theme.textMuted }]}>
                    {c.created_at
                      ? new Date(c.created_at).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                  </Text>
                </View>
                <Text style={[styles.commentBody, { color: theme.textMuted }]}>{c.text}</Text>
              </View>
            ))
          )}
          <View style={styles.commentBox}>
            <TextInput
              value={commentText}
              onChangeText={setCommentText}
              placeholder="Write a comment..."
              placeholderTextColor={theme.textMuted}
              style={[
                styles.commentInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface },
              ]}
            />
            <Pressable
              onPress={() => void sendComment()}
              disabled={busy || !commentText.trim()}
              style={[
                styles.sendBtn,
                { backgroundColor: theme.primary, opacity: busy || !commentText.trim() ? 0.5 : 1 },
              ]}
            >
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendText}>Send</Text>}
            </Pressable>
          </View>
        </Card>
      </ScrollView>

      <TaskFormModal
        visible={formOpen}
        task={task}
        onClose={() => setFormOpen(false)}
        onSaved={(updated) => {
          setTask(updated);
          setFormOpen(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pad: { padding: 16, gap: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  serial: { flex: 1, fontSize: 12, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  title: { fontSize: 22, fontWeight: '700' },
  sectionLabel: { fontSize: 12, fontWeight: '500', marginTop: 4 },
  statusNow: { fontSize: 16, fontWeight: '600' },
  nextBtn: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  nextBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  label: { fontSize: 12, fontWeight: '500' },
  value: { fontSize: 15, fontWeight: '400', marginTop: 4 },
  body: { fontSize: 14, lineHeight: 20, marginTop: 6, fontWeight: '400' },
  commentHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  emptyComments: { fontSize: 13, fontStyle: 'italic', marginBottom: 10 },
  comment: { borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 8 },
  commentMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  commentName: { fontSize: 13, fontWeight: '600' },
  commentTime: { fontSize: 11 },
  commentBody: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  commentBox: { flexDirection: 'row', gap: 8, marginTop: 8 },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
    fontSize: 14,
  },
  sendBtn: { borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center' },
  sendText: { color: '#fff', fontWeight: '600' },
});
