import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PublicClientReviewView } from '../PublicClientReviewView';
import * as publicDownload from '../../../utils/publicDownload';
import { toast } from 'sonner';

const mockItem = {
  serial: 'CAM-101',
  client_name: 'Acme Brand',
  stage: 'Creative Client Review',
  download_allowed: true,
  headlines_hooks: 'Hook 1\nHook 2',
  content_concept: 'Summer Launch Campaign',
  creative_type: 'Carousel',
  attachments: [
    {
      id: 'asset-1',
      filename: 'hero-1.png',
      kind: 'image',
      url: 'https://cdn.example.com/hero-1.png',
      download_url: 'https://cdn.example.com/hero-1.png?download=1',
      content_type: 'image/png',
      size_bytes: 1024,
    },
    {
      id: 'asset-2',
      filename: 'hero-2.png',
      kind: 'image',
      url: 'https://cdn.example.com/hero-2.png',
      download_url: 'https://cdn.example.com/hero-2.png?download=1',
      content_type: 'image/png',
      size_bytes: 2048,
    },
  ],
};

describe('PublicClientReviewView download feedback', () => {
  const origImage = window.Image;

  beforeEach(() => {
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      _src = '';
      get src() {
        return this._src;
      }
      set src(val: string) {
        this._src = val;
        Promise.resolve().then(() => {
          this.onload?.();
        });
      }
    }
    window.Image = MockImage as any;

    window.history.pushState({}, '', '/review/sample-token');

    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/content-calendar/public/review/')) {
        return {
          ok: true,
          json: async () => mockItem,
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.Image = origImage;
  });

  it('a double-click starts exactly one download', async () => {
    const downloadSpy = vi.spyOn(publicDownload, 'downloadPublicAsset').mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 500))
    );

    render(<PublicClientReviewView />);

    const pillBtn = await screen.findByRole('button', { name: /download slide 1 of 2/i });
    expect(pillBtn).toBeTruthy();

    // Rapid double-click
    fireEvent.click(pillBtn);
    fireEvent.click(pillBtn);

    expect(downloadSpy).toHaveBeenCalledTimes(1);
  });

  it('the button is disabled and shows "Downloading…" during the download, and re-enables after', async () => {
    let resolveDownload!: () => void;
    const pendingPromise = new Promise<void>((resolve) => {
      resolveDownload = resolve;
    });

    vi.spyOn(publicDownload, 'downloadPublicAsset').mockImplementation(() => pendingPromise);

    render(<PublicClientReviewView />);

    const pillBtn = (await screen.findByRole('button', { name: /download slide 1 of 2/i })) as HTMLButtonElement;

    expect(pillBtn.disabled).toBe(false);
    expect(pillBtn.textContent).toContain('Download');

    // Click to start download
    fireEvent.click(pillBtn);

    // During download: button is disabled and shows "Downloading…"
    expect(pillBtn.disabled).toBe(true);
    expect(pillBtn.textContent).toContain('Downloading…');

    // Switch to fake timers before resolving so we can control the 2s success timeout
    vi.useFakeTimers();

    // Complete the download
    await act(async () => {
      resolveDownload();
      // Allow promise microtasks to run
      await Promise.resolve();
    });

    // Shows "Downloaded" with the check icon, not a second ✓
    expect(pillBtn.textContent).toContain('Downloaded');
    expect(pillBtn.textContent).not.toContain('Downloaded ✓');
    expect(pillBtn.disabled).toBe(true);

    // Advance 2 seconds
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    // Re-enables after 2s with original label
    expect(pillBtn.disabled).toBe(false);
    expect(pillBtn.textContent).toContain('Download');
  });

  it('"Download all" downloads each file once', async () => {
    const downloadAllSpy = vi.spyOn(publicDownload, 'downloadAllPublicAssets').mockImplementation(
      async (assets, _gapMs, _sleep, onProgress) => {
        for (let i = 0; i < assets.length; i++) {
          onProgress?.(i + 1, assets.length);
        }
      }
    );

    render(<PublicClientReviewView />);

    const downloadAllBtn = (await screen.findByRole('button', { name: /download all \(2\)/i })) as HTMLButtonElement;
    expect(downloadAllBtn.disabled).toBe(false);

    // Rapid double-click
    fireEvent.click(downloadAllBtn);
    fireEvent.click(downloadAllBtn);

    // Guards against duplicate runs
    expect(downloadAllSpy).toHaveBeenCalledTimes(1);
    const passedAssets = downloadAllSpy.mock.calls[0][0];
    expect(passedAssets).toHaveLength(2);
    expect(passedAssets[0].filename).toBe('hero-1.png');
    expect(passedAssets[1].filename).toBe('hero-2.png');
  });

  it('disables all download buttons and shows progress during "Download all"', async () => {
    let finishDownloadAll!: () => void;
    const pendingAll = new Promise<void>((resolve) => {
      finishDownloadAll = resolve;
    });

    vi.spyOn(publicDownload, 'downloadAllPublicAssets').mockImplementation(
      async (assets, _gapMs, _sleep, onProgress) => {
        onProgress?.(2, assets.length);
        await pendingAll;
      }
    );

    render(<PublicClientReviewView />);

    const downloadAllBtn = (await screen.findByRole('button', { name: /download all \(2\)/i })) as HTMLButtonElement;
    const pillBtn = (await screen.findByRole('button', { name: /download slide 1 of 2/i })) as HTMLButtonElement;

    fireEvent.click(downloadAllBtn);

    // Progress is shown on Download all
    expect(downloadAllBtn.textContent).toContain('Downloading 2 of 2…');
    // All download buttons are disabled
    expect(downloadAllBtn.disabled).toBe(true);
    expect(pillBtn.disabled).toBe(true);

    vi.useFakeTimers();

    await act(async () => {
      finishDownloadAll();
      await Promise.resolve();
    });

    expect(downloadAllBtn.textContent).toContain('Downloaded');
    expect(downloadAllBtn.textContent).not.toContain('Downloaded ✓');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(downloadAllBtn.disabled).toBe(false);
    expect(pillBtn.disabled).toBe(false);
  });

  it('the failure path shows the error and re-enables the button', async () => {
    const toastErrorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'err-id' as any);
    vi.spyOn(publicDownload, 'downloadPublicAsset').mockRejectedValue(new Error('Network error'));

    render(<PublicClientReviewView />);

    const pillBtn = (await screen.findByRole('button', { name: /download slide 1 of 2/i })) as HTMLButtonElement;

    // Trigger download which will fail
    fireEvent.click(pillBtn);

    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledWith('Download failed, try again');
    });

    // Button is re-enabled immediately
    expect(pillBtn.disabled).toBe(false);
    expect(pillBtn.textContent).toContain('Download');
  });

  it('thumbnails have no download buttons', async () => {
    render(<PublicClientReviewView />);

    const thumb1 = await screen.findByRole('button', { name: 'hero-1.png' });
    const thumb2 = screen.getByRole('button', { name: 'hero-2.png' });
    expect(thumb1.querySelector('svg.lucide-download')).toBeNull();
    expect(thumb2.querySelector('svg.lucide-download')).toBeNull();
    expect(screen.getAllByRole('button', { name: /download slide \d of 2/i })).toHaveLength(1);
  });

  it('clicking a thumbnail selects it and does not download', async () => {
    const downloadSpy = vi.spyOn(publicDownload, 'downloadPublicAsset').mockResolvedValue();

    render(<PublicClientReviewView />);

    const thumb2 = await screen.findByRole('button', { name: 'hero-2.png' });
    fireEvent.click(thumb2);

    expect(downloadSpy).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: /download slide 2 of 2/i })).toBeTruthy();
    expect(thumb2.className).toContain('border-accent');
  });

  it('the Download button on the info row downloads the currently selected asset', async () => {
    const downloadSpy = vi.spyOn(publicDownload, 'downloadPublicAsset').mockResolvedValue();

    render(<PublicClientReviewView />);

    fireEvent.click(await screen.findByRole('button', { name: 'hero-2.png' }));
    const infoRowDownload = await screen.findByRole('button', { name: /download slide 2 of 2/i });
    expect(infoRowDownload.className).toContain('min-h-11');
    fireEvent.click(infoRowDownload);

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(downloadSpy.mock.calls[0][0].filename).toBe('hero-2.png');
  });
});
