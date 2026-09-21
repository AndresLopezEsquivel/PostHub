import { Link, useNavigate, useParams } from 'react-router';

import { listCategories } from '../api/categories';
import { isApiError } from '../api/client';
import { getPost, updatePost } from '../api/posts';
import { useAuth } from '../auth/useAuth';
import { DeletePostButton } from '../components/DeletePostButton';
import { PostForm, type PostFormValues } from '../components/PostForm';
import { useAsync } from '../hooks/useAsync';
import styles from './PostForm.page.module.css';

// docs/screens.md §7 — Edit post. RequireAuth-guarded, with an in-screen owner check
// (the client can't know the author until the post loads). A non-owner sees a
// "can't edit" state; the real gate is the backend 403 on PATCH.
export function EditPost() {
  const { postId } = useParams();
  const id = Number(postId);
  const navigate = useNavigate();
  const { user } = useAuth();

  const categoriesState = useAsync((signal) => listCategories(signal), []);
  const postState = useAsync((signal) => getPost(id, signal), [id]);

  async function handleSubmit(values: PostFormValues) {
    await updatePost(id, values);
    void navigate(`/posts/${id}`);
  }

  if (categoriesState.status === 'loading' || postState.status === 'loading') {
    return (
      <section className={styles.page}>
        <p role="status">Loading…</p>
      </section>
    );
  }

  if (postState.status === 'error') {
    const notFound = isApiError(postState.error) && postState.error.status === 404;
    return (
      <section className={styles.page}>
        <div role="alert" className={styles.notAllowed}>
          <h1>{notFound ? 'Post not found' : 'Something went wrong'}</h1>
          <Link to="/">Back to Explore</Link>
        </div>
      </section>
    );
  }

  if (categoriesState.status === 'error' || !categoriesState.data || !postState.data) {
    return (
      <section className={styles.page}>
        <div role="alert" className={styles.error}>
          <p>Could not load the editor.</p>
          <button
            type="button"
            onClick={() => {
              categoriesState.reload();
              postState.reload();
            }}
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  const post = postState.data;
  const categories = categoriesState.data;

  // Ownership is username-based (the API exposes no user id). This is UX only.
  if (user?.username !== post.author.username) {
    return (
      <section className={styles.page}>
        <div className={styles.notAllowed}>
          <h1>You can't edit this post</h1>
          <p>Only its author can.</p>
          <Link to={`/posts/${id}`}>Back to the post</Link>
        </div>
      </section>
    );
  }

  // The card/detail categories carry only {name, slug} — map their slugs back to
  // ids (the shape the API takes) via the full category list.
  const categoryIds = post.categories
    .map((tag) => categories.find((c) => c.slug === tag.slug)?.id)
    .filter((cid): cid is number => cid !== undefined);

  return (
    <section className={styles.page}>
      <h1>Edit post</h1>
      <PostForm
        categories={categories}
        initial={{ title: post.title, content: post.content, categoryIds }}
        imageInitialUrl={post.imageUrl}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
        onCancel={() => void navigate(`/posts/${id}`)}
      >
        <DeletePostButton postId={id} onDeleted={() => void navigate('/')} />
      </PostForm>
    </section>
  );
}
