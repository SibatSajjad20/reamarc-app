import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import {
  canSeeWonDealApprovals,
  canAccessFinance,
  canAccessContentCalendar,
  canAccessWebsiteProjects,
  canAccessDailyLog,
  canAccessAds,
  canAccessTasks,
  isCompanyModuleEnabled,
} from '../../src/lib/roles';
import { MenuButton } from '../../src/components/MenuButton';
import { resolveTabs } from '../../src/lib/tabResolver';
import { api } from '../../src/lib/api';
import { colors, API_URL, useTheme, useThemeMode, type ThemeMode } from '../../src/theme';
import { Avatar } from '../../src/ui/Avatar';
import { FadeIn } from '../../src/ui/motion';
import { employeeCode, prettyRole, relativeTime } from '../../src/ui/format';

type Device = {
  device_name?: string;
  platform?: string;
  device_uuid?: string;
  last_seen?: string;
};

export default function ProfileScreen() {
  const { user, logout, deviceUuid, switchCompany } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const { mode, setMode, isDark } = useThemeMode();

  const tabIds = new Set(resolveTabs(user).tabs.map((tab) => tab.id));
  const showWonDeals = canSeeWonDealApprovals(user);
  const showFinance = canAccessFinance(user) && !tabIds.has('finance');
  const showContentCal = canAccessContentCalendar(user) && !tabIds.has('content_calendar');
  const showWebsitePipeline = canAccessWebsiteProjects(user) && !tabIds.has('website');
  const showDailyLog = canAccessDailyLog(user) && !tabIds.has('daily_log');
  const showAds = canAccessAds(user) && !tabIds.has('ads');
  const showTasks = canAccessTasks(user) && !tabIds.has('tasks');

  const [device, setDevice] = useState<Device | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isCompanyModuleEnabled(user, 'attendance')) {
      setDevice(null);
      return;
    }
    api<Device | null>('/mobile/device')
      .then(setDevice)
      .catch(() => setDevice(null));
  }, [user]);

  const handleSwitch = async (companyId: string) => {
    if (companyId === user?.company_id || switchingId) return;
    try {
      setSwitchingId(companyId);
      await switchCompany(companyId);
    } catch (e: any) {
      Alert.alert('Switch failed', e?.message || 'Could not switch company');
    } finally {
      setSwitchingId(null);
    }
  };

  const confirmLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <MenuButton />
          <Text style={[styles.title, { color: theme.text, marginBottom: 0 }]}>Profile</Text>
        </View>
        <FadeIn>
        <View style={[styles.hero, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Avatar name={user?.name} uri={user?.avatar_url} size={72} />
          <Text style={[styles.name, { color: theme.text }]}>{user?.name}</Text>
          <Text style={[styles.email, { color: theme.textMuted }]}>{user?.email}</Text>
          <View style={styles.badges}>
            <View style={[styles.roleBadge, { backgroundColor: theme.primaryLight }]}>
              <Text style={[styles.roleText, { color: theme.primary }]}>{prettyRole(user?.role)}</Text>
            </View>
            <View style={[styles.codeBadge, { backgroundColor: theme.bgSubtle }]}>
              <Text style={[styles.codeText, { color: theme.textMuted }]}>{employeeCode(user?.id)}</Text>
            </View>
          </View>
        </View>
        </FadeIn>

        {/* Appearance & Theme Toggle */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.appearanceHead}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: theme.text }]}>Appearance</Text>
              <Text style={[styles.muted, { color: theme.textMuted }]}>
                Choose app display theme
              </Text>
            </View>
            <View
              style={[
                styles.themeActivePill,
                { backgroundColor: theme.primaryLight },
              ]}
            >
              <Ionicons
                name={isDark ? 'moon' : 'sunny'}
                size={14}
                color={theme.primary}
              />
              <Text style={[styles.themeActiveText, { color: theme.primary }]}>
                {mode === 'system' ? `System (${isDark ? 'Dark' : 'Light'})` : mode === 'dark' ? 'Dark' : 'Light'}
              </Text>
            </View>
          </View>

          <View style={styles.themeToggleRow}>
            {(
              [
                { key: 'light', label: 'Light', icon: 'sunny-outline' },
                { key: 'dark', label: 'Dark', icon: 'moon-outline' },
                { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
              ] as const
            ).map((opt) => {
              const active = mode === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setMode(opt.key)}
                  style={[
                    styles.themeOptionBtn,
                    {
                      backgroundColor: active ? theme.primaryLight : theme.bgSubtle,
                      borderColor: active ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={opt.icon as any}
                    size={17}
                    color={active ? theme.primary : theme.textMuted}
                  />
                  <Text
                    style={[
                      styles.themeOptionText,
                      { color: active ? theme.primary : theme.textMuted },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {user?.companies && user.companies.length > 1 ? (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.label, { color: theme.text }]}>Switch Company</Text>
            <Text style={[styles.muted, { color: theme.textMuted }]}>
              You belong to multiple companies. Tap to switch workspace.
            </Text>
            <View style={{ marginTop: 12, gap: 8 }}>
              {user.companies.map((c) => {
                const isActive = c.id === user.company_id;
                const isSwitching = switchingId === c.id;
                return (
                  <Pressable
                    key={c.id}
                    disabled={isActive || switchingId !== null}
                    onPress={() => handleSwitch(c.id)}
                    style={[
                      styles.companyItem,
                      {
                        backgroundColor: isActive ? theme.primaryLight : theme.bgSubtle,
                        borderColor: isActive ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.companyName,
                          { color: isActive ? theme.primary : theme.text },
                        ]}
                      >
                        {c.name}
                      </Text>
                      {c.role ? (
                        <Text style={[styles.companyRole, { color: theme.textMuted }]}>
                          {prettyRole(c.role)}
                        </Text>
                      ) : null}
                    </View>
                    {isSwitching ? (
                      <ActivityIndicator size="small" color={theme.primary} />
                    ) : isActive ? (
                      <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Department Hubs & Modules */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Department Hubs & Tools</Text>
        </View>

        {showTasks ? (
          <Pressable
            style={[styles.moduleCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => router.navigate('/(tabs)/tasks' as any)}
          >
            <View style={[styles.moduleIconBox, { backgroundColor: theme.primaryLight }]}>
              <Ionicons name="checkbox-outline" size={22} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.moduleTitle, { color: theme.text }]}>Tasks</Text>
              <Text style={[styles.muted, { color: theme.textMuted }]}>Assignments, stages and checklists</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </Pressable>
        ) : null}

        {showFinance ? (
          <Pressable
            style={[styles.moduleCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => router.navigate('/(tabs)/finance' as any)}
          >
            <View style={[styles.moduleIconBox, { backgroundColor: theme.primaryLight }]}>
              <Ionicons name="receipt-outline" size={22} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.moduleTitle, { color: theme.text }]}>Finance & Invoices</Text>
              <Text style={[styles.muted, { color: theme.textMuted }]}>Invoices, receipts & client billing</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </Pressable>
        ) : null}

        {showContentCal ? (
          <Pressable
            style={[styles.moduleCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => router.navigate('/(tabs)/content-calendar' as any)}
          >
            <View style={[styles.moduleIconBox, { backgroundColor: isDark ? 'rgba(219, 39, 119, 0.2)' : '#FDF2F8' }]}>
              <Ionicons name="calendar-outline" size={22} color="#DB2777" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.moduleTitle, { color: theme.text }]}>Content Calendar</Text>
              <Text style={[styles.muted, { color: theme.textMuted }]}>Briefs, production & client reviews</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </Pressable>
        ) : null}

        {showWebsitePipeline ? (
          <Pressable
            style={[styles.moduleCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => router.navigate('/(tabs)/website' as any)}
          >
            <View style={[styles.moduleIconBox, { backgroundColor: theme.emeraldLight }]}>
              <Ionicons name="globe-outline" size={22} color={theme.emerald} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.moduleTitle, { color: theme.text }]}>Website Pipeline</Text>
              <Text style={[styles.muted, { color: theme.textMuted }]}>Web development, milestone gates & bugs</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </Pressable>
        ) : null}

        {showAds ? (
          <Pressable
            style={[styles.moduleCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => router.push('/(tabs)/ads')}
          >
            <View style={[styles.moduleIconBox, { backgroundColor: theme.primaryLight }]}>
              <Ionicons name="megaphone-outline" size={22} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.moduleTitle, { color: theme.text }]}>Ads</Text>
              <Text style={[styles.muted, { color: theme.textMuted }]}>Campaign reporting — coming soon</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </Pressable>
        ) : null}

        {showDailyLog ? (
          <Pressable
            style={[styles.moduleCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => router.navigate('/(tabs)/daily-log' as any)}
          >
            <View style={[styles.moduleIconBox, { backgroundColor: theme.emeraldLight }]}>
              <Ionicons name="time-outline" size={22} color={theme.emerald} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.moduleTitle, { color: theme.text }]}>Daily Work Log</Text>
              <Text style={[styles.muted, { color: theme.textMuted }]}>Log work hours, tasks & project exports</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </Pressable>
        ) : null}

        {showWonDeals ? (
          <Pressable
            style={[styles.moduleCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => router.push('/won-deals')}
          >
            <View style={[styles.moduleIconBox, { backgroundColor: theme.amberLight }]}>
              <Ionicons name="trophy-outline" size={22} color={theme.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.moduleTitle, { color: theme.text }]}>Won-Deal Approvals</Text>
              <Text style={[styles.muted, { color: theme.textMuted }]}>Confirm deals that sales marked as won</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </Pressable>
        ) : null}

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.label, { color: theme.text }]}>Authorized device</Text>
          <Text style={[styles.body, { color: theme.text }]}>{device?.device_name || 'This phone'}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: theme.emerald }]} />
            <Text style={[styles.status, { color: theme.emerald }]}>Authorized Device</Text>
          </View>
          <Text style={[styles.muted, { color: theme.textMuted }]}>
            Last synced {device?.last_seen ? relativeTime(device.last_seen) : 'just now'}
          </Text>
          <Text style={[styles.muted, { marginTop: 10, color: theme.textMuted }]}>
            Lost your phone? Ask HR to transfer the device from Admin → Mobile & Alerts.
          </Text>
        </View>

        {__DEV__ ? (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Pressable style={styles.diagHead} onPress={() => setDiagOpen((v) => !v)}>
              <Text style={[styles.label, { color: theme.text }]}>Developer & Diagnostics</Text>
              <Ionicons name={diagOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textMuted} />
            </Pressable>
            {diagOpen ? (
              <View style={{ marginTop: 8, gap: 4 }}>
                <Text style={[styles.muted, { color: theme.textMuted }]}>App {Constants.expoConfig?.version || '1.0.0'}</Text>
                <Text style={[styles.muted, { color: theme.textMuted }]}>Device {deviceUuid?.slice(0, 8)}…</Text>
                <Text style={[styles.muted, { color: theme.textMuted }]}>API {API_URL}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Pressable
          style={[
            styles.logout,
            {
              backgroundColor: theme.card,
              borderColor: isDark ? '#881337' : '#FECDD3',
            },
          ]}
          onPress={confirmLogout}
        >
          <Ionicons name="log-out-outline" size={18} color={theme.rose} />
          <Text style={[styles.logoutText, { color: theme.rose }]}>Log Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  pad: { padding: 16, paddingBottom: 140 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16 },
  hero: {
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 12,
  },
  name: { fontSize: 20, fontWeight: '700', marginTop: 12 },
  email: { marginTop: 4, fontWeight: '500' },
  badges: { flexDirection: 'row', gap: 8, marginTop: 12 },
  roleBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  roleText: { fontWeight: '600', fontSize: 12 },
  codeBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  codeText: { fontWeight: '600', fontSize: 12 },
  sectionHeader: { marginTop: 8, marginBottom: 8, paddingHorizontal: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  appearanceHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  themeActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  themeActiveText: {
    fontSize: 11,
    fontWeight: '700',
  },
  themeToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  themeOptionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  themeOptionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  moduleCard: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  moduleIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleTitle: { fontSize: 15, fontWeight: '600' },
  card: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  label: { fontWeight: '700', marginBottom: 6 },
  body: { fontSize: 16, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  status: { fontWeight: '600' },
  muted: { marginTop: 3, lineHeight: 18, fontSize: 12 },
  diagHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logout: {
    marginTop: 8,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  logoutText: { fontWeight: '700' },
  companyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  companyName: {
    fontWeight: '700',
    fontSize: 14,
  },
  companyRole: {
    fontSize: 12,
    marginTop: 2,
  },
});
