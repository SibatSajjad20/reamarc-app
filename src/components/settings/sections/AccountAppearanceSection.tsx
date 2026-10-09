import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import type { ThemePreference } from '@/types';
import { SettingsCard } from '../SettingsCard';
import { cn } from '@/lib/utils';

interface AccountAppearanceSectionProps {
  themePreference?: ThemePreference;
  onSelectThemePreference?: (preference: ThemePreference) => void;
}

export const AccountAppearanceSection: React.FC<AccountAppearanceSectionProps> = ({
  themePreference = 'system',
  onSelectThemePreference,
}) => {
  const options: { value: ThemePreference; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
    {
      value: 'light',
      label: 'Light',
      description: 'Clean light surfaces with crisp contrast.',
      icon: Sun,
    },
    {
      value: 'dark',
      label: 'Dark',
      description: 'Low-light dark mode for reduced eye strain.',
      icon: Moon,
    },
    {
      value: 'system',
      label: 'System preference',
      description: 'Automatically match your operating system theme.',
      icon: Monitor,
    },
  ];

  const handleSelect = (pref: ThemePreference) => {
    if (onSelectThemePreference) {
      onSelectThemePreference(pref);
    } else {
      localStorage.setItem('reamarc-theme', pref);
      window.dispatchEvent(new Event('storage'));
    }
  };

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Interface theme"
        description="Choose how Reamarc appears on your device."
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {options.map((opt) => {
            const Icon = opt.icon;
            const isSelected = themePreference === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                className={cn(
                  'p-4 rounded-xl border text-left transition-colors cursor-pointer flex flex-col justify-between',
                  isSelected
                    ? 'border-accent bg-accent-soft-2 ring-1 ring-accent'
                    : 'border-border bg-surface hover:bg-hover'
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center',
                      isSelected ? 'bg-accent text-white' : 'bg-subtle text-fg-muted'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div
                    className={cn(
                      'w-4 h-4 rounded-full border flex items-center justify-center',
                      isSelected ? 'border-accent bg-accent' : 'border-border bg-transparent'
                    )}
                  >
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-fg">
                    {opt.label}
                  </span>
                  <span className="block text-micro text-fg-muted mt-0.5 leading-normal">
                    {opt.description}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </SettingsCard>
    </div>
  );
};
