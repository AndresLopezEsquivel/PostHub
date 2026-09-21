import { beforeAll, beforeEach, afterAll } from 'vitest';
import { query } from '../src/db/query';
import { closePool } from '../src/db/pool';
import { resetDb } from './helpers/db';

// Global setup for the integration project only (wired via setupFiles in
// vitest.config.ts). Runs once per test file.

// Safety net: the pool is bound to whatever DATABASE_URL was set when Node
// started. The npm test scripts point it at posthub_test, but if that override
// is ever missing this refuses to run rather than TRUNCATE a real database.
beforeAll(async () => {
  const { rows } = await query<{ current_database: string }>(
    'SELECT current_database()',
  );
  const dbName = rows[0].current_database;
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Refusing to run integration tests against non-test database "${dbName}". ` +
        'Point DATABASE_URL at posthub_test (npm test does this) and re-run.',
    );
  }
});

// A clean slate before every test.
beforeEach(async () => {
  await resetDb();
  // Also clear the connect-pg-simple session store. resetDb() recycles user ids
  // (RESTART IDENTITY), so a session row left over from a prior test could point
  // its userId at a *different* user in this one — clear it to keep auth tests
  // isolated. Guarded: the table is absent until 011_session.sql is applied
  // (npm run test:setup), which shouldn't fail an unrelated run.
  await query('TRUNCATE session').catch((err: { code?: string }) => {
    if (err?.code !== '42P01') throw err; // 42P01 = undefined_table
  });
});

// Release the pool so the worker's event loop can exit.
afterAll(async () => {
  await closePool();
});
