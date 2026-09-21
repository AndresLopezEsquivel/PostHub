import { type DependencyList, useCallback, useEffect, useState } from 'react';

// The list machinery every data screen reuses (Explore first, then Post detail,
// Feed, Bookmarks, Profile posts). It is the hard, error-prone part — run an async
// fetch, track its status, and never let a superseded request write state — factored
// out once. It is deliberately NOT a data-fetching library: no cache, no dedup, no
// retries. Screens still own their own markup, including their own empty-state copy
// (Feed's empty is a call to action; Bookmarks' is not), so only the fetch/status
// lifecycle lives here.
//
// The same stale-result discipline as AuthProvider's session probe: an ignore flag
// tied to the effect run, so a slow response that resolves after the deps changed
// (or after unmount) is dropped rather than flashing stale data or warning on an
// unmounted setState.

export type AsyncStatus = 'loading' | 'success' | 'error';

export interface AsyncState<T> {
  status: AsyncStatus;
  // Present once status is 'success'. Kept from the previous run while a new fetch
  // is in flight would be nice for lists, but this pass keeps it simple: data is
  // null until the first success and reset to null on every dep change.
  data: T | null;
  error: unknown;
  reload: () => void;
}

// `fetcher` receives an AbortSignal so callers that go through api/client.ts can
// forward it and let a superseded request actually cancel, not just be ignored.
export function useAsync<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
): AsyncState<T> {
  const [status, setStatus] = useState<AsyncStatus>('loading');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);

  // A counter, bumped by reload(), added to the effect deps so calling it re-runs
  // the fetch without the caller having to vary its own deps.
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;

    setStatus('loading');
    setError(null);

    fetcher(controller.signal)
      .then((result) => {
        if (ignore) return;
        setData(result);
        setStatus('success');
      })
      .catch((err: unknown) => {
        // An abort is the expected outcome of a superseded run, not a failure.
        if (ignore || controller.signal.aborted) return;
        setError(err);
        setStatus('error');
      });

    return () => {
      ignore = true;
      controller.abort();
    };
    // fetcher is intentionally omitted: callers pass an inline closure that is a new
    // reference each render, so the explicit `deps` (plus nonce) are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { status, data, error, reload };
}
