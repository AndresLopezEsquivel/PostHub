import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { queryOne } from '../../src/db/query';
import { seedUser, seedCategories, seedPost } from '../helpers/db';

// /api/posts — driven through the real app + posthub_test. Reads are public, so
// plain request(app) suffices; authed writes use request.agent(app) to carry the
// session cookie from register through the write.

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

async function categoryId(slug: string): Promise<number> {
  const row = await queryOne<{ id: number }>('SELECT id FROM categories WHERE slug = $1', [slug]);
  return row!.id;
}

const author = { username: 'neo', email: 'neo@example.com', password: 'trinity123' };
const other = { username: 'trinity', email: 'trinity@example.com', password: 'neo123456' };

describe('GET /api/posts', () => {
  it('returns an empty envelope when there are no posts', async () => {
    const res = await request(app).get('/api/posts');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], page: 1, limit: 20, total: 0 });
  });

  it('returns cards newest-first with the documented shape and stubbed counts', async () => {
    await seedCategories();
    const authorId = await seedUser();
    await seedPost({ authorId, title: 'First' });
    await seedPost({ authorId, title: 'Second', categoryIds: [await categoryId('philosophy')] });

    const res = await request(app).get('/api/posts');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 2 });
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].title).toBe('Second'); // newest (higher id) first

    const card = res.body.data[0];
    expect(card).toMatchObject({
      title: 'Second',
      author: { username: 'tester', avatarUrl: null },
      categories: [{ name: 'Philosophy', slug: 'philosophy' }],
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      bookmarkedByMe: false,
    });
    expect(card).toHaveProperty('excerpt');
    expect(card).not.toHaveProperty('content'); // list sends excerpt, not the body
  });

  it('paginates with page/limit and a stable total', async () => {
    const authorId = await seedUser();
    await seedPost({ authorId, title: 'A' });
    await seedPost({ authorId, title: 'B' });
    await seedPost({ authorId, title: 'C' });

    const page1 = await request(app).get('/api/posts?limit=2&page=1');
    expect(page1.body).toMatchObject({ page: 1, limit: 2, total: 3 });
    expect(page1.body.data).toHaveLength(2);

    const page2 = await request(app).get('/api/posts?limit=2&page=2');
    expect(page2.body).toMatchObject({ page: 2, limit: 2, total: 3 });
    expect(page2.body.data).toHaveLength(1);
  });

  it('filters by category slug', async () => {
    await seedCategories();
    const authorId = await seedUser();
    const philosophy = await categoryId('philosophy');
    const fiction = await categoryId('fiction');
    await seedPost({ authorId, title: 'Phil', categoryIds: [philosophy] });
    await seedPost({ authorId, title: 'Fic', categoryIds: [fiction] });

    const res = await request(app).get('/api/posts?category=philosophy');

    expect(res.body.total).toBe(1);
    expect(res.body.data[0].title).toBe('Phil');
  });

  it('searches title and content', async () => {
    const authorId = await seedUser();
    await seedPost({ authorId, title: 'On absurdism', content: 'Camus opens with…' });
    await seedPost({ authorId, title: 'On cooking', content: 'Whisk the eggs.' });

    const byTitle = await request(app).get('/api/posts?search=absurd');
    expect(byTitle.body.total).toBe(1);
    expect(byTitle.body.data[0].title).toBe('On absurdism');

    const byContent = await request(app).get('/api/posts?search=whisk');
    expect(byContent.body.total).toBe(1);
    expect(byContent.body.data[0].title).toBe('On cooking');
  });

  it('accepts sort=likes (no likes yet, so newest-first)', async () => {
    const authorId = await seedUser();
    await seedPost({ authorId, title: 'A' });
    await seedPost({ authorId, title: 'B' });

    const res = await request(app).get('/api/posts?sort=likes');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].title).toBe('B');
  });
});

describe('POST /api/posts', () => {
  beforeEach(async () => {
    await seedCategories();
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app)
      .post('/api/posts')
      .send({ title: 'x', content: 'y' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { message: 'Not authenticated' } });
  });

  it('creates a post authored by the session user and returns the card', async () => {
    const agent = await registerAgent(author);
    const philosophy = await categoryId('philosophy');

    const res = await agent.post('/api/posts').send({
      title: 'On absurdism',
      content: 'Camus opens with…',
      categoryIds: [philosophy],
      imageKey: null,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 1,
      title: 'On absurdism',
      author: { username: 'neo', avatarUrl: null },
      categories: [{ name: 'Philosophy', slug: 'philosophy' }],
      likeCount: 0,
      likedByMe: false,
    });
  });

  it('returns 400 with the field when the title is missing', async () => {
    const agent = await registerAgent(author);

    const res = await agent.post('/api/posts').send({ content: 'body only' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ field: 'title' });
  });

  it('returns 400 on a categoryId that does not exist', async () => {
    const agent = await registerAgent(author);

    const res = await agent
      .post('/api/posts')
      .send({ title: 't', content: 'c', categoryIds: [9999] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ field: 'categoryIds' });
  });
});

describe('GET /api/posts/:postId', () => {
  it('returns the detail shape with content, imageKey/imageUrl, and updatedAt', async () => {
    const authorId = await seedUser();
    const postId = await seedPost({
      authorId,
      title: 'On absurdism',
      content: 'Camus opens with…',
      imageKey: 'posts/42.jpg',
    });

    const res = await request(app).get(`/api/posts/${postId}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: postId,
      title: 'On absurdism',
      content: 'Camus opens with…',
      imageKey: 'posts/42.jpg',
      imageUrl: null, // no S3_PUBLIC_BASE_URL in the test env → unresolved
      updatedAt: null,
    });
  });

  it('returns 404 for a missing post', async () => {
    const res = await request(app).get('/api/posts/999');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: 'Post not found' } });
  });

  it('returns 404 for a non-numeric id', async () => {
    const res = await request(app).get('/api/posts/abc');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: 'Post not found' } });
  });
});

describe('PATCH /api/posts/:postId', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });

    const res = await request(app).patch(`/api/posts/${postId}`).send({ title: 'new' });

    expect(res.status).toBe(401);
  });

  it('returns 403 when the caller is not the author', async () => {
    const authorAgent = await registerAgent(author);
    const created = await authorAgent.post('/api/posts').send({ title: 't', content: 'c' });
    const otherAgent = await registerAgent(other);

    const res = await otherAgent
      .patch(`/api/posts/${created.body.id}`)
      .send({ title: 'hijacked' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: { message: 'You are not the author of this post' },
    });
  });

  it('updates title and replaces categories for the owner', async () => {
    await seedCategories();
    const agent = await registerAgent(author);
    const philosophy = await categoryId('philosophy');
    const fiction = await categoryId('fiction');
    const created = await agent
      .post('/api/posts')
      .send({ title: 'Original', content: 'c', categoryIds: [philosophy] });

    const res = await agent
      .patch(`/api/posts/${created.body.id}`)
      .send({ title: 'Revisited', categoryIds: [fiction] });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: 'Revisited',
      categories: [{ name: 'Fiction', slug: 'fiction' }],
    });
  });

  it('returns 404 when updating a missing post', async () => {
    const agent = await registerAgent(author);

    const res = await agent.patch('/api/posts/999').send({ title: 'x' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/posts/:postId', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const authorId = await seedUser();
    const postId = await seedPost({ authorId });

    const res = await request(app).delete(`/api/posts/${postId}`);

    expect(res.status).toBe(401);
  });

  it('returns 403 when the caller is not the author', async () => {
    const authorAgent = await registerAgent(author);
    const created = await authorAgent.post('/api/posts').send({ title: 't', content: 'c' });
    const otherAgent = await registerAgent(other);

    const res = await otherAgent.delete(`/api/posts/${created.body.id}`);

    expect(res.status).toBe(403);
  });

  it('deletes the post for the owner, after which it is 404', async () => {
    const agent = await registerAgent(author);
    const created = await agent.post('/api/posts').send({ title: 't', content: 'c' });

    const del = await agent.delete(`/api/posts/${created.body.id}`);
    expect(del.status).toBe(204);
    expect(del.body).toEqual({});

    const after = await request(app).get(`/api/posts/${created.body.id}`);
    expect(after.status).toBe(404);
  });

  it('returns 404 when deleting a missing post', async () => {
    const agent = await registerAgent(author);

    const res = await agent.delete('/api/posts/999');

    expect(res.status).toBe(404);
  });
});
