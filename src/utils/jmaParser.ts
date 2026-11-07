import {
  AmedasMetric,
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
    title: '全国アメダス気象実況（気温・降水・風速・積雪）',
    subtitle: '全国約1,300観測点 リアルタイム気温・降水量・風速・積雪深',
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
    shortLabel: '津波情報',
    title: '津波警報・注意報・予報',
    subtitle: '気象庁 津波警報・注意報・予報 ＆ 沿岸発表状況',
    xmlSource: 'eqvol.xml / JMA Tsunami / P2P地震情報',
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

export interface WarningDivisionMeta {
  code: string;
  name: string;
  prefId: number;
  regionId: RegionId;
  lat: number;
  lon: number;
  zoom: number;
  order: number;
}

export const WARNING_DIVISIONS: Record<string, WarningDivisionMeta> = (() => {
  const map: Record<string, WarningDivisionMeta> = {};
  let order = 0;
  const add = (
    code: string,
    name: string,
    prefId: number,
    regionId: RegionId,
    lat: number,
    lon: number,
    zoom = 7
  ) => {
    map[code] = { code, name, prefId, regionId, lat, lon, zoom, order: order++ };
  };

  // Hokkaido 7 divisions (North-to-South / West-to-East)
  add('011000', '宗谷', 1, 'hokkaido', 45.12, 141.95, 7);
  add('013000', '網走・北見・紋別', 1, 'hokkaido', 43.95, 143.85, 7);
  add('012000', '上川・留萌', 1, 'hokkaido', 44.05, 142.05, 7);
  add('016000', '石狩・空知・後志', 1, 'hokkaido', 43.1, 141.35, 7);
  add('014100', '釧路・根室', 1, 'hokkaido', 43.15, 144.25, 7);
  add('015000', '胆振・日高', 1, 'hokkaido', 42.45, 142.0, 7);
  add('017000', '渡島・檜山', 1, 'hokkaido', 42.0, 140.4, 7);

  // Tohoku through Miyazaki (02..45)
  for (let prefId = 2; prefId <= 45; prefId++) {
    const meta = PREFECTURE_NAMES[prefId];
    if (!meta) continue;
    const code = `${String(prefId).padStart(2, '0')}0000`;
    add(code, meta.name, prefId, meta.regionId, meta.lat, meta.lon, 7);
  }

  // Kagoshima (2 divisions)
  add('460100', '鹿児島県（奄美地方除く）', 46, 'kyushu', 31.56, 130.56, 7);
  add('460040', '奄美地方', 46, 'kyushu', 28.25, 129.35, 7);

  // Okinawa (4 divisions)
  add('471000', '沖縄本島地方', 47, 'okinawa', 26.35, 127.8, 7);
  add('472000', '大東島地方', 47, 'okinawa', 25.85, 131.25, 8);
  add('473000', '宮古島地方', 47, 'okinawa', 24.8, 125.28, 8);
  add('474000', '八重山地方', 47, 'okinawa', 24.34, 124.15, 8);

  return map;
})();

/**
 * Resolves any JMA `class10` / `office` / `class20` area code to one of the 57 JMA warning divisions:
 * 「宗谷」「網走・北見・紋別」「上川・留萌」「石狩・空知・後志」「釧路・根室」「胆振・日高」「渡島・檜山」
 * 「[各都府県]」「鹿児島県（奄美地方除く）」「奄美地方」「沖縄本島地方」「大東島地方」「宮古島地方」「八重山地方」
 */
export function resolveWarningDivision(
  areaCode: string,
  areaJson?: Record<string, any> | null,
  fallbackClass10Code?: string
): WarningDivisionMeta | null {
  const code = String(areaCode || '').trim();
  if (!code) return null;

  if (WARNING_DIVISIONS[code]) {
    return WARNING_DIVISIONS[code];
  }

  // If 7-digit class20 code and areaJson is available, walk up class20 -> class15 -> class10,
  // or fall back to the enclosing officeBlock's class10 code.
  let c10 = code;
  if (code.length === 7) {
    const c15 = areaJson?.class20s?.[code]?.parent;
    const resolvedC10 = c15 ? areaJson?.class15s?.[c15]?.parent : undefined;
    if (resolvedC10) {
      c10 = String(resolvedC10);
    } else if (fallbackClass10Code) {
      c10 = String(fallbackClass10Code);
    }
  }

  if (WARNING_DIVISIONS[c10]) {
    return WARNING_DIVISIONS[c10];
  }

  if (c10.startsWith('011')) return WARNING_DIVISIONS['011000'];
  if (c10.startsWith('012')) return WARNING_DIVISIONS['012000'];
  if (c10.startsWith('013')) return WARNING_DIVISIONS['013000'];
  if (c10.startsWith('014')) return WARNING_DIVISIONS['014100'];
  if (c10.startsWith('015')) return WARNING_DIVISIONS['015000'];
  if (c10.startsWith('016')) return WARNING_DIVISIONS['016000'];
  if (c10.startsWith('017')) return WARNING_DIVISIONS['017000'];

  if (c10 === '460040' || c10.startsWith('46004')) {
    return WARNING_DIVISIONS['460040'];
  }
  if (c10.startsWith('46')) {
    return WARNING_DIVISIONS['460100'];
  }

  if (c10.startsWith('471')) return WARNING_DIVISIONS['471000'];
  if (c10.startsWith('472')) return WARNING_DIVISIONS['472000'];
  if (c10.startsWith('473')) return WARNING_DIVISIONS['473000'];
  if (c10.startsWith('474')) return WARNING_DIVISIONS['474000'];
  if (c10.startsWith('47')) return WARNING_DIVISIONS['471000'];

  const prefPrefix = c10.slice(0, 2);
  const prefCode = `${prefPrefix}0000`;
  return WARNING_DIVISIONS[prefCode] || null;
}

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
 * Parses JMA's live `https://www.jma.go.jp/bosai/warning/data/r8/map.json`
 * (as well as legacy `warning/data/warning/map.json`) into:
 * - `warnings`: grouped by the 57 JMA divisions (`宗谷`, `網走・北見・紋別`, `上川・留萌`, `石狩・空知・後志`, `釧路・根室`, `胆振・日高`, `渡島・檜山`, `[各都府県]`, `鹿児島県（奄美地方除く）`, `奄美地方`, `沖縄本島地方`, `大東島地方`, `宮古島地方`, `八重山地方`)
 * - `municipalityWarnings`: municipality-level (`class20s`) items
 * - `muniSeverityMap`: 7-digit municipality code -> `WarningSeverity` for fine-grained municipality polygon coloring
 * - `prefSeverityMap`: 1..47 prefecture ID -> `WarningSeverity`
 */
export function parseJmaWarningMapData(
  rawArray: Array<Record<string, any>>,
  areaJson?: Record<string, any> | null,
  xyJson?: Record<string, any> | null
): {
  warnings: RegionalWarningItem[];
  municipalityWarnings: RegionalWarningItem[];
  muniSeverityMap: Record<string, WarningSeverity>;
  prefSeverityMap: Record<number, WarningSeverity>;
} {
  const prefSeverityMap: Record<number, WarningSeverity> = {};
  for (let i = 1; i <= 47; i++) {
    prefSeverityMap[i] = 'normal';
  }
  const muniSeverityMap: Record<string, WarningSeverity> = {};

  const warnings: RegionalWarningItem[] = [];
  const municipalityWarningsMap = new Map<string, RegionalWarningItem>();
  const class20sMeta = areaJson?.class20s || {};
  const class20sXy = xyJson?.class20s || {};

  const extractBadgeItems = (
    rawWarnings: any[]
  ): { badgeItems: WarningBadgeItem[]; maxSeverity: WarningSeverity } => {
    const activeCodes = new Set<string>();
    for (const w of rawWarnings) {
      if (typeof w === 'string' && w.trim()) {
        activeCodes.add(w.trim());
      } else if (
        w &&
        w.code &&
        w.status !== '解除' &&
        w.status !== '発表警報・注意報はなし'
      ) {
        activeCodes.add(String(w.code));
      }
    }

    const badgeItems: WarningBadgeItem[] = [];
    let maxSeverity: WarningSeverity = 'normal';

    for (const c of activeCodes) {
      const info = JMA_WARNING_CODE_TABLE[c];
      if (!info) continue;
      if (
        !badgeItems.some(
          (b) => b.name === info.name && b.severity === info.severity
        )
      ) {
        badgeItems.push({ code: c, name: info.name, severity: info.severity });
      }
      if (compareSeverity(info.severity, maxSeverity) > 0) {
        maxSeverity = info.severity;
      }
    }

    badgeItems.sort((a, b) => compareSeverity(b.severity, a.severity));
    return { badgeItems, maxSeverity };
  };

  const upsertDivisionWarning = (
    areaCode: string,
    rawWarnings: any[],
    reportTime: string
  ) => {
    const divMeta = resolveWarningDivision(areaCode, areaJson);
    if (!divMeta) return;

    const { badgeItems, maxSeverity } = extractBadgeItems(rawWarnings);
    if (badgeItems.length === 0) return;

    if (
      compareSeverity(maxSeverity, prefSeverityMap[divMeta.prefId] || 'normal') >
      0
    ) {
      prefSeverityMap[divMeta.prefId] = maxSeverity;
    }

    const existing = warnings.find((w) => w.divisionCode === divMeta.code);
    if (existing) {
      for (const item of badgeItems) {
        if (
          !existing.badgeItems.some(
            (b) => b.name === item.name && b.severity === item.severity
          )
        ) {
          existing.badgeItems.push(item);
        }
      }
      existing.badgeItems.sort((a, b) =>
        compareSeverity(b.severity, a.severity)
      );
      existing.activeWarnings = existing.badgeItems.map((b) => b.name);
      if (compareSeverity(maxSeverity, existing.severity) > 0) {
        existing.severity = maxSeverity;
      }
      existing.headline = `${divMeta.name}に${existing.activeWarnings.join('・')}発表中`;
    } else {
      warnings.push({
        id: `warn-${divMeta.code}`,
        prefId: divMeta.prefId,
        prefecture: divMeta.name,
        regionId: divMeta.regionId,
        areaName: divMeta.name,
        divisionCode: divMeta.code,
        lat: divMeta.lat,
        lon: divMeta.lon,
        zoom: divMeta.zoom,
        severity: maxSeverity,
        activeWarnings: badgeItems.map((b) => b.name),
        badgeItems,
        updatedAt: reportTime,
        office: '気象庁',
        headline: `${divMeta.name}に${badgeItems.map((b) => b.name).join('・')}発表中`,
      });
    }
  };

  const upsertMunicipalityWarning = (
    codeStr: string,
    rawWarnings: any[],
    reportTime: string,
    fallbackClass10Code?: string
  ) => {
    if (codeStr.length < 2) return;
    const prefId = Number(codeStr.slice(0, 2));
    if (!prefId || prefId < 1 || prefId > 47) return;
    const prefMeta = PREFECTURE_NAMES[prefId];
    if (!prefMeta) return;

    const { badgeItems, maxSeverity } = extractBadgeItems(rawWarnings);
    if (badgeItems.length === 0) return;

    const prevMuniSev = muniSeverityMap[codeStr] || 'normal';
    if (compareSeverity(maxSeverity, prevMuniSev) > 0) {
      muniSeverityMap[codeStr] = maxSeverity;
    }
    if (compareSeverity(maxSeverity, prefSeverityMap[prefId] || 'normal') > 0) {
      prefSeverityMap[prefId] = maxSeverity;
    }

    const divMeta = resolveWarningDivision(
      codeStr,
      areaJson,
      fallbackClass10Code
    );
    const muniInfo = class20sMeta[codeStr];
    const muniName = String(muniInfo?.name || '').trim();
    if (!muniName && areaJson) return;
    const resolvedMuniName = muniName || `${prefMeta.name}(${codeStr})`;

    const existing = municipalityWarningsMap.get(codeStr);
    if (existing) {
      for (const item of badgeItems) {
        if (
          !existing.badgeItems.some(
            (b) => b.name === item.name && b.severity === item.severity
          )
        ) {
          existing.badgeItems.push(item);
        }
      }
      existing.badgeItems.sort((a, b) =>
        compareSeverity(b.severity, a.severity)
      );
      existing.activeWarnings = existing.badgeItems.map((b) => b.name);
      if (compareSeverity(maxSeverity, existing.severity) > 0) {
        existing.severity = maxSeverity;
      }
      existing.headline = `${existing.prefecture}に${existing.activeWarnings.join('・')}発表中`;
      return;
    }

    const xy = class20sXy[codeStr];
    let lat = divMeta?.lat ?? prefMeta.lat;
    let lon = divMeta?.lon ?? prefMeta.lon;
    if (Array.isArray(xy) && xy.length >= 2) {
      const parsedLat = Number(xy[0]);
      const parsedLon = Number(xy[1]);
      if (!Number.isNaN(parsedLat) && !Number.isNaN(parsedLon)) {
        lat = parsedLat;
        lon = parsedLon;
      }
    } else {
      const numCode = Number(codeStr) || 0;
      lat = Number((lat + (((numCode % 19) - 9) * 0.04)).toFixed(4));
      lon = Number((lon + ((((numCode >> 4) % 19) - 9) * 0.04)).toFixed(4));
    }

    const fullHeader = `${divMeta?.name || prefMeta.name} ${resolvedMuniName}`;
    municipalityWarningsMap.set(codeStr, {
      id: `muni-warn-${codeStr}`,
      prefId,
      prefecture: fullHeader,
      regionId: divMeta?.regionId || prefMeta.regionId,
      areaName: resolvedMuniName,
      divisionCode: divMeta?.code,
      muniCode: codeStr,
      lat,
      lon,
      severity: maxSeverity,
      activeWarnings: badgeItems.map((b) => b.name),
      badgeItems,
      updatedAt: reportTime,
      office: '気象庁',
      headline: `${fullHeader}に${badgeItems.map((b) => b.name).join('・')}発表中`,
      isMunicipality: true,
    });
  };

  for (const officeBlock of rawArray) {
    const reportTime =
      String(
        officeBlock.reportDatetime ||
          officeBlock.warning?.reportDatetime ||
          ''
      ).slice(11, 16) || '最新';

    const blockFallbackC10 = String(
      officeBlock.warning?.class10Items?.[0]?.areaCode ||
        officeBlock.areaTypes?.[0]?.areas?.[0]?.code ||
        officeBlock.officeCode ||
        ''
    );

    // Format A: JMA Reiwa 8 (`warning/data/r8/map.json`) -> `officeBlock.warning.{class10Items, class20Items}`
    if (officeBlock.warning && typeof officeBlock.warning === 'object') {
      const c10Items = officeBlock.warning.class10Items;
      if (Array.isArray(c10Items)) {
        for (const item of c10Items) {
          const codeStr = String(item?.areaCode || '');
          const kinds = Array.isArray(item?.kinds) ? item.kinds : [];
          upsertDivisionWarning(codeStr, kinds, reportTime);
        }
      }
      const c20Items = officeBlock.warning.class20Items;
      if (Array.isArray(c20Items)) {
        for (const item of c20Items) {
          const codeStr = String(item?.areaCode || '');
          const kinds = Array.isArray(item?.kinds) ? item.kinds : [];
          upsertMunicipalityWarning(
            codeStr,
            kinds,
            reportTime,
            blockFallbackC10
          );
        }
      }
    }

    // Format B: Legacy `warning/data/warning/map.json` -> `officeBlock.areaTypes`
    const areas = officeBlock.areaTypes?.[0]?.areas;
    if (Array.isArray(areas) && areas.length > 0) {
      for (const area of areas) {
        const codeStr = String(area.code || '');
        const rawWarnings = Array.isArray(area.warnings) ? area.warnings : [];
        upsertDivisionWarning(codeStr, rawWarnings, reportTime);
      }
    }

    const muniAreas = officeBlock.areaTypes?.[1]?.areas;
    if (Array.isArray(muniAreas) && muniAreas.length > 0) {
      for (const muni of muniAreas) {
        const codeStr = String(muni.code || '');
        const rawWarnings = Array.isArray(muni.warnings) ? muni.warnings : [];
        upsertMunicipalityWarning(
          codeStr,
          rawWarnings,
          reportTime,
          blockFallbackC10
        );
      }
    }
  }

  // Sort `warnings` in North-to-South JMA division order
  warnings.sort((a, b) => {
    const orderA = a.divisionCode
      ? (WARNING_DIVISIONS[a.divisionCode]?.order ?? 999)
      : 999;
    const orderB = b.divisionCode
      ? (WARNING_DIVISIONS[b.divisionCode]?.order ?? 999)
      : 999;
    return orderA - orderB;
  });

  const municipalityWarnings = Array.from(municipalityWarningsMap.values());
  return {
    warnings,
    municipalityWarnings,
    muniSeverityMap,
    prefSeverityMap,
  };
}

function formatJstDayHour(isoStr: string, suffix: string): string {
  try {
    const d = new Date(isoStr);
    if (!Number.isNaN(d.getTime())) {
      const jst = new Date(d.getTime() + 9 * 3600 * 1000);
      const day = String(jst.getUTCDate()).padStart(2, '0');
      const hour = String(jst.getUTCHours()).padStart(2, '0');
      return suffix ? `${day}日${hour}時 ${suffix}` : `${day}日${hour}時`;
    }
  } catch {
    // ignore
  }
  return suffix;
}

/**
 * Formats a typhoon forecast point's time label into a compact single-line map label such as `'06日21時'`.
 */
export function formatCompactTyphoonTime(timeLabel: string): string {
  const m = /(\d{1,2})日(\d{1,2})時/.exec(String(timeLabel || ''));
  if (m) {
    return `${m[1].padStart(2, '0')}日${m[2].padStart(2, '0')}時`;
  }
  return String(timeLabel || '').split(' ')[0] || timeLabel;
}

/**
 * Returns the compact single-line center label for a typhoon or tropical/extratropical cyclone on the map
 * (e.g., `'台風第31号'`, `'熱帯低気圧'`, or `'温帯低気圧'`).
 */
export function formatCompactTyphoonCenterLabel(
  tc: TyphoonReport,
  pt?: TyphoonTrackPoint
): string {
  const cat = pt?.categoryJp || tc.categoryJp || '';
  if (cat.includes('温帯低気圧')) return '温帯低気圧';
  if (cat.includes('熱帯低気圧')) return '熱帯低気圧';
  if (tc.displayNumber && tc.displayNumber.startsWith('台風第')) {
    return tc.displayNumber;
  }
  return cat || tc.displayNumber || '台風';
}

/**
 * Returns true if the cyclone has already transitioned into an extratropical cyclone (`温帯低気圧`).
 * When true, its trajectory on the map is drawn as a single solid gray line without intermediate circle dots.
 */
export function isExtratropicalCyclone(tc: TyphoonReport): boolean {
  const currentCat = tc.points[0]?.categoryJp || tc.categoryJp || '';
  return (
    currentCat.includes('温帯低気圧') ||
    tc.categoryJp.includes('温帯低気圧') ||
    tc.displayNumber.includes('温帯低気圧')
  );
}

/**
 * Pure parser for JMA's live `https://www.jma.go.jp/bosai/typhoon/data/{tcId}/specifications.json`
 * and optional `forecast.json` (which contains `track.preTyphoon` and `track.typhoon` past trajectory coordinates).
 * Extracts current center position, past track, gale/storm radii, and forecast track points with probability circle radii.
 */
export function parseJmaTyphoonSpecifications(
  rawSpecs: Array<Record<string, any>>,
  tcId = 'TC',
  rawForecastJson?: Array<Record<string, any>>
): TyphoonReport | null {
  if (!Array.isArray(rawSpecs) || rawSpecs.length < 2) {
    return null;
  }

  const header = rawSpecs[0];
  const rawNumber = String(header.typhoonNumber || '');
  const shortNum = rawNumber.length >= 2 ? Number(rawNumber.slice(-2)) : 0;
  const categoryJp = header.category?.jp || '台風';
  const displayNumber = categoryJp.includes('温帯低気圧')
    ? shortNum > 0
      ? `温帯低気圧 (旧台風${shortNum}号)`
      : '温帯低気圧'
    : shortNum > 0
      ? `台風第${shortNum}号`
      : '熱帯低気圧';
  const nameJp = header.name?.jp || categoryJp;
  const nameEn = header.name?.en || '';
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
      isForecast ? '' : '実況'
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

  // Extract historical trajectory (pastTrack) from forecast.json or specifications.json if present
  const pastTrack: Array<[number, number]> = [];
  const appendCoord = (c: any) => {
    if (!Array.isArray(c) || c.length < 2) return;
    const lat = Number(c[0]);
    const lon = Number(c[1]);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return;
    const prev = pastTrack[pastTrack.length - 1];
    if (!prev || Math.abs(prev[0] - lat) > 0.001 || Math.abs(prev[1] - lon) > 0.001) {
      pastTrack.push([lat, lon]);
    }
  };

  const trackSourceList = Array.isArray(rawForecastJson) ? rawForecastJson : rawSpecs;
  for (const item of trackSourceList) {
    const tr = item?.track;
    if (tr && typeof tr === 'object') {
      if (Array.isArray(tr.preTyphoon)) {
        tr.preTyphoon.forEach(appendCoord);
      }
      if (Array.isArray(tr.typhoon)) {
        tr.typhoon.forEach(appendCoord);
      }
    }
  }
  if (pastTrack.length > 0) {
    appendCoord([points[0].lat, points[0].lon]);
  }

  return {
    id: tcId,
    typhoonNumber: rawNumber,
    displayNumber,
    nameJp,
    nameEn,
    categoryJp,
    issueTimeJst,
    isLiveJma: true,
    lastSeenMs: Date.now(),
    pastTrack: pastTrack.length >= 2 ? pastTrack : undefined,
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

/**
 * North-to-South regional patrol sequence for `'auto'` mode (`日本全国＋地方 自動巡回`):
 * Starts at `'national'` (全国表示), steps North-to-South (`北海道 -> 東北 -> 関東 -> 中部 -> 近畿 -> 中国・四国 -> 九州 -> 沖縄`),
 * returns to `'national'` (全国表示) at the end, and THEN advances to the next data/scene.
 */
export const AUTO_PATROL_SEQUENCE: RegionId[] = [
  'national',
  'hokkaido',
  'tohoku',
  'kanto',
  'chubu',
  'kinki',
  'chugoku_shikoku',
  'kyushu',
  'okinawa',
  'national',
];

export function getNextPatrolStep(currentStepIndex: number): {
  nextStepIndex: number;
  regionId: RegionId;
  completedCycle: boolean;
} {
  const safeIdx =
    currentStepIndex >= 0 && currentStepIndex < AUTO_PATROL_SEQUENCE.length
      ? currentStepIndex
      : 0;
  if (safeIdx >= AUTO_PATROL_SEQUENCE.length - 1) {
    return {
      nextStepIndex: 0,
      regionId: AUTO_PATROL_SEQUENCE[0],
      completedCycle: true,
    };
  }
  const nextIdx = safeIdx + 1;
  return {
    nextStepIndex: nextIdx,
    regionId: AUTO_PATROL_SEQUENCE[nextIdx],
    completedCycle: false,
  };
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

export function inferRegionFromCoords(lat: number, lon: number): {
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

export function getAmedasPrecipColor(mm: number): string {
  if (mm >= 50) return '#9333EA'; // purple (very heavy rain)
  if (mm >= 30) return '#EF4444'; // red (heavy rain)
  if (mm >= 20) return '#F97316'; // orange
  if (mm >= 10) return '#FACC15'; // yellow
  if (mm >= 5) return '#2563EB';  // vivid blue
  if (mm >= 1) return '#38BDF8';  // sky blue
  return '#BAE6FD';               // light cyan (0.5mm)
}

export function getAmedasWindColor(ms: number): string {
  if (ms >= 25) return '#9333EA'; // purple (storm force)
  if (ms >= 20) return '#EF4444'; // red
  if (ms >= 15) return '#F97316'; // orange (gale)
  if (ms >= 10) return '#FACC15'; // yellow (strong wind)
  if (ms >= 5) return '#22C55E';  // emerald green
  return '#94A3B8';               // crisp light slate (<5m/s)
}

export function getAmedasSnowColor(cm: number): string {
  if (cm >= 150) return '#9333EA'; // deep purple
  if (cm >= 100) return '#2563EB'; // deep blue
  if (cm >= 50) return '#0284C7';  // cyan-blue
  if (cm >= 20) return '#38BDF8';  // sky blue
  if (cm >= 5) return '#BAE6FD';   // ice blue
  return '#F8FAFC';                // crisp snow white
}

export function getAmedasMetricColor(
  st: AmedasStationData,
  metric: AmedasMetric
): string {
  switch (metric) {
    case 'precip':
      return getAmedasPrecipColor(st.precip1h);
    case 'wind':
      return getAmedasWindColor(st.windSpeed);
    case 'snow':
      return getAmedasSnowColor(st.snowCm ?? 0);
    case 'temp':
    default:
      return getAmedasTempGradientColor(st.temp);
  }
}

/**
 * Returns the visual radius (px) for AMeDAS station markers based on map zoom level.
 * Uses continuous linear interpolation across fractional zoom levels so markers scale
 * smoothly during camera `flyTo` transitions without snapping at `zoomend`.
 */
export function getAmedasPointRadiusForZoom(zoom: number): number {
  const stops: Array<[number, number]> = [
    [3, 2.2],
    [4, 2.7],
    [5, 3.3],
    [6, 4.5],
    [7, 5.9],
    [8, 7.5],
    [9, 9.2],
    [10, 11.0],
    [12, 13.5],
  ];
  if (zoom <= stops[0][0]) return stops[0][1];
  const last = stops[stops.length - 1];
  if (zoom >= last[0]) return last[1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [z0, r0] = stops[i];
    const [z1, r1] = stops[i + 1];
    if (zoom >= z0 && zoom <= z1) {
      const t = (zoom - z0) / (z1 - z0);
      return Number((r0 + (r1 - r0) * t).toFixed(2));
    }
  }
  return 3.3;
}

/**
 * Returns the pixel size (`width` & `height`) for AMeDAS wind direction arrows based on map zoom level.
 * Continuously interpolated across fractional zoom levels and sized so nationwide overview (`zoom = 5`)
 * displays many non-overlapping directional arrows without clutter or lag.
 */
export function getAmedasWindArrowSizeForZoom(zoom: number): number {
  const stops: Array<[number, number]> = [
    [3, 8.0],
    [4, 9.5],
    [5, 11.5],
    [6, 14.5],
    [7, 18.0],
    [8, 21.0],
    [9, 24.0],
    [11, 28.0],
  ];
  if (zoom <= stops[0][0]) return stops[0][1];
  const last = stops[stops.length - 1];
  if (zoom >= last[0]) return last[1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [z0, s0] = stops[i];
    const [z1, s1] = stops[i + 1];
    if (zoom >= z0 && zoom <= z1) {
      const t = (zoom - z0) / (z1 - z0);
      return Number((s0 + (s1 - s0) * t).toFixed(2));
    }
  }
  return 11.5;
}

/**
 * Selects non-overlapping AMeDAS stations in screen space for any metric (`temp`, `precip`, `wind`, `snow`)
 * and fractional zoom level.
 * Guarantees that in nationwide overview (`zoom = 5`), neither circles nor wind arrows overlap each other,
 * while preserving a dense nationwide distribution and smoothly revealing more stations as zoom increases.
 */
export function selectNonOverlappingAmedasStations(
  stations: AmedasStationData[],
  metric: AmedasMetric,
  zoom: number,
  projectFn: (lat: number, lon: number) => { x: number; y: number },
  preSorted = false
): AmedasStationData[] {
  const ordered = preSorted
    ? stations
    : stations
        .filter((st) => {
          if (metric === 'precip') return st.precip1h > 0;
          if (metric === 'snow') return (st.snowCm ?? 0) > 0;
          if (metric === 'wind') return st.windSpeed > 0;
          return st.hasTemp !== false && !Number.isNaN(st.temp);
        })
        .sort((a, b) => {
          if (metric === 'wind') {
            if (b.windSpeed !== a.windSpeed) return b.windSpeed - a.windSpeed;
          } else if (metric === 'precip') {
            if (b.precip1h !== a.precip1h) return b.precip1h - a.precip1h;
          } else if (metric === 'snow') {
            const snowA = a.snowCm ?? 0;
            const snowB = b.snowCm ?? 0;
            if (snowB !== snowA) return snowB - snowA;
          }
          return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });

  if (zoom >= 8.2) {
    return ordered;
  }

  if (metric === 'wind') {
    const arrowSize = getAmedasWindArrowSizeForZoom(zoom);
    // At nationwide zoom (zoom <= 5.5), keep arrows cleanly separated (minDist = arrowSize * 0.75);
    // smoothly relax spacing between zoom 5.5 and 8.2 so regional stations progressively appear.
    const t = Math.max(0, Math.min(1, (zoom - 5.5) / (8.2 - 5.5)));
    const spacingFactor = 0.75 - t * 0.23;
    const minDistPx = arrowSize * spacingFactor;
    return filterNonOverlappingPoints(ordered, projectFn, minDistPx);
  }

  const radius = getAmedasPointRadiusForZoom(zoom);
  // Circle diameter is `radius * 2`. Keep center-to-center distance >= diameter * 0.96 at overview zoom
  // so circles never pile on top of each other while showing high station density across Japan.
  const t = Math.max(0, Math.min(1, (zoom - 5.5) / (8.2 - 5.5)));
  const minDistPx = radius * (1.92 - t * 0.55);
  return filterNonOverlappingPoints(ordered, projectFn, minDistPx);
}

/**
 * Parses an earthquake occurrence or issue time string (`"2026/11/05 13:39 頃発生"`,
 * `"2026/11/06 19:56:15 頃発生"`, or ISO `"2026-11-06T03:05:00+09:00"`) into epoch milliseconds.
 */
export function parseEarthquakeTimeMs(
  timeStr: string | undefined | null
): number {
  if (!timeStr) return 0;
  const cleaned = String(timeStr)
    .replace(/\s*(頃発生|発表).*$/, '')
    .trim();
  if (!cleaned) return 0;
  if (cleaned.includes('T')) {
    const t = Date.parse(cleaned);
    if (!Number.isNaN(t)) return t;
  }
  const m =
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?/.exec(
      cleaned
    );
  if (m) {
    const [, y, mo, d, h, mi, se, ms] = m;
    return Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h) - 9,
      Number(mi),
      Number(se || 0),
      Number((ms || '0').padEnd(3, '0').slice(0, 3))
    );
  }
  return 0;
}

/**
 * Sorts earthquake history reports strictly in reverse chronological order
 * (most recently occurred first / 最近発生した順), NOT by largest seismic intensity (`maxScaleCode`).
 */
export function sortEarthquakesByNewest(
  earthquakes: EarthquakeReport[]
): EarthquakeReport[] {
  return [...earthquakes].sort((a, b) => {
    const tA =
      parseEarthquakeTimeMs(a.occurrenceTime) ||
      parseEarthquakeTimeMs(a.issueTime);
    const tB =
      parseEarthquakeTimeMs(b.occurrenceTime) ||
      parseEarthquakeTimeMs(b.issueTime);
    if (tB !== tA) {
      return tB - tA;
    }
    const cmp = b.occurrenceTime.localeCompare(a.occurrenceTime);
    if (cmp !== 0) return cmp;
    return b.maxScaleCode - a.maxScaleCode;
  });
}

export type WarningMapZoomTier = 'prefecture' | 'division' | 'municipality';

/**
 * Determines the JMA warning map display tier from the current zoom level:
 * - `'prefecture'` (`zoom < 5.5`): 全国表示 — 都道府県単位の境界表示（市区町村境界・ラベルなし）
 * - `'division'` (`5.5 <= zoom < 6.8`): 地方拡大表示 — 地方・府県予報区（57区分）の境界＋地方名ラベル表示
 * - `'municipality'` (`zoom >= 6.8`): 市区町村拡大表示 — 市区町村の境界線＋市区町村名ラベル表示
 */
export function getWarningMapZoomTier(zoom: number): WarningMapZoomTier {
  if (zoom < 5.5) return 'prefecture';
  if (zoom < 6.8) return 'division';
  return 'municipality';
}

/**
 * Formats a JMA 57-division (`WARNING_DIVISIONS`) entry into the on-map regional label
 * shown at intermediate zoom (`'division'` tier, `5.5 <= zoom < 6.8`), matching JMA's official map:
 * e.g., `'宗谷地方'`, `'上川・留萌地方'`, `'石狩・空知・後志地方'`, `'釧路・根室・十勝地方'`, `'青森県'`, `'秋田県'`, `'岩手県'`.
 */
export function formatWarningDivisionMapLabel(
  div: Pick<WarningDivisionMeta, 'code' | 'name' | 'prefId'>
): string {
  if (div.code === '014100') {
    return '釧路・根室・十勝地方';
  }
  if (div.prefId === 1 && !div.name.endsWith('地方')) {
    return `${div.name}地方`;
  }
  if (div.code === '460100') {
    return '鹿児島県';
  }
  return div.name;
}

/**
 * Computes the effective warning severity to display on the map for a municipality (`class20s`).
 * When zooming into a specific division that has 警報/特別警報 (`activeWarningDivisionCode`),
 * suppresses warning/advisory colors (`'normal'`) for all municipalities outside that division.
 */
export function getEffectiveMunicipalitySeverity(
  muniCode: string,
  muniDivisionCode: string | undefined | null,
  muniSeverityMap: Record<string, WarningSeverity>,
  activeWarningDivisionCode?: string | null
): WarningSeverity {
  if (activeWarningDivisionCode) {
    if (!muniDivisionCode || muniDivisionCode !== activeWarningDivisionCode) {
      return 'normal';
    }
  }
  return muniSeverityMap[muniCode] || 'normal';
}

/**
 * Topologically dissolves (merges) adjacent GeoJSON Polygon/MultiPolygon features
 * that share the same group key by cancelling shared interior directed edges (`A -> B` and `B -> A`)
 * and stitching remaining outer boundary edges into clean closed rings.
 * Eliminates all internal sub-division borders and black noise (`黒いノイズ`) inside prefectures and divisions.
 */
export function dissolveGeoJsonByGroup(
  features: Array<Record<string, any>>,
  getGroupKey: (feature: Record<string, any>) => string | null | undefined
): {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: { groupKey: string };
    geometry: {
      type: 'MultiPolygon';
      coordinates: number[][][][];
    };
  }>;
} {
  const groups = new Map<string, Array<Record<string, any>>>();
  for (const f of features) {
    const key = getGroupKey(f);
    if (!key) continue;
    let list = groups.get(key);
    if (!list) {
      list = [];
      groups.set(key, list);
    }
    list.push(f);
  }

  const keyPt = (lon: number, lat: number) =>
    `${Math.round(lon * 1e6)},${Math.round(lat * 1e6)}`;

  const outFeatures: Array<{
    type: 'Feature';
    properties: { groupKey: string };
    geometry: {
      type: 'MultiPolygon';
      coordinates: number[][][][];
    };
  }> = [];

  for (const [groupKey, groupFeats] of groups.entries()) {
    const edgeMap = new Map<
      string,
      { fromKey: string; toKey: string; fromPt: number[]; toPt: number[] }
    >();

    for (const f of groupFeats) {
      const geom = f.geometry;
      if (!geom) continue;
      const polys: number[][][][] =
        geom.type === 'Polygon'
          ? [geom.coordinates]
          : geom.type === 'MultiPolygon'
            ? geom.coordinates
            : [];

      for (const poly of polys) {
        if (!Array.isArray(poly) || poly.length === 0) continue;
        // Use only exterior ring `poly[0]` to avoid interior lake hole artifacts
        const ring = poly[0];
        if (!Array.isArray(ring) || ring.length < 4) continue;
        let prevLon = Number(ring[0][0]);
        let prevLat = Number(ring[0][1]);
        let prevKey = keyPt(prevLon, prevLat);

        for (let i = 1; i < ring.length; i++) {
          const p1 = ring[i];
          if (!Array.isArray(p1)) continue;
          const nextLon = Number(p1[0]);
          const nextLat = Number(p1[1]);
          const nextKey = keyPt(nextLon, nextLat);
          if (prevKey !== nextKey) {
            const revKey = `${nextKey}->${prevKey}`;
            const fwdKey = `${prevKey}->${nextKey}`;
            if (edgeMap.has(revKey)) {
              edgeMap.delete(revKey);
            } else {
              edgeMap.set(fwdKey, {
                fromKey: prevKey,
                toKey: nextKey,
                fromPt: [prevLon, prevLat],
                toPt: [nextLon, nextLat],
              });
            }
          }
          prevLon = nextLon;
          prevLat = nextLat;
          prevKey = nextKey;
        }
      }
    }

    const outAdj = new Map<
      string,
      Array<{ fromKey: string; toKey: string; fromPt: number[]; toPt: number[] }>
    >();
    for (const e of edgeMap.values()) {
      let list = outAdj.get(e.fromKey);
      if (!list) {
        list = [];
        outAdj.set(e.fromKey, list);
      }
      list.push(e);
    }

    const multiPolyCoords: number[][][][] = [];
    while (outAdj.size > 0) {
      const firstEntry = outAdj.entries().next().value;
      if (!firstEntry) break;
      const [startKey, startList] = firstEntry;
      const firstEdge = startList.pop()!;
      if (startList.length === 0) outAdj.delete(startKey);

      const ring: number[][] = [firstEdge.fromPt, firstEdge.toPt];
      let curKey = firstEdge.toKey;
      let guard = 0;
      while (curKey !== startKey && guard < 100000) {
        guard++;
        const nextList = outAdj.get(curKey);
        if (!nextList || nextList.length === 0) break;
        const nextEdge = nextList.pop()!;
        if (nextList.length === 0) outAdj.delete(curKey);
        ring.push(nextEdge.toPt);
        curKey = nextEdge.toKey;
      }
      if (curKey === startKey && ring.length >= 4) {
        multiPolyCoords.push([ring]);
      }
    }

    if (multiPolyCoords.length > 0) {
      outFeatures.push({
        type: 'Feature',
        properties: { groupKey },
        geometry: {
          type: 'MultiPolygon',
          coordinates: multiPolyCoords,
        },
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features: outFeatures,
  };
}


/**
 * Computes Top-5 station rankings for the AMeDAS right-side panel:
 * - `tempHigh5`: Top 5 highest temperature stations
 * - `tempLow5`: Top 5 lowest temperature stations
 * - `precipTop5`: Top 5 highest precipitation stations (`precip1h > 0`)
 * - `windTop5`: Top 5 strongest wind speed stations (`windSpeed > 0`)
 * - `snowTop5`: Top 5 deepest snow stations (`snowCm > 0`)
 */
export function computeAmedasTop5Rankings(stations: AmedasStationData[]): {
  tempHigh5: AmedasStationData[];
  tempLow5: AmedasStationData[];
  precipTop5: AmedasStationData[];
  windTop5: AmedasStationData[];
  snowTop5: AmedasStationData[];
} {
  const validTemp = stations.filter(
    (st) => st.hasTemp !== false && !Number.isNaN(st.temp)
  );
  const tempHigh5 = [...validTemp]
    .sort((a, b) => b.temp - a.temp)
    .slice(0, 5);
  const tempLow5 = [...validTemp]
    .sort((a, b) => a.temp - b.temp)
    .slice(0, 5);
  const precipTop5 = stations
    .filter((st) => st.precip1h > 0)
    .sort((a, b) => b.precip1h - a.precip1h)
    .slice(0, 5);
  const windTop5 = stations
    .filter((st) => st.windSpeed > 0)
    .sort((a, b) => b.windSpeed - a.windSpeed)
    .slice(0, 5);
  const snowTop5 = stations
    .filter((st) => (st.snowCm ?? 0) > 0)
    .sort((a, b) => (b.snowCm ?? 0) - (a.snowCm ?? 0))
    .slice(0, 5);

  return {
    tempHigh5,
    tempLow5,
    precipTop5,
    windTop5,
    snowTop5,
  };
}

/**
 * Converts a 16-compass Japanese wind direction string (where the wind blows FROM, e.g. `'北'`, `'西北西'`)
 * into the clockwise rotation angle in degrees (`0° = Up/North`) for an arrow pointing in the direction
 * the wind is blowing TOWARD (風下方向).
 */
export function getWindDirectionRotationDeg(windDirection: string): number {
  const idx = WIND_DIR_NAMES.indexOf(String(windDirection || '').trim());
  if (idx <= 0) {
    return 0;
  }
  // idx 1 = 北北東 (22.5°), ..., idx 16 = 北 (360°/0°)
  const fromDeg = (idx * 22.5) % 360;
  return (fromDeg + 180) % 360;
}

/**
 * Returns the next AMeDAS metric in the automatic loop sequence (`'temp' -> 'precip' -> 'wind' -> ('snow') -> null`).
 * Returns `null` when all active AMeDAS metrics have been displayed so the monitor can advance to the next scene.
 */
export function getNextAmedasMetric(
  current: AmedasMetric,
  stations: AmedasStationData[]
): AmedasMetric | null {
  const hasSnow = stations.some((st) => (st.snowCm ?? 0) > 0);
  const sequence: AmedasMetric[] = hasSnow
    ? ['temp', 'precip', 'wind', 'snow']
    : ['temp', 'precip', 'wind'];
  const idx = sequence.indexOf(current);
  if (idx === -1 || idx >= sequence.length - 1) {
    return null;
  }
  return sequence[idx + 1];
}

/**
 * Parses JMA's nationwide `amedastable.json` and `map/{YYYYMMDDHHMMSS}.json`
 * into ~1,286 AMeDAS station points across Japan (including temperature, precipitation, wind, and snow stations).
 */
export function parseJmaAmedasNationwide(
  tableJson: Record<string, any>,
  latestMapJson: Record<string, any>,
  observedAtLabel = '最新観測',
  hourlySnowMapJson?: Record<string, any> | null
): AmedasStationData[] {
  if (!tableJson || !latestMapJson) return [];
  const results: AmedasStationData[] = [];

  for (const [code, obs] of Object.entries(latestMapJson)) {
    if (!obs || typeof obs !== 'object') continue;
    const meta = tableJson[code];
    if (!meta || !Array.isArray(meta.lat) || !Array.isArray(meta.lon)) continue;

    const lat = Number((Number(meta.lat[0]) + Number(meta.lat[1]) / 60).toFixed(4));
    const lon = Number((Number(meta.lon[0]) + Number(meta.lon[1]) / 60).toFixed(4));
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

    const rawTemp =
      Array.isArray(obs.temp) && obs.temp[0] !== null && obs.temp[0] !== undefined
        ? Number(obs.temp[0])
        : Number.NaN;
    const hasTemp = !Number.isNaN(rawTemp);
    const temp = hasTemp ? rawTemp : 0;

    const precip1h =
      Array.isArray(obs.precipitation1h) && obs.precipitation1h[0] != null
        ? Number(obs.precipitation1h[0])
        : 0;
    const windSpeed =
      Array.isArray(obs.wind) && obs.wind[0] != null ? Number(obs.wind[0]) : 0;
    const windDirIdx =
      Array.isArray(obs.windDirection) && obs.windDirection[0] != null
        ? Number(obs.windDirection[0])
        : 0;
    const humidity =
      Array.isArray(obs.humidity) && obs.humidity[0] != null
        ? Number(obs.humidity[0])
        : 60;

    const rawSnow =
      Array.isArray(obs.snow) && obs.snow[0] != null
        ? Number(obs.snow[0])
        : Array.isArray(hourlySnowMapJson?.[code]?.snow) &&
            hourlySnowMapJson?.[code]?.snow[0] != null
          ? Number(hourlySnowMapJson[code].snow[0])
          : 0;
    const snowCm = !Number.isNaN(rawSnow) && rawSnow > 0 ? rawSnow : 0;

    const hasAnyObs =
      hasTemp ||
      (Array.isArray(obs.precipitation1h) && obs.precipitation1h[0] != null) ||
      (Array.isArray(obs.wind) && obs.wind[0] != null) ||
      snowCm > 0;
    if (!hasAnyObs) continue;

    const { regionId, prefecture } = inferRegionFromCoords(lat, lon);

    results.push({
      id: code,
      stationName: String(meta.kjName || code),
      prefecture,
      regionId,
      lat,
      lon,
      temp,
      hasTemp,
      precip1h,
      windSpeed,
      windDirection: WIND_DIR_NAMES[windDirIdx] || '北',
      humidity,
      snowCm,
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
 * Filters a list of geographic points in $O(N)$ using a 2D spatial hash grid
 * so that no two accepted points are closer than `minDistancePx` in projected screen space (`projectFn(lat, lon)`).
 * Guarantees that AMeDAS circles/arrows never overlap each other at any zoom level.
 */
export function filterNonOverlappingPoints<
  T extends { lat: number; lon: number },
>(
  items: T[],
  projectFn: (lat: number, lon: number) => { x: number; y: number },
  minDistancePx: number
): T[] {
  if (minDistancePx <= 0 || items.length <= 1) {
    return items.slice();
  }
  const accepted: T[] = [];
  const cellSize = Math.max(1, minDistancePx);
  const minDistSq = minDistancePx * minDistancePx;
  const grid = new Map<number, Array<{ x: number; y: number }>>();

  const getCellKey = (cx: number, cy: number) =>
    ((cx & 0xffff) << 16) | (cy & 0xffff);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pt = projectFn(item.lat, item.lon);
    const cx = Math.floor(pt.x / cellSize);
    const cy = Math.floor(pt.y / cellSize);

    let collides = false;
    for (let dx = -1; dx <= 1 && !collides; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(getCellKey(cx + dx, cy + dy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const dpx = pt.x - bucket[i].x;
          const dpy = pt.y - bucket[i].y;
          if (dpx * dpx + dpy * dpy < minDistSq) {
            collides = true;
            break;
          }
        }
      }
    }

    if (!collides) {
      accepted.push(item);
      const key = getCellKey(cx, cy);
      let bucket = grid.get(key);
      if (!bucket) {
        bucket = [];
        grid.set(key, bucket);
      }
      bucket.push(pt);
    }
  }

  return accepted;
}

/**
 * Returns only the warning divisions (`宗谷`, `上川・留萌`, `石狩・空知・後志`, `[各都府県]`, etc.)
 * that currently have `警報` (`'warning'`) or `特別警報` (`'special'`) active, sorted North-to-South.
 * Used during `warnings` automatic patrol so the camera ONLY zooms in to divisions with Warning or higher!
 */
export function getActiveSevereWarningDivisions(
  warnings: RegionalWarningItem[]
): RegionalWarningItem[] {
  return warnings
    .filter((w) => w.severity === 'warning' || w.severity === 'special')
    .sort((a, b) => {
      const orderA = a.divisionCode
        ? (WARNING_DIVISIONS[a.divisionCode]?.order ?? 999)
        : 999;
      const orderB = b.divisionCode
        ? (WARNING_DIVISIONS[b.divisionCode]?.order ?? 999)
        : 999;
      return orderA - orderB;
    });
}

/**
 * Formats the on-map municipality label for zoomed-in `warnings` view:
 * Strictly returns ONLY the municipality name (`市区町村名のみ`, e.g., `'稚内市'`, `'札幌市'`)
 * without appending any warning type text (`雷` etc.).
 */
export function formatMunicipalityMapLabel(
  muni: Pick<RegionalWarningItem, 'areaName'>
): string {
  return String(muni.areaName || '').trim();
}

/**
 * North-to-South waypoints along the Japanese archipelago from Hokkaido to Okinawa
 * for AMeDAS smooth continuous zoomed-in sweep (`北海道から順に滑らかに途中で止まらず沖縄まで拡大表示`).
 */
export const ARCHIPELAGO_SWEEP_WAYPOINTS: Array<[number, number]> = [
  [43.8, 142.3], // 北海道（道北・道央）
  [42.1, 140.6], // 北海道（道南・渡島）
  [40.2, 140.6], // 北東北（青森・岩手・秋田）
  [38.1, 140.4], // 南東北（宮城・山形・福島）
  [36.0, 139.5], // 関東（東京・埼玉・茨城）
  [35.3, 137.3], // 中部・東海（静岡・愛知・岐阜）
  [34.8, 135.5], // 近畿（京都・大阪・兵庫）
  [34.3, 133.3], // 中国・四国（広島・岡山・香川）
  [33.4, 130.9], // 北部九州（福岡・大分・佐賀）
  [31.7, 130.7], // 南部九州（熊本・宮崎・鹿児島）
  [28.3, 129.4], // 奄美地方
  [26.2, 127.7], // 沖縄本島地方
];

/**
 * Smoothly interpolates a `[lat, lon]` camera coordinate along `ARCHIPELAGO_SWEEP_WAYPOINTS`
 * for `progress` in `[0, 1]` (0 = Hokkaido, 1 = Okinawa) without any intermediate stops.
 */
export function interpolateArchipelagoSweepPosition(
  progress: number
): [number, number] {
  const clamped = Math.max(0, Math.min(1, progress));
  const pts = ARCHIPELAGO_SWEEP_WAYPOINTS;
  const segments = pts.length - 1;
  if (segments <= 0) return pts[0] || [36.8, 137.5];

  const exactIdx = clamped * segments;
  const idx = Math.min(segments - 1, Math.floor(exactIdx));
  const localT = exactIdx - idx;
  const [lat0, lon0] = pts[idx];
  const [lat1, lon1] = pts[idx + 1];
  return [lat0 + (lat1 - lat0) * localT, lon0 + (lon1 - lon0) * localT];
}

export interface AmedasPatrolStop {
  id: string;
  label: string;
  center: [number, number];
  zoom: number;
}

/**
 * 5-region patrol sequence for AMeDAS camera movement:
 * 全国表示 -> 北海道 -> 東北 -> 関東中部近畿 -> 中国四国九州 -> 沖縄 -> 全国表示
 * Smoothly flies (`flyTo`) to each regional stop (zoomed in so the region fills 80%+ of the map screen)
 * and pauses for ~5 seconds at each stop.
 */
export const AMEDAS_PATROL_STOPS: AmedasPatrolStop[] = [
  { id: 'national_start', label: '全国表示', center: [36.8, 137.5], zoom: 5 },
  { id: 'hokkaido', label: '北海道', center: [43.45, 143.1], zoom: 7.5 },
  { id: 'tohoku', label: '東北', center: [39.15, 141.0], zoom: 7.25 },
  {
    id: 'kanto_chubu_kinki',
    label: '関東・中部・近畿',
    center: [35.65, 138.1],
    zoom: 7.25,
  },
  {
    id: 'chugoku_shikoku_kyushu',
    label: '中国・四国・九州',
    center: [33.3, 132.5],
    zoom: 7.25,
  },
  { id: 'okinawa', label: '沖縄', center: [26.2, 127.6], zoom: 7.5 },
  { id: 'national_end', label: '全国表示', center: [36.8, 137.5], zoom: 5 },
];





