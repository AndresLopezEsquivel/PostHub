import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from '../db/pool';
import { env } from './env';

// The session middleware, configured once and mounted in app.ts. Sessions are
// persisted in Postgres (the `session` table) via connect-pg-simple, sharing the
// app's existing pool rather than opening a second one.
//
// createTableIfMissing is false ON PURPOSE: the table is provisioned by
// migration 011_session.sql as a deploy step, never created at boot (mirrors the
// project rule that server.ts must not mutate schema — see migrate.ts).
const PgStore = connectPgSimple(session);

const isProduction = env.nodeEnv === 'production';

export const sessionMiddleware = session({
  store: new PgStore({
    pool,
    createTableIfMissing: false,
  }),
  name: 'posthub.sid',
  secret: env.sessionSecret,
  // resave: don't rewrite an unchanged session on every request.
  // saveUninitialized: don't persist empty sessions for anonymous visitors —
  // a row is written only once we set req.session.userId (on login/register).
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true, // not readable from JS — mitigates XSS cookie theft
    sameSite: 'lax', // sent on top-level navigations, blocks cross-site POSTs
    secure: isProduction, // HTTPS-only in prod; off locally where there's no TLS
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
  },
});
