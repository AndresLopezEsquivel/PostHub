import { Request, Response } from 'express';
import * as usersService from '../services/users.service';
import { parseUsername, requireUserId, viewerId } from './http';

// Thin HTTP layer over users.service. Reads params/query/body and the session
// user; the service owns validation, ownership, and the profile/follow shapes. No
// try/catch: under Express 5 a rejected promise is forwarded to errorHandler.
// Usernames address these routes (:username), read via parseUsername; a missing
// user is a 404 the service raises when it resolves the name.

export async function getUserProfile(req: Request, res: Response): Promise<void> {
  const profile = await usersService.getUserProfile(parseUsername(req), viewerId(req));
  res.status(200).json(profile);
}

export async function updateOwnProfile(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const profile = await usersService.updateOwnProfile(userId, req.body ?? {});
  res.status(200).json(profile);
}

export async function listUserPosts(req: Request, res: Response): Promise<void> {
  const { page, limit } = req.query;
  const result = await usersService.listUserPosts(
    parseUsername(req),
    { page, limit },
    viewerId(req),
  );
  res.status(200).json(result);
}

export async function listFollowers(req: Request, res: Response): Promise<void> {
  const { page, limit } = req.query;
  const result = await usersService.listFollowers(
    parseUsername(req),
    { page, limit },
    viewerId(req),
  );
  res.status(200).json(result);
}

export async function listFollowing(req: Request, res: Response): Promise<void> {
  const { page, limit } = req.query;
  const result = await usersService.listFollowing(
    parseUsername(req),
    { page, limit },
    viewerId(req),
  );
  res.status(200).json(result);
}

export async function followUser(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const state = await usersService.followUser(userId, parseUsername(req));
  res.status(200).json(state);
}

export async function unfollowUser(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const state = await usersService.unfollowUser(userId, parseUsername(req));
  res.status(200).json(state);
}
