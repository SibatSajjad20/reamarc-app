export const IOS_IMAGE_SHARE_MAX_BYTES = 15 * 1024 * 1024;

export type PublicDownloadAsset = {
  id?: string | number;
  downloadUrl: string;
  filename: string;
  contentType?: string;
  sizeBytes?: number;
  kind?: string;
  /** Stored in Google Drive: the download comes straight from Google, not through our server. */
  isDrive?: boolean;
};

type NavigatorLike = Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> & {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
};

type WinLike = Pick<Window, 'open'> & { location?: { href: string } };

export function isIOSDevice(nav: NavigatorLike = navigator): boolean {
  const ua = nav.userAgent || '';
  if (/iP(hone|ad|od)/.test(ua)) return true;
  return nav.platform === 'MacIntel' && (nav.maxTouchPoints || 0) > 1;
}

export function isMobileDevice(nav: NavigatorLike = navigator): boolean {
  const ua = nav.userAgent || '';
  return isIOSDevice(nav) || /Android/i.test(ua);
}

export function formatDownloadSize(bytes?: number | null): string {
  if (bytes == null || Number.isNaN(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function triggerAnchorDownload(url: string, filename: string, doc: Document = document): HTMLAnchorElement {
  const a = doc.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  a.rel = 'noopener';
  a.style.display = 'none';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  return a;
}

function isVideoAsset(asset: PublicDownloadAsset): boolean {
  const kind = String(asset.kind || '').toLowerCase();
  const type = String(asset.contentType || '').toLowerCase();
  return kind === 'video' || type.startsWith('video/');
}

function isImageAsset(asset: PublicDownloadAsset): boolean {
  const kind = String(asset.kind || '').toLowerCase();
  const type = String(asset.contentType || '').toLowerCase();
  return kind === 'image' || type.startsWith('image/');
}

function openInSameTab(url: string, win: WinLike): void {
  if (win.location) {
    win.location.href = url;
    return;
  }
  win.open(url, '_self');
}

export async function downloadPublicAsset(
  asset: PublicDownloadAsset,
  nav: NavigatorLike = navigator,
  win: WinLike = window,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!isIOSDevice(nav)) {
    triggerAnchorDownload(asset.downloadUrl, asset.filename);
    return;
  }

  if (isVideoAsset(asset)) {
    win.open(asset.downloadUrl, '_blank');
    return;
  }

  const smallEnoughImage =
    isImageAsset(asset) &&
    (asset.sizeBytes == null || asset.sizeBytes <= IOS_IMAGE_SHARE_MAX_BYTES);

  if (smallEnoughImage) {
    try {
      const res = await fetchImpl(asset.downloadUrl);
      const blob = await res.blob();
      const file = new File([blob], asset.filename || 'image', {
        type: asset.contentType || blob.type || 'image/jpeg',
      });
      if (typeof nav.canShare === 'function' && nav.canShare({ files: [file] }) && typeof nav.share === 'function') {
        await nav.share({ files: [file] });
        return;
      }
    } catch {
      // Safari blocks window.open after await; stay in this tab.
      openInSameTab(asset.downloadUrl, win);
      return;
    }
    openInSameTab(asset.downloadUrl, win);
    return;
  }

  win.open(asset.downloadUrl, '_blank');
}

export async function downloadAllPublicAssets(
  assets: PublicDownloadAsset[],
  gapMs = 400,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  for (let i = 0; i < assets.length; i += 1) {
    const asset = assets[i];
    onProgress?.(i + 1, assets.length);
    triggerAnchorDownload(asset.downloadUrl, asset.filename);
    if (i < assets.length - 1) {
      await sleep(gapMs);
    }
  }
}

/**
 * Files stored in Google Drive download straight from Google (the server answers with a redirect),
 * so they cost no Render bandwidth. Files stored on the app itself still stream through Render,
 * so "Download all" skips big ones; they can still be downloaded one by one.
 */
export const LOCAL_BULK_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const LOCAL_BULK_MAX_TOTAL_BYTES = 100 * 1024 * 1024;

export function planBulkDownload<T extends { isDrive?: boolean; sizeBytes?: number }>(
  assets: T[],
  maxFile = LOCAL_BULK_MAX_FILE_BYTES,
  maxTotal = LOCAL_BULK_MAX_TOTAL_BYTES,
): { queue: T[]; skipped: T[] } {
  const queue: T[] = [];
  const skipped: T[] = [];
  let localTotal = 0;
  for (const a of assets) {
    if (a.isDrive) {
      queue.push(a);
      continue;
    }
    const size = Number(a.sizeBytes || 0);
    if (size > maxFile || localTotal + size > maxTotal) {
      skipped.push(a);
      continue;
    }
    localTotal += size;
    queue.push(a);
  }
  return { queue, skipped };
}
