import React, { useState } from 'react';
import { cn } from '@/lib/utils';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
  alt?: string;
  decorative?: boolean;
}

function getInitials(name?: string | null): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getOptimizedAvatarUrl(src?: string | null, size: number = 32): string | null {
  if (!src) return null;
  if (src.includes('res.cloudinary.com') && src.includes('/image/upload/')) {
    const parts = src.split('/image/upload/');
    const dpr2x = Math.round(size * 2);
    const transform = `c_fill,g_face,w_${dpr2x},h_${dpr2x},f_auto,q_auto`;
    if (!parts[1].startsWith('c_') && !parts[1].includes(transform)) {
      return `${parts[0]}/image/upload/${transform}/${parts[1]}`;
    }
  }
  return src;
}

export const Avatar: React.FC<AvatarProps> = ({
  name = '',
  src,
  size = 32,
  className,
  alt,
  decorative = false,
  ...props
}) => {
  const [hasError, setHasError] = useState(false);
  const optimizedSrc = !hasError ? getOptimizedAvatarUrl(src, size) : null;
  const initials = getInitials(name);

  // Dynamic font size relative to container size
  const fontSize = Math.max(10, Math.round(size * 0.38));

  return (
    <div
      style={{ width: size, height: size }}
      className={cn(
        'relative inline-flex items-center justify-center shrink-0 rounded-md overflow-hidden select-none',
        'bg-accent-soft text-accent font-semibold leading-none',
        className
      )}
      {...props}
    >
      {optimizedSrc ? (
        <img
          src={optimizedSrc}
          alt={decorative ? '' : (alt ?? name ?? 'User avatar')}
          loading="lazy"
          decoding="async"
          onError={() => setHasError(true)}
          className="w-full h-full object-cover rounded-md"
        />
      ) : (
        <span style={{ fontSize }} className="uppercase font-medium tracking-tight">
          {initials}
        </span>
      )}
    </div>
  );
};
