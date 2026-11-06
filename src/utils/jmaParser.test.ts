import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AMEDAS_PATROL_STOPS,
  AUTO_PATROL_SEQUENCE,
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
  getActiveSevereWarningDivisions,
  getAmedasMetricColor,
  getAmedasPointRadiusForZoom,
  getAmedasTempGradientColor,
  getAmedasWindArrowSizeForZoom,
  getNextAmedasMetric,
  getNextPatrolStep,
  getNextSceneId,
  getNextSubRegion,
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

  // 4. Wind arrow size scaling & Top-5 rankings
  assert.ok(getAmedasWindArrowSizeForZoom(5) >= 22);
  assert.ok(getAmedasWindArrowSizeForZoom(7) > getAmedasWindArrowSizeForZoom(5));

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




