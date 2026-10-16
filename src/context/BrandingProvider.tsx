import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext';

interface BrandingContextType {
  companyName: string;
  accentColor: string;
  logoUrl?: string | null;
  timezone: string;
}

const BrandingContext = createContext<BrandingContextType>({
  companyName: 'Reamarc',
  accentColor: '#6847E0',
  logoUrl: null,
  timezone: 'Asia/Karachi',
});

export const useBranding = () => useContext(BrandingContext);

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }
  if (clean.length === 6) {
    return {
      r: parseInt(clean.substring(0, 2), 16),
      g: parseInt(clean.substring(2, 4), 16),
      b: parseInt(clean.substring(4, 6), 16),
    };
  }
  return null;
}

function adjustHex(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const adjust = (val: number) => Math.max(0, Math.min(255, Math.round(val * (1 + percent / 100))));
  const r = adjust(rgb.r).toString(16).padStart(2, '0');
  const g = adjust(rgb.g).toString(16).padStart(2, '0');
  const b = adjust(rgb.b).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export const BrandingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const company = user?.company;
  const companyName = company?.name || 'Reamarc';
  const accentColor = company?.accent_color || '#6847E0';
  const logoUrl = company?.logo_url || null;
  const timezone = company?.timezone || 'Asia/Karachi';

  useEffect(() => {
    const root = document.documentElement;
    const rgb = hexToRgb(accentColor);

    if (rgb) {
      const hoverHex = adjustHex(accentColor, -12);
      const activeHex = adjustHex(accentColor, -24);

      root.style.setProperty('--accent', accentColor);
      root.style.setProperty('--accent-hover', hoverHex);
      root.style.setProperty('--accent-active', activeHex);
      root.style.setProperty('--accent-soft', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`);
      root.style.setProperty('--accent-soft-2', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`);
      root.style.setProperty('--accent-200', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.24)`);
      root.style.setProperty('--accent-text', accentColor);
      root.style.setProperty('--accent-pill-bd', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.28)`);
      root.style.setProperty('--accent-pill-bg', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`);
      root.style.setProperty('--accent-pill-fg', accentColor);
      root.style.setProperty('--accent-dot', accentColor);
      root.style.setProperty('--ring', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.24)`);
      root.style.setProperty('--ring-border', accentColor);
      root.style.setProperty('--chart-1', accentColor);
    }

    // Dynamic Document Title
    if (user && companyName) {
      const currentTitle = document.title;
      if (!currentTitle || currentTitle.includes('Reamarc') || currentTitle === 'Vite + React + TS') {
        document.title = `${companyName} · Operations Hub`;
      }
    }

    // Dynamic Favicon
    if (logoUrl) {
      let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'shortcut icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = logoUrl;
    }
  }, [accentColor, companyName, logoUrl, user]);

  const value = useMemo(
    () => ({
      companyName,
      accentColor,
      logoUrl,
      timezone,
    }),
    [companyName, accentColor, logoUrl, timezone]
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
};
