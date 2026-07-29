import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { pool, closePool } from './pool';

// Forward-only SQL migration runner. Applies every backend/migrations/*.sql
// file that has not been applied yet, in filename order, each in its own
// transaction, recording what ran in a schema_migrations ledger.
//
// Run as a DEPLOY STEP, never at app boot:
//   local: docker compose exec api npm run migrate
//   prod:  a one-off task (ECS run-task / release command) before the new
//          web revision goes live.
// server.ts must never call this — a web process that migrates on start
// migrates once per replica and races itself.

// Fixed key for pg_advisory_lock. Serializes concurrent runners (e.g. two ECS
// tasks deploying at once): the second blocks here, then finds every file
// already applied and does nothing. The value is arbitrary but must be stable.
const MIGRATION_LOCK_KEY = 4021775; // "posthub migrations", any constant works

// src/db → ../../migrations = backend/migrations. Holds for the compiled layout
// too (dist/db → ../../migrations), provided the image ships the SQL files.
const MIGRATIONS_DIR = join(__dirname, '../../migrations');

// Apply all pending migrations against `db`. Exported (rather than run inline)
// so a caller can point it at a different database than the shared process pool
// — the test harness migrates posthub_test by passing a pool bound to it. The
// CLI path below calls it with no argument, so it defaults to the shared pool.
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
        // One transaction per file: a failing migration rolls back cleanly and
        // halts the run, leaving every earlier file committed and this one not
        // recorded — so a fixed re-run resumes exactly here.
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

// CLI entrypoint. Guarded by require.main so that importing this module (the
// test-setup helper does, to reuse runMigrations) neither migrates nor closes
// the shared pool — only running it directly does.
if (require.main === module) {
  runMigrations()
    .then(() => closePool())
    .catch(async (err) => {
      console.error(err);
      await closePool();
      process.exit(1);
    });
}
