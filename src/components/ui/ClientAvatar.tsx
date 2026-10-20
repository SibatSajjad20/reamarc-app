import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { clientInitials } from '../../utils/clientInitials';

export const CLIENT_AVATAR_HUES = [
  '#4f46e5',
  '#2563eb',
  '#0f766e',
  '#047857',
  '#b45309',
  '#be123c',
  '#6d28d9',
  '#334155',
] as const;

export type ClientAvatarSize = 14 | 18 | 20 | 24 | 32 | 40 | 96;

export interface ClientAvatarProps {
  name: string;
  logoUrl?: string | null;
  clientId?: string | null;
  brandColor?: string;
  initials?: string;
  size?: ClientAvatarSize;
  className?: string;
  decorative?: boolean;
}

function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.replace('#', '');
  if (raw.length !== 3 && raw.length !== 6) return null;
  const value = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = Number.parseInt(value, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function contrastAgainstWhite(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channel = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  return 1.05 / (luminance + 0.05);
}

export function fallbackHue(seed: string): string {
  return CLIENT_AVATAR_HUES[fnv1a(seed) % CLIENT_AVATAR_HUES.length];
}

export function resolveClientMarkColor(brandColor: string | undefined, seed: string): string {
  if (brandColor && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(brandColor) && contrastAgainstWhite(brandColor) >= 4.5) {
    return brandColor;
  }
  return fallbackHue(seed);
}

export function cloudinaryThumbUrl(src: string, size: number): string | null {
  if (!src.includes('res.cloudinary.com') || !src.includes('/image/upload/')) return null;
  const dpr2x = Math.round(size * 2);
  const transform = `w_${dpr2x},h_${dpr2x},c_pad,b_transparent,f_auto,q_auto`;
  const parts = src.split('/image/upload/');
  if (parts.length < 2) return null;
  if (parts[1].startsWith('w_') || parts[1].startsWith('c_')) return src;
  return `${parts[0]}/image/upload/${transform}/${parts[1]}`;
}

export const ClientAvatar: React.FC<ClientAvatarProps> = ({
  name,
  logoUrl,
  clientId,
  brandColor,
  initials,
  size = 20,
  className,
  decorative = false,
}) => {
  const [hasError, setHasError] = useState(false);
  useEffect(() => {
    setHasError(false);
  }, [logoUrl]);

  const seed = clientId || name;
  const bg = useMemo(() => resolveClientMarkColor(brandColor, seed), [brandColor, seed]);
  const mark = (initials && initials.trim()) || clientInitials(name);
  const src = !hasError && logoUrl ? (cloudinaryThumbUrl(logoUrl, size) ?? (/^(data:image\/|blob:)/.test(logoUrl) ? logoUrl : null)) : null;
  const radius = Math.round(size * 0.25);
  const fontSize = Math.max(8, Math.round(size * 0.38));

  return (
    <div
      title={name}
      style={{ width: size, height: size, borderRadius: radius }}
      className={cn(
        'relative inline-flex items-center justify-center shrink-0 overflow-hidden select-none border border-border bg-surface',
        className
      )}
    >
      {src ? (
        <img
          src={src}
          alt={decorative ? '' : `${name} logo`}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setHasError(true)}
          className="w-full h-full object-contain bg-white"
        />
      ) : (
        <span
          style={{ backgroundColor: bg, fontSize }}
          className="w-full h-full flex items-center justify-center text-white font-semibold uppercase tracking-tight"
        >
          {mark}
        </span>
      )}
    </div>
  );
};
