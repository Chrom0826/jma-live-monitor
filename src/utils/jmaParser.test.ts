import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeEewWaveRadiiKm,
  formatEewArrivalLabel,
  formatEewScaleRange,
  formatOccurrenceTimeJa,
  getSeismicScaleBadgeStyle,
  getTsunamiAlertSeverity,
  parseJmaTsunamiDetail,
  parseP2PEew,
  parseP2PTsunami,
  shouldReplaceEew,
} from './eewTsunami';
import {
  AMEDAS_PATROL_STOPS,
  AUTO_PATROL_SEQUENCE,
  decideIncomingEarthquake,
  isSameEarthquakeEvent,
  classifyXmlEntryScene,
  computeAmedasTop5Rankings,
  computeTyphoonConeEnvelope,
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
  parseJmaAmedasNationwide,
  parseJmaAtomXml,
  parseJmaIntensityString,
  parseJmaIsoCoordinate,
  parseJmaQuakeDetailJson,
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

  // 4. Wave propagation radii calculation (P-wave: 6.0km/s, S-wave: 3.5km/s)
  // At 10s after origin: P-dist = 60km (hypo depth 50km -> horizontal radius = sqrt(60^2 - 50^2) = sqrt(1100) ≈ 33.16km)
  // S-dist = 35km (< depth 50km -> horizontal surface radius = 0km)
  const radii10s = computeEewWaveRadiiKm(
    '2026/11/06 19:56:00',
    50,
    new Date('2026-11-06T19:56:10+09:00').getTime()
  );
  assert.ok(radii10s.pKm > 30 && radii10s.pKm < 35);
  assert.equal(radii10s.sKm, 0);

  // At 20s after origin: P-dist = 120km, S-dist = 70km (horizontal = sqrt(70^2 - 50^2) = sqrt(2400) ≈ 48.98km)
  const radii20s = computeEewWaveRadiiKm(
    '2026/11/06 19:56:00',
    50,
    new Date('2026-11-06T19:56:20+09:00').getTime()
  );
  assert.ok(radii20s.pKm > 100);
  assert.ok(radii20s.sKm > 45 && radii20s.sKm < 52);

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
