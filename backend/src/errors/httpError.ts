// A typed error carrying the HTTP status (and optional field) a handler wants to
// return. Handlers `throw` these for expected failures — a taken username, bad
// credentials, a non-owner write — and errorHandler renders them into the shared
// `{ error: { message, field? } }` envelope. Express 5 auto-forwards a rejected
// async handler to errorHandler, so throwing one of these from a controller or
// service is all that's needed; no try/catch, no manual res.status.
//
// Anything that is NOT an HttpError reaching errorHandler is an unexpected bug
// and becomes a generic 500 — the status here is a deliberate, safe-to-expose
// choice, never leaked from a raw exception.
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
