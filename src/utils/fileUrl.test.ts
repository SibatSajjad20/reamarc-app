import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_BASE_URL } from '../services/apiClient';
import { notifyFileUrl } from '../lib/notify';
import { downloadFileAttachment, openFileAttachment } from './fileUrl';

vi.mock('../lib/notify', () => ({
  notifyFileUrl: vi.fn(),
}));

const SOURCE = '/uploads/abc123/abc123.pdf';

function pdfResponse() {
  return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
    status: 200,
    headers: { 'content-type': 'application/pdf' },
  });
}

function htmlResponse() {
  return new Response('<!doctype html><html><body>index</body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

describe('fileUrl attachment fetch order', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(notifyFileUrl).mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => pdfResponse()),
    );
    vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(window, 'open').mockReturnValue({
      closed: false,
      document: {
        title: '',
        body: {
          style: {} as CSSStyleDeclaration,
          innerHTML: '',
          appendChild: vi.fn(),
        },
        createElement: document.createElement.bind(document),
        getElementById: () => null,
      },
      location: { replace: vi.fn(), href: '' },
      close: vi.fn(),
      opener: null,
    } as unknown as Window);
  });

  it('tries download-proposal first for view and download', async () => {
    await downloadFileAttachment(SOURCE, 'abc123.pdf');
    await openFileAttachment(SOURCE, 'abc123.pdf');

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    const firstDownload = String(fetchMock.mock.calls[0][0]);
    const firstView = String(fetchMock.mock.calls[1][0]);
    const expected = `${API_BASE_URL}/workspaces/download-proposal?file_path=${encodeURIComponent(SOURCE)}`;
    expect(firstDownload).toBe(expected);
    expect(firstView).toBe(expected);
  });

  it('skips a 200 text/html response and continues to the next candidate', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(htmlResponse())
      .mockResolvedValueOnce(pdfResponse());

    await downloadFileAttachment(SOURCE, 'abc123.pdf');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/workspaces/download-proposal');
    expect(String(fetchMock.mock.calls[1][0])).toBe(`${API_BASE_URL}/uploads/abc123/abc123.pdf`);
    expect(notifyFileUrl).not.toHaveBeenCalled();
  });

  it('never fetches a relative /uploads URL', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/uploads/')) {
        throw new Error(`relative /uploads fetch: ${url}`);
      }
      return htmlResponse();
    });

    await downloadFileAttachment(SOURCE, 'abc123.pdf');
    await openFileAttachment(SOURCE, 'abc123.pdf');

    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    for (const [input] of fetchMock.mock.calls) {
      const url = String(input);
      expect(url.startsWith('/uploads/')).toBe(false);
      expect(url.startsWith('/uploads')).toBe(false);
    }
  });
});
