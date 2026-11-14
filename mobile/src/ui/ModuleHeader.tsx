import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { MenuButton } from '../components/MenuButton';

export function ModuleHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <MenuButton />
      <View style={styles.text}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.sub, { color: theme.textMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  sub: { fontSize: 12, fontWeight: '500', marginTop: 1 },
});
