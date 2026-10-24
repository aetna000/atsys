import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
const operationsDataDir = resolve('.atsys', `e2e-${Date.now()}`);
const testPort = Number(process.env.ATSYS_E2E_PORT ?? 4311);
export default defineConfig({
  metadata: { operationsDataDir },
  globalTeardown: './tests/e2e-cleanup.ts',
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: {
    command: `ATSYS_PORT=${testPort} ATSYS_DATA_DIR=${operationsDataDir} npm start`,
    url: `http://127.0.0.1:${testPort}/api/health`,
    reuseExistingServer: false,
    timeout: 30000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1050 } },
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
