import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { errorHandler } from './errorHandler';
import { HttpError } from '../errors/httpError';

// Unit test: the error → envelope mapping in isolation, with a minimal fake
// Response recording status()/json(). No app, no HTTP.
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

const req = {} as Request;
const next = vi.fn();

describe('errorHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an HttpError with a field into the shared envelope', () => {
    const res = fakeRes();
    errorHandler(new HttpError(409, 'Username already taken', 'username'), req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      error: { message: 'Username already taken', field: 'username' },
    });
  });

  it('omits the field key when the HttpError has none', () => {
    const res = fakeRes();
    errorHandler(new HttpError(401, 'Not authenticated'), req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: { message: 'Not authenticated' } });
  });

  it('falls back to a generic 500 for a non-HttpError, leaking nothing', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = fakeRes();

    errorHandler(new Error('secret internal detail'), req, res, next);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: { message: 'Internal server error' } });
    expect(consoleSpy).toHaveBeenCalled(); // the real error is logged, not sent
  });
});
