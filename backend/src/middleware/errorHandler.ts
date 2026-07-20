import { Request, Response, NextFunction } from 'express';

// Generic fallback only — field-level validation errors and per-case
// status codes are added alongside the handlers that produce them.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);
  res.status(500).json({ error: { message: 'Internal server error' } });
}
