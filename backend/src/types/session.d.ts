import 'express-session';

// Module augmentation: teach TypeScript what we store in the session. The whole
// app keeps exactly one field — the authenticated user's id — and every gated
// handler reads it through req.session.userId. Optional because a fresh,
// anonymous session has none set yet.
declare module 'express-session' {
  interface SessionData {
    userId?: number;
  }
}
