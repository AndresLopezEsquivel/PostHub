import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { seedUser, seedPost } from '../helpers/db';

// Feed — the followee-scoped listing at /api/feed. Auth-only, driven through the
// real app + posthub_test with request.agent for the session. listFeed is a thin
// SQL wrapper (like listBookmarks), so this integration suite is the real proof:
// the 401 guard, the empty-state envelope, follow-scoping + order, pagination, and
// that the viewer's like/bookmark state binds to the same session user.

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

const viewer = { username: 'viewer', email: 'viewer@example.com', password: 'viewerpass1' };

describe('GET /api/feed', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/feed');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { message: 'Not authenticated' } });
  });

  it('returns an empty envelope for a user who follows no one', async () => {
    const agent = await registerAgent(viewer);
    // Someone else posts, but the viewer follows nobody — the feed is empty.
    const stranger = await seedUser({ username: 'stranger', email: 'stranger@example.com' });
    await seedPost({ authorId: stranger });

    const res = await agent.get('/api/feed');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], page: 1, limit: 20, total: 0 });
  });

  it('returns only followed authors\' posts, newest-first, excluding non-followed and own', async () => {
    const agent = await registerAgent(viewer);

    const a = await seedUser({ username: 'authora', email: 'authora@example.com' });
    const b = await seedUser({ username: 'authorb', email: 'authorb@example.com' });
    const c = await seedUser({ username: 'authorc', email: 'authorc@example.com' });

    // Posts interleaved so newest-first order is a real assertion (ids ascending).
    const aOld = await seedPost({ authorId: a, title: 'A old' });
    await seedPost({ authorId: c, title: 'C (not followed)' });
    const bMid = await seedPost({ authorId: b, title: 'B mid' });
    const aNew = await seedPost({ authorId: a, title: 'A new' });

    // The viewer follows A and B (via the API, so no need for the viewer's id).
    await agent.put('/api/users/authora/follow');
    await agent.put('/api/users/authorb/follow');
    // The viewer authors a post too — it must NOT appear (you can't follow yourself).
    await agent.post('/api/posts').send({ title: 'my own', content: 'body text here' });

    const res = await agent.get('/api/feed');

    expect(res.status).toBe(200);
    // A's two posts + B's one; C excluded, own excluded.
    expect(res.body.total).toBe(3);
    expect(res.body.data.map((card: { id: number }) => card.id)).toEqual([aNew, bMid, aOld]);
    const authors = res.body.data.map((card: { author: { username: string } }) => card.author.username);
    expect(authors).not.toContain('authorc');
    expect(authors).not.toContain('viewer');
  });

  it('paginates with a stable total across pages', async () => {
    const agent = await registerAgent(viewer);
    const a = await seedUser({ username: 'authora', email: 'authora@example.com' });
    await seedPost({ authorId: a, title: 'one' });
    await seedPost({ authorId: a, title: 'two' });
    await seedPost({ authorId: a, title: 'three' });
    await agent.put('/api/users/authora/follow');

    const page1 = await agent.get('/api/feed?limit=2&page=1');
    expect(page1.body).toMatchObject({ page: 1, limit: 2, total: 3 });
    expect(page1.body.data).toHaveLength(2);

    const page2 = await agent.get('/api/feed?limit=2&page=2');
    expect(page2.body).toMatchObject({ page: 2, limit: 2, total: 3 });
    expect(page2.body.data).toHaveLength(1);
  });

  it('reflects the viewer\'s like/bookmark state on the feed cards', async () => {
    const agent = await registerAgent(viewer);
    const a = await seedUser({ username: 'authora', email: 'authora@example.com' });
    const liked = await seedPost({ authorId: a, title: 'liked one' });
    const plain = await seedPost({ authorId: a, title: 'plain one' });
    await agent.put('/api/users/authora/follow');

    // Engage with one post through the API (proves $1 binds the session viewer).
    await agent.put(`/api/posts/${liked}/like`);
    await agent.put(`/api/posts/${liked}/bookmark`);

    const res = await agent.get('/api/feed');
    const byId = Object.fromEntries(
      res.body.data.map((card: { id: number; likedByMe: boolean; bookmarkedByMe: boolean }) => [
        card.id,
        { likedByMe: card.likedByMe, bookmarkedByMe: card.bookmarkedByMe },
      ]),
    );
    expect(byId[liked]).toEqual({ likedByMe: true, bookmarkedByMe: true });
    expect(byId[plain]).toEqual({ likedByMe: false, bookmarkedByMe: false });
  });
});
