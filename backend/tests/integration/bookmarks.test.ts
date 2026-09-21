import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { seedUser, seedPost } from '../helpers/db';

// Bookmarks — the private toggle (/api/posts/:postId/bookmark) plus the saved-post
// listing (/api/bookmarks). Driven through the real app + posthub_test. All three
// endpoints are authed; the listing is scoped to the session user by definition.

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

const saver = { username: 'neo', email: 'neo@example.com', password: 'trinity123' };
const other = { username: 'trinity', email: 'trinity@example.com', password: 'neo123456' };

describe('PUT/DELETE /api/posts/:postId/bookmark', () => {
  it('rejects an unauthenticated bookmark with 401', async () => {
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });

    const res = await request(app).put(`/api/posts/${postId}/bookmark`);

    expect(res.status).toBe(401);
  });

  it('bookmarks idempotently (no count) and unbookmarks', async () => {
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });
    const agent = await registerAgent(saver);

    const first = await agent.put(`/api/posts/${postId}/bookmark`);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ postId, bookmarkedByMe: true });
    // Bookmarks are private — no tally is leaked.
    expect(first.body).not.toHaveProperty('likeCount');

    const again = await agent.put(`/api/posts/${postId}/bookmark`);
    expect(again.body).toEqual({ postId, bookmarkedByMe: true });

    const un = await agent.delete(`/api/posts/${postId}/bookmark`);
    expect(un.body).toEqual({ postId, bookmarkedByMe: false });

    const unAgain = await agent.delete(`/api/posts/${postId}/bookmark`);
    expect(unAgain.body).toEqual({ postId, bookmarkedByMe: false });
  });

  it('returns 404 when bookmarking a missing post', async () => {
    const agent = await registerAgent(saver);

    expect((await agent.put('/api/posts/999/bookmark')).status).toBe(404);
    expect((await agent.delete('/api/posts/999/bookmark')).status).toBe(404);
  });

  it('reflects bookmarkedByMe per viewer on the card', async () => {
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });
    const agent = await registerAgent(saver);

    await agent.put(`/api/posts/${postId}/bookmark`);

    const mine = await agent.get(`/api/posts/${postId}`);
    expect(mine.body.bookmarkedByMe).toBe(true);

    const anon = await request(app).get(`/api/posts/${postId}`);
    expect(anon.body.bookmarkedByMe).toBe(false);
  });
});

describe('GET /api/bookmarks', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/bookmarks');
    expect(res.status).toBe(401);
  });

  it('returns only the session user\'s saved cards, newest-saved first', async () => {
    const authorId = await seedUser();
    const p1 = await seedPost({ authorId, title: 'A' });
    await seedPost({ authorId, title: 'B' }); // not bookmarked
    const p3 = await seedPost({ authorId, title: 'C' });
    const agent = await registerAgent(saver);

    await agent.put(`/api/posts/${p1}/bookmark`);
    await agent.put(`/api/posts/${p3}/bookmark`);

    const res = await agent.get('/api/bookmarks');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 2 });
    // Most recently saved first: p3 was bookmarked after p1.
    expect(res.body.data.map((c: { id: number }) => c.id)).toEqual([p3, p1]);
    expect(res.body.data.every((c: { bookmarkedByMe: boolean }) => c.bookmarkedByMe)).toBe(true);
  });

  it('paginates the saved posts', async () => {
    const authorId = await seedUser();
    const agent = await registerAgent(saver);
    const a = await seedPost({ authorId, title: 'A' });
    const b = await seedPost({ authorId, title: 'B' });
    const c = await seedPost({ authorId, title: 'C' });
    for (const id of [a, b, c]) await agent.put(`/api/posts/${id}/bookmark`);

    const page1 = await agent.get('/api/bookmarks?limit=2&page=1');
    expect(page1.body).toMatchObject({ page: 1, limit: 2, total: 3 });
    expect(page1.body.data).toHaveLength(2);

    const page2 = await agent.get('/api/bookmarks?limit=2&page=2');
    expect(page2.body.data).toHaveLength(1);
  });

  it('does not expose another user\'s bookmarks', async () => {
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });
    const agentA = await registerAgent(saver);
    const agentB = await registerAgent(other);

    await agentA.put(`/api/posts/${postId}/bookmark`);

    const bList = await agentB.get('/api/bookmarks');
    expect(bList.body).toMatchObject({ total: 0 });
    expect(bList.body.data).toEqual([]);
  });
});
