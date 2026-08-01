import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { seedUser, seedPost, seedComment } from '../helpers/db';

// Comments — the post-scoped list/create and the top-level update/delete, driven
// through the real app + posthub_test. Reads are public; authed writes use
// request.agent to carry the session cookie. Also proves the commentCount retrofit
// into the post card.

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

const author = { username: 'neo', email: 'neo@example.com', password: 'trinity123' };
const other = { username: 'trinity', email: 'trinity@example.com', password: 'neo123456' };

describe('GET /api/posts/:postId/comments', () => {
  it('returns an empty envelope for a post with no comments', async () => {
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });

    const res = await request(app).get(`/api/posts/${postId}/comments`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], page: 1, limit: 20, total: 0 });
  });

  it('returns comments oldest-first with the documented shape', async () => {
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });
    await seedComment({ postId, authorId, content: 'First.' });
    await seedComment({ postId, authorId, content: 'Second.' });

    const res = await request(app).get(`/api/posts/${postId}/comments`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 2 });
    expect(res.body.data.map((c: { content: string }) => c.content)).toEqual(['First.', 'Second.']);

    const comment = res.body.data[0];
    expect(comment).toMatchObject({
      content: 'First.',
      author: { username: 'tester', avatarUrl: null },
      updatedAt: null,
    });
    expect(comment).toHaveProperty('id');
    expect(comment).toHaveProperty('createdAt');
  });

  it('paginates with page/limit and a stable total', async () => {
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });
    await seedComment({ postId, authorId, content: 'A' });
    await seedComment({ postId, authorId, content: 'B' });
    await seedComment({ postId, authorId, content: 'C' });

    const page1 = await request(app).get(`/api/posts/${postId}/comments?limit=2&page=1`);
    expect(page1.body).toMatchObject({ page: 1, limit: 2, total: 3 });
    expect(page1.body.data).toHaveLength(2);

    const page2 = await request(app).get(`/api/posts/${postId}/comments?limit=2&page=2`);
    expect(page2.body.data).toHaveLength(1);
  });

  it('returns 404 for a missing post', async () => {
    const res = await request(app).get('/api/posts/999/comments');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: 'Post not found' } });
  });
});

describe('POST /api/posts/:postId/comments', () => {
  it('rejects an unauthenticated comment with 401', async () => {
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });

    const res = await request(app).post(`/api/posts/${postId}/comments`).send({ content: 'hi' });

    expect(res.status).toBe(401);
  });

  it('creates a comment authored by the session user and returns it', async () => {
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });
    const agent = await registerAgent(author);

    const res = await agent.post(`/api/posts/${postId}/comments`).send({ content: 'Great read.' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      content: 'Great read.',
      author: { username: 'neo', avatarUrl: null },
      updatedAt: null,
    });
    expect(res.body).toHaveProperty('id');
  });

  it('returns 400 with the field when content is empty', async () => {
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });
    const agent = await registerAgent(author);

    const res = await agent.post(`/api/posts/${postId}/comments`).send({ content: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ field: 'content' });
  });

  it('returns 404 when commenting on a missing post', async () => {
    const agent = await registerAgent(author);

    const res = await agent.post('/api/posts/999/comments').send({ content: 'hi' });

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/comments/:commentId', () => {
  it('rejects an unauthenticated update with 401', async () => {
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });
    const commentId = await seedComment({ postId, authorId });

    const res = await request(app).patch(`/api/comments/${commentId}`).send({ content: 'x' });

    expect(res.status).toBe(401);
  });

  it('returns 403 when the caller is not the author', async () => {
    const authorAgent = await registerAgent(author);
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });
    const created = await authorAgent.post(`/api/posts/${postId}/comments`).send({ content: 'mine' });
    const otherAgent = await registerAgent(other);

    const res = await otherAgent
      .patch(`/api/comments/${created.body.id}`)
      .send({ content: 'hijacked' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: { message: 'You are not the author of this comment' },
    });
  });

  it('updates content and sets updatedAt for the owner', async () => {
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });
    const agent = await registerAgent(author);
    const created = await agent.post(`/api/posts/${postId}/comments`).send({ content: 'Original.' });

    const res = await agent
      .patch(`/api/comments/${created.body.id}`)
      .send({ content: 'Revised.' });

    expect(res.status).toBe(200);
    expect(res.body.content).toBe('Revised.');
    expect(res.body.updatedAt).not.toBeNull();
  });

  it('returns 404 when updating a missing comment', async () => {
    const agent = await registerAgent(author);

    const res = await agent.patch('/api/comments/999').send({ content: 'x' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: 'Comment not found' } });
  });
});

describe('DELETE /api/comments/:commentId', () => {
  it('rejects an unauthenticated delete with 401', async () => {
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });
    const commentId = await seedComment({ postId, authorId });

    const res = await request(app).delete(`/api/comments/${commentId}`);

    expect(res.status).toBe(401);
  });

  it('returns 403 when the caller is not the author', async () => {
    const authorAgent = await registerAgent(author);
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });
    const created = await authorAgent.post(`/api/posts/${postId}/comments`).send({ content: 'mine' });
    const otherAgent = await registerAgent(other);

    const res = await otherAgent.delete(`/api/comments/${created.body.id}`);

    expect(res.status).toBe(403);
  });

  it('deletes the comment for the owner, after which it is gone from the list', async () => {
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });
    const agent = await registerAgent(author);
    const created = await agent.post(`/api/posts/${postId}/comments`).send({ content: 'temp' });

    const del = await agent.delete(`/api/comments/${created.body.id}`);
    expect(del.status).toBe(204);
    expect(del.body).toEqual({});

    const list = await request(app).get(`/api/posts/${postId}/comments`);
    expect(list.body.total).toBe(0);
  });

  it('returns 404 when deleting a missing comment', async () => {
    const agent = await registerAgent(author);

    const res = await agent.delete('/api/comments/999');

    expect(res.status).toBe(404);
  });
});

describe('commentCount retrofit into the post card', () => {
  it('reflects the live comment count on the detail and list card, dropping after a delete', async () => {
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });
    const agent = await registerAgent(author);
    const first = await agent.post(`/api/posts/${postId}/comments`).send({ content: 'one' });
    await agent.post(`/api/posts/${postId}/comments`).send({ content: 'two' });

    const detail = await request(app).get(`/api/posts/${postId}`);
    expect(detail.body.commentCount).toBe(2);

    const list = await request(app).get('/api/posts');
    const card = list.body.data.find((c: { id: number }) => c.id === postId);
    expect(card.commentCount).toBe(2);

    // COUNT(*) is always live (never a stored counter), so deleting drops it.
    await agent.delete(`/api/comments/${first.body.id}`);
    const after = await request(app).get(`/api/posts/${postId}`);
    expect(after.body.commentCount).toBe(1);
  });
});
