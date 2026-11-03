import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { getFeed } from '../controllers/feed.controller';

const router = Router();

router.get('/', requireAuth, getFeed);

export default router;
