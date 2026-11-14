import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme';

export type FilterChipItem = {
  key: string;
  label: string;
};

type FilterChipsProps = {
  items: readonly FilterChipItem[];
  value: string;
  onChange: (key: string) => void;
};

/** Horizontal filter pills shared by list tabs. Tapping the active chip is a no-op. */
export function FilterChips({ items, value, onChange }: FilterChipsProps) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {items.map((item) => {
        const selected = value === item.key;
        return (
          <Pressable
            key={item.key}
            onPress={() => {
              if (selected) return;
              onChange(item.key);
            }}
            style={[
              styles.pill,
              {
                backgroundColor: selected ? theme.primary : theme.surface,
                borderColor: selected ? theme.primary : theme.border,
              },
            ]}
          >
            <Text
              style={[
                styles.text,
                {
                  color: selected ? '#ffffff' : theme.textMuted,
                  fontWeight: selected ? '600' : '500',
                },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingRight: 8, paddingBottom: 2 },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  text: { fontSize: 12 },
});
