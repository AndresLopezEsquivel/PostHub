import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../errors/httpError';

// The single place that turns a thrown error into the shared response envelope.
//
// An HttpError gets its own status, with `field` only when set (validation and
// conflict errors carry it; 401/403/404 usually don't). Anything else is
// treated as a bug: log it and return a generic 500 that leaks no internals.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: {
        message: err.message,
        ...(err.field ? { field: err.field } : {}),
      },
    });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { message: 'Internal server error' } });
}
