import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { badRequest, serviceUnavailable } from '../errors/httpError';

// Uploads: mints a presigned S3 PUT URL so the client uploads image bytes
// straight to S3, then sends us only the returned key (imageKey/avatar_key).
// Like the other services this holds no req/res/session. Presigning is a purely
// local HMAC computation — no network call to AWS happens here — so this is
// fully exercisable offline with throwaway credentials; only the client's later
// PUT needs a real bucket.

export interface PresignInput {
  contentType: unknown;
  purpose: unknown;
}

export interface PresignResult {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

// purpose → key prefix. Segregating posts/ and avatars/ keeps a bucket policy or
// lifecycle rule able to target one without the other.
const PREFIXES: Record<string, string> = { post: 'posts', avatar: 'avatars' };

// The image MIME allowlist → file extension. Only browser-uploadable image types;
// anything else is rejected before a URL is ever signed.
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// The minimum to sign: a bucket and a region. Credentials are intentionally NOT
// required here — the deployed stack authenticates via an EC2 instance role, so the
// AWS_* key pair is absent by design. When both are missing the feature is dormant
// and the endpoint answers 503.
function isConfigured(): boolean {
  return Boolean(env.s3Bucket && env.awsRegion);
}

// Lazily memoized client, constructed after the config gate. Explicit credentials
// are passed ONLY when both static keys are present (local/offline signing with
// throwaway creds); otherwise the client is built with region alone and the SDK's
// default credential provider chain resolves the EC2 instance role from instance
// metadata.
let client: S3Client | null = null;
function s3(): S3Client {
  if (!client) {
    const hasStaticCreds = Boolean(env.awsAccessKeyId && env.awsSecretAccessKey);
    client = new S3Client({
      region: env.awsRegion,
      ...(hasStaticCreds
        ? {
            credentials: {
              accessKeyId: env.awsAccessKeyId,
              secretAccessKey: env.awsSecretAccessKey,
            },
          }
        : {}),
    });
  }
  return client;
}

export async function createUploadUrl(input: PresignInput): Promise<PresignResult> {
  // Config gate first: a dormant feature answers 503 regardless of the body.
  if (!isConfigured()) {
    throw serviceUnavailable('Uploads are not configured');
  }

  const prefix = PREFIXES[String(input.purpose)];
  if (!prefix) {
    throw badRequest('purpose must be "post" or "avatar"', 'purpose');
  }

  const ext = EXTENSIONS[String(input.contentType)];
  if (!ext) {
    throw badRequest('Unsupported content type', 'contentType');
  }

  // Opaque, collision-free, prefix-segregated key. The client never chooses it.
  const key = `${prefix}/${randomUUID()}.${ext}`;

  // Pinning ContentType into the signature means the client's later PUT must send
  // the same Content-Type header, or S3 rejects the signature.
  const command = new PutObjectCommand({
    Bucket: env.s3Bucket,
    Key: key,
    ContentType: String(input.contentType),
  });
  const uploadUrl = await getSignedUrl(s3(), command, { expiresIn: env.uploadTtl });

  return { uploadUrl, key, expiresIn: env.uploadTtl };
}
