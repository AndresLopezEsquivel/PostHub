import { Request, Response } from 'express';
import * as categoriesService from '../services/categories.service';

// GET /api/categories — the full category list, a plain JSON array (not the
// pagination envelope; the set is small and seeded). No auth, no ownership.
//
// An async handler with no try/catch on purpose: under Express 5 a rejected
// promise is forwarded to errorHandler automatically, so an unexpected DB error
// becomes the shared 500 envelope without boilerplate here.
export async function listCategories(_req: Request, res: Response): Promise<void> {
  const categories = await categoriesService.listCategories();
  res.json(categories);
}
