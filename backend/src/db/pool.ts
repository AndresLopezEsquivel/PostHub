import { Pool } from 'pg';
import './types'; // registers pg type parsers, so it must run before any query
import { env } from '../config/env';

// pg opens connections lazily, so importing this module contacts no server.
export const pool = new Pool({
  connectionString: env.databaseUrl,

  // max_connections is shared by every client: 100 by default, and on RDS it
  // depends on the instance's memory. 10 per process leaves room for several
  // API replicas plus psql sessions.
  max: 10,

  idleTimeoutMillis: 30_000,

  // Fail fast when the database is unreachable instead of hanging the request.
  connectionTimeoutMillis: 5_000,

  // RDS requires TLS, and the local Compose database does not support it.
  // `rejectUnauthorized: false` accepts RDS's certificate without the AWS CA
  // bundle. That is acceptable while the database is reachable only inside the
  // VPC (infra/rds.tf); revisit it if that ever changes.
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
});

// An idle pooled connection can be killed by the server, a failover, or a
// network blip. Without a listener, pg re-emits that as an uncaught 'error'
// event and takes the whole process down. Log it and let pg discard the client.
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
});

// Scripts (migrate, seed) must call this or the open pool keeps the event loop
// alive and the process never exits.
export async function closePool(): Promise<void> {
  await pool.end();
}
