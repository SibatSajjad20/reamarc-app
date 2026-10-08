/**
 * Google Drive Picker Service.
 * Dynamically loads Google Picker API and presents the official Google Drive
 * file picker dialog (with Recent, Upload, My Drive, and Starred tabs).
 */
import type { DrivePickerConfig, DrivePickedFile } from '../types/contentCalendar';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

let gapiLoadingPromise: Promise<void> | null = null;

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
    const existing = document.querySelector('script[src="https://apis.google.com/js/api.js"]');
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
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

export interface OpenDrivePickerOptions {
  config: DrivePickerConfig;
  targetFolderId?: string;
  multiSelect?: boolean;
}

export async function openGoogleDrivePicker(
  options: OpenDrivePickerOptions
): Promise<DrivePickedFile[] | null> {
  const { config, targetFolderId, multiSelect = true } = options;

  if (!config.developer_key) {
    throw new Error('Google Developer API Key is not configured.');
  }
  if (!config.access_token) {
    throw new Error('Google Drive access token unavailable.');
  }

  await loadGapiScript();

  const google = window.google;
  if (!google || !google.picker) {
    throw new Error('Google Picker library is not ready.');
  }

  return new Promise((resolve, reject) => {
    try {
      const folderId = targetFolderId || config.folder_id;

      // 1. Recent tab
      const recentView = new google.picker.DocsView(google.picker.ViewId.RECENTLY_PICKED);

      // 2. Upload tab (Google's native drag & drop / device upload into target Drive folder)
      const uploadView = new google.picker.DocsUploadView();
      if (folderId) {
        uploadView.setParent(folderId);
      }

      // 3. My Drive / Items tab (allows browsing and selecting files)
      const docsView = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false);
      if (folderId) {
        docsView.setParent(folderId);
      }

      // 4. Starred tab
      const starredView = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setStarred(true);

      const builder = new google.picker.PickerBuilder()
        .setTitle('Insert files using Google Drive')
        .addView(recentView)
        .addView(uploadView)
        .addView(docsView)
        .addView(starredView)
        .setOAuthToken(config.access_token)
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
