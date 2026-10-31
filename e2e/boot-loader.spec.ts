import { expect, test } from '@playwright/test';

test('cold boot has one continuous loader episode and no fullscreen swap', async ({ page }) => {
  // Catch-all is registered first; the specific fixtures below take precedence.
  // Nothing in this test can reach Render or any other external service.
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"blocked by test"}' })
  );
  const user = {
    id: 'boot-user',
    email: 'boot@example.test',
    full_name: 'Boot User',
    name: 'Boot User',
    role: 'team_member',
    company_id: 'company-a',
    company: { id: 'company-a', name: 'Company A', display_name: 'Company A' },
    companies: [],
    effective_access: { attendance: false, daily_log: false },
    access: {},
    departments: [],
    is_active: true,
  };
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
  );
  await page.route('**/api/v1/dashboard/bootstrap', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        summary: { meta: { generatedAt: new Date().toISOString(), role: 'team_member' } },
        todayAttendance: null,
        timesheet: null,
        matrix: null,
        dayTarget: null,
        weeklyLogs: [],
        meta: {
          generatedAt: new Date().toISOString(),
          companyId: 'company-a',
          weekStart: '2026-10-26',
          today: '2026-10-31',
        },
      }),
    });
  });
  await page.route('**/api/v1/company-calendar/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"events":[],"holidays":[],"working_saturdays":[]}' })
  );
  await page.route('**/api/v1/attendance/my-working-overrides', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  await page.addInitScript(() => {
    const frames: Array<{ splash: boolean; fullscreen: boolean }> = [];
    (window as any).__loaderFrames = frames;
    const sample = () => {
      frames.push({
        splash: Boolean(document.querySelector('#boot-splash')),
        fullscreen: Boolean(document.querySelector('[data-testid="fullscreen-loader"]')),
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  await page.goto('/dashboard');
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const result = await page.evaluate(() => {
    const frames = (window as any).__loaderFrames as Array<{ splash: boolean; fullscreen: boolean }>;
    let episodes = 0;
    let active = false;
    for (const frame of frames) {
      const next = frame.splash || frame.fullscreen;
      if (next && !active) episodes += 1;
      active = next;
    }
    return {
      episodes,
      fullscreenFrames: frames.filter((frame) => frame.fullscreen).length,
      sampledFrames: frames.length,
    };
  });
  expect(result.sampledFrames).toBeGreaterThan(2);
  expect(result.episodes).toBe(1);
  expect(result.fullscreenFrames).toBe(0);
});
