import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Clock } from 'lucide-react';
import type { TodayAttendanceResponse } from '../types/attendance';
import { attendanceService } from '../services/attendanceService';
import { useToast } from '../context/ToastContext';
import { geoErrorMessage, getBrowserLocation, isLikelyMobile } from '../utils/geolocation';
import {
  GEOFENCE_RADIUS_METERS,
  classifyGpsFix,
  haversineMeters,
} from '../constants/officeLocation';
import { CustomSelect } from '../components/ui/CustomSelect';
import { Button } from '../components/ui/button';

export const OVERTIME_CATEGORY_OPTIONS = [
  { value: 'client_deadline', label: 'Client deadline' },
  { value: 'deployment', label: 'Deployment / release' },
  { value: 'meeting', label: 'Meeting ran late' },
  { value: 'other', label: 'Other' },
];

export const EARLY_CHECKOUT_CATEGORY_OPTIONS = [
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

export function usePunchFlow(
  todayData: TodayAttendanceResponse | null,
  onRefresh: () => void
) {
  const { addToast } = useToast();

  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [isCapturingGps, setIsCapturingGps] = useState<boolean>(false);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);

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

  useEffect(() => {
    if (todayData?.office_latitude && todayData?.office_longitude) return;
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
      .catch(() => {});
  }, [todayData?.office_latitude, todayData?.office_longitude]);

  const captureGPS = useCallback(
    (showToast: boolean = false) => {
      const request = getBrowserLocation();
      setIsCapturingGps(true);
      setGeoError(null);

      void request
        .then((fix) => {
          setCoords(fix);
          const dist =
            officeLat != null && officeLng != null
              ? haversineMeters(fix.lat, fix.lng, officeLat, officeLng)
              : null;
          setDistanceMeters(dist);
          setIsCapturingGps(false);
          if (showToast) {
            if (dist != null) {
              const quality = classifyGpsFix(dist, fix.accuracy, geofenceLimitMeters);
              addToast(
                quality === 'in_range'
                  ? 'GPS in range'
                  : quality === 'out_of_range'
                  ? 'GPS out of range'
                  : 'Location too coarse',
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

  const record = todayData?.record;
  const shift = todayData?.shift;
  const isWfh = useMemo(() => {
    if (record) {
      return record.status === 'wfh' || Boolean(record.is_wfh);
    }
    return Boolean(todayData?.is_wfh_approved);
  }, [record, todayData?.is_wfh_approved]);

  const punchIn =
    record?.punch_in ||
    (record as any)?.check_in ||
    todayData?.punch_status?.check_in_time ||
    null;
  const punchOut =
    record?.punch_out ||
    (record as any)?.check_out ||
    todayData?.punch_status?.check_out_time ||
    null;
  const isCheckedIn = Boolean(punchIn || todayData?.punch_status?.is_checked_in);
  const isCheckedOut = Boolean(
    punchOut ||
      (todayData?.punch_status &&
        !todayData.punch_status.is_checked_in &&
        Boolean(punchIn) &&
        Boolean(todayData.punch_status.check_out_time))
  );
  const windowClosed = Boolean(todayData?.shift_ended) && !isCheckedIn;
  const isAbsentLocked = windowClosed && !isWfh;
  const checkInClosed = isAbsentLocked;
  const isOffDay = Boolean(todayData?.is_off_day);
  const offDayLabel = todayData?.off_day_label || 'Official rest day';
  const enforceIp = todayData?.enforce_ip_whitelist ?? true;
  const enforceGps = todayData?.enforce_gps_geofence ?? true;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [varianceOpen, setVarianceOpen] = useState(false);
  const [varianceReason, setVarianceReason] = useState('');
  const [varianceCategory, setVarianceCategory] = useState('');
  const [verificationStep, setVerificationStep] = useState<string>('');

  const wifiOk = isWfh || !enforceIp || todayData?.is_ip_verified === true;
  const gpsQuality =
    coords != null && distanceMeters != null
      ? classifyGpsFix(distanceMeters, coords.accuracy, geofenceLimitMeters)
      : coords != null
      ? 'in_range'
      : 'coarse';
  const gpsInRange =
    isWfh || !enforceGps || (coords != null && (distanceMeters == null || gpsQuality === 'in_range'));
  const gpsClearlyOutOfRange =
    !isWfh && enforceGps && distanceMeters != null && gpsQuality === 'out_of_range';
  const gpsCoarse =
    !isWfh && enforceGps && coords != null && distanceMeters != null && gpsQuality === 'coarse';
  const securityBlocksCheckIn = !isWfh && !wifiOk && !gpsInRange;

  const waitForGps = (): Promise<{ lat: number; lng: number; accuracy: number }> =>
    getBrowserLocation();

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
          nextDistance =
            officeLat != null && officeLng != null
              ? haversineMeters(fresh.lat, fresh.lng, officeLat, officeLng)
              : null;
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

      const quality =
        nextCoords != null && nextDistance != null
          ? classifyGpsFix(nextDistance, nextCoords.accuracy, geofenceLimitMeters)
          : nextCoords != null
          ? 'in_range'
          : 'coarse';

      if (!isWfh && enforceGps && nextDistance != null && quality === 'out_of_range' && !wifiOk) {
        addToast(
          'Out of office range',
          `You are ${formatDistance(nextDistance)} from the office (limit ${geofenceLimitMeters}m). Check-in blocked.`,
          'error'
        );
        return;
      }

      const gpsOk = !enforceGps || (nextCoords != null && (nextDistance == null || quality === 'in_range'));
      const coordsToSend =
        nextCoords != null && (nextDistance == null || quality === 'in_range') ? nextCoords : null;

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
          quality === 'out_of_range'
            ? 'Phone location missed the office pin. Office network is verified, so check-in will continue.'
            : quality === 'coarse' && nextCoords
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
          : quality === 'coarse' && nextCoords
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

      let coordsToSend: { lat: number; lng: number; accuracy: number } | null = null;
      if (!isWfh && enforceGps) {
        setVerificationStep('Capturing GPS location...');
        try {
          const fresh = await waitForGps();
          const dist =
            officeLat != null && officeLng != null
              ? haversineMeters(fresh.lat, fresh.lng, officeLat, officeLng)
              : null;
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

  const elapsedAtWork = useMemo(() => {
    if (isCheckedOut && record?.working_hours_minutes) {
      const hrs = Math.floor(record.working_hours_minutes / 60);
      const mins = record.working_hours_minutes % 60;
      return `${hrs}h ${mins}m`;
    }
    if (!isCheckedIn || !punchIn) return '—';
    try {
      let inDate: Date | null = null;
      if (typeof punchIn === 'string' && punchIn.includes('T')) {
        inDate = new Date(punchIn);
      } else if (typeof punchIn === 'string') {
        const match = punchIn.match(/(\d+):(\d+)(?::\d+)?\s*(AM|PM)?/i);
        if (match) {
          let hr = parseInt(match[1], 10);
          const min = parseInt(match[2], 10);
          const ampm = match[3]?.toUpperCase();
          if (ampm === 'PM' && hr < 12) hr += 12;
          if (ampm === 'AM' && hr === 12) hr = 0;
          inDate = new Date();
          inDate.setHours(hr, min, 0, 0);
        }
      }
      if (inDate && !isNaN(inDate.getTime())) {
        const diffMs = Math.max(0, Date.now() - inDate.getTime());
        const hrs = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);
        return `${hrs}h ${mins}m`;
      }
    } catch {
      // fallback
    }
    return '—';
  }, [isCheckedIn, isCheckedOut, punchIn, record?.working_hours_minutes]);

  const renderVarianceModal = () => {
    if (!varianceOpen) return null;
    return (
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
    );
  };

  return {
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
    distanceMeters,
    officeLat,
    officeLng,
    geofenceLimitMeters,
    wifiOk,
    gpsQuality,
    gpsInRange,
    gpsClearlyOutOfRange,
    gpsCoarse,
    securityBlocksCheckIn,
    isSubmitting,
    verificationStep,
    captureGPS,
    handleCheckIn,
    handleCheckOut,
    submitCheckOut,
    varianceOpen,
    setVarianceOpen,
    varianceReason,
    setVarianceReason,
    varianceCategory,
    setVarianceCategory,
    gateType,
    needsVarianceReason,
    renderVarianceModal,
    elapsedAtWork,
    record,
    shift,
  };
}
