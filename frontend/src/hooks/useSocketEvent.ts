import { useEffect, useRef } from "react";
import { useSocket } from "../context/SocketContext";

/** Subscribe to a shared socket event with stable handler ref (avoids duplicate listeners). */
export function useSocketEvent<T = unknown>(
  event: string,
  handler: (payload: T) => void,
  enabled = true
): void {
  const { subscribe } = useSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    return subscribe<T>(event, (payload) => handlerRef.current(payload));
  }, [event, enabled, subscribe]);
}
