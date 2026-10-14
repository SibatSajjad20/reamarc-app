import React from 'react';
import {
  LogOut,
  LogIn,
  CheckCircle2,
  CalendarOff,
  Building2,
  Wifi,
  RefreshCw,
  Clock,
} from 'lucide-react';
import type { TodayAttendanceResponse } from '../../types/attendance';
import type { ViewType } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { usePunchFlow } from '../../hooks/usePunchFlow';
import { Button } from '../ui/button';
import { StatusPill } from '../ui/StatusPill';
import { Skeleton } from '../ui/skeleton';
import { Callout } from '../ui/Callout';
import { cn } from '../../lib/utils';
import { formatHours } from '../../utils/logTimeChecks';
import { formatNowHhMm } from '../../utils/liveNetWorkHours';

interface EmployeePunchCardProps {
  todayData: TodayAttendanceResponse | null;
  isLoading: boolean;
  onRefresh: () => void;
  onOpenRequestModal?: (defaultTab?: 'leave' | 'short_leave' | 'wfh' | 'regularization') => void;
  variant?: 'terminal' | 'your-day';
  loggedHours?: number;
  expectedHours?: number;
  hasPendingInquiry?: boolean;
  onNavigateView?: (view: ViewType) => void;
  className?: string;
}

function formatCheckTime(val?: string | null): string {
  if (!val) return '';
  if (val.includes('T')) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    }
  }
  const match = val.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }
  return val;
}

export const EmployeePunchCard: React.FC<EmployeePunchCardProps> = ({
  todayData,
  isLoading,
  onRefresh,
  variant = 'terminal',
  loggedHours,
  expectedHours,
  hasPendingInquiry = false,
  onNavigateView: _onNavigateView,
  className,
}) => {
  const { user } = useAuth();
  const flow = usePunchFlow(todayData, onRefresh);

  const {
    isWfh,
    isCheckedIn,
    isCheckedOut,
    punchIn,
    punchOut,
    isOffDay,
    offDayLabel,
    isAbsentLocked,
    checkInClosed,
    enforceIp,
    enforceGps,
    coords,
    geoError,
    isCapturingGps,
    wifiOk,
    gpsQuality,
    securityBlocksCheckIn,
    isSubmitting,
    verificationStep,
    captureGPS,
    handleCheckIn,
    handleCheckOut,
    renderVarianceModal,
    elapsedAtWork,
    record,
    shift,
  } = flow;

  const isOps = user?.role === 'operations';

  // Status Pill
  const statusPill = (() => {
    if (isOffDay && !isCheckedIn) {
      return { variant: 'neutral' as const, label: offDayLabel || 'Off' };
    }
    if (isAbsentLocked && !isCheckedIn) {
      return { variant: 'danger' as const, label: 'Absent' };
    }
    if (!isCheckedIn) {
      return { variant: 'neutral' as const, label: 'Not checked in' };
    }
    if (record?.is_late) {
      return { variant: 'warning' as const, label: 'Late' };
    }
    return { variant: 'success' as const, label: 'On time' };
  })();

  // Inline callout note when something is wrong
  const alertNote = (() => {
    if (todayData?.shift_change && (todayData.shift_change.status === 'pending' || todayData.shift_change.status === 'needs_info') && todayData.shift_change.same_day) {
      return 'Shift change pending approval before check-in. Wi-Fi and GPS rules apply.';
    }
    if (record?.is_late && record.late_minutes) {
      return `Checked in ${record.late_minutes} min after shift start.`;
    }
    if (!isWfh && enforceGps && gpsQuality === 'out_of_range') {
      return 'Outside office radius. GPS check-in blocked.';
    }
    if (!isWfh && enforceIp && !wifiOk) {
      return 'Not connected to office Wi-Fi.';
    }
    if (hasPendingInquiry) {
      return 'You have a pending missed-punch inquiry under review.';
    }
    if (geoError && !isWfh && !isCheckedIn) {
      return geoError;
    }
    return null;
  })();

  if (isLoading && !todayData) {
    if (variant === 'your-day') {
      return (
        <div className={cn('bg-surface border border-border rounded-lg shadow-xs p-4 flex flex-col justify-between', className)}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Skeleton className="w-20 h-4 rounded-sm" />
              <Skeleton className="w-24 h-5 rounded-full" />
            </div>
            <div className="space-y-1">
              <Skeleton className="w-24 h-7 rounded-sm" />
              <Skeleton className="w-36 h-3 rounded-sm" />
            </div>
            {!isOps && (
              <div className="mt-3 space-y-1">
                <Skeleton className="w-28 h-3 rounded-sm" />
                <Skeleton className="w-full h-1.5 rounded-full" />
              </div>
            )}
          </div>
          <div className="pt-3 mt-3 border-t border-border/50">
            <Skeleton className="w-full h-10 rounded-md" />
          </div>
        </div>
      );
    }

    return (
      <div className="bg-surface rounded-lg border border-border p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <Skeleton className="w-36 h-5 rounded-md" />
          <Skeleton className="w-24 h-6 rounded-full" />
        </div>
        <Skeleton className="w-full h-32 rounded-lg" />
      </div>
    );
  }

  if (variant === 'your-day') {
    const subtitleContent = (() => {
      if (isCheckedOut) {
        return (
          <span>
            Checked out: <strong className="font-bold text-fg">{formatCheckTime(punchOut)}</strong>
          </span>
        );
      }
      if (isCheckedIn) {
        return (
          <span>
            Check in: <strong className="font-bold text-fg">{formatCheckTime(punchIn)}</strong>
          </span>
        );
      }
      if (isOffDay) {
        return 'No check-in required today';
      }
      if (isAbsentLocked) {
        return 'Shift ended without check-in';
      }
      if (checkInClosed) {
        return 'Check-in window closed';
      }
      return 'Check in to start your day';
    })();

    const subtitleTooltip = (() => {
      if (isCheckedOut) return `Checked out: ${formatCheckTime(punchOut)}`;
      if (isCheckedIn) return `Check in: ${formatCheckTime(punchIn)}`;
      if (isOffDay) return 'No check-in required today';
      if (isAbsentLocked) return 'Shift ended without check-in';
      if (checkInClosed) return 'Check-in window closed';
      return 'Check in to start your day';
    })();

    const offButtonLabel = (() => {
      if (!offDayLabel) return 'Rest day';
      if (offDayLabel.includes('—')) return offDayLabel.split('—')[1].trim();
      if (offDayLabel.toLowerCase().includes('rest')) return 'Rest day';
      return offDayLabel;
    })();

    const isBreakWindow = (() => {
      if (!isCheckedIn || isCheckedOut || !shift?.break_start_time || !shift?.break_end_time) return false;
      const now = formatNowHhMm();
      return now >= shift.break_start_time && now < shift.break_end_time;
    })();

    return (
      <div className={cn('bg-surface border border-border rounded-lg shadow-xs p-4 flex flex-col justify-between', className)}>
        <div>
          {/* Header */}
          <div className="flex items-center justify-between gap-2 mb-2 min-h-[22px]">
            <div className="flex items-center gap-1.5 text-xs text-fg-muted font-medium">
              <Clock className="w-3.5 h-3.5 text-fg-muted shrink-0" />
              <span className="whitespace-nowrap">Your day</span>
            </div>
            <div className="flex items-center gap-1.5">
              {todayData?.shift_change && (todayData.shift_change.status === 'pending' || todayData.shift_change.status === 'needs_info') && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  Shift change pending
                </span>
              )}
              {((record?.shift_changed || todayData?.record?.shift_changed) || (todayData?.shift_change && todayData.shift_change.status === 'approved')) && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                  Shift changed
                </span>
              )}
              <StatusPill
                variant={statusPill.variant}
                dot
                label={statusPill.label}
              />
            </div>
          </div>

          {/* Shift change comparison preview */}
          {todayData?.shift_change && (todayData.shift_change.status === 'pending' || todayData.shift_change.status === 'needs_info') && todayData.shift_change.requested_shift && (
            <div className="mb-2 p-2 rounded-md bg-subtle border border-border text-[11px] text-fg-muted flex items-center justify-between">
              <span className="font-medium text-fg">Requested:</span>
              <span className="font-numeric">
                {todayData.shift_change.requested_shift.name || `${todayData.shift_change.requested_shift.start_time} – ${todayData.shift_change.requested_shift.end_time}`} ({todayData.shift_change.location === 'wfh' ? 'WFH' : 'Office'})
              </span>
            </div>
          )}

          {/* Time at work KPI */}
          <div>
            <div className="text-kpi font-semibold text-fg font-numeric tracking-tight flex items-baseline gap-1">
              {isCheckedIn || isCheckedOut ? (
                <>
                  <span>{elapsedAtWork}</span>
                  <span className="text-base font-normal text-fg-muted">at work</span>
                  {isBreakWindow && (
                    <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5 ml-1 inline-flex items-center">
                      Break paused
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span>0h</span>
                  <span className="text-base font-normal text-fg-muted">at work</span>
                </>
              )}
            </div>
            <p className="text-xs text-fg-muted mt-0.5 font-numeric truncate" title={subtitleTooltip}>
              {subtitleContent}
            </p>
          </div>

          {/* Logged Xh of Yh (loggers only) */}
          {!isOps && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-fg-muted mb-1 font-numeric">
                {expectedHours !== undefined && expectedHours > 0 && !isOffDay ? (
                  <>
                    <span>
                      Logged {formatHours(loggedHours ?? 0)} of {formatHours(expectedHours)}
                    </span>
                    <span>
                      {Math.min(100, Math.round(((loggedHours ?? 0) / expectedHours) * 100))}%
                    </span>
                  </>
                ) : (
                  <span>Logged {formatHours(loggedHours ?? 0)}</span>
                )}
              </div>
              {expectedHours !== undefined && expectedHours > 0 && !isOffDay && (
                <div className="h-1 w-full bg-subtle rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, Math.round(((loggedHours ?? 0) / expectedHours) * 100))}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Inline alert note (compact Callout) */}
          {alertNote && (
            <Callout variant="warning" className="p-2 text-xs mt-2.5">
              {alertNote}
            </Callout>
          )}
        </div>

        {/* Footer Action Buttons */}
        <div className="pt-3 mt-3 border-t border-border/50">
          {isOffDay ? (
            <Button variant="secondary" size="md" disabled className="w-full h-10 font-medium" icon={CalendarOff}>
              {offButtonLabel}
            </Button>
          ) : !isCheckedIn ? (
            checkInClosed ? (
              <Button variant="secondary" size="md" disabled className="w-full h-10 font-medium">
                {isAbsentLocked ? 'Shift ended — absent' : 'Check-in closed'}
              </Button>
            ) : (
              <Button
                variant="success"
                size="md"
                className="w-full h-10 font-semibold text-sm shadow-xs bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white border border-emerald-600"
                onClick={handleCheckIn}
                disabled={isSubmitting || isLoading || securityBlocksCheckIn}
                loading={isSubmitting}
                icon={LogIn}
              >
                {isSubmitting ? (verificationStep || 'Verifying…') : 'Check in'}
              </Button>
            )
          ) : isCheckedOut ? (
            <Button variant="secondary" size="md" disabled className="w-full h-10 font-medium" icon={CheckCircle2}>
              Shift completed
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="md"
              className="w-full h-10 font-semibold text-sm shadow-xs bg-red-600 hover:bg-red-500 active:bg-red-700 text-white border border-red-600"
              onClick={handleCheckOut}
              disabled={isSubmitting}
              loading={isSubmitting}
              icon={LogOut}
            >
              {isSubmitting ? (verificationStep || 'Submitting…') : 'Check out'}
            </Button>
          )}
        </div>

        {renderVarianceModal()}
      </div>
    );
  }

  // Terminal variant (for AttendanceView or standalone terminal)
  return (
    <div className={cn('bg-surface rounded-lg border border-border shadow-xs p-5 relative', className)}>
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-subtle border border-border text-fg-muted">
            <Building2 className="w-4 h-4" />
          </div>
          <h2 className="text-ui font-semibold text-fg">Attendance terminal</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {todayData?.shift_change && (todayData.shift_change.status === 'pending' || todayData.shift_change.status === 'needs_info') && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              Shift change pending
            </span>
          )}
          {((record?.shift_changed || todayData?.record?.shift_changed) || (todayData?.shift_change && todayData.shift_change.status === 'approved')) && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
              Shift changed
            </span>
          )}
          <span
            className={cn(
              'inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-full text-xs font-medium shrink-0',
              wifiOk ? 'bg-success-bg text-success-fg' : 'bg-warning-bg text-warning-fg'
            )}
          >
            <Wifi className="w-3 h-3 shrink-0" />
            {isWfh ? 'Home network' : wifiOk ? 'Office Wi-Fi' : 'Network unverified'}
          </span>
          <StatusPill variant={statusPill.variant} dot label={statusPill.label} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-4">
        <div className="md:col-span-7 flex flex-col justify-between space-y-4">
          <div className="p-4 rounded-lg bg-subtle border border-border space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-border">
              <span className="text-xs font-semibold text-fg uppercase tracking-wider">Session</span>
              <span className="text-xs text-fg-muted font-numeric">
                {shift ? `${shift.start_time} – ${shift.end_time}` : 'No active shift'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="text-xs text-fg-muted block">Punch In</span>
                <span className="text-sm font-semibold text-fg font-numeric">
                  {punchIn ? formatCheckTime(punchIn) : '—'}
                </span>
              </div>
              <div>
                <span className="text-xs text-fg-muted block">Punch Out</span>
                <span className="text-sm font-semibold text-fg font-numeric">
                  {punchOut ? formatCheckTime(punchOut) : '—'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!isWfh && !coords && !isOffDay && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => captureGPS(true)}
                disabled={isCapturingGps}
                icon={RefreshCw}
              >
                {isCapturingGps ? 'Capturing GPS…' : 'Acquire GPS'}
              </Button>
            )}
          </div>
        </div>

        <div className="md:col-span-5 flex flex-col justify-center">
          {isOffDay ? (
            <Button variant="secondary" size="lg" disabled className="w-full h-24" icon={CalendarOff}>
              {offDayLabel}
            </Button>
          ) : !isCheckedIn ? (
            checkInClosed ? (
              <Button variant="secondary" size="lg" disabled className="w-full h-24">
                {isAbsentLocked ? 'Shift ended — absent' : 'Check-in closed'}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                className="w-full h-24 text-base"
                onClick={handleCheckIn}
                disabled={isSubmitting || isLoading || securityBlocksCheckIn}
                loading={isSubmitting}
                icon={LogIn}
              >
                {isSubmitting ? (verificationStep || 'Verifying…') : 'Check In'}
              </Button>
            )
          ) : isCheckedOut ? (
            <Button variant="secondary" size="lg" disabled className="w-full h-24" icon={CheckCircle2}>
              Shift Completed
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="lg"
              className="w-full h-24 text-base"
              onClick={handleCheckOut}
              disabled={isSubmitting}
              loading={isSubmitting}
              icon={LogOut}
            >
              {isSubmitting ? (verificationStep || 'Submitting…') : 'Check Out'}
            </Button>
          )}
        </div>
      </div>

      {renderVarianceModal()}
    </div>
  );
};
