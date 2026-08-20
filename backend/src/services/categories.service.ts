import { queryMany } from '../db/query';
import { CategoryRow } from '../types/db';

// The API shape for a category. It happens to equal CategoryRow one-for-one
// today, but this is the camelCase, client-facing type — the home for any
// derived field a future screen needs — kept separate from the raw row so the
// two can diverge without touching callers.
export interface Category {
  id: number;
  name: string;
  slug: string;
}

// Categories are reference data: read-only, unpaginated (the set is small and
// seeded). Ordered by name so the Explore filter and the post form's
// multi-select render a stable, alphabetical list.
export async function listCategories(): Promise<Category[]> {
  const rows = await queryMany<CategoryRow>(
    'SELECT id, name, slug FROM categories ORDER BY name',
  );
  return rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug }));
}
