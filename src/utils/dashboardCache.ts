import type {
  TodayAttendanceResponse,
  PersonalTimesheetResponse,
  DailyMatrixResponse,
  AttendanceRequest,
} from '../types/attendance';
import type {
  OperatingSnapshot,
  DayTarget,
  TeamHoursMember,
  UserLogActivity,
} from '../types/dailyLog';
import type { StageItem } from '../components/dashboard/StageCountCard';
import type { DailyStripDay, MonthDot } from '../components/dashboard/StatCards';
import type { MyHoursDay } from '../components/dashboard/MyHoursChart';

export interface DashboardCacheData {
  todayAttendance: TodayAttendanceResponse | null;
  matrixData: DailyMatrixResponse | null;
  timesheetData: PersonalTimesheetResponse | null;
  dayTarget: DayTarget | null;
  weekSnapshot: OperatingSnapshot | null;
  pendingRequests: AttendanceRequest[];
  missedInquiries: any[];
  yesterdayMissingLogCount: number;
  yesterdayMissingSubtext: string;
  teamHoursMembers: TeamHoursMember[];
  myHoursDays: MyHoursDay[];
  logExceptionsInboxCount: number;
  myActivity: UserLogActivity | null;
  myPendingInquiries: any[];
  crmStages: StageItem[];
  contentStages: StageItem[];
  websiteStages: StageItem[];
  overdueFollowupsCount: number;
  overdueFollowupsSubtext: string;
  uncontactedLeadsCount: number;
  uncontactedLeadsSubtext: string;
  calendarOverdueCount: number;
  calendarOverdueSubtext: string;
  websiteOverdueCount: number;
  weeklyLoggedHours: number;
  weeklyLoggedDays: DailyStripDay[];
  pastDaysLoggedCount: number;
  weeklyWorkedHours: number;
  weeklyWorkedDays: DailyStripDay[];
  pastDaysWorkedCount: number;
  monthDots: MonthDot[];
  workingDaysElapsed: number;
  lateStrikes: number;
  cachedAt: number;
}

const dashboardCache = new Map<string, DashboardCacheData>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function getDashboardCache(key: string): DashboardCacheData | undefined {
  const entry = dashboardCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    dashboardCache.delete(key);
    return undefined;
  }
  return entry;
}

export function setDashboardCache(key: string, data: Partial<DashboardCacheData>): void {
  const existing = dashboardCache.get(key);
  const updated: DashboardCacheData = {
    todayAttendance: null,
    matrixData: null,
    timesheetData: null,
    dayTarget: null,
    weekSnapshot: null,
    pendingRequests: [],
    missedInquiries: [],
    yesterdayMissingLogCount: 0,
    yesterdayMissingSubtext: '',
    teamHoursMembers: [],
    myHoursDays: [],
    logExceptionsInboxCount: 0,
    myActivity: null,
    myPendingInquiries: [],
    crmStages: [],
    contentStages: [],
    websiteStages: [],
    overdueFollowupsCount: 0,
    overdueFollowupsSubtext: '',
    uncontactedLeadsCount: 0,
    uncontactedLeadsSubtext: '',
    calendarOverdueCount: 0,
    calendarOverdueSubtext: '',
    websiteOverdueCount: 0,
    weeklyLoggedHours: 0,
    weeklyLoggedDays: [],
    pastDaysLoggedCount: 0,
    weeklyWorkedHours: 0,
    weeklyWorkedDays: [],
    pastDaysWorkedCount: 0,
    monthDots: [],
    workingDaysElapsed: 0,
    lateStrikes: 0,
    ...existing,
    ...data,
    cachedAt: Date.now(),
  };
  dashboardCache.set(key, updated);
}

import { registerCacheClearer } from './cacheBus';

export function clearDashboardCache(): void {
  dashboardCache.clear();
}

registerCacheClearer(clearDashboardCache);
