import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ContentCalendarItem } from '../../../types/contentCalendar';

const getItems = vi.fn();
const transition = vi.fn();
vi.mock('../../../services/contentCalendarService', () => ({
  contentCalendarService: {
    getItems: (...a: unknown[]) => getItems(...a),
    transition: (...a: unknown[]) => transition(...a),
    deleteAsset: vi.fn(),
    getDrivePickerConfig: vi.fn(),
  },
}));
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'c1', name: 'SP Builders', role: 'client', workspace_ids: ['ws1'] } }),
}));
vi.mock('../../layout/BreadcrumbContext', () => ({ useBreadcrumb: () => ({ setTrail: vi.fn() }) }));
vi.mock('../ContentCalendarPipelineView', () => ({ ContentCalendarPipelineView: () => null }));
vi.mock('../ContentCalendarDrawer', () => ({ ContentCalendarDrawer: () => null }));

import { ContentCalendarClientReviews } from '../ContentCalendarClientReviews';

function item(over: Partial<ContentCalendarItem>): ContentCalendarItem {
  return {
    id: 'i6',
    serial: 'CSB-006',
    client_name: 'SP Builders',
    content_concept: 'Carousel',
    stage: 'Creative Client Review',
    workspace_id: 'ws1',
    attachments: [],
    ...over,
  } as unknown as ContentCalendarItem;
}

const reel = item({
  id: 'i5',
  serial: 'CSB-005',
  content_concept: 'Reel',
  attachments: [
    {
      id: 'ast_v',
      kind: 'video',
      content_type: 'video/mp4',
      filename: 'Reel.mp4',
      url: '/uploads/gdrive/DRIVEVID/Reel.mp4',
      thumbnail_url: null,
      role: 'primary',
      order: 0,
      size_bytes: 1,
      uploaded_at: '2026-10-23T00:00:00Z',
    },
  ] as unknown as ContentCalendarItem['attachments'],
});

beforeEach(() => {
  getItems.mockReset();
  transition.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('client portal approvals', () => {
  it('video-only card shows a server still frame, not a black box', async () => {
    getItems.mockResolvedValue({ items: [reel], total: 1, stages_count: {} });
    render(<ContentCalendarClientReviews />);
    const img = (await screen.findByTestId('video-card-still')) as HTMLImageElement;
    expect(img.getAttribute('src')).toMatch(/\/thumbs\/gdrive\/DRIVEVID\/Reel\.mp4\?w=800$/);
    expect(screen.queryByTestId('video-placeholder')).toBeNull();
  });

  it('always loads fresh data and refreshes when the client comes back to the tab', async () => {
    getItems.mockResolvedValueOnce({ items: [item({})], total: 1, stages_count: {} });
    render(<ContentCalendarClientReviews />);
    await screen.findByText(/CSB-006/);
    expect(getItems.mock.calls[0][1]).toEqual({ fresh: true });

    // Client requests changes from the WhatsApp review link, then returns to the portal.
    getItems.mockResolvedValue({
      items: [item({ stage: 'Creative Revision', approval_status: 'Changes Requested', revision_note: '[Client]: fix slide 2' })],
      total: 1,
      stages_count: {},
    });
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 10_000);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(getItems).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Approve$/ })).toBeNull());
    vi.restoreAllMocks();
  });

  it('request revision starts empty and shows earlier feedback as history', async () => {
    getItems.mockResolvedValue({
      items: [item({ revision_note: '[Client]: image 1 and 2 - approved' })],
      total: 1,
      stages_count: {},
    });
    render(<ContentCalendarClientReviews />);
    const btn = await screen.findByRole('button', { name: /Request revision/ });
    fireEvent.click(btn);
    const box = (await screen.findByLabelText(/Revision Feedback/)) as HTMLTextAreaElement;
    expect(box.value).toBe('');
    expect(screen.getByTestId('previous-feedback').textContent).toContain('image 1 and 2 - approved');
  });
});
