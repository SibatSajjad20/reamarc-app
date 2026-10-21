export const DEFAULT_ACCENT = '#6847E0';
export const DEFAULT_BRAND_NAME = 'Reamarc';

export const ACCENT_SWATCHES = [
  '#6847E0',
  '#0E7C66',
  '#2563EB',
  '#C2410C',
  '#BE123C',
  '#18181B',
] as const;

export function brandNameOf(company?: {
  display_name?: string | null;
  brand_name?: string | null;
  name?: string | null;
} | null): string {
  const display = company?.display_name?.trim();
  if (display) return display;
  if (company?.brand_name?.trim()) return company.brand_name.trim();
  return company?.name?.trim() || DEFAULT_BRAND_NAME;
}

export function initialsOf(name?: string | null): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'R';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function cloudinaryVariant(url: string | null | undefined, transform: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'res.cloudinary.com') return url;
    const marker = '/upload/';
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) return url;
    parsed.pathname = `${parsed.pathname.slice(0, idx + marker.length)}${transform}/${parsed.pathname.slice(idx + marker.length)}`;
    return parsed.toString();
  } catch {
    return url;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }
  if (clean.length === 6 && /^[0-9a-fA-F]{6}$/.test(clean)) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }
  return null;
}

export function contrastAgainstWhite(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const channel = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  return 1.05 / (luminance + 0.05);
}

export function slugBrand(name?: string | null): string {
  return (name || DEFAULT_BRAND_NAME).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'company';
}

export function normalizeHexInput(value: string): string {
  const raw = value.trim();
  if (!raw.startsWith('#')) return `#${raw}`;
  return raw;
}
