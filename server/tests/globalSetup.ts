import { execSync } from 'node:child_process';

/** Runs once before the suite: bring the test database (port 5433) up to the latest migration. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see server/.env.example)');
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
}
