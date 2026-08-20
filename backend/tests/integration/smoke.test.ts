import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { query } from '../../src/db/query';
import { seedUser } from '../helpers/db';

// Smoke test for the integration harness itself: it proves the three things
// every later pass relies on — supertest can drive the real app and see the
// shared error envelope, the suite runs against the isolated posthub_test
// database with a clean slate per test, and the int8 parser is in effect.
describe('integration harness', () => {
  it('unmatched routes return the shared 404 envelope', async () => {
    // A path no resource router will ever own, so this stays 404 as handlers
    // land pass by pass — it exercises the catch-all notFoundHandler, not any
    // particular endpoint's absence.
    const res = await request(app).get('/api/no-such-route');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: 'Not found' } });
  });

  it('runs against an isolated, freshly-reset test database', async () => {
    await seedUser({ username: 'alice', email: 'alice@example.com' });

    const { count } = (
      await query<{ count: number }>('SELECT COUNT(*) AS count FROM users')
    ).rows[0];

    // Exactly one: resetDb() in beforeEach gave us an empty table, and we
    // inserted a single user. If isolation were broken this would drift.
    expect(count).toBe(1);
    // int8 (COUNT) comes back as a JS number, not the string "1", because
    // src/db/types.ts registered the parser. Every derived count depends on it.
    expect(typeof count).toBe('number');
  });
});
