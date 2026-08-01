// Narrow predicates over the PostgreSQL error codes the app branches on. Keeping
// the raw SQLSTATE strings in one place documents what each means at the call
// site (a bare `'23503'` in a handler is opaque).
// https://www.postgresql.org/docs/current/errcodes-appendix.html

function pgCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

// 23503 foreign_key_violation — e.g. a categoryId or post_id that doesn't exist.
export function isForeignKeyViolation(err: unknown): boolean {
  return pgCode(err) === '23503';
}
