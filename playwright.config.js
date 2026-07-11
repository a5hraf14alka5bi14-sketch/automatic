import { defineConfig, devices } from '@playwright/test'

// E2E tests run against a live server.
// Set BASE_URL to override (default: http://localhost:5000).
// Set TEST_EMAIL / TEST_PASSWORD for login credentials.
// In CI, start the server first, then run `npx playwright test`.
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // The app authenticates via JWT cookies; keep cookies across page navigations.
    storageState: undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
