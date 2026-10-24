import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('managed coding task has independent validation, editable configuration and persisted output', async ({
  page,
}, info) => {
  const cwd = mkdtempSync(join(tmpdir(), 'atsys-browser-task-'));
  const name = `General coding job ${info.project.name}`;
  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Work that stays looked after' })).toBeVisible();
    await page.getByRole('button', { name: 'New managed task', exact: true }).click();
    await page.getByLabel('Task name', { exact: true }).fill(name);
    await page.getByLabel('Working directory', { exact: true }).fill(cwd);
    await page
      .getByLabel('Task objective', { exact: true })
      .fill('Implement a small feature and verify its acceptance check.');
    await page
      .getByLabel('Execution plan & constraints', { exact: true })
      .fill('Write feature.txt, then independently verify its contents.');
    await page.getByLabel('Worker', { exact: true }).click();
    await page.getByRole('option', { name: 'Local command', exact: true }).click();
    await page
      .getByLabel('Execution argv (JSON array)', { exact: true })
      .fill(
        JSON.stringify([
          process.execPath,
          '-e',
          `require('fs').writeFileSync('feature.txt','complete');console.log('feature implemented')`,
        ]),
      );
    await page
      .getByLabel('Validation argv (JSON array)', { exact: true })
      .fill(
        JSON.stringify([
          process.execPath,
          '-e',
          `process.exit(require('fs').readFileSync('feature.txt','utf8')==='complete'?0:1)`,
        ]),
      );
    await page
      .getByLabel('Required artifacts (one relative path per line)', { exact: true })
      .fill('feature.txt');
    await page.getByLabel('Exception policy', { exact: true }).click();
    await page.getByRole('option', { name: 'Stop and notify me', exact: true }).click();
    await page.getByRole('button', { name: 'Start managed task', exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(
      page.getByText('Independent validation command exited zero.', { exact: true }).first(),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/feature.txt · SHA-256/)).toBeVisible();
    await expect(page.getByText('Latest observer goal check', { exact: true })).toBeVisible();
    await expect(page.getByText('Next action', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Attempt output', { exact: true })).toBeHidden();
    await expect(
      page.getByText('Write feature.txt, then independently verify its contents.', { exact: true }),
    ).toBeHidden();
    await page
      .getByText('Technical configuration and full execution plan', { exact: true })
      .click();
    await expect(
      page.getByText('Write feature.txt, then independently verify its contents.', { exact: true }),
    ).toBeVisible();
    await page
      .getByText('Technical configuration and full execution plan', { exact: true })
      .click();
    await page.getByRole('button', { name: 'Edit task wiring' }).click();
    await expect(
      page.getByLabel('Authorize network access for Codex worker and bounded repair'),
    ).toBeVisible();
    await page.getByLabel('Maximum worker retries', { exact: true }).fill('3');
    await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
    await page.reload();
    await expect(page.getByText('3 retries · repair disabled')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: `docs/screenshots/tasks-detail-${info.project.name}.png`,
      fullPage: true,
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
test('real recovery drill completes and service/notification configuration is visible', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Run recovery drill', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Checkpoint recovery drill', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Independent validation command exited zero.', { exact: true }).first(),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('incident · opened', { exact: true })).toBeVisible();
  await expect(page.getByText('retry · authorized', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'All managed tasks', exact: false }).click();
  await page.screenshot({
    path: `docs/screenshots/tasks-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('tab', { name: 'Service & Telegram' }).click();
  await expect(page.getByRole('heading', { name: 'Who watches the watchdog?' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Telegram notifications', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send test notification' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
