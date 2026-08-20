import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

// docs/screens.md, "Error boundary": the fallback shown when a screen fails
// unexpectedly, so the rest of the application stays usable. Wired as the root
// route's errorElement.
//
// What it does NOT catch: errors thrown from event handlers or effects. React
// error boundaries never have. That is why "error" is a documented state on the
// individual screens — a failed fetch is the screen's own problem to render, and
// this surface only catches the crashes nobody anticipated.
export function RouteError() {
  const error = useRouteError();

  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error';

  return (
    <section>
      <h1>Something went wrong</h1>
      <p>This screen failed to render. The rest of PostHub should still work.</p>
      <pre>{detail}</pre>
      <Link to="/">Back to Explore</Link>
    </section>
  );
}
