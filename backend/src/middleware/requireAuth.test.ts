import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { requireAuth } from './requireAuth';
import { HttpError } from '../errors/httpError';

// Unit test with no session middleware. req.session is faked; the test only
// checks that a userId decides whether next() gets an error.
const res = {} as Response;

describe('requireAuth', () => {
  it('calls next with no error when the session carries a userId', () => {
    const req = { session: { userId: 42 } } as unknown as Request;
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // no argument = pass through
  });

  it('forwards a 401 HttpError when there is no userId', () => {
    const req = { session: {} } as unknown as Request;
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 401, message: 'Not authenticated' });
  });
});
