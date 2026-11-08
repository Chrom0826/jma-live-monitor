/**
 * Wolfx JMA 緊急地震速報 WebSocket client (push delivery).
 *
 * https://wolfx.jp/apidoc / https://wolfx.jp/wsapi
 * - `wss://ws-api.wolfx.jp/jma_eew` pushes every 緊急地震速報 issued by JMA, including 予報
 *   (P2P地震情報 only relays 警報 = code 556).
 * - The server sends `{"type":"heartbeat"}` about once a minute; the client may send `ping`.
 * - Sending `query_jmaeew` returns the latest EEW (used to catch up right after a (re)connect).
 * - HTTP fallback: `https://api.wolfx.jp/jma_eew.json` (CORS: *).
 *
 * This client mirrors the P2P client: exponential backoff reconnect, reconnect on `online` /
 * tab visible, silence watchdog (no heartbeat for 3 min => half-open socket), HTTP polling while
 * disconnected and de-duplication by EventID + Serial (+ cancel flag).
 */

export type WolfxSocketStatus = 'connecting' | 'open' | 'closed';

export interface WolfxEewSocketOptions {
  url?: string;
  httpUrl?: string;
  fallbackPollMs?: number;
  pingIntervalMs?: number;
  silenceTimeoutMs?: number;
  /** `via` = 'push' for live frames, 'query' for the catch-up answer / HTTP fallback */
  onMessage: (payload: Record<string, any>, via: 'push' | 'query') => void;
  onStatus?: (status: WolfxSocketStatus) => void;
}

const DEFAULT_WS_URL = 'wss://ws-api.wolfx.jp/jma_eew';
const DEFAULT_HTTP_URL = 'https://api.wolfx.jp/jma_eew.json';

export function wolfxEewKey(payload: Record<string, any>): string {
  return `${payload.EventID ?? ''}-${payload.Serial ?? ''}-${payload.isCancel ? 'c' : ''}`;
}

export function connectWolfxEewSocket(opts: WolfxEewSocketOptions): () => void {
  const url = opts.url ?? DEFAULT_WS_URL;
  const httpUrl = opts.httpUrl ?? DEFAULT_HTTP_URL;
  const fallbackPollMs = opts.fallbackPollMs ?? 10000;
  const pingIntervalMs = opts.pingIntervalMs ?? 30000;
  const silenceTimeoutMs = opts.silenceTimeoutMs ?? 3 * 60 * 1000;

  let ws: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let status: WolfxSocketStatus = 'closed';

  const seen = new Set<string>();
  const seenOrder: string[] = [];
  const markSeen = (key: string): boolean => {
    if (seen.has(key)) return false;
    seen.add(key);
    seenOrder.push(key);
    if (seenOrder.length > 500) seen.delete(seenOrder.shift()!);
    return true;
  };

  const setStatus = (s: WolfxSocketStatus) => {
    if (status === s) return;
    status = s;
    opts.onStatus?.(s);
  };

  const deliver = (payload: any, via: 'push' | 'query') => {
    if (!payload || typeof payload !== 'object') return;
    if (payload.type && payload.type !== 'jma_eew') return; // heartbeat / pong
    if (!payload.EventID) return;
    if (!markSeen(wolfxEewKey(payload))) return;
    try {
      opts.onMessage(payload, via);
    } catch {
      // consumer errors must never kill the socket
    }
  };

  const pollHttp = async () => {
    try {
      const res = await fetch(httpUrl, { cache: 'no-store' });
      if (!res.ok || stopped) return;
      deliver(await res.json(), 'query');
    } catch {
      // retry on next tick / reconnect
    }
  };

  const startFallbackPolling = () => {
    if (pollTimer || stopped) return;
    pollTimer = setInterval(() => {
      if (status !== 'open') void pollHttp();
    }, fallbackPollMs);
  };
  const stopFallbackPolling = () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  };

  const clearSocketTimers = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (pingTimer) clearInterval(pingTimer);
    silenceTimer = null;
    pingTimer = null;
  };

  const armSilenceWatchdog = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    }, silenceTimeoutMs);
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    const base = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5));
    attempt++;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      open();
    }, base * (0.75 + Math.random() * 0.5));
  };

  const open = () => {
    if (stopped) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    setStatus('connecting');
    let sock: WebSocket;
    try {
      sock = new WebSocket(url);
    } catch {
      setStatus('closed');
      startFallbackPolling();
      scheduleReconnect();
      return;
    }
    ws = sock;
    sock.onopen = () => {
      if (ws !== sock) return;
      attempt = 0;
      setStatus('open');
      stopFallbackPolling();
      armSilenceWatchdog();
      try {
        sock.send('query_jmaeew'); // catch up on the latest EEW
      } catch {
        /* ignore */
      }
      pingTimer = setInterval(() => {
        try {
          if (sock.readyState === WebSocket.OPEN) sock.send('ping');
        } catch {
          /* ignore */
        }
      }, pingIntervalMs);
    };
    let first = true;
    sock.onmessage = (event) => {
      if (ws !== sock) return;
      armSilenceWatchdog();
      let payload: any;
      try {
        payload = JSON.parse(String(event.data));
      } catch {
        return;
      }
      // The first jma_eew frame after connecting is the answer to query_jmaeew (latest stored EEW)
      const isEew = payload && payload.type === 'jma_eew';
      deliver(payload, isEew && first ? 'query' : 'push');
      if (isEew) first = false;
    };
    sock.onerror = () => {
      // onclose follows
    };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      clearSocketTimers();
      if (stopped) return;
      setStatus('closed');
      startFallbackPolling();
      void pollHttp();
      scheduleReconnect();
    };
  };

  const reconnectNow = () => {
    if (stopped || status === 'open') return;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    attempt = 0;
    open();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') reconnectNow();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', reconnectNow);
    document.addEventListener('visibilitychange', onVisibility);
  }
  open();

  return () => {
    stopped = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', reconnectNow);
      document.removeEventListener('visibilitychange', onVisibility);
    }
    if (reconnectTimer) clearTimeout(reconnectTimer);
    clearSocketTimers();
    stopFallbackPolling();
    if (ws) {
      const s = ws;
      ws = null;
      try {
        s.close();
      } catch {
        /* ignore */
      }
    }
  };
}
