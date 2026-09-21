import { Request, Response, NextFunction } from 'express';
import { unauthorized } from '../errors/httpError';

// Gate for endpoints marked `auth` in api_design.md. A valid session is one that
// carries a userId (set on login/register). Missing → 401 "Not authenticated"
// (no valid session), distinct from the 403 an owner check raises later.
//
// Every step-3+ gated route imports this. It only proves *who* the caller is;
// ownership (`403`) is a separate, per-resource check in the handler.
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (req.session.userId) {
    next();
    return;
  }
  next(unauthorized('Not authenticated'));
}
