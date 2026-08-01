import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { seedUser, seedPost, seedFollow } from '../helpers/db';

// Users + follows — the public profile and its sub-lists, the self profile update,
// and the follow toggle, driven through the real app + posthub_test. Reads are
// public; authed writes use request.agent to carry the session cookie. Also proves
// the derived counts and the viewer-relative followedByMe on the profile and lists.

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

const alice = { username: 'alice', email: 'alice@example.com', password: 'alicepass1' };

describe('GET /api/users/:username', () => {
  it('returns the profile with derived counts and followedByMe false for anonymous', async () => {
    const andres = await seedUser({ username: 'andres', email: 'andres@example.com', bio: 'Reading and building.' });
    await seedPost({ authorId: andres });
    await seedPost({ authorId: andres });
    // Two followers of andres, and andres follows one person.
    const f1 = await seedUser({ username: 'fan1', email: 'fan1@example.com' });
    const f2 = await seedUser({ username: 'fan2', email: 'fan2@example.com' });
    const idol = await seedUser({ username: 'idol', email: 'idol@example.com' });
    await seedFollow({ followerId: f1, followeeId: andres });
    await seedFollow({ followerId: f2, followeeId: andres });
    await seedFollow({ followerId: andres, followeeId: idol });

    const res = await request(app).get('/api/users/andres');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      username: 'andres',
      bio: 'Reading and building.',
      avatarUrl: null,
      postCount: 2,
      followerCount: 2,
      followingCount: 1,
      followedByMe: false,
    });
    expect(res.body).toHaveProperty('createdAt');
  });

  it('returns 404 for a missing user', async () => {
    const res = await request(app).get('/api/users/ghost');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: 'User not found' } });
  });
});

describe('PUT/DELETE /api/users/:username/follow', () => {
  it('rejects an unauthenticated follow with 401', async () => {
    await seedUser({ username: 'bob', email: 'bob@example.com' });
    const res = await request(app).put('/api/users/bob/follow');
    expect(res.status).toBe(401);
  });

  it('follows idempotently, reflects the new state, and shows followedByMe to the follower', async () => {
    await seedUser({ username: 'bob', email: 'bob@example.com' });
    const agent = await registerAgent(alice);

    const first = await agent.put('/api/users/bob/follow');
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ username: 'bob', followedByMe: true, followerCount: 1 });

    // Following again is not an error and does not double-count.
    const again = await agent.put('/api/users/bob/follow');
    expect(again.body).toEqual({ username: 'bob', followedByMe: true, followerCount: 1 });

    // The follower now sees followedByMe true and the bumped count on bob's profile.
    const profile = await agent.get('/api/users/bob');
    expect(profile.body).toMatchObject({ followedByMe: true, followerCount: 1 });
  });

  it('returns 400 on a self-follow', async () => {
    const agent = await registerAgent(alice);
    const res = await agent.put('/api/users/alice/follow');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { message: 'You cannot follow yourself' } });
  });

  it('returns 404 when following a missing user', async () => {
    const agent = await registerAgent(alice);
    const res = await agent.put('/api/users/ghost/follow');
    expect(res.status).toBe(404);
  });

  it('unfollows idempotently and reports the dropped state', async () => {
    await seedUser({ username: 'bob', email: 'bob@example.com' });
    const agent = await registerAgent(alice);
    await agent.put('/api/users/bob/follow');

    const res = await agent.delete('/api/users/bob/follow');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: 'bob', followedByMe: false, followerCount: 0 });

    // Unfollowing again is a no-op, not an error.
    const again = await agent.delete('/api/users/bob/follow');
    expect(again.body).toEqual({ username: 'bob', followedByMe: false, followerCount: 0 });
  });

  it('rejects an unauthenticated unfollow with 401 and 404s a missing target', async () => {
    await seedUser({ username: 'bob', email: 'bob@example.com' });
    const unauth = await request(app).delete('/api/users/bob/follow');
    expect(unauth.status).toBe(401);

    const agent = await registerAgent(alice);
    const missing = await agent.delete('/api/users/ghost/follow');
    expect(missing.status).toBe(404);
  });
});

describe('PATCH /api/users/me', () => {
  it('rejects an unauthenticated update with 401', async () => {
    const res = await request(app).patch('/api/users/me').send({ bio: 'x' });
    expect(res.status).toBe(401);
  });

  it('updates the bio and returns the profile', async () => {
    const agent = await registerAgent(alice);
    const res = await agent.patch('/api/users/me').send({ bio: 'Reading, building, sleeping.' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: 'alice', bio: 'Reading, building, sleeping.' });
  });

  it('rejects a username change with 400', async () => {
    const agent = await registerAgent(alice);
    const res = await agent.patch('/api/users/me').send({ username: 'alice2' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { message: 'Username cannot be changed', field: 'username' },
    });
  });

  it('changes the email, after which login uses the new address', async () => {
    const agent = await registerAgent(alice);
    const patch = await agent.patch('/api/users/me').send({ email: 'newalice@example.com' });
    expect(patch.status).toBe(200);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'newalice@example.com', password: alice.password });
    expect(login.status).toBe(200);
  });

  it('returns 409 when the new email is already registered', async () => {
    await seedUser({ username: 'taken', email: 'taken@example.com' });
    const agent = await registerAgent(alice);
    const res = await agent.patch('/api/users/me').send({ email: 'taken@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ field: 'email' });
  });

  it('changes the password, after which login uses the new one', async () => {
    const agent = await registerAgent(alice);
    const patch = await agent.patch('/api/users/me').send({ password: 'brandnewpass9' });
    expect(patch.status).toBe(200);

    const oldPw = await request(app)
      .post('/api/auth/login')
      .send({ email: alice.email, password: alice.password });
    expect(oldPw.status).toBe(401);

    const newPw = await request(app)
      .post('/api/auth/login')
      .send({ email: alice.email, password: 'brandnewpass9' });
    expect(newPw.status).toBe(200);
  });
});

describe('GET /api/users/:username/posts', () => {
  it('returns the user posts newest-first with pagination', async () => {
    const andres = await seedUser({ username: 'andres', email: 'andres@example.com' });
    await seedPost({ authorId: andres, title: 'First' });
    await seedPost({ authorId: andres, title: 'Second' });
    const newestId = await seedPost({ authorId: andres, title: 'Third' });

    const res = await request(app).get('/api/users/andres/posts?limit=2&page=1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 2, total: 3 });
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].id).toBe(newestId); // newest first
  });

  it('returns 404 for a missing user', async () => {
    const res = await request(app).get('/api/users/ghost/posts');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/users/:username/followers and /following', () => {
  it('lists followers with bio + followedByMe and paginates', async () => {
    const andres = await seedUser({ username: 'andres', email: 'andres@example.com' });
    const f1 = await seedUser({ username: 'fan1', email: 'fan1@example.com', bio: 'Fan one.' });
    const f2 = await seedUser({ username: 'fan2', email: 'fan2@example.com', bio: 'Fan two.' });
    await seedFollow({ followerId: f1, followeeId: andres });
    await seedFollow({ followerId: f2, followeeId: andres });

    const res = await request(app).get('/api/users/andres/followers?limit=1&page=1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 1, total: 2 });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      avatarUrl: null,
      followedByMe: false,
    });
    expect(res.body.data[0]).toHaveProperty('bio');
    expect(res.body.data[0]).toHaveProperty('username');
  });

  it('marks followedByMe on the following list relative to the viewer', async () => {
    const andres = await seedUser({ username: 'andres', email: 'andres@example.com' });
    const bob = await seedUser({ username: 'bob', email: 'bob@example.com' });
    const carol = await seedUser({ username: 'carol', email: 'carol@example.com' });
    // andres follows bob and carol.
    await seedFollow({ followerId: andres, followeeId: bob });
    await seedFollow({ followerId: andres, followeeId: carol });

    // The viewer (alice) follows bob but not carol.
    const agent = await registerAgent(alice);
    await agent.put('/api/users/bob/follow');

    const res = await agent.get('/api/users/andres/following');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    const byName = Object.fromEntries(
      res.body.data.map((u: { username: string; followedByMe: boolean }) => [u.username, u.followedByMe]),
    );
    expect(byName).toEqual({ bob: true, carol: false });
  });

  it('returns 404 for a missing user on both lists', async () => {
    expect((await request(app).get('/api/users/ghost/followers')).status).toBe(404);
    expect((await request(app).get('/api/users/ghost/following')).status).toBe(404);
  });
});
