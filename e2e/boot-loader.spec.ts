import { expect, test, type Page } from '@playwright/test';

const teamMember = {
  id: 'boot-user',
  email: 'boot@example.test',
  full_name: 'Boot User',
  name: 'Boot User',
  role: 'team_member',
  company_id: 'company-a',
  company: { id: 'company-a', name: 'Company A', display_name: 'Company A' },
  companies: [],
  effective_access: { attendance: true, daily_log: true, sales: true },
    access: {},
    departments: [],
    is_active: true,
    permissions: {
      attendance: 'own',
      daily_log: 'own',
      sales: 'own',
      tracked: { attendance: true, daily_log: true },
      modules: { attendance: true, daily_log: true, sales: true, content_calendar: true, website: true },
    },
  };

const adminUser = {
  ...teamMember,
  id: 'admin-user',
  role: 'admin',
  effective_access: {
    attendance: true,
    daily_log: true,
    sales: true,
    content_calendar: true,
    website: true,
    ads: true,
  },
};

const dashboardPayload = {
  summary: null,
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
};

async function blockOutbound(page: Page) {
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"blocked by test"}' }),
  );
}

async function mockAuth(page: Page, user: typeof teamMember) {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }),
  );
}

test.describe.configure({ mode: 'serial' });

test('delayed bootstrap: splash gone within 1.5s of auth, skeletons, no second loader', async ({ page }) => {
  await blockOutbound(page);
  let authResolvedAt = 0;
  await page.route('**/api/v1/auth/me', async (route) => {
    authResolvedAt = Date.now();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(teamMember) });
  });
  await page.route('**/api/v1/dashboard/bootstrap', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(dashboardPayload),
    });
  });
  await page.route('**/api/v1/dashboard/summary', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ meta: { generatedAt: new Date().toISOString(), role: 'team_member' } }),
    });
  });

  await page.addInitScript(() => {
    (window as unknown as { __splashHiddenAt?: number }).__splashHiddenAt = 0;
    const sample = () => {
      const el = document.getElementById('boot-splash');
      const hidden = !el || el.classList.contains('boot-splash-hide');
      const store = window as unknown as { __splashHiddenAt?: number };
      if (hidden && !store.__splashHiddenAt) store.__splashHiddenAt = Date.now();
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  await page.goto('/dashboard');
  await expect.poll(() => authResolvedAt, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __splashHiddenAt?: number }).__splashHiddenAt || 0)).toBeGreaterThan(0);
  const splashGoneAt = await page.evaluate(() => (window as unknown as { __splashHiddenAt?: number }).__splashHiddenAt || 0);
  expect(splashGoneAt - authResolvedAt).toBeLessThanOrEqual(1500);
  await expect(page.locator('#boot-splash')).toBeHidden();
  await expect(page.getByTestId('fullscreen-loader')).toHaveCount(0);
  await expect(page.getByTestId('logged-this-week')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('logged-this-week')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.skeleton').first()).toBeVisible();
  await expect(page.getByTestId('fullscreen-loader')).toHaveCount(0);
});

test('bootstrap 404 still renders the shell via fallback', async ({ page }) => {
  await blockOutbound(page);
  await mockAuth(page, teamMember);
  await page.route('**/api/v1/dashboard/bootstrap', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"not found"}' }),
  );
  await page.route('**/api/v1/attendance/today', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ record: null, shift: null, can_check_in: false }),
    }),
  );
  await page.route('**/api/v1/attendance/my-timesheet**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user_id: 'boot-user', records: [], summary: null }),
    }),
  );

  await page.goto('/dashboard');
  await expect(page.locator('#boot-splash')).toBeHidden({ timeout: 1500 });
  await expect(page.getByLabel('Application sidebar')).toBeVisible();
  await expect(page.getByText('Boot User').first()).toBeVisible({ timeout: 10_000 });
});

test('module navigation never blanks the document or sidebar', async ({ page }) => {
  await blockOutbound(page);
  await mockAuth(page, adminUser);
  await page.route('**/api/v1/dashboard/bootstrap', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dashboardPayload) }),
  );
  await page.route('**/api/v1/attendance/bootstrap', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kind: 'management',
        matrix: null,
        timesheet: null,
        config: {
          go_live_date: '2026-08-19',
          test_start_date: '2026-08-01',
          effective_start_date: '2026-08-19',
          timezone: 'Asia/Karachi',
          go_live_reached: true,
        },
        meta: { company_id: 'company-a', date: '2026-10-31' },
      }),
    }),
  );

  await page.goto('/dashboard');
  await expect(page.getByLabel('Application sidebar')).toBeVisible();

  const mainNav = page.getByRole('navigation', { name: 'Main' });
  const modules = ['Attendance', 'Sales pipeline', 'Daily log', 'Accounts', 'Content calendar', 'Website pipeline'];
  for (const label of modules) {
    const target = mainNav.getByText(label, { exact: true }).first();
    if (!(await target.count())) continue;
    await target.click({ force: true });
    const frames = await page.evaluate(async () => {
      const samples: Array<{ sidebarVisible: boolean; blankDocument: boolean }> = [];
      const started = performance.now();
      while (performance.now() - started < 500) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const sidebar = document.querySelector('[aria-label="Application sidebar"]');
        const rect = sidebar?.getBoundingClientRect();
        const root = document.getElementById('root');
        samples.push({
          sidebarVisible: Boolean(sidebar && rect && rect.width > 0 && rect.height > 0),
          blankDocument: !root || root.childElementCount === 0,
        });
      }
      return samples;
    });
    for (const sample of frames) {
      expect(sample.sidebarVisible, `sidebar vanished while opening ${label}`).toBe(true);
      expect(sample.blankDocument, `blank document while opening ${label}`).toBe(false);
    }
  }

  await page.getByRole('button', { name: 'Settings' }).first().click({ force: true });
  const settingsFrames = await page.evaluate(async () => {
    const samples: Array<{ sidebarVisible: boolean; blankDocument: boolean }> = [];
    const started = performance.now();
    while (performance.now() - started < 500) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const sidebar = document.querySelector('[aria-label="Application sidebar"]');
      const rect = sidebar?.getBoundingClientRect();
      const root = document.getElementById('root');
      samples.push({
        sidebarVisible: Boolean(sidebar && rect && rect.width > 0 && rect.height > 0),
        blankDocument: !root || root.childElementCount === 0,
      });
    }
    return samples;
  });
  for (const sample of settingsFrames) {
    expect(sample.sidebarVisible).toBe(true);
    expect(sample.blankDocument).toBe(false);
  }
});
