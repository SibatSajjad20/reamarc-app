import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import {
  Bell,
  CalendarDays,
  CheckSquare,
  ChevronRight,
  ClipboardList,
  Globe,
  Megaphone,
  Receipt,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react-native';
import { useInbox } from '../context/InboxContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme';
import { Avatar } from '../ui/Avatar';
import { firstName, greetingForNow } from '../ui/format';
import { PressScale } from '../ui/motion';
import type { TabId, TabSpec } from '../lib/tabResolver';
import { MenuButton } from './MenuButton';

const SHORTCUT_ICONS: Partial<Record<TabId, LucideIcon>> = {
  daily_log: ClipboardList,
  sales: TrendingUp,
  finance: Receipt,
  content_calendar: CalendarDays,
  website: Globe,
  ads: Megaphone,
  tasks: CheckSquare,
};

const SHORTCUT_TINTS: Partial<Record<TabId, { bg: string; fg: string }>> = {
  daily_log: { bg: '#ECFDF5', fg: '#059669' },
  sales: { bg: '#EEF2FF', fg: '#4F46E5' },
  finance: { bg: '#FFFBEB', fg: '#D97706' },
  content_calendar: { bg: '#F5F3FF', fg: '#7C3AED' },
  website: { bg: '#EFF6FF', fg: '#2563EB' },
  ads: { bg: '#FFF1F2', fg: '#E11D48' },
  tasks: { bg: '#EEF2FF', fg: '#4F46E5' },
};

/** Bell + avatar only. Hamburger lives on the left of the screen title. */
export function HomeHeaderActions() {
  const { unreadCount } = useInbox();
  const { user } = useAuth();
  const router = useRouter();
  const theme = useTheme();

  return (
    <View style={styles.actions} pointerEvents="box-none">
      <PressScale
        onPress={() => router.navigate('/(tabs)/alerts' as Href)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Alerts"
        style={[styles.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <Bell size={20} color={theme.text} strokeWidth={2} />
        {unreadCount > 0 ? (
          <View style={styles.badge} pointerEvents="none">
            <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        ) : null}
      </PressScale>
      <PressScale
        onPress={() => router.navigate('/(tabs)/profile' as Href)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Profile"
        style={styles.avatarBtn}
      >
        <Avatar name={user?.name} uri={user?.avatar_url} size={40} />
      </PressScale>
    </View>
  );
}

export function ScreenGreeting({
  name,
  fallback = 'there',
  fullName = false,
  subtitle,
  trailing,
}: {
  name?: string | null;
  fallback?: string;
  fullName?: boolean;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const theme = useTheme();
  const shown = fullName ? String(name || '').trim() || fallback : firstName(name, fallback);
  return (
    <View style={styles.greetingBlock}>
      <View style={styles.greetingTop} pointerEvents="box-none">
        <MenuButton />
        <View style={{ flex: 1 }} />
        {trailing}
        <HomeHeaderActions />
      </View>
      <Text style={[styles.greetKicker, { color: theme.textMuted }]}>{greetingForNow()}</Text>
      <Text style={[styles.greetName, { color: theme.text }]} numberOfLines={2}>
        {shown}
      </Text>
      {subtitle ? <View style={styles.greetSub}>{subtitle}</View> : null}
    </View>
  );
}

export function ModuleShortcutGrid({ shortcuts }: { shortcuts: TabSpec[] }) {
  const router = useRouter();
  const theme = useTheme();
  if (!shortcuts.length) return null;
  return (
    <View style={styles.shortcutBlock}>
      <Text style={[styles.shortcutTitle, { color: theme.text }]}>More modules</Text>
      <View style={styles.shortcutGrid}>
        {shortcuts.map((tab) => {
          const Icon = SHORTCUT_ICONS[tab.id] || Globe;
          const tint = theme.isDark
            ? { bg: theme.primaryLight, fg: theme.primary }
            : SHORTCUT_TINTS[tab.id] || { bg: theme.primaryLight, fg: theme.primary };
          return (
            <PressScale
              key={tab.id}
              style={[styles.shortcutCard, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => router.navigate(tab.href as Href)}
            >
              <View style={styles.shortcutRow}>
                <View style={[styles.shortcutIcon, { backgroundColor: tint.bg }]}>
                  <Icon size={18} color={tint.fg} strokeWidth={2} />
                </View>
                <Text style={[styles.shortcutLabel, { color: theme.text }]}>{tab.title}</Text>
                <ChevronRight size={16} color={theme.textMuted} />
              </View>
            </PressScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E11D48',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  greetingBlock: { marginBottom: 8, paddingHorizontal: 16, paddingTop: 4 },
  greetingTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, zIndex: 8 },
  greetKicker: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  greetName: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4 },
  greetSub: { marginTop: 6 },
  shortcutBlock: { marginTop: 4, marginBottom: 12 },
  shortcutTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  shortcutGrid: { gap: 8 },
  shortcutCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
  },
  shortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  shortcutIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutLabel: { flex: 1, fontWeight: '600', fontSize: 15 },
});
