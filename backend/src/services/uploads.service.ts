import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { badRequest, serviceUnavailable } from '../errors/httpError';

// Creates a presigned S3 PUT URL, so the browser uploads the image straight to
// S3 and the API only receives the key. The signature is computed locally, so
// tests can sign offline with throwaway keys.

export interface PresignInput {
  contentType: unknown;
  purpose: unknown;
}

export interface PresignResult {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

// Separate posts/ and avatars/ prefixes let a bucket policy or lifecycle rule
// target one without the other.
const PREFIXES: Record<string, string> = { post: 'posts', avatar: 'avatars' };

// Allowed image types and their file extensions. Anything else is rejected
// before a URL is signed.
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// Needs only a bucket and a region. Credentials aren't required: on EC2 they
// come from the instance role, so AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
// are unset there. If the bucket or region is missing, the endpoint returns 503.
function isConfigured(): boolean {
  return Boolean(env.s3Bucket && env.awsRegion);
}

// Built on first use. Static keys are passed only when both are set (local
// signing with throwaway keys). Otherwise the SDK's default credential chain
// finds the EC2 instance role through instance metadata.
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

  // Only the host header is signed, so S3 doesn't enforce this ContentType on
  // the client's PUT.
  const command = new PutObjectCommand({
    Bucket: env.s3Bucket,
    Key: key,
    ContentType: String(input.contentType),
  });
  const uploadUrl = await getSignedUrl(s3(), command, { expiresIn: env.uploadTtl });

  return { uploadUrl, key, expiresIn: env.uploadTtl };
}
