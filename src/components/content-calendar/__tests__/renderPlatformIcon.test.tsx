import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { renderPlatformIcon } from '../ContentCalendarTableView';
import { renderChannelIcons } from '../ContentCalendarClientReviews';
import type { ContentCalendarItem } from '../../../types/contentCalendar';

const createMockItem = (overrides: Partial<ContentCalendarItem> = {}): ContentCalendarItem =>
  ({
    id: 'mock-item-1',
    serial: 'C001',
    client_id: 'ws-1',
    client_name: 'Test Client',
    campaign_type: '',
    creative_type: '',
    content_type: '',
    date: '2026-10-20',
    stage: 'concept',
    stage_status: 'pending',
    captions_hashtags: '',
    channels: [],
    created_at: '2026-10-20T00:00:00Z',
    updated_at: '2026-10-20T00:00:00Z',
    ...overrides,
  }) as unknown as ContentCalendarItem;

describe('renderPlatformIcon', () => {
  it('shows no icon when caption contains "design" or "right" without matching channels', () => {
    const itemWithDesign = createMockItem({
      serial: 'C001',
      captions_hashtags: 'Modern graphic design concept for summer release',
      campaign_type: 'Design campaign',
      channels: undefined,
    });

    const itemWithRight = createMockItem({
      serial: 'C002',
      captions_hashtags: 'Making the right move right now',
      campaign_type: 'Brand campaign',
      channels: undefined,
    });

    expect(renderPlatformIcon(itemWithDesign)).toBeNull();
    expect(renderPlatformIcon(itemWithRight)).toBeNull();

    // Verify when channels is explicitly an empty array
    expect(renderPlatformIcon({ ...itemWithDesign, channels: [] })).toBeNull();
    expect(renderPlatformIcon({ ...itemWithRight, channels: [] })).toBeNull();
  });

  it('shows the Instagram icon when channels is ["Instagram"]', () => {
    const item = createMockItem({
      serial: 'C003',
      channels: ['Instagram'],
      captions_hashtags: 'Clean design crafted right',
    });

    const icon = renderPlatformIcon(item);
    expect(icon).not.toBeNull();

    const { container } = render(<>{icon}</>);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('fill')).toBe('#FF0069');

    // Case-insensitivity check
    const iconLower = renderPlatformIcon({ ...item, channels: ['instagram'] });
    expect(iconLower).not.toBeNull();
    const iconUpper = renderPlatformIcon({ ...item, channels: ['INSTAGRAM'] });
    expect(iconUpper).not.toBeNull();
  });

  it('shows nothing when channels is empty', () => {
    expect(renderPlatformIcon(createMockItem({ serial: 'C004', channels: [] }))).toBeNull();
    expect(renderPlatformIcon(createMockItem({ serial: 'C005', channels: undefined }))).toBeNull();
    expect(renderPlatformIcon(createMockItem({ serial: 'C006', channels: ['   '] }))).toBeNull();
  });

  it('drops substring matches like "ig" and "fb"', () => {
    const itemIg = createMockItem({ serial: 'C007', channels: ['ig'] });
    const itemFb = createMockItem({ serial: 'C008', channels: ['fb'] });
    expect(renderPlatformIcon(itemIg)).toBeNull();
    expect(renderPlatformIcon(itemFb)).toBeNull();
  });
});

describe('renderChannelIcons in ContentCalendarClientReviews', () => {
  it('returns null when channels is empty', () => {
    expect(renderChannelIcons()).toBeNull();
    expect(renderChannelIcons([])).toBeNull();
    expect(renderChannelIcons(['   '])).toBeNull();
  });

  it('shows the Instagram icon when channels is ["Instagram"]', () => {
    const element = renderChannelIcons(['Instagram']);
    expect(element).not.toBeNull();

    const { container } = render(<>{element}</>);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('fill')).toBe('#FF0069');
  });

  it('drops substring matches like "ig" and "fb"', () => {
    const element = renderChannelIcons(['ig', 'fb']);
    expect(element).not.toBeNull();

    const { container } = render(<>{element}</>);
    // Neither 'ig' nor 'fb' should be recognized as a brand icon
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).toContain('ig');
    expect(container.textContent).toContain('fb');
  });
});
