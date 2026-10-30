import { Pool } from 'pg';
import { pool, closePool } from './pool';
import { runMigrations } from './migrate';
import { env } from '../config/env';

// Creates and migrates the posthub_test database used by the integration suite.
//
//   docker compose exec api npm run test:setup
//
// Not a migration: CREATE DATABASE cannot run inside a transaction, and every
// migration runs in one. Safe to re-run, since an existing database is kept and
// applied migrations are skipped.

const TEST_DB = 'posthub_test';

// Derive the test database URL from the base one by swapping only the database
// name, so host/credentials/params carry over unchanged.
function testDatabaseUrl(base: string): string {
  const url = new URL(base);
  url.pathname = `/${TEST_DB}`;
  return url.toString();
}

async function main(): Promise<void> {
  // Creating a database needs a connection to another one, so this goes through
  // the shared pool, which is connected to posthub.
  const { rowCount } = await pool.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [TEST_DB],
  );
  if (rowCount === 0) {
    // A database name cannot be a bound parameter, so it is interpolated. That
    // is safe only because TEST_DB is a constant.
    await pool.query(`CREATE DATABASE ${TEST_DB}`);
    console.log(`created database ${TEST_DB}`);
  } else {
    console.log(`database ${TEST_DB} already exists`);
  }

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
