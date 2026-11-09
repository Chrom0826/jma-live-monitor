import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneFeed, buildBottomFlipFeed } from './sceneFeedBuilder';
import {
  INITIAL_EARTHQUAKES,
  INITIAL_FORECASTS,
  INITIAL_TYPHOONS,
  INITIAL_VOLCANOES,
  INITIAL_WARNINGS,
  INITIAL_XML_ENTRIES,
} from '../data/fallbackData';
import { MonitorDataBundle, TyphoonReport } from '../types/jma';

const mockBundle: MonitorDataBundle = {
  xmlEntries: INITIAL_XML_ENTRIES,
  nowcastTimes: [],
  lightningPoints: [{ id: 'l1', lat: 35, lon: 139, timeJst: '12:00', type: 1, validtime: '20261108' }],
  warnings: INITIAL_WARNINGS,
  municipalityWarnings: [],
  muniSeverityMap: {},
  prefSeverityMap: { 1: 'warning' },
  typhoons: INITIAL_TYPHOONS,
  bulletins: [],
  amedas: [
    {
      id: 'st-1',
      stationName: '東京',
      prefecture: '東京都',
      regionId: 'kanto',
      lat: 35.68,
      lon: 139.75,
      temp: 18.5,
      hasTemp: true,
      precip1h: 0,
      windSpeed: 3.2,
      windDirection: '北北西',
      humidity: 50,
      snowCm: 0,
      observedAt: '12:00',
    },
    {
      id: 'st-2',
      stationName: '札幌',
      prefecture: '北海道',
      regionId: 'hokkaido',
      lat: 43.06,
      lon: 141.35,
      temp: 8.2,
      hasTemp: true,
      precip1h: 2.5,
      windSpeed: 8.5,
      windDirection: '西北西',
      humidity: 70,
      snowCm: 5,
      observedAt: '12:00',
    },
  ],
  volcanoes: INITIAL_VOLCANOES,
  tsunamiStations: [],
  tsunamiForecast: {
    id: 'ts-1',
    issueTime: '12:00',
    cancelled: false,
    source: 'jma',
    areas: [],
  },
  forecasts: INITIAL_FORECASTS,
  earthquakes: INITIAL_EARTHQUAKES,
  lastXmlFetchTime: '12:00:00',
  dataSourceStatus: { jmaXmlLive: true, jmaBosaiLive: true, p2pQuakeLive: true },
};

test('buildSceneFeed: earthquake scene produces customized earthquake headline and stations', () => {
  const feed = buildSceneFeed({
    effectiveScene: 'earthquake',
    data: mockBundle,
    activeEew: null,
    selectedEarthquake: null,
    pinnedEarthquakeId: null,
    activeWarningDivision: null,
    selectedTyphoon: INITIAL_TYPHOONS[0],
    activeVolcano: null,
    amedasMetric: 'temp',
  });

  assert.equal(feed.sceneId, 'earthquake');
  assert.equal(feed.badgeLabel, '地震情報');
  assert.ok(feed.title.includes('震源・震度'));
  assert.ok(feed.items.length >= 2);
  assert.ok(feed.items[0].text.includes('最大震度'));
});

test('buildSceneFeed: forecast scene produces 18-cities weather and overview', () => {
  const feed = buildSceneFeed({
    effectiveScene: 'forecast',
    data: mockBundle,
    activeEew: null,
    selectedEarthquake: null,
    pinnedEarthquakeId: null,
    activeWarningDivision: null,
    selectedTyphoon: INITIAL_TYPHOONS[0],
    activeVolcano: null,
    amedasMetric: 'temp',
  });

  assert.equal(feed.sceneId, 'forecast');
  assert.equal(feed.badgeLabel, '全国の天気予報');
  assert.ok(feed.title.includes('天気予報'));
  assert.ok(feed.items[0].text.includes('【'));
});

test('buildSceneFeed: warnings scene produces nationwide summary and regional breakdown', () => {
  const feed = buildSceneFeed({
    effectiveScene: 'warnings',
    data: mockBundle,
    activeEew: null,
    selectedEarthquake: null,
    pinnedEarthquakeId: null,
    activeWarningDivision: null,
    selectedTyphoon: INITIAL_TYPHOONS[0],
    activeVolcano: null,
    amedasMetric: 'temp',
  });

  assert.equal(feed.sceneId, 'warnings');
  assert.equal(feed.badgeLabel, '気象警報・注意報');
  assert.ok(feed.items.length >= 1);
});

test('buildSceneFeed: amedas scene produces ranking items only without overview', () => {
  const feed = buildSceneFeed({
    effectiveScene: 'amedas',
    data: mockBundle,
    activeEew: null,
    selectedEarthquake: null,
    pinnedEarthquakeId: null,
    activeWarningDivision: null,
    selectedTyphoon: INITIAL_TYPHOONS[0],
    activeVolcano: null,
    amedasMetric: 'temp',
  });

  assert.equal(feed.sceneId, 'amedas');
  assert.ok(feed.title.includes('気温'));
  assert.ok(feed.items[0].text.includes('第1位'));
  // Verify 観測概要 is NOT included
  assert.ok(!feed.items.some((i) => i.prefix?.includes('観測概要') || i.text.includes('観測網')));
});

test('buildSceneFeed: radar scene produces meteorological commentary only', () => {
  const feed = buildSceneFeed({
    effectiveScene: 'radar',
    data: mockBundle,
    activeEew: null,
    selectedEarthquake: null,
    pinnedEarthquakeId: null,
    activeWarningDivision: null,
    selectedTyphoon: INITIAL_TYPHOONS[0],
    activeVolcano: null,
    amedasMetric: 'temp',
  });

  assert.equal(feed.sceneId, 'radar');
  assert.ok(feed.items.length >= 1);
  // Verify purely meteorological commentaries, no Doppler/lightning counter boilerplate
  assert.ok(!feed.items.some((i) => i.text.includes('ドップラーレーダー')));
  assert.ok(!feed.items.some((i) => i.text.includes('落雷検知実況')));
});


test('buildBottomFlipFeed: returns null for normal radar scene without active tsunami', () => {
  const result = buildBottomFlipFeed({
    effectiveScene: 'radar',
    data: mockBundle,
    activeEew: null,
  });
  assert.equal(result, null);
});

test('buildBottomFlipFeed: produces flip cards for earthquake scene (pref, hypocenter, tsunami status, stations)', () => {
  // 1. Normal patrol loop (past earthquakes headline format)
  const result = buildBottomFlipFeed({
    effectiveScene: 'earthquake',
    data: mockBundle,
    activeEew: null,
    selectedEarthquake: mockBundle.earthquakes[0],
    isLiveInterrupt: false,
  });

  assert.ok(result);
  assert.equal(result.isFlipMode, true);
  assert.ok(result.cards.length >= 3);
  // Card 1: 2026 11/5 13:39 ごろ茨城県で最大震度4の地震がありました
  assert.ok(result.cards[0].mainText.includes(' ごろ茨城県で最大震度4の地震がありました'));
  assert.equal(result.cards[0].subText, '');
  // Card 2: 震源: 茨城県沖　最大震度4　M4.8　深さ: 約40km (深さも大きく表示)
  assert.ok(result.cards[1].mainText.includes('震源: 茨城県沖'));
  assert.ok(result.cards[1].mainText.includes('最大震度4'));
  assert.ok(result.cards[1].mainText.includes('深さ: 約40km'));
  assert.equal(result.cards[1].subText, '');
  // Card 3: 津波の心配なし
  assert.ok(result.cards[2].mainText.includes('津波の心配なし'));

  // 2. Breaking live interrupt headline format
  const resultLive = buildBottomFlipFeed({
    effectiveScene: 'earthquake',
    data: mockBundle,
    activeEew: null,
    selectedEarthquake: mockBundle.earthquakes[0],
    isLiveInterrupt: true,
  });
  assert.ok(resultLive);
  assert.ok(resultLive.cards[0].mainText.includes('茨城県で震度4を観測'));
});

test('buildBottomFlipFeed: produces EEW flip cards during active EEW', () => {
  const mockEew = {
    id: 'eew-test-1',
    eventId: 'ev-1',
    serial: 4,
    issueTime: '11:18:30',
    originTime: '11:18:20',
    hypocenterName: '愛知県西部',
    lat: 35.1,
    lon: 136.9,
    depthKm: 10,
    magnitude: 5.7,
    isCancelled: false,
    isTest: false,
    isAssumedHypocenter: false,
    maxScaleCode: 50,
    maxScaleLabel: '5強',
    areas: [{ pref: '愛知県', name: '愛知県西部', scaleFrom: 50, scaleTo: 50, kindCode: '11', arrivalTime: '11:18:40' }],
    receivedAtMs: Date.now(),
    isWarning: true,
  };

  const result = buildBottomFlipFeed({
    effectiveScene: 'earthquake',
    data: mockBundle,
    activeEew: mockEew,
  });

  assert.ok(result);
  assert.equal(result.isFlipMode, true);
  assert.ok(result.cards.some((c) => c.mainText.includes('緊急地震速報(警報) 強い揺れに警戒')));
  assert.ok(result.cards.some((c) => c.mainText.includes('予想最大震度5強 M5.7')));
});

test('buildBottomFlipFeed: tsunami warning prioritizes over radar scene', () => {
  const tsunamiBundle = {
    ...mockBundle,
    tsunamiForecast: {
      id: 'ts-test-warn',
      issueTime: '11:20:00',
      cancelled: false,
      source: 'jma' as const,
      areas: [
        {
          name: '愛知県外海',
          grade: 'Warning' as const,
          immediate: true,
          firstHeightText: '直ちに到達',
          maxHeightText: '3m',
          maxHeightValue: 3,
        },
      ],
    },
  };

  const result = buildBottomFlipFeed({
    effectiveScene: 'radar',
    data: tsunamiBundle,
    activeEew: null,
  });

  assert.ok(result);
  assert.equal(result.isFlipMode, true);
  assert.ok(result.cards[0].mainText.includes('津波警報　安全な場所に避難'));
  assert.ok(result.cards[1].mainText.includes('3mの津波を予想'));
});
