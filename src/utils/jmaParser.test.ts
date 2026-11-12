import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_FORECASTS,
  TEST_EEW_FORECAST_REPORT,
  TEST_EEW_REPORTS,
  TEST_NOTO_EARTHQUAKE_DEMO,
} from '../data/fallbackData';
import {
  computeEewAreaLpgmClasses,
  computeEewWaveRadiiKm,
  doesEarthquakeMatchEew,
  formatEewArrivalLabel,
  formatEewScaleRange,
  formatOccurrenceTimeJa,
  getSeismicScaleBadgeStyle,
  getTsunamiAlertSeverity,
  hasActualEewLpgm,
  isEewSpecialWarning,
  isEewStillActive,
  parseJmaTsunamiDetail,
  isEewFinal,
  isEewWarning,
  mergeEew,
  parseLpgmClassValue,
  parseP2PEew,
  parseP2PEewDetection,
  parseP2PTsunami,
  parseWolfxEew,
  parseWolfxShindo,
  shouldReplaceEew,
} from './eewTsunami';
import {
  AMEDAS_PATROL_STOPS,
  AUTO_PATROL_SEQUENCE,
  buildCity3HourlySlots,
  classifyJmaWeatherDescriptor,
  decideIncomingEarthquake,
  isSameEarthquakeEvent,
  classifyXmlEntryScene,
  computeAmedasTop5Rankings,
  computeTyphoonConeEnvelope,
  computeTyphoonStormEnvelope,
  computeWarningSummary,
  DEFAULT_NORMAL_LOOP_SCENES,
  filterNonOverlappingPoints,
  formatCompactTyphoonCenterLabel,
  formatCompactTyphoonTime,
  formatMunicipalityMapLabel,
  formatSeismicScale,
  formatWarningDivisionMapLabel,
  getActiveSevereWarningDivisions,
  getAmedasMetricColor,
  getAmedasPointRadiusForZoom,
  getAmedasTempGradientColor,
  getAmedasWindArrowSizeForZoom,
  getNextAmedasMetric,
  getNextPatrolStep,
  getNextSceneId,
  getNextSubRegion,
  getWarningMapZoomTier,
  getWindDirectionRotationDeg,
  interpolateArchipelagoSweepPosition,
  isExtratropicalCyclone,
  MAJOR_FORECAST_CITY_TARGETS,
  mergeProgressiveEarthquakeReports,
  parseJmaAmedasNationwide,
  parseJmaAtomXml,
  parseJmaCityForecastJson,
  parseJmaIntensityString,
  parseJmaIsoCoordinate,
  parseJmaQuakeDetailJson,
  renderBroadcastWeatherSvg,
  parseJmaTyphoonSpecifications,
  parseJmaWarningMapData,
  resolveLabelBoxCollisions,
  selectNonOverlappingAmedasStations,
  WARNING_DIVISIONS,
} from './jmaParser';

test('formatSeismicScale maps numeric codes to JMA intensity labels', () => {
  assert.equal(formatSeismicScale(10), '1');
  assert.equal(formatSeismicScale(40), '4');
  assert.equal(formatSeismicScale(45), '5-');
  assert.equal(formatSeismicScale(50), '5+');
  assert.equal(formatSeismicScale(55), '6-');
  assert.equal(formatSeismicScale(60), '6+');
  assert.equal(formatSeismicScale(70), '7');
  assert.equal(formatSeismicScale(999), '-');
});

test('classifyXmlEntryScene routes JMA telegrams into appropriate scenes including typhoon', () => {
  assert.equal(
    classifyXmlEntryScene('震源・震度に関する情報', '最大震度４を観測しました', 'eqvol'),
    'earthquake'
  );
  assert.equal(
    classifyXmlEntryScene('台風解析・予報情報（５日予報）', '大型で強い台風第２２号は北東へ進んでいます', 'extra'),
    'typhoon'
  );
  assert.equal(
    classifyXmlEntryScene('噴火警報・予報', '桜島に火口周辺警報（噴火警戒レベル３）', 'eqvol'),
    'volcano'
  );
  assert.equal(
    classifyXmlEntryScene('津波予報', '若干の海面変動が予想されます', 'eqvol'),
    'tsunami'
  );
  assert.equal(
    classifyXmlEntryScene('気象特別警報・警報・注意報', '大雨警報を発表', 'extra'),
    'warnings'
  );
  assert.equal(
    classifyXmlEntryScene('全般気象情報', '低気圧と前線による大雨に関する全般気象情報', 'extra'),
    'weather_info'
  );
  assert.equal(
    classifyXmlEntryScene('府県天気概況', '東京地方では晴れるでしょう', 'regular'),
    'forecast'
  );
});

test('parseJmaAtomXml extracts entries from JMA Atom XML feed', () => {
  const sampleXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" lang="ja">
  <title>高頻度フィード（地震火山）</title>
  <entry>
    <title>震源・震度に関する情報</title>
    <id>urn:uuid:test-eq-001</id>
    <updated>2026-11-05T12:00:00Z</updated>
    <author><name>気象庁本庁</name></author>
    <link type="application/xml" href="https://www.data.jma.go.jp/developer/xml/data/test1.xml"/>
    <content type="text">【震源・震度に関する情報】５日２１時００分ころ、地震がありました。</content>
  </entry>
</feed>`;

  const parsed = parseJmaAtomXml(sampleXml, 'eqvol');
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, 'urn:uuid:test-eq-001');
  assert.equal(parsed[0].author, '気象庁本庁');
  assert.equal(parsed[0].category, 'earthquake');
});

test('DEFAULT_NORMAL_LOOP_SCENES includes typhoon and earthquake and excludes weather_info and interrupt-only scenes', () => {
  assert.equal(DEFAULT_NORMAL_LOOP_SCENES.includes('typhoon'), true);
  assert.equal(DEFAULT_NORMAL_LOOP_SCENES.includes('earthquake'), true);
  assert.equal(DEFAULT_NORMAL_LOOP_SCENES.includes('weather_info'), false);
  assert.equal(DEFAULT_NORMAL_LOOP_SCENES.includes('volcano'), false);
  assert.equal(DEFAULT_NORMAL_LOOP_SCENES.includes('tsunami'), false);
  assert.equal(getNextSceneId('warnings', DEFAULT_NORMAL_LOOP_SCENES), 'typhoon');
  assert.equal(getNextSceneId('typhoon', DEFAULT_NORMAL_LOOP_SCENES), 'amedas');
  assert.equal(getNextSceneId('forecast', DEFAULT_NORMAL_LOOP_SCENES), 'earthquake');
  assert.equal(getNextSceneId('earthquake', DEFAULT_NORMAL_LOOP_SCENES), 'radar');
});

test('parseJmaTyphoonSpecifications parses JMA specifications.json and computeTyphoonConeEnvelope generates cone', () => {
  const sampleSpecs = [
    {
      part: 'title',
      issue: { JST: '2026-11-05T21:45:00+09:00' },
      typhoonNumber: '2631',
      name: { jp: 'インファ', en: 'In-fa' },
      category: { jp: '台風', en: 'STS' },
    },
    {
      part: { jp: '実況', en: 'Analysis' },
      maximumWind: { sustained: { 'm/s': '25' }, gust: { 'm/s': '35' } },
      galeWarning: [{ area: '南東', range: { km: 390 } }],
      advancedHours: 0,
      category: { jp: '台風', en: 'STS' },
      position: { deg: [31.3, 144.2] },
      location: '日本の東',
      course: '北東',
      speed: { 'km/h': '55' },
      pressure: '985',
      validtime: { JST: '2026-11-05T21:00:00+09:00' },
    },
    {
      part: { jp: '予報　１２時間後', en: 'Forecast for 12 hours ahead' },
      maximumWind: { sustained: { 'm/s': '25' }, gust: { 'm/s': '35' } },
      advancedHours: 12,
      category: { jp: '台風', en: 'STS' },
      position: { deg: [37.7, 152.2] },
      probabilityCircleRadius: { km: 85 },
      location: '日本の東',
      course: '北東',
      speed: { 'km/h': '85' },
      pressure: '985',
      validtime: { JST: '2026-11-06T09:00:00+09:00' },
    },
  ];

  const sampleForecast = [
    { issue: { JST: '2026-11-05T21:45:00+09:00' } },
    {
      advancedHours: 0,
      track: {
        preTyphoon: [[21.5, 135.4]],
        typhoon: [
          [24.3, 137.2],
          [31.3, 144.2],
        ],
      },
    },
  ];

  const report = parseJmaTyphoonSpecifications(
    sampleSpecs,
    'TC2637',
    sampleForecast
  );
  assert.ok(report);
  assert.equal(report.displayNumber, '台風第31号');
  assert.equal(report.nameJp, 'インファ');
  assert.equal(report.points.length, 2);
  assert.equal(report.points[0].galeRadiusKm, 390);
  assert.equal(report.points[1].probabilityCircleRadiusKm, 85);
  assert.equal(formatCompactTyphoonTime(report.points[1].timeLabel), '06日09時');
  assert.equal(
    formatCompactTyphoonCenterLabel(report, report.points[0]),
    '台風第31号'
  );
  assert.ok(report.pastTrack);
  assert.equal(report.pastTrack.length, 3);

  const cone = computeTyphoonConeEnvelope(report.points);
  assert.equal(cone.leftEdge.length, 2);
  assert.equal(cone.rightEdge.length, 2);
  assert.equal(cone.polygon.length, 4);

  // Verify storm warning envelope connecting consecutive storm circles into a single shape
  const stormEnv = computeTyphoonStormEnvelope([
    { lat: 31.3, lon: 144.2, stormRadiusKm: 110, probabilityCircleRadiusKm: 0 } as any,
    { lat: 37.7, lon: 152.2, stormRadiusKm: 95, probabilityCircleRadiusKm: 85 } as any,
  ]);
  assert.ok(stormEnv.polygon.length >= 4);
  assert.ok(stormEnv.leftEdge.length >= 2);
  assert.ok(stormEnv.rightEdge.length >= 2);
});

test('parseJmaWarningMapData maps JMA area codes to prefecture severity choropleth', () => {
  const sampleMapJson = [
    {
      reportDatetime: '2026-11-05T12:00:00+09:00',
      areaTypes: [
        {
          areas: [
            {
              code: '016020',
              warnings: [
                { code: '14', status: '継続' },
                { code: '15', status: '継続' },
              ],
            },
            {
              code: '020000',
              warnings: [
                { code: '07', status: '発表' },
                { code: '14', status: '継続' },
              ],
            },
          ],
        },
      ],
    },
  ];

  const { warnings, prefSeverityMap } = parseJmaWarningMapData(sampleMapJson);
  assert.equal(prefSeverityMap[1], 'advisory');
  assert.equal(prefSeverityMap[2], 'warning');
  assert.equal(prefSeverityMap[13], 'normal');
  assert.equal(warnings.length, 2);
});

test('getAmedasTempGradientColor, parseJmaAmedasNationwide, resolveLabelBoxCollisions, and filterNonOverlappingPoints work accurately', () => {
  assert.equal(getAmedasTempGradientColor(5), '#BFDBFE');
  assert.equal(getAmedasTempGradientColor(18), '#FDE047');
  assert.equal(getAmedasTempGradientColor(27), '#F97316');

  const parsedStations = parseJmaAmedasNationwide(
    {
      '44132': { kjName: '東京', lat: [35, 41.5], lon: [139, 45.0] },
      '11001': { kjName: '宗谷岬', lat: [45, 31.2], lon: [141, 56.1] },
    },
    {
      '44132': {
        temp: [16.4, 0],
        precipitation1h: [0.0, 0],
        wind: [3.2, 0],
        windDirection: [16, 0],
        humidity: [55, 0],
      },
      '11001': {
        temp: [null, null],
        precipitation1h: [4.5, 0],
      },
    },
    '01:10',
    {
      '11001': {
        snow: [12, 0],
      },
    }
  );
  assert.equal(parsedStations.length, 2);
  const tokyo = parsedStations.find((s) => s.id === '44132');
  const soya = parsedStations.find((s) => s.id === '11001');
  assert.ok(tokyo);
  assert.equal(tokyo.stationName, '東京');
  assert.equal(tokyo.temp, 16.4);
  assert.ok(soya);
  assert.equal(soya.stationName, '宗谷岬');
  assert.equal(soya.hasTemp, false);
  assert.equal(soya.precip1h, 4.5);
  assert.equal(soya.snowCm, 12);
  assert.equal(getAmedasMetricColor(soya, 'snow'), '#BAE6FD');
  assert.ok(getAmedasPointRadiusForZoom(8) > getAmedasPointRadiusForZoom(5));
  assert.equal(getWindDirectionRotationDeg('北'), 180);
  assert.equal(getWindDirectionRotationDeg('南'), 0);
  assert.equal(getWindDirectionRotationDeg('西'), 90);
  assert.equal(getNextAmedasMetric('temp', parsedStations), 'precip');
  assert.equal(getNextAmedasMetric('precip', parsedStations), 'wind');
  assert.equal(getNextAmedasMetric('wind', parsedStations), 'snow');
  assert.equal(getNextAmedasMetric('snow', parsedStations), null);

  const overlapping = [
    { id: 'sendai', anchorX: 200, anchorY: 150, x: 180, y: 140, width: 120, height: 28 },
    { id: 'niigata', anchorX: 195, anchorY: 154, x: 175, y: 145, width: 120, height: 28 },
  ];
  const resolved = resolveLabelBoxCollisions(overlapping, 6);
  const verticalGap = Math.abs(resolved[0].y - resolved[1].y);
  assert.ok(verticalGap >= 28);

  const sampleDots = [
    { id: 'a', lat: 35.0, lon: 139.0 },
    { id: 'b', lat: 35.01, lon: 139.01 }, // too close in pixel space
    { id: 'c', lat: 36.0, lon: 140.0 },
  ];
  const filtered = filterNonOverlappingPoints(
    sampleDots,
    (lat, lon) => ({ x: lon * 100, y: lat * 100 }),
    6
  );
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0].id, 'a');
  assert.equal(filtered[1].id, 'c');
});

test('getNextSubRegion cycles through all Japan regions', () => {
  assert.equal(getNextSubRegion('national'), 'hokkaido');
  assert.equal(getNextSubRegion('okinawa'), 'national');
});

test('computeWarningSummary aggregates warning severities accurately', () => {
  const summary = computeWarningSummary([
    {
      id: '1',
      prefId: 46,
      prefecture: '鹿児島県',
      regionId: 'kyushu',
      areaName: '薩摩地方',
      lat: 31.6,
      lon: 130.5,
      severity: 'warning',
      activeWarnings: ['大雨'],
      badgeItems: [{ code: '03', name: '大雨', severity: 'warning' }],
      updatedAt: '12:00',
      office: '鹿児島地方気象台',
      headline: '大雨に警戒',
    },
  ]);

  assert.equal(summary.warningCount, 1);
});

test('parseJmaQuakeDetailJson extracts hypocenter and individual IntensityStation coordinates', () => {
  assert.deepEqual(parseJmaIntensityString('3'), { scaleCode: 30, scaleLabel: '3' });
  assert.deepEqual(parseJmaIntensityString('5-'), { scaleCode: 45, scaleLabel: '5-' });
  assert.deepEqual(parseJmaIsoCoordinate('+37.8+141.5-80000/'), {
    lat: 37.8,
    lon: 141.5,
    depthKm: 80,
  });

  const sampleDetail = {
    Control: { EditorialOffice: '気象庁本庁' },
    Head: {
      EventID: '20261106030553',
      ReportDateTime: '2026-11-06T03:09:00+09:00',
    },
    Body: {
      Earthquake: {
        OriginTime: '2026-11-06T03:05:00+09:00',
        Hypocenter: {
          Area: {
            Name: '福島県沖',
            Coordinate: '+37.8+141.5-80000/',
          },
        },
        Magnitude: '4.3',
      },
      Intensity: {
        Observation: {
          MaxInt: '2',
          Pref: [
            {
              Name: '岩手県',
              Code: '03',
              MaxInt: '2',
              Area: [
                {
                  Name: '岩手県内陸南部',
                  City: [
                    {
                      Name: '一関市',
                      MaxInt: '2',
                      IntensityStation: [
                        {
                          Name: '一関市室根町＊',
                          Code: '0320938',
                          Int: '2',
                          latlon: { lat: 38.94, lon: 141.44 },
                        },
                        {
                          Name: '一関市大東町',
                          Code: '0320902',
                          Int: '1',
                          latlon: { lat: 39.02, lon: 141.4 },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      Comments: {
        ForecastComment: {
          Text: 'この地震による津波の心配はありません。',
        },
      },
    },
  };

  const eq = parseJmaQuakeDetailJson(sampleDetail);
  assert.ok(eq);
  assert.equal(eq.hypocenterName, '福島県沖');
  assert.equal(eq.lat, 37.8);
  assert.equal(eq.lon, 141.5);
  assert.equal(eq.depthKm, 80);
  assert.equal(eq.maxScaleLabel, '2');
  assert.equal(eq.stations.length, 2);
  assert.equal(eq.stations[0].stationName, '一関市室根町');
  assert.equal(eq.stations[0].scaleLabel, '2');
  assert.equal(eq.stations[0].lat, 38.94);
  assert.equal(eq.stations[0].lon, 141.44);
  assert.equal(eq.stations[1].scaleLabel, '1');
});

test('AUTO_PATROL_SEQUENCE, getNextPatrolStep, municipalityWarnings, isExtratropicalCyclone, getAmedasWindArrowSizeForZoom, and computeAmedasTop5Rankings work accurately', () => {
  // 1. Patrol sequence: national -> hokkaido -> tohoku -> ... -> okinawa -> national -> completedCycle
  assert.equal(AUTO_PATROL_SEQUENCE[0], 'national');
  assert.equal(AUTO_PATROL_SEQUENCE[1], 'hokkaido');
  assert.equal(AUTO_PATROL_SEQUENCE[2], 'tohoku');
  assert.equal(AUTO_PATROL_SEQUENCE[8], 'okinawa');
  assert.equal(AUTO_PATROL_SEQUENCE[9], 'national');

  const step0 = getNextPatrolStep(0);
  assert.equal(step0.nextStepIndex, 1);
  assert.equal(step0.regionId, 'hokkaido');
  assert.equal(step0.completedCycle, false);

  const step8 = getNextPatrolStep(8);
  assert.equal(step8.nextStepIndex, 9);
  assert.equal(step8.regionId, 'national');
  assert.equal(step8.completedCycle, false);

  const step9 = getNextPatrolStep(9);
  assert.equal(step9.nextStepIndex, 0);
  assert.equal(step9.regionId, 'national');
  assert.equal(step9.completedCycle, true);

  // 2. Municipality warnings parsing
  const sampleMapWithMuni = [
    {
      reportDatetime: '2026-11-06T12:00:00+09:00',
      areaTypes: [
        {
          areas: [{ code: '011000', warnings: [{ code: '15', status: '継続' }] }],
        },
        {
          areas: [{ code: '0121400', warnings: [{ code: '15', status: '継続' }] }],
        },
      ],
    },
  ];
  const parsedWarn = parseJmaWarningMapData(
    sampleMapWithMuni,
    { class20s: { '0121400': { name: '稚内市' } } },
    { class20s: { '0121400': [45.4156, 141.6731] } }
  );
  assert.equal(parsedWarn.municipalityWarnings.length, 1);
  assert.equal(parsedWarn.municipalityWarnings[0].prefecture, '宗谷 稚内市');
  assert.equal(parsedWarn.municipalityWarnings[0].areaName, '稚内市');
  assert.equal(parsedWarn.municipalityWarnings[0].isMunicipality, true);

  // 3. Extratropical cyclone detection
  const extraTc = parseJmaTyphoonSpecifications(
    [
      {
        part: 'title',
        issue: { JST: '2026-11-06T09:45:00+09:00' },
        typhoonNumber: '2631',
        name: { jp: 'インファ', en: 'In-fa' },
        category: { jp: '温帯低気圧', en: 'LOW' },
      },
      {
        part: { jp: '実況', en: 'Analysis' },
        advancedHours: 0,
        category: { jp: '温帯低気圧', en: 'LOW' },
        position: { deg: [42.0, 155.0] },
        pressure: '992',
        validtime: { JST: '2026-11-06T09:00:00+09:00' },
      },
    ],
    'TC2637'
  );
  assert.ok(extraTc);
  assert.equal(isExtratropicalCyclone(extraTc), true);
  assert.equal(formatCompactTyphoonCenterLabel(extraTc), '温帯低気圧');

  // 4. Wind arrow size scaling & Top-5 rankings (Enlarged for nationwide clarity)
  assert.ok(getAmedasWindArrowSizeForZoom(5) >= 20 && getAmedasWindArrowSizeForZoom(5) <= 26);
  assert.ok(getAmedasWindArrowSizeForZoom(6) > getAmedasWindArrowSizeForZoom(5));
  assert.ok(getAmedasWindArrowSizeForZoom(7) > getAmedasWindArrowSizeForZoom(6));

  const mockStations = Array.from({ length: 8 }, (_, idx) => ({
    id: `st-${idx}`,
    stationName: `地点${idx}`,
    prefecture: '東京都',
    regionId: 'kanto' as const,
    lat: 35 + idx * 0.1,
    lon: 139 + idx * 0.1,
    temp: 10 + idx * 2,
    hasTemp: true,
    precip1h: idx * 3,
    windSpeed: idx * 2.5,
    windDirection: '北',
    humidity: 60,
    snowCm: idx * 4,
    observedAt: '12:00',
  }));
  const rankings = computeAmedasTop5Rankings(mockStations);
  assert.equal(rankings.tempHigh5.length, 5);
  assert.equal(rankings.tempHigh5[0].temp, 24);
  assert.equal(rankings.tempLow5.length, 5);
  assert.equal(rankings.tempLow5[0].temp, 10);
  assert.equal(rankings.precipTop5.length, 5);
  assert.equal(rankings.windTop5.length, 5);
  assert.equal(rankings.snowTop5.length, 5);
});

test('Reiwa 8 r8/map.json parsing, 57 JMA divisions, muniSeverityMap, getActiveSevereWarningDivisions, formatMunicipalityMapLabel, and interpolateArchipelagoSweepPosition work accurately', () => {
  // 1. Verify 57 divisions structure
  const orderedDivs = Object.values(WARNING_DIVISIONS).sort((a, b) => a.order - b.order);
  assert.equal(orderedDivs.length, 57);
  assert.equal(orderedDivs[0].name, '宗谷');
  assert.equal(orderedDivs[1].name, '網走・北見・紋別');
  assert.equal(orderedDivs[2].name, '上川・留萌');
  assert.equal(orderedDivs[3].name, '石狩・空知・後志');
  assert.equal(orderedDivs[4].name, '釧路・根室');
  assert.equal(orderedDivs[5].name, '胆振・日高');
  assert.equal(orderedDivs[6].name, '渡島・檜山');
  assert.equal(orderedDivs[51].name, '鹿児島県（奄美地方除く）');
  assert.equal(orderedDivs[52].name, '奄美地方');
  assert.equal(orderedDivs[53].name, '沖縄本島地方');
  assert.equal(orderedDivs[54].name, '大東島地方');
  assert.equal(orderedDivs[55].name, '宮古島地方');
  assert.equal(orderedDivs[56].name, '八重山地方');

  // 2. Parse Reiwa 8 r8/map.json structure (warning.class10Items and warning.class20Items)
  const r8MapPayload = [
    {
      officeCode: '011000',
      name: '宗谷地方',
      warning: {
        reportDatetime: '2026-11-06T15:32:00+09:00',
        class10Items: [
          {
            areaCode: '011000',
            kinds: ['05', '12', '16'], // 05 = 暴風警報, 12 = 強風注意報, 16 = 波浪注意報
          },
        ],
        class20Items: [
          {
            areaCode: '0121400',
            kinds: ['05', '16'],
          },
        ],
      },
    },
    {
      officeCode: '460100',
      name: '鹿児島県（奄美地方除く）',
      warning: {
        reportDatetime: '2026-11-06T10:15:00+09:00',
        class10Items: [
          {
            areaCode: '460110',
            kinds: ['12'], // 強風注意報
          },
        ],
        class20Items: [
          {
            areaCode: '4620100',
            kinds: ['12'],
          },
        ],
      },
    },
    {
      officeCode: '460040',
      name: '奄美地方',
      warning: {
        reportDatetime: '2026-11-06T11:00:00+09:00',
        class10Items: [
          {
            areaCode: '460040',
            kinds: ['06'], // 波浪警報
          },
        ],
        class20Items: [
          {
            areaCode: '4622200',
            kinds: ['06'],
          },
        ],
      },
    },
  ];

  const parsed = parseJmaWarningMapData(
    r8MapPayload,
    {
      class20s: {
        '0121400': { name: '稚内市' },
        '4620100': { name: '鹿児島市' },
        '4622200': { name: '奄美市' },
      },
    },
    {
      class20s: {
        '0121400': [45.4156, 141.6731],
        '4620100': [31.5966, 130.5571],
        '4622200': [28.3768, 129.4939],
      },
    }
  );

  assert.equal(parsed.warnings.length, 3);
  assert.equal(parsed.warnings[0].prefecture, '宗谷');
  assert.equal(parsed.warnings[0].severity, 'warning');
  assert.equal(parsed.warnings[1].prefecture, '鹿児島県（奄美地方除く）');
  assert.equal(parsed.warnings[1].severity, 'advisory');
  assert.equal(parsed.warnings[2].prefecture, '奄美地方');
  assert.equal(parsed.warnings[2].severity, 'warning');

  // Verify muniSeverityMap
  assert.equal(parsed.muniSeverityMap['0121400'], 'warning');
  assert.equal(parsed.muniSeverityMap['4620100'], 'advisory');
  assert.equal(parsed.muniSeverityMap['4622200'], 'warning');

  // Verify getActiveSevereWarningDivisions only returns divisions with 警報/特別警報 in North-to-South order
  const severeDivisions = getActiveSevereWarningDivisions(parsed.warnings);
  assert.equal(severeDivisions.length, 2);
  assert.equal(severeDivisions[0].prefecture, '宗谷');
  assert.equal(severeDivisions[1].prefecture, '奄美地方');

  // Verify formatMunicipalityMapLabel returns ONLY the municipality name without warning types
  assert.equal(
    formatMunicipalityMapLabel(parsed.municipalityWarnings[0]),
    '稚内市'
  );

  // Verify interpolateArchipelagoSweepPosition smoothly sweeps from Hokkaido to Okinawa
  const startPos = interpolateArchipelagoSweepPosition(0);
  const midPos = interpolateArchipelagoSweepPosition(0.5);
  const endPos = interpolateArchipelagoSweepPosition(1);
  assert.ok(startPos[0] > 43);
  assert.ok(midPos[0] < startPos[0] && midPos[0] > endPos[0]);
  assert.ok(endPos[0] < 27);

  // Verify AMEDAS_PATROL_STOPS follows: 全国表示 -> 北海道 -> 東北 -> 関東・中部・近畿 -> 中国・四国・九州 -> 沖縄 -> 全国表示
  assert.deepEqual(
    AMEDAS_PATROL_STOPS.map((s) => s.id),
    [
      'national_start',
      'hokkaido',
      'tohoku',
      'kanto_chubu_kinki',
      'chugoku_shikoku_kyushu',
      'okinawa',
      'national_end',
    ]
  );
  for (let i = 1; i <= 5; i++) {
    assert.ok(AMEDAS_PATROL_STOPS[i].zoom >= 7.25);
  }
});

test('P2PQuake EEW (code 556) & Tsunami (code 552) parsing, wave radii propagation, and replacement logic work accurately', () => {
  // 1. EEW parse test
  const sampleEewPayload = {
    code: 556,
    id: 'eew-20261106-01',
    issue: {
      eventId: '20261106195600',
      serial: '1',
      time: '2026/11/06 19:56:15',
    },
    earthquake: {
      originTime: '2026/11/06 19:56:00',
      hypocenter: {
        name: '茨城県南部',
        latitude: 36.1,
        longitude: 140.1,
        depth: 50,
        magnitude: 5.9,
      },
      condition: '通常',
    },
    areas: [
      {
        pref: '茨城県',
        name: '茨城県南部',
        scaleFrom: 50,
        scaleTo: 99,
        kindCode: '10',
        arrivalTime: '2026/11/06 19:56:30',
      },
      {
        pref: '千葉県',
        name: '千葉県北西部',
        scaleFrom: 45,
        scaleTo: 50,
        kindCode: '11',
        arrivalTime: null,
      },
      {
        pref: '東京都',
        name: '東京都２３区',
        scaleFrom: 40,
        scaleTo: 45,
        kindCode: '19',
        arrivalTime: null,
      },
    ],
  };

  const eewReport = parseP2PEew(sampleEewPayload, 1700000000000);
  assert.ok(eewReport);
  assert.equal(eewReport.serial, 1);
  assert.equal(eewReport.hypocenterName, '茨城県南部');
  assert.equal(eewReport.lat, 36.1);
  assert.equal(eewReport.lon, 140.1);
  assert.equal(eewReport.depthKm, 50);
  assert.equal(eewReport.magnitude, 5.9);
  assert.equal(eewReport.maxScaleLabel, '5強以上');
  assert.equal(eewReport.areas.length, 3);

  // 2. Format scale ranges & arrival status
  assert.equal(formatEewScaleRange(50, 99), '5強以上');
  assert.equal(formatEewScaleRange(45, 50), '5弱～5強');
  assert.equal(formatEewScaleRange(40, 40), '4');

  // Arrived / PLUM test
  assert.equal(formatEewArrivalLabel(eewReport.areas[1]), '既に到達と予測');
  assert.equal(formatEewArrivalLabel(eewReport.areas[2]), '到達予想なし(PLUM法)');

  // 3. shouldReplaceEew replacement rule
  const nextSerialEew = { ...eewReport, serial: 3 };
  assert.equal(shouldReplaceEew(eewReport, nextSerialEew), true); // higher serial replaces
  assert.equal(shouldReplaceEew(nextSerialEew, eewReport), false); // older serial does not replace
  const diffEventEew = { ...eewReport, eventId: '20261106200000', serial: 1 };
  assert.equal(shouldReplaceEew(eewReport, diffEventEew), true); // new event always replaces

  // 4. Wave propagation radii calculation using official JMA2001 travel-time table (depth 50km)
  // At 10s after origin: P-wave at 50km depth reaches 42km in 9.828s and 44km in 10.019s -> ~43.80km
  // S-wave vertical travel time at 50km depth is 13.035s (> 10s) -> horizontal surface radius = 0km
  const radii10s = computeEewWaveRadiiKm(
    '2026/11/06 19:56:00',
    50,
    new Date('2026-11-06T19:56:10+09:00').getTime()
  );
  assert.ok(radii10s.pKm > 43 && radii10s.pKm < 44);
  assert.equal(radii10s.sKm, 0);

  // At 20s after origin: P-wave > 125km, S-wave between 55km (19.223s) and 60km (20.174s) -> ~59.09km
  const radii20s = computeEewWaveRadiiKm(
    '2026/11/06 19:56:00',
    50,
    new Date('2026-11-06T19:56:20+09:00').getTime()
  );
  assert.ok(radii20s.pKm > 125 && radii20s.pKm < 130);
  assert.ok(radii20s.sKm > 58.5 && radii20s.sKm < 59.5);

  // 5. P2PQuake Tsunami (code 552) parse test
  const sampleTsunamiPayload = {
    code: 552,
    id: 'tsunami-sample-01',
    time: '2026/11/06 19:58:00',
    cancelled: false,
    areas: [
      {
        name: '岩手県',
        grade: 'MajorWarning',
        immediate: true,
        firstHeight: { condition: '津波到達中と推測' },
        maxHeight: { description: '巨大' },
      },
      {
        name: '宮城県',
        grade: 'Warning',
        immediate: false,
        firstHeight: { arrivalTime: '2026/11/06 20:10:00' },
        maxHeight: { description: '３ｍ' },
      },
      {
        name: '福島県',
        grade: 'Watch',
        immediate: false,
        firstHeight: { arrivalTime: '2026/11/06 20:20:00' },
        maxHeight: { description: '１ｍ' },
      },
    ],
  };

  const tsunamiReport = parseP2PTsunami(sampleTsunamiPayload);
  assert.ok(tsunamiReport);
  assert.equal(tsunamiReport.cancelled, false);
  assert.equal(tsunamiReport.areas.length, 3);
  assert.equal(tsunamiReport.areas[0].grade, 'MajorWarning');
  assert.equal(tsunamiReport.areas[0].code, '210'); // maps '岩手県' to '210'
  assert.equal(tsunamiReport.areas[0].maxHeightText, '巨大');
  assert.equal(tsunamiReport.areas[1].grade, 'Warning');
  assert.equal(tsunamiReport.areas[1].code, '220'); // maps '宮城県' to '220'
  assert.equal(tsunamiReport.areas[2].grade, 'Watch');
  assert.equal(tsunamiReport.areas[2].code, '250'); // maps '福島県' to '250'

  // 6. Tsunami Alert Severity logic:
  // MajorWarning / Warning / Watch -> 'warning_or_above' (locks onto tsunami scene)
  assert.equal(getTsunamiAlertSeverity(tsunamiReport), 'warning_or_above');

  // Cancelled -> 'none'
  assert.equal(
    getTsunamiAlertSeverity({ ...tsunamiReport, cancelled: true }),
    'none'
  );

  // Forecast only (若干の海面変動) -> 'forecast' (dynamically included in normal loop, transitions to radar)
  const forecastOnlyReport = {
    ...tsunamiReport,
    areas: [
      {
        name: '伊豆諸島',
        code: '320',
        grade: 'Forecast' as const,
        immediate: false,
        firstHeightText: '若干の海面変動',
        maxHeightText: '0.2m未満',
      },
    ],
  };
  assert.equal(getTsunamiAlertSeverity(forecastOnlyReport), 'forecast');

  // Normal loop sequence with Forecast: ... -> earthquake -> tsunami -> radar
  const loopWithTsunami = [...DEFAULT_NORMAL_LOOP_SCENES, 'tsunami' as const];
  assert.equal(getNextSceneId('earthquake', loopWithTsunami), 'tsunami');
  assert.equal(getNextSceneId('tsunami', loopWithTsunami), 'radar'); // advances to rain radar!

  // 7. Occurrence time formatting and Seismic scale badge styles
  assert.equal(formatOccurrenceTimeJa('2026/11/06 19:39:00'), '11月06日 19時39分頃');
  assert.equal(formatOccurrenceTimeJa('2026-11-06T19:39:00+09:00'), '11月06日 19時39分頃');
  assert.equal(formatOccurrenceTimeJa(null), '-');

  const style7 = getSeismicScaleBadgeStyle('7');
  assert.equal(style7.bg, '#800080');
  const style6Plus = getSeismicScaleBadgeStyle('6強');
  assert.equal(style6Plus.bg, '#A50021');
  const style3 = getSeismicScaleBadgeStyle('3');
  assert.equal(style3.bg, '#38BDF8');

  // 8. JMA Tsunami Detail parsing with earthquake coordinates, depth, occurrence time
  const sampleJmaTsunamiDetail = {
    Head: {
      EventID: '20261106193900',
      ReportDateTime: '2026-11-06T19:53:00+09:00',
      InfoType: '発表',
    },
    Body: {
      Earthquake: {
        OriginTime: '2026-11-06T19:39:00+09:00',
        Hypocenter: {
          Area: {
            Name: '関東東方沖',
            Coordinate: '+35.5+141.6-10000/',
          },
        },
        Magnitude: '6.1',
        MaxInt: '3',
      },
      Tsunami: {
        Forecast: {
          Item: [
            {
              Category: { Kind: { Name: '津波予報' } },
              Area: { Code: '310', Name: '千葉県九十九里・外房' },
              MaxHeight: { Condition: '0.2m未満' },
            },
          ],
        },
      },
    },
  };
  const parsedJmaTsunami = parseJmaTsunamiDetail(sampleJmaTsunamiDetail);
  assert.ok(parsedJmaTsunami);
  assert.equal(parsedJmaTsunami.hypocenterName, '関東東方沖');
  assert.equal(parsedJmaTsunami.lat, 35.5);
  assert.equal(parsedJmaTsunami.lon, 141.6);
  assert.equal(parsedJmaTsunami.depthKm, 10);
  assert.equal(parsedJmaTsunami.magnitude, 6.1);
  assert.equal(parsedJmaTsunami.maxScaleLabel, '3');
  assert.equal(parsedJmaTsunami.occurrenceTime, '2026-11-06T19:39:00+09:00');
  assert.equal(parsedJmaTsunami.areas[0].grade, 'Forecast');
  assert.equal(parsedJmaTsunami.areas[0].name, '千葉県九十九里・外房');
});

test('3-stage Warning zoom hierarchy (prefecture -> division -> municipality) and non-overlapping AMeDAS station filtering work accurately', () => {
  // 1. 3-Stage Warning Map Zoom Tiers
  assert.equal(getWarningMapZoomTier(4.5), 'prefecture');
  assert.equal(getWarningMapZoomTier(5.0), 'prefecture');
  assert.equal(getWarningMapZoomTier(5.49), 'prefecture');
  assert.equal(getWarningMapZoomTier(5.5), 'division');
  assert.equal(getWarningMapZoomTier(6.0), 'division');
  assert.equal(getWarningMapZoomTier(6.79), 'division');
  assert.equal(getWarningMapZoomTier(6.8), 'municipality');
  assert.equal(getWarningMapZoomTier(7.0), 'municipality');
  assert.equal(getWarningMapZoomTier(9.0), 'municipality');

  // 2. Division label formatting matches JMA official regional warning map labels
  assert.equal(formatWarningDivisionMapLabel(WARNING_DIVISIONS['011000']), '宗谷地方');
  assert.equal(formatWarningDivisionMapLabel(WARNING_DIVISIONS['014100']), '釧路・根室・十勝地方');
  assert.equal(formatWarningDivisionMapLabel(WARNING_DIVISIONS['020000']), '青森県');
  assert.equal(formatWarningDivisionMapLabel(WARNING_DIVISIONS['130000']), '東京都');
  assert.equal(formatWarningDivisionMapLabel(WARNING_DIVISIONS['460100']), '鹿児島県');
  assert.equal(formatWarningDivisionMapLabel(WARNING_DIVISIONS['460040']), '奄美地方');
  assert.equal(formatWarningDivisionMapLabel(WARNING_DIVISIONS['471000']), '沖縄本島地方');

  // 3. Non-overlapping AMeDAS stations at overview zoom vs zoomed-in view
  const denseCluster = Array.from({ length: 20 }, (_, i) => ({
    id: `cluster-${i}`,
    stationName: `密集点${i}`,
    prefecture: '東京都',
    regionId: 'kanto' as const,
    lat: 35.68 + (i % 5) * 0.01,
    lon: 139.76 + Math.floor(i / 5) * 0.01,
    temp: 15 + i * 0.5,
    hasTemp: true,
    precip1h: 2 + i * 0.5,
    windSpeed: 3 + i * 1.2,
    windDirection: '北北東',
    humidity: 60,
    snowCm: 0,
    observedAt: '12:00',
  }));

  const projectAtZoom = (z: number) => (lat: number, lon: number) => {
    const scale = 256 * Math.pow(2, z);
    return {
      x: (lon / 360 + 0.5) * scale,
      y: (0.5 - lat / 180) * scale,
    };
  };

  // At nationwide zoom (z=5), tightly clustered stations within ~0.04 deg (~3px apart) should be culled so none overlap,
  // and the strongest wind station (`cluster-19`) must be prioritized first!
  const windAtZ5 = selectNonOverlappingAmedasStations(
    denseCluster,
    'wind',
    5,
    projectAtZoom(5)
  );
  assert.equal(windAtZ5.length, 1);
  assert.equal(windAtZ5[0].id, 'cluster-19');

  const tempAtZ5 = selectNonOverlappingAmedasStations(
    denseCluster,
    'temp',
    5,
    projectAtZoom(5)
  );
  assert.equal(tempAtZ5.length, 1);

  // At high zoom (z=10), all 20 stations are well separated in screen pixels and all 20 are displayed
  const windAtZ10 = selectNonOverlappingAmedasStations(
    denseCluster,
    'wind',
    10,
    projectAtZoom(10)
  );
  assert.equal(windAtZ10.length, 20);
});

test('getEffectiveMunicipalitySeverity preserves warning colors across divisions and dissolveGeoJsonByGroup topologically merges adjacent polygons into a single clean boundary', async () => {
  const { getEffectiveMunicipalitySeverity, dissolveGeoJsonByGroup } = await import('./jmaParser');

  const muniSeverityMap = {
    '0121400': 'warning' as const, // 宗谷 稚内市
    '0120400': 'advisory' as const, // 上川 旭川市
    '0220100': 'warning' as const, // 青森県 青森市
  };

  // In nationwide view (activeWarningDivisionCode = null), all municipalities keep their warning/advisory colors
  assert.equal(
    getEffectiveMunicipalitySeverity('0121400', '011000', muniSeverityMap, null),
    'warning'
  );
  assert.equal(
    getEffectiveMunicipalitySeverity('0120400', '012000', muniSeverityMap, null),
    'advisory'
  );
  assert.equal(
    getEffectiveMunicipalitySeverity('0220100', '020000', muniSeverityMap, null),
    'warning'
  );

  // When zoomed into a division, all municipalities across Japan continue to display their warnings/advisories
  assert.equal(
    getEffectiveMunicipalitySeverity('0121400', '011000', muniSeverityMap, '011000'),
    'warning'
  );
  assert.equal(
    getEffectiveMunicipalitySeverity('0120400', '012000', muniSeverityMap, '011000'),
    'advisory'
  );
  assert.equal(
    getEffectiveMunicipalitySeverity('0220100', '020000', muniSeverityMap, '011000'),
    'warning'
  );

  // Verify topological edge cancellation dissolves two adjacent squares sharing edge (1,0)->(1,1) into 1 unified rectangle
  const twoAdjacentSquares = [
    {
      type: 'Feature',
      properties: { code: '012010', name: '上川地方' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { code: '012020', name: '留萌地方' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [1, 0],
            [2, 0],
            [2, 1],
            [1, 1],
            [1, 0],
          ],
        ],
      },
    },
  ];

  const dissolved = dissolveGeoJsonByGroup(
    twoAdjacentSquares,
    () => '012000'
  );

  assert.equal(dissolved.features.length, 1);
  assert.equal(dissolved.features[0].properties.groupKey, '012000');
  // The shared vertical edge at x=1 is cancelled out, leaving 1 outer ring of 7 vertices (start+end + 6 perimeter steps)
  assert.equal(dissolved.features[0].geometry.coordinates.length, 1);
  assert.equal(dissolved.features[0].geometry.coordinates[0][0].length, 7);
});

test('sortEarthquakesByNewest sorts earthquake history strictly by occurrenceTime (most recently occurred first) instead of maxScaleCode', async () => {
  const { sortEarthquakesByNewest, parseEarthquakeTimeMs } = await import(
    './jmaParser'
  );
  const { INITIAL_EARTHQUAKES } = await import('../data/fallbackData');

  const t1 = parseEarthquakeTimeMs('2026/11/05 09:14 頃発生');
  const t2 = parseEarthquakeTimeMs('2026/11/05 13:39 頃発生');
  assert.ok(t2 > t1);

  const sampleQuakes = [
    {
      ...INITIAL_EARTHQUAKES[0],
      id: 'older-huge-quake',
      occurrenceTime: '2026/11/05 03:08 頃発生',
      issueTime: '2026/11/05 03:12 発表',
      maxScaleCode: 60, // 震度6強 (older)
      maxScaleLabel: '6+',
    },
    {
      ...INITIAL_EARTHQUAKES[0],
      id: 'newest-small-quake',
      occurrenceTime: '2026/11/06 14:20 頃発生',
      issueTime: '2026/11/06 14:23 発表',
      maxScaleCode: 20, // 震度2 (most recent)
      maxScaleLabel: '2',
    },
    {
      ...INITIAL_EARTHQUAKES[0],
      id: 'middle-moderate-quake',
      occurrenceTime: '2026/11/05 18:45 頃発生',
      issueTime: '2026/11/05 18:48 発表',
      maxScaleCode: 40, // 震度4 (middle)
      maxScaleLabel: '4',
    },
  ];

  const sorted = sortEarthquakesByNewest(sampleQuakes);
  assert.deepEqual(
    sorted.map((q) => q.id),
    ['newest-small-quake', 'middle-moderate-quake', 'older-huge-quake']
  );
});

test('computeEarthquakeAreaScales maps seismic intensity stations to JMA 188-area codes via point-in-polygon', async () => {
  const { computeEarthquakeAreaScales, computeEarthquakeCityScales, isPointInPolygon } = await import('./jmaParser');

  // Verify point in square
  const unitSquare: number[][] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  assert.equal(isPointInPolygon([5, 5], unitSquare), true);
  assert.equal(isPointInPolygon([15, 5], unitSquare), false);

  const mockGeoJson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { code: '704', name: '山口県中部' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [131.0, 34.0],
              [132.0, 34.0],
              [132.0, 34.5],
              [131.0, 34.5],
              [131.0, 34.0],
            ],
          ],
        },
      },
    ],
  };

  const mockQuake = {
    id: 'test-eq',
    issueTime: '2026/11/07 06:32 発表',
    occurrenceTime: '2026/11/07 06:30 頃発生',
    hypocenterName: '山口県中部',
    regionId: 'chugoku_shikoku' as const,
    lat: 34.2,
    lon: 131.6,
    depthKm: 10,
    magnitude: 2.9,
    maxScaleCode: 20,
    maxScaleLabel: '2',
    domesticTsunami: 'なし',
    foreignTsunami: 'なし',
    sourceOffice: '気象庁',
    stations: [
      {
        prefecture: '山口県',
        city: '山口市',
        stationName: '山口市徳地堀',
        scaleCode: 20,
        scaleLabel: '2',
        lat: 34.19,
        lon: 131.66,
      },
      {
        prefecture: '山口県',
        city: '防府市',
        stationName: '防府市寿',
        scaleCode: 10,
        scaleLabel: '1',
        lat: 34.05,
        lon: 131.56,
      },
    ],
  };

  const scaleMap = computeEarthquakeAreaScales(mockQuake, mockGeoJson);
  assert.equal(scaleMap.get('704'), 20);

  // Test computeEarthquakeCityScales with cityMaxScales and class20GeoJson
  const mockClass20 = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { code: '3520300', name: '山口市' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [131.0, 34.0],
              [132.0, 34.0],
              [132.0, 34.5],
              [131.0, 34.5],
              [131.0, 34.0],
            ],
          ],
        },
      },
    ],
  };

  const quakeWithCity = {
    ...mockQuake,
    cityMaxScales: { '3520300': 20 },
  };
  const cityScales = computeEarthquakeCityScales(quakeWithCity, mockClass20);
  assert.equal(cityScales.get('3520300'), 20);
});

test('parseWolfxEew (緊急地震速報 予報・警報) and mergeProgressiveEarthquakeReports (震度速報 -> 震源情報 -> 各地の震度) work accurately', () => {
  // 1. Wolfx EEW Forecast (`緊急地震速報（予報）`) parsing
  const wolfxForecastPayload = {
    type: 'jma_eew',
    Title: '緊急地震速報（予報）',
    EventID: '20261107200747',
    Serial: 8,
    AnnouncedTime: '2026/11/07 20:08:46',
    OriginTime: '2026/11/07 20:07:41',
    Hypocenter: '茨城県沖',
    Latitude: 36.2,
    Longitude: 141.5,
    Magunitude: 5.4,
    Magnitude: 5.4,
    Depth: 40,
    MaxIntensity: '3',
    WarnArea: [],
    isSea: true,
    isTraining: false,
    isAssumption: false,
    isWarn: false,
    isFinal: true,
    isCancel: false,
  };

  const nowDuringEew = new Date('2026-11-07T20:09:00+09:00').getTime();
  const parsedForecastEew = parseWolfxEew(wolfxForecastPayload, nowDuringEew);
  assert.ok(parsedForecastEew);
  assert.equal(parsedForecastEew.eventId, '20261107200747');
  assert.equal(parsedForecastEew.serial, 8);
  assert.equal(parsedForecastEew.isWarning, false);
  assert.equal(parsedForecastEew.isFinal, true);
  assert.equal(parsedForecastEew.hypocenterName, '茨城県沖');
  assert.equal(parsedForecastEew.maxScaleCode, 30);
  assert.equal(parsedForecastEew.maxScaleLabel, '3');
  assert.equal(isEewStillActive(parsedForecastEew, nowDuringEew), true);

  // Detection placeholder (P2P code 554) is replaced by actual Wolfx EEW report
  const det554 = parseP2PEewDetection(
    { code: 554, id: 'det-1', time: '2026/11/07 20:07:50' },
    nowDuringEew
  );
  assert.ok(det554);
  assert.equal(shouldReplaceEew(det554, parsedForecastEew), true);

  // 2. Progressive earthquake reports for EventID 20261107200747:
  // Stage A: VXSE51 (`震度速報`)
  const vxse51 = parseJmaQuakeDetailJson(
    {
      Head: {
        Title: '震度速報',
        ReportDateTime: '2026-11-07T20:09:00+09:00',
        TargetDateTime: '2026-11-07T20:07:00+09:00',
        EventID: '20261107200747',
        InfoKind: '震度速報',
      },
      Body: {
        Intensity: {
          Observation: {
            MaxInt: '3',
            Pref: [
              {
                Name: '福島県',
                Code: '07',
                MaxInt: '3',
                Area: [{ Name: '福島県中通り', Code: '250', MaxInt: '3' }],
              },
            ],
          },
        },
      },
    },
    { eid: '20261107200747', maxi: '3', ttl: '震度速報' }
  );
  assert.ok(vxse51);
  assert.equal(vxse51.issueTypeLabel, '震度速報');
  assert.equal(vxse51.hypocenterUnknown, true);
  assert.equal(vxse51.isConfirmed, false);
  assert.equal(vxse51.maxScaleCode, 30);
  assert.equal(vxse51.stations.length, 1);
  assert.equal(vxse51.stations[0].stationName, '福島県中通り');

  // Stage B: VXSE52 (`震源に関する情報`, has hypocenter & magnitude, no intensity)
  const vxse52 = parseJmaQuakeDetailJson(
    {
      Head: {
        Title: '震源に関する情報',
        ReportDateTime: '2026-11-07T20:11:00+09:00',
        TargetDateTime: '2026-11-07T20:07:00+09:00',
        EventID: '20261107200747',
        InfoKind: '震源速報',
      },
      Body: {
        Earthquake: {
          OriginTime: '2026-11-07T20:07:00+09:00',
          Hypocenter: {
            Area: {
              Name: '茨城県沖',
              Code: '471',
              Coordinate: '+36.2+141.6-20000/',
            },
          },
          Magnitude: '5.6',
        },
      },
    },
    {
      eid: '20261107200747',
      anm: '茨城県沖',
      cod: '+36.2+141.6-20000/',
      mag: '5.6',
      maxi: '',
      ttl: '震源に関する情報',
    }
  );
  assert.ok(vxse52);
  assert.equal(vxse52.issueTypeLabel, '震源に関する情報');
  assert.equal(vxse52.hypocenterUnknown, false);
  assert.equal(vxse52.isConfirmed, false);
  assert.equal(vxse52.maxScaleCode, -1);

  // Merge VXSE52 + VXSE51 -> Combines 茨城県沖 M5.6 with 最大震度3 (福島県中通り), while keeping isConfirmed = false!
  const mergedInterim = mergeProgressiveEarthquakeReports([vxse52, vxse51]);
  assert.equal(mergedInterim.length, 1);
  assert.equal(mergedInterim[0].hypocenterName, '茨城県沖');
  assert.equal(mergedInterim[0].hypocenterUnknown, false);
  assert.equal(mergedInterim[0].maxScaleCode, 30);
  assert.equal(mergedInterim[0].maxScaleLabel, '3');
  assert.equal(mergedInterim[0].isConfirmed, false);
  assert.ok(mergedInterim[0].areaMaxScales?.['250']);

  // Stage C: VXSE5k (`各地の震度に関する情報` / `震源・震度情報`) arrives -> isConfirmed becomes true!
  const vxse5k = parseJmaQuakeDetailJson(
    {
      Head: {
        Title: '震源・震度情報',
        ReportDateTime: '2026-11-07T20:12:00+09:00',
        TargetDateTime: '2026-11-07T20:07:00+09:00',
        EventID: '20261107200747',
        InfoKind: '地震情報',
      },
      Body: {
        Earthquake: {
          OriginTime: '2026-11-07T20:07:00+09:00',
          Hypocenter: {
            Area: {
              Name: '茨城県沖',
              Code: '471',
              Coordinate: '+36.2+141.6-20000/',
            },
          },
          Magnitude: '5.6',
        },
        Intensity: {
          Observation: {
            MaxInt: '3',
            Pref: [
              {
                Name: '福島県',
                Code: '07',
                MaxInt: '3',
                Area: [
                  {
                    Name: '福島県中通り',
                    Code: '250',
                    MaxInt: '3',
                    City: [
                      {
                        Name: '郡山市',
                        Code: '0720300',
                        MaxInt: '3',
                        IntensityStation: [
                          {
                            Name: '郡山市朝日',
                            Code: '0720300',
                            Int: '3',
                            latlon: { lat: 37.39, lon: 140.38 },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    },
    {
      eid: '20261107200747',
      anm: '茨城県沖',
      cod: '+36.2+141.6-20000/',
      mag: '5.6',
      maxi: '3',
      ttl: '震源・震度情報',
    }
  );
  assert.ok(vxse5k);
  assert.equal(vxse5k.isConfirmed, true);

  const mergedFinal = mergeProgressiveEarthquakeReports([
    vxse5k,
    vxse52,
    vxse51,
  ]);
  assert.equal(mergedFinal.length, 1);
  assert.equal(mergedFinal[0].isConfirmed, true);
  assert.equal(mergedFinal[0].issueTypeLabel, '各地の震度に関する情報');
  assert.notEqual(mergedFinal[0].reportKey, mergedInterim[0].reportKey);
});

test('18 major forecast cities, TV broadcast weather descriptor (single / 時々 / のち), SVG rendering, 3-hourly slot generation, and JMA forecast JSON parsing work accurately', () => {
  // 1. Verify all 18 requested cities exist in MAJOR_FORECAST_CITY_TARGETS & INITIAL_FORECASTS
  assert.equal(MAJOR_FORECAST_CITY_TARGETS.length, 18);
  assert.equal(INITIAL_FORECASTS.length, 18);
  const expectedCities = [
    '旭川',
    '札幌',
    '釧路',
    '秋田',
    '仙台',
    '新潟',
    '金沢',
    '長野',
    '東京',
    '小笠原諸島',
    '名古屋',
    '大阪',
    '広島',
    '高知',
    '福岡',
    '鹿児島',
    '那覇',
    '石垣島',
  ];
  assert.deepEqual(
    MAJOR_FORECAST_CITY_TARGETS.map((c) => c.cityName),
    expectedCities
  );
  assert.deepEqual(
    INITIAL_FORECASTS.map((c) => c.cityName),
    expectedCities
  );

  // 2. Verify classifyJmaWeatherDescriptor for single, 時々 (sometimes), and のち (later)
  const dSingle = classifyJmaWeatherDescriptor('100', '晴れ');
  assert.equal(dSingle.pattern, 'single');
  assert.equal(dSingle.primary, 'sunny');
  assert.equal(dSingle.shortLabel, '晴');

  const dSometimes = classifyJmaWeatherDescriptor('101', '晴れ 時々 くもり');
  assert.equal(dSometimes.pattern, 'sometimes');
  assert.equal(dSometimes.primary, 'sunny');
  assert.equal(dSometimes.secondary, 'cloudy');
  assert.equal(dSometimes.shortLabel, '晴時々曇');

  const dLater = classifyJmaWeatherDescriptor('411', '雪 のち 晴れ');
  assert.equal(dLater.pattern, 'later');
  assert.equal(dLater.primary, 'snow');
  assert.equal(dLater.secondary, 'sunny');
  assert.equal(dLater.shortLabel, '雪のち晴');

  // 3. Verify renderBroadcastWeatherSvg produces valid SVG markup for all 3 patterns
  const svgSingle = renderBroadcastWeatherSvg('100', '晴れ');
  assert.ok(svgSingle.includes('<svg'));
  assert.ok(svgSingle.includes('#C2410C'));

  const svgSometimes = renderBroadcastWeatherSvg('101', '晴時々曇');
  assert.ok(svgSometimes.includes('22.5,34 27.2,15.5 48,15.5'));

  const svgLater = renderBroadcastWeatherSvg('210', '曇のち晴');
  assert.ok(svgLater.includes('21.5,0 28,17 21.5,34'));

  // 4. Verify 3-hourly slot generation
  const slots = buildCity3HourlySlots({
    weatherCode: '112',
    weatherText: '晴れ 夕方 から 雨',
    tempMin: 8,
    tempMax: 18,
    pops: [10, 20, 60, 80],
  });
  assert.equal(slots.length, 8);
  assert.equal(slots[0].timeLabel, '03時');
  assert.equal(slots[1].temp, 8); // 06時 = min
  assert.equal(slots[4].temp, 18); // 15時 = max
  assert.equal(slots[2].weatherText, '晴'); // 09時 before transition
  assert.equal(slots[5].weatherText, '雨'); // 18時 after transition

  // 5. Verify parseJmaCityForecastJson for both 東京 (130010 / 44132) and 小笠原諸島 (130040 / 44301)
  const mockJma130000 = [
    {
      publishingOffice: '気象庁',
      reportDatetime: '2026-11-08T05:00:00+09:00',
      timeSeries: [
        {
          timeDefines: [
            '2026-11-08T05:00:00+09:00',
            '2026-11-09T00:00:00+09:00',
            '2026-11-10T00:00:00+09:00',
          ],
          areas: [
            {
              area: { name: '東京地方', code: '130010' },
              weatherCodes: ['100', '101', '203'],
              weathers: ['晴れ', '晴れ　時々　くもり', 'くもり　時々　雨'],
            },
            {
              area: { name: '小笠原諸島', code: '130040' },
              weatherCodes: ['212', '203', '200'],
              weathers: ['くもり　夜遅く　雨', 'くもり　時々　雨', 'くもり'],
            },
          ],
        },
        {
          timeDefines: [
            '2026-11-08T06:00:00+09:00',
            '2026-11-08T12:00:00+09:00',
            '2026-11-08T18:00:00+09:00',
            '2026-11-09T00:00:00+09:00',
          ],
          areas: [
            { area: { name: '東京地方', code: '130010' }, pops: ['0', '10', '20', '30'] },
            { area: { name: '小笠原諸島', code: '130040' }, pops: ['30', '50', '60', '70'] },
          ],
        },
        {
          timeDefines: [
            '2026-11-08T00:00:00+09:00',
            '2026-11-08T09:00:00+09:00',
            '2026-11-09T00:00:00+09:00',
            '2026-11-09T09:00:00+09:00',
          ],
          areas: [
            { area: { name: '東京', code: '44132' }, temps: ['10', '18', '8', '15'] },
            { area: { name: '父島', code: '44301' }, temps: ['24', '27', '25', '28'] },
          ],
        },
      ],
    },
    {
      timeSeries: [
        {
          timeDefines: [
            '2026-11-09T00:00:00+09:00',
            '2026-11-10T00:00:00+09:00',
          ],
          areas: [
            { area: { name: '東京地方', code: '130010' }, weatherCodes: ['101', '203'], pops: ['20', '70'] },
            { area: { name: '小笠原諸島', code: '130040' }, weatherCodes: ['203', '200'], pops: ['70', '40'] },
          ],
        },
        {
          timeDefines: [
            '2026-11-09T00:00:00+09:00',
            '2026-11-10T00:00:00+09:00',
          ],
          areas: [
            { area: { name: '東京', code: '44132' }, tempsMin: ['8', '9'], tempsMax: ['15', '13'] },
            { area: { name: '父島', code: '44301' }, tempsMin: ['25', '23'], tempsMax: ['28', '26'] },
          ],
        },
      ],
    },
  ];

  const nowMs = Date.parse('2026-11-08T06:00:00+09:00');
  const tokyoTarget = MAJOR_FORECAST_CITY_TARGETS.find((t) => t.id === 'fc-130000')!;
  const ogasawaraTarget = MAJOR_FORECAST_CITY_TARGETS.find((t) => t.id === 'fc-130040')!;
  const tokyoFallback = INITIAL_FORECASTS.find((f) => f.id === 'fc-130000')!;
  const ogasawaraFallback = INITIAL_FORECASTS.find((f) => f.id === 'fc-130040')!;

  const parsedTokyo = parseJmaCityForecastJson(mockJma130000, tokyoTarget, tokyoFallback, nowMs);
  assert.equal(parsedTokyo.cityName, '東京');
  assert.equal(parsedTokyo.todayWeatherCode, '100');
  assert.equal(parsedTokyo.tomorrowWeatherCode, '101');
  assert.equal(parsedTokyo.dayAfterWeatherCode, '203');
  assert.equal(parsedTokyo.todayTempMax, 18);
  assert.equal(parsedTokyo.tomorrowTempMax, 15);
  assert.equal(parsedTokyo.tomorrowTempMin, 8);
  assert.equal(parsedTokyo.dayAfterTempMax, 13);
  assert.equal(parsedTokyo.dayAfterTempMin, 9);
  assert.equal(parsedTokyo.hourly3h?.length, 8);

  const parsedOgasawara = parseJmaCityForecastJson(mockJma130000, ogasawaraTarget, ogasawaraFallback, nowMs);
  assert.equal(parsedOgasawara.cityName, '小笠原諸島');
  assert.equal(parsedOgasawara.todayWeatherCode, '212');
  assert.equal(parsedOgasawara.tomorrowTempMax, 28);
  assert.equal(parsedOgasawara.tomorrowTempMin, 25);
  assert.equal(parsedOgasawara.dayAfterTempMax, 26);
  assert.equal(parsedOgasawara.dayAfterTempMin, 23);
});

test('findSubdivisionAreaCodes correctly maps EEW prefectures and area names to JMA 188 subdivision codes', async () => {
  const { findSubdivisionAreaCodes, computeEewAreaScales } = await import('./eewTsunami');

  // Kumamoto
  const kumamotoCodes = findSubdivisionAreaCodes('熊本県', '熊本');
  assert.ok(kumamotoCodes.includes('741'));

  const amakusaCodes = findSubdivisionAreaCodes('熊本県', '天草・芦北');
  assert.ok(amakusaCodes.includes('743'));

  // Shizuoka & Aichi
  const shizuokaCodes = findSubdivisionAreaCodes('静岡県', '西部');
  assert.ok(shizuokaCodes.includes('443'));

  const aichiCodes = findSubdivisionAreaCodes('愛知県', '愛知県西部');
  assert.ok(aichiCodes.includes('451'));

  // Whole prefecture
  const fukuokaAll = findSubdivisionAreaCodes('福岡県', '福岡県');
  assert.ok(fukuokaAll.includes('710')); // 福岡
  assert.ok(fukuokaAll.includes('711')); // 北九州

  // computeEewAreaScales
  const mockEew: any = {
    areas: [
      { pref: '熊本県', name: '熊本', scaleFrom: 50, scaleTo: 50 },
      { pref: '熊本県', name: '天草・芦北', scaleFrom: 40, scaleTo: 40 },
      { pref: '福岡県', name: '福岡', scaleFrom: 30, scaleTo: 30 },
    ],
  };
  const scaleMap = computeEewAreaScales(mockEew);
  assert.equal(scaleMap.get('741'), 50); // 熊本 -> 震度5強
  assert.equal(scaleMap.get('743'), 40); // 天草・芦北 -> 震度4
  assert.equal(scaleMap.get('710'), 30); // 福岡 -> 震度3

  // Hokkaido 4 major forecast areas (道央・道南・道北・道東)
  const dooCodes = findSubdivisionAreaCodes('北海道', '北海道道央');
  assert.ok(dooCodes.includes('100')); // 石狩北部
  assert.ok(dooCodes.includes('115')); // 後志北部
  assert.ok(dooCodes.includes('120')); // 空知北部
  assert.ok(dooCodes.includes('145')); // 胆振西部
  assert.ok(dooCodes.includes('150')); // 日高西部

  const donanCodes = findSubdivisionAreaCodes('北海道', '道南');
  assert.ok(donanCodes.includes('105')); // 渡島北部
  assert.ok(donanCodes.includes('110')); // 檜山
  assert.ok(donanCodes.includes('119')); // 奥尻島

  const dohokuCodes = findSubdivisionAreaCodes('北海道', '道北');
  assert.ok(dohokuCodes.includes('125')); // 上川北部
  assert.ok(dohokuCodes.includes('130')); // 留萌中北部
  assert.ok(dohokuCodes.includes('135')); // 宗谷北部
  assert.ok(dohokuCodes.includes('139')); // 利尻礼文

  const dotoCodes = findSubdivisionAreaCodes('北海道', '道東');
  assert.ok(dotoCodes.includes('140')); // 網走
  assert.ok(dotoCodes.includes('155')); // 十勝北部
  assert.ok(dotoCodes.includes('160')); // 釧路北部
  assert.ok(dotoCodes.includes('165')); // 根室北部

  const hokkaidoAll = findSubdivisionAreaCodes('北海道', '北海道');
  assert.equal(hokkaidoAll.length, 38); // All 38 subdivisions in Hokkaido

  // Verify convertP2PQuakeItem populates areaMaxScales for ScalePrompt (震度速報)
  const { convertP2PQuakeItem } = await import('../services/jmaClient');
  const mockP2P551ScalePrompt = {
    code: 551,
    time: '2026/11/09 13:52:00',
    issue: {
      type: 'ScalePrompt',
      time: '2026/11/09 13:54:00',
      source: '気象庁',
    },
    earthquake: {
      time: '2026/11/09 13:52:00',
      maxScale: 30,
      domesticTsunami: 'None',
      foreignTsunami: 'None',
      hypocenter: { name: '', latitude: -200, longitude: -200, depth: -1, magnitude: -1 },
    },
    points: [
      { pref: '福島県', addr: '福島県中通り', scale: 30 },
      { pref: '福島県', addr: '福島県浜通り', scale: 30 },
      { pref: '宮城県', addr: '宮城県中部', scale: 30 },
      { pref: '茨城県', addr: '茨城県北部', scale: 30 },
      { pref: '栃木県', addr: '栃木県南部', scale: 30 },
    ],
  };

  const converted = convertP2PQuakeItem(mockP2P551ScalePrompt);
  assert.ok(converted);
  assert.equal(converted.issueTypeLabel, '震度速報');
  assert.equal(converted.isConfirmed, false);
  assert.ok(converted.areaMaxScales);
  assert.equal(converted.areaMaxScales['250']?.scaleCode, 30); // 福島県中通り
  assert.equal(converted.areaMaxScales['251']?.scaleCode, 30); // 福島県浜通り
  assert.equal(converted.areaMaxScales['222']?.scaleCode, 30); // 宮城県中部
  assert.equal(converted.areaMaxScales['300']?.scaleCode, 30); // 茨城県北部
  assert.equal(converted.areaMaxScales['311']?.scaleCode, 30); // 栃木県南部
  assert.equal(converted.stations.length, 5);
  // Verify stations are placed at subdivision centroids
  const nakadori = converted.stations.find((s) => s.city === '福島県中通り');
  assert.ok(nakadori && typeof nakadori.lat === 'number' && Math.abs(nakadori.lat - 37.38) < 0.2);
});







test('r8 map.json: municipalities reported as clear stay normal even when their division has a warning (山形市 regression)', () => {
  // 山形県 is ONE warning division. 庄内 (鶴岡市) has 波浪警報, 置賜 (小国町) has 土砂災害注意報 (new R8 code 29),
  // 山形市 had 雷注意報 which was lifted (解除) in a later VPWW61 report.
  const raw = [
    {
      reportDatetime: '2026-11-07T01:04:00+09:00',
      infoType: '発表',
      publishingOffice: '山形地方気象台',
      dataTypeCode: 'VPWW59',
      warning: {
        class10Items: [{ areaCode: '060030', kinds: [{ code: '07', status: '継続' }] }],
        class20Items: [
          { areaCode: '0620100', kinds: [{ status: '発表警報・注意報はなし' }] },
          { areaCode: '0620300', kinds: [{ code: '07', status: '継続' }] },
        ],
      },
    },
    {
      reportDatetime: '2026-11-07T14:56:00+09:00',
      infoType: '発表',
      publishingOffice: '山形地方気象台',
      dataTypeCode: 'VPWW56',
      warning: {
        class10Items: [{ areaCode: '060020', kinds: [{ code: '29', status: '発表' }] }],
        class20Items: [
          { areaCode: '0620100', kinds: [{ status: '発表警報・注意報はなし' }] },
          { areaCode: '0636500', kinds: [{ code: '29', status: '発表' }] },
        ],
      },
    },
    {
      reportDatetime: '2026-11-07T17:59:00+09:00',
      infoType: '発表',
      publishingOffice: '山形地方気象台',
      dataTypeCode: 'VPWW61',
      warning: {
        class10Items: [{ areaCode: '060010', kinds: [{ code: '14', status: '解除' }] }],
        class20Items: [{ areaCode: '0620100', kinds: [{ code: '14', status: '解除' }] }],
      },
    },
    // Older VPWW61 report for the same office: must be ignored (superseded by the 17:59 report)
    {
      reportDatetime: '2026-11-07T09:00:00+09:00',
      infoType: '発表',
      publishingOffice: '山形地方気象台',
      dataTypeCode: 'VPWW61',
      warning: {
        class10Items: [{ areaCode: '060010', kinds: [{ code: '14', status: '発表' }] }],
        class20Items: [{ areaCode: '0620100', kinds: [{ code: '14', status: '発表' }] }],
      },
    },
  ];
  const parsed = parseJmaWarningMapData(raw);
  assert.equal(parsed.muniSeverityMap['0620100'], 'normal', '山形市 must be explicitly normal');
  assert.equal(parsed.muniSeverityMap['0620300'], 'warning', '鶴岡市 波浪警報');
  assert.equal(parsed.muniSeverityMap['0636500'], 'advisory', '小国町 土砂災害注意報 (code 29)');
  assert.ok(!parsed.municipalityWarnings.some((m) => m.muniCode === '0620100'));
  const yamagata = parsed.warnings.find((w) => w.divisionCode === '060000');
  assert.ok(yamagata);
  assert.equal(yamagata!.severity, 'warning');
  assert.ok(yamagata!.badgeItems.some((b) => b.name === '土砂災害' && b.severity === 'advisory'));
  assert.ok(!yamagata!.badgeItems.some((b) => b.name === '雷'));
});

test('r8 level-4 危険警報 codes (43/48/49) are parsed as danger and count as warning-or-above', () => {
  const raw = [
    {
      reportDatetime: '2026-11-07T10:00:00+09:00',
      infoType: '発表',
      publishingOffice: '高知地方気象台',
      dataTypeCode: 'VPWW57',
      warning: {
        class10Items: [{ areaCode: '390010', kinds: [{ code: '48', status: '発表' }] }],
        class20Items: [{ areaCode: '3920100', kinds: [{ code: '48', status: '発表' }] }],
      },
    },
    {
      reportDatetime: '2026-11-07T10:00:00+09:00',
      infoType: '発表',
      publishingOffice: '高知地方気象台',
      dataTypeCode: 'VPWW55',
      warning: {
        class10Items: [{ areaCode: '390010', kinds: [{ code: '43', status: '発表' }] }],
        class20Items: [{ areaCode: '3920200', kinds: [{ code: '43', status: '発表' }] }],
      },
    },
  ];
  const parsed = parseJmaWarningMapData(raw);
  assert.equal(parsed.muniSeverityMap['3920100'], 'danger');
  assert.equal(parsed.muniSeverityMap['3920200'], 'danger');
  const kochi = parsed.warnings.find((w) => w.divisionCode === '390000');
  assert.equal(kochi?.severity, 'danger');
  assert.ok(kochi?.badgeItems.some((b) => b.name === '高潮' && b.severity === 'danger'));
  assert.equal(getActiveSevereWarningDivisions(parsed.warnings).length, 1);
  assert.equal(computeWarningSummary(parsed.warnings).dangerCount, 1);
});

test('earthquake events are matched across feeds by origin time (P2P vs 気象庁 ids differ)', () => {
  const p2p = { occurrenceTime: '2026/11/07 20:12:00 頃発生', issueTime: '2026/11/07 20:14:00 発表' };
  const jma = { occurrenceTime: '2026-11-07T20:11:47+09:00', issueTime: '2026-11-07T20:16:00+09:00' };
  const other = { occurrenceTime: '2026/11/07 20:40:00 頃発生', issueTime: '2026/11/07 20:42:00 発表' };
  assert.equal(isSameEarthquakeEvent(p2p, jma), true);
  assert.equal(isSameEarthquakeEvent(p2p, other), false);
});

test('decideIncomingEarthquake: newer event interrupts, follow-ups update, older/stale are ignored', () => {
  const now = Date.parse('2026-11-07T20:20:00+09:00');
  const shown = { occurrenceTime: '2026/11/07 20:12:00 頃発生', issueTime: '2026/11/07 20:14:00 発表' };
  const followUp = { occurrenceTime: '2026-11-07T20:11:47+09:00', issueTime: '2026-11-07T20:16:00+09:00' };
  const newer = { occurrenceTime: '2026/11/07 20:18:30 頃発生', issueTime: '2026/11/07 20:19:30 発表' };
  const older = { occurrenceTime: '2026/11/07 19:00:00 頃発生', issueTime: '2026/11/07 19:02:00 発表' };
  assert.equal(decideIncomingEarthquake(newer, shown, now), 'interrupt');
  assert.equal(decideIncomingEarthquake(followUp, shown, now), 'update');
  assert.equal(decideIncomingEarthquake(older, shown, now), 'ignore');
  assert.equal(decideIncomingEarthquake(newer, null, now), 'interrupt');
  assert.equal(decideIncomingEarthquake(older, null, now, 10 * 60 * 1000), 'ignore');
});

test('parseWolfxEew: 緊急地震速報（予報）と警報、P2Pとの統合', () => {
  // Real Wolfx jma_eew frame (2026/11/07 茨城県沖 予報 第8報 最終報)
  const forecast = parseWolfxEew(
    {
      type: 'jma_eew',
      Title: '緊急地震速報（予報）',
      EventID: '20261107200747',
      Serial: 8,
      AnnouncedTime: '2026/11/07 20:08:46',
      OriginTime: '2026/11/07 20:07:41',
      Hypocenter: '茨城県沖',
      Latitude: 36.2,
      Longitude: 141.5,
      Magunitude: 5.4,
      Magnitude: 5.4,
      Depth: 40,
      MaxIntensity: '3',
      WarnArea: [],
      isSea: true,
      isTraining: false,
      isAssumption: false,
      isWarn: false,
      isFinal: true,
      isCancel: false,
    },
    1000
  );
  assert.ok(forecast);
  assert.equal(forecast!.isWarning, false);
  assert.equal(isEewWarning(forecast), false);
  assert.equal(isEewFinal(forecast), true);
  assert.equal(forecast!.maxScaleCode, 30);
  assert.equal(forecast!.maxScaleLabel, '3');
  assert.equal(forecast!.magnitude, 5.4);
  assert.equal(forecast!.depthKm, 40);
  assert.equal(forecast!.areas.length, 0);

  assert.equal(parseWolfxEew({ type: 'heartbeat', ver: 25 }), null);
  assert.equal(parseWolfxEew({ type: 'jma_eew', EventID: 'x', isTraining: true }), null);
  assert.equal(parseWolfxShindo('5弱'), 45);
  assert.equal(parseWolfxShindo('6+'), 60);
  assert.equal(parseWolfxShindo('不明'), -1);

  const warn = parseWolfxEew({
    type: 'jma_eew',
    Title: '緊急地震速報（警報）',
    EventID: '20261107200747',
    Serial: 9,
    AnnouncedTime: '2026/11/07 20:08:50',
    OriginTime: '2026/11/07 20:07:41',
    Hypocenter: '茨城県沖',
    Latitude: 36.2,
    Longitude: 141.5,
    Magnitude: 6.1,
    Depth: 40,
    MaxIntensity: '5強',
    WarnArea: [
      { Chiiki: '茨城県南部', Shindo1: '5強', Shindo2: '5弱', Type: '警報', Arrive: false },
      { Chiiki: '茨城県北部', Shindo1: '5弱', Shindo2: '4', Type: '警報', Arrive: true },
    ],
    isWarn: true,
    isFinal: false,
    isCancel: false,
  })!;
  assert.equal(warn.isWarning, true);
  assert.equal(warn.areas[0].name, '茨城県南部');
  assert.equal(warn.areas[0].pref, '茨城県');
  assert.equal(formatEewScaleRange(warn.areas[0].scaleFrom, warn.areas[0].scaleTo), '5弱～5強');
  assert.equal(formatEewArrivalLabel(warn.areas[1]), '既に到達と予測');

  // forecast -> warning: newer serial wins; older serial from the other feed is ignored
  const m1 = mergeEew(forecast, warn);
  assert.equal(m1.serial, 9);
  assert.equal(isEewWarning(m1), true);
  assert.equal(mergeEew(m1, forecast!), m1);
  // a later 予報-less serial of the same event stays 警報 and keeps the area list
  const later = { ...forecast!, serial: 10, isWarning: false, areas: [] };
  const m2 = mergeEew(m1, later);
  assert.equal(isEewWarning(m2), true);
  assert.equal(m2.areas.length, 2);
  // a different event always replaces
  const other = { ...forecast!, eventId: '20261107210000', serial: 1 };
  assert.equal(mergeEew(m2, other), other);
});

test('LPGM class is only populated when genuinely predicted (never fabricated for EEW forecast/warning without LPGM)', () => {
  assert.equal(parseLpgmClassValue(undefined), 0);
  assert.equal(parseLpgmClassValue('0'), 0);
  assert.equal(parseLpgmClassValue('-'), 0);
  assert.equal(parseLpgmClassValue('2'), 2);
  assert.equal(parseLpgmClassValue('階級3'), 3);

  // EEW Forecast (予報) with M6.0 -> must NOT fabricate LPGM 1+
  const forecastNoLpgm = parseWolfxEew({
    type: 'jma_eew',
    Title: '緊急地震速報（予報）',
    EventID: '20261108010400',
    Serial: 1,
    AnnouncedTime: '2026/11/08 01:04:40',
    OriginTime: '2026/11/08 01:04:34',
    Hypocenter: '静岡県西部',
    Latitude: 34.8,
    Longitude: 137.8,
    Magnitude: 6.0,
    Depth: 50,
    MaxIntensity: '5強',
    isWarn: false,
  })!;
  assert.equal(forecastNoLpgm.maxLpgmClass, 0);
  assert.equal(forecastNoLpgm.maxLpgmLabel, undefined);
  assert.equal(hasActualEewLpgm(forecastNoLpgm), false);

  // P2P 556 EEW Warning (警報) without explicit LPGM fields -> must NOT fabricate LPGM 1+
  const p2pNoLpgm = parseP2PEew({
    code: 556,
    issue: { eventId: '20261108010400', serial: '19', time: '2026/11/08 01:06:08' },
    earthquake: {
      originTime: '2026/11/08 01:04:34',
      hypocenter: { name: '静岡県西部', latitude: 34.8, longitude: 137.8, depth: 50, magnitude: 6.0 },
    },
    areas: [
      { pref: '静岡県', name: '静岡県西部', scaleFrom: 50, scaleTo: 50, kindCode: '10' },
      { pref: '愛知県', name: '愛知県西部', scaleFrom: 50, scaleTo: 50, kindCode: '10' },
    ],
  })!;
  assert.equal(p2pNoLpgm.maxLpgmClass, 0);
  assert.equal(p2pNoLpgm.maxLpgmLabel, undefined);
  assert.equal(hasActualEewLpgm(p2pNoLpgm), false);

  // EEW WITH explicit LPGM class -> accurately parsed and mapped to subdivision codes
  const wolfxWithLpgm = parseWolfxEew({
    type: 'jma_eew',
    Title: '緊急地震速報（警報）',
    EventID: '20261108020000',
    Serial: 5,
    AnnouncedTime: '2026/11/08 02:00:30',
    OriginTime: '2026/11/08 02:00:10',
    Hypocenter: '石川県能登地方',
    Latitude: 37.5,
    Longitude: 137.3,
    Magnitude: 6.8,
    Depth: 12,
    MaxIntensity: '6強',
    MaxLgIntensity: '3',
    WarnArea: [
      { Chiiki: '石川県能登', Shindo1: '6強', Shindo2: '6弱', LgInt: '3', Type: '警報' },
      { Chiiki: '富山県西部', Shindo1: '5弱', Shindo2: '4', LgInt: '1', Type: '警報' },
    ],
    isWarn: true,
  })!;
  assert.equal(wolfxWithLpgm.maxLpgmClass, 3);
  assert.equal(wolfxWithLpgm.maxLpgmLabel, '階級3');
  assert.equal(hasActualEewLpgm(wolfxWithLpgm), true);
  const lpgmMap = computeEewAreaLpgmClasses(wolfxWithLpgm);
  assert.ok(lpgmMap.size >= 2);
});

test('doesEarthquakeMatchEew rejects stale previous earthquake during active EEW and matches same event', () => {
  const shizuokaEew = parseWolfxEew({
    type: 'jma_eew',
    Title: '緊急地震速報（警報）',
    EventID: '20261108010400',
    Serial: 19,
    AnnouncedTime: '2026/11/08 01:06:08',
    OriginTime: '2026/11/08 01:04:34',
    Hypocenter: '静岡県西部',
    Latitude: 34.8,
    Longitude: 137.8,
    Magnitude: 6.0,
    Depth: 50,
    MaxIntensity: '5強',
    isWarn: true,
  })!;

  const prevIbarakiQuake: any = {
    id: 'eq-ibaraki-prev',
    occurrenceTime: '2026/11/07 20:07:00',
    hypocenterName: '茨城県沖',
    maxScaleCode: 30,
    maxScaleLabel: '3',
    magnitude: 5.6,
    depthKm: 20,
    lat: 36.2,
    lon: 141.5,
    stations: [{ pref: '福島県', city: '郡山市', scaleCode: 30, scaleLabel: '3' }],
  };
  assert.equal(doesEarthquakeMatchEew(prevIbarakiQuake, shizuokaEew), false);

  const matchingShizuokaQuake: any = {
    id: 'eq-shizuoka-new',
    occurrenceTime: '2026/11/08 01:04:35',
    hypocenterName: '震源調査中',
    maxScaleCode: 45,
    maxScaleLabel: '5弱',
    magnitude: 4.0,
    depthKm: 10,
    lat: 34.8,
    lon: 137.8,
    stations: [],
  };
  assert.equal(doesEarthquakeMatchEew(matchingShizuokaQuake, shizuokaEew), true);
});

test('isEewSpecialWarning follows JMA criteria (警報かつ 予想最大震度6弱以上(55+) または 長周期地震動階級4)', () => {
  assert.equal(isEewSpecialWarning(null), false);
  assert.equal(isEewSpecialWarning(undefined), false);

  // 予報 (isWarning: false) は震度6弱以上や階級4でも特別警報にならない
  assert.equal(
    isEewSpecialWarning({
      ...TEST_EEW_FORECAST_REPORT,
      maxScaleCode: 60,
      maxLpgmClass: 4,
    }),
    false
  );

  // 警報 (震度5強・階級3) -> 通常警報 (false)
  assert.equal(
    isEewSpecialWarning({
      ...TEST_EEW_REPORTS[0],
      isWarning: true,
      maxScaleCode: 50,
      maxLpgmClass: 3,
    }),
    false
  );

  // 警報 + 予想最大震度6弱 (55) -> 特別警報 (true)
  assert.equal(
    isEewSpecialWarning({
      ...TEST_EEW_REPORTS[0],
      maxScaleCode: 55,
      maxLpgmClass: 0,
    }),
    true
  );

  // 警報 + 予想最大震度4 (40) + 長周期地震動階級4 -> 特別警報 (true)
  assert.equal(
    isEewSpecialWarning({
      ...TEST_EEW_REPORTS[0],
      maxScaleCode: 40,
      maxLpgmClass: 4,
    }),
    true
  );

  // デモシーケンス第1報(警報) -> 第3報(特別警報) -> 最終報(特別警報) と Noto 地震同期確認
  assert.equal(isEewSpecialWarning(TEST_EEW_REPORTS[0]), false);
  assert.equal(isEewSpecialWarning(TEST_EEW_REPORTS[1]), true);
  assert.equal(isEewSpecialWarning(TEST_EEW_REPORTS[2]), true);
  assert.equal(doesEarthquakeMatchEew(TEST_NOTO_EARTHQUAKE_DEMO, TEST_EEW_REPORTS[2]), true);
});

test('getNextSceneId skips inactive typhoon and advances cleanly from manually selected inactive typhoon', () => {
  const withoutTyphoon = DEFAULT_NORMAL_LOOP_SCENES.filter((s) => s !== 'typhoon');
  assert.equal(getNextSceneId('warnings', withoutTyphoon), 'amedas');
  assert.equal(getNextSceneId('typhoon', withoutTyphoon), 'amedas');
  assert.equal(getNextSceneId('tsunami', withoutTyphoon), 'radar');
});
