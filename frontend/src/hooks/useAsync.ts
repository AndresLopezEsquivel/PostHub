import { type DependencyList, useCallback, useEffect, useState } from 'react';

// Runs an async fetch and tracks its status, so screens don't repeat that
// logic. It has no cache, deduplication or retries.
//
// A result that arrives after the deps changed, or after unmount, is ignored,
// so older data never replaces newer data.

export type AsyncStatus = 'loading' | 'success' | 'error';

export interface AsyncState<T> {
  status: AsyncStatus;
  // The last successful result: it stays while a new fetch runs, and is null
  // until the first success.
  data: T | null;
  error: unknown;
  reload: () => void;
}

// fetcher gets an AbortSignal so a superseded request is cancelled, not just
// ignored.
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
