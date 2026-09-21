import { describe, it, expect, vi, afterEach } from 'vitest';
import { pool } from './pool';
import { checkDatabase } from './health';

// Unit test: no database. Spy on the pool's query so checkDatabase's two
// branches are exercised in isolation. Constructing the pool opens no
// connection, and the spy intercepts the only call, so nothing here touches
// Postgres — this is the fast, DB-free layer.
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
