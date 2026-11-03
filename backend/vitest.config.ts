import { defineConfig } from 'vitest/config';

// Two projects, because the suite has two layers with different needs:
//
//  - unit: fast and DB-free. Collaborators (the db/query helpers, the pool)
//    are mocked; tests check pure logic and the mapping from rows to API
//    shapes. There's no global setup, so these never open a connection.
//  - integration: the real Express app driven with supertest against the
//    posthub_test database. A setup file clears the data between tests, and
//    files run one at a time because they share one database, so parallel
//    files would race each other's TRUNCATE. A single fork
//    (poolOptions.forks.singleFork) enforces this: all integration files share
//    one worker process. `fileParallelism: false` is not honored inside a
//    projects[] entry, so it can't be relied on here.
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
          // sign offline: presigning is a purely local computation, and no AWS
          // service is contacted. Like the committed dev DB credentials, these
          // unlock nothing real. They are set here so they exist at module
          // load, before app.ts imports env.
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
