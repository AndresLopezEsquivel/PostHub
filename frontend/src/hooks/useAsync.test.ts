import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAsync } from './useAsync';

// The stale-result guard is the whole reason this hook exists rather than a bare
// useEffect, so it is the thing worth testing: a superseded request must never win.

describe('useAsync', () => {
  it('goes loading -> success and exposes the data', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.resolve('value'), []));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toBe('value');
  });

  it('goes loading -> error and exposes the error', async () => {
    const boom = new Error('boom');
    const { result } = renderHook(() => useAsync(() => Promise.reject(boom), []));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe(boom);
    expect(result.current.data).toBeNull();
  });

  it('ignores a superseded run whose result arrives after the deps changed', async () => {
    let resolveFirst!: (v: string) => void;
    let resolveSecond!: (v: string) => void;
    const first = new Promise<string>((r) => (resolveFirst = r));
    const second = new Promise<string>((r) => (resolveSecond = r));
    const fetcher = vi.fn<() => Promise<string>>().mockReturnValueOnce(first).mockReturnValueOnce(second);

    const { result, rerender } = renderHook(({ dep }) => useAsync(() => fetcher(), [dep]), {
      initialProps: { dep: 1 },
    });

    // Change deps → the hook starts the second fetch and must abandon the first.
    rerender({ dep: 2 });

    // Resolve the SECOND first, then the stale FIRST. The late first must not win.
    resolveSecond('second');
    await waitFor(() => expect(result.current.data).toBe('second'));

    resolveFirst('first');
    await Promise.resolve();
    expect(result.current.data).toBe('second');
    expect(result.current.status).toBe('success');
  });
});
