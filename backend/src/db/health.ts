import { pool } from './pool';

export type DatabaseHealth =
  | { ok: true }
  | { ok: false; error: string };

// Round-trips the cheapest possible query to confirm the pool can reach the
// database and get an answer back. A utility only — deliberately NOT wired to
// GET /api/health this pass; that route stays an empty router until it does
// real work.
export async function checkDatabase(): Promise<DatabaseHealth> {
  try {
    await pool.query('SELECT 1');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
