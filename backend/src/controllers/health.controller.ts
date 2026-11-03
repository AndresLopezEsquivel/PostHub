import { Request, Response } from 'express';
import { checkDatabase } from '../db/health';

// A readiness probe for deployment and monitoring. `status: 'ok'` means the
// process is responding; `database` reports whether the pool can reach
// Postgres. An unreachable database returns 503, not 200, so a load balancer
// takes this instance out of rotation. The error string from checkDatabase
// is not returned, so the body always has the same shape.
export async function healthCheck(_req: Request, res: Response): Promise<void> {
  const db = await checkDatabase();
  if (db.ok) {
    res.status(200).json({ status: 'ok', database: 'ok' });
  } else {
    res.status(503).json({ status: 'ok', database: 'error' });
  }
}
