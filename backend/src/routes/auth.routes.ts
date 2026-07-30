import { Router } from 'express';
import {
  registerUser,
  loginUser,
  logoutUser,
  getSession,
} from '../controllers/auth.controller';
import { requireAuth } from '../middleware/requireAuth';

// Mounted at /api/auth — see docs/api_design.md "Auth"
// POST /register, POST /login, POST /logout, GET /session
const router = Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/logout', requireAuth, logoutUser);
router.get('/session', getSession);

export default router;
