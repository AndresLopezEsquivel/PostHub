import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { seedUser, seedPost } from '../helpers/db';

// /api/posts/:postId/like — the idempotent like toggle, driven through the real
// app + posthub_test. Writes are authed (request.agent carries the cookie);
// public reads confirm the count and per-viewer likedByMe threaded into the card.

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

const liker = { username: 'neo', email: 'neo@example.com', password: 'trinity123' };
const other = { username: 'trinity', email: 'trinity@example.com', password: 'neo123456' };

describe('PUT/DELETE /api/posts/:postId/like', () => {
  it('rejects an unauthenticated like with 401', async () => {
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });

    const res = await request(app).put(`/api/posts/${postId}/like`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { message: 'Not authenticated' } });
  });

  it('likes idempotently, returns the fresh count + state, then unlikes', async () => {
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });
    const agent = await registerAgent(liker);

    const first = await agent.put(`/api/posts/${postId}/like`);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ postId, likeCount: 1, likedByMe: true });

    // Liking again is not an error and does not double-count.
    const again = await agent.put(`/api/posts/${postId}/like`);
    expect(again.body).toEqual({ postId, likeCount: 1, likedByMe: true });

    const unlike = await agent.delete(`/api/posts/${postId}/like`);
    expect(unlike.status).toBe(200);
    expect(unlike.body).toEqual({ postId, likeCount: 0, likedByMe: false });

    // Unliking again is likewise idempotent.
    const unlikeAgain = await agent.delete(`/api/posts/${postId}/like`);
    expect(unlikeAgain.body).toEqual({ postId, likeCount: 0, likedByMe: false });
  });

  it('counts likes across users and reflects likedByMe per viewer', async () => {
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });
    const agentA = await registerAgent(liker);
    const agentB = await registerAgent(other);

    await agentA.put(`/api/posts/${postId}/like`);
    const bLike = await agentB.put(`/api/posts/${postId}/like`);
    expect(bLike.body.likeCount).toBe(2);

    // Anonymous read: sees the public count, but likedByMe is false (no session).
    const anon = await request(app).get(`/api/posts/${postId}`);
    expect(anon.body).toMatchObject({ likeCount: 2, likedByMe: false });

    // A's read of the same post sees likedByMe true — proves viewer threading.
    const aDetail = await agentA.get(`/api/posts/${postId}`);
    expect(aDetail.body).toMatchObject({ likeCount: 2, likedByMe: true });

    // The list card carries the same per-viewer state.
    const aList = await agentA.get('/api/posts');
    const card = aList.body.data.find((c: { id: number }) => c.id === postId);
    expect(card).toMatchObject({ likeCount: 2, likedByMe: true });
  });

  it('returns 404 when liking or unliking a missing post', async () => {
    const agent = await registerAgent(liker);

    expect((await agent.put('/api/posts/999/like')).status).toBe(404);
    expect((await agent.delete('/api/posts/999/like')).status).toBe(404);
  });
});
