import { API_BASE_URL } from '../services/apiClient';

/**
 * Returns the full backend URL for uploaded files or external links.
 */
export const getBackendFileUrl = (url?: string): string => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  // Strip '/api/v1' from the base URL to get the root backend origin (e.g., http://localhost:8000)
  const backendRoot = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
  const cleanPath = url.startsWith('/') ? url : `/${url}`;
  return `${backendRoot}${cleanPath}`;
};

/**
 * Robustly downloads an attachment file by fetching its binary blob.
 * This guarantees the downloaded file has the exact raw bytes and is never corrupted by HTML SPA fallbacks.
 */
export const downloadFileAttachment = async (url: string, filename?: string) => {
  if (!url) return;
  const fullUrl = getBackendFileUrl(url);

  try {
    const response = await fetch(fullUrl, {
      method: 'GET',
    });

    if (!response.ok) {
      // Fallback: direct window open if fetch fails
      window.open(fullUrl, '_blank');
      return;
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;

    // Determine filename
    let finalName = filename;
    if (!finalName) {
      const urlParts = url.split('/');
      finalName = urlParts[urlParts.length - 1] || 'attachment';
    }
    // Remove UUID prefix if present in filename
    finalName = finalName.replace(/^[a-f0-9]{10}_/, '');

    link.setAttribute('download', finalName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl);
    }, 1000);
  } catch (err) {
    console.error('Blob download failed, falling back to window.open:', err);
    window.open(fullUrl, '_blank');
  }
};
