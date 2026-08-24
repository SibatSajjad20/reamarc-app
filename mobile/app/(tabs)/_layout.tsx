import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';
import { useInbox } from '../../src/context/InboxContext';
import { useAuth } from '../../src/context/AuthContext';

function iconName(route: string, focused: boolean, isAdmin: boolean): keyof typeof Ionicons.glyphMap {
  if (route === 'index') {
    return isAdmin ? (focused ? 'pie-chart' : 'pie-chart-outline') : focused ? 'finger-print' : 'time-outline';
  }
  if (route === 'requests') {
    return isAdmin ? (focused ? 'shield-checkmark' : 'shield-checkmark-outline') : focused ? 'send' : 'document-text-outline';
  }
  if (route === 'alerts') {
    return isAdmin ? (focused ? 'megaphone' : 'megaphone-outline') : focused ? 'notifications' : 'notifications-outline';
  }
  return focused ? 'person-circle' : 'person-circle-outline';
}

export default function TabsLayout() {
  const { unreadCount } = useInbox();
  const { user } = useAuth();
  const isAdmin = String(user?.role || '').toLowerCase() === 'admin' || String(user?.role || '').toLowerCase() === 'super_admin';

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.indigo,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
        tabBarIcon: ({ focused, color }) => (
          <View>
            <Ionicons name={iconName(route.name, focused, isAdmin)} size={22} color={color} />
            {route.name === 'alerts' && unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            ) : null}
          </View>
        ),
        tabBarStyle: {
          backgroundColor: 'rgba(255,255,255,0.96)',
          borderTopWidth: 1,
          borderTopColor: colors.line,
          borderRadius: 22,
          marginHorizontal: 12,
          marginBottom: Platform.OS === 'ios' ? 8 : 10,
          height: Platform.OS === 'ios' ? 78 : 68,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 16 : 8,
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          elevation: 12,
          shadowColor: '#0F172A',
          shadowOpacity: 0.12,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: isAdmin ? 'Overview' : 'Punch' }} />
      <Tabs.Screen name="requests" options={{ title: isAdmin ? 'Approvals' : 'Requests' }} />
      <Tabs.Screen name="alerts" options={{ title: isAdmin ? 'Announce' : 'Notifications' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -5,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
