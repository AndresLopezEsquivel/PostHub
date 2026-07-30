import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { unauthorized } from '../errors/httpError';

// Thin HTTP layer over auth.service. Owns the one thing the service can't touch:
// the request-bound session. express-session's regenerate/destroy are callback
// APIs, so we promisify them to keep these handlers linear and let Express 5
// forward any rejection to errorHandler.

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

// Issue a fresh session bound to this user. Regenerating first rotates the
// session id on privilege change, closing the session-fixation window (an
// attacker who planted a pre-auth cookie can't ride it into an authed session).
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
