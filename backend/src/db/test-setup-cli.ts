import { Pool } from 'pg';
import { pool, closePool } from './pool';
import { runMigrations } from './migrate';
import { env } from '../config/env';

// Creates and migrates the posthub_test database used by the integration suite.
//
//   docker compose exec api npm run test:setup
//
// CREATE DATABASE is per-environment infrastructure, not a schema change: it
// can't run inside the migrate transaction and isn't something the migrations/
// ledger should own, so it lives here rather than as a migration file.
// Idempotent — safe to re-run (skips creation if the database already exists,
// and the migration runner skips files it has already applied).

const TEST_DB = 'posthub_test';

// Derive the test database URL from the base one by swapping only the database
// name, so host/credentials/params carry over unchanged.
function testDatabaseUrl(base: string): string {
  const url = new URL(base);
  url.pathname = `/${TEST_DB}`;
  return url.toString();
}

async function main(): Promise<void> {
  // The shared pool is bound to the base database (posthub); use it to create
  // the test database alongside it.
  const { rowCount } = await pool.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [TEST_DB],
  );
  if (rowCount === 0) {
    // TEST_DB is a fixed constant, never user input — safe to interpolate (a
    // database identifier can't be a bound parameter).
    await pool.query(`CREATE DATABASE ${TEST_DB}`);
    console.log(`created database ${TEST_DB}`);
  } else {
    console.log(`database ${TEST_DB} already exists`);
  }

  // Migrate the test database with the same runner used everywhere else, on a
  // pool bound to it. Closed here; the shared pool is closed by the wrapper.
  const testPool = new Pool({ connectionString: testDatabaseUrl(env.databaseUrl) });
  try {
    await runMigrations(testPool);
  } finally {
    await testPool.end();
  }
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    console.error(err);
    await closePool();
    process.exit(1);
  });
