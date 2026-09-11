import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
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
  size?: 'default' | 'sm';
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
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
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
    if (!dropdownRef.current) return;
    const rect = dropdownRef.current.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setIsOpen(false);
      return;
    }

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Prefer opening down unless space below is tight (< 220px) AND space above is greater
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    setOpenDirection(openUp ? 'up' : 'down');

    const width = Math.max(200, rect.width);
    let left = align === 'right' ? rect.right - width : rect.left;
    if (left + width > window.innerWidth - 8) {
      left = window.innerWidth - width - 8;
    }
    if (left < 8) {
      left = 8;
    }

    if (openUp) {
      const maxHeight = Math.min(256, Math.max(100, spaceAbove - 16));
      setCoords({
        bottom: window.innerHeight - rect.top + 6,
        left,
        width,
        maxHeight,
      });
    } else {
      const maxHeight = Math.min(256, Math.max(100, spaceBelow - 16));
      setCoords({
        top: rect.bottom + 6,
        left,
        width,
        maxHeight,
      });
    }
  };

  const handleToggle = () => {
    if (!disabled) {
      if (!isOpen) {
        updatePosition();
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    }
  };

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleScroll = () => {
      updatePosition();
    };
    const handleResize = () => {
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
      setIsOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
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
              setIsOpen(false);
            }}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer text-left select-none ${
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
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={`w-full ${
          size === 'sm' ? 'h-8 px-2.5 rounded-lg' : 'h-10 px-3.5 rounded-xl'
        } flex items-center justify-between gap-2 bg-white dark:bg-[#12141c] border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-900 dark:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all shadow-2xs cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed ${
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
          className={`w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 transition-transform duration-200 shrink-0 ${
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

