import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app';

// GET /api/health — the DB-backed readiness probe. Against posthub_test the
// database is up, so this proves the happy path end to end (the 503-on-down
// branch is covered by the controller unit test, which mocks checkDatabase).
describe('GET /api/health', () => {
  it('returns 200 with status and database ok when the database is reachable', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok' });
  });
});
