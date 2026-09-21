import { Pool } from 'pg';
import './types'; // registers pg type parsers — must run before any query
import { env } from '../config/env';

// A single shared pool for the process. pg opens connections lazily, so
// constructing this issues no query and contacts no server.
export const pool = new Pool({
  connectionString: env.databaseUrl,

  // Postgres' own default max_connections is 100, shared across every client.
  // 10 per process leaves room for several API replicas plus psql sessions.
  max: 10,

  // Return idle connections to Postgres rather than holding them open forever.
  idleTimeoutMillis: 30_000,

  // Fail fast when the database is unreachable instead of hanging the request.
  connectionTimeoutMillis: 5_000,

  // RDS requires TLS; local Compose Postgres does not speak it at all.
  // `rejectUnauthorized: false` trusts RDS' certificate without shipping the
  // AWS CA bundle — acceptable inside a VPC, and the point to revisit if the
  // database is ever reachable from outside one.
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
