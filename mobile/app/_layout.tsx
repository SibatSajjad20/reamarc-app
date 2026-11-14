import React, { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { InboxProvider } from '../src/context/InboxContext';
import { DrawerProvider } from '../src/context/DrawerContext';
import { AppSidebar } from '../src/components/AppSidebar';
import { AppTabBar } from '../src/components/AppTabBar';
import { InboxSync } from '../src/lib/inboxSync';
import { shouldSwitchCompanyForPush } from '../src/lib/notificationCompany';
import { isMobileRouteAllowed, resolveTabs, routeForNotification } from '../src/lib/tabResolver';
import { TruckLoader } from '../src/ui/TruckLoader';
import { ThemeProvider, useThemeMode, colors } from '../src/theme';
import { FontProvider } from '../src/theme/FontProvider';
import { APP_FONT } from '../src/theme/typography';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function setupAndroidNotificationChannel() {
  if (Platform.OS === 'android') {
    const channelOpts = {
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#965cfd',
      sound: 'default',
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    };
    await Notifications.setNotificationChannelAsync('oneworklane_alerts_v1', {
      name: 'OneWorkLane Alerts',
      ...channelOpts,
    });
    await Notifications.setNotificationChannelAsync('reamarc_alerts_v2', {
      name: 'OneWorkLane Alerts',
      ...channelOpts,
    });
  }
}

function Gate({ children }: { children: React.ReactNode }) {
  const { user, loading, switchCompany } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) return;
    const onLogin = segments[0] === 'login';
    const onReview = segments[0] === 'review';
    if (!user && !onLogin && !onReview) router.replace('/login');
    if (user && onLogin) {
      router.replace(resolveTabs(user).landingHref as any);
    }
  }, [user, loading, segments, router]);

  React.useEffect(() => {
    if (loading || !user) return;
    const parts = segments.map(String);
    if (parts[0] === 'login' || parts[0] === 'review') return;
    if (!isMobileRouteAllowed(user, parts)) {
      router.replace(resolveTabs(user).landingHref as any);
    }
  }, [user, loading, segments, router]);

  React.useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = (response?.notification?.request?.content?.data || {}) as {
        type?: string;
        lead_id?: string;
        task_id?: string;
        company_id?: string;
      };
      const run = async () => {
        const target = shouldSwitchCompanyForPush(user?.company_id, data, user?.companies);
        if (target) {
          try {
            await switchCompany(target);
          } catch {
            /* stay on current company */
          }
        }
        const href = routeForNotification(user, data);
        if (data?.type === 'crm_lead' && data?.lead_id && href.includes('/pipeline/lead/')) {
          router.push({ pathname: '/pipeline/lead/[id]', params: { id: String(data.lead_id) } });
          return;
        }
        router.push(href as any);
      };
      void run();
    });
    return () => sub.remove();
  }, [router, user, user?.company_id, user?.companies, switchCompany]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <TruckLoader label="Loading OneWorkLane..." size={1.05} />
      </View>
    );
  }
  const onLogin = segments[0] === 'login';
  const onReview = segments[0] === 'review';

  return (
    <View style={{ flex: 1 }}>
      {children}
      {user && !onLogin && !onReview ? <AppTabBar /> : null}
      {user ? <AppSidebar /> : null}
    </View>
  );
}

function InnerApp() {
  const { isDark, theme } = useThemeMode();
  return (
    <AuthProvider>
      <InboxProvider>
        <DrawerProvider>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <Gate>
            <InboxSync />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.bg },
                headerTitleStyle: {
                  fontFamily: APP_FONT.semibold,
                },
                headerBackTitleStyle: {
                  fontFamily: APP_FONT.medium,
                },
              }}
            >
              <Stack.Screen name="login" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="pipeline" />
              <Stack.Screen name="won-deals" />
              <Stack.Screen name="daily-log" />
              <Stack.Screen name="tasks" />
              <Stack.Screen name="review" />
            </Stack>
          </Gate>
        </DrawerProvider>
      </InboxProvider>
    </AuthProvider>
  );
}

export default function RootLayout() {
  useEffect(() => {
    setupAndroidNotificationChannel().catch((err) =>
      console.warn('[notifications] Failed to set Android notification channel:', err)
    );
  }, []);

  return (
    <FontProvider>
      <ThemeProvider>
        <InnerApp />
      </ThemeProvider>
    </FontProvider>
  );
}
