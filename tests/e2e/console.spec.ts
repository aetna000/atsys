import { test, expect } from '@playwright/test';
test('all core routes render and stay within viewport', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const routes = [
    ['/overview', 'Project overview'],
    ['/projects', 'Projects'],
    ['/fleet', 'Agent fleet'],
    ['/runs', 'Runs'],
    ['/incidents', 'Incidents & recovery'],
    ['/approvals', 'Human approvals'],
    ['/costs', 'Costs & usage'],
    ['/memory', 'Governed memory'],
    ['/observability', 'Observability'],
    ['/atbot', 'Intelligence companion'],
    ['/settings', 'Settings'],
  ];
  for (const [route, title] of routes) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByText('Sample project', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.goto('/overview');
  await expect(page.getByRole('heading', { name: 'Project overview', exact: true })).toBeVisible();
  await page.screenshot({
    path: `docs/screenshots/overview-${info.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test('fleet filtering and truthful capability details', async ({ page }) => {
  await page.goto('/fleet');
  await expect(page.getByRole('heading', { name: 'Agent fleet', exact: true })).toBeVisible();
  await page.getByLabel('Filter role').selectOption('observer');
  await expect(
    page.getByRole('button', { name: 'observer-rules-01', exact: false }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'observer-rules-01', exact: false }).first().click();
  await expect(page.getByRole('heading', { name: 'Effective capabilities' })).toBeVisible();
  await expect(page.getByText(/Unavailable/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Close agent details' }).click();
  await page.getByLabel('Search workspace').fill('no-such-agent');
  await expect(page.getByText('No agents match')).toBeVisible();
});
test('create run, inject crash, decide recovery and preserve receipt', async ({ page }, info) => {
  await page.goto('/overview');
  await expect(page.getByRole('heading', { name: 'Project overview' })).toBeVisible();
  await page.getByRole('button', { name: 'New run', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Claude Code Simulated adapter' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const name = `UI smoke ${info.project.name} ${Date.now()}`;
  await page.getByLabel('Task name').fill(name);
  await page.getByRole('button', { name: 'Start simulation', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const runUrl = page.url();
  await page.getByRole('button', { name: 'Simulate crash', exact: true }).click();
  await expect(page.getByText('Human decision required.')).toBeVisible();
  await page.getByRole('link', { name: 'Review recovery proposal →' }).click();
  const proposal = page
    .locator('section.panel')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
  await expect(proposal).toBeVisible();
  await proposal.getByRole('button', { name: 'Approve recovery', exact: true }).click();
  await expect(proposal.getByText(/Approved/)).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Show decision history' }).click();
  await expect(proposal.getByText(/Approved/)).toBeVisible();
  await page.goto(runUrl);
  await page.getByRole('tab', { name: /Receipts/ }).click();
  await expect(page.getByText(/Policy verified exact target/)).toBeVisible();
  await page.getByRole('button', { name: 'Stop run', exact: true }).click();
  await expect(page.getByText(/Aborted/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Aborted/).first()).toBeVisible();
});
test('settings persist and provider doctor reports actual support', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  const input = page.getByLabel('Daily budget (USD)');
  const budget = String(Number(await input.inputValue()) + 1);
  await input.fill(budget);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Guardrails saved')).toBeVisible();
  await page.reload();
  await expect(input).toHaveValue(budget);
  await page.getByRole('button', { name: 'Check providers' }).click();
  await expect(
    page
      .getByText('Not found on PATH')
      .or(page.getByText('Detected', { exact: false }))
      .first(),
  ).toBeVisible();
  await expect(page.getByText(/Unavailable/).first()).toBeVisible();
});
test('dark theme and paused event display work', async ({ page }, info) => {
  await page.goto('/overview');
  await expect(page.getByRole('heading', { name: 'Project overview' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause logs' }).click();
  await expect(page.getByText('Paused', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume logs' }).click();
  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.getByRole('button', { name: 'Close navigation' }).click();
  } else {
    await page.getByRole('button', { name: 'Use dark theme' }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: 'docs/screenshots/overview-dark.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Use light theme' }).click();
  }
});

test('stale API state is visible and retry restores the live connection', async ({ page }) => {
  await page.goto('/overview');
  await expect(page.getByRole('heading', { name: 'Project overview' })).toBeVisible();
  await page.route('**/api/state', (route) => route.abort('failed'));
  await expect(page.getByText('Snapshot · disconnected', { exact: true })).toBeVisible({
    timeout: 8000,
  });
  await expect(page.getByText('Stale', { exact: true })).toBeVisible();
  await expect(page.getByText(/Displayed records may be stale/)).toBeVisible();
  await page.unroute('**/api/state');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('Control plane active', { exact: true })).toBeVisible();
});

test('project cards set the selected project before navigating to runs', async ({ page }) => {
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  const card = page
    .locator('section.project-card')
    .filter({ has: page.getByRole('heading', { name: /AtSys/ }) });
  await card.getByRole('link', { name: 'Explore runs' }).click();
  await expect(page.getByRole('heading', { name: 'Runs', exact: true })).toBeVisible();
  await expect(page.getByLabel('Select project')).toHaveValue('project-atsys');
  await expect(
    page.getByRole('link', { name: 'Console · accessibility checks', exact: true }),
  ).toBeVisible();
});
