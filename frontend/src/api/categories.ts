import { request } from './client';

export interface Category {
  id: number;
  name: string;
  slug: string;
}

// A plain array, not Paginated: the category list is small and fixed.
export function listCategories(signal?: AbortSignal): Promise<Category[]> {
  return request<Category[]>('/categories', { signal });
}
