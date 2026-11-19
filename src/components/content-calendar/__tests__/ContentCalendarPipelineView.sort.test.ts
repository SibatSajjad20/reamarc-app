import { describe, expect, it } from 'vitest';
import type { ContentCalendarItem } from '../../../types/contentCalendar';
import { comparePipelineStageItems } from '../ContentCalendarPipelineView';

function makeItem(
  overrides: Partial<ContentCalendarItem> & Pick<ContentCalendarItem, 'id' | 'serial' | 'stage'>,
): ContentCalendarItem {
  return {
    client_name: 'Client A',
    campaign_type: 'SMM',
    creative_type: 'Static',
    content_type: 'Scheduled',
    creative_category: 'Organic Creative',
    content_pillar: 'Brand',
    content_concept: 'Concept',
    offer: 'None',
    cta: 'Learn More',
    approval_status: 'Draft',
    setup_status: 'Draft',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    ...overrides,
  };
}

describe('comparePipelineStageItems', () => {
  it('sorts Posted cards newest publish_date first with undated items at the bottom', () => {
    const items = [
      makeItem({ id: '1', serial: 'CC-001', stage: 'Posted', publish_date: '2026-10-12' }),
      makeItem({ id: '2', serial: 'CC-002', stage: 'Posted', publish_date: null, updated_at: '2026-11-18T10:00:00Z' }),
      makeItem({ id: '3', serial: 'CC-003', stage: 'Posted', publish_date: '2026-11-18', updated_at: '2026-11-18T08:00:00Z' }),
      makeItem({ id: '4', serial: 'CC-004', stage: 'Posted', publish_date: '2026-11-18', updated_at: '2026-11-18T12:00:00Z' }),
      makeItem({ id: '5', serial: 'CC-005', stage: 'Posted', publish_date: '2026-11-05' }),
    ];

    const sorted = [...items].sort((a, b) => comparePipelineStageItems(a, b, 'Posted'));
    expect(sorted.map((i) => i.serial)).toEqual(['CC-004', 'CC-003', 'CC-005', 'CC-001', 'CC-002']);
  });

  it('sorts Ready to Post cards by earliest publish_date first with undated at the bottom', () => {
    const items = [
      makeItem({ id: '1', serial: 'CC-001', stage: 'Ready to Post', publish_date: '2026-11-25' }),
      makeItem({ id: '2', serial: 'CC-002', stage: 'Ready to Post', publish_date: null }),
      makeItem({ id: '3', serial: 'CC-003', stage: 'Ready to Post', publish_date: '2026-11-19' }),
    ];

    const sorted = [...items].sort((a, b) => comparePipelineStageItems(a, b, 'Ready to Post'));
    expect(sorted.map((i) => i.serial)).toEqual(['CC-003', 'CC-001', 'CC-002']);
  });

  it('sorts active production stages by earliest design_due first with undated at the bottom', () => {
    const items = [
      makeItem({ id: '1', serial: 'CC-001', stage: 'Creative Production', design_due: '2026-11-22', publish_date: '2026-11-24' }),
      makeItem({ id: '2', serial: 'CC-002', stage: 'Creative Production', design_due: null, publish_date: '2026-11-20' }),
      makeItem({ id: '3', serial: 'CC-003', stage: 'Creative Production', design_due: '2026-11-17', publish_date: '2026-11-28' }),
    ];

    const sorted = [...items].sort((a, b) => comparePipelineStageItems(a, b, 'Creative Production'));
    expect(sorted.map((i) => i.serial)).toEqual(['CC-003', 'CC-001', 'CC-002']);
  });
});
