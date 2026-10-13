/**
 * Google Drive Picker Service.
 * Loads GIS for a per-user drive.file token, then presents the official picker.
 * Org Drive credentials never leave the server.
 */
import type { DrivePickerConfig, DrivePickedFile } from '../types/contentCalendar';

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

  gapiLoadingPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GAPI_SCRIPT_SRC}"]`);
    if (!existing) {
      const script = document.createElement('script');
      script.src = GAPI_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (!window.gapi) {
          reject(new Error('Google API Client library failed to load'));
          return;
        }
        window.gapi.load('picker', {
          callback: () => resolve(),
          onerror: () => reject(new Error('Failed to load Google Picker component')),
        });
      };
      script.onerror = () => reject(new Error('Failed to load Google API script'));
      document.body.appendChild(script);
    } else {
      if (window.gapi?.load) {
        window.gapi.load('picker', {
          callback: () => resolve(),
          onerror: () => reject(new Error('Failed to load Google Picker component')),
        });
      } else {
        existing.addEventListener('load', () => {
          window.gapi.load('picker', {
            callback: () => resolve(),
            onerror: () => reject(new Error('Failed to load Google Picker component')),
          });
        });
      }
    }
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

  gisLoadingPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`);
    const onReady = () => {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }
      reject(new Error('Google Identity Services failed to load'));
    };
    if (!existing) {
      const script = document.createElement('script');
      script.src = GIS_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = onReady;
      script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
      document.body.appendChild(script);
    } else if (window.google?.accounts?.oauth2) {
      resolve();
    } else {
      existing.addEventListener('load', onReady);
    }
  });

  return gisLoadingPromise;
}

async function requestDriveFileAccessToken(clientId: string): Promise<string> {
  await loadGisScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2?.initTokenClient) {
    throw new Error('Google Identity Services is not ready.');
  }

  return new Promise((resolve, reject) => {
    const tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_FILE_SCOPE,
      callback: (resp: { access_token?: string; error?: string; error_description?: string }) => {
        if (resp?.error || !resp?.access_token) {
          reject(new Error(resp?.error_description || resp?.error || 'Google Drive sign-in was cancelled.'));
          return;
        }
        resolve(resp.access_token);
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
            resolve(files);
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
