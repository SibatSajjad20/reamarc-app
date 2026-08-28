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
 * Robustly downloads an attachment or proposal document.
 * Tries authenticated API download routes and direct static URLs,
 * handles binary blobs, and guarantees correct filename extensions (.pdf, .docx, etc.).
 */
export const downloadFileAttachment = async (url: string, filename?: string) => {
  if (!url) return;

  // Derive source extension from URL if available
  let sourceExt = '';
  try {
    const urlWithoutQuery = url.split(/[?#]/)[0];
    const dotIndex = urlWithoutQuery.lastIndexOf('.');
    if (dotIndex !== -1 && dotIndex < urlWithoutQuery.length - 1) {
      sourceExt = urlWithoutQuery.substring(dotIndex + 1).toLowerCase();
    }
  } catch {
    sourceExt = '';
  }

  // Derive initial clean filename
  let finalName = filename?.trim();
  if (!finalName) {
    const urlParts = url.split('/');
    finalName = urlParts[urlParts.length - 1] || 'attachment';
  }
  // Remove UUID prefix (e.g., "8660ed9510_") if present
  finalName = finalName.replace(/^[a-f0-9]{10}_/, '');

  // If finalName doesn't have an extension but the source URL does, append it
  if (sourceExt && !finalName.includes('.')) {
    finalName = `${finalName}.${sourceExt}`;
  }

  const token = typeof window !== 'undefined' ? localStorage.getItem('reamarc_token') : null;
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  // Build candidate URLs to try in order
  const candidateUrls: string[] = [];

  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) {
    candidateUrls.push(url);
  } else {
    // Relative upload path
    candidateUrls.push(`${API_BASE_URL}/workspaces/download-proposal?file_path=${encodeURIComponent(url)}`);
    candidateUrls.push(`${API_BASE_URL}/daily-log/download-file?file_path=${encodeURIComponent(url)}`);
    candidateUrls.push(getBackendFileUrl(url));
  }

  let downloaded = false;
  let is404 = false;

  for (const targetUrl of candidateUrls) {
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: authHeaders,
        credentials: 'include',
      });

      if (response.status === 404) {
        is404 = true;
        continue;
      }

      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.setAttribute('download', finalName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => {
          window.URL.revokeObjectURL(blobUrl);
        }, 2000);

        downloaded = true;
        break;
      }
    } catch (err) {
      console.warn(`Fetch download failed for ${targetUrl}:`, err);
    }
  }

  // Handle download failure
  if (!downloaded) {
    if (is404) {
      console.error(`Requested attachment not found on server: ${url}`);
      alert('The requested proposal file was not found on the server storage. Please re-upload the proposal document via Edit Workspace.');
      return;
    }

    // Fallback: direct anchor trigger if blob fetch was blocked
    const fallbackUrl = getBackendFileUrl(url);
    const link = document.createElement('a');
    link.href = fallbackUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('download', finalName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};
