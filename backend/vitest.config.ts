import { defineConfig } from 'vitest/config';

// Two projects, because the suite has two layers with different needs:
//
//  - unit: fast, DB-free. Collaborators (the db/query helpers, the pool) are
//    mocked; tests assert pure logic and row → API-shape mapping. No global
//    setup, so these never open a connection.
//  - integration: the real Express app driven with supertest against the
//    posthub_test database. A setup file resets the schema between tests, and
//    files run serially (one shared database — parallel suites would race each
//    other's TRUNCATE). Serialization is enforced with a single fork
//    (poolOptions.forks.singleFork): all integration files share one worker
//    process and run one after another. `fileParallelism: false` alone is not
//    honored when set inside a projects[] entry, so it can't be relied on here.
//
// Run everything with `npm test`; a single layer with `npm run test:unit` /
// `npm run test:integration`.
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          // Throwaway S3 config so the uploads endpoint is "configured" and can
          // sign offline (presigning is a purely local computation — no AWS is
          // contacted). Same spirit as the committed dev DB creds: these unlock
          // nothing real. Present here at module load, before app.ts imports env.
          env: {
            S3_BUCKET: 'posthub-test-bucket',
            AWS_REGION: 'us-east-1',
            AWS_ACCESS_KEY_ID: 'test',
            AWS_SECRET_ACCESS_KEY: 'test',
          },
          setupFiles: ['tests/setup.ts'],
          pool: 'forks',
          poolOptions: {
            forks: { singleFork: true },
          },
        },
      },
    ],
  },
});
