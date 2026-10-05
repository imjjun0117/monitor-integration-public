// 수동 점검 실행 후 완료 결과를 제한된 횟수로 조회
import { useCallback, useEffect, useRef, useState } from 'react';

const POLL_INTERVAL_MS = 1_000;
export const MANUAL_RERUN_POLL_LIMIT_MS = 15_000;

type ActivePoll = { baseline: string | null; generation: number };

export function useManualRerunPolling(
  currentCheckedAt: string | null | undefined,
  refetch: () => Promise<unknown>,
) {
  const [active, setActive] = useState<ActivePoll>();
  const [didTimeOut, setDidTimeOut] = useState(false);
  const generation = useRef(0);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  const start = useCallback(() => {
    generation.current += 1;
    setDidTimeOut(false);
    setActive({ baseline: currentCheckedAt ?? null, generation: generation.current });
  }, [currentCheckedAt]);

  const reset = useCallback(() => {
    setActive(undefined);
    setDidTimeOut(false);
  }, []);

  useEffect(() => {
    if (active && (currentCheckedAt ?? null) !== active.baseline) {
      setActive(undefined);
      setDidTimeOut(false);
    }
  }, [active, currentCheckedAt]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const expectedGeneration = active.generation;
    const interval = window.setInterval(() => {
      void refetchRef.current();
    }, POLL_INTERVAL_MS);
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
      setActive((current) => (current?.generation === expectedGeneration ? undefined : current));
      setDidTimeOut(true);
    }, MANUAL_RERUN_POLL_LIMIT_MS);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [active]);

  return { start, reset, isPolling: Boolean(active), didTimeOut };
}
