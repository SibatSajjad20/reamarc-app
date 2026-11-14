import React, { useMemo } from 'react';
import { Tabs, type Href } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { isAdmin as roleIsAdmin } from '../../src/lib/roles';
import { allTabScreens, resolveTabs } from '../../src/lib/tabResolver';

function tabTitle(route: string, isAdmin: boolean, fallback: string): string {
  if (route === 'index') return 'Home';
  if (route === 'pipeline') return 'Pipeline';
  if (route === 'requests') return isAdmin ? 'Approvals' : 'Requests';
  if (route === 'alerts') return isAdmin ? 'Announce' : 'Alerts';
  if (route === 'daily-log') return 'Log';
  if (route === 'content-calendar') return 'Content';
  if (route === 'website') return 'Website';
  if (route === 'tasks') return 'Tasks';
  return fallback;
}

export default function TabsLayout() {
  const { user } = useAuth();
  const isAdmin = roleIsAdmin(user?.role);
  const layout = useMemo(() => resolveTabs(user), [user]);
  const visibleRoutes = useMemo(() => new Set(layout.tabs.map((tab) => tab.route)), [layout.tabs]);
  const screens = useMemo(() => {
    const rest = allTabScreens().filter((spec) => !visibleRoutes.has(spec.route));
    return [...layout.tabs, ...rest];
  }, [layout.tabs, visibleRoutes]);

  return (
    <Tabs
      tabBar={() => null}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none', height: 0 },
      }}
    >
      {screens.map((spec) => (
        <Tabs.Screen
          key={spec.route}
          name={spec.route}
          options={{
            title: tabTitle(spec.route, isAdmin, spec.title),
            href: spec.href as Href,
          }}
        />
      ))}
    </Tabs>
  );
}
