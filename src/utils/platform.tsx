import React from 'react';
import type { PlatformType } from '../types';
import {
  InstagramIcon,
  LinkedinIcon,
  FacebookIcon,
  TwitterIcon,
} from '../components/SocialIcons';

export const PLATFORM_LIMITS: Record<PlatformType, number> = {
  Twitter: 280,
  Instagram: 2200,
  LinkedIn: 3000,
  Facebook: 5000,
};

export const PLATFORM_COLOR_CLASSES: Record<PlatformType, string> = {
  Instagram: 'text-pink-400',
  LinkedIn: 'text-blue-400',
  Facebook: 'text-indigo-400',
  Twitter: 'text-sky-400',
};

interface PlatformIconProps {
  platform: PlatformType;
  className?: string;
}

export const PlatformIcon: React.FC<PlatformIconProps> = ({
  platform,
  className = 'w-4 h-4',
}) => {
  const colorClass = PLATFORM_COLOR_CLASSES[platform] || 'text-zinc-400';
  const combinedClass = `${className} ${colorClass}`.trim();

  switch (platform) {
    case 'Instagram':
      return <InstagramIcon className={combinedClass} />;
    case 'LinkedIn':
      return <LinkedinIcon className={combinedClass} />;
    case 'Facebook':
      return <FacebookIcon className={combinedClass} />;
    case 'Twitter':
      return <TwitterIcon className={combinedClass} />;
    default:
      return null;
  }
};
