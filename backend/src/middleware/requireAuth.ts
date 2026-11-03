import { Request, Response, NextFunction } from 'express';
import { unauthorized } from '../errors/httpError';

// A valid session is one that carries a userId (set on login or register).
// Without one the request gets a 401 "Not authenticated". This only proves
// who the caller is; ownership (403) is a separate check in each service.
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (req.session.userId) {
    next();
    return;
  }
  next(unauthorized('Not authenticated'));
}
