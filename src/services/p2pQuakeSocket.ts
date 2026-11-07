/**
 * Resilient P2P地震情報 WebSocket client (push delivery).
 *
 * P2P地震情報 JSON API v2 (https://github.com/p2pquake/epsp-specifications/blob/master/json-api-v2.yaml):
 * - `wss://api.p2pquake.net/v2/ws` pushes one JSON object per text frame (same schema as /v2/history).
 * - "同一の情報を複数回配信する可能性があります。 `id` を用いて重複を取り除くことを推奨します。"
 * - Connections can be dropped by the server / network at any time, so the client must reconnect.
 *
 * This client:
 * - reconnects automatically with exponential backoff (1s -> 30s, jittered), immediately on `online`
 *   and when the tab becomes visible again;
 * - reconnects if the socket is silent for too long (half-open TCP after sleep / Wi-Fi change);
 * - after every (re)connect, back-fills the most recent earthquake/EEW/tsunami messages from /v2/history
 *   so nothing published during a disconnect is missed;
 * - while the socket is down, polls /v2/history every `fallbackPollMs` (well below the 60 req/min limit);
 * - de-duplicates every message by `id` before handing it to `onMessage`.
 */

export type P2PSocketStatus = 'connecting' | 'open' | 'closed';

export interface P2PQuakeSocketOptions {
  url?: string;
  historyUrl?: string;
  /**
   * Information codes to back-fill / poll from /history (551 地震情報, 556 緊急地震速報).
   * 552 (津波予報) is intentionally not back-filled by default: it is a current-state product that the
   * regular JMA bundle poll already reconciles, and replaying an old one could resurrect an expired alert.
   */
  historyCodes?: number[];
  fallbackPollMs?: number;
  /** Reconnect if no frame was received for this long. */
  silenceTimeoutMs?: number;
  onMessage: (payload: Record<string, any>, via: 'push' | 'history') => void;
  onStatus?: (status: P2PSocketStatus) => void;
}

const DEFAULT_WS_URL = 'wss://api.p2pquake.net/v2/ws';
const DEFAULT_HISTORY_URL = 'https://api.p2pquake.net/v2/history';

export function connectP2PQuakeSocket(opts: P2PQuakeSocketOptions): () => void {
  const url = opts.url ?? DEFAULT_WS_URL;
  const historyUrl = opts.historyUrl ?? DEFAULT_HISTORY_URL;
  const historyCodes = opts.historyCodes ?? [551, 556];
  const fallbackPollMs = opts.fallbackPollMs ?? 15000;
  const silenceTimeoutMs = opts.silenceTimeoutMs ?? 6 * 60 * 1000;

  let ws: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let status: P2PSocketStatus = 'closed';

  // Bounded id set for de-duplication (push + history back-fill share it)
  const seen = new Set<string>();
  const seenOrder: string[] = [];
  const markSeen = (id: string): boolean => {
    if (seen.has(id)) return false;
    seen.add(id);
    seenOrder.push(id);
    if (seenOrder.length > 2000) seen.delete(seenOrder.shift()!);
    return true;
  };

  const setStatus = (s: P2PSocketStatus) => {
    if (status === s) return;
    status = s;
    opts.onStatus?.(s);
  };

  const deliver = (payload: any, via: 'push' | 'history') => {
    if (!payload || typeof payload.code !== 'number') return;
    const id = String(payload.id ?? payload._id ?? '');
    if (id && !markSeen(id)) return;
    try {
      opts.onMessage(payload, via);
    } catch {
      // consumer errors must never kill the socket
    }
  };

  const backfill = async () => {
    try {
      const qs = historyCodes.map((c) => `codes=${c}`).join('&');
      const res = await fetch(`${historyUrl}?${qs}&limit=5`, { cache: 'no-store' });
      if (!res.ok) return;
      const list = (await res.json()) as any[];
      if (!Array.isArray(list) || stopped) return;
      // history is newest-first; deliver oldest-first so consumers see the natural order
      for (let i = list.length - 1; i >= 0; i--) deliver(list[i], 'history');
    } catch {
      // network error: next poll / reconnect will retry
    }
  };

  const startFallbackPolling = () => {
    if (pollTimer || stopped) return;
    pollTimer = setInterval(() => {
      if (status !== 'open') void backfill();
    }, fallbackPollMs);
  };
  const stopFallbackPolling = () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  };

  const armSilenceWatchdog = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      // No frame for a long time: the connection is probably half-open. Force a reconnect.
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    }, silenceTimeoutMs);
  };

  const scheduleReconnect = (delayOverrideMs?: number) => {
    if (stopped || reconnectTimer) return;
    const base = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5));
    const delay = delayOverrideMs ?? base * (0.75 + Math.random() * 0.5);
    attempt++;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      open();
    }, delay);
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
      void backfill(); // catch up on anything published while disconnected
    };
    sock.onmessage = (event) => {
      if (ws !== sock) return;
      armSilenceWatchdog();
      let payload: any;
      try {
        payload = JSON.parse(String(event.data));
      } catch {
        return;
      }
      deliver(payload, 'push');
    };
    sock.onerror = () => {
      // onclose always follows; reconnect is handled there
    };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = null;
      if (stopped) return;
      setStatus('closed');
      startFallbackPolling();
      void backfill();
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
    if (silenceTimer) clearTimeout(silenceTimer);
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
