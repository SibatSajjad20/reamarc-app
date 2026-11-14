type TextStyleLike = {
  fontWeight?: string | number;
  fontFamily?: string;
  fontStyle?: string;
  [key: string]: unknown;
};

export const APP_FONT = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  regularItalic: 'Geist_400Regular_Italic',
  mediumItalic: 'Geist_500Medium_Italic',
  semiboldItalic: 'Geist_600SemiBold_Italic',
} as const;

function flattenStyle(style: unknown): TextStyleLike {
  if (!style) return {};
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.map((item) => flattenStyle(item)));
  }
  if (typeof style === 'object') return { ...(style as TextStyleLike) };
  return {};
}

function parseWeight(value: TextStyleLike['fontWeight']): number {
  if (value == null) return 400;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value).toLowerCase();
  if (raw === 'normal') return 400;
  if (raw === 'bold') return 700;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 400;
}

/** Cap at semibold so UI copy never renders ExtraBold/Black. */
export function displayWeight(value: TextStyleLike['fontWeight']): 400 | 500 | 600 {
  const n = parseWeight(value);
  if (n >= 600) return 600;
  if (n >= 500) return 500;
  return 400;
}

export function fontFamilyFor(weight: TextStyleLike['fontWeight'], italic?: boolean): string {
  const w = displayWeight(weight);
  if (italic) {
    if (w === 600) return APP_FONT.semiboldItalic;
    if (w === 500) return APP_FONT.mediumItalic;
    return APP_FONT.regularItalic;
  }
  if (w === 600) return APP_FONT.semibold;
  if (w === 500) return APP_FONT.medium;
  return APP_FONT.regular;
}

function isAppFontFamily(family?: string): boolean {
  if (!family) return false;
  return Object.values(APP_FONT).includes(family as (typeof APP_FONT)[keyof typeof APP_FONT]);
}

/** Icon sets (Ionicons, etc.) pass their own fontFamily. Never replace those with Geist. */
export function appTypeStyle(style?: unknown): TextStyleLike {
  const flat = flattenStyle(style);
  const italic = flat.fontStyle === 'italic';
  const { fontWeight, fontFamily, fontStyle, ...rest } = flat;
  if (fontFamily && !isAppFontFamily(String(fontFamily))) {
    return {
      ...rest,
      fontFamily,
      ...(fontStyle ? { fontStyle } : {}),
    };
  }
  return {
    ...rest,
    fontFamily: fontFamilyFor(fontWeight, italic),
    fontStyle: italic ? 'italic' : 'normal',
  };
}
