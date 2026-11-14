import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

/** Raw color palette */
export const palette = {
  black: '#000000',
  white: '#FFFFFF',
  zinc: {
    50: '#FAFAFA',
    100: '#F4F4F5',
    200: '#E4E4E7',
    300: '#D4D4D8',
    400: '#A1A1AA',
    500: '#71717A',
    600: '#52525B',
    700: '#3F3F46',
    800: '#27272A',
    900: '#18181B',
    950: '#09090B',
  },
  brand: {
    50: '#EEF2FF',
    100: '#E0E7FF',
    200: '#C7D2FE',
    300: '#A5B4FC',
    400: '#818CF8',
    500: '#6366F1',
    600: '#4F46E5',
    700: '#4338CA',
    800: '#3730A3',
    900: '#312E81',
  },
  emerald: {
    50: '#ECFDF5',
    100: '#D1FAE5',
    500: '#10B981',
    600: '#059669',
    700: '#047857',
  },
  amber: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
  },
  rose: {
    50: '#FFF1F2',
    100: '#FFE4E6',
    500: '#F43F5E',
    600: '#E11D48',
    700: '#BE123C',
  },
};

/** Geist Light Theme Tokens */
export const lightTokens = {
  isDark: false,
  bg: '#F4F5FB',
  bgSubtle: '#EEF0F7',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  cardHover: '#FAFAFA',
  border: '#E8EAF2',
  borderSubtle: '#F0F1F7',
  text: '#111827',
  textMuted: '#6B7280',
  textSubtle: '#9CA3AF',
  primary: '#4F46E5',
  primaryLight: '#EEF2FF',
  primaryDark: '#3730A3',
  emerald: '#059669',
  emeraldLight: '#ECFDF5',
  amber: '#D97706',
  amberLight: '#FFFBEB',
  rose: '#E11D48',
  roseLight: '#FFF1F2',
  slate: '#3F3F46',
  ripple: 'rgba(0, 0, 0, 0.05)',
  tabBarBg: '#FFFFFF',
  tabBarBorder: '#E4E4E7',
};

/** Geist Dark Theme Tokens */
export const darkTokens = {
  isDark: true,
  bg: '#09090B',
  bgSubtle: '#18181B',
  surface: '#18181B',
  card: '#18181B',
  cardHover: '#27272A',
  border: '#27272A',
  borderSubtle: '#27272A',
  text: '#FAFAFA',
  textMuted: '#A1A1AA',
  textSubtle: '#71717A',
  primary: '#818CF8',
  primaryLight: 'rgba(129, 140, 248, 0.16)',
  primaryDark: '#4F46E5',
  emerald: '#10B981',
  emeraldLight: 'rgba(16, 185, 129, 0.16)',
  amber: '#F59E0B',
  amberLight: 'rgba(245, 158, 11, 0.16)',
  rose: '#FB7185',
  roseLight: 'rgba(251, 113, 133, 0.16)',
  slate: '#A1A1AA',
  ripple: 'rgba(255, 255, 255, 0.08)',
  tabBarBg: '#18181B',
  tabBarBorder: '#27272A',
};

export type ThemeTokens = typeof lightTokens;

/** Radii tokens matching modern design standards */
export const radii = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
};

/** Spacing scale */
export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
};

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeContextValue {
  theme: ThemeTokens;
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

const THEME_STORAGE_KEY = 'oneworklane_theme_mode_v2';

let activeTokens: ThemeTokens = lightTokens;

/** Backward-compatible default colors export with active theme getters */
export const colors = {
  get bg() {
    return activeTokens.bg;
  },
  get card() {
    return activeTokens.card;
  },
  get text() {
    return activeTokens.text;
  },
  get muted() {
    return activeTokens.textMuted;
  },
  get line() {
    return activeTokens.border;
  },
  get indigo() {
    return activeTokens.primary;
  },
  get indigoDark() {
    return activeTokens.primaryDark;
  },
  get emerald() {
    return activeTokens.emerald;
  },
  get amber() {
    return activeTokens.amber;
  },
  get rose() {
    return activeTokens.rose;
  },
  get slate() {
    return activeTokens.slate;
  },
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTokens,
  mode: 'light',
  isDark: false,
  setMode: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('light');

  useEffect(() => {
    SecureStore.getItemAsync(THEME_STORAGE_KEY)
      .then((saved) => {
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setModeState(saved as ThemeMode);
        }
      })
      .catch(() => {});
  }, []);

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    SecureStore.setItemAsync(THEME_STORAGE_KEY, newMode).catch(() => {});
  };

  const isDark = mode === 'dark' ? true : mode === 'light' ? false : systemScheme === 'dark';
  const theme = isDark ? darkTokens : lightTokens;
  activeTokens = theme;

  return React.createElement(
    ThemeContext.Provider,
    { value: { theme, mode, isDark, setMode } },
    children,
  );
};

export function useTheme(): ThemeTokens {
  const ctx = useContext(ThemeContext);
  return ctx?.theme || activeTokens;
}

export function useThemeMode(): ThemeContextValue {
  return useContext(ThemeContext);
}

function expoLanHostname(): string | null {
  const candidates = [
    Constants.expoConfig?.hostUri,
    Constants.expoGoConfig?.debuggerHost,
    (Constants.manifest2 as { extra?: { expoGo?: { debuggerHost?: string } } } | null)?.extra?.expoGo
      ?.debuggerHost,
  ];
  for (const c of candidates) {
    if (!c || typeof c !== 'string') continue;
    const host = c
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      ?.split(':')[0];
    if (host && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) && !host.startsWith('127.')) {
      return host;
    }
  }
  return null;
}

/** Physical phones cannot use localhost; keep the API host in sync with Expo Metro. */
function resolveApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  const lan = expoLanHostname();

  if (envUrl) {
    let resolved = envUrl;
    if (lan && /localhost|127\.0\.0\.1/i.test(envUrl)) {
      resolved = envUrl.replace(/localhost|127\.0\.0\.1/i, lan);
    }
    return resolved;
  }

  return 'https://api.oneworklane.com/api/v1';
}

export const API_URL = resolveApiUrl();
