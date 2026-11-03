import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { pool, closePool } from './pool';

// Forward-only: there are no down migrations. Each file runs once, in filename
// order, and is recorded in schema_migrations.
//
// Migrating is a separate deploy step (see README.md), never part of server
// startup: every replica would migrate on start and race the others.

// The pg_advisory_lock key. Two runners started at once share it, so the second
// waits, then finds every file applied. Any constant works, but it must never
// change, or an old and a new runner would not block each other.
const MIGRATION_LOCK_KEY = 4021775;

// ../../migrations is backend/migrations from both src/db and dist/db. tsc does
// not copy the SQL files, so backend/Dockerfile copies them.
const MIGRATIONS_DIR = join(__dirname, '../../migrations');

// Takes a pool so test-setup-cli.ts can migrate posthub_test instead of the
// main database.
export async function runMigrations(db: Pool = pool): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text        PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  // Serialize with any other runner before reading the ledger, so the "what's
  // already applied?" check and the writes that follow are one critical section.
  await db.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
  try {
    const applied = new Set(
      (
        await db.query<{ filename: string }>(
          'SELECT filename FROM schema_migrations',
        )
      ).rows.map((r) => r.filename),
    );

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const pending = files.filter((f) => !applied.has(f));
    if (pending.length === 0) {
      console.log('Migrations up to date — nothing to apply.');
      return;
    }

    for (const filename of pending) {
      const sql = readFileSync(join(MIGRATIONS_DIR, filename), 'utf8');
      const client = await db.connect();
      try {
        // One transaction per file: a failing file rolls back and is not
        // recorded, earlier files stay committed, and a re-run resumes here.
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [filename],
        );
        await client.query('COMMIT');
        console.log(`applied ${filename}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(
          `Migration ${filename} failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      } finally {
        client.release();
      }
    }

    console.log(`Done — applied ${pending.length} migration(s).`);
  } finally {
    await db.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
  }
}

// Runs only when executed directly: test-setup-cli.ts imports runMigrations,
// and importing must not migrate or close the shared pool.
if (require.main === module) {
  runMigrations()
    .then(() => closePool())
    .catch(async (err) => {
      console.error(err);
      await closePool();
      process.exit(1);
    });
}
