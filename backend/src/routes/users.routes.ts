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

const router = Router();

router.patch('/me', requireAuth, updateOwnProfile);

router.get('/:username', getUserProfile);
router.get('/:username/posts', listUserPosts);
router.get('/:username/followers', listFollowers);
router.get('/:username/following', listFollowing);
router.put('/:username/follow', requireAuth, followUser);
router.delete('/:username/follow', requireAuth, unfollowUser);

export default router;
