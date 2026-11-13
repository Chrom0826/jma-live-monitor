import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildAmedasFlipCardsFromPages,
  buildSceneFeed,
  buildBottomFlipFeed,
  evaluateTickerPassEnd,
  paginateSegmentsGreedy,
  WEATHER_COMMENTARY_EMPTY_MESSAGE,
} from './sceneFeedBuilder';
import { SceneDetailPanel } from '../components/SceneDetailPanel';
import { REGION_CONFIGS } from './jmaParser';
import {
  INITIAL_AMEDAS_STATIONS,
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

test('buildSceneFeed & buildBottomFlipFeed: render purple 緊急地震速報（特別警報） when isEewSpecialWarning is true', () => {
  const specialEew = {
    id: 'eew-special-1',
    eventId: 'ev-special-1',
    serial: 7,
    issueTime: '20:00:52',
    originTime: '20:00:03',
    hypocenterName: '石川県能登地方',
    lat: 37.49,
    lon: 137.26,
    depthKm: 16,
    magnitude: 7.6,
    isCancelled: false,
    isTest: false,
    isAssumedHypocenter: false,
    maxScaleCode: 70,
    maxScaleLabel: '7',
    maxLpgmClass: 4 as const,
    maxLpgmLabel: '階級4',
    areas: [
      { pref: '石川県', name: '石川県能登', scaleFrom: 70, scaleTo: 70, kindCode: '11', arrivalTime: '20:00:18', lpgmClass: 4 as const },
    ],
    receivedAtMs: Date.now(),
    isWarning: true,
  };

  const sceneFeed = buildSceneFeed({
    effectiveScene: 'earthquake',
    data: mockBundle,
    activeEew: specialEew,
    selectedEarthquake: null,
    pinnedEarthquakeId: null,
    activeWarningDivision: null,
    selectedTyphoon: INITIAL_TYPHOONS[0],
    activeVolcano: null,
    amedasMetric: 'temp',
  });
  assert.equal(sceneFeed.badgeLabel, '緊急地震速報（特別警報）');
  assert.equal(sceneFeed.accentColor, '#9333EA');
  assert.ok(sceneFeed.title.includes('緊急地震速報（特別警報）'));

  const flipFeed = buildBottomFlipFeed({
    effectiveScene: 'earthquake',
    data: mockBundle,
    activeEew: specialEew,
  });
  assert.ok(flipFeed);
  assert.equal(flipFeed!.headerTitle, '緊急地震速報（特別警報） 第7報');
  assert.equal(flipFeed!.accentColor, '#9333EA');
  assert.equal(flipFeed!.cards[0].badge, '緊急地震速報（特別警報）');
  assert.ok(flipFeed!.cards[0].badgeBg.includes('bg-purple-600'));
  assert.ok(flipFeed!.cards[0].mainText.includes('緊急地震速報(特別警報) 強い揺れに警戒'));
});

test('buildSceneFeed & buildBottomFlipFeed: integrate active EEW under Tsunami priority when both are active', () => {
  const specialEew = {
    id: 'eew-noto-7',
    eventId: 'ev-noto-1',
    serial: 7,
    issueTime: '20:00:52',
    originTime: '20:00:03',
    hypocenterName: '石川県能登地方',
    lat: 37.49,
    lon: 137.26,
    depthKm: 16,
    magnitude: 7.6,
    isCancelled: false,
    isTest: false,
    isAssumedHypocenter: false,
    maxScaleCode: 70,
    maxScaleLabel: '7',
    maxLpgmClass: 4 as const,
    maxLpgmLabel: '階級4',
    areas: [
      { pref: '石川県', name: '石川県能登', scaleFrom: 70, scaleTo: 70, kindCode: '11', arrivalTime: '20:00:18', lpgmClass: 4 as const },
    ],
    receivedAtMs: Date.now(),
    isWarning: true,
    isFinal: true,
  };

  const tsunamiBundle = {
    ...mockBundle,
    tsunamiForecast: {
      id: 'ts-noto-major',
      issueTime: '20:05:00',
      cancelled: false,
      source: 'demo' as const,
      areas: [
        {
          code: '360',
          name: '石川県能登',
          grade: 'MajorWarning' as const,
          immediate: true,
          firstHeightText: '津波到達中と推測',
          maxHeightText: '５ｍ',
          maxHeightValue: 5,
        },
        {
          code: '350',
          name: '富山県',
          grade: 'Warning' as const,
          immediate: true,
          firstHeightText: '20:15 到達予想',
          maxHeightText: '３ｍ',
          maxHeightValue: 3,
        },
      ],
    },
  };

  const sceneFeed = buildSceneFeed({
    effectiveScene: 'tsunami',
    data: tsunamiBundle,
    activeEew: specialEew,
    selectedEarthquake: null,
    pinnedEarthquakeId: null,
    activeWarningDivision: null,
    selectedTyphoon: INITIAL_TYPHOONS[0],
    activeVolcano: null,
    amedasMetric: 'temp',
  });
  assert.equal(sceneFeed.sceneId, 'tsunami');
  assert.equal(sceneFeed.badgeLabel, '大津波警報');
  assert.equal(sceneFeed.accentColor, '#C026D3');
  assert.ok(sceneFeed.items.some((i) => i.prefix?.includes('緊急地震速報（特別警報）')));

  const flipFeed = buildBottomFlipFeed({
    effectiveScene: 'tsunami',
    data: tsunamiBundle,
    activeEew: specialEew,
  });
  assert.ok(flipFeed);
  assert.equal(flipFeed!.accentColor, '#C026D3');
  assert.ok(flipFeed!.headerTitle.startsWith('大津波警報 発表中'));
  assert.ok(flipFeed!.headerTitle.includes('緊急地震速報（特別警報）'));
  assert.equal(flipFeed!.cards[0].badge, '大津波警報');
  assert.ok(flipFeed!.cards.some((c) => c.id.startsWith('tsunami-eew-alert-')));
  assert.ok(flipFeed!.cards.some((c) => c.id.startsWith('tsunami-eew-scale-')));
  assert.ok(flipFeed!.cards.some((c) => c.id.startsWith('tsunami-eew-lpgm-')));
});

test('buildSceneFeed & buildBottomFlipFeed & SceneDetailPanel: show empty-state message without past data when typhoons is empty', () => {
  const emptyTyphoonBundle: MonitorDataBundle = {
    ...mockBundle,
    typhoons: [],
  };

  // Even if a stale selectedTyphoon were passed, empty data.typhoons must display empty-state only
  const feed = buildSceneFeed({
    effectiveScene: 'typhoon',
    data: emptyTyphoonBundle,
    activeEew: null,
    selectedEarthquake: null,
    pinnedEarthquakeId: null,
    activeWarningDivision: null,
    selectedTyphoon: INITIAL_TYPHOONS[0],
    activeVolcano: null,
    amedasMetric: 'temp',
  });
  assert.equal(feed.sceneId, 'typhoon');
  assert.equal(feed.textKey, 'typhoon-none');
  assert.equal(feed.items[0].text, '現在台風情報は発表されていません。');
  assert.ok(!feed.title.includes('台風第31号'));
  assert.ok(!feed.items[0].text.includes('インファ'));

  const flip = buildBottomFlipFeed({
    effectiveScene: 'typhoon',
    data: emptyTyphoonBundle,
    activeEew: null,
  });
  assert.ok(flip);
  assert.equal(flip!.isFlipMode, true);
  assert.equal(flip!.cards[0].id, 'typhoon-none-card');
  assert.equal(flip!.cards[0].mainText, '現在台風情報は発表されていません');

  // Active typhoon returns live ticker (flip null)
  const activeFeed = buildSceneFeed({
    effectiveScene: 'typhoon',
    data: mockBundle,
    activeEew: null,
    selectedEarthquake: null,
    pinnedEarthquakeId: null,
    activeWarningDivision: null,
    selectedTyphoon: INITIAL_TYPHOONS[0],
    activeVolcano: null,
    amedasMetric: 'temp',
  });
  assert.ok(activeFeed.title.includes('台風第31号'));
  assert.equal(
    buildBottomFlipFeed({
      effectiveScene: 'typhoon',
      data: mockBundle,
      activeEew: null,
    }),
    null
  );

  // Render SceneDetailPanel directly via SSR to verify DOM output when typhoons is empty
  const htmlEmpty = renderToStaticMarkup(
    React.createElement(SceneDetailPanel, {
      activeScene: 'typhoon',
      activeRegionConfig: REGION_CONFIGS[0],
      data: emptyTyphoonBundle,
      selectedEarthquake: emptyTyphoonBundle.earthquakes[0],
      selectedTyphoon: null,
      typhoonPatrolStep: 1,
      onSelectTyphoon: () => {},
      activeVolcano: emptyTyphoonBundle.volcanoes[0],
      amedasMetric: 'temp',
      onChangeAmedasMetric: () => {},
      onSelectEarthquake: () => {},
      interruptKind: 'none',
      onDismissInterrupt: () => {},
      isLoopPaused: false,
      loopIntervalSec: 15,
      onSceneComplete: () => {},
    })
  );
  assert.ok(htmlEmpty.includes('現在台風情報は発表されていません'));
  assert.ok(htmlEmpty.includes('data-testid="typhoon-none-message"'));
  assert.ok(!htmlEmpty.includes('台風第31号'));
  assert.ok(!htmlEmpty.includes('インファ'));

  // Render SceneDetailPanel with active typhoon to verify detail view still works
  const htmlActive = renderToStaticMarkup(
    React.createElement(SceneDetailPanel, {
      activeScene: 'typhoon',
      activeRegionConfig: REGION_CONFIGS[0],
      data: mockBundle,
      selectedEarthquake: mockBundle.earthquakes[0],
      selectedTyphoon: INITIAL_TYPHOONS[0],
      typhoonPatrolStep: 1,
      onSelectTyphoon: () => {},
      activeVolcano: mockBundle.volcanoes[0],
      amedasMetric: 'temp',
      onChangeAmedasMetric: () => {},
      onSelectEarthquake: () => {},
      interruptKind: 'none',
      onDismissInterrupt: () => {},
      isLoopPaused: false,
      loopIntervalSec: 15,
      onSceneComplete: () => {},
    })
  );
  assert.ok(htmlActive.includes('台風第31号'));
  assert.ok(!htmlActive.includes('現在台風情報は発表されていません'));
});

test('radar and warnings share 24h VPZJ51/VPCJ51/VPFJ51 commentary and show exact empty message when 0 valid within 24h', () => {
  const nowMs = Date.parse('2026-11-14T00:00:00+09:00');
  const freshVpf51 = {
    id: 'https://www.data.jma.go.jp/developer/xml/data/20261113120000_0_VPFJ51_471000.xml',
    link: 'https://www.data.jma.go.jp/developer/xml/data/20261113120000_0_VPFJ51_471000.xml',
    title: '府県気象解説情報',
    updated: '2026-11-13T12:00:00+09:00',
    author: '沖縄気象台',
    content: '【沖縄本島地方気象解説情報】落雷や急な強い雨に注意してください。',
    feedType: 'extra' as const,
    category: 'weather_info' as const,
  };
  const duplicateVpf50 = {
    id: 'https://www.data.jma.go.jp/developer/xml/data/20261113120000_0_VPFJ50_471000.xml',
    link: 'https://www.data.jma.go.jp/developer/xml/data/20261113120000_0_VPFJ50_471000.xml',
    title: '府県気象情報',
    updated: '2026-11-13T12:00:00+09:00',
    author: '沖縄気象台',
    content: '【沖縄本島地方気象解説情報】重複のため除外されるべき電文',
    feedType: 'extra' as const,
    category: 'weather_info' as const,
  };
  const expiredVpz51 = {
    id: 'https://www.data.jma.go.jp/developer/xml/data/20261112140000_0_VPZJ51_010000.xml',
    link: 'https://www.data.jma.go.jp/developer/xml/data/20261112140000_0_VPZJ51_010000.xml',
    title: '全般気象解説情報',
    updated: '2026-11-12T23:00:00+09:00', // 25h old (> 24h)
    author: '気象庁',
    content: '【全般気象解説情報】24時間超過のため除外されるべき電文',
    feedType: 'extra' as const,
    category: 'weather_info' as const,
  };

  const sharedBundle: MonitorDataBundle = {
    ...mockBundle,
    xmlEntries: [freshVpf51, duplicateVpf50, expiredVpz51],
  };

  const radarFeed = buildSceneFeed({
    effectiveScene: 'radar',
    data: sharedBundle,
    activeEew: null,
    selectedEarthquake: null,
    pinnedEarthquakeId: null,
    activeWarningDivision: null,
    selectedTyphoon: null,
    activeVolcano: null,
    amedasMetric: 'temp',
    nowMs,
  });

  const warningsNationwideFeed = buildSceneFeed({
    effectiveScene: 'warnings',
    data: sharedBundle,
    activeEew: null,
    selectedEarthquake: null,
    pinnedEarthquakeId: null,
    activeWarningDivision: null,
    selectedTyphoon: null,
    activeVolcano: null,
    amedasMetric: 'temp',
    nowMs,
  });

  assert.equal(radarFeed.items.length, 1);
  assert.equal(radarFeed.title, '沖縄本島地方気象解説情報');
  assert.equal(radarFeed.items[0].sourceTitle, '沖縄本島地方気象解説情報');
  assert.equal(radarFeed.items[0].prefix, undefined);
  assert.equal(radarFeed.items[0].text, '落雷や急な強い雨に注意してください。');
  assert.equal(warningsNationwideFeed.items.length, 1);
  assert.equal(warningsNationwideFeed.title, '沖縄本島地方気象解説情報');
  assert.equal(warningsNationwideFeed.items[0].prefix, undefined);
  assert.equal(warningsNationwideFeed.items[0].text, '落雷や急な強い雨に注意してください。');
  // Warnings nationwide must not synthesize non-XML boilerplate like "特別警報 ... 発表されています"
  assert.ok(!warningsNationwideFeed.items.some((i) => i.text.includes('発表されています')));

  // When all commentary XMLs are expired (> 24h), both scenes show ONLY the 0-count message
  const expiredOnlyBundle: MonitorDataBundle = {
    ...mockBundle,
    xmlEntries: [expiredVpz51],
  };
  const emptyRadar = buildSceneFeed({
    effectiveScene: 'radar',
    data: expiredOnlyBundle,
    activeEew: null,
    selectedEarthquake: null,
    pinnedEarthquakeId: null,
    activeWarningDivision: null,
    selectedTyphoon: null,
    activeVolcano: null,
    amedasMetric: 'temp',
    nowMs,
  });
  const emptyWarnings = buildSceneFeed({
    effectiveScene: 'warnings',
    data: expiredOnlyBundle,
    activeEew: null,
    selectedEarthquake: null,
    pinnedEarthquakeId: null,
    activeWarningDivision: null,
    selectedTyphoon: null,
    activeVolcano: null,
    amedasMetric: 'temp',
    nowMs,
  });

  assert.deepEqual(emptyRadar.items.map((i) => i.text), [
    WEATHER_COMMENTARY_EMPTY_MESSAGE,
  ]);
  assert.deepEqual(emptyWarnings.items.map((i) => i.text), [
    WEATHER_COMMENTARY_EMPTY_MESSAGE,
  ]);
  assert.equal(emptyRadar.items[0].prefix, undefined);
});

test('warnings zoomed division uses R06 VPWW55-61 / VPWS50 verbatim and rejects deprecated VPWW50/53/54', () => {
  const ishikawaDiv = {
    ...mockBundle.warnings[0],
    id: 'div-170000',
    prefId: 17,
    prefecture: '石川県',
    areaName: '石川県',
    divisionCode: '170000',
    severity: 'warning' as const,
  };

  const vpww55 = {
    id: 'https://www.data.jma.go.jp/developer/xml/data/20261113140000_0_VPWW55_170000.xml',
    link: 'https://www.data.jma.go.jp/developer/xml/data/20261113140000_0_VPWW55_170000.xml',
    title: '気象警報・注意報（Ｒ０６）（大雨）',
    updated: '2026-11-13T14:00:00+09:00',
    author: '金沢地方気象台',
    content: '【石川県大雨警報・注意報】能登では、土砂災害に警戒してください。',
    feedType: 'extra' as const,
    category: 'warnings' as const,
  };
  const vpww53Deprecated = {
    id: 'https://www.data.jma.go.jp/developer/xml/data/20261113140001_0_VPWW53_170000.xml',
    link: 'https://www.data.jma.go.jp/developer/xml/data/20261113140001_0_VPWW53_170000.xml',
    title: '気象特別警報・警報・注意報',
    updated: '2026-11-13T14:00:01+09:00',
    author: '金沢地方気象台',
    content: '廃止予定VPWW53の文言',
    feedType: 'extra' as const,
    category: 'warnings' as const,
  };
  const vpww54Deprecated = {
    id: 'https://www.data.jma.go.jp/developer/xml/data/20261113140002_0_VPWW54_170000.xml',
    link: 'https://www.data.jma.go.jp/developer/xml/data/20261113140002_0_VPWW54_170000.xml',
    title: '気象警報・注意報（Ｈ２７）',
    updated: '2026-11-13T14:00:02+09:00',
    author: '金沢地方気象台',
    content: '廃止予定VPWW54の文言',
    feedType: 'extra' as const,
    category: 'warnings' as const,
  };

  const zoomedFeed = buildSceneFeed({
    effectiveScene: 'warnings',
    data: {
      ...mockBundle,
      xmlEntries: [vpww55, vpww53Deprecated, vpww54Deprecated],
    },
    activeEew: null,
    selectedEarthquake: null,
    pinnedEarthquakeId: null,
    activeWarningDivision: ishikawaDiv,
    selectedTyphoon: null,
    activeVolcano: null,
    amedasMetric: 'temp',
  });

  assert.equal(zoomedFeed.items.length, 1);
  assert.equal(zoomedFeed.title, '石川県大雨警報・注意報');
  assert.equal(zoomedFeed.items[0].sourceTitle, '石川県大雨警報・注意報');
  assert.equal(zoomedFeed.items[0].prefix, undefined);
  assert.equal(zoomedFeed.items[0].text, '能登では、土砂災害に警戒してください。');
  assert.ok(!zoomedFeed.items.some((i) => i.text.includes('廃止予定')));
  assert.ok(!zoomedFeed.items.some((i) => i.text.includes('該当地域の各市区町村')));

  // Fallback to VPWS50 summary when no VPWW55-61 exists for the zoomed division
  const vpws50ZoomFeed = buildSceneFeed({
    effectiveScene: 'warnings',
    data: {
      ...mockBundle,
      xmlEntries: [vpww53Deprecated, vpww54Deprecated],
      vpws50Summaries: { '170000': ['大雨警報', '暴風警報'] },
      vpws50Updated: '2026-11-13T14:10:00+09:00',
    },
    activeEew: null,
    selectedEarthquake: null,
    pinnedEarthquakeId: null,
    activeWarningDivision: ishikawaDiv,
    selectedTyphoon: null,
    activeVolcano: null,
    amedasMetric: 'temp',
  });

  assert.equal(vpws50ZoomFeed.items.length, 1);
  assert.ok(vpws50ZoomFeed.items[0].text.includes('大雨警報・暴風警報'));
  assert.equal(vpws50ZoomFeed.items[0].prefix, undefined);
  assert.ok(vpws50ZoomFeed.title.includes('集約通報'));
});

test('evaluateTickerPassEnd waits for >= 15s and finishes current pass before advancing', () => {
  // Pass 0 finishes early at 8s (< 15s) -> stream next item instead of completing
  const early = evaluateTickerPassEnd({
    isDriverScene: true,
    isPausedOrInterrupted: false,
    activeElapsedMs: 8000,
    minDurationSec: 15,
    currentPassIndex: 0,
    itemCount: 3,
  });
  assert.equal(early.shouldSignalComplete, false);
  assert.equal(early.nextPassIndex, 1);

  // Pass 1 finishes at 17s (>= 15s) -> completes and moves to next scene without showing item 2
  const finishedAfterMin = evaluateTickerPassEnd({
    isDriverScene: true,
    isPausedOrInterrupted: false,
    activeElapsedMs: 17000,
    minDurationSec: 15,
    currentPassIndex: 1,
    itemCount: 3,
  });
  assert.equal(finishedAfterMin.shouldSignalComplete, true);
  assert.equal(finishedAfterMin.nextPassIndex, 2);

  // Paused/interrupted must never signal completion
  const paused = evaluateTickerPassEnd({
    isDriverScene: true,
    isPausedOrInterrupted: true,
    activeElapsedMs: 25000,
    minDurationSec: 15,
    currentPassIndex: 0,
    itemCount: 1,
  });
  assert.equal(paused.shouldSignalComplete, false);
});

test('buildBottomFlipFeed: amedas displays 8 major cities with dynamic pagination and metric titles', () => {
  const amedasBundle: MonitorDataBundle = {
    ...mockBundle,
    amedas: INITIAL_AMEDAS_STATIONS,
  };

  const tempFlip = buildBottomFlipFeed({
    effectiveScene: 'amedas',
    data: amedasBundle,
    activeEew: null,
    amedasMetric: 'temp',
  });
  assert.ok(tempFlip);
  assert.equal(tempFlip.headerTitle, '現在の気温');
  assert.equal(tempFlip.stopOnLastCard, true);
  assert.equal(tempFlip.citySegments?.length, 8);
  assert.deepEqual(
    tempFlip.citySegments?.map((s) => s.split(' ')[0]),
    ['札幌', '仙台', '東京', '名古屋', '大阪', '広島', '福岡', '那覇']
  );
  assert.ok(tempFlip.citySegments?.[0].endsWith('℃'));

  const precipFlip = buildBottomFlipFeed({
    effectiveScene: 'amedas',
    data: amedasBundle,
    activeEew: null,
    amedasMetric: 'precip',
  });
  assert.equal(precipFlip?.headerTitle, '現在の1時間降水量');
  assert.ok(precipFlip?.citySegments?.[0].endsWith('mm'));

  const windFlip = buildBottomFlipFeed({
    effectiveScene: 'amedas',
    data: amedasBundle,
    activeEew: null,
    amedasMetric: 'wind',
  });
  assert.equal(windFlip?.headerTitle, '現在の風向・風速');
  assert.ok(windFlip?.citySegments?.[0].endsWith('m/s'));

  const snowFlip = buildBottomFlipFeed({
    effectiveScene: 'amedas',
    data: amedasBundle,
    activeEew: null,
    amedasMetric: 'snow',
  });
  assert.equal(snowFlip?.headerTitle, '現在の積雪深');
  assert.ok(snowFlip?.citySegments?.[0].endsWith('cm'));

  // Dynamic pagination packs as many cities as fit per screen width
  const segs = tempFlip.citySegments!;
  // Narrow screen (fits max 30 chars): spills cleanly into multiple cards joined by '／'
  const narrowPages = paginateSegmentsGreedy(segs, (line) => line.length <= 26);
  assert.ok(narrowPages.length >= 3);
  assert.deepEqual(narrowPages.flat(), segs);

  // Medium laptop screen (fits 5 cities on page 1, remaining 3 on page 2)
  const midPages = paginateSegmentsGreedy(segs, (line) => line.length <= 45);
  assert.equal(midPages.length, 2);
  const midCards = buildAmedasFlipCardsFromPages(midPages, 'temp');
  assert.equal(midCards.length, 2);
  assert.ok(midCards[0].mainText.includes('／'));
  assert.equal(midCards[0].badge, '');

  // Wide screen (all 8 fit on 1 card)
  const widePages = paginateSegmentsGreedy(segs, (line) => line.length <= 200);
  assert.equal(widePages.length, 1);
  assert.equal(widePages[0].length, 8);
});
