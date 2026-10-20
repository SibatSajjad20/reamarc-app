import React, { useState, useId } from 'react';
import { Eye, EyeOff, Sparkles, Copy, Check } from 'lucide-react';
import { IconButton } from '@/components/ui/button';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/utils';

export function calculatePasswordStrength(pwd: string): number {
  if (!pwd) return 0;
  let score = 0;
  if (pwd.length >= 10) score += 1;
  if (pwd.length >= 14) score += 1;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd)) score += 1;
  if (/[^a-zA-Z0-9]/.test(pwd)) score += 1;
  return score;
}

export function generateStrongPassword(): string {
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowers = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = uppers + lowers + digits + symbols;

  const getRandChar = (charset: string) => {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return charset[arr[0] % charset.length];
  };

  // Guarantee mixed classes
  const pwdChars = [
    getRandChar(uppers),
    getRandChar(lowers),
    getRandChar(digits),
    getRandChar(symbols),
  ];

  for (let i = 4; i < 16; i++) {
    pwdChars.push(getRandChar(all));
  }

  // Cryptographically shuffle (Fisher-Yates)
  for (let i = pwdChars.length - 1; i > 0; i--) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    const j = arr[0] % (i + 1);
    const temp = pwdChars[i];
    pwdChars[i] = pwdChars[j];
    pwdChars[j] = temp;
  }

  return pwdChars.join('');
}

export interface StartingPasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  helperText?: string;
  required?: boolean;
  error?: string;
  id?: string;
  autoFocus?: boolean;
}

export const StartingPasswordField: React.FC<StartingPasswordFieldProps> = ({
  value,
  onChange,
  label = 'Starting password',
  helperText = "At least 10 characters. Share it with the admin yourself. They can change it from Profile. You won't see it again after this.",
  required = true,
  error,
  id,
  autoFocus = false,
}) => {
  const { addToast } = useToast();
  const generatedId = useId();
  const fieldId = id || generatedId;
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const strength = calculatePasswordStrength(value);

  const handleGenerate = () => {
    const newPwd = generateStrongPassword();
    onChange(newPwd);
    setShowPassword(true);
  };

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      addToast('Password copied', undefined, 'info');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard error
    }
  };

  return (
    <div className="w-full space-y-1.5 text-left">
      <div className="flex items-center justify-between">
        <label htmlFor={fieldId} className="block text-label font-medium text-fg">
          {label} {required && <span className="text-danger-fg">*</span>}
        </label>
        <button
          type="button"
          onClick={handleGenerate}
          className="text-xs font-medium text-accent hover:text-accent-hover inline-flex items-center gap-1 cursor-pointer select-none"
        >
          <Sparkles size={13} aria-hidden="true" />
          <span>Generate</span>
        </button>
      </div>

      <div className="relative flex items-center">
        <input
          id={fieldId}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
          autoComplete="new-password"
          aria-required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={`${fieldId}-hint ${fieldId}-error`}
          className={cn(
            'w-full h-9 pl-3 pr-20 rounded-md border border-border-strong bg-surface text-fg placeholder:text-fg-faint text-ui outline-none transition-colors duration-120 font-mono tracking-tight',
            'hover:border-fg-faint focus:border-ring-border focus:shadow-[0_0_0_3px_var(--ring)]',
            error && 'border-danger-dot focus:shadow-[0_0_0_3px_rgba(240,68,56,0.2)]'
          )}
        />
        <div className="absolute right-1 flex items-center gap-0.5">
          {value && (
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              icon={copied ? Check : Copy}
              label="Copy password"
              onClick={handleCopy}
              className="text-fg-muted hover:text-fg"
            />
          )}
          <IconButton
            type="button"
            variant="ghost"
            size="sm"
            icon={showPassword ? EyeOff : Eye}
            label={showPassword ? 'Hide password' : 'Show password'}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            onClick={() => setShowPassword(!showPassword)}
            className="text-fg-muted hover:text-fg"
          />
        </div>
      </div>

      {/* 4-step strength bar */}
      <div className="flex items-center gap-1 pt-1" aria-label={`Password strength: ${strength} of 4`}>
        {[0, 1, 2, 3].map((step) => (
          <div
            key={step}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-200',
              step < strength ? 'bg-success-dot' : 'bg-subtle'
            )}
          />
        ))}
      </div>

      {error ? (
        <p id={`${fieldId}-error`} role="alert" className="text-small text-danger-fg mt-1">
          {error}
        </p>
      ) : (
        helperText && (
          <p id={`${fieldId}-hint`} className="text-caption text-fg-muted leading-relaxed mt-1">
            {helperText}
          </p>
        )
      )}
    </div>
  );
};
