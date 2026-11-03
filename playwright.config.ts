import { defineConfig, devices } from '@playwright/test';

const VIEWPORTS = [
  { name: 'tablet-1280x800', width: 1280, height: 800 },
  { name: 'pc-1366x768', width: 1366, height: 768 },
  { name: 'backoffice-1440x900', width: 1440, height: 900 },
  { name: 'hp-360x800', width: 360, height: 800 },
] as const;

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects: VIEWPORTS.map((viewport) => ({
    name: viewport.name,
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: viewport.width, height: viewport.height },
    },
  })),
});
