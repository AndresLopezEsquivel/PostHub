import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

// The root route's errorElement: shown when a screen throws while rendering
// or in an effect. Errors in event handlers and async code aren't caught, so a
// failed fetch is shown by the screen itself.
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
