/**
 * Google Drive Picker Service.
 * Loads GIS for a per-user drive.file token, then presents the official picker.
 * Org Drive credentials never leave the server.
 */
import type { DrivePickerConfig, DrivePickedFile } from '../types/contentCalendar';
import { apiClient } from './apiClient';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const GAPI_SCRIPT_SRC = 'https://apis.google.com/js/api.js';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

let gapiLoadingPromise: Promise<void> | null = null;
let gisLoadingPromise: Promise<void> | null = null;

function loadScript(src: string, failMessage: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === '1') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => {
          existing.remove();
          reject(new Error(failMessage));
        },
        { once: true },
      );
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = '1';
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(failMessage));
    };
    document.body.appendChild(script);
  });
}

function loadGapiScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window unavailable'));
  }
  if (window.gapi && window.google?.picker) {
    return Promise.resolve();
  }
  if (gapiLoadingPromise) {
    return gapiLoadingPromise;
  }

  gapiLoadingPromise = loadScript(GAPI_SCRIPT_SRC, 'Failed to load Google API script')
    .then(
      () =>
        new Promise<void>((resolve, reject) => {
          if (!window.gapi) {
            reject(new Error('Google API Client library failed to load'));
            return;
          }
          window.gapi.load('picker', {
            callback: () => resolve(),
            onerror: () => reject(new Error('Failed to load Google Picker component')),
          });
        }),
    )
    .catch((err) => {
      gapiLoadingPromise = null;
      throw err;
    });

  return gapiLoadingPromise;
}

function loadGisScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window unavailable'));
  }
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (gisLoadingPromise) {
    return gisLoadingPromise;
  }

  gisLoadingPromise = loadScript(GIS_SCRIPT_SRC, 'Failed to load Google Identity Services')
    .then(() => {
      if (window.google?.accounts?.oauth2) {
        return;
      }
      throw new Error('Google Identity Services failed to load');
    })
    .catch((err) => {
      gisLoadingPromise = null;
      throw err;
    });

  return gisLoadingPromise;
}

/** In-memory only (never stored): lets a second Drive click skip the account popup while the token is fresh. */
let cachedDriveToken: { clientId: string; token: string; expiresAt: number } | null = null;

export class DriveSignInCancelled extends Error {
  code = 'cancelled' as const;
  constructor(message = 'Google Drive sign-in was cancelled.') {
    super(message);
    this.name = 'DriveSignInCancelled';
  }
}

export function isDriveCancel(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as any).code === 'cancelled');
}

/** Test hook. */
export function __resetDriveTokenCache(): void {
  cachedDriveToken = null;
}

export async function requestDriveFileAccessToken(clientId: string, now: () => number = Date.now): Promise<string> {
  if (cachedDriveToken && cachedDriveToken.clientId === clientId && cachedDriveToken.expiresAt - 60_000 > now()) {
    return cachedDriveToken.token;
  }
  await loadGisScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2?.initTokenClient) {
    throw new Error('Google Identity Services is not ready.');
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_FILE_SCOPE,
      callback: (resp: { access_token?: string; expires_in?: number | string; error?: string; error_description?: string }) => {
        if (resp?.error || !resp?.access_token) {
          finish(() => reject(new DriveSignInCancelled(resp?.error_description || resp?.error || undefined)));
          return;
        }
        const ttl = Number(resp.expires_in) > 0 ? Number(resp.expires_in) * 1000 : 3_000_000;
        cachedDriveToken = { clientId, token: resp.access_token, expiresAt: now() + ttl };
        finish(() => resolve(resp.access_token as string));
      },
      // Without this, closing the Google account popup never settles and the Drive button stays locked.
      error_callback: (err: { type?: string; message?: string }) => {
        finish(() => reject(new DriveSignInCancelled(err?.type === 'popup_failed_to_open'
          ? 'Your browser blocked the Google sign-in popup. Allow popups and try again.'
          : undefined)));
      },
    });
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

export interface OpenDrivePickerOptions {
  config: DrivePickerConfig;
  targetFolderId?: string;
  multiSelect?: boolean;
}

export async function openGoogleDrivePicker(
  options: OpenDrivePickerOptions
): Promise<DrivePickedFile[] | null> {
  const { config, multiSelect = true } = options;

  if (!config.developer_key) {
    throw new Error('Google Developer API Key is not configured.');
  }
  if (!config.client_id) {
    throw new Error('Google Drive OAuth client ID is not configured.');
  }

  const [userToken] = await Promise.all([
    requestDriveFileAccessToken(config.client_id),
    loadGapiScript(),
  ]);

  const google = window.google;
  if (!google || !google.picker) {
    throw new Error('Google Picker library is not ready.');
  }

  return new Promise((resolve, reject) => {
    try {
      const recentView = new google.picker.DocsView(google.picker.ViewId.RECENTLY_PICKED);
      const uploadView = new google.picker.DocsUploadView();
      const docsView = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false);
      const starredView = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setStarred(true);

      const builder = new google.picker.PickerBuilder()
        .setTitle('Insert files using Google Drive')
        .addView(recentView)
        .addView(uploadView)
        .addView(docsView)
        .addView(starredView)
        .setOAuthToken(userToken)
        .setDeveloperKey(config.developer_key)
        .setCallback((data: any) => {
          if (data.action === google.picker.Action.PICKED) {
            const docs = data[google.picker.Response.DOCUMENTS] || data.docs || [];
            const files: DrivePickedFile[] = docs.map((doc: any) => ({
              id: doc.id,
              name: doc.name || doc[google.picker.Document.NAME] || 'drive_file',
              mime_type: doc.mimeType || doc[google.picker.Document.MIME_TYPE],
              size_bytes: doc.sizeBytes || doc[google.picker.Document.SIZE_BYTES] || 0,
              url: doc.url || doc[google.picker.Document.URL] || doc.embedUrl,
              thumbnail_url:
                doc.thumbnails?.[0]?.url ||
                doc[google.picker.Document.THUMBNAILS]?.[0]?.url ||
                undefined,
            }));
            const fileIds = files.map((f) => f.id).filter(Boolean);
            apiClient
              .post('/drive/picker-grants', { file_ids: fileIds, user_token: userToken })
              .catch(() => undefined)
              .finally(() => resolve(files));
            return;
          } else if (data.action === google.picker.Action.CANCEL) {
            resolve(null);
          }
        });

      if (multiSelect) {
        builder.enableFeature(google.picker.Feature.MULTISELECT_ENABLED);
      }
      builder.enableFeature(google.picker.Feature.SUPPORT_DRIVES);

      if (config.app_id) {
        builder.setAppId(config.app_id);
      }

      const picker = builder.build();
      picker.setVisible(true);
    } catch (err) {
      reject(err);
    }
  });
}
