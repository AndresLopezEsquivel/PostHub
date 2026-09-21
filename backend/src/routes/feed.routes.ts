import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { getFeed } from '../controllers/feed.controller';

// Mounted at /api/feed — see docs/api_design.md "Feed".
// GET / — the session user's personalized feed (posts by followed authors).
// Auth-only: requireAuth makes a no-session request a 401.
const router = Router();

router.get('/', requireAuth, getFeed);

export default router;
