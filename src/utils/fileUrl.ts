import { API_BASE_URL } from '../services/apiClient';

/**
 * Returns the full backend URL for uploaded files or external links.
 * Prefer authenticated download routes — public /uploads is disabled.
 */
export const getBackendFileUrl = (url?: string): string => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  const backendRoot = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
  const cleanPath = url.startsWith('/') ? url : `/${url}`;
  return `${backendRoot}${cleanPath}`;
};

/** Extract `/uploads/...` path from a relative or absolute backend URL. */
const extractUploadsPath = (url: string): string | null => {
  const raw = url.trim();
  if (!raw) return null;

  if (raw.startsWith('/uploads/') || raw.startsWith('uploads/')) {
    return raw.startsWith('/') ? raw : `/${raw}`;
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const pathname = new URL(raw).pathname || '';
      const idx = pathname.indexOf('/uploads/');
      if (idx !== -1) return pathname.slice(idx);
    } catch {
      return null;
    }
  }

  return null;
};

/**
 * Downloads an attachment via authenticated API download routes (cookie session).
 * Absolute `/uploads/...` host URLs are normalized onto auth download routes so
 * locked-down public StaticFiles mounts do not 404 after security hardening.
 */
export const downloadFileAttachment = async (url: string, filename?: string) => {
  if (!url) return;

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

  let finalName = filename?.trim();
  if (!finalName) {
    const urlParts = url.split('/');
    finalName = urlParts[urlParts.length - 1] || 'attachment';
  }
  finalName = finalName.replace(/^[a-f0-9]{10}_/, '');

  if (sourceExt && !finalName.includes('.')) {
    finalName = `${finalName}.${sourceExt}`;
  }

  const candidateUrls: string[] = [];
  const uploadsPath = extractUploadsPath(url);

  if (uploadsPath) {
    candidateUrls.push(
      `${API_BASE_URL}/workspaces/download-proposal?file_path=${encodeURIComponent(uploadsPath)}`
    );
    candidateUrls.push(
      `${API_BASE_URL}/daily-log/download-file?file_path=${encodeURIComponent(uploadsPath)}`
    );
  } else if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('blob:') ||
    url.startsWith('data:')
  ) {
    candidateUrls.push(url);
  } else {
    candidateUrls.push(
      `${API_BASE_URL}/workspaces/download-proposal?file_path=${encodeURIComponent(url)}`
    );
    candidateUrls.push(
      `${API_BASE_URL}/daily-log/download-file?file_path=${encodeURIComponent(url)}`
    );
  }

  let downloaded = false;
  let is404 = false;

  for (const targetUrl of candidateUrls) {
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
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

  if (!downloaded) {
    if (is404) {
      console.error(`Requested attachment not found on server: ${url}`);
      alert(
        'This proposal PDF is not on the server anymore — only the link remains in the database (common after a cloud redeploy wiped ephemeral disk).\n\n' +
          'Fix once: Admin → Edit Workspace → attach the same PDF again. Do not remove the client or clear the proposal first.\n\n' +
          'After the latest backend is running, that re-attach is stored in MongoDB and will survive future redeploys.'
      );
      return;
    }
    alert('Unable to download the file. Please try again or contact an administrator.');
  }
};
