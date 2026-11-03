import { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { pool } from './pool';

// Values always go in `params`, never into the SQL string. With $1, $2
// placeholders, PostgreSQL receives them separately and treats them as data, so
// they cannot inject SQL. Template strings may only assemble fixed SQL fragments
// and placeholder names.

// Returns the full QueryResult, for callers that need rowCount.
export function query<T extends QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return pool.query<T>(sql, params);
}

export async function queryMany<T extends QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await pool.query<T>(sql, params);
  return result.rows;
}

// Returns only the first row, so use it for lookups by a unique column.
export async function queryOne<T extends QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const result = await pool.query<T>(sql, params);
  return result.rows[0] ?? null;
}

// For any operation that takes several statements, such as inserting a like and
// its notification, so a failure halfway leaves nothing half-written. Every
// statement must go through `tx`: query() would take another connection and run
// outside the transaction.
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
