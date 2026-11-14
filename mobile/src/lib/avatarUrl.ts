export function resolveAvatarUri(
  uri?: string | null,
  size = 44,
  apiBase = '',
): string | null {
  const raw = String(uri || '').trim();
  if (!raw) return null;

  let src = raw;
  if (src.startsWith('/') && apiBase) {
    src = `${apiBase.replace(/\/$/, '')}${src}`;
  }

  if (src.includes('res.cloudinary.com') && src.includes('/image/upload/')) {
    const parts = src.split('/image/upload/');
    const after = parts[1] || '';
    if (after && !after.startsWith('c_') && !after.startsWith('f_') && !after.startsWith('w_')) {
      const px = Math.max(48, Math.round(size * 2));
      return `${parts[0]}/image/upload/c_fill,g_face,w_${px},h_${px},f_auto,q_auto/${after}`;
    }
  }
  return src;
}
