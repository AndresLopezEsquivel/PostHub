import { pool } from './pool';

export type DatabaseHealth =
  | { ok: true }
  | { ok: false; error: string };

// Round-trips the cheapest possible query to confirm the pool can reach the
// database and get an answer back. Backs the GET /api/health readiness probe
// (see health.controller.ts), which maps { ok: true } → 200 and { ok: false } →
// 503; the error string is logged here but never surfaced in the response body.
export async function checkDatabase(): Promise<DatabaseHealth> {
  try {
    await pool.query('SELECT 1');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
