import { apiClient } from '../services/apiClient';
import { downloadFileAttachment, extractUploadsPath } from './fileUrl';
import { planBulkDownload } from './publicDownload';

/**
 * Downloads that skip our server.
 *
 * Google Drive files: ask the API for a short-lived Google download link and let the browser
 * fetch the bytes straight from Google (no Render bandwidth). Anything else, or if the link can't
 * be made (409), falls back to the normal download through our server.
 */
export interface DirectDownloadAsset {
  url: string;
  filename?: string;
  size_bytes?: number;
  google_drive_file_id?: string | null;
  kind?: string;
}

export function isDriveAsset(asset: DirectDownloadAsset): boolean {
  if (asset.google_drive_file_id) return true;
  const path = extractUploadsPath(asset.url || '') || asset.url || '';
  return path.includes('/uploads/gdrive/');
}

function clickAnchor(href: string, filename?: string) {
  const a = document.createElement('a');
  a.href = href;
  if (filename) a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function getDirectDownloadUrl(asset: DirectDownloadAsset): Promise<string | null> {
  if (!isDriveAsset(asset)) return null;
  const path = extractUploadsPath(asset.url || '') || asset.url;
  try {
    const res = await apiClient.get<{ url?: string }>(`/drive/direct-link?path=${encodeURIComponent(path)}`);
    return res?.url || null;
  } catch {
    return null;
  }
}

/** One file. Returns 'direct' when Google served it, 'proxy' when it went through our server. */
export async function downloadAssetDirect(asset: DirectDownloadAsset): Promise<'direct' | 'proxy'> {
  const direct = await getDirectDownloadUrl(asset);
  if (direct) {
    clickAnchor(direct, asset.filename);
    return 'direct';
  }
  await downloadFileAttachment(asset.url, asset.filename);
  return 'proxy';
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Every file, one after another (browsers block many downloads fired at once).
 * Files stored on our own server are capped (25 MB each, 100 MB total) because they use Render bandwidth.
 */
export async function downloadAllAssets(
  assets: DirectDownloadAsset[],
  opts: { gapMs?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<{ downloaded: number; skipped: DirectDownloadAsset[] }> {
  const files = assets.filter((a) => a.kind !== 'link' && a.url);
  const { queue, skipped } = planBulkDownload(
    files.map((a) => ({ asset: a, isDrive: isDriveAsset(a), sizeBytes: a.size_bytes })),
  );
  let downloaded = 0;
  for (let i = 0; i < queue.length; i += 1) {
    try {
      await downloadAssetDirect(queue[i].asset);
      downloaded += 1;
    } catch {
      /* keep going with the rest */
    }
    opts.onProgress?.(i + 1, queue.length);
    if (i < queue.length - 1) await sleep(opts.gapMs ?? 600);
  }
  return { downloaded, skipped: skipped.map((s) => s.asset) };
}
