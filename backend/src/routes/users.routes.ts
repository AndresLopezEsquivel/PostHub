import { Router } from 'express';

// Mounted at /api/users — see docs/api_design.md "Users and follows"
// GET /:username, PATCH /me, GET /:username/posts,
// GET /:username/followers, GET /:username/following,
// PUT /:username/follow, DELETE /:username/follow
const router = Router();

export default router;
