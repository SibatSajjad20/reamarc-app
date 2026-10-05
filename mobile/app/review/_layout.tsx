import React from 'react';
import { Stack } from 'expo-router';

export default function ReviewLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[token]" />
    </Stack>
  );
}
