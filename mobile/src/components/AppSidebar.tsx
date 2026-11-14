import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';
import {
  Bell,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Globe,
  House,
  Megaphone,
  Receipt,
  Send,
  ShieldCheck,
  TrendingUp,
  Trophy,
  User,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useDrawer } from '../context/DrawerContext';
import { useInbox } from '../context/InboxContext';
import { isAdmin as roleIsAdmin } from '../lib/roles';
import { resolveTabs, type TabId, type TabSpec } from '../lib/tabResolver';
import { useTheme } from '../theme';
import { Avatar } from '../ui/Avatar';
import { prettyRole } from '../ui/format';

const ICONS: Record<TabId, LucideIcon> = {
  home: House,
  daily_log: ClipboardList,
  sales: TrendingUp,
  tasks: CheckSquare,
  finance: Receipt,
  content_calendar: CalendarDays,
  website: Globe,
  ads: Megaphone,
  requests: Send,
  alerts: Bell,
  profile: User,
  won_deals: Trophy,
};

function itemActive(pathname: string, item: TabSpec): boolean {
  if (item.id === 'home') return pathname === '/' || pathname === '/(tabs)' || pathname.endsWith('/index');
  const href = item.href.replace('/(tabs)', '');
  return pathname === href || pathname.startsWith(`${href}/`) || pathname.includes(`/${item.route}`);
}

export function AppSidebar() {
  const { open, closeDrawer } = useDrawer();
  const { user } = useAuth();
  const { unreadCount } = useInbox();
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const layout = useMemo(() => resolveTabs(user), [user]);
  const isAdmin = roleIsAdmin(user?.role);
  const slide = useRef(new Animated.Value(-1)).current;
  const width = Math.min(Dimensions.get('window').width * 0.86, 340);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 0 : -1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [open, slide]);

  if (!user) return null;

  const go = (item: TabSpec) => {
    closeDrawer();
    if (itemActive(pathname, item)) return;
    router.navigate(item.href as Href);
  };

  const HomeIcon = House;
  const RequestsIcon = isAdmin ? ShieldCheck : Send;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={closeDrawer}>
      <View style={styles.overlay}>
        <Pressable style={styles.scrim} onPress={closeDrawer} accessibilityLabel="Close menu" />
        <Animated.View
          style={[
            styles.panel,
            {
              width,
              backgroundColor: theme.surface,
              paddingTop: insets.top + 8,
              paddingBottom: insets.bottom + 12,
              transform: [
                {
                  translateX: slide.interpolate({
                    inputRange: [-1, 0],
                    outputRange: [-width, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.head}>
            <Avatar name={user.name} uri={user.avatar_url} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                {user.name}
              </Text>
              <Text style={[styles.meta, { color: theme.textMuted }]} numberOfLines={1}>
                {prettyRole(user.role)}
                {user.company?.name ? ` · ${user.company.name}` : ''}
              </Text>
            </View>
            <Pressable onPress={closeDrawer} hitSlop={10} accessibilityLabel="Close menu">
              <X size={20} color={theme.textMuted} />
            </Pressable>
          </View>
          <Text style={[styles.section, { color: theme.textMuted }]}>Modules</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {layout.sidebar.map((item) => {
              const active = itemActive(pathname, item);
              const Icon =
                item.id === 'home' ? HomeIcon : item.id === 'requests' ? RequestsIcon : ICONS[item.id];
              return (
                <Pressable
                  key={item.id}
                  onPress={() => go(item)}
                  style={[
                    styles.row,
                    active && { backgroundColor: theme.primaryLight },
                  ]}
                >
                  <Icon size={18} color={active ? theme.primary : theme.text} strokeWidth={active ? 2.4 : 2} />
                  <Text style={[styles.rowLabel, { color: active ? theme.primary : theme.text }]}>
                    {item.id === 'home' ? 'Home' : item.title}
                  </Text>
                  {item.id === 'alerts' && unreadCount > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  scrim: { flex: 1 },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    paddingHorizontal: 14,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18, paddingHorizontal: 4 },
  name: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  section: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E11D48',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
