import test from 'node:test';
import assert from 'node:assert/strict';
import { connectWolfxEewSocket } from './wolfxEewSocket';

class FakeWS {
  static CONNECTING = 0;
  static OPEN = 1;
  static instances: FakeWS[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeWS.instances.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  send(text: string) {
    this.sent.push(text);
  }
  push(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('wolfx socket: catch-up query, heartbeat ignored, dedupe, reconnect + HTTP fallback', async () => {
  const g = globalThis as any;
  const savedWS = g.WebSocket;
  const savedFetch = g.fetch;
  g.WebSocket = FakeWS;
  let httpCalls = 0;
  g.fetch = async () => {
    httpCalls++;
    return { ok: true, json: async () => ({ EventID: 'E1', Serial: 2 }) };
  };
  const got: string[] = [];
  const stop = connectWolfxEewSocket({
    onMessage: (p, via) => got.push(`${p.EventID}-${p.Serial}:${via}`),
    fallbackPollMs: 50,
  });
  try {
    const ws = FakeWS.instances[0];
    ws.open();
    assert.deepEqual(ws.sent, ['query_jmaeew']);
    ws.push({ type: 'heartbeat', ver: 25, id: '1', timestamp: 1 });
    ws.push({ type: 'jma_eew', EventID: 'E1', Serial: 1 }); // answer to query
    ws.push({ type: 'jma_eew', EventID: 'E1', Serial: 2 }); // live push
    ws.push({ type: 'jma_eew', EventID: 'E1', Serial: 2 }); // duplicate
    ws.push({ type: 'pong', timestamp: 2 });
    assert.deepEqual(got, ['E1-1:query', 'E1-2:push']);

    ws.close();
    await tick(1600);
    assert.ok(FakeWS.instances.length >= 2, 'reconnected after close');
    assert.ok(httpCalls >= 1, 'polled HTTP while disconnected');
    assert.deepEqual(got, ['E1-1:query', 'E1-2:push'], 'HTTP duplicate suppressed');
  } finally {
    stop();
    g.WebSocket = savedWS;
    g.fetch = savedFetch;
  }
});
