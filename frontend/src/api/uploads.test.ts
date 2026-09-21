import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { uploadImage } from './uploads';

// uploadImage is the one place the app talks to S3: presign via /api, then a direct
// cross-origin PUT to the signed URL. fetch is stubbed to answer both legs by URL.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fileOf(type: string, bytes = 10): File {
  return new File([new Uint8Array(bytes)], 'pic', { type });
}

// Route the two legs: the presign POST and the S3 PUT.
function stubUpload(putStatus = 200) {
  const spy = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/api/uploads/presign')) {
      return jsonResponse(200, {
        uploadUrl: 'https://s3.test/posts/abc.jpg?X-Amz-Signature=sig',
        key: 'posts/abc.jpg',
        expiresIn: 300,
      });
    }
    if (url.startsWith('https://s3.test/')) {
      expect(init?.method).toBe('PUT');
      return new Response(null, { status: putStatus });
    }
    throw new Error(`unexpected fetch to ${url}`);
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('uploadImage', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('presigns, PUTs the bytes with the file content type, and returns the key', async () => {
    const spy = stubUpload();

    const key = await uploadImage(fileOf('image/jpeg'), 'post');
    expect(key).toBe('posts/abc.jpg');

    // Leg 1: presign carries the content type + purpose.
    const [, presignInit] = spy.mock.calls[0]!;
    expect(presignInit?.body).toBe(
      JSON.stringify({ contentType: 'image/jpeg', purpose: 'post' }),
    );
    // Leg 2: the PUT goes to the signed URL with the matching Content-Type.
    const [putUrl, putInit] = spy.mock.calls[1]!;
    expect(String(putUrl)).toContain('https://s3.test/');
    expect(putInit?.method).toBe('PUT');
    expect((putInit?.headers as Record<string, string>)['Content-Type']).toBe('image/jpeg');
  });

  it('rejects a disallowed type before any network call', async () => {
    const spy = stubUpload();

    await expect(uploadImage(fileOf('image/tiff'), 'post')).rejects.toMatchObject({
      field: 'image',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects an oversize file before any network call', async () => {
    const spy = stubUpload();
    const huge = fileOf('image/png', 6 * 1024 * 1024); // > 5 MB cap

    await expect(uploadImage(huge, 'avatar')).rejects.toMatchObject({ field: 'image' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('surfaces a failed S3 PUT as an ApiError', async () => {
    stubUpload(403);

    await expect(uploadImage(fileOf('image/jpeg'), 'post')).rejects.toMatchObject({
      field: 'image',
    });
  });
});
