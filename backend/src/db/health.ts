import { pool } from './pool';

export type DatabaseHealth =
  | { ok: true }
  | { ok: false; error: string };

// SELECT 1 is the cheapest query that still proves the pool can reach the
// database. health.controller.ts maps the result to 200 or 503.
export async function checkDatabase(): Promise<DatabaseHealth> {
  try {
    await pool.query('SELECT 1');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
