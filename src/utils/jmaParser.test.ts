import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyXmlEntryScene,
  computeTyphoonConeEnvelope,
  computeWarningSummary,
  DEFAULT_NORMAL_LOOP_SCENES,
  filterNonOverlappingPoints,
  formatSeismicScale,
  getAmedasTempGradientColor,
  getNextSceneId,
  getNextSubRegion,
  parseJmaAmedasNationwide,
  parseJmaAtomXml,
  parseJmaIntensityString,
  parseJmaIsoCoordinate,
  parseJmaQuakeDetailJson,
  parseJmaTyphoonSpecifications,
  parseJmaWarningMapData,
  resolveLabelBoxCollisions,
} from './jmaParser';

test('formatSeismicScale maps numeric codes to JMA intensity labels', () => {
  assert.equal(formatSeismicScale(10), '1');
  assert.equal(formatSeismicScale(40), '4');
  assert.equal(formatSeismicScale(45), '5弱');
  assert.equal(formatSeismicScale(50), '5強');
  assert.equal(formatSeismicScale(55), '6弱');
  assert.equal(formatSeismicScale(60), '6強');
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

  const report = parseJmaTyphoonSpecifications(sampleSpecs, 'TC2637');
  assert.ok(report);
  assert.equal(report.displayNumber, '台風第31号');
  assert.equal(report.nameJp, 'インファ');
  assert.equal(report.points.length, 2);
  assert.equal(report.points[0].galeRadiusKm, 390);
  assert.equal(report.points[1].probabilityCircleRadiusKm, 85);

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
    },
    {
      '44132': {
        temp: [16.4, 0],
        precipitation1h: [0.0, 0],
        wind: [3.2, 0],
        windDirection: [16, 0],
        humidity: [55, 0],
      },
    },
    '01:10'
  );
  assert.equal(parsedStations.length, 1);
  assert.equal(parsedStations[0].stationName, '東京');
  assert.equal(parsedStations[0].temp, 16.4);

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
  assert.deepEqual(parseJmaIntensityString('5-'), { scaleCode: 45, scaleLabel: '5弱' });
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


