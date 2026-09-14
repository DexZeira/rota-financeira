import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run start',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    { name: '320', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 800 } } },
    { name: '360', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 800 } } },
    { name: '390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: '430', use: { ...devices['Desktop Chrome'], viewport: { width: 430, height: 932 } } },
    { name: '768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: '1366', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: '1920', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
  ],
});
