import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app';

// POST/GET /api/auth/* — driven through the real session cookie. request.agent
// persists Set-Cookie across calls, so a register/session/logout sequence on one
// agent proves the whole round-trip; plain request(app) calls carry no cookie.
const creds = { username: 'neo', email: 'neo@example.com', password: 'trinity123' };

describe('POST /api/auth/register', () => {
  it('creates a user, opens a session, and returns only username/email', async () => {
    const res = await request(app).post('/api/auth/register').send(creds);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ username: 'neo', email: 'neo@example.com' });
    expect(res.body).not.toHaveProperty('password_hash');
    expect(res.headers['set-cookie']).toBeDefined(); // session cookie issued
  });

  it('returns 409 on a duplicate username', async () => {
    await request(app).post('/api/auth/register').send(creds);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...creds, email: 'other@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ field: 'username' });
  });

  it('returns 409 on a duplicate email', async () => {
    await request(app).post('/api/auth/register').send(creds);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...creds, username: 'trinity' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ field: 'email' });
  });

  it('returns 400 with the offending field on invalid input', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...creds, password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ field: 'password' });
  });
});

describe('POST /api/auth/login', () => {
  it('returns 200 for correct credentials', async () => {
    await request(app).post('/api/auth/register').send(creds);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: creds.email, password: creds.password });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: 'neo', email: 'neo@example.com' });
  });

  it('returns 401 Invalid credentials for a wrong password', async () => {
    await request(app).post('/api/auth/register').send(creds);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: creds.email, password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { message: 'Invalid credentials' } });
  });

  it('returns 401 for an unknown email (no user enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'trinity123' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { message: 'Invalid credentials' } });
  });
});

describe('session lifecycle (one agent, cookie persisted)', () => {
  it('register → session 200 → logout 204 → session 401', async () => {
    const agent = request.agent(app);

    const registered = await agent.post('/api/auth/register').send(creds);
    expect(registered.status).toBe(201);

    const session = await agent.get('/api/auth/session');
    expect(session.status).toBe(200);
    expect(session.body).toEqual({ username: 'neo', email: 'neo@example.com' });

    const loggedOut = await agent.post('/api/auth/logout');
    expect(loggedOut.status).toBe(204);

    const afterLogout = await agent.get('/api/auth/session');
    expect(afterLogout.status).toBe(401);
  });
});

describe('unauthenticated access', () => {
  it('GET /api/auth/session returns 401 with no cookie', async () => {
    const res = await request(app).get('/api/auth/session');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { message: 'Not authenticated' } });
  });

  it('POST /api/auth/logout returns 401 with no session (requireAuth)', async () => {
    const res = await request(app).post('/api/auth/logout');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { message: 'Not authenticated' } });
  });
});
