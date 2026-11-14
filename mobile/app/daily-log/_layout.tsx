import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { canAccessDailyLog, isDailyLogTracked } from '../../src/lib/roles';
import { resolveTabs } from '../../src/lib/tabResolver';
import { colors, useTheme } from '../../src/theme';
import { APP_FONT } from '../../src/theme/typography';

export default function DailyLogLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const theme = useTheme();

  useEffect(() => {
    if (loading) return;
    if (!canAccessDailyLog(user) && !isDailyLogTracked(user)) {
      router.replace(resolveTabs(user).landingHref as any);
    }
  }, [loading, user, router]);

  if (loading || (!canAccessDailyLog(user) && !isDailyLogTracked(user))) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: colors.indigo,
        headerTitleStyle: { fontFamily: APP_FONT.semibold, color: theme.text },
        headerStyle: { backgroundColor: theme.bg },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Daily Logs' }} />
      <Stack.Screen name="[id]" options={{ title: 'Task Detail' }} />
    </Stack>
  );
}
