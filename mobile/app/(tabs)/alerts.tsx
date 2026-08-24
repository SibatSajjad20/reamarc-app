import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { useInbox } from '../../src/context/InboxContext';
import { colors } from '../../src/theme';
import { alertKindMeta, isMissedAlert, relativeTime } from '../../src/ui/format';

type Item = { id: string; title: string; body: string; kind: string; created_at?: string; read?: boolean };

export default function AlertsScreen() {
  const router = useRouter();
  const { markAllRead, refreshUnread } = useInbox();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (spin = false) => {
    if (spin) setLoading(true);
    try {
      const data = await api<Item[]>('/mobile/notifications');
      setItems(data || []);
      await refreshUnread();
    } catch {
      /* ignore */
    } finally {
      if (spin) setLoading(false);
    }
  }, [refreshUnread]);

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
            <Text style={styles.title}>Notifications</Text>
            <Text style={styles.muted}>Stay updated with shift reminders and company notices.</Text>
          </View>
          <Pressable onPress={async () => { await markAllRead(); await load(); }} style={styles.markBtn}>
            <Text style={styles.markText}>Mark all as read</Text>
          </Pressable>
        </View>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={36} color={colors.indigo} />
            <Text style={styles.emptyTitle}>You’re all caught up</Text>
            <Text style={styles.emptyBody}>Shift reminders and HR notices will land here.</Text>
          </View>
        ) : (
          items.map((n) => {
            const meta = alertKindMeta(n.kind);
            return (
              <View key={n.id} style={[styles.card, !n.read && styles.unread]}>
                <View style={styles.cardHead}>
                  <View style={styles.tag}>
                    <Ionicons name={meta.icon} size={14} color={colors.indigo} />
                    <Text style={styles.tagText}>{meta.label}</Text>
                  </View>
                  <Text style={styles.time}>{relativeTime(n.created_at)}</Text>
                </View>
                <Text style={styles.cardTitle}>{n.title}</Text>
                <Text style={styles.body}>{n.body}</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 120 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  muted: { color: colors.muted, marginTop: 6, lineHeight: 18 },
  markBtn: { paddingTop: 6 },
  markText: { color: colors.indigo, fontWeight: '800', fontSize: 12 },
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
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tagText: { color: colors.indigo, fontWeight: '800', fontSize: 12 },
  time: { color: colors.muted, fontSize: 12 },
  cardTitle: { fontWeight: '800', color: colors.text, marginTop: 8 },
  body: { marginTop: 6, color: colors.text, lineHeight: 20 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  ctaText: { color: colors.indigo, fontWeight: '800' },
  empty: {
    alignItems: 'center',
    paddingVertical: 36,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyTitle: { fontWeight: '800', color: colors.text, marginTop: 10 },
  emptyBody: { color: colors.muted, marginTop: 4 },
});
