import { useCallback, useEffect, useRef } from "react";

type WsHandler = (data: Record<string, unknown>) => void;

export function useSupportSocket(onMessage: WsHandler, enabled: boolean) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  const connect = useCallback(() => {
    if (!enabled) return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/ws/support`;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe_inbox" }));
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as Record<string, unknown>;
        handlerRef.current(data);
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => {
      wsRef.current = null;
    };
  }, [enabled]);

  const subscribeThread = useCallback((threadId: number | null) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (threadId) {
      ws.send(JSON.stringify({ type: "subscribe", thread_id: threadId }));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return { subscribeThread, reconnect: connect };
}
