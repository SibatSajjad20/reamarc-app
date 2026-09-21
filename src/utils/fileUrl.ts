import { API_BASE_URL } from '../services/apiClient';

/**
 * Returns the backend URL for an authenticated /uploads path only.
 * Off-origin, data:, and javascript: URLs are rejected.
 */
export const getBackendFileUrl = (url?: string): string => {
  if (!url) return '';
  const uploads = extractUploadsPath(url);
  if (!uploads) return '';
  const backendRoot = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
  return `${backendRoot}${uploads.startsWith('/') ? uploads : `/${uploads}`}`;
};

/** Extract `/uploads/...` path from a relative or absolute backend URL. */
export const extractUploadsPath = (url: string): string | null => {
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
 * Opens an attachment in a new browser tab for viewing.
 * For viewable formats (PDFs, images), fetches via authenticated session and creates an object URL
 * so it renders in the browser tab with the native PDF/image viewer regardless of third-party cookie restrictions.
 * If fetch is unavailable, navigates directly to the backend upload URL.
 */
export const openFileAttachment = async (url: string, filename?: string) => {
  if (!url) return;

  const lower = url.trim().toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:')
  ) {
    console.error('Refusing to open unsafe URL scheme:', url);
    return;
  }

  const uploadsPath = extractUploadsPath(url);
  if (!uploadsPath) {
    console.error('Refusing to open non-upload URL:', url);
    return;
  }

  // Pre-open window synchronously during user gesture to avoid popup blockers.
  // Note: We MUST NOT pass 'noopener' or 'noreferrer' here because per the HTML spec,
  // passing noopener causes window.open to return null, breaking navigation to the blob URL.
  const newTab = window.open('about:blank', '_blank');
  if (newTab) {
    try {
      newTab.document.title = filename || 'Loading Document...';
      newTab.document.body.style.margin = '0';
      newTab.document.body.style.display = 'flex';
      newTab.document.body.style.alignItems = 'center';
      newTab.document.body.style.justifyContent = 'center';
      newTab.document.body.style.height = '100vh';
      newTab.document.body.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      newTab.document.body.style.backgroundColor = '#f8fafc';
      newTab.document.body.innerHTML = `
        <div style="text-align:center;padding:24px;">
          <div style="display:inline-block;width:36px;height:36px;border:3px solid #cbd5e1;border-top-color:#4f46e5;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
          <div style="margin-top:16px;font-size:15px;font-weight:600;color:#1e293b;">Opening document...</div>
          <div style="margin-top:6px;font-size:13px;color:#64748b;">${filename ? filename.replace(/[<>&"]/g, '') : 'Please wait while the file is loaded.'}</div>
        </div>
        <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
      `;
    } catch {
      // In case writing to document fails in any isolated browser environment
    }
  }

  const cleanKey = uploadsPath.replace(/^\/?uploads\//, '');

  const candidateUrls: string[] = [
    `${API_BASE_URL}/uploads/${cleanKey}`,
    `/uploads/${cleanKey}`,
    `${API_BASE_URL}/workspaces/download-proposal?file_path=${encodeURIComponent(uploadsPath)}`,
    `${API_BASE_URL}/daily-log/download-file?file_path=${encodeURIComponent(uploadsPath)}`,
  ];

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
        const contentType = response.headers.get('content-type') || '';
        const blob = await response.blob();

        let finalBlob = blob;
        const lowerName = (filename || url).toLowerCase();
        if (lowerName.endsWith('.pdf') && !contentType.includes('pdf')) {
          finalBlob = new Blob([blob], { type: 'application/pdf' });
        } else if (lowerName.endsWith('.png') && !contentType.includes('png')) {
          finalBlob = new Blob([blob], { type: 'image/png' });
        } else if ((lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) && !contentType.includes('jpeg')) {
          finalBlob = new Blob([blob], { type: 'image/jpeg' });
        } else if (!blob.type && contentType) {
          finalBlob = new Blob([blob], { type: contentType });
        }

        const blobUrl = window.URL.createObjectURL(finalBlob);

        if (newTab && !newTab.closed) {
          try {
            newTab.location.replace(blobUrl);
          } catch {
            try {
              newTab.location.href = blobUrl;
            } catch {
              try {
                newTab.document.body.innerHTML = '';
                const iframe = newTab.document.createElement('iframe');
                iframe.src = blobUrl;
                iframe.style.width = '100%';
                iframe.style.height = '100vh';
                iframe.style.border = 'none';
                newTab.document.body.style.margin = '0';
                newTab.document.body.appendChild(iframe);
              } catch {
                // Ignore fallback error
              }
            }
          }
          try {
            newTab.opener = null;
          } catch {
            // Ignore
          }
        } else {
          const link = document.createElement('a');
          link.href = blobUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }

        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 120_000);
        return;
      }
    } catch (err) {
      console.warn(`Fetch open failed for ${targetUrl}:`, err);
    }
  }

  if (newTab && !newTab.closed) {
    newTab.close();
  }

  if (is404) {
    console.error(`Requested attachment not found on server: ${url}`);
    alert(
      'This proposal document is not on the server anymore — only the link remains in the database.\n\n' +
        'Please re-upload the proposal document in Edit Workspace.'
    );
  } else {
    alert('Unable to open the document. Please try downloading it or contact an administrator.');
  }
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
  const cleanKey = uploadsPath ? uploadsPath.replace(/^\/?uploads\//, '') : url.replace(/^\/?uploads\//, '');

  if (uploadsPath) {
    candidateUrls.push(`${API_BASE_URL}/uploads/${cleanKey}?download=true`);
    candidateUrls.push(`/uploads/${cleanKey}?download=true`);
    candidateUrls.push(
      `${API_BASE_URL}/workspaces/download-proposal?file_path=${encodeURIComponent(uploadsPath)}`
    );
    candidateUrls.push(
      `${API_BASE_URL}/daily-log/download-file?file_path=${encodeURIComponent(uploadsPath)}`
    );
  } else {
    return;
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
