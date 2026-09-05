import { useCallback, useEffect, useRef } from "react";

/** Tracks mount state and provides a generation token for cancelling stale async work. */
export function useAsyncSession() {
  const mountedRef = useRef(true);
  const generationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
    };
  }, []);

  const begin = useCallback(() => {
    generationRef.current += 1;
    return generationRef.current;
  }, []);

  const isCurrent = useCallback((token: number) => {
    return mountedRef.current && generationRef.current === token;
  }, []);

  return { begin, isCurrent };
}
