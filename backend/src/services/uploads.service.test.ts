import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';

// Unit test: no database, no real AWS. The config module is mocked with a mutable
// object so each test controls whether uploads are "configured". The signer runs
// for real — presigning is a purely local computation — with throwaway creds, so
// we assert the URL's *structure* (the signature embeds a live X-Amz-Date, so no
// exact string is possible).
vi.mock('../config/env', () => ({
  env: {
    s3Bucket: '',
    awsRegion: '',
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    uploadTtl: 300,
  },
}));

import { env } from '../config/env';
import { createUploadUrl } from './uploads.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function setConfigured(): void {
  env.s3Bucket = 'posthub-uploads';
  env.awsRegion = 'us-east-1';
  env.awsAccessKeyId = 'AKIATESTTESTTEST';
  env.awsSecretAccessKey = 'throwaway-secret-for-offline-signing';
  env.uploadTtl = 300;
}

describe('createUploadUrl', () => {
  beforeEach(setConfigured);

  it('returns 503 when uploads are not configured, regardless of the body', async () => {
    env.s3Bucket = '';
    env.awsRegion = '';
    env.awsAccessKeyId = '';
    env.awsSecretAccessKey = '';

    await expect(
      createUploadUrl({ contentType: 'image/jpeg', purpose: 'post' }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('rejects an unknown purpose with 400 on the purpose field', async () => {
    await expect(
      createUploadUrl({ contentType: 'image/jpeg', purpose: 'banner' }),
    ).rejects.toMatchObject({ status: 400, field: 'purpose' });
  });

  it('rejects an unsupported content type with 400 on the contentType field', async () => {
    await expect(
      createUploadUrl({ contentType: 'image/tiff', purpose: 'post' }),
    ).rejects.toMatchObject({ status: 400, field: 'contentType' });
  });

  it('rejects a missing body with 400', async () => {
    await expect(
      createUploadUrl({ contentType: undefined, purpose: undefined }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('signs a post upload: posts/ prefix, uuid.jpg key, and a real presigned URL', async () => {
    const { uploadUrl, key, expiresIn } = await createUploadUrl({
      contentType: 'image/jpeg',
      purpose: 'post',
    });

    const [prefix, filename] = key.split('/');
    expect(prefix).toBe('posts');
    expect(filename.endsWith('.jpg')).toBe(true);
    expect(filename.replace(/\.jpg$/, '')).toMatch(UUID);

    expect(uploadUrl).toContain('posthub-uploads');
    expect(uploadUrl).toContain(key);
    expect(uploadUrl).toContain('X-Amz-Signature=');
    expect(uploadUrl).toContain('X-Amz-Expires=300');
    expect(expiresIn).toBe(300);
  });

  it('signs an avatar upload under the avatars/ prefix with the mapped extension', async () => {
    const { key } = await createUploadUrl({ contentType: 'image/png', purpose: 'avatar' });
    const [prefix, filename] = key.split('/');
    expect(prefix).toBe('avatars');
    expect(filename.endsWith('.png')).toBe(true);
    expect(filename.replace(/\.png$/, '')).toMatch(UUID);
  });

  // Kept LAST on purpose: the S3 client is memoized on first use, so the signing
  // tests above build (and cache) it with the throwaway static creds. This case then
  // clears the static keys to prove the config gate no longer 503s on their absence —
  // the deployed stack supplies credentials via an EC2 instance role instead. It only
  // asserts the gate is passed (never a 503), not that signing completes; full
  // role-based signing is verified in deployment.
  it('passes the config gate with bucket+region only (instance-role path)', async () => {
    env.s3Bucket = 'posthub-uploads';
    env.awsRegion = 'us-east-1';
    env.awsAccessKeyId = '';
    env.awsSecretAccessKey = '';

    let was503 = false;
    try {
      await createUploadUrl({ contentType: 'image/jpeg', purpose: 'post' });
    } catch (err) {
      was503 = (err as { status?: number }).status === 503;
    }
    expect(was503).toBe(false);
  });
});
