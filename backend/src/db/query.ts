import { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { pool } from './pool';

// The interface every service will use to talk to the database.
//
// Params are always passed as the second argument, never interpolated into the
// SQL string. That is the whole point: `$1, $2` placeholders let Postgres treat
// values as data, closing off SQL injection. Building SQL with template strings
// is the one thing not to do here.

// Raw escape hatch — full QueryResult when you need rowCount, command, etc.
export function query<T extends QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return pool.query<T>(sql, params);
}

// The common case: give me the rows.
export async function queryMany<T extends QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await pool.query<T>(sql, params);
  return result.rows;
}

// Fetch a single row, or null if the query matched nothing. Use for lookups by
// primary key or another unique column.
export async function queryOne<T extends QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const result = await pool.query<T>(sql, params);
  return result.rows[0] ?? null;
}

// Run several statements atomically on one connection. Checks out a client,
// BEGIN, runs `fn`, COMMIT; on any throw it ROLLBACKs and re-throws; the client
// is released in every path. Reach for this whenever a single logical operation
// spans more than one statement — creating a post and attaching its categories,
// inserting a like and its notification — so a mid-sequence failure leaves no
// half-written state.
export async function withTransaction<T>(
  fn: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
