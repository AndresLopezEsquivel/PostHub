import { Router } from 'express';
import { listCategories } from '../controllers/categories.controller';

const router = Router();

router.get('/', listCategories);

export default router;
