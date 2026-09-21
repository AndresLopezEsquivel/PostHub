import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import {
  getUserProfile,
  updateOwnProfile,
  listUserPosts,
  listFollowers,
  listFollowing,
  followUser,
  unfollowUser,
} from '../controllers/users.controller';

// Mounted at /api/users — see docs/api_design.md "Users and follows".
// Reads are public; writes require a session (requireAuth). Ownership on
// PATCH /me is implicit (the session user is the target); the follow toggle's
// only owner-like check is the self-follow 400, handled in the service.
const router = Router();

// /me before /:username so the literal route wins over the param (a user named
// "me" can't shadow it).
router.patch('/me', requireAuth, updateOwnProfile);

router.get('/:username', getUserProfile);
router.get('/:username/posts', listUserPosts);
router.get('/:username/followers', listFollowers);
router.get('/:username/following', listFollowing);
router.put('/:username/follow', requireAuth, followUser);
router.delete('/:username/follow', requireAuth, unfollowUser);

export default router;
