import { http, HttpResponse } from 'msw';

// Default handlers for the integration project. One resource group is added here
// per pass, mirroring how backend/tests/integration grew a file per controller
// group — so this is the frontend's stand-in for the posthub_test database.
//
// Paths are written with a leading '*' so they match whatever origin jsdom is
// serving from. Client code only ever requests the relative '/api/...' path.
//
// Shapes are transcribed from docs/api_design.md. Keep them exact: a handler that
// returns a shape the real API never would turns a passing test into a lie.

// The anonymous default. GET /api/auth/session answers 401 when there is no
// session — deliberately, so the client's "am I logged in" check and its error
// handling share one path. Individual tests override this with server.use().
export const handlers = [
  http.get('*/api/auth/session', () =>
    HttpResponse.json({ error: { message: 'Not authenticated' } }, { status: 401 }),
  ),
];

// Convenience override for the authenticated case.
export function sessionHandler(user: { username: string; email: string }) {
  return http.get('*/api/auth/session', () => HttpResponse.json(user));
}
