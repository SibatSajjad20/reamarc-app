import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  FileText,
  Globe,
  House,
  Megaphone,
  Receipt,
  ShieldCheck,
  TrendingUp,
  User,
  type LucideIcon,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useInbox } from '../context/InboxContext';
import { isAdmin as roleIsAdmin } from '../lib/roles';
import { resolveTabs, type TabId } from '../lib/tabResolver';
import { useTheme } from '../theme';
import { TAB_BAR_INNER } from '../ui/layout';

const ICONS: Record<TabId, LucideIcon> = {
  home: House,
  daily_log: ClipboardList,
  sales: TrendingUp,
  tasks: CheckSquare,
  finance: Receipt,
  content_calendar: CalendarDays,
  website: Globe,
  ads: Megaphone,
  requests: FileText,
  alerts: Bell,
  profile: User,
  won_deals: ShieldCheck,
};

function labelFor(id: TabId, isAdmin: boolean, title: string): string {
  if (id === 'home') return 'Home';
  if (id === 'requests') return isAdmin ? 'Approvals' : 'Requests';
  if (id === 'alerts') return isAdmin ? 'Announce' : 'Alerts';
  if (id === 'sales') return 'Pipeline';
  if (id === 'daily_log') return 'Log';
  if (id === 'content_calendar') return 'Content';
  return title.split(' ')[0];
}

function isTabActive(pathname: string, href: string, id: TabId): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  if (id === 'home') {
    return path === '/' || path === '/(tabs)' || path.endsWith('/index') || path === '';
  }
  const needle = href.replace('/(tabs)', '').replace(/\/$/, '');
  if (needle && (path === needle || path.startsWith(`${needle}/`))) return true;
  if (id === 'sales' && path.includes('/pipeline')) return true;
  if (id === 'tasks' && path.includes('/tasks')) return true;
  if (id === 'website' && path.includes('/website')) return true;
  if (id === 'content_calendar' && path.includes('/content-calendar')) return true;
  if (id === 'daily_log' && path.includes('/daily-log')) return true;
  if (id === 'finance' && path.includes('/finance')) return true;
  return false;
}

export function AppTabBar() {
  const { user } = useAuth();
  const { unreadCount } = useInbox();
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const isAdmin = roleIsAdmin(user?.role);
  const layout = useMemo(() => resolveTabs(user), [user]);
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 10 : 8);

  if (!user || !layout.tabs.length) return null;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: theme.tabBarBg,
            paddingBottom: 8,
            marginBottom: bottomPad,
            minHeight: TAB_BAR_INNER,
            shadowColor: theme.isDark ? '#000000' : '#0F172A',
            shadowOpacity: theme.isDark ? 0.35 : 0.08,
          },
        ]}
      >
        {layout.tabs.map((tab) => {
          const active = isTabActive(pathname, tab.href, tab.id);
          const Icon =
            tab.id === 'home'
              ? House
              : tab.id === 'requests'
                ? isAdmin
                  ? ShieldCheck
                  : FileText
                : tab.id === 'alerts'
                  ? isAdmin
                    ? Megaphone
                    : Bell
                  : ICONS[tab.id];
          const color = active ? theme.primary : theme.textSubtle;
          return (
            <Pressable
              key={tab.id}
              onPress={() => {
                const onStackDetail =
                  (tab.id === 'tasks' && /\/tasks\/[^/]+/.test(pathname)) ||
                  (tab.id === 'daily_log' && /\/daily-log\/.+/.test(pathname)) ||
                  (tab.id === 'sales' && pathname.includes('/pipeline/lead/'));
                if (active && !onStackDetail) return;
                router.navigate(tab.href as Href);
              }}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              accessibilityRole="button"
              accessibilityLabel={labelFor(tab.id, isAdmin, tab.title)}
              hitSlop={4}
            >
              <View>
                <Icon size={20} color={color} strokeWidth={active ? 2.4 : 1.8} />
                {tab.id === 'alerts' && unreadCount > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[styles.label, { color, fontWeight: active ? '600' : '500' }]}
                numberOfLines={1}
              >
                {labelFor(tab.id, isAdmin, tab.title)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    elevation: 20,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    borderRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 6,
    elevation: 10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minWidth: 0,
    paddingHorizontal: 2,
  },
  itemPressed: { opacity: 0.65, transform: [{ scale: 0.96 }] },
  label: {
    fontSize: 11,
    maxWidth: '100%',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E11D48',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
});
