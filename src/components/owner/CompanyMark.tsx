import React, { useState } from 'react';
import { cn } from '@/lib/utils';

export function getCompanyInitials(name?: string | null, singleLetter = false): string {
  if (!name) return 'C';
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  const words = tokens.filter((t) => /^[A-Za-z]/.test(t));
  if (words.length === 0) return 'C';
  if (singleLetter) {
    const last = words[words.length - 1];
    if (last.length === 1 && words.length > 1) return last.toUpperCase();
    return words[0][0].toUpperCase();
  }
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export interface CompanyMarkProps {
  name: string;
  logoUrl?: string | null;
  accentColor?: string | null;
  size?: number;
  singleLetter?: boolean;
  className?: string;
}

export const CompanyMark: React.FC<CompanyMarkProps> = ({
  name,
  logoUrl,
  accentColor,
  size = 28,
  singleLetter,
  className,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const useSingle = singleLetter !== undefined ? singleLetter : size <= 20;
  const initials = getCompanyInitials(name, useSingle);
  const fontSize = size <= 20 ? 11 : Math.max(11, Math.round(size * 0.45));

  if (logoUrl && !imgFailed) {
    return (
      <img
        src={logoUrl}
        alt={name}
        onError={() => setImgFailed(true)}
        style={{ width: size, height: size }}
        className={cn(
          'rounded-mark object-contain shrink-0 select-none border border-border/40',
          size <= 20 ? 'rounded-sm' : 'rounded-md',
          className
        )}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        fontSize,
        backgroundColor: accentColor || 'var(--accent)',
      }}
      className={cn(
        'rounded-mark text-accent-fg font-semibold flex items-center justify-center shrink-0 select-none shadow-xs',
        size <= 20 ? 'rounded-sm' : 'rounded-md',
        className
      )}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
};
