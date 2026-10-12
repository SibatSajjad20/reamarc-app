import React from 'react';
import { SlidersHorizontal, ZoomIn, ZoomOut, RotateCcw, ChevronDown } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

export interface ContentCalendarDisplayPopoverProps {
  zoomLevel: number;
  onZoomChange: (zoom: number) => void;
  defaultRowHeight: number;
  onRowHeightChange: (height: number) => void;
  onResetRowHeights: () => void;
  onResetDefaults: () => void;
}

const ROW_PRESETS = [
  { label: 'Compact', px: 32 },
  { label: 'Regular', px: 40 },
  { label: 'Spacious', px: 48 },
];

export const ContentCalendarDisplayPopover: React.FC<ContentCalendarDisplayPopoverProps> = ({
  zoomLevel,
  onZoomChange,
  defaultRowHeight,
  onRowHeightChange,
  onResetRowHeights,
  onResetDefaults,
}) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          title="Display settings (zoom and row height)"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 mr-1" />
          <span>Display</span>
          <ChevronDown className="w-3 h-3 ml-1 text-fg-muted" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-4 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div>
            <h4 className="text-xs font-semibold text-fg">Display options</h4>
            <p className="text-micro text-fg-muted">Magnification and row height in sheet view</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-micro text-fg-muted hover:text-fg"
            onClick={onResetDefaults}
            title="Reset display to defaults"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            <span>Reset</span>
          </Button>
        </div>

        {/* Table zoom scale */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg">Table zoom scale</span>
            <span className="text-xs font-numeric font-semibold text-fg">{zoomLevel}%</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onZoomChange(zoomLevel - 5)}
              disabled={zoomLevel <= 75}
              className="p-1.5 rounded-md border border-border bg-surface hover:bg-hover disabled:opacity-40 transition cursor-pointer text-fg"
              title="Zoom out"
            >
              <ZoomOut size={14} />
            </button>

            <input
              type="range"
              min="75"
              max="125"
              step="5"
              value={zoomLevel}
              onChange={(e) => onZoomChange(Number(e.target.value))}
              className="flex-1 accent-accent h-1.5 bg-subtle rounded-lg cursor-pointer"
            />

            <button
              type="button"
              onClick={() => onZoomChange(zoomLevel + 5)}
              disabled={zoomLevel >= 125}
              className="p-1.5 rounded-md border border-border bg-surface hover:bg-hover disabled:opacity-40 transition cursor-pointer text-fg"
              title="Zoom in"
            >
              <ZoomIn size={14} />
            </button>
          </div>

          <div className="flex items-center justify-between text-micro text-fg-muted pt-0.5">
            <button
              type="button"
              onClick={() => onZoomChange(75)}
              className="hover:text-fg cursor-pointer"
            >
              75% (Small)
            </button>
            <button
              type="button"
              onClick={() => onZoomChange(100)}
              className="hover:text-fg cursor-pointer font-medium"
            >
              100% (Default)
            </button>
            <button
              type="button"
              onClick={() => onZoomChange(125)}
              className="hover:text-fg cursor-pointer"
            >
              125% (Large)
            </button>
          </div>
        </div>

        {/* Row height */}
        <div className="space-y-2 pt-1 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg">Default row height</span>
            <span className="text-xs font-numeric font-semibold text-fg">{defaultRowHeight}px</span>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {ROW_PRESETS.map((preset) => {
              const isSelected = defaultRowHeight === preset.px;
              return (
                <button
                  key={preset.px}
                  type="button"
                  onClick={() => onRowHeightChange(preset.px)}
                  className={`py-1.5 px-2 rounded-md border text-center transition cursor-pointer text-xs ${
                    isSelected
                      ? 'border-accent bg-accent-soft-2 text-accent-text font-semibold ring-1 ring-accent'
                      : 'border-border bg-surface hover:bg-hover text-fg'
                  }`}
                >
                  <div>{preset.label}</div>
                  <div className="text-micro font-numeric text-fg-muted">{preset.px}px</div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <span className="text-micro font-numeric text-fg-muted w-7 text-right">28px</span>
            <input
              type="range"
              min="28"
              max="80"
              step="2"
              value={defaultRowHeight}
              onChange={(e) => onRowHeightChange(Number(e.target.value))}
              className="flex-1 accent-accent h-1.5 bg-subtle rounded-lg cursor-pointer"
            />
            <span className="text-micro font-numeric text-fg-muted w-7">80px</span>
          </div>

          <div className="pt-2 flex items-center justify-between gap-2 border-t border-border text-micro text-fg-muted">
            <span>Custom dragged heights override this</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-micro"
              onClick={onResetRowHeights}
            >
              Reset dragged
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
