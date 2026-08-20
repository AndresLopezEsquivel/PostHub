import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app';

// Uploads — the presign endpoint driven through the real app. Throwaway S3 creds
// are injected via vitest.config's integration `env`, so the endpoint is
// "configured" and the SDK signs a real (offline) URL; no bucket is contacted.
// The 503-when-unconfigured path is covered by the unit test, since flipping the
// config off is only controllable there.

async function registerAgent(creds: {
  username: string;
  email: string;
  password: string;
}): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send(creds);
  expect(res.status).toBe(201);
  return agent;
}

const uploader = { username: 'uploader', email: 'uploader@example.com', password: 'uploaderpass1' };

describe('POST /api/uploads/presign', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app)
      .post('/api/uploads/presign')
      .send({ contentType: 'image/jpeg', purpose: 'post' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { message: 'Not authenticated' } });
  });

  it('returns a presigned URL and key for a logged-in user', async () => {
    const agent = await registerAgent(uploader);

    const res = await agent
      .post('/api/uploads/presign')
      .send({ contentType: 'image/jpeg', purpose: 'post' });

    expect(res.status).toBe(200);
    expect(res.body.key).toMatch(/^posts\/[0-9a-f-]{36}\.jpg$/);
    expect(res.body.uploadUrl).toContain('X-Amz-Signature=');
    expect(res.body.uploadUrl).toContain(res.body.key);
    expect(res.body.expiresIn).toBe(300);
  });

  it('signs an avatar upload under the avatars/ prefix', async () => {
    const agent = await registerAgent(uploader);

    const res = await agent
      .post('/api/uploads/presign')
      .send({ contentType: 'image/png', purpose: 'avatar' });

    expect(res.status).toBe(200);
    expect(res.body.key).toMatch(/^avatars\/[0-9a-f-]{36}\.png$/);
  });

  it('rejects an unknown purpose with 400', async () => {
    const agent = await registerAgent(uploader);

    const res = await agent
      .post('/api/uploads/presign')
      .send({ contentType: 'image/jpeg', purpose: 'banner' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ field: 'purpose' });
  });

  it('rejects an unsupported content type with 400', async () => {
    const agent = await registerAgent(uploader);

    const res = await agent
      .post('/api/uploads/presign')
      .send({ contentType: 'image/tiff', purpose: 'post' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ field: 'contentType' });
  });
});
