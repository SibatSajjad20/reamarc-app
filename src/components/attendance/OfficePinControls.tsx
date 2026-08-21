import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Navigation, ClipboardPaste, Loader2 } from 'lucide-react';
import {
  GEOFENCE_RADIUS_METERS,
  HQ_PIN_ACCURACY_LIMIT_METERS,
  classifyGpsFix,
  haversineMeters,
  parseOfficeCoordinates,
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

export const OfficePinControls: React.FC<OfficePinControlsProps> = ({ value, onChange, addToast }) => {
  const [paste, setPaste] = useState('');
  const [preview, setPreview] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
    distance: number;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  const applyCoords = (lat: number, lng: number) => {
    onChange({
      ...value,
      office_latitude: lat,
      office_longitude: lng,
    });
  };

  const handlePaste = () => {
    const parsed = parseOfficeCoordinates(paste);
    if (!parsed) {
      addToast?.(
        'Could not read coordinates',
        'Paste lat, lng or a Google Maps link such as https://maps.google.com/?q=33.52049,73.09145',
        'error'
      );
      return;
    }
    applyCoords(parsed.lat, parsed.lng);
    addToast?.('HQ pin updated', `${parsed.lat.toFixed(5)}, ${parsed.lng.toFixed(5)} — save to apply.`, 'success');
  };

  const handleUseDevice = async () => {
    setIsReading(true);
    try {
      const fix = await getBrowserLocation();
      if (fix.accuracy > HQ_PIN_ACCURACY_LIMIT_METERS) {
        addToast?.(
          'Location too coarse for HQ pin',
          `This device is ±${Math.round(fix.accuracy)}m. Use a phone in the lobby (under ${HQ_PIN_ACCURACY_LIMIT_METERS}m) or paste from Google Maps.`,
          'error'
        );
        return;
      }
      applyCoords(fix.lat, fix.lng);
      addToast?.('HQ pin set from this device', `Accuracy ±${Math.round(fix.accuracy)}m. Save to apply.`, 'success');
    } catch (err) {
      addToast?.('Could not read device location', geoErrorMessage(err), 'error');
    } finally {
      setIsReading(false);
    }
  };

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
          distance: haversineMeters(fix.lat, fix.lng, value.office_latitude, value.office_longitude),
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
  }, [value.office_latitude, value.office_longitude]);

  const previewClass = useMemo(() => {
    if (!preview) return 'coarse' as const;
    return classifyGpsFix(preview.distance, preview.accuracy, value.geofence_radius_meters);
  }, [preview, value.geofence_radius_meters]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div>
          <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Latitude</label>
          <input
            type="number"
            step="any"
            required
            value={value.office_latitude}
            onChange={(e) => applyCoords(parseFloat(e.target.value), value.office_longitude)}
            className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 font-mono text-zinc-800 dark:text-zinc-200"
          />
        </div>
        <div>
          <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Longitude</label>
          <input
            type="number"
            step="any"
            required
            value={value.office_longitude}
            onChange={(e) => applyCoords(value.office_latitude, parseFloat(e.target.value))}
            className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 font-mono text-zinc-800 dark:text-zinc-200"
          />
        </div>
        <div>
          <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Radius (Meters)</label>
          <input
            type="number"
            min="10"
            max="1000"
            required
            value={value.geofence_radius_meters}
            onChange={(e) =>
              onChange({
                ...value,
                geofence_radius_meters: parseInt(e.target.value, 10) || GEOFENCE_RADIUS_METERS,
              })
            }
            className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 font-bold text-zinc-800 dark:text-zinc-200"
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="Paste from Google Maps: 33.52049, 73.09145 or a maps URL"
          className="flex-1 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 font-mono text-[11px] text-zinc-800 dark:text-zinc-200"
        />
        <button
          type="button"
          onClick={handlePaste}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          Paste pin
        </button>
        <button
          type="button"
          onClick={() => void handleUseDevice()}
          disabled={isReading}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold border border-zinc-200 dark:border-zinc-700 cursor-pointer disabled:opacity-60"
        >
          {isReading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
          Use this device
        </button>
      </div>
      <p className="text-[11px] text-zinc-500">
        Drop a pin in Google Maps at the lobby, copy the coordinates or link, then paste. “Use this device” only
        accepts a fix tighter than {HQ_PIN_ACCURACY_LIMIT_METERS}m (use a phone at the office).
      </p>

      <div className="flex items-start gap-2 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-[11px]">
        <MapPin className="w-3.5 h-3.5 mt-0.5 text-indigo-500 shrink-0" />
        {previewError ? (
          <span className="text-zinc-500">{previewError}</span>
        ) : preview ? (
          <span className="text-zinc-700 dark:text-zinc-300">
            Your browser is <strong>{preview.distance < 1000 ? `${preview.distance}m` : `${(preview.distance / 1000).toFixed(1)} km`}</strong> from
            the saved HQ pin (accuracy ±{Math.round(preview.accuracy)}m
            {previewClass === 'in_range'
              ? ', in range'
              : previewClass === 'out_of_range'
                ? ', clearly outside'
                : ', too coarse to prove office presence'}
            ).
          </span>
        ) : (
          <span className="text-zinc-500">Reading this browser’s location for a live preview…</span>
        )}
      </div>
    </div>
  );
};
