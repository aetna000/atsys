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
    await expect(page.getByText(/^feature\.txt · SHA-256/)).toBeVisible();
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
      page.getByLabel(
        'Authorize network tools (Codex sandbox egress; other CLIs use native local-tool policy)',
      ),
    ).toHaveCount(0);
    await expect(
      page.getByLabel('Default goal-progress monitoring for new coding-agent tasks'),
    ).toHaveCount(0);
    await page
      .getByRole('combobox', { name: /^Worker (Local command|Codex coding agent)$/ })
      .click();
    await page.getByRole('option', { name: 'Codex coding agent', exact: true }).click();
    await expect(page.getByLabel('Worker model', { exact: true })).toBeVisible();
    await expect(
      page.getByLabel(
        'Authorize network tools (Codex sandbox egress; other CLIs use native local-tool policy)',
      ),
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
          `const fs=require('fs');console.log(JSON.stringify({message:'First real output'}));console.log(JSON.stringify({qualified_recovery_epoch:'/private/test-epoch',tasks:20}));console.log(JSON.stringify({pilot_completed:'morgan/023'}));setInterval(()=>{if(fs.existsSync('continue.signal')){console.log(JSON.stringify({type:'item.completed',item:{type:'command_execution',command:'acceptance check',status:'completed',exit_code:0}}));console.log(JSON.stringify({message:'Second real output\\nNew activity belongs at the top.'}));process.exit(0)}},100)`,
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
    await expect(
      activity.getByText('Pilot 1/20 completed · morgan/023', { exact: true }),
    ).toBeVisible();
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

test('named milestones explain their source and row/detail controls pause, resume and stop owned work', async ({
  page,
  request,
}) => {
  const { readFileSync } = await import('node:fs');
  const { taskDefaults } = await import('../../shared/operations');
  const cwd = mkdtempSync(join(tmpdir(), 'atsys-controls-'));
  const names = Array.from({ length: 8 }, (_, i) => `Named fixture stage ${i + 1}`);
  const name = `Milestone and control acceptance ${Date.now()}`;
  let id: string | undefined;
  try {
    const result = await request.post('/api/tasks', {
      data: {
        ...taskDefaults,
        name,
        objective: 'Exercise eight named stages and local process controls',
        cwd,
        worker: 'command',
        recovery: 'notify',
        goalMonitoring: false,
        progressFile: 'progress.json',
        validator: 'command',
        validationArgv: [process.execPath, '-e', 'process.exit(0)'],
        argv: [
          process.execPath,
          '-e',
          `const fs=require('fs');let n=0;setInterval(()=>{fs.writeFileSync('ticks',String(++n));fs.writeFileSync('progress.json',JSON.stringify({completed:Math.min(n,7),total:8,milestones:${JSON.stringify(names)},planSource:'Project-owned ordered stages from the acceptance fixture',checkpoint:'stage-'+Math.min(n,7)}))},200)`,
        ],
        timeoutSeconds: 60,
      },
    });
    expect(result.ok()).toBe(true);
    const task = await result.json();
    id = task.id;
    await page.goto(`/tasks/${id}`);
    const plan = page.getByRole('region', { name: 'Reported milestone plan' });
    // A named section exposes its eight actual labels, not only a denominator.
    await expect(
      page.getByText('Project-owned ordered stages from the acceptance fixture', { exact: true }),
    ).toBeVisible();
    for (const name of names) await expect(plan.getByText(name, { exact: false })).toBeVisible();
    await expect(
      page.getByText(/Milestones are reported progress, not acceptance evidence/),
    ).toBeVisible();
    await expect(plan.locator('li')).toHaveCount(8);
    await page.getByRole('button', { name: 'Pause task', exact: true }).click();
    await expect(page.getByText('Local processes paused', { exact: true })).toBeVisible({
      timeout: 10000,
    });
    const frozen = readFileSync(join(cwd, 'ticks'), 'utf8');
    await page.waitForTimeout(700);
    expect(readFileSync(join(cwd, 'ticks'), 'utf8')).toBe(frozen);
    await page.screenshot({
      path: `docs/screenshots/tasks-paused-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'All managed tasks', exact: false }).click();
    const controls = page.getByRole('group', {
      name: `Controls for ${name}`,
    });
    await controls.getByRole('button', { name: 'Resume task', exact: true }).click();
    await expect.poll(() => readFileSync(join(cwd, 'ticks'), 'utf8')).not.toBe(frozen);
    await controls.getByRole('button', { name: 'Stop task', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Stop this task?' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep task', exact: true }).click();
    await controls.getByRole('button', { name: 'Stop task', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm stop', exact: true }).click();
    const row = page
      .locator('.ops-task-container')
      .filter({ has: page.getByText(name, { exact: true }) });
    await expect(row).toContainText('Stopped', { timeout: 10000 });
    const stopped = readFileSync(join(cwd, 'ticks'), 'utf8');
    await page.waitForTimeout(400);
    expect(readFileSync(join(cwd, 'ticks'), 'utf8')).toBe(stopped);
  } finally {
    if (id) await request.post(`/api/tasks/${id}/stop`, { data: {} });
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('goal workflow shows goal, observed stages and durable partial outcome after reload', async ({
  page,
  request,
}) => {
  const { taskDefaults } = await import('../../shared/operations');
  const cwd = mkdtempSync(join(tmpdir(), 'atsys-goal-ui-'));
  let id: string | undefined;
  try {
    const result = await request.post('/api/tasks', {
      data: {
        ...taskDefaults,
        name: 'Goal workflow acceptance',
        objective: 'Process two items and retain the failed domain result',
        cwd,
        plan: 'Process items, independently verify output and deliver report',
        worker: 'command',
        recovery: 'notify',
        progressFile: 'progress.json',
        outcomeFile: 'outcome.json',
        outcomeRequired: true,
        goalContract: {
          version: 1,
          successCriteria: ['Report includes the failed item'],
          deliverables: ['outcome.json'],
          constraints: ['Local fixture only'],
          assumptions: [],
          unresolvedDecisions: [],
          stages: ['Process items', 'Verify output'],
          planSource: 'UI fixture goal acceptance plan',
          observers: [
            {
              signal: 'progress',
              cadenceSeconds: 1,
              rationale: 'Two actual stages reported by fixture',
            },
            { signal: 'validator', cadenceSeconds: 1, rationale: 'Independent JSON content check' },
          ],
          recoveryScope: 'No repair required',
          escalationConditions: ['Validation failure'],
          budget: 'No API calls; cost unknown',
        },
        argv: [
          process.execPath,
          '-e',
          `const fs=require('fs');fs.writeFileSync('progress.json',JSON.stringify({completed:2,total:2,checkpoint:'Both items processed; one domain failure remains'}));fs.writeFileSync('outcome.json',JSON.stringify({version:1,summary:'Processing finished with partial domain results',results:[{name:'Item A',status:'passed',detail:'accepted',evidence:[]},{name:'Item B',status:'failed',detail:'Domain check failed',evidence:[]}],limitations:['One unresolved domain failure']}))`,
        ],
        validator: 'command',
        validationArgv: [
          process.execPath,
          '-e',
          `const r=require('./outcome.json');process.exit(r.results.length===2&&r.results[1].status==='failed'?0:1)`,
        ],
        timeoutSeconds: 20,
      },
    });
    expect(result.ok()).toBe(true);
    id = (await result.json()).id;
    await page.goto(`/tasks/${id}`);
    await expect(page.getByRole('heading', { name: 'Goal contract', exact: true })).toBeVisible();
    await expect(page.getByText('Report includes the failed item', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Two actual stages reported by fixture', { exact: false }),
    ).toBeVisible();
    const readable = page.locator('pre').filter({ hasText: '# Task outcome report' });
    await expect(readable).toContainText('Workflow acceptance: accepted by declared validator', {
      timeout: 20000,
    });
    await expect(readable).toContainText('Item B: failed');
    await expect(readable).toContainText('worker-reported');
    await expect(readable).toContainText('Costs: unknown');
    const receipt = await request.get(`/api/tasks/${id}/report`);
    expect(receipt.ok()).toBe(true);
    const digest = (await receipt.json()).digest;
    await page.reload();
    await expect(page.getByText(`SHA-256 ${digest}`, { exact: true })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Reported milestone plan' }).locator('li'),
    ).toHaveCount(2);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  } finally {
    if (id) await request.post(`/api/tasks/${id}/stop`, { data: {} });
    rmSync(cwd, { recursive: true, force: true });
  }
});
