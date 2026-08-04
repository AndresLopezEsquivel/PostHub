import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { handlers } from './msw/handlers';

// The integration project's stand-in for the outside world, and the reason this
// layer earns the name: MSW intercepts at the network layer, so the REAL
// src/api/client.ts runs — its URL building, its credentials, its error-envelope
// mapping. That is the same parity supertest buys backend/tests/integration
// against posthub_test, rather than asserting against a mocked module.

export const server = setupServer(...handlers);

beforeAll(() => {
  // 'error' rather than 'warn': a request nobody wrote a handler for is a test
  // reaching for the network, and it should fail loudly instead of hanging or
  // quietly returning nothing.
  server.listen({ onUnhandledRequest: 'error' });
});

// Drop per-test server.use() overrides so tests stay independent — the analogue
// of the backend harness truncating its tables between tests.
afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
