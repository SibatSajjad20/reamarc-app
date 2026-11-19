import { describe, it } from 'vitest';
import type { ContentCalendarItem } from '../types/contentCalendar';
import type { ContentExpectations } from '../types';
import {
  calculateClientExpectationSummary,
  calculateExpectationSummaries,
} from './contentCalendarExpectations';

describe('contentCalendarExpectations', () => {
  it('counts posted vs in-progress against monthly quotas', () => {
    function assert(cond: unknown, msg: string) {
      if (!cond) throw new Error(msg);
    }

    const refDate = new Date(2026, 10, 18); // 18 Nov 2026 local

    const asshExpectations: ContentExpectations = {
      period: 'month',
      lines: [
        { creative_type: 'Static', expected: 5 },
        { creative_type: 'Story', expected: null, included: true },
        { creative_type: 'Carousel', expected: 1, layout: '3x3' },
        { creative_type: 'Animated Post', expected: 2 },
        { creative_type: 'Cover Image', expected: 1 },
      ],
    };

    const base = {
      campaign_type: 'SMM',
      content_type: 'Scheduled' as const,
      creative_category: 'Organic Creative' as const,
      content_pillar: 'Brand',
      content_concept: 'Concept',
      offer: 'None',
      cta: 'Learn More',
      approval_status: 'Posted',
      setup_status: 'Live',
      channels: ['Instagram'],
      created_at: '2026-11-01T10:00:00Z',
      updated_at: '2026-11-02T10:00:00Z',
    };

    function item(
      partial: Partial<ContentCalendarItem> & Pick<ContentCalendarItem, 'id' | 'serial' | 'creative_type' | 'stage'>
    ): ContentCalendarItem {
      return {
        client_name: 'ASSH Developers Pvt. Ltd/Sardar Mall',
        publish_date: '2026-11-10',
        ...base,
        ...partial,
      };
    }

    const existing: ContentCalendarItem[] = [
      item({ id: '1', serial: 'CC-001', creative_type: 'Static', stage: 'Posted' }),
      item({ id: '2', serial: 'CC-002', creative_type: 'Static', stage: 'Posted' }),
      item({ id: '3', serial: 'CC-003', creative_type: 'Static', stage: 'Content' }),
      item({ id: '4', serial: 'CC-004', creative_type: 'Carousel', stage: 'Posted' }),
      item({ id: '5', serial: 'CC-005', creative_type: 'Story', stage: 'Posted' }),
      item({ id: '6', serial: 'CC-006', creative_type: 'Animated Post', stage: 'Posted' }),
      item({
        id: '7',
        serial: 'CC-007',
        creative_type: 'Cover Image',
        stage: 'Posted',
        publish_date: '2026-10-20',
      }),
      item({
        id: '8',
        serial: 'CC-008',
        creative_type: 'Static',
        stage: 'Posted',
        client_name: 'SP BUILDERS',
      }),
      item({ id: '9', serial: 'CC-009', creative_type: 'Static', stage: 'Ready to Post' }),
    ];

    const assh = {
      id: 'ws-assh',
      name: 'ASSH Developers Pvt. Ltd/Sardar Mall',
      content_expectations: asshExpectations,
    };

    const summary = calculateClientExpectationSummary(existing, assh, refDate);
    assert(summary, 'ASSH should have a summary');
    const staticLine = summary!.lines.find((l) => l.creative_type === 'Static')!;
    assert(staticLine.posted === 2, `Static posted should be 2, got ${staticLine.posted}`);
    assert(staticLine.leftover === 3, `Static leftover should be 3, got ${staticLine.leftover}`);
    assert(staticLine.delivered === 2, 'Static delivered should cap at posted');

    const carousel = summary!.lines.find((l) => l.creative_type === 'Carousel')!;
    assert(carousel.posted === 1, 'Carousel 3x3 counts as 1 posted');
    assert(carousel.leftover === 0, 'Carousel leftover should be 0');
    assert(carousel.layout === '3x3', 'Carousel layout is a hint only');

    const story = summary!.lines.find((l) => l.creative_type === 'Story');
    assert(story === undefined, 'Story must be excluded from client expectation summaries');

    const storyOnly = calculateClientExpectationSummary(
      existing,
      {
        id: 'ws-story-only',
        name: 'Story Only Client',
        content_expectations: {
          period: 'month',
          lines: [{ creative_type: 'Story', expected: null, included: true }],
        },
      },
      refDate
    );
    assert(storyOnly == null, 'Clients with only a legacy Story expectation line are omitted');

    const animated = summary!.lines.find((l) => l.creative_type === 'Animated Post')!;
    assert(animated.posted === 1, 'One animated posted this month');
    assert(animated.leftover === 1, 'One animated left');

    const cover = summary!.lines.find((l) => l.creative_type === 'Cover Image')!;
    assert(cover.posted === 0, 'Prior-month cover must not count');
    assert(cover.leftover === 1, 'Cover leftover is 1');

    assert(summary!.expectedTotal === 5 + 1 + 2 + 1, 'Overall expected excludes stories');
    assert(summary!.deliveredTotal === 2 + 1 + 1 + 0, 'Overall delivered is capped per type');
    assert(summary!.leftoverTotal === 3 + 0 + 1 + 1, 'Overall leftover excludes stories');

    const overDeliveredItems: ContentCalendarItem[] = [
      ...existing,
      item({ id: '10', serial: 'CC-010', creative_type: 'Carousel', stage: 'Posted' }),
    ];
    const over = calculateClientExpectationSummary(overDeliveredItems, assh, refDate)!;
    const overCarousel = over.lines.find((l) => l.creative_type === 'Carousel')!;
    assert(overCarousel.leftover === 0, 'Over-delivery must not create negative leftover');
    assert(overCarousel.extra === 1, 'Over-delivery shows as extra');
    assert(overCarousel.delivered === 1, 'Delivered caps at expected');

    const none = calculateClientExpectationSummary(
      existing,
      { id: 'ws-other', name: 'Other Client' },
      refDate
    );
    assert(none == null, 'Clients without expectations are omitted');

    const sp = calculateExpectationSummaries(
      existing,
      [
        assh,
        {
          id: 'ws-sp',
          name: 'SP BUILDERS',
          content_expectations: {
            period: 'month',
            lines: [{ creative_type: 'Static', expected: 10 }],
          },
        },
      ],
      refDate
    );
    assert(sp.length === 2, 'Both clients with quotas appear');
    const spRow = sp.find((s) => s.clientName === 'SP BUILDERS')!;
    assert(spRow.lines[0].posted === 1, 'SP static posted is 1');
    assert(spRow.leftoverTotal === 9, 'SP leftover is 9');
  });

  it('supports static ranges, reels, and a one-month animated pause', () => {
    function assert(cond: unknown, msg: string) {
      if (!cond) throw new Error(msg);
    }

    const nov = new Date(2026, 10, 18);
    const dec = new Date(2026, 11, 5);
    const exp: ContentExpectations = {
      period: 'month',
      lines: [
        { creative_type: 'Static', expected: 5, expected_max: 10 },
        { creative_type: 'Reel', expected: 8 },
        { creative_type: 'Carousel', expected: 3 },
        { creative_type: 'Animated Post', expected: 4, skip_months: ['2026-11'] },
      ],
    };
    const client = { id: 'ws-assh', name: 'ASSH Developers Pvt. Ltd/Sardar Mall', content_expectations: exp };
    const items = [
      {
        id: '1',
        serial: 'CC-001',
        client_name: client.name,
        campaign_type: 'SMM',
        creative_type: 'Static Image',
        content_type: 'Scheduled' as const,
        creative_category: 'Organic Creative' as const,
        content_pillar: 'Brand',
        content_concept: 'Concept',
        offer: 'None',
        cta: 'Learn More',
        approval_status: 'Posted',
        setup_status: 'Live',
        stage: 'Posted' as const,
        publish_date: '2026-11-08',
        created_at: '2026-11-01T10:00:00Z',
        updated_at: '2026-11-02T10:00:00Z',
      },
      {
        id: '2',
        serial: 'CC-002',
        client_name: client.name,
        campaign_type: 'SMM',
        creative_type: 'Reel',
        content_type: 'Scheduled' as const,
        creative_category: 'Organic Creative' as const,
        content_pillar: 'Brand',
        content_concept: 'Concept',
        offer: 'None',
        cta: 'Learn More',
        approval_status: 'Posted',
        setup_status: 'Live',
        stage: 'Posted' as const,
        publish_date: '2026-11-09',
        created_at: '2026-11-01T10:00:00Z',
        updated_at: '2026-11-02T10:00:00Z',
      },
      {
        id: '3',
        serial: 'CC-003',
        client_name: client.name,
        campaign_type: 'SMM',
        creative_type: 'Animated Post',
        content_type: 'Scheduled' as const,
        creative_category: 'Organic Creative' as const,
        content_pillar: 'Brand',
        content_concept: 'Concept',
        offer: 'None',
        cta: 'Learn More',
        approval_status: 'Posted',
        setup_status: 'Live',
        stage: 'Posted' as const,
        publish_date: '2026-11-10',
        created_at: '2026-11-01T10:00:00Z',
        updated_at: '2026-11-02T10:00:00Z',
      },
    ];

    const november = calculateClientExpectationSummary(items as any, client, nov)!;
    const staticNov = november.lines.find((l) => l.creative_type === 'Static')!;
    assert(staticNov.posted === 1, 'Static image aliases to Static');
    assert(staticNov.leftover === 4, 'Range leftover uses the 5 minimum');
    assert(staticNov.extra === 0, 'Within-or-below range has no extra');
    const reels = november.lines.find((l) => l.creative_type === 'Reel')!;
    assert(reels.posted === 1 && reels.leftover === 7, 'Reels 8 with 1 posted leaves 7');
    const animatedNov = november.lines.find((l) => l.creative_type === 'Animated Post')!;
    assert(animatedNov.paused === true, 'Animated is paused in November');
    assert(animatedNov.leftover === 0, 'Paused animated does not create leftover');
    assert(november.expectedTotal === 5 + 8 + 3, 'Paused animated is excluded from November totals');

    const december = calculateClientExpectationSummary(items as any, client, dec)!;
    const animatedDec = december.lines.find((l) => l.creative_type === 'Animated Post')!;
    assert(animatedDec.paused === false, 'Animated resumes in December');
    assert(animatedDec.expected === 4, 'December still expects 4 animated');
    assert(animatedDec.leftover === 4, 'December leftover is full quota because Nov posts are out of month');
  });

  it('counts messy creative_type labels against canonical quotas', () => {
    function assert(cond: unknown, msg: string) {
      if (!cond) throw new Error(msg);
    }
    const refDate = new Date(2026, 10, 18);
    const client = {
      id: 'ws-assh',
      name: 'ASSH Developers Pvt. Ltd/Sardar Mall',
      content_expectations: {
        period: 'month' as const,
        lines: [
          { creative_type: 'Static', expected: 5 },
          { creative_type: 'Animated Post', expected: 4 },
        ],
      },
    };
    const mk = (id: string, creative_type: string) => ({
      id,
      serial: id,
      client_name: client.name,
      campaign_type: 'SMM',
      creative_type,
      content_type: 'Scheduled' as const,
      creative_category: 'Organic Creative' as const,
      content_pillar: 'Brand',
      content_concept: 'Concept',
      offer: 'None',
      cta: 'Learn More',
      approval_status: 'Posted',
      setup_status: 'Live',
      stage: 'Posted' as const,
      publish_date: '2026-11-10',
      created_at: '2026-11-01T10:00:00Z',
      updated_at: '2026-11-02T10:00:00Z',
    });
    const summary = calculateClientExpectationSummary(
      [
        mk('1', 'Friday Static'),
        mk('2', 'Animated posts'),
        mk('3', 'aimated post'),
        mk('4', 'Animated'),
      ] as any,
      client,
      refDate
    )!;
    const staticLine = summary.lines.find((l) => l.creative_type === 'Static')!;
    const animated = summary.lines.find((l) => l.creative_type === 'Animated Post')!;
    assert(staticLine.posted === 1, 'Friday Static counts as Static');
    assert(animated.posted === 3, 'Animated / Animated posts / aimated post all count as Animated Post');
  });
});
