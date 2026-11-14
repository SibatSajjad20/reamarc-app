import React, { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import {
  Geist_400Regular,
  Geist_400Regular_Italic,
  Geist_500Medium,
  Geist_500Medium_Italic,
  Geist_600SemiBold,
  Geist_600SemiBold_Italic,
  useFonts,
} from '@expo-google-fonts/geist';
import { Ionicons } from '@expo/vector-icons';

SplashScreen.preventAutoHideAsync().catch(() => {});

export function FontProvider({ children }: { children: React.ReactNode }) {
  const [loaded] = useFonts({
    Geist_400Regular,
    Geist_400Regular_Italic,
    Geist_500Medium,
    Geist_500Medium_Italic,
    Geist_600SemiBold,
    Geist_600SemiBold_Italic,
    ...Ionicons.font,
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loaded]);

  if (!loaded) return null;
  return <>{children}</>;
}
