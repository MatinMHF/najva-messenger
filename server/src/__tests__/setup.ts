/**
 * Vitest setup — runs before every test file (see vitest.config.ts setupFiles).
 * Points the process at the dedicated test DB / Redis logical DB and away from
 * the dev database. Must run before any module imports the Prisma singleton.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://najva:change_me_in_production@localhost:5432/najva_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';
// Non-default secrets so the production fail-fast guard is never a factor here.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
process.env.SERVER_SECRET = process.env.SERVER_SECRET || 'test-server-secret';
// Non-empty so Web Push is "configured" in tests (web-push itself is mocked).
process.env.VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'test-vapid-public';
process.env.VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'test-vapid-private';
