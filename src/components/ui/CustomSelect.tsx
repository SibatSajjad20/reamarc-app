import React, { useState } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string; size?: number }>;
}

export interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  icon?: React.ComponentType<{ className?: string; size?: number }>;
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
  const [open, setOpen] = useState(autoOpen);

  const selectedOption = options.find((opt) => opt.value === value);
  const SelectedIcon = selectedOption?.icon;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen && onClose) {
      onClose();
    }
  };

  const triggerSizeClass = {
    xs: 'h-[26px] px-2 text-small rounded-sm',
    sm: 'h-8 px-2.5 text-small rounded-md',
    default: 'h-9 px-3 text-ui rounded-md',
  }[size];

  return (
    <div className={cn('relative w-full text-left', className)}>
      {label && (
        <label className="block text-label font-medium text-fg mb-1.5 flex items-center gap-1.5">
          {LeadingIcon && <LeadingIcon size={14} className="text-fg-muted" />}
          <span>{label}</span>
        </label>
      )}

      <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'w-full flex items-center justify-between gap-2 border border-border-strong bg-surface text-fg shadow-xs transition-colors cursor-pointer select-none outline-none disabled:opacity-50 disabled:cursor-not-allowed hover:border-fg-muted/60 focus-visible:outline-none focus-visible:border-border-strong',
              triggerSizeClass,
              open && 'border-border-strong bg-subtle/50'
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              {!label && LeadingIcon && (
                <LeadingIcon size={14} className="text-fg-muted shrink-0" />
              )}
              {SelectedIcon && <SelectedIcon size={14} className="text-fg-muted shrink-0" />}
              <span className={cn('truncate', !selectedOption && 'text-fg-muted')}>
                {selectedOption ? selectedOption.label : placeholder}
              </span>
            </div>

            <ChevronDown
              size={14}
              className={cn(
                'text-fg-muted transition-transform duration-150 shrink-0 ml-1',
                open && 'rotate-180 text-fg'
              )}
            />
          </button>
        </PopoverPrimitive.Trigger>

        {usePortal ? (
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
              align={align === 'right' ? 'end' : 'start'}
              sideOffset={4}
              className="z-[var(--z-popover,100)] min-w-[200px] max-h-[320px] overflow-y-auto bg-surface border border-border rounded-lg shadow-md p-1 space-y-0.5 outline-none duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
            >
              {options.length === 0 ? (
                <div className="px-3 py-3 text-xs text-fg-muted text-center select-none">
                  No options available
                </div>
              ) : (
                options.map((option) => {
                  const isSelected = option.value === value;
                  const OptionIcon = option.icon;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onChange(option.value);
                        handleOpenChange(false);
                      }}
                      className={cn(
                        'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm text-ui transition-colors cursor-pointer text-left select-none',
                        isSelected
                          ? 'bg-accent-soft text-accent-text font-medium'
                          : 'text-fg-2 hover:bg-hover hover:text-fg'
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {OptionIcon && (
                          <OptionIcon
                            size={14}
                            className={cn(
                              'shrink-0',
                              isSelected ? 'text-accent-text' : 'text-fg-muted'
                            )}
                          />
                        )}
                        <div className="min-w-0">
                          <div className="truncate">{option.label}</div>
                          {option.description && (
                            <div className="text-micro text-fg-muted truncate">
                              {option.description}
                            </div>
                          )}
                        </div>
                      </div>

                      {isSelected && (
                        <Check size={14} className="text-accent shrink-0 ml-1" />
                      )}
                    </button>
                  );
                })
              )}
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        ) : (
          <PopoverPrimitive.Content
            align={align === 'right' ? 'end' : 'start'}
            sideOffset={4}
            className="z-[var(--z-popover,100)] min-w-[200px] max-h-[320px] overflow-y-auto bg-surface border border-border rounded-lg shadow-md p-1 space-y-0.5 outline-none"
          >
            {options.length === 0 ? (
              <div className="px-3 py-3 text-xs text-fg-muted text-center select-none">
                No options available
              </div>
            ) : (
              options.map((option) => {
              const isSelected = option.value === value;
              const OptionIcon = option.icon;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    handleOpenChange(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm text-ui transition-colors cursor-pointer text-left select-none',
                    isSelected
                      ? 'bg-accent-soft text-accent-text font-medium'
                      : 'text-fg-2 hover:bg-hover hover:text-fg'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {OptionIcon && (
                      <OptionIcon
                        size={14}
                        className={cn(
                          'shrink-0',
                          isSelected ? 'text-accent-text' : 'text-fg-muted'
                        )}
                      />
                    )}
                    <div className="min-w-0">
                      <div className="truncate">{option.label}</div>
                      {option.description && (
                        <div className="text-micro text-fg-muted truncate">
                          {option.description}
                        </div>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <Check size={14} className="text-accent shrink-0 ml-1" />
                  )}
                </button>
              );
            })}
          </PopoverPrimitive.Content>
        )}
      </PopoverPrimitive.Root>
    </div>
  );
};
