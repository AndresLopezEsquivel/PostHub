import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app';

// Throwaway S3 credentials come from the integration `env` in vitest.config.ts,
// so the endpoint is "configured" and the SDK signs a real URL offline; no
// bucket is contacted. The 503 path for missing config is covered by the unit
// test, since only there can the config be switched off.

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
