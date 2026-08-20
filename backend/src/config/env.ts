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
  // so posts and profiles work without it). The minimum to sign is S3_BUCKET +
  // AWS_REGION; the AWS_* key pair is OPTIONAL — omit both to use an EC2 instance
  // role (the SDK's default credential chain resolves it from instance metadata),
  // which is how the deployed stack runs. Presigning is a purely local signature,
  // so throwaway values are enough to exercise the endpoint offline.
  s3Bucket: process.env.S3_BUCKET || '',
  awsRegion: process.env.AWS_REGION || '',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  uploadTtl: Number(process.env.UPLOAD_URL_TTL) || 300,

  // Public read base for stored keys → a browser-loadable URL. This is the
  // CloudFront distribution domain (the bucket itself is private behind OAC), e.g.
  // https://d1234.cloudfront.net. INDEPENDENT of the presign vars above: unset →
  // avatarUrl/imageUrl resolve to null and no image renders, set → key becomes
  // `${base}/${key}`. See keyToPublicUrl in posts.service.ts.
  s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL || '',
};
