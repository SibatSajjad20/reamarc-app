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

function mixWithWhite(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const mix = (v: number) => Math.round(v + (255 - v) * amount).toString(16).padStart(2, '0');
  return `#${mix(rgb.r)}${mix(rgb.g)}${mix(rgb.b)}`;
}

const ACCENT_STYLE_ID = 'company-accent';
const ACCENT_VARS = [
  '--accent', '--accent-hover', '--accent-active', '--accent-soft', '--accent-soft-2', '--accent-200',
  '--accent-text', '--accent-pill-bd', '--accent-pill-bg', '--accent-pill-fg', '--accent-dot', '--ring',
  '--ring-border', '--chart-1',
];

/** CSS for the company accent in light and dark mode. Exported for tests. */
export function accentCss(accentColor: string): string | null {
  const rgb = hexToRgb(accentColor);
  if (!rgb) return null;
  const { r, g, b } = rgb;
  const light: Record<string, string> = {
    '--accent': accentColor,
    '--accent-hover': adjustHex(accentColor, -12),
    '--accent-active': adjustHex(accentColor, -24),
    '--accent-soft': `rgba(${r}, ${g}, ${b}, 0.08)`,
    '--accent-soft-2': `rgba(${r}, ${g}, ${b}, 0.14)`,
    '--accent-200': `rgba(${r}, ${g}, ${b}, 0.24)`,
    '--accent-text': accentColor,
    '--accent-pill-bd': `rgba(${r}, ${g}, ${b}, 0.28)`,
    '--accent-pill-bg': `rgba(${r}, ${g}, ${b}, 0.1)`,
    '--accent-pill-fg': accentColor,
    '--accent-dot': accentColor,
    '--ring': `rgba(${r}, ${g}, ${b}, 0.24)`,
    '--ring-border': accentColor,
    '--chart-1': accentColor,
  };
  // Dark mode: same hue, lighter text and stronger tints so it stays readable on dark surfaces.
  const darkText = mixWithWhite(accentColor, 0.45);
  const dark: Record<string, string> = {
    ...light,
    '--accent-hover': mixWithWhite(accentColor, 0.1),
    '--accent-active': accentColor,
    '--accent-soft': `rgba(${r}, ${g}, ${b}, 0.12)`,
    '--accent-soft-2': `rgba(${r}, ${g}, ${b}, 0.18)`,
    '--accent-200': `rgba(${r}, ${g}, ${b}, 0.35)`,
    '--accent-text': darkText,
    '--accent-pill-bg': `rgba(${r}, ${g}, ${b}, 0.18)`,
    '--accent-pill-fg': darkText,
    '--accent-pill-bd': `rgba(${r}, ${g}, ${b}, 0.35)`,
    '--ring': `rgba(${r}, ${g}, ${b}, 0.35)`,
    '--ring-border': mixWithWhite(accentColor, 0.1),
  };
  const body = (vars: Record<string, string>) => Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join(' ');
  // html.x / body.x beat the plain `.dark` block in index.css (the app puts .dark on <html> AND <body>).
  return `:root, html.light, body.light { ${body(light)} }\nhtml.dark, body.dark { ${body(dark)} }`;
}

export function applyAccent(accentColor: string): void {
  if (typeof document === 'undefined') return;
  const css = accentCss(accentColor);
  if (!css) return;
  const root = document.documentElement;
  // Older builds set these inline on <html>; inline wins over dark mode on <html>, so clear them.
  ACCENT_VARS.forEach((v) => root.style.removeProperty(v));
  let tag = document.getElementById(ACCENT_STYLE_ID) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement('style');
    tag.id = ACCENT_STYLE_ID;
  }
  tag.textContent = css;
  // Always last in <head> so it follows the app stylesheet.
  document.head.appendChild(tag);
}

const LAST_BRAND_KEY = 'reamarc_last_brand';

export function readLastBrand(): { name?: string; display_name?: string; logo_url?: string | null; accent_color?: string } | null {
  try {
    const raw = localStorage.getItem(LAST_BRAND_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLastBrand(c: { name?: string; display_name?: string | null; brand_name?: string | null; logo_url?: string | null; accent_color?: string | null }): void {
  try {
    localStorage.setItem(
      LAST_BRAND_KEY,
      JSON.stringify({
        name: c.name,
        display_name: c.display_name || c.brand_name || c.name,
        logo_url: c.logo_url || null,
        accent_color: c.accent_color || undefined,
      }),
    );
  } catch {}
}

export const BrandingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, pendingBrand } = useAuth();

  // During a switch show the target company; before login (or on a reload) show the last company seen.
  const company: any = pendingBrand || user?.company || (user ? null : readLastBrand());
  const companyName = company?.display_name || company?.brand_name || company?.name || 'Reamarc';
  const accentColor = company?.accent_color || '#6847E0';
  const logoUrl = company?.logo_url || null;
  const timezone = company?.timezone || 'Asia/Karachi';

  useEffect(() => {
    applyAccent(accentColor);
    if (user?.company && !pendingBrand) writeLastBrand(user.company);

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
  }, [accentColor, companyName, logoUrl, user, pendingBrand]);

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
