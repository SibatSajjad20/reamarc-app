import { describe, expect, it } from 'vitest';
import { buildWorkspacePayload, type ClientFormValues } from '../useClientForm';
import type { Workspace } from '../../types';

const baseValues: ClientFormValues = {
  name: 'SP Builders',
  initials: 'SP',
  brandColor: '#4f46e5',
  status: 'active',
  projectCycle: 'Retainer',
  priority: 'Medium',
  health: 'Good',
  contractStartDate: '2026-01-01',
  contractEndDate: '2026-12-31',
  selectedServices: ['Content Creation'],
  proposalUrl: '',
  proposalName: '',
  pocName: 'Secret POC',
  pocEmail: 'poc@secret.test',
  pocPhone: '',
  billingName: 'Secret Billing',
  billingEmail: 'billing@secret.test',
  billingPhone: '',
  expectStatic: '8',
  expectStaticMax: '10',
  expectReels: '4',
  expectCarousel: '',
  expectCarouselLayout: '',
  expectAnimated: '',
  expectAnimatedPauseThisMonth: false,
  expectAnimatedSkipMonths: [],
  expectCover: '',
};

describe('useClientForm expectations preservation (data-loss bug fix)', () => {
  it('preserves unmanaged creative types (e.g. Video, UGC) when saving client form', () => {
    const originalWorkspace: Workspace = {
      id: 'ws_sp',
      name: 'SP Builders',
      initials: 'SP',
      status: 'active',
      brandColor: '#4f46e5',
      content_expectations: {
        period: 'month',
        lines: [
          { creative_type: 'Static', expected: 2 }, // managed type in original
          { creative_type: 'Video', expected: 4 },   // unmanaged type
          { creative_type: 'UGC', expected: 2 },     // unmanaged type
        ],
      },
    };

    const payload = buildWorkspacePayload(baseValues, originalWorkspace);

    expect(payload.content_expectations).not.toBeNull();
    const lines = payload.content_expectations!.lines;

    // Managed static should be updated to form value (8, max 10)
    const staticLine = lines.find((l) => l.creative_type.toLowerCase() === 'static');
    expect(staticLine).toBeDefined();
    expect(staticLine?.expected).toBe(8);
    expect(staticLine?.expected_max).toBe(10);

    // Managed reels should be from form (4)
    const reelsLine = lines.find((l) => l.creative_type.toLowerCase() === 'reel');
    expect(reelsLine).toBeDefined();
    expect(reelsLine?.expected).toBe(4);

    // Unmanaged Video and UGC MUST be preserved!
    const videoLine = lines.find((l) => l.creative_type.toLowerCase() === 'video');
    expect(videoLine).toBeDefined();
    expect(videoLine?.expected).toBe(4);

    const ugcLine = lines.find((l) => l.creative_type.toLowerCase() === 'ugc');
    expect(ugcLine).toBeDefined();
    expect(ugcLine?.expected).toBe(2);
  });

  it('clamps bounds and sanitizes preserved lines', () => {
    const originalWorkspace: Workspace = {
      id: 'ws_sp',
      name: 'SP Builders',
      initials: 'SP',
      status: 'active',
      brandColor: '#4f46e5',
      content_expectations: {
        period: 'month',
        lines: [
          {
            creative_type: 'Custom Type',
            expected: 9999,
            expected_max: -50,
            skip_months: ['2026-11', 'bad-month', '2026-12'],
          },
        ],
      },
    };

    const payload = buildWorkspacePayload(baseValues, originalWorkspace);
    const customLine = payload.content_expectations!.lines.find((l) => l.creative_type === 'Custom Type');
    expect(customLine).toBeDefined();
    expect(customLine?.expected).toBe(500); // clamped to 500
    expect(customLine?.expected_max).toBe(0); // clamped to 0
    expect(customLine?.skip_months).toEqual(['2026-11', '2026-12']); // bad-month stripped
  });

  it('returns null content_expectations when neither form nor original has lines', () => {
    const emptyValues: ClientFormValues = {
      ...baseValues,
      expectStatic: '',
      expectStaticMax: '',
      expectReels: '',
    };
    const payload = buildWorkspacePayload(emptyValues, null);
    expect(payload.content_expectations).toBeNull();
  });
});
