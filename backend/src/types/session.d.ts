import 'express-session';

// Module augmentation that tells TypeScript what the session stores: only the
// logged-in user's id. It's optional because a new, anonymous session doesn't
// have one yet.
declare module 'express-session' {
  interface SessionData {
    userId?: number;
  }
}
