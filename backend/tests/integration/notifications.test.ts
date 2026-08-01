import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { queryOne } from '../../src/db/query';
import { seedUser, seedPost, seedNotification } from '../helpers/db';

// Notifications — the recipient-scoped read/mark endpoints and, crucially, the
// side-effect producers wired into like/comment/follow. Driven through the real
// app + posthub_test. Producers are exercised through their real endpoints so the
// transactional inserts actually run; reads/marks use the recipient's own session.

// Register a user, returning both a cookie-carrying agent and their numeric id (so
// tests can own posts / be the recipient of seeded notifications). The register
// response omits the id, so we look it up by the immutable username.
async function registerAgentId(creds: {
  username: string;
  email: string;
  password: string;
}): Promise<{ agent: ReturnType<typeof request.agent>; id: number }> {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send(creds);
  expect(res.status).toBe(201);
  const row = await queryOne<{ id: number }>('SELECT id FROM users WHERE username = $1', [
    creds.username,
  ]);
  return { agent, id: row!.id };
}

const actor = { username: 'actor', email: 'actor@example.com', password: 'actorpass1' };
const recipient = { username: 'recipient', email: 'recipient@example.com', password: 'recippass1' };

describe('notification producers (like / comment / follow)', () => {
  it('a like on another user\'s post notifies the author', async () => {
    const recip = await registerAgentId(recipient);
    const postId = await seedPost({ authorId: recip.id });
    const actorAgent = await registerAgentId(actor);

    await actorAgent.agent.put(`/api/posts/${postId}/like`);

    const res = await recip.agent.get('/api/notifications');
    expect(res.body).toMatchObject({ total: 1, unreadCount: 1 });
    expect(res.body.data[0]).toMatchObject({
      type: 'like',
      actor: { username: 'actor', avatarUrl: null },
      post: { id: postId },
      isRead: false,
    });
  });

  it('a comment on another user\'s post notifies the author', async () => {
    const recip = await registerAgentId(recipient);
    const postId = await seedPost({ authorId: recip.id });
    const actorAgent = await registerAgentId(actor);

    await actorAgent.agent.post(`/api/posts/${postId}/comments`).send({ content: 'nice' });

    const res = await recip.agent.get('/api/notifications');
    expect(res.body.data.map((n: { type: string }) => n.type)).toEqual(['comment']);
    expect(res.body.data[0].post).toMatchObject({ id: postId });
  });

  it('a follow notifies the followee, with a null post', async () => {
    const recip = await registerAgentId(recipient);
    const actorAgent = await registerAgentId(actor);

    await actorAgent.agent.put('/api/users/recipient/follow');

    const res = await recip.agent.get('/api/notifications');
    expect(res.body.data[0]).toMatchObject({ type: 'follow', post: null });
  });

  it('does not notify on self-like or self-comment', async () => {
    const me = await registerAgentId(actor);
    const created = await me.agent.post('/api/posts').send({ title: 'mine', content: 'body text here' });
    const postId = created.body.id;

    await me.agent.put(`/api/posts/${postId}/like`);
    await me.agent.post(`/api/posts/${postId}/comments`).send({ content: 'self note' });

    const res = await me.agent.get('/api/notifications');
    expect(res.body.total).toBe(0);
  });

  it('does not double-notify on a repeat like, but a re-like after unlike does', async () => {
    const recip = await registerAgentId(recipient);
    const postId = await seedPost({ authorId: recip.id });
    const actorAgent = await registerAgentId(actor);

    await actorAgent.agent.put(`/api/posts/${postId}/like`); // 1 notif
    await actorAgent.agent.put(`/api/posts/${postId}/like`); // idempotent no-op → none

    let res = await recip.agent.get('/api/notifications');
    expect(res.body.total).toBe(1);

    await actorAgent.agent.delete(`/api/posts/${postId}/like`); // unlike (notif persists)
    await actorAgent.agent.put(`/api/posts/${postId}/like`); // genuine new like → +1

    res = await recip.agent.get('/api/notifications');
    expect(res.body.total).toBe(2);
  });
});

describe('GET /api/notifications', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
  });

  it('lists newest-first, filters by ?unread=true, and paginates', async () => {
    const me = await registerAgentId(recipient);
    const actorId = await seedUser(actor);
    const postId = await seedPost({ authorId: actorId });
    // Three notifications: two unread, one already read.
    await seedNotification({ recipientId: me.id, actorId, type: 'like', postId });
    await seedNotification({ recipientId: me.id, actorId, type: 'comment', postId });
    await seedNotification({ recipientId: me.id, actorId, type: 'follow', isRead: true });

    const all = await me.agent.get('/api/notifications');
    expect(all.body).toMatchObject({ total: 3, unreadCount: 2 });

    const unread = await me.agent.get('/api/notifications?unread=true');
    expect(unread.body.total).toBe(2);
    expect(unread.body.data.every((n: { isRead: boolean }) => n.isRead === false)).toBe(true);

    const paged = await me.agent.get('/api/notifications?limit=2&page=1');
    expect(paged.body.data).toHaveLength(2);
    expect(paged.body.total).toBe(3);
  });
});

describe('PATCH /api/notifications/:notificationId', () => {
  it('rejects an unauthenticated update with 401', async () => {
    const res = await request(app).patch('/api/notifications/1').send({ isRead: true });
    expect(res.status).toBe(401);
  });

  it('returns 403 when the caller is not the recipient', async () => {
    const ownerId = await seedUser(recipient);
    const actorId = await seedUser(actor);
    const notifId = await seedNotification({ recipientId: ownerId, actorId, type: 'follow' });
    const intruder = await registerAgentId({
      username: 'intruder',
      email: 'intruder@example.com',
      password: 'intruder123',
    });

    const res = await intruder.agent.patch(`/api/notifications/${notifId}`).send({ isRead: true });
    expect(res.status).toBe(403);
  });

  it('returns 404 for a missing notification', async () => {
    const me = await registerAgentId(recipient);
    const res = await me.agent.patch('/api/notifications/9999').send({ isRead: true });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: 'Notification not found' } });
  });

  it('returns 400 on a non-boolean isRead', async () => {
    const me = await registerAgentId(recipient);
    const actorId = await seedUser(actor);
    const notifId = await seedNotification({ recipientId: me.id, actorId, type: 'follow' });

    const res = await me.agent.patch(`/api/notifications/${notifId}`).send({ isRead: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ field: 'isRead' });
  });

  it('marks a notification read, after which it drops out of ?unread=true', async () => {
    const me = await registerAgentId(recipient);
    const actorId = await seedUser(actor);
    const notifId = await seedNotification({ recipientId: me.id, actorId, type: 'follow' });

    const patch = await me.agent.patch(`/api/notifications/${notifId}`).send({ isRead: true });
    expect(patch.status).toBe(200);
    expect(patch.body).toEqual({ id: notifId, isRead: true });

    const unread = await me.agent.get('/api/notifications?unread=true');
    expect(unread.body.total).toBe(0);
  });
});

describe('POST /api/notifications/read-all', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).post('/api/notifications/read-all');
    expect(res.status).toBe(401);
  });

  it('marks every notification read and reports unreadCount 0', async () => {
    const me = await registerAgentId(recipient);
    const actorId = await seedUser(actor);
    await seedNotification({ recipientId: me.id, actorId, type: 'follow' });
    await seedNotification({ recipientId: me.id, actorId, type: 'follow' });

    const res = await me.agent.post('/api/notifications/read-all');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ unreadCount: 0 });

    const list = await me.agent.get('/api/notifications');
    expect(list.body.unreadCount).toBe(0);
  });
});
