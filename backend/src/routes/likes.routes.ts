import { Router } from 'express';

// Mounted at /api/posts/:postId/like — see docs/api_design.md "Likes"
// PUT /, DELETE /
const router = Router({ mergeParams: true });

export default router;
