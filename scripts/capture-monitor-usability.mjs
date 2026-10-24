// Read-only capture of an existing task. CLI frames are explicitly rendered output,
// not screenshots of a user's Terminal window. No private raw task JSON is persisted.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [phase = 'after', id, base = 'http://127.0.0.1:4311'] = process.argv.slice(2);
if (!['before', 'after'].includes(phase) || !id)
  throw new Error('Usage: node scripts/capture-monitor-usability.mjs before|after TASK_ID [URL]');
const root = resolve('.atsys/usability-20261024');
mkdirSync(root, { recursive: true, mode: 0o700 });
const args = [
  '--import',
  'tsx',
  resolve('server/cli.ts'),
  'task',
  phase === 'before' ? 'show' : 'status',
  id,
];
const output = execFileSync(process.execPath, args, { encoding: 'utf8', env: process.env });
const excerpt = phase === 'before' ? output.split('\n').slice(0, 38).join('\n') : output;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const task = JSON.parse(
    execFileSync(
      process.execPath,
      ['--import', 'tsx', resolve('server/cli.ts'), 'task', 'show', id],
      { encoding: 'utf8', env: process.env },
    ),
  );
  if (phase === 'before') {
    await page.goto(base);
    await page.getByText(task.config.name, { exact: true }).first().click();
  } else await page.goto(`${base}/tasks/${id}`);
  await page.getByRole('button', { name: 'Edit task wiring' }).waitFor();
  await page.screenshot({ path: `${root}/dashboard-${phase}.png`, animations: 'disabled' });
  if (phase === 'after') {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${root}/dashboard-after-mobile.png`, animations: 'disabled' });
    await page.screenshot({
      path: `${root}/dashboard-after-mobile-full.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1100, height: 940 });
  await page.setContent(
    '<html><body style="margin:0;background:#101820;color:#e5edf5;font:15px/1.45 ui-monospace,monospace"><header style="padding:18px 28px;background:#1b2935">Actual CLI output, rendered for inspection — not a macOS Terminal screenshot<br><span id="command"></span></header><pre id="output" style="margin:24px 28px;white-space:pre;overflow:hidden"></pre></body></html>',
  );
  await page.locator('#command').evaluate(
    (node, text) => {
      node.textContent = text;
    },
    `$ atsys task ${phase === 'before' ? 'show' : 'status'} ${id}${phase === 'before' ? ' [first 38 lines shown]' : ''}`,
  );
  await page.locator('#output').evaluate((node, text) => {
    node.textContent = text;
  }, excerpt);
  await page.screenshot({ path: `${root}/terminal-${phase}.png` });
  writeFileSync(
    `${root}/${phase}-metrics.json`,
    JSON.stringify(
      {
        bytes: Buffer.byteLength(output),
        lines: output.trimEnd().split('\n').length,
        captureKind: 'actual CLI output rendered in browser; actual dashboard screenshot',
        state: task.status,
        progress: task.attempts.findLast((a) => a.phase === 'worker')?.progress ?? null,
      },
      null,
      2,
    ),
  );
  console.log(`Saved ${phase} screenshots and metrics under ${root}`);
} finally {
  await browser.close();
}
