import { Link } from 'react-router';

// docs/screens.md, "Not found": shown when the requested address matches no
// screen. Deliberately distinct from a missing *resource* — a deleted post is a
// state of the Post detail screen itself, rendered by that screen, not by this
// one.
//
// In production this is only reachable because nginx.conf's try_files answers
// unknown paths with index.html; the backend JSON-404s every non-/api path.
export function NotFound() {
  return (
    <section>
      <h1>Page not found</h1>
      <p>That address doesn&rsquo;t match anything on PostHub.</p>
      <Link to="/">Back to Explore</Link>
    </section>
  );
}
