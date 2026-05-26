import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const TEST_DATA_DIR = join(tmpdir(), 'papyrus-e2e-test-data');
const AUTH_TOKEN = process.env.PAPYRUS_AUTH_TOKEN || 'e2e-test-token-e2e-test-token-32chars';

// 清理之前运行残留的测试数据
try { rmSync(TEST_DATA_DIR, { recursive: true }); } catch {}

// 传递环境变量，使后端使用临时数据库而非生产数据
process.env.PAPYRUS_AUTH_TOKEN = AUTH_TOKEN;
process.env.PAPYRUS_DATA_DIR = TEST_DATA_DIR;

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: 'http://127.0.0.1:8000',
    trace: 'on-first-retry',
    extraHTTPHeaders: {
      'x-papyrus-token': AUTH_TOKEN,
    },
  },

  webServer: {
    command: 'npx --prefix ../backend tsx ../backend/src/api/server.ts',
    url: 'http://127.0.0.1:8000/api/health',
    reuseExistingServer: false,
    timeout: 30000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
