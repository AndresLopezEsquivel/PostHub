import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',

  // TLS to the database. Off for local Compose Postgres (which doesn't speak
  // it); on for managed databases like RDS that require it. Set DATABASE_SSL=true
  // in those environments, or pass ?sslmode=require in DATABASE_URL and mirror
  // it here.
  databaseSsl: process.env.DATABASE_SSL === 'true',

  // Signs the session cookie. The fallback is a THROWAWAY for local dev only —
  // same rationale as the committed posthub/posthub DB creds: it unlocks nothing
  // real. When deployment gets real, set a strong SESSION_SECRET from a
  // git-ignored .env (see CLAUDE.md); rotating it invalidates all sessions.
  sessionSecret: process.env.SESSION_SECRET || 'dev-insecure-secret',

  // S3 uploads (POST /api/uploads/presign). Absent in local dev → the endpoint
  // answers 503 and the feature stays dormant (imageKey/avatar_key are nullable,
  // so posts and profiles work without it). Set all four when an S3 bucket + IAM
  // creds are ready (see CLAUDE.md deployment note). Presigning is a purely local
  // signature, so throwaway values are enough to exercise the endpoint offline.
  s3Bucket: process.env.S3_BUCKET || '',
  awsRegion: process.env.AWS_REGION || '',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  uploadTtl: Number(process.env.UPLOAD_URL_TTL) || 300,
};
