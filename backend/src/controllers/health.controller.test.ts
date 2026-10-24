import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { healthCheck } from './health.controller';
import * as health from '../db/health';

// Unit test: no database. checkDatabase is mocked so the controller's only real
// logic — the 200-vs-503 status branch — is exercised in isolation with a
// minimal fake Response that records what status()/json() were called with.
function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as typeof res & Response;
}

describe('healthCheck controller', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('responds 200 with database: ok when the check passes', async () => {
    vi.spyOn(health, 'checkDatabase').mockResolvedValue({ ok: true });
    const res = fakeRes();

    await healthCheck({} as Request, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok' });
  });

  it('responds 503 with database: error when the check fails', async () => {
    vi.spyOn(health, 'checkDatabase').mockResolvedValue({
      ok: false,
      error: 'connection refused',
    });
    const res = fakeRes();

    await healthCheck({} as Request, res);

    expect(res.statusCode).toBe(503);
    // The underlying error string is never leaked into the body.
    expect(res.body).toEqual({ status: 'ok', database: 'error' });
  });
});
