import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useManualRerunPolling } from './useManualRerunPolling';

afterEach(() => {
  vi.useRealTimers();
});

test('manual rerun polling stops no later than 15 seconds', async () => {
  vi.useFakeTimers();
  const refetch = vi.fn(async () => undefined);
  const { result } = renderHook(() => useManualRerunPolling('2026-09-03T00:00:00Z', refetch));

  act(() => result.current.start());
  expect(result.current.isPolling).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(15_000));

  expect(result.current.isPolling).toBe(false);
  expect(result.current.didTimeOut).toBe(true);
  const callsAtDeadline = refetch.mock.calls.length;
  expect(callsAtDeadline).toBeGreaterThan(0);
  expect(callsAtDeadline).toBeLessThanOrEqual(15);

  await act(async () => vi.advanceTimersByTimeAsync(5_000));
  expect(refetch).toHaveBeenCalledTimes(callsAtDeadline);
});

test('manual rerun polling stops as soon as a newer result arrives', async () => {
  vi.useFakeTimers();
  const refetch = vi.fn(async () => undefined);
  const { result, rerender } = renderHook(
    ({ checkedAt }) => useManualRerunPolling(checkedAt, refetch),
    { initialProps: { checkedAt: '2026-09-03T00:00:00Z' } },
  );

  act(() => result.current.start());
  await act(async () => vi.advanceTimersByTimeAsync(1_000));
  rerender({ checkedAt: '2026-09-03T00:00:01Z' });

  expect(result.current.isPolling).toBe(false);
  expect(result.current.didTimeOut).toBe(false);
  const callsAfterResult = refetch.mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(15_000));
  expect(refetch).toHaveBeenCalledTimes(callsAfterResult);
});
