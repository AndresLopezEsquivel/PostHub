import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',

  // On for RDS, which requires TLS (docker-compose.prod.yml sets it), and off for
  // the local Compose database. Do not add ?sslmode=require to DATABASE_URL: pg
  // would replace the ssl setting in pool.ts and verify RDS's certificate, which
  // fails without the AWS CA bundle.
  databaseSsl: process.env.DATABASE_SSL === 'true',

  // Signs the session cookie. The fallback is for local development only, and
  // docker-compose.prod.yml requires a real value. Changing it signs every user
  // out, because existing cookies no longer verify.
  sessionSecret: process.env.SESSION_SECRET || 'dev-insecure-secret',

  // Without S3_BUCKET and AWS_REGION, POST /api/uploads/presign answers 503, and
  // posts and profiles still work, without images. The AWS key pair is optional:
  // with both unset, the SDK uses the EC2 instance role, as in production.
  // Presigning is computed locally, so placeholder values are enough to try the
  // endpoint offline.
  s3Bucket: process.env.S3_BUCKET || '',
  awsRegion: process.env.AWS_REGION || '',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  uploadTtl: Number(process.env.UPLOAD_URL_TTL) || 300,

  // The CloudFront domain that serves uploaded images (the bucket is private),
  // e.g. https://d1234.cloudfront.net. It is independent of the S3 settings
  // above: while it is unset, image URLs are null. See keyToPublicUrl in
  // posts.service.ts.
  s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL || '',
};
