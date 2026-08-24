import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/lib/api';
import { colors, API_URL } from '../../src/theme';
import { Avatar } from '../../src/ui/Avatar';
import { employeeCode, prettyRole, relativeTime } from '../../src/ui/format';

type Device = {
  device_name?: string;
  platform?: string;
  device_uuid?: string;
  last_seen?: string;
};

export default function ProfileScreen() {
  const { user, logout, deviceUuid } = useAuth();
  const [device, setDevice] = useState<Device | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);

  useEffect(() => {
    api<Device | null>('/mobile/device')
      .then(setDevice)
      .catch(() => setDevice(null));
  }, []);

  const confirmLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.pad}>
        <Text style={styles.title}>Profile</Text>
        <View style={styles.hero}>
          <Avatar name={user?.name} size={72} />
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.badges}>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{prettyRole(user?.role)}</Text>
            </View>
            <View style={styles.codeBadge}>
              <Text style={styles.codeText}>{employeeCode(user?.id)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Authorized device</Text>
          <Text style={styles.body}>{device?.device_name || 'This phone'}</Text>
          <View style={styles.statusRow}>
            <View style={styles.dot} />
            <Text style={styles.status}>Authorized Device</Text>
          </View>
          <Text style={styles.muted}>
            Last synced {device?.last_seen ? relativeTime(device.last_seen) : 'just now'}
          </Text>
          <Text style={[styles.muted, { marginTop: 10 }]}>
            Lost your phone? Ask HR to transfer the device from Admin → Mobile & Alerts.
          </Text>
        </View>

        {__DEV__ ? (
          <View style={styles.card}>
            <Pressable style={styles.diagHead} onPress={() => setDiagOpen((v) => !v)}>
              <Text style={styles.label}>Developer & Diagnostics</Text>
              <Ionicons name={diagOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
            </Pressable>
            {diagOpen ? (
              <>
                <Text style={styles.muted}>App {Constants.expoConfig?.version || '1.0.0'}</Text>
                <Text style={styles.muted}>Device {deviceUuid?.slice(0, 8)}…</Text>
                <Text style={styles.muted}>API {API_URL}</Text>
              </>
            ) : null}
          </View>
        ) : null}

        <Pressable style={styles.logout} onPress={confirmLogout}>
          <Ionicons name="log-out-outline" size={18} color={colors.rose} />
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 20, paddingBottom: 120 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 16 },
  hero: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
  },
  name: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 12 },
  email: { color: colors.muted, marginTop: 4 },
  badges: { flexDirection: 'row', gap: 8, marginTop: 12 },
  roleBadge: { backgroundColor: '#EEF2FF', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  roleText: { color: colors.indigo, fontWeight: '800', fontSize: 12 },
  codeBadge: { backgroundColor: '#F4F4F5', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  codeText: { color: colors.slate, fontWeight: '800', fontSize: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  label: { fontWeight: '800', color: colors.text, marginBottom: 6 },
  body: { color: colors.text, fontSize: 16, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.emerald },
  status: { color: colors.emerald, fontWeight: '800' },
  muted: { color: colors.muted, marginTop: 4, lineHeight: 18 },
  diagHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logout: {
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: '#FECDD3',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.card,
  },
  logoutText: { color: colors.rose, fontWeight: '800' },
});
