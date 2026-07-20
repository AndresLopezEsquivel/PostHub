import { Router } from 'express';

// Mounted at /api/auth — see docs/api_design.md "Auth"
// POST /register, POST /login, POST /logout, GET /session
const router = Router();

export default router;
