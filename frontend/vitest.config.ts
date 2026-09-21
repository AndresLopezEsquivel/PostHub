import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Two projects, mirroring backend/vitest.config.ts, because the suite has two
// layers with different needs:
//
//  - unit: co-located src/**/*.test.{ts,tsx}. Collaborators are mocked — fetch is
//    stubbed, no network is touched. Asserts pure logic and mapping.
//  - integration: tests/integration/**. Renders the REAL composed router against
//    MSW handlers. MSW intercepts at the network layer, so the real
//    src/api/client.ts executes with its real error mapping — the same parity
//    supertest buys the backend against posthub_test.
//
// Run everything with `npm test`; a single layer with `npm run test:unit` /
// `npm run test:integration`.
export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['src/test/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['src/test/setup.ts', 'tests/setup.ts'],
        },
      },
    ],
  },
});
