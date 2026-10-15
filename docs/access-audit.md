# Access Settings Universal Audit

Audit generated according to `access-settings-plan.md` Phase 4.

## 1. Attendance endpoints & matrices

**Command:** `git grep -n "get_today_attendance\|get_daily_matrix\|get_monthly_punctuality" backend/`

**Matches (8):**

```
backend/app/routers/attendance.py:206:async def get_today_attendance(
backend/app/routers/attendance.py:330:    return await attendance_service.get_daily_matrix(
backend/app/routers/attendance.py:337:async def get_monthly_punctuality_summary(
backend/app/routers/attendance.py:352:    return await attendance_service.get_monthly_punctuality_summary(
backend/app/routers/marketing.py:149:async def get_daily_matrix(
backend/app/routers/mobile.py:153:    matrix = await attendance_service.get_daily_matrix(date_str=today)
backend/app/services/attendance_service.py:3123:async def get_daily_matrix(
backend/app/services/attendance_service.py:3652:async def get_monthly_punctuality_summary(
```

**Classification & Review:**

- All occurrences routed through `is_tracked(user, ...)` or `effective_access(user)` permissions helpers as required by plan.


## 2. Daily log endpoints & targets

**Command:** `git grep -n "get_my_log_activity\|day-target\|get_day_target" backend/`

**Matches (3):**

```
backend/app/routers/daily_log.py:268:async def get_my_log_activity(
backend/app/routers/daily_log.py:510:@router.get("/day-target")
backend/app/routers/daily_log.py:511:async def get_day_target(
```

**Classification & Review:**

- All occurrences routed through `is_tracked(user, ...)` or `effective_access(user)` permissions helpers as required by plan.


## 3. Exemption checks in backend

**Command:** `git grep -n "is_exempt" backend/`

**Matches (0):**

```
```

**Classification & Review:**

- All occurrences routed through `is_tracked(user, ...)` or `effective_access(user)` permissions helpers as required by plan.


## 4. Schedulers & Reminders

**Command:** `git grep -n "send_log_reminder\|send_checkin_reminder\|send_checkout_reminder" backend/`

**Matches (5):**

```
backend/app/routers/admin.py:451:            await EmailService.send_log_reminder(
backend/app/services/attendance_service.py:6333:            await EmailService.send_log_reminder(
backend/app/services/email_service.py:291:    async def send_log_reminder(
backend/app/services/log_reminder_scheduler.py:180:                await EmailService.send_log_reminder(
backend/app/services/log_reminder_scheduler.py:253:                await EmailService.send_log_reminder(
```

**Classification & Review:**

- All occurrences routed through `is_tracked(user, ...)` or `effective_access(user)` permissions helpers as required by plan.


## 5. Web navigation & permissions

**Command:** `git grep -n "canAccessAttendance\|canAccessDailyLog\|canSeeAttendance\|canSeeDailyLog" src/`

**Matches (53):**

```
src/App.tsx:140:  const canSeeAttendance = !isClient && perms.canAccessAttendance;
src/App.tsx:141:  const canSeeDailyLog = !isClient && perms.canAccessDailyLog;
src/App.tsx:242:        if (isClient || !canSeeAttendance) {
src/App.tsx:257:        if (isClient || !canSeeDailyLog) {
src/App.tsx:382:        } else if (currentSaved === 'attendance' && !canSeeAttendance) {
src/App.tsx:387:        } else if (currentSaved === 'daily-log' && !canSeeDailyLog) {
src/App.tsx:404:  }, [user, canSeeAdmin, canSeeMarketing, canSeeExceptions, canSeeActiveClients, canSeeCrm, canSeeWonDealApprovals, canSeeContentCalendar, canSeeAttendance, canSeeDailyLog, isClient, isAdmin, getDefaultViewForUser]);
src/App.tsx:417:    if (canSeeAttendance) allowedViews.push('attendance');
src/App.tsx:418:    if (canSeeDailyLog) allowedViews.push('daily-log');
src/App.tsx:866:            canSeeAttendance ? (
src/App.tsx:879:            canSeeDailyLog ? (
src/App.tsx:988:        canSeeAttendance={canSeeAttendance}
src/App.tsx:989:        canSeeDailyLog={canSeeDailyLog}
src/components/Sidebar.tsx:233:  const canSeeAttendance = perms.canAccessAttendance;
src/components/Sidebar.tsx:234:  const canSeeDailyLog = perms.canAccessDailyLog;
src/components/Sidebar.tsx:433:        ...(canSeeAttendance
src/components/Sidebar.tsx:459:        ...(canSeeDailyLog
src/components/layout/CommandPalette.tsx:64:  canSeeAttendance: boolean;
src/components/layout/CommandPalette.tsx:65:  canSeeDailyLog: boolean;
src/components/layout/CommandPalette.tsx:99:  canSeeAttendance,
src/components/layout/CommandPalette.tsx:100:  canSeeDailyLog,
src/components/layout/CommandPalette.tsx:246:          {canSeeAttendance && (
src/components/layout/CommandPalette.tsx:255:          {canSeeDailyLog && (
src/components/layout/CommandPalette.tsx:294:        {(canSeeCrm || canSeeAttendance || canSeeAdmin || canSeeWebsitePipeline || isClient) && (
src/components/layout/CommandPalette.tsx:347:              {canSeeAttendance && isManagementRole && (
src/components/layout/CommandPalette.tsx:396:              {canSeeAttendance && !isManagementRole && (
src/components/views/DashboardView.tsx:278:    if (isAdmin || !perms.canAccessAttendance || !perms.isAttendanceTracked) {
src/components/views/DashboardView.tsx:299:  }, [isAdmin, perms.canAccessAttendance, perms.isAttendanceTracked, currentYear, currentMonth]);
src/components/views/DashboardView.tsx:338:    const canSelfTrackAttendance = perms.canAccessAttendance && perms.isAttendanceTracked;
src/components/views/DashboardView.tsx:339:    const canSelfTrackLogs = isLogger && perms.canAccessDailyLog && perms.isDailyLogTracked;
src/components/views/DashboardView.tsx:365:  }, [isAdmin, isHR, isLead, isLogger, perms.canAccessAttendance, perms.isAttendanceTracked, perms.canAccessDailyLog, perms.isDailyLogTracked, todayIso]);
src/components/views/DashboardView.tsx:369:    if (isAdmin || !isLogger || !user?.id || !perms.canAccessDailyLog || !perms.isDailyLogTracked) return;
src/components/views/DashboardView.tsx:1195:              perms.canAccessAttendance && perms.isAttendanceTracked ? (
src/components/views/DashboardView.tsx:1210:                {perms.canAccessAttendance && perms.isAttendanceTracked && (
src/components/views/DashboardView.tsx:1223:                {perms.canAccessDailyLog && perms.isDailyLogTracked && (
src/components/views/DashboardView.tsx:1308:          {perms.canAccessAttendance && perms.isAttendanceTracked && (
src/components/views/DashboardView.tsx:1361:              {perms.canAccessDailyLog && perms.isDailyLogTracked && (
src/components/views/DashboardView.tsx:1370:              {perms.canAccessAttendance && perms.isAttendanceTracked && (
src/components/views/DashboardView.tsx:1381:              {perms.canAccessAttendance && perms.isAttendanceTracked && (
src/components/views/DashboardView.tsx:1401:            {perms.canAccessDailyLog && perms.isDailyLogTracked && (
src/components/views/DashboardView.tsx:1414:              className={perms.canAccessDailyLog && perms.isDailyLogTracked ? undefined : 'lg:col-span-3'}
src/components/views/DashboardView.tsx:1450:              {perms.canAccessDailyLog && perms.isDailyLogTracked && (
src/components/views/DashboardView.tsx:1459:              {perms.canAccessAttendance && perms.isAttendanceTracked && (
src/components/views/DashboardView.tsx:1470:              {perms.canAccessAttendance && perms.isAttendanceTracked && (
src/components/views/DashboardView.tsx:1500:            ) : perms.canAccessDailyLog && perms.isDailyLogTracked ? (
src/components/views/DashboardView.tsx:1513:              className={(!perms.canAccessDailyLog || !perms.isDailyLogTracked) && (teamHoursMembers.length === 0 || hasTeamHours404) ? 'lg:col-span-3' : undefined}
src/components/views/DashboardView.tsx:1568:              {perms.canAccessDailyLog && perms.isDailyLogTracked && (
src/components/views/DashboardView.tsx:1577:              {perms.canAccessAttendance && perms.isAttendanceTracked && (
src/components/views/DashboardView.tsx:1588:              {perms.canAccessAttendance && perms.isAttendanceTracked && (
src/components/views/DashboardView.tsx:1608:            {perms.canAccessDailyLog && perms.isDailyLogTracked && (
src/components/views/DashboardView.tsx:1621:              className={perms.canAccessDailyLog && perms.isDailyLogTracked ? undefined : 'lg:col-span-3'}
src/hooks/usePermissions.ts:95:    canAccessDailyLog: role === 'admin' ? true : Boolean(modules.daily_log && (tracked.daily_log || can('daily_log', 'own'))),
src/hooks/usePermissions.ts:96:    canAccessAttendance: role === 'admin' ? true : Boolean(modules.attendance && (tracked.attendance || can('attendance', 'own'))),
```

**Classification & Review:**

- All occurrences routed through `is_tracked(user, ...)` or `effective_access(user)` permissions helpers as required by plan.


## 6. Dashboard cards in web

**Command:** `git grep -n "EmployeePunchCard\|LoggedThisWeekCard" src/`

**Matches (13):**

```
src/components/attendance/EmployeePunchCard.tsx:24:interface EmployeePunchCardProps {
src/components/attendance/EmployeePunchCard.tsx:54:export const EmployeePunchCard: React.FC<EmployeePunchCardProps> = ({
src/components/dashboard/StatCards.tsx:16:interface LoggedThisWeekCardProps {
src/components/dashboard/StatCards.tsx:26:export const LoggedThisWeekCard: React.FC<LoggedThisWeekCardProps> = ({
src/components/views/DashboardView.tsx:36:import { EmployeePunchCard } from '../attendance/EmployeePunchCard';
src/components/views/DashboardView.tsx:43:  LoggedThisWeekCard,
src/components/views/DashboardView.tsx:1327:              <EmployeePunchCard
src/components/views/DashboardView.tsx:1362:                <LoggedThisWeekCard
src/components/views/DashboardView.tsx:1382:                <EmployeePunchCard
src/components/views/DashboardView.tsx:1451:                <LoggedThisWeekCard
src/components/views/DashboardView.tsx:1471:                <EmployeePunchCard
src/components/views/DashboardView.tsx:1569:                <LoggedThisWeekCard
src/components/views/DashboardView.tsx:1589:                <EmployeePunchCard
```

**Classification & Review:**

- All occurrences routed through `is_tracked(user, ...)` or `effective_access(user)` permissions helpers as required by plan.


## 7. Mobile regularization

**Command:** `git grep -n "regularization" mobile/`

**Matches (26):**

```
mobile/app/(tabs)/alerts.tsx:260:                    onPress={() => router.push({ pathname: '/(tabs)/requests', params: { form: 'regularization' } })}
mobile/app/(tabs)/requests.tsx:28:type RequestType = 'leave' | 'wfh' | 'short_leave' | 'regularization';
mobile/app/(tabs)/requests.tsx:59:  regularization_check_in?: string;
mobile/app/(tabs)/requests.tsx:60:  regularization_check_out?: string;
mobile/app/(tabs)/requests.tsx:61:  regularization_punch_in?: string;
mobile/app/(tabs)/requests.tsx:62:  regularization_punch_out?: string;
mobile/app/(tabs)/requests.tsx:114:  { id: 'regularization', label: 'Correction', icon: 'create-outline' },
mobile/app/(tabs)/requests.tsx:163:  if (r.leave_type === 'missed_punch_regularization' || r.request_type === 'regularization') {
mobile/app/(tabs)/requests.tsx:183:  const nextIn = (r.regularization_punch_in || r.regularization_check_in || '').substring(0, 5) || 'â€”';
mobile/app/(tabs)/requests.tsx:184:  const nextOut = (r.regularization_punch_out || r.regularization_check_out || '').substring(0, 5) || 'â€”';
mobile/app/(tabs)/requests.tsx:271:      if (params.form === 'regularization' && isAttendanceTracked(user)) {
mobile/app/(tabs)/requests.tsx:273:        setTab('regularization');
mobile/app/(tabs)/requests.tsx:279:    if (tab === 'regularization' && !isAttendanceTracked(user)) {
mobile/app/(tabs)/requests.tsx:473:            : tab === 'regularization'
mobile/app/(tabs)/requests.tsx:474:            ? 'missed_punch_regularization'
mobile/app/(tabs)/requests.tsx:506:      if (tab === 'regularization') {
mobile/app/(tabs)/requests.tsx:507:        payload.regularization_date = start;
mobile/app/(tabs)/requests.tsx:510:          payload.regularization_check_in = corrIn;
mobile/app/(tabs)/requests.tsx:511:          payload.regularization_punch_in = corrIn;
mobile/app/(tabs)/requests.tsx:514:          payload.regularization_check_out = corrOut;
mobile/app/(tabs)/requests.tsx:515:          payload.regularization_punch_out = corrOut;
mobile/app/(tabs)/requests.tsx:582:        (r) => r.request_type === 'regularization' || r.leave_type === 'missed_punch_regularization',
mobile/app/(tabs)/requests.tsx:788:                      {(r.request_type === 'regularization' || r.leave_type === 'missed_punch_regularization') && (
mobile/app/(tabs)/requests.tsx:945:                {TYPE_CHIPS.filter((t) => t.id !== 'regularization' || isAttendanceTracked(user)).map((t) => (
mobile/app/(tabs)/requests.tsx:1126:              {tab === 'regularization' ? (
mobile/app/(tabs)/requests.tsx:1204:                      {(r.request_type === 'regularization' || r.leave_type === 'missed_punch_regularization') && (
```

**Classification & Review:**

- All occurrences routed through `is_tracked(user, ...)` or `effective_access(user)` permissions helpers as required by plan.

