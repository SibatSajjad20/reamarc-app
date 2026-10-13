import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { crmApi } from '../src/lib/crmApi';
import { colors } from '../src/theme';

type Item = {
  id: string;
  title: string;
  value: number;
  currency: string;
  won_date: string;
  sales_owner_name: string;
  lead_or_company_name: string;
  won_note: string;
};

export default function WonDealApprovalsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await crmApi.listWonDealApprovals();
      setItems(rows);
    } catch {
      Alert.alert('Could not load', 'Won-deal approvals are unavailable right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (item: Item) => {
    try {
      await crmApi.approveWonDealApproval(item.id);
      setItems((prev) => prev.filter((row) => row.id !== item.id));
    } catch {
      Alert.alert('Could not approve', 'Try again in a moment.');
    }
  };

  const reject = (item: Item) => {
    let reason = '';
    Alert.prompt?.(
      'Reject deal',
      'Tell sales why this is not ready.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send back',
          onPress: async (value?: string) => {
            reason = (value || '').trim();
            if (!reason) {
              Alert.alert('Reason required');
              return;
            }
            try {
              await crmApi.rejectWonDealApproval(item.id, reason);
              setItems((prev) => prev.filter((row) => row.id !== item.id));
            } catch {
              Alert.alert('Could not reject', 'Try again in a moment.');
            }
          },
        },
      ],
      'plain-text'
    );
    if (!Alert.prompt) {
      Alert.alert('Reject deal', 'Use a short reason in the next prompt.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: () => {
            reason = 'Not ready for operations confirmation';
            void crmApi.rejectWonDealApproval(item.id, reason).then(
              () => setItems((prev) => prev.filter((row) => row.id !== item.id)),
              () => Alert.alert('Could not reject', 'Try again in a moment.')
            );
          },
        },
      ]);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Won-deal approvals</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={styles.pad}>
        {loading ? <Text style={styles.muted}>Loading…</Text> : null}
        {!loading && items.length === 0 ? (
          <Text style={styles.muted}>No won deals waiting for confirmation.</Text>
        ) : null}
        {items.map((item) => (
          <View key={item.id} style={styles.card}>
            <Text style={styles.deal}>{item.title}</Text>
            <Text style={styles.muted}>
              {item.lead_or_company_name || 'Unnamed'}
              {item.sales_owner_name ? ` · ${item.sales_owner_name}` : ''}
            </Text>
            <Text style={styles.value}>
              {item.currency} {Math.round(item.value || 0).toLocaleString()}
            </Text>
            {item.won_note ? <Text style={styles.note}>{item.won_note}</Text> : null}
            <View style={styles.row}>
              <Pressable style={styles.approve} onPress={() => void approve(item)}>
                <Text style={styles.approveText}>Approve</Text>
              </Pressable>
              <Pressable style={styles.reject} onPress={() => reject(item)}>
                <Text style={styles.rejectText}>Reject</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  pad: { padding: 16, paddingBottom: 40, gap: 12 },
  muted: { color: colors.muted, marginBottom: 8 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  deal: { fontSize: 16, fontWeight: '800', color: colors.text },
  value: { marginTop: 6, fontWeight: '800', color: colors.indigo },
  note: { marginTop: 8, color: colors.slate },
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
  approve: {
    backgroundColor: colors.indigo,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  approveText: { color: '#fff', fontWeight: '800' },
  reject: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  rejectText: { color: colors.text, fontWeight: '800' },
});
