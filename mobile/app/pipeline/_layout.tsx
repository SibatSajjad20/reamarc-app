import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '../../src/theme';

export default function PipelineLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="lead/[id]" options={{ presentation: 'card' }} />
    </Stack>
  );
}
