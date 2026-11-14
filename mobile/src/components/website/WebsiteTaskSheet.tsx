import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Bug, GitPullRequest, ListTodo, User, X } from 'lucide-react-native';
import { api } from '../../lib/api';
import { useTheme } from '../../theme';
import { useSheetMotion } from '../../ui/motion';

export type WebsitePipelineTask = {
  id: string;
  name: string;
  kind: string;
  status: string;
  priority?: string;
  assignee_name?: string;
  due_date?: string;
  description?: string | null;
  stage?: string;
  comments?: { id?: string; user_name?: string; text?: string; created_at?: string }[];
};

function statusLabel(status: string) {
  const value = String(status || '').toLowerCase();
  if (value === 'in_progress') return 'In progress';
  if (value === 'review' || value === 'in_review') return 'In review';
  if (value === 'completed') return 'Completed';
  return 'To do';
}

function statusTone(status: string) {
  const value = String(status || '').toLowerCase();
  if (value === 'completed') return { bg: '#ECFDF5', fg: '#047857' };
  if (value === 'review' || value === 'in_review') return { bg: '#F5F3FF', fg: '#6D28D9' };
  if (value === 'in_progress') return { bg: '#EEF2FF', fg: '#4338CA' };
  return { bg: '#FFFBEB', fg: '#B45309' };
}

export function WebsiteTaskSheet({
  visible,
  projectId,
  projectStage,
  task,
  createMode,
  onClose,
  onCreated,
}: {
  visible: boolean;
  projectId: string;
  projectStage?: string;
  task: WebsitePipelineTask | null;
  createMode?: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const theme = useTheme();
  const { opacity, translateY } = useSheetMotion(visible);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('task');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setKind('task');
    setErrorMsg(null);
  }, [visible, task?.id, createMode]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setErrorMsg('Task name is required.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await api(`/website-projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          name: trimmed,
          stage: projectStage || 'strategy',
          kind,
          status: 'todo',
        }),
      });
      onCreated?.();
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not create task.');
    } finally {
      setSubmitting(false);
    }
  };

  const tone = statusTone(task?.status || 'todo');
  const KindIcon = task?.kind === 'bug' ? Bug : task?.kind === 'revision' ? GitPullRequest : ListTodo;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity }]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, borderColor: theme.border, opacity, transform: [{ translateY }] },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Text style={[styles.title, { color: theme.text }]}>
              {createMode ? 'Add website task' : task?.name || 'Task'}
            </Text>
            <Pressable hitSlop={8} onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.bgSubtle }]}>
              <X size={16} color={theme.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

            {createMode ? (
              <>
                <Text style={[styles.label, { color: theme.textMuted }]}>Name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Task name"
                  placeholderTextColor={theme.textSubtle}
                  style={[
                    styles.input,
                    { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgSubtle },
                  ]}
                />
                <Text style={[styles.label, { color: theme.textMuted, marginTop: 12 }]}>Kind</Text>
                <View style={styles.kindRow}>
                  {(['task', 'bug', 'revision'] as const).map((option) => {
                    const active = kind === option;
                    return (
                      <Pressable
                        key={option}
                        onPress={() => setKind(option)}
                        style={[
                          styles.kindChip,
                          {
                            backgroundColor: active ? theme.primary : theme.bgSubtle,
                          },
                        ]}
                      >
                        <Text style={{ color: active ? '#fff' : theme.textMuted, fontWeight: '600', fontSize: 12 }}>
                          {option.toUpperCase()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : task ? (
              <>
                <View style={styles.metaRow}>
                  <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.badgeText, { color: tone.fg }]}>{statusLabel(task.status)}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: theme.bgSubtle }]}>
                    <KindIcon size={12} color={theme.textMuted} />
                    <Text style={[styles.badgeText, { color: theme.textMuted }]}>{task.kind.toUpperCase()}</Text>
                  </View>
                </View>
                {task.assignee_name ? (
                  <View style={styles.detailRow}>
                    <User size={14} color={theme.textMuted} />
                    <Text style={[styles.detailText, { color: theme.text }]}>{task.assignee_name}</Text>
                  </View>
                ) : null}
                {task.due_date ? (
                  <Text style={[styles.detailText, { color: theme.textMuted }]}>Due {task.due_date}</Text>
                ) : null}
                {task.stage ? (
                  <Text style={[styles.detailText, { color: theme.textMuted }]}>
                    Stage {task.stage.replace(/_/g, ' ')}
                  </Text>
                ) : null}
                {task.description ? (
                  <Text style={[styles.description, { color: theme.text }]}>{task.description}</Text>
                ) : (
                  <Text style={[styles.detailText, { color: theme.textMuted }]}>No description</Text>
                )}
                {(task.comments || []).length ? (
                  <View style={styles.comments}>
                    <Text style={[styles.label, { color: theme.text }]}>Comments</Text>
                    {task.comments!.map((comment, idx) => (
                      <View key={comment.id || String(idx)} style={[styles.comment, { borderColor: theme.border }]}>
                        <Text style={[styles.commentName, { color: theme.text }]}>{comment.user_name || 'User'}</Text>
                        <Text style={[styles.commentBody, { color: theme.textMuted }]}>{comment.text}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
          </ScrollView>

          {createMode ? (
            <Pressable
              disabled={submitting}
              onPress={() => void handleCreate()}
              style={[styles.submit, { backgroundColor: theme.primary, opacity: submitting ? 0.6 : 1 }]}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Create task</Text>}
            </Pressable>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    maxHeight: '82%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  title: { flex: 1, fontSize: 16, fontWeight: '600' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, paddingBottom: 28, gap: 10 },
  error: { color: '#E11D48', fontSize: 13 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  kindRow: { flexDirection: 'row', gap: 8 },
  kindChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { fontSize: 13, fontWeight: '400' },
  description: { fontSize: 14, lineHeight: 21, fontWeight: '400', marginTop: 4 },
  comments: { gap: 8, marginTop: 8 },
  comment: { borderWidth: 1, borderRadius: 10, padding: 10 },
  commentName: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  commentBody: { fontSize: 13, lineHeight: 18 },
  submit: { margin: 16, marginTop: 0, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
