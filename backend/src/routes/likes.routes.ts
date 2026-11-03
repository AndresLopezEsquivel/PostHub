import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { likePost, unlikePost } from '../controllers/likes.controller';

// mergeParams so the handler can read :postId from the parent mount.
const router = Router({ mergeParams: true });

router.put('/', requireAuth, likePost);
router.delete('/', requireAuth, unlikePost);

export default router;
