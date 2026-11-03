import { queryMany } from '../db/query';
import { CategoryRow } from '../types/db';

// Same fields as CategoryRow today. Kept as a separate type so the API shape
// and the table can change independently.
export interface Category {
  id: number;
  name: string;
  slug: string;
}

// Not paginated: the set is small and seeded. Ordered by name so the Explore
// filter and the post form's checkboxes list categories alphabetically.
export async function listCategories(): Promise<Category[]> {
  const rows = await queryMany<CategoryRow>(
    'SELECT id, name, slug FROM categories ORDER BY name',
  );
  return rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug }));
}
