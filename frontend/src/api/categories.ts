import { request } from './client';

// The categories resource (docs/api_design.md "Categories"). Reference data:
// read-only, seeded, small. Explore's filter and (later) the post form's
// multi-select both render this list.

// --- API shapes (mirrors backend/src/services/categories.service.ts) ---------

export interface Category {
  id: number;
  name: string;
  slug: string;
}

// Note the asymmetry: this endpoint returns a BARE ARRAY, not the Paginated<T>
// envelope every other list uses. The backend made that call deliberately — the
// category set is small and fixed, so there is nothing to paginate — so the client
// transcribes it faithfully rather than pretending the shapes match.
export function listCategories(signal?: AbortSignal): Promise<Category[]> {
  return request<Category[]>('/categories', { signal });
}
