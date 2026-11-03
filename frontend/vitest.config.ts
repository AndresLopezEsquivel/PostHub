import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Two projects with different needs:
//
//  - unit: src/**/*.test.{ts,tsx}, next to the code. Dependencies are mocked
//    and no network is used.
//  - integration: tests/integration/**. Renders the real router against MSW
//    handlers (see tests/setup.ts).
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
