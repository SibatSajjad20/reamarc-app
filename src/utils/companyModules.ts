export const COMPANY_MODULE_KEYS = [
  'dashboard',
  'sales',
  'active_clients',
  'content_calendar',
  'website',
  'ads',
  'attendance',
  'daily_log',
  'finance',
  'tasks',
] as const;

export type CompanyModuleKey = (typeof COMPANY_MODULE_KEYS)[number];

export const COMPANY_MODULE_LABELS: Record<CompanyModuleKey, string> = {
  dashboard: 'Dashboard',
  sales: 'Sales pipeline',
  active_clients: 'Active clients',
  content_calendar: 'Content calendar',
  website: 'Website pipeline',
  ads: 'Performance marketing',
  attendance: 'Attendance',
  daily_log: 'Daily log',
  finance: 'Accounts',
  tasks: 'Tasks',
};

type ModuleUser = {
  company_modules?: string[] | null;
} | null | undefined;

export function isCompanyModuleEnabled(user: ModuleUser, key: CompanyModuleKey | string): boolean {
  const mods = user?.company_modules;
  if (mods == null) return true;
  return mods.includes(key);
}

export function showWonDealClientWorkspaceCta(user: ModuleUser): boolean {
  return isCompanyModuleEnabled(user, 'sales') && isCompanyModuleEnabled(user, 'active_clients');
}
