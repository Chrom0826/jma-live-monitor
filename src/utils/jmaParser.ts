import {
  AmedasStationData,
  EarthquakeReport,
  EarthquakeStationIntensity,
  JmaXmlEntry,
  RegionConfig,
  RegionId,
  RegionalWarningItem,
  SceneId,
  SceneMetadata,
  TyphoonReport,
  TyphoonTrackPoint,
  WarningBadgeItem,
  WarningSeverity,
  XmlFeedType,
} from '../types/jma';

export const SCENE_LIST: SceneMetadata[] = [
  {
    id: 'radar',
    index: '01',
    shortLabel: '雨雲・雷レーダー',
    title: '高解像度降水ナウキャスト・雷レーダー',
    subtitle: '気象庁 高解像度降水ナウキャスト ＆ 雷監視システム（ライデン）',
    xmlSource: 'JMA High-Res Nowcast / LIDEN',
  },
  {
    id: 'warnings',
    index: '02',
    shortLabel: '警報・注意報',
    title: '全国の気象警報・注意報',
    subtitle: '気象庁 防災情報XML（随時 extra.xml）地域別発表状況',
    xmlSource: 'extra.xml / JMA Warning Map',
  },
  {
    id: 'typhoon',
    index: '03',
    shortLabel: '台風進路',
    title: '台風解析・進路予報情報',
    subtitle: '気象庁 台風解析・予報情報（中心×印・強風域・暴風域・予報円）',
    xmlSource: 'extra.xml / JMA Typhoon JSON',
  },
  {
    id: 'amedas',
    index: '04',
    shortLabel: 'アメダス実況',
    title: '全国アメダス気象実況（気温分布）',
    subtitle: '全国約930観測点 リアルタイム気温グラデーション＆降水量・風速',
    xmlSource: 'JMA AMeDAS / 全国気象観測',
  },
  {
    id: 'forecast',
    index: '05',
    shortLabel: '今後の天気',
    title: '全国の今後の天気・週間予報',
    subtitle: '気象庁 定時XML（regular.xml）全国主要都市予報・概況',
    xmlSource: 'regular.xml (府県天気予報・概況)',
  },
  {
    id: 'earthquake',
    index: '06',
    shortLabel: '地震情報',
    title: '地震情報（震源・震度に関する情報）',
    subtitle: '直近の地震履歴・震源・各地の震度（新規地震発生時は緊急割り込み）',
    xmlSource: 'eqvol.xml / P2P地震情報',
  },
  {
    id: 'volcano',
    index: '07',
    shortLabel: '火山情報(変化時)',
    title: '噴火警報・噴火警戒レベル変化速報',
    subtitle: '噴火警戒レベル変化・噴火発生時のみ対象火山へズーム表示',
    xmlSource: 'eqvol.xml (噴火警報・火口周辺警報)',
    isInterruptOnly: true,
  },
  {
    id: 'tsunami',
    index: '08',
    shortLabel: '津波・潮位(異常時)',
    title: '津波情報・潮位変化速報',
    subtitle: '津波発表または通常と異なる潮位観測時のみ沿岸へズーム表示',
    xmlSource: 'eqvol.xml (津波情報・潮位観測)',
    isInterruptOnly: true,
  },
];

// Normal everyday loop rotates through radar, warnings, typhoon, amedas, forecast, earthquake.
// Volcano and Tsunami only interrupt when a level change or abnormal tide occurs.
export const DEFAULT_NORMAL_LOOP_SCENES: SceneId[] = [
  'radar',
  'warnings',
  'typhoon',
  'amedas',
  'forecast',
  'earthquake',
];

export const REGION_CONFIGS: RegionConfig[] = [
  {
    id: 'national',
    name: '日本全国（標準）',
    enName: 'ALL JAPAN',
    center: [36.8, 137.5],
    zoom: 5,
    jmaOfficeCodes: ['130000', '270000', '016000', '400000'],
  },
  {
    id: 'world',
    name: '世界全体（ワールドマップ）',
    enName: 'WORLDWIDE',
    center: [30.0, 140.0],
    zoom: 3,
    jmaOfficeCodes: ['130000', '270000', '016000', '400000'],
  },
  {
    id: 'hokkaido',
    name: '北海道地方',
    enName: 'HOKKAIDO',
    center: [43.4, 142.4],
    zoom: 6,
    jmaOfficeCodes: ['016000', '012000', '015000'],
  },
  {
    id: 'tohoku',
    name: '東北地方',
    enName: 'TOHOKU',
    center: [39.2, 140.6],
    zoom: 6,
    jmaOfficeCodes: ['040000', '020000', '030000'],
  },
  {
    id: 'kanto',
    name: '関東甲信地方',
    enName: 'KANTO-KOSHIN',
    center: [36.0, 139.5],
    zoom: 7,
    jmaOfficeCodes: ['130000', '140000', '120000', '200000'],
  },
  {
    id: 'chubu',
    name: '東海・北陸地方',
    enName: 'TOKAI-HOKURIKU',
    center: [36.0, 137.0],
    zoom: 7,
    jmaOfficeCodes: ['230000', '150000', '170000', '220000'],
  },
  {
    id: 'kinki',
    name: '近畿地方',
    enName: 'KINKI',
    center: [34.7, 135.5],
    zoom: 7,
    jmaOfficeCodes: ['270000', '260000', '280000'],
  },
  {
    id: 'chugoku_shikoku',
    name: '中国・四国地方',
    enName: 'CHUGOKU-SHIKOKU',
    center: [34.2, 133.2],
    zoom: 7,
    jmaOfficeCodes: ['340000', '370000', '390000'],
  },
  {
    id: 'kyushu',
    name: '九州地方',
    enName: 'KYUSHU',
    center: [32.3, 130.8],
    zoom: 7,
    jmaOfficeCodes: ['400000', '430000', '460100'],
  },
  {
    id: 'okinawa',
    name: '沖縄・奄美地方',
    enName: 'OKINAWA',
    center: [26.2, 127.7],
    zoom: 7,
    jmaOfficeCodes: ['471000'],
  },
];

export const JMA_WARNING_CODE_TABLE: Record<
  string,
  { name: string; severity: WarningSeverity }
> = {
  '32': { name: '暴風雪特別警報', severity: 'special' },
  '33': { name: '大雨特別警報', severity: 'special' },
  '35': { name: '暴風特別警報', severity: 'special' },
  '36': { name: '大雪特別警報', severity: 'special' },
  '37': { name: '波浪特別警報', severity: 'special' },
  '38': { name: '高潮特別警報', severity: 'special' },
  '02': { name: '暴風雪', severity: 'warning' },
  '03': { name: '大雨', severity: 'warning' },
  '04': { name: '洪水', severity: 'warning' },
  '05': { name: '暴風', severity: 'warning' },
  '06': { name: '大雪', severity: 'warning' },
  '07': { name: '波浪', severity: 'warning' },
  '08': { name: '高潮', severity: 'warning' },
  '10': { name: '大雨', severity: 'advisory' },
  '12': { name: '大雪', severity: 'advisory' },
  '13': { name: '風雪', severity: 'advisory' },
  '14': { name: '雷', severity: 'advisory' },
  '15': { name: '強風', severity: 'advisory' },
  '16': { name: '波浪', severity: 'advisory' },
  '17': { name: '融雪', severity: 'advisory' },
  '18': { name: '洪水', severity: 'advisory' },
  '19': { name: '高潮', severity: 'advisory' },
  '20': { name: '濃霧', severity: 'advisory' },
  '21': { name: '乾燥', severity: 'advisory' },
  '22': { name: 'なだれ', severity: 'advisory' },
  '23': { name: '低温', severity: 'advisory' },
  '24': { name: '霜', severity: 'advisory' },
  '25': { name: '着氷', severity: 'advisory' },
  '26': { name: '着雪', severity: 'advisory' },
};

export const PREFECTURE_NAMES: Record<
  number,
  { name: string; regionId: RegionId; lat: number; lon: number }
> = {
  1: { name: '北海道', regionId: 'hokkaido', lat: 43.06, lon: 141.35 },
  2: { name: '青森県', regionId: 'tohoku', lat: 40.82, lon: 140.74 },
  3: { name: '岩手県', regionId: 'tohoku', lat: 39.7, lon: 141.15 },
  4: { name: '宮城県', regionId: 'tohoku', lat: 38.27, lon: 140.87 },
  5: { name: '秋田県', regionId: 'tohoku', lat: 39.72, lon: 140.1 },
  6: { name: '山形県', regionId: 'tohoku', lat: 38.24, lon: 140.36 },
  7: { name: '福島県', regionId: 'tohoku', lat: 37.75, lon: 140.47 },
  8: { name: '茨城県', regionId: 'kanto', lat: 36.34, lon: 140.45 },
  9: { name: '栃木県', regionId: 'kanto', lat: 36.57, lon: 139.88 },
  10: { name: '群馬県', regionId: 'kanto', lat: 36.39, lon: 139.06 },
  11: { name: '埼玉県', regionId: 'kanto', lat: 35.86, lon: 139.65 },
  12: { name: '千葉県', regionId: 'kanto', lat: 35.61, lon: 140.12 },
  13: { name: '東京都', regionId: 'kanto', lat: 35.69, lon: 139.69 },
  14: { name: '神奈川県', regionId: 'kanto', lat: 35.45, lon: 139.64 },
  15: { name: '新潟県', regionId: 'chubu', lat: 37.9, lon: 139.02 },
  16: { name: '富山県', regionId: 'chubu', lat: 36.7, lon: 137.21 },
  17: { name: '石川県', regionId: 'chubu', lat: 36.59, lon: 136.63 },
  18: { name: '福井県', regionId: 'chubu', lat: 36.07, lon: 136.22 },
  19: { name: '山梨県', regionId: 'kanto', lat: 35.66, lon: 138.57 },
  20: { name: '長野県', regionId: 'kanto', lat: 36.65, lon: 138.18 },
  21: { name: '岐阜県', regionId: 'chubu', lat: 35.39, lon: 136.72 },
  22: { name: '静岡県', regionId: 'chubu', lat: 34.98, lon: 138.38 },
  23: { name: '愛知県', regionId: 'chubu', lat: 35.18, lon: 136.91 },
  24: { name: '三重県', regionId: 'kinki', lat: 34.73, lon: 136.51 },
  25: { name: '滋賀県', regionId: 'kinki', lat: 35.0, lon: 135.87 },
  26: { name: '京都府', regionId: 'kinki', lat: 35.02, lon: 135.76 },
  27: { name: '大阪府', regionId: 'kinki', lat: 34.69, lon: 135.52 },
  28: { name: '兵庫県', regionId: 'kinki', lat: 34.69, lon: 135.18 },
  29: { name: '奈良県', regionId: 'kinki', lat: 34.69, lon: 135.83 },
  30: { name: '和歌山県', regionId: 'kinki', lat: 34.23, lon: 135.17 },
  31: { name: '鳥取県', regionId: 'chugoku_shikoku', lat: 35.5, lon: 134.24 },
  32: { name: '島根県', regionId: 'chugoku_shikoku', lat: 35.47, lon: 133.05 },
  33: { name: '岡山県', regionId: 'chugoku_shikoku', lat: 34.66, lon: 133.93 },
  34: { name: '広島県', regionId: 'chugoku_shikoku', lat: 34.4, lon: 132.46 },
  35: { name: '山口県', regionId: 'chugoku_shikoku', lat: 34.19, lon: 131.47 },
  36: { name: '徳島県', regionId: 'chugoku_shikoku', lat: 34.07, lon: 134.56 },
  37: { name: '香川県', regionId: 'chugoku_shikoku', lat: 34.34, lon: 134.04 },
  38: { name: '愛媛県', regionId: 'chugoku_shikoku', lat: 33.84, lon: 132.77 },
  39: { name: '高知県', regionId: 'chugoku_shikoku', lat: 33.56, lon: 133.53 },
  40: { name: '福岡県', regionId: 'kyushu', lat: 33.61, lon: 130.42 },
  41: { name: '佐賀県', regionId: 'kyushu', lat: 33.25, lon: 130.3 },
  42: { name: '長崎県', regionId: 'kyushu', lat: 32.74, lon: 129.87 },
  43: { name: '熊本県', regionId: 'kyushu', lat: 32.79, lon: 130.74 },
  44: { name: '大分県', regionId: 'kyushu', lat: 33.24, lon: 131.61 },
  45: { name: '宮崎県', regionId: 'kyushu', lat: 31.91, lon: 131.42 },
  46: { name: '鹿児島県', regionId: 'kyushu', lat: 31.56, lon: 130.56 },
  47: { name: '沖縄県', regionId: 'okinawa', lat: 26.21, lon: 127.68 },
};

const HOKKAIDO_SUBOFFICE_NAMES: Record<string, string> = {
  '011000': '宗谷地方',
  '012010': '上川地方',
  '012020': '留萌地方',
  '013010': '網走地方',
  '013020': '北見地方',
  '013030': '紋別地方',
  '014010': '根室地方',
  '014020': '釧路地方',
  '014030': '十勝地方',
  '015010': '胆振地方',
  '015020': '日高地方',
  '016010': '石狩地方',
  '016020': '空知地方',
  '016030': '後志地方',
  '017010': '渡島地方',
  '017020': '檜山地方',
};

function compareSeverity(a: WarningSeverity, b: WarningSeverity): number {
  const rank: Record<WarningSeverity, number> = {
    special: 3,
    warning: 2,
    advisory: 1,
    normal: 0,
  };
  return rank[a] - rank[b];
}

/**
 * Parses JMA's live `https://www.jma.go.jp/bosai/warning/data/warning/map.json`
 * into a 47-prefecture severity lookup table (`prefSeverityMap`) AND a compact
 * regional list (`RegionalWarningItem[]`) for the NERV-style right sidebar.
 */
export function parseJmaWarningMapData(rawArray: Array<Record<string, any>>): {
  warnings: RegionalWarningItem[];
  prefSeverityMap: Record<number, WarningSeverity>;
} {
  const prefSeverityMap: Record<number, WarningSeverity> = {};
  for (let i = 1; i <= 47; i++) {
    prefSeverityMap[i] = 'normal';
  }

  const warnings: RegionalWarningItem[] = [];

  for (const officeBlock of rawArray) {
    const areas = officeBlock.areaTypes?.[0]?.areas;
    if (!Array.isArray(areas) || areas.length === 0) continue;

    for (const area of areas) {
      const codeStr = String(area.code || '');
      if (codeStr.length < 2) continue;
      const prefId = Number(codeStr.slice(0, 2));
      if (!prefId || prefId < 1 || prefId > 47) continue;

      const prefMeta = PREFECTURE_NAMES[prefId];
      if (!prefMeta) continue;

      const activeCodes = new Set<string>();
      const rawWarnings = Array.isArray(area.warnings) ? area.warnings : [];
      for (const w of rawWarnings) {
        if (
          w &&
          w.code &&
          w.status !== '解除' &&
          w.status !== '発表警報・注意報はなし'
        ) {
          activeCodes.add(String(w.code));
        }
      }

      if (activeCodes.size === 0) continue;

      const badgeItems: WarningBadgeItem[] = [];
      let maxSeverity: WarningSeverity = 'normal';

      for (const c of activeCodes) {
        const info = JMA_WARNING_CODE_TABLE[c];
        if (!info) continue;
        if (!badgeItems.some((b) => b.name === info.name && b.severity === info.severity)) {
          badgeItems.push({ code: c, name: info.name, severity: info.severity });
        }
        if (compareSeverity(info.severity, maxSeverity) > 0) {
          maxSeverity = info.severity;
        }
      }

      if (badgeItems.length === 0) continue;

      badgeItems.sort((a, b) => compareSeverity(b.severity, a.severity));

      if (compareSeverity(maxSeverity, prefSeverityMap[prefId] || 'normal') > 0) {
        prefSeverityMap[prefId] = maxSeverity;
      }

      const displayAreaName =
        HOKKAIDO_SUBOFFICE_NAMES[codeStr] || prefMeta.name;

      const existing = warnings.find((w) => w.prefecture === displayAreaName);
      if (existing) {
        for (const item of badgeItems) {
          if (!existing.badgeItems.some((b) => b.name === item.name)) {
            existing.badgeItems.push(item);
            existing.activeWarnings.push(item.name);
          }
        }
        if (compareSeverity(maxSeverity, existing.severity) > 0) {
          existing.severity = maxSeverity;
        }
      } else {
        warnings.push({
          id: `warn-${codeStr}`,
          prefId,
          prefecture: displayAreaName,
          regionId: prefMeta.regionId,
          areaName: displayAreaName,
          lat: prefMeta.lat,
          lon: prefMeta.lon,
          severity: maxSeverity,
          activeWarnings: badgeItems.map((b) => b.name),
          badgeItems,
          updatedAt: String(officeBlock.reportDatetime || '').slice(11, 16) || '最新',
          office: '気象庁',
          headline: `${displayAreaName}に${badgeItems.map((b) => b.name).join('・')}発表中`,
        });
      }
    }
  }

  return { warnings, prefSeverityMap };
}

function formatJstDayHour(isoStr: string, suffix: string): string {
  try {
    const d = new Date(isoStr);
    if (!Number.isNaN(d.getTime())) {
      const jst = new Date(d.getTime() + 9 * 3600 * 1000);
      const day = jst.getUTCDate();
      const hour = String(jst.getUTCHours()).padStart(2, '0');
      return `${day}日${hour}時 ${suffix}`;
    }
  } catch {
    // ignore
  }
  return suffix;
}

/**
 * Pure parser for JMA's live `https://www.jma.go.jp/bosai/typhoon/data/{tcId}/specifications.json`.
 * Extracts current center position, gale/storm radii, and forecast track points with probability circle radii.
 */
export function parseJmaTyphoonSpecifications(
  rawSpecs: Array<Record<string, any>>,
  tcId = 'TC'
): TyphoonReport | null {
  if (!Array.isArray(rawSpecs) || rawSpecs.length < 2) {
    return null;
  }

  const header = rawSpecs[0];
  const rawNumber = String(header.typhoonNumber || '');
  const shortNum = rawNumber.length >= 2 ? Number(rawNumber.slice(-2)) : 0;
  const displayNumber = shortNum > 0 ? `台風第${shortNum}号` : '熱帯低気圧・台風';
  const nameJp = header.name?.jp || '発生中';
  const nameEn = header.name?.en || '';
  const categoryJp = header.category?.jp || '台風';
  const issueIso = header.issue?.JST || '';
  const issueTimeJst = issueIso
    ? `${issueIso.slice(5, 7)}月${issueIso.slice(8, 10)}日 ${issueIso.slice(11, 16)} 発表`
    : '最新発表';

  const points: TyphoonTrackPoint[] = [];

  for (let i = 1; i < rawSpecs.length; i++) {
    const item = rawSpecs[i];
    const deg = item.position?.deg;
    if (!Array.isArray(deg) || deg.length < 2) continue;

    const lat = Number(deg[0]);
    const lon = Number(deg[1]);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

    const partJp = String(item.part?.jp || '').replace(/\s+/g, ' ').trim();
    const advHours = Number(item.advancedHours ?? 0);
    const isForecast = partJp.includes('予報') || advHours > 0;
    const validIso = item.validtime?.JST || '';
    const timeLabel = formatJstDayHour(
      validIso,
      isForecast ? `(${advHours}h後予報)` : '実況'
    );

    // Gale warning radius (強風域 15m/s以上)
    let galeRadiusKm = 0;
    if (Array.isArray(item.galeWarning)) {
      for (const gw of item.galeWarning) {
        const km = Number(gw?.range?.km || 0);
        if (km > galeRadiusKm) galeRadiusKm = km;
      }
    }

    // Storm warning radius (暴風域 25m/s以上)
    let stormRadiusKm = 0;
    if (Array.isArray(item.stormWarning)) {
      for (const sw of item.stormWarning) {
        const km = Number(sw?.range?.km || 0);
        if (km > stormRadiusKm) stormRadiusKm = km;
      }
    }

    const probRadiusKm = Number(item.probabilityCircleRadius?.km || 0);
    const pressureHpa = Number(item.pressure || 990);
    const maxWindMs = Number(item.maximumWind?.sustained?.['m/s'] || 0);
    const maxGustMs = Number(item.maximumWind?.gust?.['m/s'] || 0);
    const speedKmh = Number(item.speed?.['km/h'] || 0);

    points.push({
      partLabel: partJp || (isForecast ? `${advHours}時間後予報` : '実況'),
      timeLabel,
      advancedHours: advHours,
      isForecast,
      categoryJp: item.category?.jp || '台風',
      intensity: item.intensity && item.intensity !== '-' ? String(item.intensity) : '',
      scale: item.scale && item.scale !== '-' ? String(item.scale) : '',
      lat,
      lon,
      pressureHpa,
      maxWindMs,
      maxGustMs,
      course: String(item.course || '-'),
      speedKmh,
      location: String(item.location || ''),
      probabilityCircleRadiusKm: probRadiusKm,
      galeRadiusKm,
      stormRadiusKm,
    });
  }

  if (points.length === 0) return null;

  return {
    id: tcId,
    typhoonNumber: rawNumber,
    displayNumber,
    nameJp,
    nameEn,
    categoryJp,
    issueTimeJst,
    isLiveJma: true,
    points,
  };
}

/**
 * Computes the left and right outer boundary polylines for a typhoon forecast cone
 * (予報円の包絡線・扇形) connecting consecutive track points and their probability circle radii.
 */
export function computeTyphoonConeEnvelope(points: TyphoonTrackPoint[]): {
  leftEdge: Array<[number, number]>;
  rightEdge: Array<[number, number]>;
  polygon: Array<[number, number]>;
} {
  if (points.length < 2) {
    return { leftEdge: [], rightEdge: [], polygon: [] };
  }

  const leftEdge: Array<[number, number]> = [];
  const rightEdge: Array<[number, number]> = [];

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const rKm = pt.probabilityCircleRadiusKm || 0;

    // Determine forward bearing vector in degrees
    const prev = i > 0 ? points[i - 1] : pt;
    const next = i < points.length - 1 ? points[i + 1] : pt;
    const dLat = next.lat - prev.lat;
    const cosLat = Math.max(0.2, Math.cos((pt.lat * Math.PI) / 180));
    const dLonScaled = (next.lon - prev.lon) * cosLat;
    const len = Math.hypot(dLat, dLonScaled) || 1;

    // Perpendicular unit vector (left & right of track direction)
    const perpLat = -dLonScaled / len;
    const perpLonScaled = dLat / len;

    // 1 degree of latitude is ~111.32 km
    const rDegLat = rKm / 111.32;
    const rDegLon = rDegLat / cosLat;

    leftEdge.push([
      Number((pt.lat + perpLat * rDegLat).toFixed(4)),
      Number((pt.lon + perpLonScaled * rDegLon).toFixed(4)),
    ]);
    rightEdge.push([
      Number((pt.lat - perpLat * rDegLat).toFixed(4)),
      Number((pt.lon - perpLonScaled * rDegLon).toFixed(4)),
    ]);
  }

  const polygon: Array<[number, number]> = [
    ...leftEdge,
    ...[...rightEdge].reverse(),
  ];

  return { leftEdge, rightEdge, polygon };
}

/**
 * Converts JMA / P2PQuake scale numeric code into Japanese human-readable scale label.
 */
export function formatSeismicScale(scaleCode: number): string {
  switch (scaleCode) {
    case 10:
      return '1';
    case 20:
      return '2';
    case 30:
      return '3';
    case 40:
      return '4';
    case 45:
      return '5-';
    case 50:
      return '5+';
    case 55:
      return '6-';
    case 60:
      return '6+';
    case 70:
      return '7';
    default:
      return '-';
  }
}

export function getSeismicScaleStyle(scaleCode: number): {
  bg: string;
  text: string;
  border: string;
  hex: string;
  badgeText: string;
} {
  if (scaleCode >= 70) {
    return {
      bg: 'bg-purple-950/90',
      text: 'text-purple-200',
      border: 'border-purple-500',
      hex: '#9333EA',
      badgeText: '#FFFFFF',
    };
  }
  if (scaleCode >= 60) {
    return {
      bg: 'bg-red-950/95',
      text: 'text-red-200',
      border: 'border-red-500',
      hex: '#DC2626',
      badgeText: '#FFFFFF',
    };
  }
  if (scaleCode >= 55) {
    return {
      bg: 'bg-rose-950/90',
      text: 'text-rose-200',
      border: 'border-rose-500',
      hex: '#EF4444',
      badgeText: '#FFFFFF',
    };
  }
  if (scaleCode >= 50) {
    return {
      bg: 'bg-orange-950/90',
      text: 'text-orange-200',
      border: 'border-orange-500',
      hex: '#F97316',
      badgeText: '#FFFFFF',
    };
  }
  if (scaleCode >= 45) {
    return {
      bg: 'bg-amber-950/90',
      text: 'text-amber-200',
      border: 'border-amber-500',
      hex: '#F59E0B',
      badgeText: '#07090E',
    };
  }
  if (scaleCode >= 40) {
    return {
      bg: 'bg-yellow-950/90',
      text: 'text-yellow-200',
      border: 'border-yellow-400',
      hex: '#FACC15',
      badgeText: '#07090E',
    };
  }
  if (scaleCode >= 30) {
    return {
      bg: 'bg-emerald-950/90',
      text: 'text-emerald-200',
      border: 'border-emerald-500',
      hex: '#22C55E',
      badgeText: '#07090E',
    };
  }
  if (scaleCode >= 20) {
    return {
      bg: 'bg-sky-950/90',
      text: 'text-sky-200',
      border: 'border-sky-400',
      hex: '#38BDF8',
      badgeText: '#07090E',
    };
  }
  return {
    bg: 'bg-slate-800/90',
    text: 'text-slate-200',
    border: 'border-slate-500',
    hex: '#64748B',
    badgeText: '#F8FAFC',
  };
}

/**
 * Converts JMA's intensity string (`"1"`, `"2"`, `"3"`, `"4"`, `"5-"`, `"5+"`, `"6-"`, `"6+"`, `"7"`)
 * into a numeric `scaleCode` and human-readable `scaleLabel`.
 */
export function parseJmaIntensityString(intStr: string): {
  scaleCode: number;
  scaleLabel: string;
} {
  const s = String(intStr || '').trim();
  switch (s) {
    case '7':
      return { scaleCode: 70, scaleLabel: '7' };
    case '6+':
    case '6強':
      return { scaleCode: 60, scaleLabel: '6+' };
    case '6-':
    case '6弱':
      return { scaleCode: 55, scaleLabel: '6-' };
    case '5+':
    case '5強':
      return { scaleCode: 50, scaleLabel: '5+' };
    case '5-':
    case '5弱':
      return { scaleCode: 45, scaleLabel: '5-' };
    case '4':
      return { scaleCode: 40, scaleLabel: '4' };
    case '3':
      return { scaleCode: 30, scaleLabel: '3' };
    case '2':
      return { scaleCode: 20, scaleLabel: '2' };
    case '1':
      return { scaleCode: 10, scaleLabel: '1' };
    default:
      return { scaleCode: 10, scaleLabel: '1' };
  }
}

/**
 * Parses JMA ISO-6709 coordinate string such as `"+37.8+141.5-80000/"` or `"+32.4+130.5+0/"`.
 */
export function parseJmaIsoCoordinate(cod: string): {
  lat: number;
  lon: number;
  depthKm: number;
} | null {
  if (!cod || typeof cod !== 'string') return null;
  const match = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)?/.exec(
    cod.trim()
  );
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  const depthMeters = match[3] ? Math.abs(Number(match[3])) : 10000;
  const depthKm = Math.round(depthMeters / 1000);
  return { lat, lon, depthKm };
}

function formatJmaIsoDateTimeJst(isoStr: string, suffix: string): string {
  if (!isoStr || typeof isoStr !== 'string') return suffix;
  // Example: "2026-11-06T03:05:00+09:00" -> "2026/11/06 03:05 頃発生"
  if (isoStr.length >= 16) {
    const datePart = isoStr.slice(0, 10).replace(/-/g, '/');
    const timePart = isoStr.slice(11, 16);
    return `${datePart} ${timePart} ${suffix}`;
  }
  return `${isoStr} ${suffix}`;
}

function inferRegionFromHypocenterName(name: string, lat: number, lon: number): RegionId {
  if (name.includes('北海道') || name.includes('釧路') || name.includes('十勝') || name.includes('千島'))
    return 'hokkaido';
  if (
    name.includes('青森') ||
    name.includes('岩手') ||
    name.includes('宮城') ||
    name.includes('秋田') ||
    name.includes('山形') ||
    name.includes('福島') ||
    name.includes('三陸')
  )
    return 'tohoku';
  if (
    name.includes('茨城') ||
    name.includes('栃木') ||
    name.includes('群馬') ||
    name.includes('埼玉') ||
    name.includes('千葉') ||
    name.includes('東京') ||
    name.includes('神奈川') ||
    name.includes('相模') ||
    name.includes('山梨') ||
    name.includes('長野') ||
    name.includes('伊豆') ||
    name.includes('小笠原')
  )
    return 'kanto';
  if (
    name.includes('新潟') ||
    name.includes('富山') ||
    name.includes('石川') ||
    name.includes('福井') ||
    name.includes('岐阜') ||
    name.includes('静岡') ||
    name.includes('愛知') ||
    name.includes('能登')
  )
    return 'chubu';
  if (
    name.includes('三重') ||
    name.includes('滋賀') ||
    name.includes('京都') ||
    name.includes('大阪') ||
    name.includes('兵庫') ||
    name.includes('奈良') ||
    name.includes('和歌山')
  )
    return 'kinki';
  if (
    name.includes('鳥取') ||
    name.includes('島根') ||
    name.includes('岡山') ||
    name.includes('広島') ||
    name.includes('山口') ||
    name.includes('徳島') ||
    name.includes('香川') ||
    name.includes('愛媛') ||
    name.includes('高知') ||
    name.includes('伊予') ||
    name.includes('豊後')
  )
    return 'chugoku_shikoku';
  if (
    name.includes('沖縄') ||
    name.includes('奄美') ||
    name.includes('宮古') ||
    name.includes('石垣') ||
    name.includes('与那国')
  )
    return 'okinawa';
  return inferRegionFromCoords(lat, lon).regionId;
}

/**
 * Parses JMA's official `https://www.jma.go.jp/bosai/quake/data/{json}` detail report,
 * extracting the hypocenter AND every individual seismic intensity meter (`IntensityStation`)
 * with its exact latitude, longitude, and observed intensity (`1`, `2`, `3`, `4`, `5弱`, `5強`, `6弱`, `6強`, `7`).
 */
export function parseJmaQuakeDetailJson(
  detailJson: Record<string, any>,
  listSummary?: Record<string, any>
): EarthquakeReport | null {
  try {
    if (!detailJson || typeof detailJson !== 'object') return null;

    const head = detailJson.Head || {};
    const body = detailJson.Body || {};
    const eq = body.Earthquake || {};
    const hypoArea = eq.Hypocenter?.Area || {};

    const eid = String(head.EventID || listSummary?.eid || '');
    const hypocenterName = String(
      hypoArea.Name || listSummary?.anm || '震源調査中'
    );
    const coordStr = String(hypoArea.Coordinate || listSummary?.cod || '');
    const parsedCoord = parseJmaIsoCoordinate(coordStr);

    const lat = parsedCoord ? parsedCoord.lat : 35.68;
    const lon = parsedCoord ? parsedCoord.lon : 139.76;
    const depthKm = parsedCoord ? parsedCoord.depthKm : 10;

    const rawMag = Number(eq.Magnitude ?? listSummary?.mag ?? 4.0);
    const magnitude =
      !Number.isNaN(rawMag) && rawMag > 0 ? Number(rawMag.toFixed(1)) : 4.0;

    const obs = body.Intensity?.Observation || {};
    const maxIntStr = String(obs.MaxInt || listSummary?.maxi || '1');
    const maxIntInfo = parseJmaIntensityString(maxIntStr);

    const stations: EarthquakeStationIntensity[] = [];
    const prefs = Array.isArray(obs.Pref) ? obs.Pref : [];

    for (const pref of prefs) {
      const prefName = String(pref?.Name || '');
      const areas = Array.isArray(pref?.Area) ? pref.Area : [];
      for (const area of areas) {
        const areaName = String(area?.Name || prefName);
        const cities = Array.isArray(area?.City) ? area.City : [];
        for (const city of cities) {
          const cityName = String(city?.Name || areaName);
          const intensityStations = Array.isArray(city?.IntensityStation)
            ? city.IntensityStation
            : [];
          for (const st of intensityStations) {
            const stName = String(st?.Name || cityName).replace(/[＊*]/g, '');
            const intInfo = parseJmaIntensityString(
              String(st?.Int || city?.MaxInt || pref?.MaxInt || '1')
            );
            const stLat = Number(st?.latlon?.lat);
            const stLon = Number(st?.latlon?.lon);
            stations.push({
              prefecture: prefName,
              city: cityName,
              stationName: stName,
              scaleCode: intInfo.scaleCode,
              scaleLabel: intInfo.scaleLabel,
              lat: !Number.isNaN(stLat) && stLat > 0 ? stLat : undefined,
              lon: !Number.isNaN(stLon) && stLon > 0 ? stLon : undefined,
            });
          }
        }
      }
    }

    stations.sort((a, b) => b.scaleCode - a.scaleCode);

    const reportIso = String(head.ReportDateTime || listSummary?.rdt || '');
    const originIso = String(eq.OriginTime || listSummary?.at || reportIso);
    const commentText = String(
      body.Comments?.ForecastComment?.Text || ''
    ).trim();

    return {
      id: eid ? `jma-eq-${eid}` : `jma-eq-${originIso}`,
      issueTime: formatJmaIsoDateTimeJst(reportIso, '発表'),
      occurrenceTime: formatJmaIsoDateTimeJst(originIso, '頃発生'),
      hypocenterName,
      regionId: inferRegionFromHypocenterName(hypocenterName, lat, lon),
      lat,
      lon,
      depthKm,
      magnitude,
      maxScaleCode: maxIntInfo.scaleCode,
      maxScaleLabel: maxIntInfo.scaleLabel,
      domesticTsunami:
        commentText || 'この地震による津波の心配はありません。',
      foreignTsunami: 'なし',
      sourceOffice: String(
        detailJson.Control?.EditorialOffice ||
          detailJson.Control?.PublishingOffice ||
          '気象庁本庁（震源・震度情報）'
      ),
      stations:
        stations.length > 0
          ? stations
          : [
              {
                prefecture: hypocenterName,
                city: hypocenterName,
                stationName: hypocenterName,
                scaleCode: maxIntInfo.scaleCode,
                scaleLabel: maxIntInfo.scaleLabel,
                lat,
                lon,
              },
            ],
    };
  } catch {
    return null;
  }
}

/**
 * Classifies a JMA XML Atom entry into one of the SceneIds based on title & summary text.
 */
export function classifyXmlEntryScene(
  title: string,
  content: string,
  feedType: XmlFeedType
): SceneId {
  const combined = `${title} ${content}`;
  if (combined.includes('津波') || combined.includes('潮位')) {
    return 'tsunami';
  }
  if (
    combined.includes('火山') ||
    combined.includes('噴火') ||
    combined.includes('降灰') ||
    combined.includes('火口')
  ) {
    return 'volcano';
  }
  if (
    combined.includes('震源') ||
    combined.includes('震度') ||
    combined.includes('地震')
  ) {
    return 'earthquake';
  }
  if (combined.includes('台風') || combined.includes('熱帯低気圧')) {
    return 'typhoon';
  }
  if (combined.includes('警報') || combined.includes('注意報')) {
    return 'warnings';
  }
  if (
    combined.includes('気象情報') ||
    combined.includes('大雨') ||
    combined.includes('土砂災害') ||
    combined.includes('竜巻')
  ) {
    return 'weather_info';
  }
  if (combined.includes('ナウキャスト') || combined.includes('レーダー')) {
    return 'radar';
  }
  if (combined.includes('観測') || combined.includes('アメダス')) {
    return 'amedas';
  }
  if (feedType === 'eqvol') {
    return 'earthquake';
  }
  if (feedType === 'extra') {
    return 'warnings';
  }
  return 'forecast';
}

/**
 * Pure XML parser for JMA Atom feed (`regular.xml`, `extra.xml`, `eqvol.xml`).
 */
export function parseJmaAtomXml(
  xmlText: string,
  feedType: XmlFeedType,
  maxItems = 25
): JmaXmlEntry[] {
  if (!xmlText || !xmlText.includes('<entry>')) {
    return [];
  }

  const entries: JmaXmlEntry[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match: RegExpExecArray | null;

  const extractTag = (block: string, tag: string): string => {
    const tagRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const found = tagRegex.exec(block);
    return found ? decodeXmlEntities(found[1].trim()) : '';
  };

  const extractLinkHref = (block: string): string => {
    const linkRegex = /<link[^>]*href=["']([^"']+)["'][^>]*>/i;
    const found = linkRegex.exec(block);
    return found ? found[1].trim() : '';
  };

  while ((match = entryRegex.exec(xmlText)) !== null && entries.length < maxItems) {
    const block = match[1];
    const id = extractTag(block, 'id') || `jma-${feedType}-${entries.length}`;
    const title = extractTag(block, 'title') || '気象庁防災情報電文';
    const updated = extractTag(block, 'updated') || new Date().toISOString();
    const authorBlock = extractTag(block, 'author');
    const author = extractTag(authorBlock, 'name') || authorBlock || '気象庁';
    const content = extractTag(block, 'content') || title;
    const link = extractLinkHref(block);

    entries.push({
      id,
      title,
      updated,
      author,
      link,
      content,
      feedType,
      category: classifyXmlEntryScene(title, content, feedType),
    });
  }

  return entries;
}

export function decodeXmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function getNextSceneId(
  currentScene: SceneId,
  enabledScenes: SceneId[]
): SceneId {
  const orderedIds = SCENE_LIST.map((s) => s.id).filter((id) =>
    enabledScenes.includes(id)
  );
  if (orderedIds.length === 0) {
    return currentScene;
  }
  const currentIndex = orderedIds.indexOf(currentScene);
  if (currentIndex === -1) {
    return orderedIds[0];
  }
  return orderedIds[(currentIndex + 1) % orderedIds.length];
}

export function getNextSubRegion(currentSubRegion: RegionId): RegionId {
  const patrolOrder: RegionId[] = [
    'national',
    'hokkaido',
    'tohoku',
    'kanto',
    'chubu',
    'kinki',
    'chugoku_shikoku',
    'kyushu',
    'okinawa',
  ];
  const idx = patrolOrder.indexOf(currentSubRegion);
  if (idx === -1) return 'national';
  return patrolOrder[(idx + 1) % patrolOrder.length];
}

export function computeWarningSummary(warnings: RegionalWarningItem[]): {
  specialCount: number;
  warningCount: number;
  advisoryCount: number;
  normalCount: number;
} {
  let specialCount = 0;
  let warningCount = 0;
  let advisoryCount = 0;
  let normalCount = 0;

  for (const w of warnings) {
    if (w.severity === 'special') specialCount++;
    else if (w.severity === 'warning') warningCount++;
    else if (w.severity === 'advisory') advisoryCount++;
    else normalCount++;
  }

  return { specialCount, warningCount, advisoryCount, normalCount };
}

const TEMP_COLOR_STOPS: Array<{ temp: number; rgb: [number, number, number] }> = [
  { temp: -5, rgb: [96, 165, 250] },   // #60A5FA (deep frost blue)
  { temp: 0, rgb: [147, 197, 253] },   // #93C5FD (ice blue)
  { temp: 5, rgb: [191, 219, 254] },   // #BFDBFE (pale ice blue - Hokkaido inland)
  { temp: 9, rgb: [224, 242, 254] },   // #E0F2FE (crisp white-blue - Hokkaido/Tohoku)
  { temp: 12, rgb: [254, 249, 195] },  // #FEF9C3 (pale cream yellow - Tohoku/Hokuriku)
  { temp: 15, rgb: [254, 240, 138] },  // #FEF08A (soft yellow)
  { temp: 18, rgb: [253, 224, 71] },   // #FDE047 (bright yellow - Kanto/Tokai/Kinki)
  { temp: 21, rgb: [250, 204, 21] },   // #FACC15 (golden yellow - Western Japan/Kyushu)
  { temp: 24, rgb: [245, 158, 11] },   // #F59E0B (warm amber - Southern Kyushu/Amami)
  { temp: 27, rgb: [249, 115, 22] },   // #F97316 (vivid orange - Okinawa/Yaeyama)
  { temp: 31, rgb: [239, 68, 68] },    // #EF4444 (hot red)
];

/**
 * Returns a smooth hex color (`#RRGGBB`) interpolated from temperature (°C),
 * matching the dense nationwide AMeDAS dot gradient aesthetic.
 */
export function getAmedasTempGradientColor(temp: number): string {
  if (Number.isNaN(temp)) return '#94A3B8';
  if (temp <= TEMP_COLOR_STOPS[0].temp) {
    const [r, g, b] = TEMP_COLOR_STOPS[0].rgb;
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
  }
  const last = TEMP_COLOR_STOPS[TEMP_COLOR_STOPS.length - 1];
  if (temp >= last.temp) {
    const [r, g, b] = last.rgb;
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
  }

  for (let i = 0; i < TEMP_COLOR_STOPS.length - 1; i++) {
    const a = TEMP_COLOR_STOPS[i];
    const b = TEMP_COLOR_STOPS[i + 1];
    if (temp >= a.temp && temp <= b.temp) {
      const ratio = (temp - a.temp) / (b.temp - a.temp);
      const r = Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * ratio);
      const g = Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * ratio);
      const bl = Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * ratio);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`.toUpperCase();
    }
  }
  return '#FACC15';
}

const WIND_DIR_NAMES = [
  '静穏',
  '北北東',
  '北東',
  '東北東',
  '東',
  '東南東',
  '南東',
  '南南東',
  '南',
  '南南西',
  '南西',
  '西南西',
  '西',
  '西北西',
  '北西',
  '北北西',
  '北',
];

function inferRegionFromCoords(lat: number, lon: number): {
  regionId: RegionId;
  prefecture: string;
} {
  if (lat >= 41.35) return { regionId: 'hokkaido', prefecture: '北海道' };
  if (lat >= 37.0 && lon >= 139.5) return { regionId: 'tohoku', prefecture: '東北' };
  if (lat < 30.2) return { regionId: 'okinawa', prefecture: '沖縄・奄美' };
  if (lon < 132.0 && lat < 34.5) return { regionId: 'kyushu', prefecture: '九州' };
  if (lon < 134.8) return { regionId: 'chugoku_shikoku', prefecture: '中国・四国' };
  if (lon < 136.3 && lat < 35.8) return { regionId: 'kinki', prefecture: '近畿' };
  if (lon < 138.8) return { regionId: 'chubu', prefecture: '東海・北陸' };
  return { regionId: 'kanto', prefecture: '関東甲信' };
}

/**
 * Parses JMA's nationwide `amedastable.json` and `map/{YYYYMMDDHHMMSS}.json`
 * into ~900+ temperature-observing AMeDAS station points across Japan.
 */
export function parseJmaAmedasNationwide(
  tableJson: Record<string, any>,
  latestMapJson: Record<string, any>,
  observedAtLabel = '最新観測'
): AmedasStationData[] {
  if (!tableJson || !latestMapJson) return [];
  const results: AmedasStationData[] = [];

  for (const [code, obs] of Object.entries(latestMapJson)) {
    if (!obs || !Array.isArray(obs.temp) || obs.temp[0] === null || obs.temp[0] === undefined) {
      continue;
    }
    const meta = tableJson[code];
    if (!meta || !Array.isArray(meta.lat) || !Array.isArray(meta.lon)) continue;

    const lat = Number((Number(meta.lat[0]) + Number(meta.lat[1]) / 60).toFixed(4));
    const lon = Number((Number(meta.lon[0]) + Number(meta.lon[1]) / 60).toFixed(4));
    const temp = Number(obs.temp[0]);
    if (Number.isNaN(lat) || Number.isNaN(lon) || Number.isNaN(temp)) continue;

    const precip1h = Array.isArray(obs.precipitation1h) && obs.precipitation1h[0] != null
      ? Number(obs.precipitation1h[0])
      : 0;
    const windSpeed = Array.isArray(obs.wind) && obs.wind[0] != null
      ? Number(obs.wind[0])
      : 0;
    const windDirIdx = Array.isArray(obs.windDirection) && obs.windDirection[0] != null
      ? Number(obs.windDirection[0])
      : 0;
    const humidity = Array.isArray(obs.humidity) && obs.humidity[0] != null
      ? Number(obs.humidity[0])
      : 60;
    const { regionId, prefecture } = inferRegionFromCoords(lat, lon);

    results.push({
      id: code,
      stationName: String(meta.kjName || code),
      prefecture,
      regionId,
      lat,
      lon,
      temp,
      precip1h,
      windSpeed,
      windDirection: WIND_DIR_NAMES[windDirIdx] || '北',
      humidity,
      observedAt: observedAtLabel,
    });
  }

  return results;
}

export interface ScreenLabelBox {
  id: string;
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Deterministically resolves any 2D bounding-box overlaps among screen-space labels
 * so city forecast labels never overlap each other at any zoom level.
 */
export function resolveLabelBoxCollisions(
  boxes: ScreenLabelBox[],
  gapPx = 6
): ScreenLabelBox[] {
  const resolved = boxes.map((b) => ({ ...b }));
  for (let pass = 0; pass < 14; pass++) {
    let moved = false;
    for (let i = 0; i < resolved.length; i++) {
      for (let j = i + 1; j < resolved.length; j++) {
        const a = resolved[i];
        const b = resolved[j];
        const overlapX =
          Math.min(a.x + a.width + gapPx, b.x + b.width + gapPx) -
          Math.max(a.x, b.x);
        const overlapY =
          Math.min(a.y + a.height + gapPx, b.y + b.height + gapPx) -
          Math.max(a.y, b.y);
        if (overlapX > 0 && overlapY > 0) {
          moved = true;
          const dy = Math.ceil(overlapY / 2) + 1;
          if (a.y <= b.y) {
            a.y -= dy;
            b.y += dy;
          } else {
            a.y += dy;
            b.y -= dy;
          }
        }
      }
    }
    if (!moved) break;
  }
  return resolved;
}

/**
 * Filters a list of geographic points so that no two accepted points are closer
 * than `minDistancePx` in projected screen space (`projectFn(lat, lon)`).
 * Guarantees that AMeDAS circles never overlap each other at any zoom level.
 */
export function filterNonOverlappingPoints<
  T extends { lat: number; lon: number },
>(
  items: T[],
  projectFn: (lat: number, lon: number) => { x: number; y: number },
  minDistancePx: number
): T[] {
  const accepted: T[] = [];
  const acceptedPts: Array<{ x: number; y: number }> = [];
  const minDistSq = minDistancePx * minDistancePx;

  for (const item of items) {
    const pt = projectFn(item.lat, item.lon);
    let collides = false;
    for (let i = 0; i < acceptedPts.length; i++) {
      const dx = pt.x - acceptedPts[i].x;
      const dy = pt.y - acceptedPts[i].y;
      if (dx * dx + dy * dy < minDistSq) {
        collides = true;
        break;
      }
    }
    if (!collides) {
      accepted.push(item);
      acceptedPts.push(pt);
    }
  }

  return accepted;
}


