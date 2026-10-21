import { API_BASE_URL } from '../services/apiClient';
import { notifyFileUrl } from '../lib/notify';

/**
 * Returns the backend URL for an authenticated /uploads path only.
 * Off-origin, data:, and javascript: URLs are rejected.
 */
export const getBackendFileUrl = (url?: string): string => {
  if (!url) return '';
  const uploads = extractUploadsPath(url);
  if (!uploads) return '';
  const cleanKey = uploads.replace(/^\/?uploads\//, '');
  // Same authenticated route the download/fetch helpers use (`/api/v1/uploads/...`).
  return `${API_BASE_URL}/uploads/${cleanKey}`;
};

export const coerceAttachmentBlob = (blob: Blob, filename?: string, headerType?: string): Blob => {
  const lowerName = (filename || '').split(/[?#]/)[0].toLowerCase();
  let type = (blob.type || headerType || '').split(';')[0].trim();
  if (lowerName.endsWith('.pdf')) type = 'application/pdf';
  else if (lowerName.endsWith('.png')) type = 'image/png';
  else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) type = 'image/jpeg';
  else if (lowerName.endsWith('.webp')) type = 'image/webp';
  else if (lowerName.endsWith('.gif')) type = 'image/gif';
  else if (lowerName.endsWith('.mp4') || lowerName.endsWith('.m4v')) type = 'video/mp4';
  else if (lowerName.endsWith('.webm')) type = 'video/webm';
  else if (lowerName.endsWith('.mov')) type = 'video/mp4';
  const current = (blob.type || '').split(';')[0].trim();
  if (type && type !== current) return new Blob([blob], { type });
  return blob;
};

const isVideoFilename = (filename?: string, mime?: string) => {
  const lower = (filename || '').split(/[?#]/)[0].toLowerCase();
  return (
    /\.(mp4|m4v|webm|mov)$/.test(lower) ||
    (mime || '').toLowerCase().startsWith('video/')
  );
};

/**
 * Fetch an authenticated upload into a blob URL.
 * Downloads the whole file first — acceptable for small media, but large videos
 * should use a same-origin `<video src="/api/v1/uploads/...">` so Range/206 works
 * and Vercel does not proxy the entire file as one request.
 */
export const fetchAuthenticatedMediaObjectUrl = async (
  url: string,
  filename?: string,
): Promise<string | null> => {
  const uploadsPath = extractUploadsPath(url);
  if (!uploadsPath) return null;
  const cleanKey = uploadsPath.replace(/^\/?uploads\//, '');
  const response = await fetch(`${API_BASE_URL}/uploads/${cleanKey}`, {
    method: 'GET',
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!response.ok) return null;
  const blob = coerceAttachmentBlob(
    await response.blob(),
    filename || url,
    response.headers.get('content-type') || '',
  );
  return URL.createObjectURL(blob);
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

  const relativeIdx = raw.indexOf('/uploads/');
  if (relativeIdx !== -1) {
    return raw.slice(relativeIdx).split(/[?#]/)[0];
  }

  return null;
};

const isHtmlContentType = (contentType: string | null | undefined) =>
  (contentType || '').toLowerCase().startsWith('text/html');

const attachmentCandidateUrls = (uploadsPath: string): string[] => {
  const cleanKey = uploadsPath.replace(/^\/?uploads\//, '');
  return [
    `${API_BASE_URL}/workspaces/download-proposal?file_path=${encodeURIComponent(uploadsPath)}`,
    `${API_BASE_URL}/uploads/${cleanKey}`,
    `${API_BASE_URL}/daily-log/download-file?file_path=${encodeURIComponent(uploadsPath)}`,
  ];
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

  // Same-origin /api/v1 rewrite: cookies are first-party, so <video> can stream with Range.
  if (isVideoFilename(filename || url)) {
    const playUrl = getBackendFileUrl(url);
    if (playUrl) {
      window.open(playUrl, '_blank', 'noopener,noreferrer');
      return;
    }
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

  const candidateUrls = attachmentCandidateUrls(uploadsPath);

  let is404 = false;
  let attemptCount = 0;
  let forbiddenCount = 0;

  for (const targetUrl of candidateUrls) {
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      attemptCount += 1;

      if (response.status === 403) {
        forbiddenCount += 1;
        continue;
      }

      if (response.status === 404) {
        is404 = true;
        continue;
      }

      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (isHtmlContentType(contentType)) {
          continue;
        }
        const blob = await response.blob();

        const lowerName = (filename || url).toLowerCase();
        const finalBlob = coerceAttachmentBlob(blob, filename || url, contentType);

        const isDocx = lowerName.endsWith('.docx');
        const isDoc = lowerName.endsWith('.doc');

        if (newTab && !newTab.closed && (isDocx || isDoc)) {
          const safeTitle = (filename || 'Word Document').replace(/[<>&"]/g, '');
          newTab.document.title = safeTitle;
          newTab.document.body.innerHTML = `
            <div style="min-height:100vh;background:#f1f5f9;font-family:system-ui,-apple-system,sans-serif;margin:0;display:flex;flex-direction:column;">
              <header style="position:sticky;top:0;z-index:50;height:52px;background:#1e293b;color:white;display:flex;align-items:center;justify-content:space-between;padding:0 24px;box-shadow:0 2px 8px rgba(0,0,0,0.12);">
                <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  <span style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:500px;">${safeTitle}</span>
                  <span style="font-size:11px;font-weight:500;padding:2px 8px;border-radius:12px;background:#334155;color:#94a3b8;">Word Document</span>
                </div>
                <div style="display:flex;align-items:center;gap:10px;">
                  <button id="printBtn" style="background:#334155;color:white;border:none;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">Print</button>
                  <button id="dlBtn" style="background:#4f46e5;color:white;border:none;padding:6px 16px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download
                  </button>
                </div>
              </header>
              <main style="flex:1;display:flex;justify-content:center;padding:32px 16px;">
                <div id="docx-output" style="background:white;box-shadow:0 4px 20px rgba(0,0,0,0.08);border-radius:6px;padding:48px;max-width:900px;width:100%;box-sizing:border-box;min-height:600px;">
                  <div id="docx-loading" style="text-align:center;padding:80px 20px;color:#64748b;">
                    <div style="display:inline-block;width:36px;height:36px;border:3px solid #cbd5e1;border-top-color:#4f46e5;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
                    <div style="margin-top:16px;font-size:14px;font-weight:600;color:#1e293b;">${isDocx ? 'Rendering Word document in browser...' : 'Legacy Word (.doc) Document'}</div>
                    <div style="margin-top:6px;font-size:12px;">Please wait while formatting is parsed.</div>
                  </div>
                </div>
              </main>
            </div>
            <style>
              @keyframes spin { to { transform: rotate(360deg); } }
              .docx-wrapper { background: transparent !important; padding: 0 !important; }
              .docx-wrapper > section.docx { box-shadow: none !important; margin-bottom: 30px !important; }
            </style>
          `;

          const dlBtn = newTab.document.getElementById('dlBtn');
          if (dlBtn) {
            dlBtn.onclick = () => {
              const dlUrl = window.URL.createObjectURL(finalBlob);
              const a = newTab.document.createElement('a');
              a.href = dlUrl;
              a.download = filename || 'document.docx';
              a.click();
              setTimeout(() => window.URL.revokeObjectURL(dlUrl), 2000);
            };
          }
          const printBtn = newTab.document.getElementById('printBtn');
          if (printBtn) {
            printBtn.onclick = () => newTab.print();
          }

          if (isDocx) {
            try {
              const { renderAsync } = await import('docx-preview');
              const container = newTab.document.getElementById('docx-output');
              if (container) {
                container.innerHTML = '';
                await renderAsync(finalBlob, container, undefined, {
                  className: 'docx',
                  inWrapper: false,
                  ignoreWidth: false,
                  ignoreHeight: false,
                  breakPages: true,
                });
              }
            } catch (renderErr) {
              console.warn('In-browser docx preview rendering error:', renderErr);
              const container = newTab.document.getElementById('docx-output');
              if (container) {
                container.innerHTML = `
                  <div style="text-align:center;padding:60px 20px;color:#475569;">
                    <div style="margin-bottom:12px;display:flex;justify-content:center;"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></div>
                    <h3 style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 8px 0;">Document Ready to View</h3>
                    <p style="font-size:13px;color:#64748b;max-width:440px;margin:0 auto 20px auto;">
                      This document contains specialized formatting. You can view or save the file using the download button above.
                    </p>
                  </div>
                `;
              }
            }
          } else {
            // .doc legacy format
            const container = newTab.document.getElementById('docx-output');
            if (container) {
              container.innerHTML = `
                <div style="text-align:center;padding:60px 20px;color:#475569;">
                  <div style="margin-bottom:12px;display:flex;justify-content:center;"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></div>
                  <h3 style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 8px 0;">Legacy Word Document (.doc)</h3>
                  <p style="font-size:13px;color:#64748b;max-width:440px;margin:0 auto 20px auto;">
                    This file is in legacy binary Word format. Modern in-browser rendering supports .docx files. Use the Download button to open in Microsoft Word.
                  </p>
                </div>
              `;
            }
          }
          return;
        }

        if (newTab && !newTab.closed && isVideoFilename(filename || url, finalBlob.type)) {
          const playUrl = getBackendFileUrl(url) || targetUrl;
          const safeTitle = (filename || 'Video').replace(/[<>&"]/g, '');
          try {
            newTab.document.title = safeTitle;
            newTab.document.body.style.margin = '0';
            newTab.document.body.style.display = 'block';
            newTab.document.body.style.height = '100vh';
            newTab.document.body.style.backgroundColor = '#000';
            newTab.document.body.innerHTML = `
              <video src="${playUrl}" controls autoplay playsinline style="width:100%;height:100vh;object-fit:contain;background:#000"></video>
            `;
          } catch {
            try {
              newTab.location.replace(playUrl);
            } catch {
              // Ignore fallback error
            }
          }
          return;
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

  if (attemptCount > 0 && forbiddenCount === attemptCount) {
    notifyFileUrl("You don't have access to this file", undefined, 'error');
  } else if (is404) {
    console.error(`Requested attachment not found on server: ${url}`);
    notifyFileUrl(
      'Document not found',
      'This proposal document is not on the server anymore. Please re-upload the proposal document in Edit Workspace.',
      'error'
    );
  } else {
    notifyFileUrl(
      'Unable to open document',
      'Please try downloading it or contact an administrator.',
      'error'
    );
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

  const uploadsPath = extractUploadsPath(url);
  if (!uploadsPath) {
    return;
  }
  const candidateUrls = attachmentCandidateUrls(uploadsPath);

  let downloaded = false;
  let is404 = false;
  let attemptCount = 0;
  let forbiddenCount = 0;

  for (const targetUrl of candidateUrls) {
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      attemptCount += 1;

      if (response.status === 403) {
        forbiddenCount += 1;
        continue;
      }

      if (response.status === 404) {
        is404 = true;
        continue;
      }

      if (response.ok) {
        if (isHtmlContentType(response.headers.get('content-type'))) {
          continue;
        }
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
    if (attemptCount > 0 && forbiddenCount === attemptCount) {
      notifyFileUrl("You don't have access to this file", undefined, 'error');
      return;
    }
    if (is404) {
      console.error(`Requested attachment not found on server: ${url}`);
      notifyFileUrl(
        'Proposal PDF not found',
        'This proposal PDF is not on the server anymore. Re-attach it in Admin → Edit Workspace to restore.',
        'error'
      );
      return;
    }
    notifyFileUrl(
      'Unable to download file',
      'Please try again or contact an administrator.',
      'error'
    );
  }
};

/**
 * Checks if a URL is a real media content thumbnail rather than a 16px generic file-type icon.
 */
export const isRealThumbnailUrl = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim().toLowerCase();
  if (!trimmed) return false;
  if (
    trimmed.includes('gstatic.com/docs/doclist/images') ||
    trimmed.includes('drive-thirdparty.googleusercontent.com') ||
    trimmed.includes('/icon_10_') ||
    trimmed.includes('/icon_11_')
  ) {
    return false;
  }
  return true;
};
