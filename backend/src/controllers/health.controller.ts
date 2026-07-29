import { Request, Response } from 'express';
import { checkDatabase } from '../db/health';

// GET /api/health — a readiness probe for deployment and monitoring.
//
// `status: 'ok'` reports that the process is alive and responding; `database`
// reports whether the pool can reach Postgres. When the database is
// unreachable we answer 503 (not 200) so a load balancer or orchestrator pulls
// this instance out of rotation. The underlying error string is logged inside
// checkDatabase but never returned — the probe body stays a fixed shape.
export async function healthCheck(_req: Request, res: Response): Promise<void> {
  const db = await checkDatabase();
  if (db.ok) {
    res.status(200).json({ status: 'ok', database: 'ok' });
  } else {
    res.status(503).json({ status: 'ok', database: 'error' });
  }
}
