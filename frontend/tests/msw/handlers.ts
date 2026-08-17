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

  // POST /api/auth/register — echoes the submitted username/email back as the
  // PublicUser the real API returns (201, session opened server-side). Tests that
  // exercise the taken-username/email branch override this with registerConflict.
  http.post('*/api/auth/register', async ({ request }) => {
    const body = (await request.json()) as { username: string; email: string };
    return HttpResponse.json({ username: body.username, email: body.email }, { status: 201 });
  }),

  // POST /api/auth/login — succeeds by default; loginInvalid overrides for the
  // wrong-credentials path.
  http.post('*/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email: string };
    return HttpResponse.json({ username: 'andres', email: body.email });
  }),

  // POST /api/auth/logout — 204, no body.
  http.post('*/api/auth/logout', () => new HttpResponse(null, { status: 204 })),
];

// Convenience override for the authenticated case.
export function sessionHandler(user: { username: string; email: string }) {
  return http.get('*/api/auth/session', () => HttpResponse.json(user));
}

// A taken username/email: the backend maps the 23505 unique violation to a 409
// carrying the offending field (see auth.service.ts registerUser).
export function registerConflict(field: 'username' | 'email', message: string) {
  return http.post('*/api/auth/register', () =>
    HttpResponse.json({ error: { message, field } }, { status: 409 }),
  );
}

// Wrong credentials: one 401 with no field, so the client renders it form-level.
export function loginInvalid() {
  return http.post('*/api/auth/login', () =>
    HttpResponse.json({ error: { message: 'Invalid credentials' } }, { status: 401 }),
  );
}
