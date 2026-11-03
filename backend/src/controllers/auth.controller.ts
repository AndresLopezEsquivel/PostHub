import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { unauthorized } from '../errors/httpError';

// express-session's regenerate and destroy take callbacks. Wrapping them in
// promises keeps these handlers linear and lets Express 5 send any rejection
// to errorHandler.

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}

// Issue a fresh session bound to this user. Regenerating first gives the user
// a new session id at login, so an attacker who planted a cookie before login
// can't use it afterwards (session fixation).
async function openSession(req: Request, userId: number): Promise<void> {
  await regenerateSession(req);
  req.session.userId = userId;
}

export async function registerUser(req: Request, res: Response): Promise<void> {
  const user = await authService.registerUser(req.body);
  await openSession(req, user.id);
  res.status(201).json(authService.toPublicUser(user));
}

export async function loginUser(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body ?? {};
  const user = await authService.authenticate(email, password);
  if (!user) {
    throw unauthorized('Invalid credentials');
  }
  await openSession(req, user.id);
  res.status(200).json(authService.toPublicUser(user));
}

export async function logoutUser(req: Request, res: Response): Promise<void> {
  await destroySession(req);
  res.clearCookie('posthub.sid');
  res.status(204).end();
}

export async function getSession(req: Request, res: Response): Promise<void> {
  const userId = req.session.userId;
  if (!userId) {
    throw unauthorized('Not authenticated');
  }
  const user = await authService.getUserById(userId);
  // The session points at a user that no longer exists (deleted since login):
  // treat the session as invalid rather than 500.
  if (!user) {
    throw unauthorized('Not authenticated');
  }
  res.status(200).json(authService.toPublicUser(user));
}
