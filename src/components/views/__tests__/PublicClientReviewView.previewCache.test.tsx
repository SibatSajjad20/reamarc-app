import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PublicClientReviewView } from '../PublicClientReviewView';

type ReviewAsset = {
  id: string;
  filename: string;
  kind: 'image' | 'video';
  url: string;
  content_type: string;
  size_bytes?: number;
  size?: number;
  file_size?: number;
};

type ReviewItem = {
  id: string;
  serial: string;
  client_name: string;
  stage: string;
  download_allowed: boolean;
  content_concept: string;
  creative_type: string;
  attachments: ReviewAsset[];
};

const IMAGE_A = 'https://cdn.example.com/test-asset-image-a.png';
const IMAGE_B = 'https://cdn.example.com/test-asset-image-b.png';
const IMAGE_C = 'https://cdn.example.com/test-asset-image-c.png';
const VIDEO_UNKNOWN = 'https://cdn.example.com/test-asset-video-unknown.mp4';
const VIDEO_LARGE = 'https://cdn.example.com/test-asset-video-large.mp4';
const VIDEO_SMALL = 'https://cdn.example.com/test-asset-video-small.mp4';

function reviewItem(id: string, attachments: ReviewAsset[]): ReviewItem {
  return {
    id,
    serial: 'CAM-CACHE',
    client_name: 'Acme Brand',
    stage: 'Creative Client Review',
    download_allowed: false,
    content_concept: 'Preview cache',
    creative_type: 'Carousel',
    attachments,
  };
}

function imageAsset(id: string, filename: string, url: string): ReviewAsset {
  return {
    id,
    filename,
    kind: 'image',
    url,
    content_type: 'image/png',
    size_bytes: 2048,
  };
}

function mediaResponse(bytes = 32): Response {
  const payload = new Uint8Array(bytes);
  return {
    ok: true,
    headers: { get: () => null },
    blob: async () => new Blob([payload], { type: 'image/png' }),
  } as unknown as Response;
}

describe('PublicClientReviewView preview cache', () => {
  const created: string[] = [];
  let objectUrlCount = 0;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    created.length = 0;
    objectUrlCount = 0;
    URL.createObjectURL = vi.fn(() => {
      objectUrlCount += 1;
      const url = `blob:review-cache-${objectUrlCount}`;
      created.push(url);
      return url;
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
    window.history.pushState({}, '', '/review/cache-token');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalCreate) URL.createObjectURL = originalCreate;
    if (originalRevoke) URL.revokeObjectURL = originalRevoke;
  });

  function installFetch(itemsByToken: Record<string, ReviewItem>, gateMedia = false) {
    const resolvers = new Map<string, (value: Response) => void>();
    const starts: string[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const review = url.match(/\/public\/review\/([^/?#]+)$/);
      if (review) {
        const item = itemsByToken[decodeURIComponent(review[1])];
        return Promise.resolve({
          ok: Boolean(item),
          json: async () => item || { detail: 'Campaign review link not found.' },
        } as Response);
      }
      starts.push(url);
      if (!gateMedia) return Promise.resolve(mediaResponse());
      return new Promise<Response>((resolve) => {
        resolvers.set(url, resolve);
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    return { starts, resolvers, fetchMock };
  }

  function mediaFetches(starts: string[], needle: string) {
    return starts.filter((url) => url === needle);
  }

  it('fetches image A once when switching A → B → A', async () => {
    const item = reviewItem('post-a', [
      imageAsset('asset-a', 'TEST asset image A', IMAGE_A),
      imageAsset('asset-b', 'TEST asset image B', IMAGE_B),
    ]);
    const { starts } = installFetch({ 'cache-token': item });

    render(<PublicClientReviewView />);
    fireEvent.click(await screen.findByRole('button', { name: 'TEST asset image B' }));
    await waitFor(() => expect(mediaFetches(starts, IMAGE_B).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'TEST asset image A' }));

    await waitFor(() => expect(screen.queryByText('Loading creative…')).toBeNull());
    expect(mediaFetches(starts, IMAGE_A)).toHaveLength(1);
  });

  it('shows no Loading creative… text when returning to a ready image', async () => {
    const item = reviewItem('post-ready', [
      imageAsset('asset-a', 'TEST asset image A', IMAGE_A),
      imageAsset('asset-b', 'TEST asset image B', IMAGE_B),
    ]);
    const { starts, resolvers } = installFetch({ 'cache-token': item }, true);

    render(<PublicClientReviewView />);
    await screen.findByRole('button', { name: 'TEST asset image A' });
    await waitFor(() => expect(mediaFetches(starts, IMAGE_A)).toHaveLength(1));
    expect(screen.getByText('Loading creative…')).toBeTruthy();

    resolvers.get(IMAGE_A)?.(mediaResponse());
    await waitFor(() => expect(screen.queryByText('Loading creative…')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'TEST asset image B' }));
    expect(screen.getByText('Loading creative…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'TEST asset image A' }));
    expect(screen.queryByText('Loading creative…')).toBeNull();
  });

  it('prefetches the next 2 images one at a time and never videos', async () => {
    const item = reviewItem('post-prefetch', [
      imageAsset('asset-a', 'TEST asset image A', IMAGE_A),
      imageAsset('asset-b', 'TEST asset image B', IMAGE_B),
      {
        id: 'video-unknown',
        filename: 'TEST asset video unknown',
        kind: 'video',
        url: VIDEO_UNKNOWN,
        content_type: 'video/mp4',
      },
      imageAsset('asset-c', 'TEST asset image C', IMAGE_C),
      {
        id: 'video-large',
        filename: 'TEST asset video large',
        kind: 'video',
        url: VIDEO_LARGE,
        content_type: 'video/mp4',
        file_size: 20 * 1024 * 1024,
      },
      {
        id: 'video-small',
        filename: 'TEST asset video small',
        kind: 'video',
        url: VIDEO_SMALL,
        content_type: 'video/mp4',
        size: 1024,
      },
    ]);
    const { starts, resolvers } = installFetch({ 'cache-token': item }, true);

    render(<PublicClientReviewView />);
    await waitFor(() => expect(mediaFetches(starts, IMAGE_A)).toHaveLength(1));
    expect(mediaFetches(starts, IMAGE_B)).toHaveLength(0);
    expect(mediaFetches(starts, VIDEO_UNKNOWN)).toHaveLength(0);
    expect(mediaFetches(starts, VIDEO_LARGE)).toHaveLength(0);
    expect(mediaFetches(starts, VIDEO_SMALL)).toHaveLength(0);

    resolvers.get(IMAGE_A)?.(mediaResponse());
    await waitFor(() => expect(mediaFetches(starts, IMAGE_B)).toHaveLength(1));
    expect(mediaFetches(starts, IMAGE_C)).toHaveLength(0);
    expect(mediaFetches(starts, VIDEO_SMALL)).toHaveLength(0);

    resolvers.get(IMAGE_B)?.(mediaResponse());
    await waitFor(() => expect(mediaFetches(starts, IMAGE_C)).toHaveLength(1));
    expect(mediaFetches(starts, VIDEO_SMALL)).toHaveLength(0);
    expect(mediaFetches(starts, VIDEO_UNKNOWN)).toHaveLength(0);
    expect(mediaFetches(starts, VIDEO_LARGE)).toHaveLength(0);

    resolvers.get(IMAGE_C)?.(mediaResponse());
    // Media-bandwidth change: videos are never prefetched (they stream on play),
    // and only the next REVIEW_PREFETCH_AHEAD (2) images are.
    await new Promise((r) => setTimeout(r, 50));
    expect(mediaFetches(starts, VIDEO_SMALL)).toHaveLength(0);
    expect(mediaFetches(starts, VIDEO_UNKNOWN)).toHaveLength(0);
    expect(mediaFetches(starts, VIDEO_LARGE)).toHaveLength(0);
  });

  it('revokes object URLs on unmount and not when switching thumbnails', async () => {
    const item = reviewItem('post-revoke', [
      imageAsset('asset-a', 'TEST asset image A', IMAGE_A),
      imageAsset('asset-b', 'TEST asset image B', IMAGE_B),
    ]);
    installFetch({ 'cache-token': item });

    const view = render(<PublicClientReviewView />);
    await waitFor(() => expect(created.length).toBeGreaterThanOrEqual(2));
    fireEvent.click(screen.getByRole('button', { name: 'TEST asset image B' }));
    fireEvent.click(screen.getByRole('button', { name: 'TEST asset image A' }));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    view.unmount();
    for (const url of created) {
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
    }
  });

  it('clears and revokes the cache when the review token changes', async () => {
    const first = reviewItem('post-one', [imageAsset('asset-a', 'TEST asset image A', IMAGE_A)]);
    const second = reviewItem('post-two', [
      imageAsset('asset-b', 'TEST asset image B', 'https://cdn.example.com/test-asset-image-next.png'),
    ]);
    installFetch({ 'cache-token': first, 'next-token': second });

    render(<PublicClientReviewView />);
    await waitFor(() => expect(created).toEqual(['blob:review-cache-1']));

    window.history.pushState({}, '', '/review/next-token');
    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:review-cache-1'));
    expect(await screen.findByAltText('TEST asset image B')).toBeTruthy();
  });

  it('renders a video node only for the selected asset with preload metadata', async () => {
    const item = reviewItem('post-video', [
      imageAsset('asset-a', 'TEST asset image A', IMAGE_A),
      {
        id: 'video-1',
        filename: 'TEST asset video',
        kind: 'video',
        url: 'https://cdn.example.com/test-asset-video.mp4',
        content_type: 'video/mp4',
        size_bytes: 50 * 1024 * 1024,
      },
      {
        id: 'video-2',
        filename: 'TEST asset video B',
        kind: 'video',
        url: 'https://cdn.example.com/test-asset-video-b.mp4',
        content_type: 'video/mp4',
        size_bytes: 40 * 1024 * 1024,
      },
    ]);
    installFetch({ 'cache-token': item });

    render(<PublicClientReviewView />);
    await screen.findByRole('button', { name: 'TEST asset image A' });
    expect(document.querySelector('video')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'TEST asset video' }));
    const video = document.querySelector('video');
    expect(video).toBeTruthy();
    expect(document.querySelectorAll('video')).toHaveLength(1);
    expect(video?.getAttribute('preload')).toBe('metadata');
    expect(video?.getAttribute('src')).toContain('test-asset-video.mp4');

    fireEvent.click(screen.getByRole('button', { name: 'TEST asset video B' }));
    const next = document.querySelector('video');
    expect(document.querySelectorAll('video')).toHaveLength(1);
    expect(next?.getAttribute('preload')).toBe('metadata');
    expect(next?.getAttribute('src')).toContain('test-asset-video-b.mp4');

    fireEvent.click(screen.getByRole('button', { name: 'TEST asset image A' }));
    expect(document.querySelector('video')).toBeNull();
  });
});
