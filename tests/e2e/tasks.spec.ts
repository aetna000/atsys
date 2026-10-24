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
    await page
      .getByRole('combobox', { name: /^Worker (Local command|Codex coding agent)$/ })
      .click();
    await page.getByRole('option', { name: 'Local command', exact: true }).click();
    await page
      .getByLabel('Execution argv (JSON array)', { exact: true })
      .fill(
        JSON.stringify([
          process.execPath,
          '-e',
          `const fs=require('fs');if(!fs.existsSync('hook-ready'))process.exit(17);fs.writeFileSync('feature.txt','complete');console.log('feature implemented')`,
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
    await page.getByRole('button', { name: 'Lifecycle hooks', exact: true }).click();
    await page.getByLabel('Lifecycle hooks (JSON array)', { exact: true }).fill(
      JSON.stringify([
        {
          id: 'build-preflight',
          events: ['before_run'],
          phases: ['worker'],
          argv: [
            process.execPath,
            '-e',
            `require('fs').writeFileSync('hook-ready','yes');console.log(JSON.stringify({message:'Preflight callback passed'}))`,
          ],
          timeoutSeconds: 10,
        },
      ]),
    );
    await page.getByLabel('Exception policy', { exact: true }).click();
    await page.getByRole('option', { name: 'Stop and notify me', exact: true }).click();
    await page.getByRole('button', { name: 'Start managed task', exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(
      page.getByText('Independent validation command exited zero.', { exact: true }).first(),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/feature.txt · SHA-256/)).toBeVisible();
    await expect(
      page.getByText('build-preflight · before run · succeeded', { exact: true }),
    ).toBeVisible();
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
    ).toHaveCount(0);
    await expect(
      page.getByLabel('Default goal-progress monitoring for new Codex tasks'),
    ).toHaveCount(0);
    await page
      .getByRole('combobox', { name: /^Worker (Local command|Codex coding agent)$/ })
      .click();
    await page.getByRole('option', { name: 'Codex coding agent', exact: true }).click();
    await expect(page.getByLabel('Worker model', { exact: true })).toBeVisible();
    await expect(
      page.getByLabel('Authorize network access for Codex worker and bounded repair'),
    ).toBeVisible();
    await expect(page.getByLabel('Checkpoint resume argv (JSON array)')).toHaveCount(0);
    await page
      .getByRole('combobox', { name: /^Worker (Local command|Codex coding agent)$/ })
      .click();
    await page.getByRole('option', { name: 'Local command', exact: true }).click();
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

test('activity is readable, newest first and pausing the display never pauses execution', async ({
  page,
  request,
}) => {
  const cwd = mkdtempSync(join(tmpdir(), 'atsys-activity-'));
  const { writeFileSync } = await import('node:fs');
  const { taskDefaults } = await import('../../shared/operations');
  let taskId: string | undefined;
  try {
    const response = await request.post('/api/tasks', {
      data: {
        ...taskDefaults,
        name: 'Readable activity acceptance',
        objective: 'Exercise real output while display is paused',
        cwd,
        worker: 'command',
        recovery: 'notify',
        validator: 'command',
        argv: [
          process.execPath,
          '-e',
          `const fs=require('fs');console.log(JSON.stringify({message:'First real output'}));setInterval(()=>{if(fs.existsSync('continue.signal')){console.log(JSON.stringify({type:'item.completed',item:{type:'command_execution',command:'acceptance check',status:'completed',exit_code:0}}));console.log(JSON.stringify({message:'Second real output\\nNew activity belongs at the top.'}));process.exit(0)}},100)`,
        ],
        validationArgv: [
          process.execPath,
          '-e',
          `process.exit(require('fs').existsSync('continue.signal')?0:1)`,
        ],
        timeoutSeconds: 30,
      },
    });
    expect(response.ok()).toBe(true);
    const task = await response.json();
    taskId = task.id;
    await page.goto(`/tasks/${task.id}`);
    const activity = page.getByRole('region', { name: 'Readable task activity' });
    await expect(page.getByLabel('Activity attempt', { exact: true })).toContainText(
      'All attempts',
    );
    await expect(activity.getByText('First real output', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pause task activity', exact: true }).click();
    writeFileSync(join(cwd, 'continue.signal'), 'resume test workload');
    await expect(
      page.getByText('Independent validation command exited zero.', { exact: true }).first(),
    ).toBeVisible({ timeout: 15000 });
    await expect(activity.getByText(/Second real output/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Resume task activity', exact: true }).click();
    await expect(activity.getByText(/Second real output/)).toBeVisible();
    const content = await activity.innerText();
    expect(content.indexOf('Second real output')).toBeLessThan(
      content.indexOf('First real output'),
    );
    expect(content).not.toContain('"type"');
    expect(content).toContain('Finished (exit 0): acceptance check');
    await page.getByLabel('Filter activity', { exact: true }).fill('First real');
    await expect(activity.getByText('First real output', { exact: true })).toBeVisible();
    await expect(activity.getByText(/Second real output/)).toHaveCount(0);
    await page.getByLabel('Filter activity', { exact: true }).fill('');
    await page.getByLabel('Activity attempt', { exact: true }).click();
    await page.getByRole('option', { name: '1 · worker · succeeded', exact: true }).click();
    await expect(activity.getByText(/Second real output/)).toBeVisible();
    await expect(
      activity.getByText('Independent validation command exited zero.', { exact: true }),
    ).toHaveCount(0);
  } finally {
    if (taskId) await request.post(`/api/tasks/${taskId}/stop`, { data: {} });
    rmSync(cwd, { recursive: true, force: true });
  }
});
