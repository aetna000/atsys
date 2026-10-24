import { test, expect } from '@playwright/test';
test('product navigation exposes operational tasks and settings at desktop and mobile sizes', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Work that stays looked after' })).toBeVisible();
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link')).toHaveCount(2);
  await expect(nav.getByRole('link', { name: 'Managed tasks' })).toBeVisible();
  await nav.getByRole('link', { name: 'Service & alerts' }).click();
  await expect(page.getByRole('heading', { name: 'Who watches the watchdog?' })).toBeVisible();
  await expect(page.getByLabel('Daily budget (USD)')).toHaveCount(0);
  await expect(page.getByLabel('Search managed tasks')).toHaveCount(0);
  for (const route of ['/fleet', '/costs', '/approvals', '/memory', '/atbot', '/overview']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: 'Work that stays looked after' })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `docs/screenshots/tasks-${info.project.name}.png`,
    fullPage: true,
  });
});
test('task search, theme and help controls work and persist', async ({ page }, info) => {
  await page.goto('/');
  await page.getByLabel('Search managed tasks').fill('no task can have this unusual name');
  await expect(page.getByRole('heading', { name: 'No matching tasks' })).toBeVisible();
  await page.getByLabel('Search managed tasks').fill('');
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Use light theme' })).toBeVisible();
  if (info.project.name === 'desktop')
    await page.screenshot({ path: 'docs/screenshots/tasks-dark.png', fullPage: true });
  await page.getByRole('button', { name: 'Use light theme' }).click();
  await page.getByRole('button', { name: 'Help & shortcuts', exact: true }).last().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close help' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('operational settings persist without sending a notification', async ({ page }, info) => {
  await page.goto('/settings');
  await expect(
    page.getByRole('heading', { name: 'Telegram notifications', exact: true }),
  ).toBeVisible();
  const chat = `-${info.project.name === 'desktop' ? '111222' : '333444'}`;
  await page.getByLabel('Chat ID', { exact: true }).fill(chat);
  await page.getByLabel('Delivery attempt limit').fill('4');
  await page.getByRole('button', { name: 'Save Telegram configuration' }).click();
  await expect(page.getByText('Telegram configuration saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Chat ID', { exact: true })).toHaveValue(chat);
  await expect(page.getByLabel('Delivery attempt limit')).toHaveValue('4');
  await expect(page.getByRole('button', { name: 'Send test notification' })).toBeDisabled();
  await expect(page.getByLabel('Daily budget (USD)')).toHaveCount(0);
});
test('task API failures are visible and retry restores actual state without sample API dependency', async ({
  page,
}) => {
  await page.route('**/api/state', (route) => route.abort('failed'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Work that stays looked after' })).toBeVisible();
  await page.route('**/api/operations', (route) => route.abort('failed'));
  await expect(page.getByText(/Connection lost. These records may be stale/)).toBeVisible({
    timeout: 8000,
  });
  await expect(page.getByText('Watchdog status unavailable', { exact: true })).toBeVisible();
  await page.unroute('**/api/operations');
  await page.getByRole('button', { name: 'Retry connection' }).click();
  await expect(page.getByText(/Connection lost. These records may be stale/)).toHaveCount(0);
});
