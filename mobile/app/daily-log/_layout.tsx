import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { isAdmin } from '../../src/lib/roles';
import { colors } from '../../src/theme';

export default function DailyLogLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!isAdmin(user?.role)) {
      router.replace('/(tabs)');
    }
  }, [loading, user?.role, router]);

  if (loading || !isAdmin(user?.role)) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: colors.indigo,
        headerTitleStyle: { fontWeight: '800', color: colors.text },
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Daily Logs' }} />
      <Stack.Screen name="[id]" options={{ title: 'Task Detail' }} />
    </Stack>
  );
}
