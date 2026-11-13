import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchLiveJmaTyphoons,
  resetLiveTyphoonCacheForTest,
  selectFeedXmlEntries,
} from './jmaClient';
import { INITIAL_TYPHOONS } from '../data/fallbackData';

function makeSampleJmaSpecs(tcId: string, typhoonNumber = '2612') {
  return [
    {
      typhoonNumber,
      category: { jp: '台風' },
      name: { jp: 'テスト台風', en: 'Test' },
      issue: { JST: '2026-11-12T12:00:00+09:00' },
    },
    {
      part: { jp: '実況' },
      advancedHours: 0,
      validtime: { JST: '2026-11-12T12:00:00+09:00' },
      position: { deg: [25.0, 135.0] },
      pressure: 980,
      maximumWind: { sustained: { 'm/s': 30 }, gust: { 'm/s': 45 } },
      course: '北',
      speed: { 'km/h': 20 },
      location: `${tcId}の南`,
    },
  ];
}

test('fetchLiveJmaTyphoons returns empty array when JMA reports no typhoons and purges legacy 24h storage cache', async () => {
  const g = globalThis as any;
  const savedFetch = g.fetch;
  const savedLocalStorage = g.localStorage;
  resetLiveTyphoonCacheForTest();

  const store = new Map<string, string>([
    [
      'jma_typhoons_24h_cache_v1',
      JSON.stringify([{ ...INITIAL_TYPHOONS[0], lastSeenMs: Date.now() }]),
    ],
  ]);
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  };

  g.fetch = async (url: string) => {
    if (url.includes('targetTc.json')) {
      return { ok: true, status: 200, json: async () => [] };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const res = await fetchLiveJmaTyphoons();
    assert.equal(res.live, true);
    assert.deepEqual(res.typhoons, []);
    assert.equal(store.has('jma_typhoons_24h_cache_v1'), false);
  } finally {
    g.fetch = savedFetch;
    g.localStorage = savedLocalStorage;
    resetLiveTyphoonCacheForTest();
  }
});

test('fetchLiveJmaTyphoons returns empty array (never INITIAL_TYPHOONS) when offline on startup', async () => {
  const g = globalThis as any;
  const savedFetch = g.fetch;
  resetLiveTyphoonCacheForTest();

  g.fetch = async () => {
    throw new Error('network down');
  };

  try {
    const res = await fetchLiveJmaTyphoons();
    assert.equal(res.live, false);
    assert.deepEqual(res.typhoons, []);
  } finally {
    g.fetch = savedFetch;
    resetLiveTyphoonCacheForTest();
  }
});

test('fetchLiveJmaTyphoons keeps active typhoon during transient error, then clears immediately when JMA returns empty', async () => {
  const g = globalThis as any;
  const savedFetch = g.fetch;
  resetLiveTyphoonCacheForTest();

  let mode: 'active' | 'error' | 'empty' = 'active';
  g.fetch = async (url: string) => {
    if (mode === 'error') {
      throw new Error('transient timeout');
    }
    if (url.includes('targetTc.json')) {
      return {
        ok: true,
        status: 200,
        json: async () =>
          mode === 'active' ? [{ tropicalCyclone: 'TC2612' }] : [],
      };
    }
    if (url.includes('specifications.json')) {
      return {
        ok: true,
        status: 200,
        json: async () => makeSampleJmaSpecs('TC2612'),
      };
    }
    if (url.includes('forecast.json')) {
      return { ok: false, status: 404, json: async () => null };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const activeRes = await fetchLiveJmaTyphoons();
    assert.equal(activeRes.live, true);
    assert.equal(activeRes.typhoons.length, 1);
    assert.equal(activeRes.typhoons[0].id, 'TC2612');

    mode = 'error';
    const transientRes = await fetchLiveJmaTyphoons();
    assert.equal(transientRes.live, false);
    assert.equal(transientRes.typhoons.length, 1);

    mode = 'empty';
    const clearedRes = await fetchLiveJmaTyphoons();
    assert.equal(clearedRes.live, true);
    assert.deepEqual(clearedRes.typhoons, []);
  } finally {
    g.fetch = savedFetch;
    resetLiveTyphoonCacheForTest();
  }
});

test('fetchLiveJmaTyphoons does not resurrect a removed typhoon ID when a different ID fails to load', async () => {
  const g = globalThis as any;
  const savedFetch = g.fetch;
  resetLiveTyphoonCacheForTest();

  let phase: 'first' | 'replaced_with_error' = 'first';
  g.fetch = async (url: string) => {
    if (url.includes('targetTc.json')) {
      return {
        ok: true,
        status: 200,
        json: async () =>
          phase === 'first'
            ? [{ tropicalCyclone: 'TC2612' }]
            : [{ tropicalCyclone: 'TC2613' }],
      };
    }
    if (url.includes('TC2612/specifications.json')) {
      return {
        ok: true,
        status: 200,
        json: async () => makeSampleJmaSpecs('TC2612', '2612'),
      };
    }
    if (url.includes('TC2613/specifications.json')) {
      return { ok: false, status: 500, json: async () => null };
    }
    if (url.includes('forecast.json')) {
      return { ok: false, status: 404, json: async () => null };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const firstRes = await fetchLiveJmaTyphoons();
    assert.equal(firstRes.live, true);
    assert.equal(firstRes.typhoons.length, 1);
    assert.equal(firstRes.typhoons[0].id, 'TC2612');

    phase = 'replaced_with_error';
    const secondRes = await fetchLiveJmaTyphoons();
    assert.equal(secondRes.live, false);
    assert.deepEqual(secondRes.typhoons, []);
  } finally {
    g.fetch = savedFetch;
    resetLiveTyphoonCacheForTest();
  }
});

test('selectFeedXmlEntries strips deprecated VPWW50/53/54 and preserves R06/commentary/VPWS50 entries', () => {
  const mkEntry = (idx: number, title: string, dataCode: string) => ({
    id: `urn:jma:${dataCode}:${idx}`,
    title,
    updated: '2026-11-13T12:00:00Z',
    author: '気象庁',
    summary: `${title} summary`,
    content: `${title} summary`,
    link: `https://www.data.jma.go.jp/developer/xml/data/20261113120000_0_${dataCode}_010000.xml`,
    category: 'warnings' as const,
    feedType: 'extra' as const,
  });

  const extraEntries = [
    mkEntry(1, '気象警報・注意報', 'VPWW50'),
    mkEntry(2, '気象特別警報・警報・注意報', 'VPWW53'),
    mkEntry(3, '気象警報・注意報（Ｈ２７）', 'VPWW54'),
    mkEntry(4, '気象警報・注意報（Ｒ０６）（大雨）', 'VPWW55'),
    mkEntry(5, '全般気象解説情報', 'VPZJ51'),
    mkEntry(6, '地方気象解説情報', 'VPCJ51'),
    mkEntry(7, '府県気象解説情報', 'VPFJ51'),
  ];
  const selectedExtra = selectFeedXmlEntries(extraEntries, 'extra');
  assert.deepEqual(
    selectedExtra.map((e) => e.id),
    [
      'urn:jma:VPWW55:4',
      'urn:jma:VPZJ51:5',
      'urn:jma:VPCJ51:6',
      'urn:jma:VPFJ51:7',
    ],
  );

  const regularEntries = [
    { ...mkEntry(10, '気象警報・注意報（Ｒ０６）（集約通報）', 'VPWS50'), feedType: 'regular' as const },
    { ...mkEntry(11, '気象警報・注意報（Ｒ０６）（集約通報）', 'VPWS50'), feedType: 'regular' as const },
    { ...mkEntry(12, '気象警報・注意報（Ｒ０６）（集約通報）', 'VPWS50'), feedType: 'regular' as const },
    { ...mkEntry(13, '府県気象解説情報', 'VPFJ51'), feedType: 'regular' as const },
    ...Array.from({ length: 25 }, (_, i) => ({
      ...mkEntry(100 + i, '一般情報', 'VZSA50'),
      feedType: 'regular' as const,
    })),
  ];
  const selectedRegular = selectFeedXmlEntries(regularEntries, 'regular');
  const vpwsCount = selectedRegular.filter((e) => e.link.includes('VPWS50')).length;
  const vpfjCount = selectedRegular.filter((e) => e.link.includes('VPFJ51')).length;
  assert.equal(vpwsCount, 2);
  assert.equal(vpfjCount, 1);
  assert.equal(selectedRegular.length, 23);
});
