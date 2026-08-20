import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LogOut,
  LogIn,
  CheckCircle2,
  FilePlus,
  RefreshCw,
  Sparkles,
  Info,
  Building2,
  Wifi,
  MapPin,
  Loader2,
} from 'lucide-react';
import type { TodayAttendanceResponse } from '../../types/attendance';
import { attendanceService } from '../../services/attendanceService';
import { useToast } from '../../context/ToastContext';
import { geoErrorMessage, getBrowserLocation } from '../../utils/geolocation';

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

  // Office reference coordinates (Rawalpindi HQ)
  const [officeLat, setOfficeLat] = useState(todayData?.office_latitude ?? 33.5315);
  const [officeLng, setOfficeLng] = useState(todayData?.office_longitude ?? 73.1382);
  const [geofenceLimitMeters, setGeofenceLimitMeters] = useState(todayData?.geofence_radius_meters ?? 500);

  useEffect(() => {
    if (todayData?.office_latitude && todayData?.office_longitude) {
      setOfficeLat(todayData.office_latitude);
      setOfficeLng(todayData.office_longitude);
    }
    if (todayData?.geofence_radius_meters) {
      setGeofenceLimitMeters(todayData.geofence_radius_meters);
    }
  }, [todayData?.office_latitude, todayData?.office_longitude, todayData?.geofence_radius_meters]);

  // Fetch security settings on mount as fallback
  useEffect(() => {
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
        // Keep defaults
      });
  }, []);

  // Haversine formula for GPS distance
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  };

  const formatDistance = (meters: number | null): string => {
    if (meters === null || meters === undefined) return '--';
    if (meters < 1000) {
      return `${meters}m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  };

  // Capture GPS on mount or manual refresh
  const captureGPS = useCallback(
    (showToast: boolean = false) => {
      setIsCapturingGps(true);
      setGeoError(null);

      void getBrowserLocation()
        .then((fix) => {
          setCoords(fix);
          const dist = calculateDistance(fix.lat, fix.lng, officeLat, officeLng);
          setDistanceMeters(dist);
          setIsCapturingGps(false);
          if (showToast) {
            addToast(
              dist <= geofenceLimitMeters ? 'GPS in Range 📍' : 'GPS Out of Range ⚠️',
              `Coordinates: ${fix.lat.toFixed(4)}, ${fix.lng.toFixed(4)} (${dist < 1000 ? `${dist}m` : `${(dist / 1000).toFixed(1)} km`} to HQ)`,
              dist <= geofenceLimitMeters ? 'success' : 'info'
            );
          }
        })
        .catch((error) => {
          const msg = geoErrorMessage(error);
          setGeoError(msg);
          setIsCapturingGps(false);
          if (showToast) {
            addToast('GPS Refresh Failed', msg, 'error');
          }
        });
    },
    [officeLat, officeLng, geofenceLimitMeters, addToast]
  );

  useEffect(() => {
    captureGPS(false);
  }, [captureGPS]);

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

  const punchIn = record?.punch_in || (record as any)?.check_in || todayData?.punch_status?.check_in_time || null;
  const punchOut = record?.punch_out || (record as any)?.check_out || todayData?.punch_status?.check_out_time || null;
  const isCheckedIn = Boolean(punchIn || todayData?.punch_status?.is_checked_in);
  const isCheckedOut = Boolean(punchOut || (todayData?.punch_status && !todayData.punch_status.is_checked_in && Boolean(punchIn) && Boolean(todayData.punch_status.check_out_time)));
  const windowClosed = Boolean(todayData?.shift_ended) && !isCheckedIn;
  const isAbsentLocked =
    !isCheckedIn &&
    (record?.status === 'absent' ||
      todayData?.punch_status?.current_status === 'absent' ||
      (windowClosed && !isWfh));
  const checkInClosed = windowClosed || isAbsentLocked;
  const enforceIp = todayData?.enforce_ip_whitelist ?? true;
  const enforceGps = todayData?.enforce_gps_geofence ?? true;

  const waitForGps = (): Promise<{ lat: number; lng: number; accuracy: number }> =>
    getBrowserLocation();

  // Button Action Handlers with Verification Loader
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationStep, setVerificationStep] = useState<string>('');

  const handleCheckIn = async () => {
    try {
      if (checkInClosed) {
        addToast(
          'Shift Closed',
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
          nextDistance = calculateDistance(fresh.lat, fresh.lng, officeLat, officeLng);
          setCoords(fresh);
          setDistanceMeters(nextDistance);
          setGeoError(null);
          if (nextDistance > geofenceLimitMeters) {
            addToast(
              'Out of Office Range',
              `You are ${formatDistance(nextDistance)} from the office (limit ${geofenceLimitMeters}m). Check-in blocked.`,
              'error'
            );
            return;
          }
        } catch (gpsErr) {
          const msg = geoErrorMessage(gpsErr);
          setGeoError(msg);
          nextCoords = null;
          nextDistance = null;
        }
      }

      const gpsOk =
        !enforceGps ||
        (nextCoords != null &&
          (nextDistance ?? Number.POSITIVE_INFINITY) <= geofenceLimitMeters);

      if (!isWfh && !wifiOk && !gpsOk) {
        addToast(
          'Office Wi-Fi or Location Required',
          'Connect to office Wi-Fi, or allow location while you are at the office, then try again.',
          'error'
        );
        return;
      }

      if (!isWfh && !gpsOk && wifiOk) {
        addToast(
          'Checking in via office Wi-Fi',
          'This browser could not get GPS. Office network is verified, so check-in will continue.',
          'info'
        );
      }

      setVerificationStep('Verifying Wi-Fi & Office IP...');
      await new Promise((resolve) => setTimeout(resolve, 200));
      setVerificationStep('Verifying Office GPS Geofence...');
      await new Promise((resolve) => setTimeout(resolve, 200));
      setVerificationStep('Recording Check-In Punch...');
      await attendanceService.checkIn({
        latitude: nextCoords?.lat,
        longitude: nextCoords?.lng,
        accuracy_meters: nextCoords?.accuracy,
        gps_captured_at: nextCoords ? new Date().toISOString() : undefined,
        notes: isWfh
          ? 'WFH Approved Check-In'
          : nextCoords
            ? 'Office Check-In'
            : 'Office Check-In (Wi-Fi verified, GPS unavailable)',
      });

      addToast('Check-In Successful 🎉', 'Your punch-in time has been logged.', 'success');
      onRefresh();
    } catch (err: any) {
      addToast('Check-In Verification Failed', err.message || 'Could not verify attendance punch.', 'error');
    } finally {
      setIsSubmitting(false);
      setVerificationStep('');
    }
  };

  const handleCheckOut = async () => {
    try {
      setIsSubmitting(true);
      setVerificationStep('Submitting Check-Out Punch...');
      await attendanceService.checkOut({
        notes: 'Shift check-out',
      });
      addToast('Check-Out Recorded 👋', 'Your shift has ended and timesheet calculated.', 'success');
      onRefresh();
    } catch (err: any) {
      addToast('Check-Out Failed', err.message || 'Could not record check-out.', 'error');
    } finally {
      setIsSubmitting(false);
      setVerificationStep('');
    }
  };

  // Status Badge Info
  const statusBadge = useMemo(() => {
    if (isAbsentLocked && !isCheckedIn) {
      return {
        label: 'Shift Ended — Absent',
        color: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
        dot: 'bg-rose-500',
      };
    }
    if (!isCheckedIn) {
      return {
        label: isWfh ? 'Not Checked In (WFH)' : 'Not Checked In',
        color: 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700',
        dot: 'bg-zinc-400',
      };
    }
    if (isCheckedOut) {
      return {
        label: 'Shift Completed',
        color: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
        dot: 'bg-indigo-500',
      };
    }
    if (isWfh) {
      return {
        label: 'Checked In (WFH Active)',
        color: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
        dot: 'bg-indigo-500 animate-pulse',
      };
    }
    if (record?.is_late) {
      return {
        label: `Late Arrival (+${record.late_minutes}m)`,
        color: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
        dot: 'bg-rose-500',
      };
    }
    return {
      label: 'Checked In (On-Time)',
      color: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      dot: 'bg-emerald-500 animate-pulse',
    };
  }, [record, isCheckedIn, isCheckedOut, isWfh, isAbsentLocked]);

  const wifiOk = isWfh || !enforceIp || todayData?.is_ip_verified === true;
  const gpsInRange =
    isWfh ||
    !enforceGps ||
    (coords !== null && (distanceMeters ?? Number.POSITIVE_INFINITY) <= geofenceLimitMeters);
  const gpsClearlyOutOfRange =
    !isWfh &&
    enforceGps &&
    coords !== null &&
    (distanceMeters ?? Number.POSITIVE_INFINITY) > geofenceLimitMeters;
  const securityBlocksCheckIn = !isWfh && (gpsClearlyOutOfRange || (!wifiOk && !gpsInRange));

  return (
    <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800/90 shadow-sm p-6 relative overflow-hidden">
      {/* Header Strip: Title, security pills, status */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-zinc-100 dark:border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-950 dark:text-zinc-50 flex items-center gap-2">
                Attendance Terminal
              </h2>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
              wifiOk
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
            }`}
          >
            <Wifi className="w-3 h-3" />
            {isWfh
              ? 'Home network'
              : wifiOk
              ? `Allowed IP${todayData?.client_ip ? ` · ${todayData.client_ip}` : ''}`
              : `IP not allowed${todayData?.client_ip ? ` · ${todayData.client_ip}` : ''}`}
          </span>

          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
              gpsInRange
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : gpsClearlyOutOfRange
                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
            }`}
          >
            <MapPin className="w-3 h-3" />
            {isWfh
              ? 'WFH exemption'
              : coords
              ? `${(distanceMeters ?? 0) <= geofenceLimitMeters ? 'In Office' : 'Out of range'} (${formatDistance(distanceMeters)})`
              : geoError
              ? wifiOk
                ? 'GPS unavailable · Wi-Fi OK'
                : 'GPS unavailable'
              : 'Acquiring GPS'}
            <button
              type="button"
              onClick={() => captureGPS(true)}
              disabled={isCapturingGps}
              className="ml-0.5 text-current/70 hover:text-current cursor-pointer"
              title="Refresh GPS location"
            >
              <RefreshCw className={`w-3 h-3 ${isCapturingGps ? 'animate-spin' : ''}`} />
            </button>
          </span>

          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${statusBadge.color}`}
          >
            <span className={`w-2 h-2 rounded-full ${statusBadge.dot}`} />
            {statusBadge.label}
          </span>
          <button
            type="button"
            onClick={() => onOpenRequestModal('leave')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 shadow-xs transition-all cursor-pointer"
          >
            <FilePlus className="w-4 h-4 text-indigo-500" />
            Apply Leave / WFH
          </button>
          <button
            type="button"
            onClick={() => onOpenRequestModal('regularization')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 shadow-xs transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            Correction
          </button>
        </div>
      </div>

      {/* Main Terminal Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-5">
        <div className="md:col-span-7 flex flex-col justify-between space-y-4">
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200/80 dark:border-zinc-800/90">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-200/60 dark:border-zinc-800">
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-indigo-500" />
                {shift?.name || 'Assigned Shift'}
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                {(shift?.expected_hours ?? shift?.expected_work_hours ?? 8.0)} hrs/day
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[11px] font-semibold text-zinc-400">Shift Timings:</span>
                <p className="font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">
                  {shift?.start_time || '09:30'} – {shift?.end_time || '18:30'}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-zinc-400">Grace Buffer:</span>
                <p className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {shift?.grace_period_minutes ?? 30}m (Late &gt; {lateThresholdDisplay})
                </p>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-zinc-400">Meal Break:</span>
                <p className="font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">
                  {shift?.break_duration_minutes ?? 0} mins
                </p>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-zinc-400">Night Shift:</span>
                <p className="font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">
                  {shift?.is_cross_midnight || shift?.is_night_shift ? 'Yes (Cross Midnight)' : 'Standard Day'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200/80 dark:border-zinc-800/90 text-center">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                Time In
              </span>
              <span
                className={
                  punchIn
                    ? 'text-sm font-extrabold font-mono text-emerald-600 dark:text-emerald-400'
                    : 'text-zinc-400 font-mono text-lg font-medium'
                }
              >
                {punchIn || '— : —'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200/80 dark:border-zinc-800/90 text-center">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                Time Out
              </span>
              <span
                className={
                  punchOut
                    ? 'text-sm font-extrabold font-mono text-indigo-600 dark:text-indigo-400'
                    : 'text-zinc-400 font-mono text-lg font-medium'
                }
              >
                {punchOut || '— : —'}
              </span>
            </div>
          </div>
        </div>

        <div className="md:col-span-5 flex flex-col justify-center">
          {!isCheckedIn ? (
            checkInClosed ? (
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-center flex flex-col items-center justify-center gap-1.5 text-rose-700 dark:text-rose-300 font-semibold text-sm">
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  {isAbsentLocked ? 'Shift ended — Absent' : 'Shift ended'}
                </span>
                <span className="text-xs font-medium text-rose-500 dark:text-rose-400">
                  Check-in closed after {shift?.end_time || 'shift end'}. Use Correction if this is a missed punch.
                </span>
              </div>
            ) : (
            <div className="space-y-2">
            <button
              type="button"
              onClick={handleCheckIn}
              disabled={isSubmitting || isLoading || securityBlocksCheckIn}
              className="w-full py-4 px-6 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2.5 transition-all cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{verificationStep || 'Verifying Location & Wi-Fi...'}</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <LogIn className="w-5 h-5" />
                  <span>Check In Now</span>
                </>
              )}
            </button>
            {securityBlocksCheckIn && (
              <p className="text-[11px] font-semibold text-center text-amber-600 dark:text-amber-400">
                {gpsClearlyOutOfRange
                  ? 'Check-in blocked: you are outside the office location radius.'
                  : !wifiOk
                  ? 'Check-in blocked: connect to office Wi-Fi, or allow location if you are at the office.'
                  : `Check-in blocked: ${geoError || 'waiting for GPS location.'}`}
              </p>
            )}
            {!securityBlocksCheckIn && !isWfh && geoError && wifiOk && (
              <p className="text-[11px] font-medium text-center text-zinc-500 dark:text-zinc-400">
                GPS is unavailable in this browser. Check-in will use office Wi-Fi instead.
              </p>
            )}
            </div>
            )
          ) : isCheckedOut ? (
            <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-center flex items-center justify-center gap-2.5 text-zinc-700 dark:text-zinc-300 font-semibold text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <span>
                Today's Shift Finished (
                {record?.working_hours_minutes
                  ? `${Math.floor(record.working_hours_minutes / 60)}h ${String(
                      record.working_hours_minutes % 60
                    ).padStart(2, '0')}m worked`
                  : 'Completed'}
                )
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleCheckOut}
              disabled={isSubmitting}
              className="w-full py-4 px-6 rounded-xl font-bold text-sm text-white bg-rose-600 hover:bg-rose-500 active:scale-[0.99] shadow-md shadow-rose-600/20 flex items-center justify-center gap-2.5 transition-all cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{verificationStep || 'Submitting Check-Out...'}</span>
                </>
              ) : (
                <>
                  <LogOut className="w-5 h-5" />
                  <span>Check Out</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
