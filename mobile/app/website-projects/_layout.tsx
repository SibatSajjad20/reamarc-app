import React from 'react';
import { Stack, useRouter } from 'expo-router';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldAlert } from 'lucide-react-native';
import { MenuButton } from '../../src/components/MenuButton';
import { resolveTabs } from '../../src/lib/tabResolver';
import { useAuth } from '../../src/context/AuthContext';
import { canAccessWebsiteProjects } from '../../src/lib/roles';
import { useTheme } from '../../src/theme';
import { APP_FONT } from '../../src/theme/typography';

export default function WebsiteProjectsLayout() {
  const { user } = useAuth();
  const router = useRouter();
  const theme = useTheme();

  if (!canAccessWebsiteProjects(user)) {
    return (
      <SafeAreaView style={[styles.deniedSafe, { backgroundColor: theme.bg }]}>
        <View style={styles.deniedBox}>
          <ShieldAlert size={48} color={theme.rose} />
          <Text style={[styles.deniedTitle, { color: theme.text }]}>Access Restricted</Text>
          <Text style={[styles.deniedMessage, { color: theme.textMuted }]}>
            Website Projects & Development Pipeline is accessible by Web, Development, and Management personnel.
          </Text>
          <Pressable
            style={[styles.backBtn, { backgroundColor: theme.primary }]}
            onPress={() => router.replace(resolveTabs(user).landingHref as any)}
          >
            <Text style={styles.backBtnText}>Return to Profile</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.text,
        headerTitleStyle: { fontFamily: APP_FONT.semibold, fontSize: 18 },
        headerShadowVisible: false,
        headerBackTitle: 'Back',
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Website Projects',
          headerLeft: () => <MenuButton color={theme.text} />,
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          title: 'Project Overview',
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  deniedSafe: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  deniedBox: { alignItems: 'center', maxWidth: 360, gap: 12 },
  deniedTitle: { fontSize: 20, fontWeight: '800', marginTop: 8 },
  deniedMessage: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  backBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  backBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
});
