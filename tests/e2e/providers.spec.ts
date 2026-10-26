import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { taskDefaults } from '../../shared/operations';

test('provider worker/supervisor/repair policy choices persist without launching a model', async ({
  page,
  request,
}) => {
  const cwd = mkdtempSync(join(tmpdir(), 'atsys-provider-ui-'));
  let id: string | undefined;
  try {
    const response = await request.post('/api/tasks', {
      data: {
        ...taskDefaults,
        name: `Provider configuration ${Date.now()}`,
        objective: 'Check provider configuration UI without a model invocation',
        cwd,
        worker: 'command',
        argv: [process.execPath, '-e', 'process.exit(0)'],
        recovery: 'notify',
      },
    });
    expect(response.ok()).toBe(true);
    id = (await response.json()).id;
    await page.goto(`/tasks/${id}`);
    await expect(page.getByText('Completed and validated', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: 'Edit task wiring' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Worker', { exact: true }).click();
    await page.getByRole('option', { name: 'GitHub Copilot coding agent', exact: true }).click();
    await dialog.getByLabel('Worker model', { exact: true }).fill('fixture-copilot-model');
    await dialog
      .getByLabel(
        'Authorize native CLI tools as my local user (Copilot/Claude; no Codex sandbox guarantee)',
      )
      .check();
    await dialog.getByLabel('Exception policy', { exact: true }).click();
    await page.getByRole('option', { name: 'Ask selected agent supervisor', exact: true }).click();
    await dialog.getByLabel('Supervisor provider', { exact: true }).click();
    await page.getByRole('option', { name: 'Claude Code', exact: true }).click();
    await dialog.getByLabel('Supervisor model', { exact: true }).fill('fixture-claude-model');
    await dialog.getByLabel('Authorize a bounded repair in this workspace before retry').check();
    await dialog.getByLabel('Repair provider', { exact: true }).click();
    await page.getByRole('option', { name: 'Codex', exact: true }).click();
    await dialog.getByLabel('Repair model', { exact: true }).fill('fixture-codex-model');
    await page.screenshot({
      path: `docs/screenshots/provider-wiring-${test.info().project.name}.png`,
      fullPage: true,
    });
    await dialog.getByRole('button', { name: 'Save configuration', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect
      .poll(async () => {
        const current = await (await request.get('/api/operations')).json();
        return current.tasks.find((t: { id: string }) => t.id === id)?.config;
      })
      .toMatchObject({
        worker: 'copilot',
        model: 'fixture-copilot-model',
        supervisorProvider: 'claude',
        repairProvider: 'codex',
        trustedLocalExecution: true,
        allowRepair: true,
      });
    await expect(
      page.getByText('GitHub Copilot · fixture-copilot-model', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Claude Code · fixture-claude-model', { exact: true }),
    ).toBeVisible();
  } finally {
    if (id) await request.post(`/api/tasks/${id}/stop`, { data: {} });
    rmSync(cwd, { recursive: true, force: true });
  }
});
