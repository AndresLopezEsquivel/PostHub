// Named checks for the PostgreSQL error codes the app handles, so services do
// not compare against bare codes like '23503'. The codes are listed at
// https://www.postgresql.org/docs/current/errcodes-appendix.html

function pgCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

export function isForeignKeyViolation(err: unknown): boolean {
  return pgCode(err) === '23503';
}

export function isUniqueViolation(err: unknown): boolean {
  return pgCode(err) === '23505';
}
