import { API_URL } from '../theme';

const THUMBABLE = /\.(jpe?g|png|webp|gif|bmp|heic|heif|tiff?)$/i;
const VIDEO_STILLABLE = /\.(mp4|mov|m4v|webm)$/i;

export function isGenericFileIcon(url?: string | null): boolean {
  if (!url) return true;
  const trimmed = url.trim().toLowerCase();
  if (!trimmed) return true;
  return (
    trimmed.includes('gstatic.com/docs/doclist/images') ||
    trimmed.includes('drive-thirdparty.googleusercontent.com') ||
    trimmed.includes('/icon_10_') ||
    trimmed.includes('/icon_11_')
  );
}

export function extractUploadsPath(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;
  if (raw.startsWith('/uploads/') || raw.startsWith('uploads/')) {
    return raw.startsWith('/') ? raw : `/${raw}`;
  }
  if (raw.startsWith('/thumbs/') || raw.startsWith('thumbs/')) {
    const rest = raw.replace(/^\/?thumbs\//, '');
    return `/uploads/${rest.split('?')[0]}`;
  }
  const idx = raw.indexOf('/uploads/');
  if (idx !== -1) return raw.slice(idx).split(/[?#]/)[0];
  const thumbsIdx = raw.indexOf('/thumbs/');
  if (thumbsIdx !== -1) return `/uploads/${raw.slice(thumbsIdx + '/thumbs/'.length).split(/[?#]/)[0]}`;
  return null;
}

export function resolveThumbUrl(url?: string | null, width: 200 | 400 | 800 = 400): string {
  if (!url || isGenericFileIcon(url)) return '';
  const uploads = extractUploadsPath(url);
  if (uploads) {
    const cleanKey = uploads.replace(/^\/?uploads\//, '');
    const file = cleanKey.split(/[?#]/)[0];
    if (THUMBABLE.test(file) || VIDEO_STILLABLE.test(file) || cleanKey.startsWith('gdrive/')) {
      return `${API_URL}/thumbs/${cleanKey}?w=${width}`;
    }
    return `${API_URL}/uploads/${cleanKey}`;
  }
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `${API_URL}${url}`;
  return '';
}

export function mediaNeedsAuth(url: string): boolean {
  if (!url) return false;
  if (url.startsWith(API_URL)) return true;
  return url.startsWith('/thumbs/') || url.startsWith('/uploads/');
}
