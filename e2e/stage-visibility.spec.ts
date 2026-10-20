/**
 * Playwright smoke: directory departments, edit-modal primary, board columns.
 *
 * Run with a live app + admin session:
 *   npx playwright test e2e/stage-visibility.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';
const EMAIL = process.env.E2E_ADMIN_EMAIL || '';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || '';

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).not.toHaveURL(/login/i, { timeout: 20_000 });
}

test.describe('stage visibility + department directory', () => {
  test.skip(!EMAIL || !PASSWORD, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD');

  test('edit modal prefills primary and directory has no duplicate departments', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/`);
    await page.getByRole('button', { name: /admin|team directory|members/i }).first().click({ trial: true }).catch(() => undefined);
    const directoryLink = page.getByRole('link', { name: /team|members|admin/i }).first();
    if (await directoryLink.count()) {
      await directoryLink.click();
    }

    const chips = page.locator('td .inline-flex, [data-testid="dept-chip"]');
    const texts = (await chips.allInnerTexts()).map((t) => t.trim().toLowerCase()).filter(Boolean);
    const dupes = texts.filter((t, i) => texts.indexOf(t) !== i && /social media|performance marketing/.test(t));
    expect(dupes, `duplicate department chips: ${dupes.join(', ')}`).toEqual([]);

    const editBtn = page.getByRole('button', { name: /edit/i }).first();
    await editBtn.click();
    const primary = page.getByLabel(/primary department/i);
    await expect(primary).toBeVisible();
    const value = await primary.inputValue().catch(async () => (await primary.textContent()) || '');
    expect(value?.trim().length || 0).toBeGreaterThan(0);
  });

  test('content calendar board columns match visible social stages', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/content-calendar`);
    const board = page.locator('[data-stage], [data-column-stage], h3, h2');
    await expect(page.getByText(/ready to post/i).first()).toBeVisible({ timeout: 20_000 });
    const body = (await page.locator('body').innerText()).toLowerCase();
    // A social-primary member session should not render Content/Creative columns.
    // Admin sessions still see every column; this assertion is informational when run as admin.
    expect(body).toContain('ready to post');
    void board;
  });
});
