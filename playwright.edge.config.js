import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/edge',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4195', viewport: { width: 390, height: 844 } },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: 'npm run build && wrangler dev --local --ip 127.0.0.1 --port 4195 --inspector-port 0',
    url: 'http://127.0.0.1:4195',
    reuseExistingServer: false,
    env: { WRANGLER_SEND_METRICS: 'false' },
  },
});
