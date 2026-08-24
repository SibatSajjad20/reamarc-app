import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export function StatusBadge({ status }: { status?: string | null }) {
  const value = String(status || 'pending').toLowerCase();
  const tone =
    value === 'approved'
      ? { bg: '#ECFDF5', fg: colors.emerald, label: 'Approved' }
      : value === 'rejected'
        ? { bg: '#FFF1F2', fg: colors.rose, label: 'Rejected' }
        : { bg: '#FFFBEB', fg: colors.amber, label: 'Pending' };
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{tone.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  text: { fontSize: 11, fontWeight: '800' },
});
