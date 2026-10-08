import React, { useRef, useState, useLayoutEffect, useEffect } from 'react';
import { ToggleGroup } from 'radix-ui';
import { cn } from '../../lib/utils';

export interface SegmentedOption {
  value: string;
  label: React.ReactNode;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  count?: number | string;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: SegmentedOption[];
  size?: 'default' | 'sm';
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  value,
  defaultValue,
  onValueChange,
  options,
  size = 'default',
  className,
  disabled = false,
  'aria-label': ariaLabel,
}) => {
  // If no value or defaultValue is provided and options exist, pick first non-disabled
  const activeValue = value !== undefined ? value : defaultValue ?? options[0]?.value;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const groupRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const hasMountedRef = useRef(false);

  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
    ready: boolean;
    animated: boolean;
  }>({
    left: 0,
    width: 0,
    ready: false,
    animated: false,
  });

  const updateIndicator = (animate = true) => {
    if (!activeValue) return;
    const activeEl = itemRefs.current[activeValue];
    if (!activeEl) return;

    const left = activeEl.offsetLeft;
    const width = activeEl.offsetWidth;

    if (width > 0) {
      setIndicator({
        left,
        width,
        ready: true,
        animated: animate,
      });
    }
  };

  const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

  useIsomorphicLayoutEffect(() => {
    // Measure position. On initial mount, do not animate transition from (0,0)
    updateIndicator(hasMountedRef.current);

    if (!hasMountedRef.current) {
      // After first frame, enable smooth slide animations for user tab switches
      const raf = requestAnimationFrame(() => {
        hasMountedRef.current = true;
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [activeValue, options, size]);

  useEffect(() => {
    if (!groupRef.current) return;
    const ro = new ResizeObserver(() => {
      // Reposition on container resize without triggering animation lag
      updateIndicator(false);
    });
    ro.observe(groupRef.current);
    return () => ro.disconnect();
  }, [activeValue]);

  const handleValueChange = (val: string) => {
    // Single toggle group emits empty string if clicked again, but segmented controls don't unselect
    if (val && onValueChange) {
      onValueChange(val);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'inline-flex items-center bg-subtle p-[2px] rounded-[8px] select-none shrink-0 border-0 outline-none',
        className
      )}
    >
      <ToggleGroup.Root
        ref={groupRef}
        type="single"
        value={activeValue}
        onValueChange={handleValueChange}
        disabled={disabled}
        aria-label={ariaLabel}
        className="relative flex items-center gap-[2px] w-full"
      >
        {/* Sliding Box Indicator with smooth micro-animation */}
        {indicator.ready && (
          <span
            className={cn(
              'absolute inset-y-0 left-0 bg-surface shadow-xs pointer-events-none dark:bg-hover dark:shadow-none border-0 outline-none',
              size === 'sm' ? 'rounded-[5px]' : 'rounded-[6px]'
            )}
            style={{
              transform: `translate3d(${indicator.left}px, 0, 0)`,
              width: `${indicator.width}px`,
              transition: indicator.animated
                ? 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1), width 200ms cubic-bezier(0.16, 1, 0.3, 1)'
                : 'none',
            }}
            aria-hidden="true"
          />
        )}

        {options.map((option) => {
          const Icon = option.icon;
          const isSelected = activeValue === option.value;

          return (
            <ToggleGroup.Item
              key={option.value}
              value={option.value}
              ref={(el) => {
                itemRefs.current[option.value] = el;
              }}
              disabled={option.disabled || disabled}
              className={cn(
                'relative z-10 inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors duration-150 cursor-pointer outline-none select-none border-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0',
                size === 'sm'
                  ? 'h-[24px] px-2 text-xs rounded-[5px] gap-1'
                  : 'h-[28px] px-2.5 text-[13px] rounded-[6px] gap-1.5',
                isSelected
                  ? 'text-fg'
                  : 'text-fg-muted hover:text-fg',
                // Fallback background before layout measurement
                !indicator.ready && isSelected && 'bg-surface shadow-xs dark:bg-hover dark:shadow-none',
                (option.disabled || disabled) && 'opacity-50 cursor-not-allowed'
              )}
            >
              {Icon && <Icon size={size === 'sm' ? 12 : 14} className="shrink-0" />}
              <span>{option.label}</span>
              {option.count !== undefined && (
                <span
                  className={cn(
                    'text-[11px] font-normal font-numeric tabular-nums px-1.5 py-0.2 rounded-full leading-none',
                    isSelected
                      ? 'bg-subtle text-fg-2'
                      : 'bg-surface/60 text-fg-muted dark:bg-hover/60'
                  )}
                >
                  {option.count}
                </span>
              )}
            </ToggleGroup.Item>
          );
        })}
      </ToggleGroup.Root>
    </div>
  );
};
