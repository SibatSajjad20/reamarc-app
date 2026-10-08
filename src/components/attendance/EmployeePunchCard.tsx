import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LogOut,
  LogIn,
  CheckCircle2,
  FilePlus,
  RefreshCw,
  Info,
  Building2,
  Wifi,
  MapPin,
  Loader2,
  X,
  CalendarOff,
  Clock,
} from 'lucide-react';
import type { TodayAttendanceResponse } from '../../types/attendance';
import { attendanceService } from '../../services/attendanceService';
import { useToast } from '../../context/ToastContext';
import { geoErrorMessage, getBrowserLocation, isLikelyMobile } from '../../utils/geolocation';
import {
  GEOFENCE_RADIUS_METERS,
  classifyGpsFix,
  haversineMeters,
} from '../../constants/officeLocation';
import { formatHours } from '../../utils/logTimeChecks';
import { CustomSelect } from '../ui/CustomSelect';
import { Button } from '../ui/button';
import { StatusPill } from '../ui/StatusPill';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/utils';

const OVERTIME_CATEGORY_OPTIONS = [
  { value: 'client_deadline', label: 'Client deadline' },
  { value: 'deployment', label: 'Deployment / release' },
  { value: 'meeting', label: 'Meeting ran late' },
  { value: 'other', label: 'Other' },
];

const EARLY_CHECKOUT_CATEGORY_OPTIONS = [
  { value: 'personal', label: 'Personal' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'short_leave', label: 'Looks like short leave' },
  { value: 'other', label: 'Other' },
];

const formatDistance = (meters: number | null): string => {
  if (meters === null || meters === undefined) return '--';
  if (meters < 1000) {
    return `${meters}m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
};

const formatAccuracy = (meters: number | null | undefined): string => {
  if (meters == null || !Number.isFinite(meters)) return '';
  if (meters >= 1000) return ` ±${(meters / 1000).toFixed(1)} km`;
  return ` ±${Math.round(meters)}m`;
};

interface EmployeePunchCardProps {
  todayData: TodayAttendanceResponse | null;
  isLoading: boolean;
  onRefresh: () => void;
  onOpenRequestModal: (defaultTab?: 'leave' | 'short_leave' | 'wfh' | 'regularization') => void;
}

export const EmployeePunchCard: React.FC<EmployeePunchCardProps> = ({
  todayData,
  isLoading,
  onRefresh,
  onOpenRequestModal,
}) => {
  const { addToast } = useToast();

  // Geolocation State
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [isCapturingGps, setIsCapturingGps] = useState<boolean>(false);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);

  // Office reference coordinates (Rawalpindi HQ - available to management, server-verified for others)
  const [officeLat, setOfficeLat] = useState<number | null>(todayData?.office_latitude ?? null);
  const [officeLng, setOfficeLng] = useState<number | null>(todayData?.office_longitude ?? null);
  const [geofenceLimitMeters, setGeofenceLimitMeters] = useState(
    todayData?.geofence_radius_meters ?? GEOFENCE_RADIUS_METERS
  );

  useEffect(() => {
    if (todayData?.office_latitude && todayData?.office_longitude) {
      setOfficeLat(todayData.office_latitude);
      setOfficeLng(todayData.office_longitude);
    }
    if (todayData?.geofence_radius_meters) {
      setGeofenceLimitMeters(todayData.geofence_radius_meters);
    }
  }, [todayData?.office_latitude, todayData?.office_longitude, todayData?.geofence_radius_meters]);

  // Fetch security settings only if today's payload did not already include the HQ pin.
  useEffect(() => {
    if (todayData?.office_latitude && todayData?.office_longitude) return;
    if (isLoading) return;
    attendanceService
      .getSecuritySettings()
      .then((sec) => {
        if (sec?.office_latitude && sec?.office_longitude) {
          setOfficeLat(sec.office_latitude);
          setOfficeLng(sec.office_longitude);
        }
        if (sec?.geofence_radius_meters) {
          setGeofenceLimitMeters(sec.geofence_radius_meters);
        }
      })
      .catch(() => {
        // Server-side verification mode
      });
  }, [todayData?.office_latitude, todayData?.office_longitude, isLoading]);

  // Capture GPS on mount or manual refresh
  const captureGPS = useCallback(
    (showToast: boolean = false) => {
      const request = getBrowserLocation();
      setIsCapturingGps(true);
      setGeoError(null);

      void request
        .then((fix) => {
          setCoords(fix);
          const dist = (officeLat != null && officeLng != null) ? haversineMeters(fix.lat, fix.lng, officeLat, officeLng) : null;
          setDistanceMeters(dist);
          setIsCapturingGps(false);
          if (showToast) {
            if (dist != null) {
              const quality = classifyGpsFix(dist, fix.accuracy, geofenceLimitMeters);
              addToast(
                quality === 'in_range' ? 'GPS in range' : quality === 'out_of_range' ? 'GPS out of range' : 'Location too coarse',
                `Coordinates: ${fix.lat.toFixed(4)}, ${fix.lng.toFixed(4)} (${formatDistance(dist)} to HQ${formatAccuracy(fix.accuracy)})`,
                quality === 'in_range' ? 'success' : 'info'
              );
            } else {
              addToast(
                'GPS location acquired',
                `Coordinates captured (${formatAccuracy(fix.accuracy)}). Office proximity will be verified on punch.`,
                'success'
              );
            }
          }
        })
        .catch((error) => {
          const msg = geoErrorMessage(error);
          setGeoError(msg);
          setIsCapturingGps(false);
          if (showToast) {
            addToast('GPS refresh failed', msg, 'error');
          }
        });
    },
    [officeLat, officeLng, geofenceLimitMeters, addToast]
  );

  useEffect(() => {
    if (todayData?.is_off_day) return;
    if (isLikelyMobile()) {
      setGeoError('Tap Allow location so this phone can use GPS.');
      return;
    }
    captureGPS(false);
  }, [captureGPS, todayData?.is_off_day]);

  // Record & Shift details
  const record = todayData?.record;
  const shift = todayData?.shift;
  const isWfh = useMemo(() => {
    if (record) {
      return record.status === 'wfh' || Boolean(record.is_wfh);
    }
    return Boolean(todayData?.is_wfh_approved);
  }, [record, todayData?.is_wfh_approved]);

  const lateThresholdDisplay = useMemo(() => {
    if (!shift?.start_time) return '10:00';
    const [hStr, mStr] = shift.start_time.split(':');
    const h = parseInt(hStr || '9', 10);
    const m = parseInt(mStr || '30', 10);
    const grace = shift.grace_period_minutes ?? 30;
    const totalMins = h * 60 + m + grace;
    const thH = Math.floor(totalMins / 60) % 24;
    const thM = totalMins % 60;
    return `${String(thH).padStart(2, '0')}:${String(thM).padStart(2, '0')}`;
  }, [shift]);

  const isCrossMidnightShift = useMemo(() => {
    if (!shift?.start_time || !shift?.end_time) return Boolean(shift?.is_cross_midnight || shift?.is_night_shift);
    if (shift.is_cross_midnight || shift.is_night_shift) return true;
    const [sH, sM] = shift.start_time.split(':').map((v) => parseInt(v, 10) || 0);
    const [eH, eM] = shift.end_time.split(':').map((v) => parseInt(v, 10) || 0);
    const startMins = sH * 60 + sM;
    const endMins = eH * 60 + eM;
    return endMins <= startMins;
  }, [shift]);

  const punchIn = record?.punch_in || (record as any)?.check_in || todayData?.punch_status?.check_in_time || null;
  const punchOut = record?.punch_out || (record as any)?.check_out || todayData?.punch_status?.check_out_time || null;
  const isCheckedIn = Boolean(punchIn || todayData?.punch_status?.is_checked_in);
  const isCheckedOut = Boolean(punchOut || (todayData?.punch_status && !todayData.punch_status.is_checked_in && Boolean(punchIn) && Boolean(todayData.punch_status.check_out_time)));
  const windowClosed = Boolean(todayData?.shift_ended) && !isCheckedIn;
  const isAbsentLocked = windowClosed && !isWfh;
  const checkInClosed = isAbsentLocked;
  const isOffDay = Boolean(todayData?.is_off_day);
  const offDayLabel = todayData?.off_day_label || 'Official rest day';
  const enforceIp = todayData?.enforce_ip_whitelist ?? true;
  const enforceGps = todayData?.enforce_gps_geofence ?? true;

  const waitForGps = (): Promise<{ lat: number; lng: number; accuracy: number }> =>
    getBrowserLocation();

  // Button Action Handlers with Verification Loader
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [varianceOpen, setVarianceOpen] = useState(false);
  const [varianceReason, setVarianceReason] = useState('');
  const [varianceCategory, setVarianceCategory] = useState('');
  const [verificationStep, setVerificationStep] = useState<string>('');

  const handleCheckIn = async () => {
    try {
      if (isOffDay) {
        addToast('Rest day', `${offDayLabel}. Check-in is not required.`, 'info');
        return;
      }
      if (checkInClosed) {
        addToast(
          'Shift closed',
          `Your shift ended at ${shift?.end_time || 'end of day'}. Check-in is no longer available.`,
          'error'
        );
        return;
      }

      setIsSubmitting(true);

      let nextCoords = coords;
      let nextDistance = distanceMeters;
      if (!isWfh && enforceGps) {
        setVerificationStep('Capturing GPS location...');
        try {
          const fresh = await waitForGps();
          nextCoords = fresh;
          nextDistance = (officeLat != null && officeLng != null) ? haversineMeters(fresh.lat, fresh.lng, officeLat, officeLng) : null;
          setCoords(fresh);
          setDistanceMeters(nextDistance);
          setGeoError(null);
        } catch (gpsErr) {
          const msg = geoErrorMessage(gpsErr);
          setGeoError(msg);
          nextCoords = null;
          nextDistance = null;
        }
      }

      const gpsQuality =
        nextCoords != null && nextDistance != null
          ? classifyGpsFix(nextDistance, nextCoords.accuracy, geofenceLimitMeters)
          : (nextCoords != null ? 'in_range' : 'coarse');

      if (!isWfh && enforceGps && nextDistance != null && gpsQuality === 'out_of_range' && !wifiOk) {
        addToast(
          'Out of office range',
          `You are ${formatDistance(nextDistance)} from the office (limit ${geofenceLimitMeters}m). Check-in blocked.`,
          'error'
        );
        return;
      }

      const gpsOk = !enforceGps || (nextCoords != null && (nextDistance == null || gpsQuality === 'in_range'));
      const coordsToSend = nextCoords != null && (nextDistance == null || gpsQuality === 'in_range') ? nextCoords : null;

      if (!isWfh && !wifiOk && !gpsOk) {
        addToast(
          'Office Wi-Fi or location required',
          'Connect to office Wi-Fi, or allow location while you are at the office, then try again.',
          'error'
        );
        return;
      }

      if (!isWfh && !gpsOk && wifiOk) {
        addToast(
          'Checking in via office Wi-Fi',
          gpsQuality === 'out_of_range'
            ? 'Phone location missed the office pin. Office network is verified, so check-in will continue.'
            : gpsQuality === 'coarse' && nextCoords
            ? 'Browser location is too coarse to prove you are at the office. Office network is verified, so check-in will continue.'
            : 'This browser could not get GPS. Office network is verified, so check-in will continue.',
          'info'
        );
      }

      setVerificationStep('Verifying Wi-Fi & Office IP...');
      await new Promise((resolve) => setTimeout(resolve, 200));
      setVerificationStep('Verifying Office GPS Geofence...');
      await new Promise((resolve) => setTimeout(resolve, 200));
      setVerificationStep('Recording Check-In Punch...');
      await attendanceService.checkIn({
        latitude: coordsToSend?.lat,
        longitude: coordsToSend?.lng,
        accuracy_meters: coordsToSend?.accuracy,
        gps_captured_at: coordsToSend ? new Date().toISOString() : undefined,
        notes: isWfh
          ? 'WFH Approved Check-In'
          : coordsToSend
            ? 'Office Check-In'
            : gpsQuality === 'coarse' && nextCoords
              ? 'Office Check-In (Wi-Fi verified, GPS too coarse)'
              : 'Office Check-In (Wi-Fi verified, GPS unavailable)',
      });

      addToast('Checked in', 'Your punch-in time has been logged.', 'success');
      onRefresh();
    } catch (err: any) {
      addToast('Check-in failed', err.message || 'Could not verify attendance punch.', 'error');
    } finally {
      setIsSubmitting(false);
      setVerificationStep('');
    }
  };

  const checkoutGate = todayData?.checkout_gate;
  const gateType = checkoutGate?.type || 'none';
  const needsVarianceReason = gateType === 'overtime' || gateType === 'undertime';

  const submitCheckOut = async (reason?: string, category?: string) => {
    try {
      setIsSubmitting(true);

      // Same office proof as check-in: Wi-Fi IP OR in-range GPS (server OR).
      // Previously checkout sent no GPS, so people who checked in via GPS but
      // were not on the office WAN could not check out on the website.
      let coordsToSend: { lat: number; lng: number; accuracy: number } | null = null;
      if (!isWfh && enforceGps) {
        setVerificationStep('Capturing GPS location...');
        try {
          const fresh = await waitForGps();
          const dist = (officeLat != null && officeLng != null) ? haversineMeters(fresh.lat, fresh.lng, officeLat, officeLng) : null;
          setCoords(fresh);
          setDistanceMeters(dist);
          setGeoError(null);
          const quality = dist != null ? classifyGpsFix(dist, fresh.accuracy, geofenceLimitMeters) : 'in_range';
          if (dist != null && quality === 'out_of_range' && !wifiOk) {
            addToast(
              'Out of office range',
              `You are ${formatDistance(dist)} from the office (limit ${geofenceLimitMeters}m). Check-out blocked.`,
              'error'
            );
            return;
          }
          if (dist == null || quality === 'in_range') {
            coordsToSend = fresh;
          }
        } catch (gpsErr) {
          setGeoError(geoErrorMessage(gpsErr));
        }
      }

      if (!isWfh && !wifiOk && !coordsToSend) {
        addToast(
          'Office Wi-Fi or location required',
          'Connect to office Wi-Fi, or allow location while you are at the office, then try again.',
          'error'
        );
        return;
      }

      setVerificationStep('Submitting check-out punch...');
      await attendanceService.checkOut({
        latitude: coordsToSend?.lat,
        longitude: coordsToSend?.lng,
        accuracy_meters: coordsToSend?.accuracy,
        gps_captured_at: coordsToSend ? new Date().toISOString() : undefined,
        notes: 'Shift check-out',
        variance_reason: reason || undefined,
        variance_category: category || undefined,
      });
      setVarianceOpen(false);
      setVarianceReason('');
      setVarianceCategory('');
      addToast('Checked out', 'Your shift has ended and timesheet calculated.', 'success');
      onRefresh();
    } catch (err: any) {
      addToast('Check-out failed', err.message || 'Could not record check-out.', 'error');
    } finally {
      setIsSubmitting(false);
      setVerificationStep('');
    }
  };

  const handleCheckOut = async () => {
    if (needsVarianceReason) {
      setVarianceOpen(true);
      return;
    }
    await submitCheckOut();
  };

  // Status Badge Info
  const statusBadge = useMemo(() => {
    if (isOffDay && !isCheckedIn) {
      return {
        label: offDayLabel || 'Public holiday',
        variant: 'warning' as const,
      };
    }
    if (isAbsentLocked && !isCheckedIn) {
      return {
        label: 'Shift ended — absent',
        variant: 'danger' as const,
      };
    }
    if (!isCheckedIn) {
      return {
        label: isWfh ? 'Not checked in (WFH)' : 'Not checked in',
        variant: 'neutral' as const,
      };
    }
    if (isCheckedOut) {
      return {
        label: 'Shift completed',
        variant: 'accent' as const,
      };
    }
    if (isWfh) {
      return {
        label: 'Checked in (WFH active)',
        variant: 'accent' as const,
      };
    }
    if (record?.is_late) {
      return {
        label: `Late arrival (+${record.late_minutes}m)`,
        variant: 'danger' as const,
      };
    }
    return {
      label: 'Checked in (on-time)',
      variant: 'success' as const,
    };
  }, [record, isCheckedIn, isCheckedOut, isWfh, isAbsentLocked, isOffDay, offDayLabel]);

  const wifiOk = isWfh || !enforceIp || todayData?.is_ip_verified === true;
  const gpsQuality =
    coords != null && distanceMeters != null
      ? classifyGpsFix(distanceMeters, coords.accuracy, geofenceLimitMeters)
      : (coords != null ? 'in_range' : 'coarse');
  const gpsInRange = isWfh || !enforceGps || (coords != null && (distanceMeters == null || gpsQuality === 'in_range'));
  const gpsClearlyOutOfRange = !isWfh && enforceGps && distanceMeters != null && gpsQuality === 'out_of_range';
  const gpsCoarse = !isWfh && enforceGps && coords != null && distanceMeters != null && gpsQuality === 'coarse';
  const securityBlocksCheckIn = !isWfh && !wifiOk && !gpsInRange;

  if (isLoading && !todayData) {
    return (
      <div className="bg-surface rounded-lg border border-border p-5 shadow-xs">
        {/* Header Strip Skeleton */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Skeleton className="w-8 h-8 rounded-md" />
            <Skeleton className="w-36 h-5 rounded-md" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="w-24 h-6 rounded-full" />
            <Skeleton className="w-28 h-6 rounded-full" />
            <Skeleton className="w-24 h-6 rounded-full" />
          </div>
        </div>

        {/* Main Terminal Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-4">
          <div className="md:col-span-7 flex flex-col justify-between space-y-3">
            <div className="p-3.5 rounded-lg bg-subtle border border-border space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-border">
                <Skeleton className="w-32 h-4 rounded" />
                <Skeleton className="w-16 h-4 rounded" />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <Skeleton className="w-20 h-3 rounded" />
                  <Skeleton className="w-28 h-4 rounded" />
                </div>
                <div className="space-y-1.5">
                  <Skeleton className="w-20 h-3 rounded" />
                  <Skeleton className="w-28 h-4 rounded" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-subtle border border-border text-center space-y-2">
                <Skeleton className="w-14 h-3 rounded mx-auto" />
                <Skeleton className="w-20 h-5 rounded mx-auto" />
              </div>
              <div className="p-3 rounded-lg bg-subtle border border-border text-center space-y-2">
                <Skeleton className="w-14 h-3 rounded mx-auto" />
                <Skeleton className="w-20 h-5 rounded mx-auto" />
              </div>
            </div>
          </div>
          <div className="md:col-span-5 flex flex-col justify-center">
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-lg border border-border shadow-xs p-5 relative">
      {/* Header Strip: Title, security pills, status, actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-subtle border border-border text-fg-muted">
            <Building2 className="w-4 h-4" />
          </div>
          <h2 className="text-ui font-semibold text-fg">
            Attendance terminal
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-full text-xs font-medium shrink-0',
              wifiOk
                ? 'bg-success-bg text-success-fg'
                : 'bg-warning-bg text-warning-fg'
            )}
          >
            <Wifi className="w-3 h-3 shrink-0" />
            {isWfh
              ? 'Home network'
              : wifiOk
              ? `Allowed IP${todayData?.client_ip ? ` · ${todayData.client_ip}` : ''}`
              : `IP not allowed${todayData?.client_ip ? ` · ${todayData.client_ip}` : ''}`}
          </span>

          <span
            className={cn(
              'inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-full text-xs font-medium shrink-0',
              isWfh
                ? 'bg-accent-soft-2 text-accent-text'
                : gpsInRange
                ? 'bg-success-bg text-success-fg'
                : gpsClearlyOutOfRange
                ? 'bg-danger-bg text-danger-fg'
                : 'bg-warning-bg text-warning-fg'
            )}
          >
            <MapPin className="w-3 h-3 shrink-0" />
            {isWfh
              ? 'WFH exemption'
              : coords
              ? distanceMeters != null
                ? gpsQuality === 'in_range'
                  ? `In office (${formatDistance(distanceMeters)}${formatAccuracy(coords.accuracy)})`
                  : gpsQuality === 'out_of_range'
                    ? `Out of range (${formatDistance(distanceMeters)}${formatAccuracy(coords.accuracy)})`
                    : `Location coarse (${formatDistance(distanceMeters)}${formatAccuracy(coords.accuracy)})${wifiOk ? ' · Wi-Fi OK' : ''}`
                : `GPS ready (${formatAccuracy(coords.accuracy)})`
              : isCapturingGps
              ? 'Acquiring GPS'
              : 'Allow location'}
            <button
              type="button"
              onClick={() => captureGPS(true)}
              disabled={isCapturingGps}
              className="ml-0.5 inline-flex items-center justify-center w-5 h-5 text-current/70 hover:text-current cursor-pointer rounded"
              aria-label="Refresh GPS location"
              title="Allow or refresh GPS location"
            >
              <RefreshCw className={cn('w-3 h-3', isCapturingGps && 'animate-spin')} />
            </button>
          </span>

          <StatusPill
            variant={statusBadge.variant}
            label={statusBadge.label}
          />

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onOpenRequestModal('leave')}
            icon={FilePlus}
          >
            Apply leave / WFH
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onOpenRequestModal('regularization')}
            icon={Clock}
          >
            Time adjustment
          </Button>
        </div>
      </div>

      {/* Main Terminal Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-4">
        {/* Left Column: Shift Details & Punches */}
        <div className="md:col-span-7 flex flex-col justify-between space-y-3">
          <div className="p-3.5 rounded-lg bg-subtle border border-border">
            <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-border">
              <span className="text-ui font-medium text-fg flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-fg-muted" />
                {shift?.name || 'Assigned shift'}
              </span>
              <span className="text-small font-medium px-2 py-0.5 rounded-md bg-surface border border-border text-fg font-numeric">
                {formatHours(shift?.expected_hours ?? shift?.expected_work_hours ?? 8)} / day
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-small">
              <div>
                <span className="text-fg-muted">Shift timings:</span>
                <p className="font-medium text-fg mt-0.5 font-numeric">
                  {shift?.start_time || '09:30'} – {shift?.end_time || '18:30'}
                </p>
              </div>
              <div>
                <span className="text-fg-muted">Grace buffer:</span>
                <p className="font-medium text-success-fg mt-0.5 font-numeric">
                  {shift?.grace_period_minutes ?? 30}m (Late &gt; {lateThresholdDisplay})
                </p>
              </div>
              <div>
                <span className="text-fg-muted">Meal break:</span>
                <p className="font-medium text-fg mt-0.5 font-numeric">
                  {shift?.break_duration_minutes ?? 0} mins
                </p>
              </div>
              <div>
                <span className="text-fg-muted">Night shift:</span>
                <p className="font-medium text-fg mt-0.5">
                  {isCrossMidnightShift ? 'Yes (cross midnight)' : 'Standard day'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-subtle border border-border text-center">
              <span className="text-small font-medium text-fg-muted block mb-1">
                Time in
              </span>
              <span
                className={
                  punchIn
                    ? 'text-base font-semibold font-numeric text-success-fg'
                    : 'text-fg-faint font-numeric text-base font-normal'
                }
              >
                {punchIn || '— : —'}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-subtle border border-border text-center">
              <span className="text-small font-medium text-fg-muted block mb-1">
                Time out
              </span>
              <span
                className={
                  punchOut
                    ? 'text-base font-semibold font-numeric text-accent-text'
                    : 'text-fg-faint font-numeric text-base font-normal'
                }
              >
                {punchOut || '— : —'}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Actions */}
        <div className="md:col-span-5 flex flex-col justify-center">
          {isOffDay ? (
            <div className="p-4 rounded-lg bg-subtle border border-border text-center space-y-1.5">
              <CalendarOff className="w-7 h-7 text-fg-muted mx-auto" />
              <p className="text-ui font-semibold text-fg">{offDayLabel}</p>
              <p className="text-small text-fg-muted">
                Check-in and check-out are closed today. Leave, WFH, and punch corrections can still be submitted from the buttons above.
              </p>
            </div>
          ) : (
            <>
              {!coords && (
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  block
                  onClick={() => captureGPS(true)}
                  disabled={isCapturingGps}
                  icon={isCapturingGps ? Loader2 : MapPin}
                  className="mb-2.5"
                >
                  {isCapturingGps ? 'Waiting for GPS…' : 'Allow location'}
                </Button>
              )}
              {!isCheckedIn ? (
                checkInClosed ? (
                  <div className="p-4 rounded-lg bg-danger-bg border border-danger-bd text-center flex flex-col items-center justify-center gap-1 text-danger-fg text-ui font-medium">
                    <span className="inline-flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 shrink-0" />
                      {isAbsentLocked ? 'Shift ended — absent' : 'Shift ended'}
                    </span>
                    <span className="text-small text-danger-fg/80">
                      Check-in closed after {shift?.end_time || 'shift end'}. Use correction if this is a missed punch.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="primary"
                      size="lg"
                      block
                      onClick={handleCheckIn}
                      disabled={isSubmitting || isLoading || securityBlocksCheckIn}
                      loading={isSubmitting}
                      icon={LogIn}
                    >
                      {isSubmitting ? (verificationStep || 'Verifying location & Wi-Fi…') : 'Check in'}
                    </Button>
                    {shift?.start_time && shift?.end_time && (
                      <p className="text-small text-center text-fg-muted">
                        Shift starts at {shift.start_time}. Check-in stays open until {shift.end_time}.
                      </p>
                    )}
                    {securityBlocksCheckIn && (
                      <p className="text-small font-medium text-center text-warning-fg">
                        {gpsClearlyOutOfRange
                          ? 'Check-in blocked: you are outside the office location radius.'
                          : !wifiOk
                          ? 'Check-in blocked: connect to office Wi-Fi, or allow location if you are at the office.'
                          : `Check-in blocked: ${geoError || 'waiting for GPS location.'}`}
                      </p>
                    )}
                    {!securityBlocksCheckIn && !isWfh && wifiOk && (geoError || gpsCoarse || gpsClearlyOutOfRange) && (
                      <p className="text-small text-center text-fg-muted">
                        {gpsClearlyOutOfRange
                          ? 'Phone location missed the office pin. Office Wi-Fi is verified, so check-in will use the office network.'
                          : gpsCoarse
                          ? 'Browser location is too coarse to prove the office. Check-in will use office Wi-Fi instead.'
                          : 'Tap Allow location so this phone can use GPS. Check-in can still use office Wi-Fi.'}
                      </p>
                    )}
                  </div>
                )
              ) : isCheckedOut ? (
                <div className="p-4 rounded-lg bg-subtle border border-border text-center flex flex-col items-center justify-center gap-1.5 text-fg text-ui font-medium">
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-success-fg shrink-0" />
                    <span>
                      Today's shift finished (
                      {record?.working_hours_minutes
                        ? `${Math.floor(record.working_hours_minutes / 60)}h ${String(
                            record.working_hours_minutes % 60
                          ).padStart(2, '0')}m worked`
                        : 'Completed'}
                      )
                    </span>
                  </span>
                  {record?.overtime_status === 'pending' && (record.pending_overtime_minutes || 0) > 0 && (
                    <span className="text-small text-warning-fg">
                      +{String(Math.floor((record.pending_overtime_minutes || 0) / 60)).padStart(2, '0')}:
                      {String((record.pending_overtime_minutes || 0) % 60).padStart(2, '0')} overtime pending review
                    </span>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {(checkoutGate?.past_shift_end || gateType === 'overtime') && checkoutGate?.message && (
                    <p className="text-small font-medium text-center text-warning-fg px-1">
                      {checkoutGate.message}
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="destructive"
                    size="lg"
                    block
                    onClick={handleCheckOut}
                    disabled={isSubmitting}
                    loading={isSubmitting}
                    icon={LogOut}
                  >
                    {isSubmitting ? (verificationStep || 'Submitting check-out…') : 'Check out'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {varianceOpen && (
        <div className="fixed inset-0 z-50 bg-overlay flex items-center justify-center p-4">
          <div className="bg-surface rounded-lg border border-border w-full max-w-md p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-ui font-semibold text-fg">
                {gateType === 'overtime' ? 'Overtime reason required' : 'Early check-out reason'}
              </h3>
              <button
                type="button"
                onClick={() => setVarianceOpen(false)}
                className="text-fg-muted hover:text-fg p-1 rounded-md transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-small text-fg-muted leading-relaxed">
              {checkoutGate?.message ||
                (gateType === 'overtime'
                  ? `Your shift ended at ${shift?.end_time || '18:30'}. Enter the reason you stayed.`
                  : `You are leaving before ${shift?.end_time || '18:30'}. Enter the reason.`)}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (varianceReason.trim().length < 3) return;
                void submitCheckOut(varianceReason.trim(), varianceCategory || undefined);
              }}
              className="space-y-3"
            >
              <div>
                <CustomSelect
                  label="Category"
                  value={varianceCategory}
                  onChange={setVarianceCategory}
                  options={gateType === 'overtime' ? OVERTIME_CATEGORY_OPTIONS : EARLY_CHECKOUT_CATEGORY_OPTIONS}
                  placeholder="Select (optional)"
                />
              </div>
              {gateType === 'overtime' && (
                <div className="p-3 rounded-md bg-subtle border border-border text-small text-fg space-y-1">
                  <p className="font-semibold flex items-center gap-1.5 text-accent-text text-small">
                    <Clock className="w-3.5 h-3.5 shrink-0" /> Overtime work summary
                  </p>
                  <p className="text-fg-muted leading-relaxed">
                    Please provide specific details about the work you did during this overtime (e.g. ticket IDs, features completed, bugs fixed, or client meetings).
                  </p>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-small font-medium text-fg">Reason / task summary</label>
                  <span className="text-small text-fg-muted">{varianceReason.trim().length} chars</span>
                </div>
                <textarea
                  required
                  minLength={5}
                  rows={3}
                  value={varianceReason}
                  onChange={(e) => setVarianceReason(e.target.value)}
                  placeholder={
                    gateType === 'overtime'
                      ? 'Detailed breakdown of work accomplished during overtime (e.g. Fixed PR #104, deployed fix to production, attended client sync)...'
                      : 'Enter a reason for early departure...'
                  }
                  className="w-full px-3 py-2 rounded-md bg-surface border border-border-strong text-ui text-fg placeholder:text-fg-faint focus:focus-ring outline-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setVarianceOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                  disabled={isSubmitting || varianceReason.trim().length < 3}
                  loading={isSubmitting}
                >
                  Confirm check out
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

