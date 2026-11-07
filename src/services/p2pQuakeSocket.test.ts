import test from 'node:test';
import assert from 'node:assert/strict';
import { connectP2PQuakeSocket } from './p2pQuakeSocket';

class FakeWS {
  static CONNECTING = 0;
  static OPEN = 1;
  static instances: FakeWS[] = [];
  readyState = 0;
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
  send(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('p2p socket de-duplicates by id, back-fills after reconnect and reconnects on close', async () => {
  const g = globalThis as any;
  const savedWS = g.WebSocket;
  const savedFetch = g.fetch;
  g.WebSocket = FakeWS;
  let historyCalls = 0;
  g.fetch = async () => {
    historyCalls++;
    return { ok: true, json: async () => [{ id: 'h1', code: 551 }] };
  };
  const got: string[] = [];
  const stop = connectP2PQuakeSocket({
    onMessage: (p, via) => got.push(`${p.id}:${via}`),
    fallbackPollMs: 50,
  });
  try {
    assert.equal(FakeWS.instances.length, 1);
    FakeWS.instances[0].open();
    await tick(5);
    FakeWS.instances[0].send({ id: 'a', code: 551 });
    FakeWS.instances[0].send({ id: 'a', code: 551 }); // duplicate delivery
    FakeWS.instances[0].send({ id: 'h1', code: 551 }); // already back-filled
    assert.deepEqual(got, ['h1:history', 'a:push']);

    FakeWS.instances[0].close(); // server drop
    await tick(1600); // backoff ~1s
    assert.ok(FakeWS.instances.length >= 2, 'reconnected after close');
    assert.ok(historyCalls >= 2, 'back-filled / polled while disconnected');
  } finally {
    stop();
    g.WebSocket = savedWS;
    g.fetch = savedFetch;
  }
});
