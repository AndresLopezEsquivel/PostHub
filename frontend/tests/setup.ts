import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { handlers } from './msw/handlers';

// MSW intercepts requests at the network layer, so the real
// src/api/client.ts runs (URL building, credentials, error mapping) instead
// of a mocked module.

export const server = setupServer(...handlers);

beforeAll(() => {
  // 'error' rather than 'warn': a request nobody wrote a handler for is a test
  // reaching for the network, and it should fail loudly instead of hanging or
  // quietly returning nothing.
  server.listen({ onUnhandledRequest: 'error' });
  // jsdom implements neither; ImageUploadField creates/revokes a preview object URL.
  URL.createObjectURL = () => 'blob:preview';
  URL.revokeObjectURL = () => {};
});

// Drop per-test server.use() overrides so tests stay independent.
afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
