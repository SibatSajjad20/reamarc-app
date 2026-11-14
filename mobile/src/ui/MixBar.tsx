import React from 'react';
import { StyleSheet, View } from 'react-native';

export type MixSegment = { key: string; value: number; color: string };

export function MixBar({ segments, height = 10 }: { segments: MixSegment[]; height?: number }) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  if (total <= 0) {
    return <View style={[styles.track, { height, backgroundColor: '#EEF0F7' }]} />;
  }
  return (
    <View style={[styles.track, { height }]}>
      {segments.map((s) => {
        const flex = Math.max(0, s.value);
        if (!flex) return null;
        return <View key={s.key} style={{ flex, backgroundColor: s.color }} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#EEF0F7',
  },
});
