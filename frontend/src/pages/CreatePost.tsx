import { useNavigate } from 'react-router';

import { listCategories } from '../api/categories';
import { createPost } from '../api/posts';
import { PostForm, type PostFormValues } from '../components/PostForm';
import { useAsync } from '../hooks/useAsync';
import styles from './PostForm.page.module.css';

// docs/screens.md §6 — Create post. Authenticated only (route under RequireAuth).
// Loads the category list for the checkboxes, then hands off to the shared PostForm;
// on success it lands on the new post's detail.
export function CreatePost() {
  const navigate = useNavigate();
  const categoriesState = useAsync((signal) => listCategories(signal), []);

  async function handleSubmit(values: PostFormValues) {
    const card = await createPost(values);
    void navigate(`/posts/${card.id}`);
  }

  return (
    <section className={styles.page}>
      <h1>Create post</h1>

      {categoriesState.status === 'loading' && <p role="status">Loading…</p>}

      {categoriesState.status === 'error' && (
        <div role="alert" className={styles.error}>
          <p>Could not load categories.</p>
          <button type="button" onClick={categoriesState.reload}>
            Try again
          </button>
        </div>
      )}

      {categoriesState.status === 'success' && categoriesState.data && (
        <PostForm
          categories={categoriesState.data}
          submitLabel="Publish"
          onSubmit={handleSubmit}
          onCancel={() => void navigate('/')}
        />
      )}
    </section>
  );
}
