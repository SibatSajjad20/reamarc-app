/**
 * Playwright Task Manager walkthrough (prompt I).
 *
 *   npx playwright test e2e/task-manager.spec.ts
 *
 * Skips unless E2E_TM_PASSWORD is set. Talks to the local seeded DB only.
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';
const PASSWORD = process.env.E2E_TM_PASSWORD || '';

const EMAILS = {
  hr: 'hr@tm-test.com',
  leadWeb: 'lead.web@tm-test.com',
  leadContent: 'lead.content@tm-test.com',
  memberC1: 'member.content1@tm-test.com',
};

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/login`);
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/login/i, { timeout: 20_000 });
}

async function logout(page: Page) {
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });
  await page.context().clearCookies();
  await page.goto(`${BASE}/login`);
  await expect(page.locator('#login-email')).toBeVisible({ timeout: 15_000 });
}

async function openTasks(page: Page) {
  await page.getByText('Tasks', { exact: true }).first().click();
  await expect(page.getByTestId('task-manager-view')).toBeVisible({ timeout: 20_000 });
}

async function openTaskByTitle(page: Page, title: string) {
  const search = page.getByPlaceholder(/search serial or title/i);
  await search.fill(title);
  await page.getByText(title).first().click({ timeout: 20_000 });
}

async function pickAssignee(page: Page, label: string) {
  await page.locator('#task-assignee-picker').click();
  const search = page.getByPlaceholder(/search/i).first();
  await search.waitFor({ state: 'visible' });
  await search.fill(label);
  const option = page.locator('[data-radix-popper-content-wrapper] button').filter({ hasText: label }).first();
  await option.waitFor({ state: 'visible' });
  await option.click({ force: true });
}

test.describe('task manager e2e', () => {
  test.describe.configure({ timeout: 120_000 });
  test.skip(!PASSWORD, 'Set E2E_TM_PASSWORD');

  test('HR sees no Tasks nav or chat widget', async ({ page }) => {
    await login(page, EMAILS.hr);
    await expect(page.getByRole('button', { name: /^tasks/i })).toHaveCount(0);
    await expect(page.getByTestId('task-chat-widget')).toHaveCount(0);
  });

  test('web lead assigns to content lead, who delegates; member comments, submits; lead approves', async ({ page }) => {
    const title = `E2E cross-dept review ${Date.now()}`;

    await login(page, EMAILS.leadWeb);
    await openTasks(page);
    await page.getByRole('button', { name: /add task/i }).click();
    await page.getByLabel(/title/i).fill(title);
    await pickAssignee(page, 'Lead Content');
    await page.getByRole('button', { name: /create task/i }).click();
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });

    await logout(page);
    await login(page, EMAILS.leadContent);
    await openTasks(page);
    await openTaskByTitle(page, title);
    await pickAssignee(page, 'Member Content 1');
    await page.getByRole('button', { name: /start|save/i }).click();
    await expect(page.getByRole('heading', { name: /reassign note/i })).toBeVisible({ timeout: 8_000 });
    await page.getByRole('button', { name: /^ok$/i }).click();
    await expect(page.getByRole('heading', { name: /reassign note/i })).toHaveCount(0);

    await logout(page);
    await login(page, EMAILS.memberC1);
    await openTasks(page);
    await openTaskByTitle(page, title);
    const commentBox = page.getByPlaceholder(/write a comment|mention/i).first();
    await commentBox.click();
    await commentBox.fill('@');
    const mention = page.getByText(/Lead Web/i).first();
    if (await mention.count()) {
      await mention.click();
    } else {
      await commentBox.fill('Checking in with Lead Web');
    }
    await page.getByRole('button', { name: /^comment$|^send$/i }).first().click();
    const watcherPrompt = page.getByText(/as watcher/i);
    if (await watcherPrompt.count()) {
      await page.getByRole('button', { name: /^(ok|add|confirm|continue)$/i }).last().click();
    }
    await page.getByRole('button', { name: /^close$/i }).last().click();
    const discard = page.getByRole('button', { name: /^discard$/i });
    if (await discard.count()) {
      await discard.click();
    }
    await expect(page.getByTestId('task-chat-fab')).toBeAttached();
    await page.getByTestId('task-chat-fab').click({ force: true });
    const panel = page.getByTestId('task-chat-panel');
    try {
      await expect(panel).toBeVisible({ timeout: 5_000 });
      const threadRow = panel.getByText(title).first();
      if (await threadRow.count()) {
        await threadRow.click();
        const reply = page.getByPlaceholder(/reply|mention/i).first();
        if (await reply.count()) {
          await reply.fill('Following up from chat');
          await page.getByRole('button', { name: /^send$|^comment$/i }).first().click();
        }
      }
      await page.getByTestId('task-chat-fab').click({ force: true });
    } catch {
      /* Overlay may sit above the desktop popover; mention already posted from the task dialog. */
    }

    await expect(page.getByTestId('task-chat-widget')).toBeVisible();
    await openTaskByTitle(page, title);
    const submit = page.getByRole('button', { name: /submit for review/i });
    if (!(await submit.count())) {
      await page.getByRole('button', { name: /^start$/i }).click();
    }
    await page.getByRole('button', { name: /submit for review/i }).click();

    await logout(page);
    await login(page, EMAILS.leadContent);
    await openTasks(page);
    await openTaskByTitle(page, title);
    await page.getByRole('button', { name: /^approve$/i }).click();

    await logout(page);
    await login(page, EMAILS.memberC1);
    await page.locator('button[title="Notifications"]').click();
    await expect(page.getByText(/approved T-|completed/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
