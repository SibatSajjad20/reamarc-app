import React, { useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/button';
import { SettingsCard } from '../SettingsCard';

export const ContentCalendarDisplaySection: React.FC = () => {
  const { addToast } = useToast();

  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('reamarc_cc_zoom');
      return saved ? Number(saved) : 100;
    } catch {
      return 100;
    }
  });

  const [defaultRowHeight, setDefaultRowHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('reamarc_cc_row_height');
      return saved ? Number(saved) : 40;
    } catch {
      return 40;
    }
  });

  const handleZoomChange = (nextZoom: number) => {
    const clamped = Math.max(75, Math.min(125, nextZoom));
    setZoomLevel(clamped);
    try {
      localStorage.setItem('reamarc_cc_zoom', String(clamped));
      window.dispatchEvent(new Event('storage'));
    } catch {}
    addToast('Zoom scale updated', `Table zoom set to ${clamped}%`, 'info');
  };

  const handleRowHeightChange = (nextHeight: number) => {
    const clamped = Math.max(28, Math.min(80, nextHeight));
    setDefaultRowHeight(clamped);
    try {
      localStorage.setItem('reamarc_cc_row_height', String(clamped));
      window.dispatchEvent(new Event('storage'));
    } catch {}
  };

  const handleResetRowHeights = () => {
    try {
      localStorage.removeItem('reamarc_cc_row_heights');
      window.dispatchEvent(new Event('storage'));
    } catch {}
    addToast('Row heights reset', 'Manual row height adjustments cleared.', 'success');
  };

  const handleResetDisplayDefaults = () => {
    handleZoomChange(100);
    handleRowHeightChange(40);
    handleResetRowHeights();
    addToast('Display reset', 'Display options reset to 100% zoom and 40px row height.', 'info');
  };

  const PRESETS = [
    { label: 'Compact', px: 32, desc: 'Tight spacing for high data density' },
    { label: 'Regular', px: 40, desc: 'Standard balanced row height' },
    { label: 'Spacious', px: 48, desc: 'Comfortable spacing for large screens' },
  ];

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Table zoom scale"
        description="Adjust spreadsheet magnification on this device."
      >
        <div className="space-y-3.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleZoomChange(zoomLevel - 5)}
              disabled={zoomLevel <= 75}
              className="p-2 rounded-lg border border-border bg-surface hover:bg-hover disabled:opacity-40 transition cursor-pointer"
              title="Zoom out"
            >
              <ZoomOut size={16} />
            </button>

            <div className="flex-1">
              <input
                type="range"
                min="75"
                max="125"
                step="5"
                value={zoomLevel}
                onChange={(e) => handleZoomChange(Number(e.target.value))}
                className="w-full accent-accent h-2 bg-subtle rounded-lg cursor-pointer"
              />
            </div>

            <button
              type="button"
              onClick={() => handleZoomChange(zoomLevel + 5)}
              disabled={zoomLevel >= 125}
              className="p-2 rounded-lg border border-border bg-surface hover:bg-hover disabled:opacity-40 transition cursor-pointer"
              title="Zoom in"
            >
              <ZoomIn size={16} />
            </button>

            <span className="text-xs font-mono font-medium text-fg min-w-12 text-right">
              {zoomLevel}%
            </span>
          </div>

          <div className="flex items-center justify-between text-micro text-fg-muted">
            <span>75% (Overview)</span>
            <span>100% (Default)</span>
            <span>125% (Large)</span>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Default row height"
        description="Set row vertical padding across your content calendar sheets."
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {PRESETS.map((preset) => {
              const isSelected = defaultRowHeight === preset.px;
              return (
                <button
                  key={preset.px}
                  type="button"
                  onClick={() => handleRowHeightChange(preset.px)}
                  className={`p-3 rounded-lg border text-left transition cursor-pointer ${
                    isSelected
                      ? 'border-accent bg-accent-soft-2 text-accent-text ring-1 ring-accent'
                      : 'border-border bg-surface hover:bg-hover text-fg'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{preset.label}</span>
                    <span className="text-micro font-mono text-fg-muted">{preset.px}px</span>
                  </div>
                  <p className="text-micro text-fg-muted mt-1 leading-normal">
                    {preset.desc}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <span className="text-micro font-mono text-fg-muted w-10 text-right">28px</span>
            <input
              type="range"
              min="28"
              max="80"
              step="2"
              value={defaultRowHeight}
              onChange={(e) => handleRowHeightChange(Number(e.target.value))}
              className="flex-1 accent-accent h-2 bg-subtle rounded-lg cursor-pointer"
            />
            <span className="text-micro font-mono text-fg-muted w-10">80px</span>
            <span className="text-xs font-mono font-medium text-fg min-w-12 text-right">
              {defaultRowHeight}px
            </span>
          </div>

          <div className="pt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border">
            <span className="text-xs text-fg-muted">
              Custom dragged row heights override this default.
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetRowHeights}
            >
              Reset manual heights
            </Button>
          </div>
        </div>
      </SettingsCard>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={RotateCcw}
          onClick={handleResetDisplayDefaults}
        >
          Reset display to defaults
        </Button>
      </div>
    </div>
  );
};
