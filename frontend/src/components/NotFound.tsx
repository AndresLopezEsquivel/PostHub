import { Link } from 'react-router';

export function NotFound() {
  return (
    <section>
      <h1>Page not found</h1>
      <p>That address doesn&rsquo;t match anything on PostHub.</p>
      <Link to="/">Back to Explore</Link>
    </section>
  );
}
