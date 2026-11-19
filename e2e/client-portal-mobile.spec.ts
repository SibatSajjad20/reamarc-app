import { devices, expect, test, type Page } from '@playwright/test';

// Client portal on phones: no sideways scroll, 16px fields (no iOS focus zoom), 44px tap targets,
// and a review dialog whose actions stay on screen.

const client = {
  id: 'client-user',
  email: 'client@example.test',
  name: 'Apex Transfers LLC',
  full_name: 'Apex Transfers LLC',
  role: 'client',
  company_id: 'company-a',
  company: { id: 'company-a', name: 'Company A', display_name: 'Company A' },
  companies: [],
  departments: [],
  workspace_ids: ['ws_apex'],
  is_active: true,
  effective_access: {},
  access: {},
  permissions: { modules: {}, levels: {}, tracked: { attendance: false, daily_log: false }, role: 'client' },
};

const stages = ['Creative Client Review', 'Creative Client Review', 'Content Client Review', 'Ready to Post', 'Creative Revision'];
const items = stages.map((stage, i) => ({
  id: `cc_${i}`,
  serial: `APX-${100 + i}`,
  client_name: 'Apex Transfers LLC',
  workspace_id: 'ws_apex',
  campaign_type: 'Organic',
  creative_type: 'Static',
  content_pillar: 'Promotion',
  content_concept: `Winter airport transfer promo #${i + 1} with a longer concept title that wraps on phones`,
  headlines_hooks: 'Never miss a flight again',
  primary_text: 'Book your airport transfer today. Comfortable rides, fixed prices, and 24/7 support.',
  offer: 'Sample Pack',
  cta: 'Request Your Sample Pack',
  stage,
  publish_date: `2026-11-${String(19 + i).padStart(2, '0')}`,
  channels: ['instagram', 'facebook'],
  revision_note: stage === 'Creative Revision' ? 'Make the logo bigger' : null,
  attachments: [
    { id: `a${i}`, url: `/uploads/content_calendar/cc_${i}/asset_0.jpg`, filename: `creative_${i}.jpg`, kind: 'image', content_type: 'image/jpeg', size: 2_800_000 },
  ],
  created_at: '2026-11-19T12:00:00+00:00',
  updated_at: '2026-11-19T12:00:00+00:00',
}));

// 1x1 PNG
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

async function mockPortal(page: Page) {
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname.replace(/^\/api\/v1/, '');
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/auth/me') return json(client);
    if (p === '/workspaces') return json([{ id: 'ws_apex', name: 'Apex Transfers LLC', initials: 'AT', status: 'active' }]);
    if (p === '/content-calendar') return json({ items, total: items.length });
    if (p.startsWith('/mobile/notifications') || p.startsWith('/notifications')) return json([]);
    if (p.startsWith('/thumbs/') || p.startsWith('/uploads/')) return route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"blocked by test"}' });
  });
}

const phones = {
  'iPhone SE 375': devices['iPhone SE (3rd gen)'],
  'Galaxy S8 360': devices['Galaxy S8'],
  'iPhone 12 landscape': devices['iPhone 12 landscape'],
};

for (const [name, descriptor] of Object.entries(phones)) {
  // Keep the configured engine (Chromium in CI); only take viewport/touch/UA from the device.
  const { defaultBrowserType: _ignored, ...device } = descriptor;
  void _ignored;

  test.describe(`client portal on ${name}`, () => {
    test.use(device);

    test('no sideways scroll, 16px fields, 44px tap targets', async ({ page }) => {
      await mockPortal(page);
      await page.goto('/portal');
      await expect(page.locator('main article').first()).toBeVisible({ timeout: 20_000 });

      const metrics = await page.evaluate(() => {
        const vw = window.innerWidth;
        const visible = (el: Element) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        };
        const fields = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea, select')]
          .filter(visible)
          .map((el) => parseFloat(getComputedStyle(el).fontSize));
        const small = [...document.querySelectorAll('button, [role=tab]')]
          .filter(visible)
          .filter((el) => !el.closest('[data-tap-exempt]'))
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.height < 43.5 || r.width < 43.5)
          .map(({ el, r }) => `${(el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.tagName).trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`);
        return { overflowX: document.scrollingElement!.scrollWidth - vw, fields, small };
      });
      expect(metrics.overflowX).toBeLessThanOrEqual(0);
      expect(metrics.fields.length).toBeGreaterThan(0);
      for (const size of metrics.fields) expect(size).toBeGreaterThanOrEqual(16);
      expect(metrics.small).toEqual([]);
    });

    test('review dialog keeps Approve on screen; revision focuses the feedback box', async ({ page }) => {
      await mockPortal(page);
      await page.goto('/portal');
      await page.locator('main article').first().locator('div').first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // Opening the dialog must not focus the feedback box (that would raise the phone keyboard).
      await expect(dialog.locator('#dialog-revision-feedback')).not.toBeFocused();

      const approve = dialog.getByRole('button', { name: 'Approve creative' });
      await expect(approve).toBeInViewport({ ratio: 1 });

      await dialog.getByRole('button', { name: 'Request revision' }).click();
      await expect(dialog.locator('#dialog-revision-feedback')).toBeFocused();
      await expect(dialog.locator('#dialog-revision-feedback')).toBeInViewport();
      await expect(approve).toBeInViewport({ ratio: 1 });
    });
  });
}

test.describe('recently reviewed on a phone', () => {
  const { defaultBrowserType: _ignored, ...device } = devices['iPhone SE (3rd gen)'];
  void _ignored;
  test.use(device);

  test('shows a card list instead of the 5-column table', async ({ page }) => {
    await mockPortal(page);
    await page.goto('/portal');
    const list = page.getByTestId('recently-reviewed-list');
    await list.scrollIntoViewIfNeeded();
    await expect(list).toBeVisible();
    await expect(page.locator('main table')).toBeHidden();
    const overflowX = await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth);
    expect(overflowX).toBeLessThanOrEqual(0);
  });
});
