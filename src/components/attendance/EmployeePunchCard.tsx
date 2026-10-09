import React from 'react';
import {
  LogOut,
  LogIn,
  CheckCircle2,
  CalendarOff,
  Building2,
  Wifi,
  RefreshCw,
  Plus,
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
  onNavigateView,
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

  // Subtitle from shift
  const shiftSubtitle = (() => {
    if (!shift?.start_time || !shift?.end_time) return null;
    const name = shift.name ? `${shift.name} · ` : '';
    return `${name}${shift.start_time} – ${shift.end_time}`;
  })();

  // Inline callout note when something is wrong
  const alertNote = (() => {
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
        <div className={cn('bg-surface border border-border rounded-lg shadow-xs p-4 space-y-3', className)}>
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <Skeleton className="w-20 h-4 rounded-sm" />
            <Skeleton className="w-24 h-4 rounded-full" />
          </div>
          <div className="space-y-1">
            <Skeleton className="w-28 h-7 rounded-sm" />
            <Skeleton className="w-20 h-3 rounded-sm" />
          </div>
          {!isOps && <Skeleton className="w-full h-1.5 rounded-full" />}
          <div className="flex gap-2 pt-1">
            <Skeleton className="flex-1 h-8 rounded-md" />
            {!isOps && <Skeleton className="flex-1 h-8 rounded-md" />}
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
    return (
      <div className={cn('bg-surface border border-border rounded-lg shadow-xs overflow-hidden flex flex-col justify-between', className)}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <h3 className="text-ui font-semibold text-fg">Your day</h3>
            <StatusPill
              variant={statusPill.variant}
              dot
              label={statusPill.label}
            />
          </div>
          {shiftSubtitle && (
            <div className="text-xs text-fg-muted font-numeric">
              {shiftSubtitle}
            </div>
          )}
        </div>

        <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
          <div className="space-y-3">
            {/* Body */}
            <div>
              <div className="text-kpi font-semibold text-fg font-numeric tracking-tight flex items-baseline gap-1.5">
                {isCheckedIn || isCheckedOut ? (
                  <>
                    <span>{elapsedAtWork}</span>
                    <span className="text-sm font-normal text-fg-muted">at work</span>
                  </>
                ) : (
                  <span>—</span>
                )}
              </div>
              <div className="text-xs text-fg-muted mt-0.5 font-numeric">
                {isCheckedOut ? (
                  `checked out ${formatCheckTime(punchOut)}`
                ) : isCheckedIn ? (
                  `since ${formatCheckTime(punchIn)}`
                ) : (
                  'Check in to start your day'
                )}
              </div>
            </div>

            {/* Logged Xh of Yh (loggers only) */}
            {!isOps && (
              <div>
                <div className="flex items-center justify-between text-xs text-fg-muted mb-1 font-numeric">
                  {expectedHours !== undefined && expectedHours > 0 ? (
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
                {expectedHours !== undefined && expectedHours > 0 && (
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

            {/* Amber inline note (compact Callout) */}
            {alertNote && (
              <Callout variant="warning" className="p-2 text-xs">
                {alertNote}
              </Callout>
            )}
          </div>

          {/* Footer Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            {isOffDay ? (
              <Button variant="secondary" size="sm" disabled className="flex-1" icon={CalendarOff}>
                {offDayLabel}
              </Button>
            ) : !isCheckedIn ? (
              checkInClosed ? (
                <Button variant="secondary" size="sm" disabled className="flex-1">
                  {isAbsentLocked ? 'Shift ended — absent' : 'Check-in closed'}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={handleCheckIn}
                  disabled={isSubmitting || isLoading || securityBlocksCheckIn}
                  loading={isSubmitting}
                  icon={LogIn}
                >
                  {isSubmitting ? (verificationStep || 'Verifying…') : 'Check in'}
                </Button>
              )
            ) : isCheckedOut ? (
              <Button variant="secondary" size="sm" disabled className="flex-1" icon={CheckCircle2}>
                Shift completed
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={handleCheckOut}
                disabled={isSubmitting}
                loading={isSubmitting}
                icon={LogOut}
              >
                {isSubmitting ? (verificationStep || 'Submitting…') : 'Check out'}
              </Button>
            )}

            {!isOps && (
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                onClick={() => onNavigateView?.('daily-log')}
                icon={Plus}
              >
                Log work
              </Button>
            )}
          </div>
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
