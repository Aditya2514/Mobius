import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // tests share one database, so run files one at a time
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      TZ: 'UTC',
      // never touch the dev database from tests
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
    },
  },
});
