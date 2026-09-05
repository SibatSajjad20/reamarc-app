import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { useInbox } from '../../src/context/InboxContext';
import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme';
import { isMissedAlert, relativeTime } from '../../src/ui/format';
import { getClearedNotificationsCutoff, setClearedNotificationsCutoff } from '../../src/lib/secure';

type Item = {
  id: string;
  title: string;
  body: string;
  kind: string;
  sender_id?: string;
  sender_name?: string;
  sender_role?: string;
  created_at?: string;
  read?: boolean;
};

function getNotificationMeta(n: Item) {
  const key = String(n.kind || 'custom').toLowerCase();
  if (key.includes('missed')) {
    return {
      label: 'Missed Punch',
      sender: 'Attendance System',
      icon: 'warning-outline' as const,
      color: colors.rose,
      bg: '#FFF1F2',
    };
  }
  if (key.includes('pre_shift') || key.includes('shift') || key.includes('checkout') || key.includes('daily_log') || key.includes('reminder')) {
    return {
      label: 'Reminder',
      sender: 'Automated Reminder',
      icon: 'alarm-outline' as const,
      color: '#D97706',
      bg: '#FFFBEB',
    };
  }

  const rawRole = (n.sender_role || 'admin').toLowerCase();
  let roleLabel = 'Admin';
  if (rawRole === 'hr') roleLabel = 'HR';
  else if (rawRole === 'operations') roleLabel = 'Operations';
  else if (rawRole === 'admin' || rawRole === 'super_admin') roleLabel = 'Admin';
  else roleLabel = rawRole.charAt(0).toUpperCase() + rawRole.slice(1);

  return {
    label: 'Announcement',
    sender: `From ${roleLabel}`,
    icon: 'megaphone-outline' as const,
    color: colors.indigo,
    bg: '#EEF2FF',
  };
}

export default function AlertsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { markAllRead, refreshUnread } = useInbox();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [bTitle, setBTitle] = useState('');
  const [bBody, setBBody] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');

  const canBroadcast =
    String(user?.role || '').toLowerCase() === 'admin' ||
    String(user?.role || '').toLowerCase() === 'super_admin' ||
    String(user?.role || '').toLowerCase() === 'hr';

  const load = useCallback(async (spin = false) => {
    if (spin) setLoading(true);
    try {
      const [data, cutoff] = await Promise.all([
        api<Item[]>('/mobile/notifications'),
        getClearedNotificationsCutoff(),
      ]);
      const valid = (data || []).filter((n) => !cutoff || !n.created_at || n.created_at > cutoff);
      setItems(valid);
      await refreshUnread();
    } catch {
      /* ignore */
    } finally {
      if (spin) setLoading(false);
    }
  }, [refreshUnread]);

  const handleClearAll = async () => {
    if (items.length === 0) return;
    setClearing(true);
    const nowIso = new Date().toISOString();
    try {
      await setClearedNotificationsCutoff(nowIso);
      await api('/mobile/notifications/clear-all', { method: 'DELETE' });
    } catch {
      try {
        await markAllRead();
      } catch {
        /* ignore */
      }
    } finally {
      setItems([]);
      await refreshUnread();
      setClearing(false);
    }
  };

  const handleSendBroadcast = async () => {
    if (!bTitle.trim() || !bBody.trim()) return;
    setSendingBroadcast(true);
    setBroadcastMessage('');
    try {
      await api('/mobile/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          title: bTitle.trim(),
          body: bBody.trim(),
        }),
      });
      setBTitle('');
      setBBody('');
      setBroadcastOpen(false);
      await load(true);
    } catch (err: any) {
      setBroadcastMessage(err?.message || 'Failed to dispatch broadcast');
    } finally {
      setSendingBroadcast(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load(true);
      const id = setInterval(() => load(false), 8000);
      return () => clearInterval(id);
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(true)} />}
      >
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{canBroadcast ? 'Broadcasts & Alerts' : 'Notifications'}</Text>
            <Text style={styles.muted}>
              {canBroadcast
                ? 'Company announcements, executive notices & team alerts.'
                : 'Stay updated with announcements and automated shift reminders.'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            {canBroadcast && (
              <Pressable
                onPress={() => {
                  setBroadcastMessage('');
                  setBroadcastOpen(true);
                }}
                style={styles.broadcastBtn}
              >
                <Ionicons name="megaphone" size={13} color="#FFFFFF" />
                <Text style={styles.broadcastBtnText}>Announce</Text>
              </Pressable>
            )}
            {items.length > 0 && (
              <Pressable onPress={handleClearAll} disabled={clearing} style={[styles.clearBtn, clearing && { opacity: 0.5 }]}>
                <Ionicons name="trash-outline" size={13} color={colors.rose} />
                <Text style={styles.clearText}>{clearing ? 'Clearing…' : 'Clear'}</Text>
              </Pressable>
            )}
          </View>
        </View>

        {items.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="notifications-outline" size={32} color={colors.indigo} />
            </View>
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptyBody}>
              No new alerts or shift reminders. Company announcements and automated notices will appear here.
            </Text>
            <View style={styles.emptyStatusPill}>
              <Ionicons name="sparkles" size={12} color="#059669" />
              <Text style={styles.emptyStatusText}>Inbox is clean & quiet</Text>
            </View>
          </View>
        ) : (
          items.map((n) => {
            const meta = getNotificationMeta(n);
            return (
              <View key={n.id} style={[styles.card, !n.read && styles.unread]}>
                <View style={styles.cardHead}>
                  <View style={[styles.tag, { backgroundColor: meta.bg }]}>
                    <Ionicons name={meta.icon} size={13} color={meta.color} />
                    <Text style={[styles.tagText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <Text style={styles.time}>{relativeTime(n.created_at)}</Text>
                </View>
                <Text style={styles.cardTitle}>{n.title}</Text>
                <Text style={styles.body}>{n.body}</Text>
                <View style={styles.senderRow}>
                  <Ionicons name="shield-outline" size={12} color={colors.muted} />
                  <Text style={styles.senderText}>{meta.sender}</Text>
                </View>
                {isMissedAlert(n.kind) ? (
                  <Pressable
                    style={styles.cta}
                    onPress={() => router.push({ pathname: '/(tabs)/requests', params: { form: 'regularization' } })}
                  >
                    <Text style={styles.ctaText}>Submit Correction</Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.indigo} />
                  </Pressable>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* BROADCAST ANNOUNCEMENT MODAL */}
      <Modal
        visible={broadcastOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          Keyboard.dismiss();
          setBroadcastOpen(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.centerModalWrapper}
        >
          <Pressable style={styles.backdropPressable} onPress={Keyboard.dismiss} />
          <View style={styles.centerCard}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>📢 Send Announcement</Text>
                <Text style={styles.modalSubtitle}>
                  Instant push notification sent to all active employees.
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  setBroadcastOpen(false);
                }}
                hitSlop={12}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color={colors.slate} />
              </Pressable>
            </View>

            <View style={{ marginTop: 10, marginBottom: 8 }}>
              <Text style={styles.inputLabel}>Title</Text>
              <TextInput
                style={styles.titleInput}
                placeholder="e.g. Office Event / Important Announcement"
                placeholderTextColor={colors.muted}
                value={bTitle}
                onChangeText={setBTitle}
                maxLength={100}
              />
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={styles.inputLabel}>Message</Text>
              <TextInput
                style={styles.centerInput}
                placeholder="Write your announcement details here..."
                placeholderTextColor={colors.muted}
                value={bBody}
                onChangeText={setBBody}
                multiline
                maxLength={300}
                textAlignVertical="top"
              />
              <Text style={styles.counter}>{bBody.length}/300</Text>
            </View>

            {Boolean(broadcastMessage) && (
              <Text style={styles.broadcastErrorText}>{broadcastMessage}</Text>
            )}

            <Pressable
              style={[
                styles.modalSubmitBtn,
                {
                  backgroundColor: colors.indigo,
                  opacity: !bTitle.trim() || !bBody.trim() || sendingBroadcast ? 0.45 : 1,
                },
              ]}
              onPress={handleSendBroadcast}
              disabled={!bTitle.trim() || !bBody.trim() || sendingBroadcast}
            >
              {sendingBroadcast ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalSubmitBtnText}>Send Push Broadcast</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                setBroadcastOpen(false);
              }}
              style={{ marginTop: 10, paddingVertical: 6 }}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 120 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  muted: { color: colors.muted, marginTop: 4, lineHeight: 18 },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF1F2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECDD3',
    marginTop: 4,
  },
  clearText: { color: colors.rose, fontWeight: '800', fontSize: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  unread: { borderColor: '#C7D2FE', backgroundColor: '#F8FAFF' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  tagText: { fontWeight: '800', fontSize: 11 },
  time: { color: colors.muted, fontSize: 12 },
  cardTitle: { fontWeight: '800', color: colors.text, marginTop: 8, fontSize: 15 },
  body: { marginTop: 6, color: colors.text, lineHeight: 20 },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  senderText: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  ctaText: { color: colors.indigo, fontWeight: '800' },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 44,
    paddingHorizontal: 20,
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 10,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontWeight: '800',
    color: colors.text,
    fontSize: 18,
    textAlign: 'center',
  },
  emptyBody: {
    color: colors.muted,
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 280,
  },
  emptyStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  emptyStatusText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
  },
  broadcastBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.indigo,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  broadcastBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  centerModalWrapper: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  backdropPressable: { ...StyleSheet.absoluteFill },
  centerCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  modalTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: colors.text,
  },
  modalSubtitle: {
    color: colors.muted,
    marginTop: 4,
    fontSize: 13,
  },
  modalCloseBtn: {
    backgroundColor: '#F4F4F5',
    borderRadius: 999,
    padding: 4,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.slate,
    marginBottom: 4,
  },
  titleInput: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: '#FAFAFA',
  },
  centerInput: {
    minHeight: 85,
    maxHeight: 130,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    color: colors.text,
    fontSize: 14,
    backgroundColor: '#FAFAFA',
  },
  counter: {
    alignSelf: 'flex-end',
    color: colors.muted,
    fontSize: 11,
    marginTop: 4,
  },
  broadcastErrorText: {
    color: colors.rose,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubmitBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  modalSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  cancelText: {
    color: colors.muted,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 13,
  },
});
