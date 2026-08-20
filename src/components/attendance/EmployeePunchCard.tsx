import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Home,
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
      if (!navigator.geolocation) {
        setGeoError('Geolocation is not supported by your browser.');
        return;
      }

      setIsCapturingGps(true);
      setGeoError(null);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const accuracy = position.coords.accuracy;
          setCoords({ lat, lng, accuracy });

          const dist = calculateDistance(lat, lng, officeLat, officeLng);
          setDistanceMeters(dist);
          setIsCapturingGps(false);

          if (showToast) {
            addToast(
              dist <= geofenceLimitMeters ? 'GPS in Range 📍' : 'GPS Out of Range ⚠️',
              `Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)} (${dist < 1000 ? `${dist}m` : `${(dist / 1000).toFixed(1)} km`} to HQ)`,
              dist <= geofenceLimitMeters ? 'success' : 'info'
            );
          }
        },
        (error) => {
          let msg = 'Unable to capture location coordinates.';
          if (error.code === error.PERMISSION_DENIED) {
            msg = 'Location permission denied by browser.';
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            msg = 'Location information is currently unavailable.';
          } else if (error.code === error.TIMEOUT) {
            msg = 'Location request timed out.';
          }
          setGeoError(msg);
          setIsCapturingGps(false);
          if (showToast) {
            addToast('GPS Refresh Failed', msg, 'error');
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
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

  // Button Action Handlers with Verification Loader
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationStep, setVerificationStep] = useState<string>('');

  const handleCheckIn = async () => {
    try {
      setIsSubmitting(true);
      setVerificationStep('Verifying Wi-Fi & Office IP...');
      await new Promise((resolve) => setTimeout(resolve, 350));

      setVerificationStep('Verifying Office GPS Geofence...');
      await new Promise((resolve) => setTimeout(resolve, 350));

      setVerificationStep('Recording Check-In Punch...');
      await attendanceService.checkIn({
        latitude: coords?.lat,
        longitude: coords?.lng,
        notes: isWfh ? 'WFH Approved Check-In' : 'Office Check-In',
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
  }, [record, isCheckedIn, isCheckedOut, isWfh]);

  return (
    <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800/90 shadow-sm p-6 relative overflow-hidden">
      {/* Header Strip: Title & Status Badge */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-zinc-100 dark:border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-950 dark:text-zinc-50 flex items-center gap-2">
                Attendance Punch Terminal
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Live check-in verification & shift tracker
              </p>
            </div>
          </div>
        </div>

        {/* Status Badge & Self-Service Buttons */}
        <div className="flex items-center gap-2.5">
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
        {/* Left Side: Shift Parameters & Punch Timings */}
        <div className="md:col-span-6 flex flex-col justify-between space-y-4">
          {/* Shift Details Box */}
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

          {/* Today's Time In / Out Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200/80 dark:border-zinc-800/90 text-center">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                Time In
              </span>
              <span className="text-sm font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                {punchIn || '— : —'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200/80 dark:border-zinc-800/90 text-center">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                Break Time
              </span>
              <span className="text-sm font-extrabold font-mono text-amber-600 dark:text-amber-400">
                {record?.break_minutes ? `${record.break_minutes}m` : '0m'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200/80 dark:border-zinc-800/90 text-center">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                Time Out
              </span>
              <span className="text-sm font-extrabold font-mono text-indigo-600 dark:text-indigo-400">
                {punchOut || '— : —'}
              </span>
            </div>
          </div>
        </div>

        {/* Right Side: Security Checks & Action Controls */}
        <div className="md:col-span-6 flex flex-col justify-between space-y-4">
          {/* Security Geofence & Network Verification Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Wi-Fi / IP Security */}
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200/80 dark:border-zinc-800/90">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                  <Wifi className="w-3 h-3 text-indigo-500" /> Office Wi-Fi / IP
                </span>
                {isWfh ? (
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                    WFH
                  </span>
                ) : todayData?.is_ip_verified ?? true ? (
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Verified
                  </span>
                ) : (
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" /> External IP
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                {isWfh
                  ? 'Home Network Allowed'
                  : todayData?.client_ip
                  ? `Office Subnet (${todayData.client_ip})`
                  : 'Office Network Whitelisted'}
              </p>
            </div>

            {/* GPS Geofence */}
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200/80 dark:border-zinc-800/90">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-emerald-500" /> GPS Geofence
                </span>
                <button
                  type="button"
                  onClick={() => captureGPS(true)}
                  disabled={isCapturingGps}
                  className="text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Refresh GPS location"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCapturingGps ? 'animate-spin text-indigo-500' : ''}`} />
                </button>
              </div>

              {isWfh ? (
                <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                  <Home className="w-3.5 h-3.5" /> WFH Exemption Active
                </p>
              ) : isCheckedIn || isCheckedOut ? (
                <div className="text-xs">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>📍 In Office (Verified at Check-In)</span>
                  </span>
                </div>
              ) : coords ? (
                <div className="text-xs">
                  <span
                    className={`font-semibold ${
                      (distanceMeters ?? 0) <= geofenceLimitMeters
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {(distanceMeters ?? 0) <= geofenceLimitMeters ? '📍 In Office ' : '📍 Out of Range '}
                    ({formatDistance(distanceMeters)} to HQ)
                  </span>
                </div>
              ) : geoError ? (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 truncate">{geoError}</p>
              ) : (
                <p className="text-xs text-zinc-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Acquiring GPS fix...
                </p>
              )}
            </div>
          </div>

          {/* Action Punch Buttons */}
          <div className="pt-2">
            {!isCheckedIn ? (
              <button
                type="button"
                onClick={handleCheckIn}
                disabled={isSubmitting || isLoading}
                className="w-full py-4 px-6 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2.5 transition-all cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{verificationStep || 'Verifying Location & Wi-Fi...'}</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    <span>Check In Now</span>
                  </>
                )}
              </button>
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
    </div>
  );
};
