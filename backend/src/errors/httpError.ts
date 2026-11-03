// A typed error carrying the HTTP status (and optional field) to return.
// Handlers throw these for expected failures, such as a taken username, bad
// credentials or a write by a non-owner, and errorHandler renders them into
// the shared `{ error: { message, field? } }` envelope. Express 5 forwards a
// rejected async handler to errorHandler, so throwing is enough: no try/catch
// and no manual res.status.
//
// Any other error that reaches errorHandler is treated as a bug and becomes a
// generic 500, so the status a client sees is always a deliberate choice,
// never taken from a raw exception.
export class HttpError extends Error {
  readonly status: number;
  readonly field?: string;

  constructor(status: number, message: string, field?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.field = field;
  }
}

// Thin constructors for the statuses this codebase produces, so call sites read
// as intent (`throw badRequest(...)`) rather than magic numbers.
export const badRequest = (message: string, field?: string): HttpError =>
  new HttpError(400, message, field);

export const unauthorized = (message: string): HttpError =>
  new HttpError(401, message);

export const forbidden = (message: string): HttpError =>
  new HttpError(403, message);

export const notFound = (message: string): HttpError =>
  new HttpError(404, message);

export const conflict = (message: string, field?: string): HttpError =>
  new HttpError(409, message, field);

// The uploads endpoint is dormant until its S3 env is configured; until then it
// answers 503 rather than 500, since an unconfigured optional feature is an
// expected state, not a bug.
export const serviceUnavailable = (message: string): HttpError =>
  new HttpError(503, message);
