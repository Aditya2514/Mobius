import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env';

describe('production JWT secret rules (config/env)', () => {
  const validBase = {
    DATABASE_URL: 'postgresql://app:app@localhost:5432/subs',
    JWT_ACCESS_SECRET: '01234567890123456789012345678901', // 32 chars
    JWT_REFRESH_SECRET: 'abcdefabcdefabcdefabcdefabcdefab', // 32 chars
  };

  it('accepts development secrets with >= 16 characters even with change-me', () => {
    const dev = parseEnv({
      ...validBase,
      NODE_ENV: 'development',
      JWT_ACCESS_SECRET: 'change-me-shorty16',
      JWT_REFRESH_SECRET: 'change-me-ref16ch',
    });
    expect(dev.NODE_ENV).toBe('development');
  });

  it('in production, rejects JWT_ACCESS_SECRET shorter than 32 characters', () => {
    expect(() =>
      parseEnv({
        ...validBase,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'short-secret-under-32-chars!!', // 29 chars
      }),
    ).toThrow(/JWT_ACCESS_SECRET must be at least 32 characters in production/);
  });

  it('in production, rejects JWT_ACCESS_SECRET containing "change-me"', () => {
    expect(() =>
      parseEnv({
        ...validBase,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'change-me-long-random-secret-at-least-32-chars',
      }),
    ).toThrow(/JWT_ACCESS_SECRET cannot contain "change-me" in production/);
  });

  it('in production, rejects JWT_REFRESH_SECRET shorter than 32 characters', () => {
    expect(() =>
      parseEnv({
        ...validBase,
        NODE_ENV: 'production',
        JWT_REFRESH_SECRET: 'short-refresh-under-32-chars!!',
      }),
    ).toThrow(/JWT_REFRESH_SECRET must be at least 32 characters in production/);
  });

  it('in production, rejects JWT_REFRESH_SECRET containing "change-me"', () => {
    expect(() =>
      parseEnv({
        ...validBase,
        NODE_ENV: 'production',
        JWT_REFRESH_SECRET: 'another-change-me-secret-with-length-over-32',
      }),
    ).toThrow(/JWT_REFRESH_SECRET cannot contain "change-me" in production/);
  });

  it('in production, accepts valid 32+ character secrets without "change-me"', () => {
    const prod = parseEnv({
      ...validBase,
      NODE_ENV: 'production',
    });
    expect(prod.NODE_ENV).toBe('production');
  });
});
