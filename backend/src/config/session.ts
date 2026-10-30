import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from '../db/pool';
import { env } from './env';

// Sessions live in the `session` table. The store reuses the app's pool instead
// of opening its own, and createTableIfMissing is false because migration
// 011_session.sql creates the table.
const PgStore = connectPgSimple(session);

const isProduction = env.nodeEnv === 'production';

export const sessionMiddleware = session({
  store: new PgStore({
    pool,
    createTableIfMissing: false,
  }),
  name: 'posthub.sid',
  secret: env.sessionSecret,
  // Both default to true. With false, an unchanged session is not rewritten on
  // every request, and a session is stored only once login or registration sets
  // req.session.userId, so anonymous visitors create no rows.
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true, // not readable from JS, which limits XSS cookie theft
    sameSite: 'lax', // sent on top-level navigations, blocks cross-site POSTs
    secure: isProduction, // HTTPS-only in prod; off locally where there's no TLS
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
  },
});
