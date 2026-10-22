import React from 'react';
import { useBranding } from '@/context/BrandingProvider';

interface BrandMarkProps {
  size?: number;
  className?: string;
  initial?: string;
  logoUrl?: string | null;
  accentColor?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({
  size = 28,
  className = '',
  initial,
  logoUrl,
  accentColor,
}) => {
  const branding = useBranding();
  const fontSize = Math.round(size * 0.5);

  const effectiveLogo = logoUrl !== undefined ? logoUrl : branding.logoUrl;
  const effectiveInitial = initial || branding.companyName.trim().charAt(0).toUpperCase() || 'R';

  if (effectiveLogo) {
    return (
      <img
        src={effectiveLogo}
        alt={branding.companyName || 'Brand'}
        style={{
          width: `${size}px`,
          height: `${size}px`,
        }}
        className={`rounded-mark object-contain shrink-0 select-none ${className}`}
      />
    );
  }

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        fontSize: `${fontSize}px`,
        ...(accentColor ? { backgroundColor: accentColor } : {}),
      }}
      className={`rounded-mark bg-accent text-accent-fg font-semibold flex items-center justify-center shrink-0 select-none ${className}`}
      aria-hidden="true"
    >
      {effectiveInitial}
    </div>
  );
};
