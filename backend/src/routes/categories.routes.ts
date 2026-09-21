import { Router } from 'express';
import { listCategories } from '../controllers/categories.controller';

// Mounted at /api/categories — see docs/api_design.md "Categories"
const router = Router();

router.get('/', listCategories);

export default router;
