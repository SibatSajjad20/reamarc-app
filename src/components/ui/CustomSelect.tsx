import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

/**
 * html { zoom } makes position:fixed use a different pixel space than
 * getBoundingClientRect(). Measure that mapping once so portaled menus
 * stay flush with their triggers. Width and position can scale differently.
 */
type FixedPositionMetrics = {
  posScaleX: number;
  posScaleY: number;
  originX: number;
  originY: number;
  sizeScaleX: number;
  sizeScaleY: number;
};

let fixedPositionMetrics: FixedPositionMetrics | null = null;

function safeScale(value: number): number {
  return Number.isFinite(value) && value > 0.01 && value < 20 ? value : 1;
}

function readFixedPositionMetrics(): FixedPositionMetrics {
  if (fixedPositionMetrics) return fixedPositionMetrics;
  const fallback: FixedPositionMetrics = {
    posScaleX: 1,
    posScaleY: 1,
    originX: 0,
    originY: 0,
    sizeScaleX: 1,
    sizeScaleY: 1,
  };
  if (typeof document === 'undefined') return fallback;

  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:fixed;left:0;top:0;width:100px;height:100px;margin:0;padding:0;border:0;visibility:hidden;pointer-events:none;';
  document.body.appendChild(probe);
  const atOrigin = probe.getBoundingClientRect();
  probe.style.left = '100px';
  probe.style.top = '100px';
  const atOffset = probe.getBoundingClientRect();
  probe.remove();

  fixedPositionMetrics = {
    posScaleX: safeScale((atOffset.left - atOrigin.left) / 100),
    posScaleY: safeScale((atOffset.top - atOrigin.top) / 100),
    originX: atOrigin.left,
    originY: atOrigin.top,
    sizeScaleX: safeScale(atOffset.width / 100),
    sizeScaleY: safeScale(atOffset.height / 100),
  };
  return fixedPositionMetrics;
}

export interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  disabled?: boolean;
  align?: 'left' | 'right';
  usePortal?: boolean;
  size?: 'default' | 'sm' | 'xs';
  autoOpen?: boolean;
  onClose?: () => void;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select option...',
  label,
  icon: LeadingIcon,
  className = '',
  disabled = false,
  align = 'left',
  usePortal = true,
  size = 'default',
  autoOpen = false,
  onClose,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [openDirection, setOpenDirection] = useState<'down' | 'up'>('down');
  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const updatePosition = () => {
    const anchor = buttonRef.current ?? dropdownRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setIsOpen(false);
      return;
    }

    const metrics = readFixedPositionMetrics();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Prefer opening down unless space below is tight (< 220px) AND space above is greater
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    setOpenDirection(openUp ? 'up' : 'down');

    const minW = size === 'xs' ? 140 : 200;
    const width = Math.max(minW, rect.width / metrics.sizeScaleX);
    const visualWidth = width * metrics.sizeScaleX;
    let left =
      align === 'right'
        ? (rect.right - metrics.originX - visualWidth) / metrics.posScaleX
        : (rect.left - metrics.originX) / metrics.posScaleX;
    const maxLeft =
      (window.innerWidth - 8 - metrics.originX - visualWidth) / metrics.posScaleX;
    const minLeft = (8 - metrics.originX) / metrics.posScaleX;
    if (left > maxLeft) left = maxLeft;
    if (left < minLeft) left = minLeft;

    if (openUp) {
      const maxHeight = Math.min(256, Math.max(100, (spaceAbove - 16) / metrics.sizeScaleY));
      const bottom =
        (window.innerHeight - (rect.top - 6) - metrics.originY) / metrics.posScaleY;
      setCoords({
        bottom,
        left,
        width,
        maxHeight,
      });
    } else {
      const maxHeight = Math.min(256, Math.max(100, (spaceBelow - 16) / metrics.sizeScaleY));
      setCoords({
        top: (rect.bottom + 6 - metrics.originY) / metrics.posScaleY,
        left,
        width,
        maxHeight,
      });
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    onClose?.();
  };

  const handleToggle = () => {
    if (!disabled) {
      if (!isOpen) {
        updatePosition();
        setIsOpen(true);
      } else {
        handleClose();
      }
    }
  };

  useEffect(() => {
    if (autoOpen && !disabled) {
      const timer = setTimeout(() => {
        updatePosition();
        setIsOpen(true);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [autoOpen, disabled]);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleScroll = () => {
      updatePosition();
    };
    const handleResize = () => {
      fixedPositionMetrics = null;
      updatePosition();
    };
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      handleClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      }
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, align]);

  const SelectedIcon = selectedOption?.icon;

  const menuContent = (
    <div
      ref={menuRef}
      style={
        usePortal && coords
          ? {
              position: 'fixed',
              ...(coords.top !== undefined ? { top: `${coords.top}px` } : {}),
              ...(coords.bottom !== undefined ? { bottom: `${coords.bottom}px` } : {}),
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              maxHeight: `${coords.maxHeight}px`,
            }
          : undefined
      }
      className={`${
        usePortal
          ? 'z-[99999]'
          : `absolute ${align === 'right' ? 'right-0' : 'left-0'} ${
              openDirection === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
            } z-[100] min-w-[200px] w-full max-h-64`
      } overflow-y-auto bg-white dark:bg-[#151722] border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl p-1.5 space-y-0.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100`}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        const OptionIcon = option.icon;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              onChange(option.value);
              handleClose();
            }}
            className={`w-full flex items-center justify-between gap-2 ${
              size === 'xs' ? 'px-2.5 py-1.5 rounded-lg text-xs' : 'px-3 py-2 rounded-xl text-xs'
            } font-semibold transition-colors cursor-pointer text-left select-none ${
              isSelected
                ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold'
                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/80'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {OptionIcon && (
                <OptionIcon
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'
                  }`}
                />
              )}
              <div className="min-w-0">
                <div className="truncate">{option.label}</div>
                {option.description && (
                  <div className="text-[10px] text-zinc-400 font-normal truncate">
                    {option.description}
                  </div>
                )}
              </div>
            </div>

            {isSelected && (
              <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0 ml-1" />
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={`relative w-full text-left ${className}`} ref={dropdownRef}>
      {label && (
        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
          {LeadingIcon && <LeadingIcon className="w-3.5 h-3.5 text-indigo-500" />}
          <span>{label}</span>
        </label>
      )}

      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={`w-full ${
          size === 'xs'
            ? 'h-[26px] px-2 py-0 rounded-md text-xs font-medium'
            : size === 'sm'
            ? 'h-8 px-2.5 rounded-lg text-xs font-semibold'
            : 'h-10 px-3.5 rounded-xl text-xs font-semibold'
        } flex items-center justify-between gap-1.5 bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all shadow-2xs cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed ${
          isOpen ? 'ring-2 ring-indigo-500/20 border-indigo-500 dark:border-indigo-500' : ''
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {!label && LeadingIcon && (
            <LeadingIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          )}
          {SelectedIcon && <SelectedIcon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>

        <ChevronDown
          className={`${
            size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5'
          } text-zinc-400 dark:text-zinc-500 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : ''
          }`}
        />
      </button>

      {isOpen &&
        (usePortal && typeof document !== 'undefined'
          ? createPortal(menuContent, document.body)
          : menuContent)}
    </div>
  );
};

