import {
  canAccessAds,
  canAccessContentCalendar,
  canAccessCrm,
  canAccessFinance,
  canAccessTasks,
  canAccessWebsiteProjects,
  canAccessAttendance,
  canAccessDailyLog,
  canReviewRequests,
  canSeeWonDealApprovals,
  isDailyLogTracked,
  normalizeRole,
  shouldShowHomeTab,
  type RoleUserLike,
} from './roles.ts';

export type TabId =
  | 'home'
  | 'daily_log'
  | 'sales'
  | 'tasks'
  | 'finance'
  | 'content_calendar'
  | 'website'
  | 'ads'
  | 'requests'
  | 'alerts'
  | 'profile'
  | 'won_deals';

export type TabSpec = {
  id: TabId;
  route: string;
  title: string;
  href: string;
  icon: string;
  iconFocused: string;
};

export type TabLayoutResult = {
  tabs: TabSpec[];
  shortcuts: TabSpec[];
  sidebar: TabSpec[];
  landingHref: string;
  alertsInHeader: boolean;
  profileInHeader: boolean;
  showHome: boolean;
};

export const MAX_TABS = 5;

const HOME: TabSpec = {
  id: 'home',
  route: 'index',
  title: 'Home',
  href: '/(tabs)',
  icon: 'home-outline',
  iconFocused: 'home',
};
const DAILY_LOG: TabSpec = {
  id: 'daily_log',
  route: 'daily-log',
  title: 'Daily Log',
  href: '/(tabs)/daily-log',
  icon: 'document-text-outline',
  iconFocused: 'document-text',
};
const SALES: TabSpec = {
  id: 'sales',
  route: 'pipeline',
  title: 'Sales Pipeline',
  href: '/(tabs)/pipeline',
  icon: 'funnel-outline',
  iconFocused: 'funnel',
};
const TASKS: TabSpec = {
  id: 'tasks',
  route: 'tasks',
  title: 'Tasks',
  href: '/(tabs)/tasks',
  icon: 'checkbox-outline',
  iconFocused: 'checkbox',
};
const FINANCE: TabSpec = {
  id: 'finance',
  route: 'finance',
  title: 'Finance',
  href: '/(tabs)/finance',
  icon: 'card-outline',
  iconFocused: 'card',
};
const CONTENT: TabSpec = {
  id: 'content_calendar',
  route: 'content-calendar',
  title: 'Content Calendar',
  href: '/(tabs)/content-calendar',
  icon: 'calendar-outline',
  iconFocused: 'calendar',
};
const WEBSITE: TabSpec = {
  id: 'website',
  route: 'website',
  title: 'Website Pipeline',
  href: '/(tabs)/website',
  icon: 'globe-outline',
  iconFocused: 'globe',
};
const ADS: TabSpec = {
  id: 'ads',
  route: 'ads',
  title: 'Ads',
  href: '/(tabs)/ads',
  icon: 'megaphone-outline',
  iconFocused: 'megaphone',
};
const REQUESTS: TabSpec = {
  id: 'requests',
  route: 'requests',
  title: 'Requests',
  href: '/(tabs)/requests',
  icon: 'send-outline',
  iconFocused: 'send',
};
const ALERTS: TabSpec = {
  id: 'alerts',
  route: 'alerts',
  title: 'Alerts',
  href: '/(tabs)/alerts',
  icon: 'notifications-outline',
  iconFocused: 'notifications',
};
const PROFILE: TabSpec = {
  id: 'profile',
  route: 'profile',
  title: 'Profile',
  href: '/(tabs)/profile',
  icon: 'person-circle-outline',
  iconFocused: 'person-circle',
};
const WON_DEALS: TabSpec = {
  id: 'won_deals',
  route: 'won-deals',
  title: 'Won deals',
  href: '/won-deals',
  icon: 'trophy-outline',
  iconFocused: 'trophy',
};

const ALL_SCREENS: TabSpec[] = [
  HOME,
  DAILY_LOG,
  SALES,
  TASKS,
  FINANCE,
  CONTENT,
  WEBSITE,
  ADS,
  REQUESTS,
  ALERTS,
  PROFILE,
];

const QUICK_PIN: TabId[] = ['home', 'daily_log', 'tasks', 'sales', 'requests'];

export function allTabScreens(): TabSpec[] {
  return ALL_SCREENS;
}

function shouldShowRequests(user: RoleUserLike | null | undefined): boolean {
  return canAccessAttendance(user) || canReviewRequests(user);
}

function moduleCandidates(user: RoleUserLike | null | undefined): TabSpec[] {
  const role = normalizeRole(user?.role);
  const contentBeforeWebsite = role !== 'operations';
  const ordered: TabSpec[] = [];
  if (shouldShowHomeTab(user)) ordered.push(HOME);
  if (isDailyLogTracked(user)) ordered.push(DAILY_LOG);
  if (canAccessCrm(user)) ordered.push(SALES);
  if (canAccessTasks(user)) ordered.push(TASKS);
  if (canAccessFinance(user)) ordered.push(FINANCE);
  if (contentBeforeWebsite) {
    if (canAccessContentCalendar(user)) ordered.push(CONTENT);
    if (canAccessWebsiteProjects(user)) ordered.push(WEBSITE);
  } else {
    if (canAccessWebsiteProjects(user)) ordered.push(WEBSITE);
    if (canAccessContentCalendar(user)) ordered.push(CONTENT);
  }
  if (canAccessAds(user)) ordered.push(ADS);
  return ordered;
}

/**
 * Bottom bar = quick menu (max 5). Sidebar lists every allowed destination.
 */
export function resolveTabs(user?: RoleUserLike | null): TabLayoutResult {
  const modules = moduleCandidates(user);
  const showHome = modules.some((tab) => tab.id === 'home');
  const chrome: TabSpec[] = [...modules];
  if (shouldShowRequests(user)) chrome.push(REQUESTS);
  chrome.push(ALERTS, PROFILE);

  const sidebar = [...chrome];
  if (canAccessDailyLog(user) && !sidebar.some((tab) => tab.id === 'daily_log')) {
    const homeIndex = sidebar.findIndex((tab) => tab.id === 'home');
    sidebar.splice(homeIndex >= 0 ? homeIndex + 1 : 0, 0, DAILY_LOG);
  }
  if (canSeeWonDealApprovals(user) && !sidebar.some((tab) => tab.id === 'won_deals')) {
    sidebar.push(WON_DEALS);
  }

  const pinned = QUICK_PIN.map((id) => chrome.find((tab) => tab.id === id)).filter(
    (tab): tab is TabSpec => Boolean(tab),
  );
  const rest = chrome.filter((tab) => !QUICK_PIN.includes(tab.id));
  const orderedQuick = [...pinned, ...rest];
  const tabs = orderedQuick.slice(0, MAX_TABS);
  const tabIds = new Set(tabs.map((tab) => tab.id));
  const shortcuts = chrome.filter(
    (tab) => !tabIds.has(tab.id) && tab.id !== 'alerts' && tab.id !== 'profile',
  );

  return {
    tabs,
    shortcuts,
    sidebar,
    landingHref: tabs[0]?.href ?? '/(tabs)/profile',
    alertsInHeader: !tabIds.has('alerts'),
    profileInHeader: !tabIds.has('profile'),
    showHome,
  };
}

export function isMobileRouteAllowed(user: RoleUserLike | null | undefined, segments: string[]): boolean {
  const root = String(segments[0] || '');
  const leaf = String(segments[segments.length - 1] || '');
  if (!root || root === 'login' || root === 'review' || root === 'index') return true;

  const name = root === '(tabs)' ? leaf : root;
  if (name === '(tabs)' || name === 'index' || name === 'profile' || name === 'alerts') return true;
  if (name === 'pipeline' || name === 'lead') return canAccessCrm(user);
  if (name === 'won-deals') return canSeeWonDealApprovals(user) || canAccessCrm(user);
  if (name === 'daily-log') return canAccessDailyLog(user) || isDailyLogTracked(user);
  if (name === 'finance') return canAccessFinance(user);
  if (name === 'content-calendar') return canAccessContentCalendar(user);
  if (name === 'website' || name === 'website-projects') return canAccessWebsiteProjects(user);
  if (name === 'ads') return canAccessAds(user);
  if (name === 'requests') return shouldShowRequests(user);
  if (name === 'tasks') return canAccessTasks(user);
  return true;
}

export function routeForNotification(
  user: RoleUserLike | null | undefined,
  data: { type?: string; lead_id?: string; task_id?: string },
): string {
  const type = String(data?.type || '').toLowerCase();
  const layout = resolveTabs(user);
  if ((type === 'crm_lead' || type.includes('crm') || type.includes('lead')) && data.lead_id && canAccessCrm(user)) {
    return `/pipeline/lead/${encodeURIComponent(String(data.lead_id))}`;
  }
  if ((type.includes('task') || type === 'tasks') && canAccessTasks(user)) {
    if (data.task_id) return `/tasks/${encodeURIComponent(String(data.task_id))}`;
    return '/(tabs)/tasks';
  }
  if ((type.includes('attendance') || type.includes('punch') || type.includes('shift')) && shouldShowHomeTab(user)) {
    return '/(tabs)';
  }
  if ((type.includes('daily_log') || type.includes('log_')) && (canAccessDailyLog(user) || isDailyLogTracked(user))) {
    return '/(tabs)/daily-log';
  }
  return layout.landingHref;
}
