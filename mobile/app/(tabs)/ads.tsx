import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Megaphone } from 'lucide-react-native';
import { Card } from '../../src/ui/Card';
import { ModuleHeader } from '../../src/ui/ModuleHeader';
import { FadeIn } from '../../src/ui/motion';
import { useTheme } from '../../src/theme';

export default function AdsTab() {
  const theme = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <ModuleHeader title="Ads" />
      <FadeIn style={styles.wrap}>
        <Card>
          <View style={[styles.iconBox, { backgroundColor: theme.primaryLight }]}>
            <Megaphone size={28} color={theme.primary} strokeWidth={2} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Ads</Text>
          <Text style={[styles.body, { color: theme.textMuted }]}>
            Ads reporting is coming soon. Your access is already in place — this workspace will open here when the
            module ships.
          </Text>
        </Card>
      </FadeIn>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16 },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 22 },
});
