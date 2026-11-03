import { describe, it, expect, vi, afterEach } from 'vitest';
import { pool } from './pool';
import { checkDatabase } from './health';

// No database needed: creating the pool opens no connection, and the spy
// replaces the only query, so nothing here reaches PostgreSQL.
describe('checkDatabase', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns { ok: true } when the query succeeds', async () => {
    vi.spyOn(pool, 'query').mockResolvedValue({ rows: [{ '?column?': 1 }] } as never);

    await expect(checkDatabase()).resolves.toEqual({ ok: true });
  });

  it('returns { ok: false, error } when the query throws', async () => {
    vi.spyOn(pool, 'query').mockRejectedValue(new Error('connection refused'));

    await expect(checkDatabase()).resolves.toEqual({
      ok: false,
      error: 'connection refused',
    });
  });
});
