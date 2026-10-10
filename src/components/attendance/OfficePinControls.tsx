import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Lock, ExternalLink } from 'lucide-react';
import {
  GEOFENCE_RADIUS_METERS,
  OFFICE_LATITUDE,
  OFFICE_LONGITUDE,
  OFFICE_MAP_URL,
  classifyGpsFix,
  haversineMeters,
} from '../../constants/officeLocation';
import { geoErrorMessage, getBrowserLocation, isLikelyMobile } from '../../utils/geolocation';

type OfficePinValue = {
  office_latitude: number;
  office_longitude: number;
  geofence_radius_meters: number;
};

interface OfficePinControlsProps {
  value: OfficePinValue;
  onChange: (next: OfficePinValue) => void;
  addToast?: (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const OfficePinControls: React.FC<OfficePinControlsProps> = ({ value, onChange }) => {
  const [preview, setPreview] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
    distance: number;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (isLikelyMobile()) return;
    let cancelled = false;
    setPreviewError(null);
    void getBrowserLocation()
      .then((fix) => {
        if (cancelled) return;
        setPreview({
          lat: fix.lat,
          lng: fix.lng,
          accuracy: fix.accuracy,
          distance: haversineMeters(fix.lat, fix.lng, OFFICE_LATITUDE, OFFICE_LONGITUDE),
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setPreview(null);
        setPreviewError(geoErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const previewClass = useMemo(() => {
    if (!preview) return 'coarse' as const;
    return classifyGpsFix(preview.distance, preview.accuracy, value.geofence_radius_meters);
  }, [preview, value.geofence_radius_meters]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-3 rounded-xl bg-warning-bg border border-warning-bd text-warning-fg text-xs">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-warning-fg shrink-0" />
          <span className="font-semibold">
            HQ Office Coordinates are hardcoded & permanently locked.
          </span>
        </div>
        <a
          href={OFFICE_MAP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline shrink-0"
        >
          <span>View on Google Maps</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div>
          <label className="block font-medium text-fg mb-1">
            Latitude <span className="text-[10px] font-normal text-fg-muted">(Locked)</span>
          </label>
          <input
            type="number"
            step="any"
            readOnly
            disabled
            value={OFFICE_LATITUDE}
            className="w-full px-3 py-2 rounded-lg bg-subtle border border-border font-mono text-fg-muted cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block font-medium text-fg mb-1">
            Longitude <span className="text-[10px] font-normal text-fg-muted">(Locked)</span>
          </label>
          <input
            type="number"
            step="any"
            readOnly
            disabled
            value={OFFICE_LONGITUDE}
            className="w-full px-3 py-2 rounded-lg bg-subtle border border-border font-mono text-fg-muted cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block font-medium text-fg mb-1">Radius (Meters)</label>
          <input
            type="number"
            min="10"
            max="1000"
            required
            value={value.geofence_radius_meters}
            onChange={(e) =>
              onChange({
                ...value,
                office_latitude: OFFICE_LATITUDE,
                office_longitude: OFFICE_LONGITUDE,
                geofence_radius_meters: parseInt(e.target.value, 10) || GEOFENCE_RADIUS_METERS,
              })
            }
            className="w-full px-3 py-2 rounded-lg bg-subtle border border-border font-mono text-fg focus:outline-hidden focus:border-accent"
          />
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-lg bg-subtle border border-border text-xs">
        <MapPin className="w-3.5 h-3.5 mt-0.5 text-accent-text shrink-0" />
        {previewError ? (
          <span className="text-danger-fg">{previewError}</span>
        ) : preview ? (
          <span className="text-fg-muted">
            Your browser is <strong className="text-fg">{preview.distance < 1000 ? `${preview.distance}m` : `${(preview.distance / 1000).toFixed(1)} km`}</strong> from
            the saved HQ pin (accuracy ±{Math.round(preview.accuracy)}m
            {previewClass === 'in_range'
              ? ', in range'
              : previewClass === 'out_of_range'
                ? ', clearly outside'
                : ', too coarse to prove office presence'}
            ).
          </span>
        ) : (
          <span className="text-fg-muted">Reading this browser’s location for a live preview…</span>
        )}
      </div>
    </div>
  );
};

