import {
  AmedasMetric,
  AmedasStationData,
  CityForecastItem,
  EarthquakeReport,
  EarthquakeStationIntensity,
  Forecast3HourlySlot,
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

/**
 * JMA warning/advisory kind codes (令和8年 新しい防災気象情報体系 + legacy codes).
 * Source: 気象庁 bosai/warning フロントエンドのコード定義 (2026-11 時点).
 * - レベル5 特別警報 → 'special'
 * - レベル4 危険警報 → 'danger'   (大雨/土砂災害/高潮 のみ)
 * - レベル3 警報     → 'warning'
 * - レベル2 注意報   → 'advisory'
 */
export const JMA_WARNING_CODE_TABLE: Record<
  string,
  { name: string; severity: WarningSeverity }
> = {
  // 大雨 (VPWW55)
  '33': { name: '大雨', severity: 'special' },
  '43': { name: '大雨', severity: 'danger' },
  '03': { name: '大雨', severity: 'warning' },
  '10': { name: '大雨', severity: 'advisory' },
  // 土砂災害 (VPWW56)
  '39': { name: '土砂災害', severity: 'special' },
  '49': { name: '土砂災害', severity: 'danger' },
  '09': { name: '土砂災害', severity: 'warning' },
  '29': { name: '土砂災害', severity: 'advisory' },
  // 高潮 (VPWW57)
  '38': { name: '高潮', severity: 'special' },
  '48': { name: '高潮', severity: 'danger' },
  '08': { name: '高潮', severity: 'warning' },
  '19': { name: '高潮', severity: 'advisory' },
  // 風・風雪 (VPWW58)
  '35': { name: '暴風', severity: 'special' },
  '05': { name: '暴風', severity: 'warning' },
  '15': { name: '強風', severity: 'advisory' },
  '32': { name: '暴風雪', severity: 'special' },
  '02': { name: '暴風雪', severity: 'warning' },
  '13': { name: '風雪', severity: 'advisory' },
  // 波浪 (VPWW59)
  '37': { name: '波浪', severity: 'special' },
  '07': { name: '波浪', severity: 'warning' },
  '16': { name: '波浪', severity: 'advisory' },
  // 大雪 (VPWW60)
  '36': { name: '大雪', severity: 'special' },
  '06': { name: '大雪', severity: 'warning' },
  '12': { name: '大雪', severity: 'advisory' },
  // その他の注意報 (VPWW61)
  '14': { name: '雷', severity: 'advisory' },
  '17': { name: '融雪', severity: 'advisory' },
  '20': { name: '濃霧', severity: 'advisory' },
  '21': { name: '乾燥', severity: 'advisory' },
  '22': { name: 'なだれ', severity: 'advisory' },
  '23': { name: '低温', severity: 'advisory' },
  '24': { name: '霜', severity: 'advisory' },
  '25': { name: '着氷', severity: 'advisory' },
  '26': { name: '着雪', severity: 'advisory' },
  // Legacy only (旧 warning/data/warning/map.json): 洪水
  '04': { name: '洪水', severity: 'warning' },
  '18': { name: '洪水', severity: 'advisory' },
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

export const WARNING_SEVERITY_RANK: Record<WarningSeverity, number> = {
  special: 4,
  danger: 3,
  warning: 2,
  advisory: 1,
  normal: 0,
};

/** True for レベル3 警報 and above (警報・危険警報・特別警報). */
export function isWarningOrAbove(sev: WarningSeverity | undefined | null): boolean {
  return !!sev && WARNING_SEVERITY_RANK[sev] >= WARNING_SEVERITY_RANK.warning;
}

function compareSeverity(a: WarningSeverity, b: WarningSeverity): number {
  const rank: Record<WarningSeverity, number> = {
    special: 4,
    danger: 3,
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

    // Record EVERY reported municipality, including 'normal' (発表なし / 解除), so the map never
    // falls back to a coarser division/prefecture severity for municipalities that JMA explicitly
    // reported as clear (e.g. 山形市 while only 庄内 has 波浪警報).
    const prevMuniSev = muniSeverityMap[codeStr];
    if (!prevMuniSev || compareSeverity(maxSeverity, prevMuniSev) > 0) {
      muniSeverityMap[codeStr] = maxSeverity;
    }
    if (badgeItems.length === 0) return;
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

  // r8/map.json holds one report per (発表官署 × 電文種別 VPWW55..61). Each kind (大雨/土砂災害/高潮/風/波浪/
  // 大雪/その他) is independent, so all kinds are merged, but if JMA ever ships more than one report for the
  // same office + kind, only the newest one is authoritative (older ones may contain lifted warnings).
  const latestByKey = new Map<string, Record<string, any>>();
  const passthrough: Array<Record<string, any>> = [];
  for (const block of Array.isArray(rawArray) ? rawArray : []) {
    if (!block || typeof block !== 'object') continue;
    const office = String(block.publishingOffice || '');
    const kind = String(block.dataTypeCode || '');
    if (!office || !kind || !block.warning) {
      passthrough.push(block);
      continue;
    }
    const key = `${office}|${kind}`;
    const prev = latestByKey.get(key);
    const t = Date.parse(String(block.reportDatetime || '')) || 0;
    const pt = prev ? Date.parse(String(prev.reportDatetime || '')) || 0 : -1;
    if (!prev || t >= pt) latestByKey.set(key, block);
  }
  const effectiveBlocks = [...latestByKey.values(), ...passthrough];

  for (const officeBlock of effectiveBlocks) {
    if (officeBlock.infoType === '取消') continue;
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
 * Computes the continuous connected storm warning area envelope (暴風警戒域の包絡線)
 * connecting consecutive track points that have storm-force wind radii (stormRadiusKm > 0),
 * forming a single unified polygon shape with tangent boundaries and rounded end/start caps.
 */
export function computeTyphoonStormEnvelope(points: TyphoonTrackPoint[]): {
  leftEdge: Array<[number, number]>;
  rightEdge: Array<[number, number]>;
  polygon: Array<[number, number]>;
} {
  const stormCircles: Array<{ lat: number; lon: number; rKm: number }> = [];
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (i === 0) {
      const rKm = pt.stormRadiusKm || 0;
      if (rKm > 0) {
        stormCircles.push({ lat: pt.lat, lon: pt.lon, rKm });
      }
    } else {
      if (pt.stormRadiusKm > 0) {
        const rKm = (pt.probabilityCircleRadiusKm || 0) + pt.stormRadiusKm;
        if (rKm > 0) {
          stormCircles.push({ lat: pt.lat, lon: pt.lon, rKm });
        }
      }
    }
  }

  if (stormCircles.length < 2) {
    return { leftEdge: [], rightEdge: [], polygon: [] };
  }

  const M = stormCircles.length;
  const segTangents: Array<{
    theta: number;
    betaLeft: number;
    betaRight: number;
    tALeft: [number, number];
    tBLeft: [number, number];
    tARight: [number, number];
    tBRight: [number, number];
    cosPhi: number;
  }> = [];

  for (let i = 0; i < M - 1; i++) {
    const A = stormCircles[i];
    const B = stormCircles[i + 1];

    const phiAvg = ((A.lat + B.lat) / 2) * (Math.PI / 180);
    const cosPhi = Math.max(0.2, Math.cos(phiAvg));

    const dx = (B.lon - A.lon) * cosPhi * 111.32;
    const dy = (B.lat - A.lat) * 111.32;
    const d = Math.hypot(dx, dy) || 1;

    const theta = Math.atan2(dy, dx);
    const deltaR = A.rKm - B.rKm;
    const sinAlpha = Math.max(-0.999, Math.min(0.999, deltaR / d));
    const alpha = Math.asin(sinAlpha);

    const betaLeft = theta + Math.PI / 2 - alpha;
    const betaRight = theta - Math.PI / 2 + alpha;

    const toLatLon = (
      center: { lat: number; lon: number },
      tx: number,
      ty: number,
      cPhi: number
    ): [number, number] => [
      Number((center.lat + ty / 111.32).toFixed(4)),
      Number((center.lon + tx / (111.32 * cPhi)).toFixed(4)),
    ];

    const tALeft = toLatLon(A, A.rKm * Math.cos(betaLeft), A.rKm * Math.sin(betaLeft), cosPhi);
    const tBLeft = toLatLon(B, B.rKm * Math.cos(betaLeft), B.rKm * Math.sin(betaLeft), cosPhi);
    const tARight = toLatLon(A, A.rKm * Math.cos(betaRight), A.rKm * Math.sin(betaRight), cosPhi);
    const tBRight = toLatLon(B, B.rKm * Math.cos(betaRight), B.rKm * Math.sin(betaRight), cosPhi);

    segTangents.push({
      theta,
      betaLeft,
      betaRight,
      tALeft,
      tBLeft,
      tARight,
      tBRight,
      cosPhi,
    });
  }

  const leftEdge: Array<[number, number]> = [];
  const rightEdge: Array<[number, number]> = [];

  // 1. Build Left Edge from circle 0 to circle M-1
  for (let i = 0; i < M - 1; i++) {
    const seg = segTangents[i];
    leftEdge.push(seg.tALeft);
    leftEdge.push(seg.tBLeft);
  }

  // 2. End Cap around Circle M-1
  const lastSeg = segTangents[M - 2];
  const lastCircle = stormCircles[M - 1];
  const lastCosPhi = lastSeg.cosPhi;
  const endCap: Array<[number, number]> = [];

  const startAng = lastSeg.betaLeft;
  let endAng = lastSeg.betaRight;
  while (endAng > startAng) endAng -= 2 * Math.PI;

  const numCapSteps = 12;
  for (let s = 1; s < numCapSteps; s++) {
    const ang = startAng + (endAng - startAng) * (s / numCapSteps);
    const tx = lastCircle.rKm * Math.cos(ang);
    const ty = lastCircle.rKm * Math.sin(ang);
    endCap.push([
      Number((lastCircle.lat + ty / 111.32).toFixed(4)),
      Number((lastCircle.lon + tx / (111.32 * lastCosPhi)).toFixed(4)),
    ]);
  }

  // 3. Build Right Edge from circle M-1 back to circle 0
  for (let i = M - 2; i >= 0; i--) {
    const seg = segTangents[i];
    rightEdge.push(seg.tBRight);
    rightEdge.push(seg.tARight);
  }

  // 4. Start Cap around Circle 0
  const firstSeg = segTangents[0];
  const firstCircle = stormCircles[0];
  const firstCosPhi = firstSeg.cosPhi;
  const startCap: Array<[number, number]> = [];

  const sStartAng = firstSeg.betaRight;
  let sEndAng = firstSeg.betaLeft;
  while (sEndAng > sStartAng) sEndAng -= 2 * Math.PI;

  for (let s = 1; s < numCapSteps; s++) {
    const ang = sStartAng + (sEndAng - sStartAng) * (s / numCapSteps);
    const tx = firstCircle.rKm * Math.cos(ang);
    const ty = firstCircle.rKm * Math.sin(ang);
    startCap.push([
      Number((firstCircle.lat + ty / 111.32).toFixed(4)),
      Number((firstCircle.lon + tx / (111.32 * firstCosPhi)).toFixed(4)),
    ]);
  }

  const polygon: Array<[number, number]> = [
    ...leftEdge,
    ...endCap,
    ...rightEdge,
    ...startCap,
  ];

  return {
    leftEdge,
    rightEdge,
    polygon,
  };
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
    const rawHypoName = String(hypoArea.Name || listSummary?.anm || '').trim();
    const hypocenterName = rawHypoName || '震源調査中';
    const coordStr = String(hypoArea.Coordinate || listSummary?.cod || '');
    const parsedCoord = parseJmaIsoCoordinate(coordStr);
    const hypocenterUnknown = !parsedCoord || !rawHypoName;

    const lat = parsedCoord ? parsedCoord.lat : 35.68;
    const lon = parsedCoord ? parsedCoord.lon : 139.76;
    const depthKm = parsedCoord ? parsedCoord.depthKm : 10;

    const rawMag = Number(eq.Magnitude ?? listSummary?.mag ?? -1);
    const magnitude =
      !Number.isNaN(rawMag) && rawMag > 0 ? Number(rawMag.toFixed(1)) : -1;

    const obs = body.Intensity?.Observation || {};
    const rawMaxIntStr = String(obs.MaxInt || listSummary?.maxi || '').trim();
    const maxIntInfo = rawMaxIntStr
      ? parseJmaIntensityString(rawMaxIntStr)
      : { scaleCode: -1, scaleLabel: '-' };

    const stations: EarthquakeStationIntensity[] = [];
    const areaMaxScales: Record<
      string,
      { scaleCode: number; scaleLabel: string; name?: string }
    > = {};
    const cityMaxScales: Record<string, number> = {};
    const prefs = Array.isArray(obs.Pref) ? obs.Pref : [];

    for (const pref of prefs) {
      const prefName = String(pref?.Name || '');
      const areas = Array.isArray(pref?.Area) ? pref.Area : [];
      for (const area of areas) {
        const areaName = String(area?.Name || prefName);
        const areaCode = String(area?.Code || '');
        const areaMaxIntStr = String(area?.MaxInt || pref?.MaxInt || '');
        const aInt = parseJmaIntensityString(areaMaxIntStr || '1');
        if (areaCode) {
          areaMaxScales[areaCode] = {
            scaleCode: aInt.scaleCode,
            scaleLabel: aInt.scaleLabel,
            name: areaName,
          };
        }
        const cities = Array.isArray(area?.City) ? area.City : [];
        if (cities.length === 0 && areaMaxIntStr) {
          // 震度速報 (VXSE51) has Pref -> Area with MaxInt, but no City or IntensityStation yet
          const baseMeta = Object.values(PREFECTURE_NAMES).find(
            (m) => prefName.includes(m.name) || m.name.includes(prefName)
          );
          stations.push({
            prefecture: prefName || areaName,
            city: areaName,
            stationName: areaName,
            scaleCode: aInt.scaleCode,
            scaleLabel: aInt.scaleLabel,
            lat: baseMeta?.lat,
            lon: baseMeta?.lon,
          });
        }
        for (const city of cities) {
          const cityName = String(city?.Name || areaName);
          const cityCode = String(city?.Code || '');
          const cityMaxIntStr = String(city?.MaxInt || '');
          if (cityCode && cityMaxIntStr) {
            const cInt = parseJmaIntensityString(cityMaxIntStr);
            cityMaxScales[cityCode] = cInt.scaleCode;
          }
          const intensityStations = Array.isArray(city?.IntensityStation)
            ? city.IntensityStation
            : [];
          if (intensityStations.length === 0 && cityMaxIntStr) {
            const cInt = parseJmaIntensityString(cityMaxIntStr);
            stations.push({
              prefecture: prefName,
              city: cityName,
              stationName: cityName,
              scaleCode: cInt.scaleCode,
              scaleLabel: cInt.scaleLabel,
            });
          }
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

    const title = String(head.Title || listSummary?.ttl || '');
    const infoKind = String(head.InfoKind || '');
    let issueTypeLabel = '震源・震度に関する情報';
    if (title.includes('震度速報') || infoKind.includes('震度速報')) {
      issueTypeLabel = '震度速報';
    } else if (
      title.includes('震源に関する情報') ||
      infoKind.includes('震源速報')
    ) {
      issueTypeLabel = '震源に関する情報';
    } else if (title.includes('遠地') || infoKind.includes('遠地')) {
      issueTypeLabel = '遠地地震に関する情報';
    } else if (stations.length > 0 && Object.keys(cityMaxScales).length > 0) {
      issueTypeLabel = '各地の震度に関する情報';
    }

    const isConfirmed =
      !hypocenterUnknown &&
      maxIntInfo.scaleCode >= 10 &&
      issueTypeLabel !== '震度速報' &&
      issueTypeLabel !== '震源に関する情報';

    const reportIso = String(head.ReportDateTime || listSummary?.rdt || '');
    const originIso = String(
      eq.OriginTime || head.TargetDateTime || listSummary?.at || reportIso
    );
    const commentText = String(
      body.Comments?.ForecastComment?.Text || ''
    ).trim();

    const id = eid ? `jma-eq-${eid}` : `jma-eq-${originIso}`;
    const reportKey = `${id}|${issueTypeLabel}|${hypocenterName}|${maxIntInfo.scaleCode}|${stations.length}|${isConfirmed ? 1 : 0}`;

    // If hypocenter is unknown (震度速報) and we have area/prefecture stations, center on first station's prefecture
    const finalLat =
      hypocenterUnknown && stations[0]?.lat ? stations[0].lat : lat;
    const finalLon =
      hypocenterUnknown && stations[0]?.lon ? stations[0].lon : lon;

    return {
      id,
      issueTime: formatJmaIsoDateTimeJst(reportIso, '発表'),
      occurrenceTime: formatJmaIsoDateTimeJst(originIso, '頃発生'),
      hypocenterName,
      regionId: inferRegionFromHypocenterName(hypocenterName, finalLat, finalLon),
      lat: finalLat,
      lon: finalLon,
      depthKm,
      magnitude: magnitude > 0 ? magnitude : 4.0,
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
      issueTypeLabel,
      hypocenterUnknown,
      isConfirmed,
      reportKey,
      areaMaxScales,
      cityMaxScales,
      stations:
        stations.length > 0
          ? stations
          : maxIntInfo.scaleCode >= 10
            ? [
                {
                  prefecture: hypocenterName,
                  city: hypocenterName,
                  stationName: hypocenterName,
                  scaleCode: maxIntInfo.scaleCode,
                  scaleLabel: maxIntInfo.scaleLabel,
                  lat: finalLat,
                  lon: finalLon,
                },
              ]
            : [],
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
  dangerCount: number;
  warningCount: number;
  advisoryCount: number;
  normalCount: number;
} {
  let specialCount = 0;
  let dangerCount = 0;
  let warningCount = 0;
  let advisoryCount = 0;
  let normalCount = 0;

  for (const w of warnings) {
    if (w.severity === 'special') specialCount++;
    else if (w.severity === 'danger') dangerCount++;
    else if (w.severity === 'warning') warningCount++;
    else if (w.severity === 'advisory') advisoryCount++;
    else normalCount++;
  }

  return { specialCount, dangerCount, warningCount, advisoryCount, normalCount };
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
    [3, 12.0],
    [4, 16.0],
    [5, 20.0],
    [6, 25.0],
    [7, 29.0],
    [8, 33.0],
    [9, 37.0],
    [11, 44.0],
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
  return 24.0;
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
    // Pack wind arrows densely across Japan without gaps (~250+ stations at nationwide zoom)
    const t = Math.max(0, Math.min(1, (zoom - 5.5) / (8.2 - 5.5)));
    const minDistPx = arrowSize * (0.58 - t * 0.22);
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

/**
 * Merges progressive earthquake reports (e.g. `震度速報` + `震源に関する情報` + `各地の震度に関する情報`
 * across JMA bosai JSON and P2P地震情報 551) belonging to the same earthquake event.
 * Ensures that:
 * - `震源に関する情報` (which has hypocenter but no intensity) never wipes out `震度速報` intensities.
 * - `isConfirmed` is true ONLY when a confirmed detail report (`各地の震度に関する情報` / `震源・震度に関する情報`)
 *   with both known hypocenter and station intensities has been received.
 */
export function mergeProgressiveEarthquakeReports(
  reports: EarthquakeReport[]
): EarthquakeReport[] {
  if (!Array.isArray(reports) || reports.length === 0) return [];

  const groups: EarthquakeReport[][] = [];

  for (const r of reports) {
    if (!r) continue;
    const tR =
      parseEarthquakeTimeMs(r.occurrenceTime) ||
      parseEarthquakeTimeMs(r.issueTime);
    let matchedGroup: EarthquakeReport[] | null = null;

    for (const grp of groups) {
      const rep = grp[0];
      if (rep.id === r.id) {
        matchedGroup = grp;
        break;
      }
      const tRep =
        parseEarthquakeTimeMs(rep.occurrenceTime) ||
        parseEarthquakeTimeMs(rep.issueTime);
      if (tR > 0 && tRep > 0 && Math.abs(tR - tRep) <= 95 * 1000) {
        const sameOrUnknownHypo =
          rep.hypocenterUnknown ||
          r.hypocenterUnknown ||
          rep.hypocenterName === '震源調査中' ||
          r.hypocenterName === '震源調査中' ||
          rep.hypocenterName === r.hypocenterName;
        if (sameOrUnknownHypo) {
          matchedGroup = grp;
          break;
        }
      }
    }

    if (matchedGroup) {
      matchedGroup.push(r);
    } else {
      groups.push([r]);
    }
  }

  const mergedList: EarthquakeReport[] = groups.map((grp) => {
    // Sort group so JMA official reports and newer issueTime come first
    const ordered = [...grp].sort((a, b) => {
      const aConfirmedJma = a.isConfirmed && a.id.startsWith('jma-eq-') ? 1 : 0;
      const bConfirmedJma = b.isConfirmed && b.id.startsWith('jma-eq-') ? 1 : 0;
      if (bConfirmedJma !== aConfirmedJma) return bConfirmedJma - aConfirmedJma;
      const tIssueA = parseEarthquakeTimeMs(a.issueTime);
      const tIssueB = parseEarthquakeTimeMs(b.issueTime);
      if (tIssueB !== tIssueA) return tIssueB - tIssueA;
      return b.stations.length - a.stations.length;
    });

    const base = ordered[0];
    const jmaIdReport = ordered.find((r) => r.id.startsWith('jma-eq-'));
    const id = jmaIdReport ? jmaIdReport.id : base.id;

    // Best hypocenter source: any report in the group with known hypocenter
    const hypoSource =
      ordered.find(
        (r) =>
          !r.hypocenterUnknown &&
          r.hypocenterName &&
          r.hypocenterName !== '震源調査中'
      ) || base;

    const hypocenterUnknown = Boolean(
      hypoSource.hypocenterUnknown || hypoSource.hypocenterName === '震源調査中'
    );
    const hypocenterName = hypocenterUnknown
      ? '震源調査中'
      : hypoSource.hypocenterName;

    // Best intensity & station source: prefer confirmed JMA report with lat/lon stations, else highest station count with valid scale
    const intensitySource =
      ordered.find(
        (r) =>
          r.id.startsWith('jma-eq-') &&
          r.maxScaleCode >= 10 &&
          r.stations.length > 0 &&
          r.issueTypeLabel !== '震度速報'
      ) ||
      ordered
        .filter((r) => r.maxScaleCode >= 10 && r.stations.length > 0)
        .sort(
          (a, b) =>
            b.stations.length - a.stations.length ||
            b.maxScaleCode - a.maxScaleCode
        )[0] ||
      ordered.find((r) => r.maxScaleCode >= 10) ||
      base;

    // Merge areaMaxScales & cityMaxScales across all reports in the group
    const mergedAreaScales: Record<
      string,
      { scaleCode: number; scaleLabel: string; name?: string }
    > = {};
    const mergedCityScales: Record<string, number> = {};

    for (const r of ordered) {
      if (r.areaMaxScales) {
        for (const [k, v] of Object.entries(r.areaMaxScales)) {
          if (!mergedAreaScales[k] || v.scaleCode > mergedAreaScales[k].scaleCode) {
            mergedAreaScales[k] = v;
          }
        }
      }
      if (r.cityMaxScales) {
        for (const [k, v] of Object.entries(r.cityMaxScales)) {
          if (!mergedCityScales[k] || v > mergedCityScales[k]) {
            mergedCityScales[k] = v;
          }
        }
      }
    }

    const hasConfirmedDetail = ordered.some(
      (r) =>
        Boolean(r.isConfirmed) ||
        (!r.hypocenterUnknown &&
          r.hypocenterName !== '震源調査中' &&
          r.maxScaleCode >= 10 &&
          r.issueTypeLabel !== '震度速報' &&
          r.issueTypeLabel !== '震源に関する情報')
    );

    let issueTypeLabel = base.issueTypeLabel || '震源・震度に関する情報';
    if (hasConfirmedDetail) {
      issueTypeLabel = '各地の震度に関する情報';
    } else if (!hypocenterUnknown && intensitySource.maxScaleCode >= 10) {
      issueTypeLabel = '震度速報・震源情報（各地の震度集計中）';
    } else if (hypocenterUnknown && intensitySource.maxScaleCode >= 10) {
      issueTypeLabel = '震度速報';
    } else if (!hypocenterUnknown && intensitySource.maxScaleCode < 10) {
      issueTypeLabel = '震源に関する情報';
    }

    const maxScaleCode = intensitySource.maxScaleCode;
    const maxScaleLabel =
      maxScaleCode >= 10 ? intensitySource.maxScaleLabel : '-';
    const stations = intensitySource.stations;
    const isConfirmed = hasConfirmedDetail;
    const reportKey = `${id}|${issueTypeLabel}|${hypocenterName}|${maxScaleCode}|${stations.length}|${isConfirmed ? 1 : 0}`;

    return {
      ...base,
      id,
      issueTime: base.issueTime,
      occurrenceTime: hypoSource.occurrenceTime || base.occurrenceTime,
      hypocenterName,
      regionId: hypoSource.regionId,
      lat: hypoSource.lat,
      lon: hypoSource.lon,
      depthKm: hypoSource.depthKm,
      magnitude: hypoSource.magnitude,
      maxScaleCode,
      maxScaleLabel,
      domesticTsunami:
        hypoSource.domesticTsunami || base.domesticTsunami,
      foreignTsunami:
        hypoSource.foreignTsunami || base.foreignTsunami,
      sourceOffice: jmaIdReport
        ? jmaIdReport.sourceOffice
        : base.sourceOffice,
      issueTypeLabel,
      hypocenterUnknown,
      isConfirmed,
      reportKey,
      areaMaxScales:
        Object.keys(mergedAreaScales).length > 0
          ? mergedAreaScales
          : undefined,
      cityMaxScales:
        Object.keys(mergedCityScales).length > 0
          ? mergedCityScales
          : undefined,
      stations,
    };
  });

  return sortEarthquakesByNewest(mergedList);
}

/** Occurrence time (ms) of a report, falling back to its issue time. 0 when unknown. */
export function earthquakeEventTimeMs(eq: Pick<EarthquakeReport, 'occurrenceTime' | 'issueTime'>): number {
  return parseEarthquakeTimeMs(eq.occurrenceTime) || parseEarthquakeTimeMs(eq.issueTime);
}

/**
 * True when two reports describe the same earthquake even though they come from different feeds
 * (P2P地震情報 ids vs 気象庁 bosai event ids never match). 震度速報 only carries the detection minute,
 * so origin times within 75 s are treated as one event.
 */
export function isSameEarthquakeEvent(
  a: Pick<EarthquakeReport, 'occurrenceTime' | 'issueTime'>,
  b: Pick<EarthquakeReport, 'occurrenceTime' | 'issueTime'>,
  toleranceMs = 75_000
): boolean {
  const ta = earthquakeEventTimeMs(a);
  const tb = earthquakeEventTimeMs(b);
  if (!ta || !tb) return false;
  return Math.abs(ta - tb) <= toleranceMs;
}

export type IncomingEarthquakeDecision = 'interrupt' | 'update' | 'ignore';

/**
 * Decides what a newly received earthquake report should do to the screen.
 * - 'interrupt': a newer event than anything seen -> switch to the 地震情報 scene immediately.
 * - 'update':    a follow-up report (震度速報 -> 震源 -> 各地の震度) of the event already shown.
 * - 'ignore':    an older event, or a stale event on first load.
 */
export function decideIncomingEarthquake(
  report: Pick<EarthquakeReport, 'occurrenceTime' | 'issueTime'>,
  latestKnown: Pick<EarthquakeReport, 'occurrenceTime' | 'issueTime'> | null,
  nowMs: number,
  freshWindowMs = 60 * 60 * 1000
): IncomingEarthquakeDecision {
  const t = earthquakeEventTimeMs(report);
  if (!t) return 'ignore';
  if (latestKnown && isSameEarthquakeEvent(report, latestKnown)) return 'update';
  const tl = latestKnown ? earthquakeEventTimeMs(latestKnown) : 0;
  if (tl && t < tl) return 'ignore';
  return nowMs - t <= freshWindowMs ? 'interrupt' : 'ignore';
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
 * Preserves all municipality warning/advisory colors across Japan even when zoomed into a division.
 */
export function getEffectiveMunicipalitySeverity(
  muniCode: string,
  _muniDivisionCode: string | undefined | null,
  muniSeverityMap: Record<string, WarningSeverity>,
  _activeWarningDivisionCode?: string | null
): WarningSeverity {
  return muniSeverityMap[muniCode] || 'normal';
}

/**
 * Fast ray-casting algorithm to test whether [lon, lat] is inside a polygon ring
 */
export function isPointInPolygon(point: [number, number], ring: number[][]): boolean {
  let inside = false;
  const px = point[0];
  const py = point[1];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const geoFeatureBoundsCache = new WeakMap<
  object,
  [number, number, number, number]
>();

function getGeoFeatureBounds(f: any): [number, number, number, number] | null {
  if (!f || typeof f !== 'object') return null;
  const cached = geoFeatureBoundsCache.get(f);
  if (cached) return cached;
  const geom = f.geometry;
  if (!geom) return null;
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  const polys =
    geom.type === 'Polygon'
      ? [geom.coordinates]
      : geom.type === 'MultiPolygon'
        ? geom.coordinates
        : [];
  for (let p = 0; p < polys.length; p++) {
    const ring = polys[p]?.[0];
    if (!Array.isArray(ring)) continue;
    for (let i = 0; i < ring.length; i++) {
      const lon = Number(ring[i][0]);
      const lat = Number(ring[i][1]);
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (minLon > maxLon) return null;
  const bounds: [number, number, number, number] = [
    minLon,
    minLat,
    maxLon,
    maxLat,
  ];
  geoFeatureBoundsCache.set(f, bounds);
  return bounds;
}

function isPointInGeoFeature(pt: [number, number], f: any): boolean {
  const b = getGeoFeatureBounds(f);
  if (b && (pt[0] < b[0] || pt[0] > b[2] || pt[1] < b[1] || pt[1] > b[3])) {
    return false;
  }
  const geom = f?.geometry;
  if (!geom) return false;
  if (geom.type === 'Polygon') {
    return Boolean(geom.coordinates[0] && isPointInPolygon(pt, geom.coordinates[0]));
  }
  if (geom.type === 'MultiPolygon') {
    for (let i = 0; i < geom.coordinates.length; i++) {
      const poly = geom.coordinates[i];
      if (poly[0] && isPointInPolygon(pt, poly[0])) return true;
    }
  }
  return false;
}

/**
 * Maps each JMA earthquake area code (e.g., '100', '704') to its maximum observed seismic scale code (e.g., 10, 20, 30).
 * Combines JMA official Area.Code observations with spatial point-in-polygon assignment for all stations.
 */
export function computeEarthquakeAreaScales(
  eq: EarthquakeReport,
  earthquakeGeoJson?: any
): Map<string, number> {
  const areaScales = new Map<string, number>();

  // 1. Ingest official JMA areaMaxScales if already parsed
  if (eq.areaMaxScales) {
    for (const [code, info] of Object.entries(eq.areaMaxScales)) {
      if (typeof info?.scaleCode === 'number') {
        areaScales.set(code, info.scaleCode);
      }
    }
  }

  // 2. Point-in-polygon fallback from stations into earthquake.json features
  if (
    areaScales.size === 0 &&
    earthquakeGeoJson &&
    Array.isArray(earthquakeGeoJson.features) &&
    Array.isArray(eq.stations) &&
    eq.stations.length > 0
  ) {
    for (const st of eq.stations) {
      if (typeof st.lat !== 'number' || typeof st.lon !== 'number') continue;
      const pt: [number, number] = [st.lon, st.lat];
      for (const f of earthquakeGeoJson.features) {
        const code = String(f?.properties?.code || '');
        if (!code) continue;
        if (isPointInGeoFeature(pt, f)) {
          const cur = areaScales.get(code) || 0;
          if (st.scaleCode > cur) {
            areaScales.set(code, st.scaleCode);
          }
          break;
        }
      }
    }
  }

  // 3. If no areas matched yet (e.g. hypocenter only with maxScale), map hypocenter location
  if (areaScales.size === 0 && typeof eq.lat === 'number' && typeof eq.lon === 'number' && eq.maxScaleCode > 0) {
    if (earthquakeGeoJson && Array.isArray(earthquakeGeoJson.features)) {
      const pt: [number, number] = [eq.lon, eq.lat];
      for (const f of earthquakeGeoJson.features) {
        const code = String(f?.properties?.code || '');
        if (!code) continue;
        if (isPointInGeoFeature(pt, f)) {
          areaScales.set(code, eq.maxScaleCode);
          break;
        }
      }
    }
  }

  return areaScales;
}

/**
 * Maps each JMA municipality code (e.g., '3520300') to its maximum observed seismic scale code (e.g., 10, 20, 30).
 * Used when zoomed into municipality level (`zoom >= 6.8`) to subdivide the earthquake intensity map into cities/towns.
 */
export function computeEarthquakeCityScales(
  eq: EarthquakeReport,
  class20GeoJson?: any
): Map<string, number> {
  const cityScales = new Map<string, number>();

  if (eq.cityMaxScales) {
    for (const [code, scale] of Object.entries(eq.cityMaxScales)) {
      if (typeof scale === 'number') {
        cityScales.set(code, scale);
      }
    }
  }

  if (
    cityScales.size === 0 &&
    class20GeoJson &&
    Array.isArray(class20GeoJson.features) &&
    Array.isArray(eq.stations) &&
    eq.stations.length > 0
  ) {
    for (const st of eq.stations) {
      if (typeof st.lat !== 'number' || typeof st.lon !== 'number') continue;
      const pt: [number, number] = [st.lon, st.lat];
      for (const f of class20GeoJson.features) {
        const code = String(f?.properties?.code || '');
        if (!code) continue;
        if (isPointInGeoFeature(pt, f)) {
          const cur = cityScales.get(code) || 0;
          if (st.scaleCode > cur) {
            cityScales.set(code, st.scaleCode);
          }
          break;
        }
      }
    }
  }

  return cityScales;
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
    .filter((w) => isWarningOrAbove(w.severity))
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

export type WeatherBaseKind = 'sunny' | 'cloudy' | 'rain' | 'snow';
export type WeatherCompositionPattern = 'single' | 'sometimes' | 'later';

export interface WeatherVisualDescriptor {
  pattern: WeatherCompositionPattern;
  primary: WeatherBaseKind;
  secondary?: WeatherBaseKind;
  shortLabel: string;
}

export interface MajorForecastCityTarget {
  id: string;
  cityName: string;
  officeCode: string;
  areaCode: string;
  tempStationCode: string;
}

/**
 * 18 major forecast cities across Japan (Hokkaido to Yaeyama & Ogasawara):
 * 旭川・札幌・釧路・秋田・仙台・新潟・金沢・長野・東京・小笠原諸島・名古屋・大阪・広島・高知・福岡・鹿児島・那覇・石垣島
 */
export const MAJOR_FORECAST_CITY_TARGETS: MajorForecastCityTarget[] = [
  { id: 'fc-012000', cityName: '旭川', officeCode: '012000', areaCode: '012010', tempStationCode: '12442' },
  { id: 'fc-016000', cityName: '札幌', officeCode: '016000', areaCode: '016010', tempStationCode: '14163' },
  { id: 'fc-014100', cityName: '釧路', officeCode: '014100', areaCode: '014020', tempStationCode: '19432' },
  { id: 'fc-050000', cityName: '秋田', officeCode: '050000', areaCode: '050010', tempStationCode: '32402' },
  { id: 'fc-040000', cityName: '仙台', officeCode: '040000', areaCode: '040010', tempStationCode: '34392' },
  { id: 'fc-150000', cityName: '新潟', officeCode: '150000', areaCode: '150010', tempStationCode: '54232' },
  { id: 'fc-170000', cityName: '金沢', officeCode: '170000', areaCode: '170010', tempStationCode: '56227' },
  { id: 'fc-200000', cityName: '長野', officeCode: '200000', areaCode: '200010', tempStationCode: '48156' },
  { id: 'fc-130000', cityName: '東京', officeCode: '130000', areaCode: '130010', tempStationCode: '44132' },
  { id: 'fc-130040', cityName: '小笠原諸島', officeCode: '130000', areaCode: '130040', tempStationCode: '44301' },
  { id: 'fc-230000', cityName: '名古屋', officeCode: '230000', areaCode: '230010', tempStationCode: '51106' },
  { id: 'fc-270000', cityName: '大阪', officeCode: '270000', areaCode: '270000', tempStationCode: '62078' },
  { id: 'fc-340000', cityName: '広島', officeCode: '340000', areaCode: '340010', tempStationCode: '67437' },
  { id: 'fc-390000', cityName: '高知', officeCode: '390000', areaCode: '390010', tempStationCode: '74182' },
  { id: 'fc-400000', cityName: '福岡', officeCode: '400000', areaCode: '400010', tempStationCode: '82182' },
  { id: 'fc-460100', cityName: '鹿児島', officeCode: '460100', areaCode: '460010', tempStationCode: '88317' },
  { id: 'fc-471000', cityName: '那覇', officeCode: '471000', areaCode: '471010', tempStationCode: '91197' },
  { id: 'fc-474000', cityName: '石垣島', officeCode: '474000', areaCode: '474010', tempStationCode: '94081' },
];

const JMA_CODE_DESCRIPTOR_MAP: Record<
  string,
  { pattern: WeatherCompositionPattern; primary: WeatherBaseKind; secondary?: WeatherBaseKind }
> = {
  // 100s: Sunny primary
  '100': { pattern: 'single', primary: 'sunny' },
  '101': { pattern: 'sometimes', primary: 'sunny', secondary: 'cloudy' },
  '102': { pattern: 'sometimes', primary: 'sunny', secondary: 'rain' },
  '103': { pattern: 'sometimes', primary: 'sunny', secondary: 'rain' },
  '104': { pattern: 'sometimes', primary: 'sunny', secondary: 'snow' },
  '105': { pattern: 'sometimes', primary: 'sunny', secondary: 'snow' },
  '106': { pattern: 'sometimes', primary: 'sunny', secondary: 'rain' },
  '107': { pattern: 'sometimes', primary: 'sunny', secondary: 'rain' },
  '108': { pattern: 'sometimes', primary: 'sunny', secondary: 'rain' },
  '110': { pattern: 'later', primary: 'sunny', secondary: 'cloudy' },
  '111': { pattern: 'later', primary: 'sunny', secondary: 'cloudy' },
  '112': { pattern: 'later', primary: 'sunny', secondary: 'rain' },
  '113': { pattern: 'later', primary: 'sunny', secondary: 'rain' },
  '114': { pattern: 'later', primary: 'sunny', secondary: 'rain' },
  '115': { pattern: 'later', primary: 'sunny', secondary: 'snow' },
  '116': { pattern: 'later', primary: 'sunny', secondary: 'snow' },
  '117': { pattern: 'later', primary: 'sunny', secondary: 'snow' },
  '118': { pattern: 'later', primary: 'sunny', secondary: 'rain' },
  '119': { pattern: 'later', primary: 'sunny', secondary: 'rain' },
  '120': { pattern: 'sometimes', primary: 'sunny', secondary: 'rain' },
  '121': { pattern: 'sometimes', primary: 'sunny', secondary: 'rain' },
  '122': { pattern: 'later', primary: 'sunny', secondary: 'rain' },
  '123': { pattern: 'single', primary: 'sunny' },
  '124': { pattern: 'single', primary: 'sunny' },
  '125': { pattern: 'later', primary: 'sunny', secondary: 'rain' },
  '126': { pattern: 'later', primary: 'sunny', secondary: 'rain' },
  '127': { pattern: 'later', primary: 'sunny', secondary: 'rain' },
  '128': { pattern: 'later', primary: 'sunny', secondary: 'rain' },
  '130': { pattern: 'single', primary: 'sunny' },
  '131': { pattern: 'single', primary: 'sunny' },
  '132': { pattern: 'sometimes', primary: 'sunny', secondary: 'cloudy' },
  '140': { pattern: 'sometimes', primary: 'sunny', secondary: 'rain' },
  '160': { pattern: 'sometimes', primary: 'sunny', secondary: 'snow' },
  '170': { pattern: 'sometimes', primary: 'sunny', secondary: 'snow' },
  '181': { pattern: 'later', primary: 'sunny', secondary: 'snow' },

  // 200s: Cloudy primary
  '200': { pattern: 'single', primary: 'cloudy' },
  '201': { pattern: 'sometimes', primary: 'cloudy', secondary: 'sunny' },
  '202': { pattern: 'sometimes', primary: 'cloudy', secondary: 'rain' },
  '203': { pattern: 'sometimes', primary: 'cloudy', secondary: 'rain' },
  '204': { pattern: 'sometimes', primary: 'cloudy', secondary: 'snow' },
  '205': { pattern: 'sometimes', primary: 'cloudy', secondary: 'snow' },
  '206': { pattern: 'sometimes', primary: 'cloudy', secondary: 'rain' },
  '207': { pattern: 'sometimes', primary: 'cloudy', secondary: 'rain' },
  '208': { pattern: 'sometimes', primary: 'cloudy', secondary: 'rain' },
  '209': { pattern: 'single', primary: 'cloudy' },
  '210': { pattern: 'later', primary: 'cloudy', secondary: 'sunny' },
  '211': { pattern: 'later', primary: 'cloudy', secondary: 'sunny' },
  '212': { pattern: 'later', primary: 'cloudy', secondary: 'rain' },
  '213': { pattern: 'later', primary: 'cloudy', secondary: 'rain' },
  '214': { pattern: 'later', primary: 'cloudy', secondary: 'rain' },
  '215': { pattern: 'later', primary: 'cloudy', secondary: 'snow' },
  '216': { pattern: 'later', primary: 'cloudy', secondary: 'snow' },
  '217': { pattern: 'later', primary: 'cloudy', secondary: 'snow' },
  '218': { pattern: 'later', primary: 'cloudy', secondary: 'rain' },
  '219': { pattern: 'later', primary: 'cloudy', secondary: 'rain' },
  '220': { pattern: 'sometimes', primary: 'cloudy', secondary: 'rain' },
  '221': { pattern: 'sometimes', primary: 'cloudy', secondary: 'rain' },
  '222': { pattern: 'later', primary: 'cloudy', secondary: 'rain' },
  '223': { pattern: 'sometimes', primary: 'cloudy', secondary: 'sunny' },
  '224': { pattern: 'later', primary: 'cloudy', secondary: 'rain' },
  '225': { pattern: 'later', primary: 'cloudy', secondary: 'rain' },
  '226': { pattern: 'later', primary: 'cloudy', secondary: 'rain' },
  '228': { pattern: 'later', primary: 'cloudy', secondary: 'snow' },
  '229': { pattern: 'later', primary: 'cloudy', secondary: 'snow' },
  '230': { pattern: 'later', primary: 'cloudy', secondary: 'snow' },
  '231': { pattern: 'single', primary: 'cloudy' },
  '240': { pattern: 'sometimes', primary: 'cloudy', secondary: 'rain' },
  '250': { pattern: 'sometimes', primary: 'cloudy', secondary: 'snow' },
  '260': { pattern: 'sometimes', primary: 'cloudy', secondary: 'snow' },
  '270': { pattern: 'sometimes', primary: 'cloudy', secondary: 'snow' },
  '281': { pattern: 'later', primary: 'cloudy', secondary: 'snow' },

  // 300s: Rain primary (plus 340/361/371 snow codes)
  '300': { pattern: 'single', primary: 'rain' },
  '301': { pattern: 'sometimes', primary: 'rain', secondary: 'sunny' },
  '302': { pattern: 'sometimes', primary: 'rain', secondary: 'cloudy' },
  '303': { pattern: 'sometimes', primary: 'rain', secondary: 'snow' },
  '304': { pattern: 'single', primary: 'rain' },
  '306': { pattern: 'single', primary: 'rain' },
  '308': { pattern: 'single', primary: 'rain' },
  '309': { pattern: 'sometimes', primary: 'rain', secondary: 'snow' },
  '311': { pattern: 'later', primary: 'rain', secondary: 'sunny' },
  '313': { pattern: 'later', primary: 'rain', secondary: 'cloudy' },
  '314': { pattern: 'later', primary: 'rain', secondary: 'snow' },
  '315': { pattern: 'later', primary: 'rain', secondary: 'snow' },
  '316': { pattern: 'later', primary: 'rain', secondary: 'sunny' },
  '317': { pattern: 'later', primary: 'rain', secondary: 'cloudy' },
  '320': { pattern: 'later', primary: 'rain', secondary: 'sunny' },
  '321': { pattern: 'later', primary: 'rain', secondary: 'cloudy' },
  '322': { pattern: 'sometimes', primary: 'rain', secondary: 'snow' },
  '323': { pattern: 'later', primary: 'rain', secondary: 'sunny' },
  '324': { pattern: 'later', primary: 'rain', secondary: 'sunny' },
  '325': { pattern: 'later', primary: 'rain', secondary: 'sunny' },
  '326': { pattern: 'later', primary: 'rain', secondary: 'snow' },
  '327': { pattern: 'later', primary: 'rain', secondary: 'snow' },
  '328': { pattern: 'single', primary: 'rain' },
  '329': { pattern: 'single', primary: 'rain' },
  '340': { pattern: 'single', primary: 'snow' },
  '350': { pattern: 'single', primary: 'rain' },
  '361': { pattern: 'later', primary: 'snow', secondary: 'sunny' },
  '371': { pattern: 'later', primary: 'snow', secondary: 'cloudy' },

  // 400s: Snow primary
  '400': { pattern: 'single', primary: 'snow' },
  '401': { pattern: 'sometimes', primary: 'snow', secondary: 'sunny' },
  '402': { pattern: 'sometimes', primary: 'snow', secondary: 'cloudy' },
  '403': { pattern: 'sometimes', primary: 'snow', secondary: 'rain' },
  '405': { pattern: 'single', primary: 'snow' },
  '406': { pattern: 'single', primary: 'snow' },
  '407': { pattern: 'single', primary: 'snow' },
  '409': { pattern: 'sometimes', primary: 'snow', secondary: 'rain' },
  '411': { pattern: 'later', primary: 'snow', secondary: 'sunny' },
  '413': { pattern: 'later', primary: 'snow', secondary: 'cloudy' },
  '414': { pattern: 'later', primary: 'snow', secondary: 'rain' },
  '420': { pattern: 'later', primary: 'snow', secondary: 'sunny' },
  '421': { pattern: 'later', primary: 'snow', secondary: 'cloudy' },
  '422': { pattern: 'later', primary: 'snow', secondary: 'rain' },
  '423': { pattern: 'later', primary: 'snow', secondary: 'rain' },
  '425': { pattern: 'single', primary: 'snow' },
  '426': { pattern: 'sometimes', primary: 'snow', secondary: 'rain' },
  '427': { pattern: 'sometimes', primary: 'snow', secondary: 'rain' },
  '450': { pattern: 'single', primary: 'snow' },
};

const KIND_KANJI: Record<WeatherBaseKind, string> = {
  sunny: '晴',
  cloudy: '曇',
  rain: '雨',
  snow: '雪',
};

function detectKindFromToken(token: string): WeatherBaseKind | null {
  if (token.includes('雪') || token.includes('ふぶき') || token.includes('みぞれ')) return 'snow';
  if (token.includes('雨') || token.includes('雷')) return 'rain';
  if (token.includes('曇') || token.includes('くもり')) return 'cloudy';
  if (token.includes('晴') || token.includes('はれ')) return 'sunny';
  return null;
}

function buildShortLabel(
  pattern: WeatherCompositionPattern,
  primary: WeatherBaseKind,
  secondary?: WeatherBaseKind
): string {
  if (pattern === 'single' || !secondary || secondary === primary) {
    return KIND_KANJI[primary];
  }
  if (pattern === 'later') {
    return `${KIND_KANJI[primary]}のち${KIND_KANJI[secondary]}`;
  }
  return `${KIND_KANJI[primary]}時々${KIND_KANJI[secondary]}`;
}

/**
 * Classifies a JMA 3-digit weather code and/or Japanese forecast text into a TV broadcast
 * visual descriptor (`single` / `sometimes` `時々` / `later` `のち`).
 */
export function classifyJmaWeatherDescriptor(
  weatherCode?: string,
  weatherText?: string
): WeatherVisualDescriptor {
  const code = String(weatherCode || '').trim();
  if (code && JMA_CODE_DESCRIPTOR_MAP[code]) {
    const mapped = JMA_CODE_DESCRIPTOR_MAP[code];
    return {
      ...mapped,
      shortLabel: buildShortLabel(mapped.pattern, mapped.primary, mapped.secondary),
    };
  }

  const text = String(weatherText || '')
    .replace(/（.*?）/g, '')
    .replace(/\(.*?\)/g, '')
    .trim();

  // Check if text has explicit transition ("のち", "後", "から", "夜遅く", "昼過ぎ", "夕方", "夜")
  const laterMatch = text.split(/のち|後|から|昼前|昼過ぎ|夕方|夜のはじめ頃|夜遅く/);
  if (laterMatch.length >= 2) {
    const k1 = detectKindFromToken(laterMatch[0]);
    const k2 = detectKindFromToken(laterMatch.slice(1).join(' '));
    if (k1 && k2 && k1 !== k2) {
      return {
        pattern: 'later',
        primary: k1,
        secondary: k2,
        shortLabel: buildShortLabel('later', k1, k2),
      };
    }
  }

  const sometimesMatch = text.split(/時々|一時|朝晩|日中|所により/);
  if (sometimesMatch.length >= 2) {
    const k1 = detectKindFromToken(sometimesMatch[0]);
    const k2 = detectKindFromToken(sometimesMatch.slice(1).join(' '));
    if (k1 && k2 && k1 !== k2) {
      return {
        pattern: 'sometimes',
        primary: k1,
        secondary: k2,
        shortLabel: buildShortLabel('sometimes', k1, k2),
      };
    }
  }

  // Fallback by leading code digit or text token
  if (code.startsWith('1')) {
    return { pattern: 'single', primary: 'sunny', shortLabel: '晴' };
  }
  if (code.startsWith('2')) {
    return { pattern: 'single', primary: 'cloudy', shortLabel: '曇' };
  }
  if (code.startsWith('3')) {
    return { pattern: 'single', primary: 'rain', shortLabel: '雨' };
  }
  if (code.startsWith('4')) {
    return { pattern: 'single', primary: 'snow', shortLabel: '雪' };
  }

  const fallbackKind = detectKindFromToken(text) || 'cloudy';
  return {
    pattern: 'single',
    primary: fallbackKind,
    shortLabel: KIND_KANJI[fallbackKind],
  };
}

const BROADCAST_BG_COLOR: Record<WeatherBaseKind, string> = {
  sunny: '#C2410C',  // Deep warm amber orange
  cloudy: '#334155', // Muted slate gray
  rain: '#1E40AF',   // Deep cobalt blue
  snow: '#0369A1',   // Deep frost cyan
};

function renderWeatherSymbolGroup(
  kind: WeatherBaseKind,
  cx: number,
  cy: number,
  scale: number
): string {
  const s = scale.toFixed(2);
  const tx = cx.toFixed(1);
  const ty = cy.toFixed(1);

  if (kind === 'sunny') {
    // Crisp white sun with 8 rays
    return `<g transform="translate(${tx},${ty}) scale(${s})">
      <circle cx="0" cy="0" r="5.2" fill="#FFFFFF"/>
      <g stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round">
        <line x1="0" y1="-8.2" x2="0" y2="-10.8"/>
        <line x1="0" y1="8.2" x2="0" y2="10.8"/>
        <line x1="-8.2" y1="0" x2="-10.8" y2="0"/>
        <line x1="8.2" y1="0" x2="10.8" y2="0"/>
        <line x1="-5.8" y1="-5.8" x2="-7.7" y2="-7.7"/>
        <line x1="5.8" y1="-5.8" x2="7.7" y2="-7.7"/>
        <line x1="-5.8" y1="5.8" x2="-7.7" y2="7.7"/>
        <line x1="5.8" y1="5.8" x2="7.7" y2="7.7"/>
      </g>
    </g>`;
  }

  if (kind === 'cloudy') {
    // Fluffy white broadcast cloud
    return `<g transform="translate(${tx},${ty}) scale(${s})">
      <path d="M-8.5,5.2 H8.2 C10.6,5.2 12.2,3.5 12.2,1.2 C12.2,-0.9 10.7,-2.6 8.6,-2.9 C8.1,-6.4 5.1,-8.8 1.5,-8.8 C-1.6,-8.8 -4.2,-7.0 -5.3,-4.3 C-5.8,-4.5 -6.4,-4.6 -7.0,-4.6 C-9.7,-4.6 -11.8,-2.5 -11.8,0.2 C-11.8,2.9 -10.4,5.2 -8.5,5.2 Z" fill="#FFFFFF"/>
    </g>`;
  }

  if (kind === 'rain') {
    // White cloud top + diagonal rain streaks/dots
    return `<g transform="translate(${tx},${ty}) scale(${s})">
      <path d="M-7.8,-0.5 H7.5 C9.6,-0.5 11.0,-1.9 11.0,-3.8 C11.0,-5.5 9.7,-6.9 7.9,-7.2 C7.4,-10.0 4.8,-12.0 1.6,-12.0 C-1.1,-12.0 -3.4,-10.5 -4.4,-8.2 C-4.9,-8.4 -5.5,-8.5 -6.0,-8.5 C-8.4,-8.5 -10.2,-6.7 -10.2,-4.4 C-10.2,-2.1 -9.2,-0.5 -7.8,-0.5 Z" fill="#FFFFFF"/>
      <g stroke="#BAE6FD" stroke-width="1.7" stroke-linecap="round">
        <line x1="-6.0" y1="2.2" x2="-7.6" y2="6.2"/>
        <line x1="-1.8" y1="2.2" x2="-3.4" y2="6.2"/>
        <line x1="2.4" y1="2.2" x2="0.8" y2="6.2"/>
        <line x1="6.6" y1="2.2" x2="5.0" y2="6.2"/>
        <line x1="-4.2" y1="7.8" x2="-5.6" y2="11.2"/>
        <line x1="0.0" y1="7.8" x2="-1.4" y2="11.2"/>
        <line x1="4.2" y1="7.8" x2="2.8" y2="11.2"/>
      </g>
    </g>`;
  }

  // 'snow': Cute broadcast snowman (2 stacked white circles) + snowflakes
  return `<g transform="translate(${tx},${ty}) scale(${s})">
    <circle cx="-1.5" cy="-4.6" r="4.0" fill="#FFFFFF"/>
    <circle cx="-1.5" cy="3.8" r="5.6" fill="#FFFFFF"/>
    <circle cx="6.8" cy="-5.2" r="1.3" fill="#FFFFFF" opacity="0.95"/>
    <circle cx="8.2" cy="0.5" r="1.3" fill="#FFFFFF" opacity="0.95"/>
    <circle cx="6.2" cy="6.2" r="1.3" fill="#FFFFFF" opacity="0.95"/>
    <circle cx="-8.8" cy="-1.5" r="1.2" fill="#FFFFFF" opacity="0.9"/>
  </g>`;
}

/**
 * Renders the composite weather SVG (`viewBox="0 0 48 34"`),
 * supporting `single`, `sometimes` (`┏ 時々`), and `later` (`|> のち`) in a refined dark aesthetic.
 */
export function renderBroadcastWeatherSvg(
  weatherCode?: string,
  weatherText?: string,
  width = 48,
  height = 34
): string {
  const desc = classifyJmaWeatherDescriptor(weatherCode, weatherText);
  const bg1 = BROADCAST_BG_COLOR[desc.primary];
  const bg2 = desc.secondary ? BROADCAST_BG_COLOR[desc.secondary] : bg1;

  if (desc.pattern === 'single' || !desc.secondary || desc.secondary === desc.primary) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 48 34" style="display:block;border-radius:2px;overflow:hidden;">
      <rect x="0" y="0" width="48" height="34" fill="${bg1}"/>
      ${renderWeatherSymbolGroup(desc.primary, 24, 17, 1.05)}
    </svg>`;
  }

  if (desc.pattern === 'later') {
    // [ |> のち ] Chevron split pointing right
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 48 34" style="display:block;border-radius:2px;overflow:hidden;">
      <rect x="0" y="0" width="48" height="34" fill="${bg2}"/>
      <polygon points="0,0 21.5,0 28,17 21.5,34 0,34" fill="${bg1}"/>
      <polyline points="21.5,0 28,17 21.5,34" fill="none" stroke="#CBD5E1" stroke-width="1.6" stroke-linejoin="round"/>
      ${renderWeatherSymbolGroup(desc.primary, 11.8, 17, 0.78)}
      ${renderWeatherSymbolGroup(desc.secondary, 37.8, 17, 0.78)}
    </svg>`;
  }

  // [ ┏ 時々 ] Bottom-right trapezoid corner split
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 48 34" style="display:block;border-radius:2px;overflow:hidden;">
    <rect x="0" y="0" width="48" height="34" fill="${bg1}"/>
    ${renderWeatherSymbolGroup(desc.primary, 14.2, 16.2, 0.88)}
    <polygon points="22.5,34 27.2,15.5 48,15.5 48,34" fill="${bg2}"/>
    <polyline points="22.5,34 27.2,15.5 48,15.5" fill="none" stroke="#CBD5E1" stroke-width="1.6" stroke-linejoin="round"/>
    ${renderWeatherSymbolGroup(desc.secondary, 37.8, 25.2, 0.6)}
  </svg>`;
}

const SINGLE_KIND_CODE: Record<WeatherBaseKind, string> = {
  sunny: '100',
  cloudy: '200',
  rain: '300',
  snow: '400',
};

/**
 * Generates 8 upcoming 3-hourly forecast slots (`03時, 06時, 09時, 12時, 15時, 18時, 21時, 24時`)
 * from a city's JMA weather code, weather text, 6-hour PoPs, and min/max temperatures.
 */
export function buildCity3HourlySlots(params: {
  weatherCode?: string;
  weatherText?: string;
  tempMin: number;
  tempMax: number;
  pops: [number, number, number, number];
}): Forecast3HourlySlot[] {
  const { weatherCode, weatherText, tempMin, tempMax, pops } = params;
  const desc = classifyJmaWeatherDescriptor(weatherCode, weatherText);
  const rawText = String(weatherText || '');

  // Determine transition hour for 'later' (`のち`)
  let transitionHour = 15;
  if (rawText.includes('朝') || rawText.includes('昼前')) {
    transitionHour = 9;
  } else if (rawText.includes('昼過ぎ')) {
    transitionHour = 12;
  } else if (rawText.includes('夕方')) {
    transitionHour = 15;
  } else if (rawText.includes('夜のはじめ頃') || rawText.includes('夜')) {
    transitionHour = 18;
  } else if (rawText.includes('夜遅く')) {
    transitionHour = 21;
  }

  // Diurnal temperature interpolation factors (06:00 = min, 15:00 = max)
  const diurnalFactors: Record<number, number> = {
    3: 0.12,
    6: 0.0,
    9: 0.45,
    12: 0.85,
    15: 1.0,
    18: 0.65,
    21: 0.38,
    24: 0.2,
  };

  const hours = [3, 6, 9, 12, 15, 18, 21, 24];
  const span = Math.max(1, tempMax - tempMin);

  return hours.map((hour) => {
    const popIdx =
      hour <= 6 ? 0 : hour <= 12 ? 1 : hour <= 18 ? 2 : 3;
    const slotPop = pops[popIdx] ?? pops[0] ?? 10;

    let slotKind: WeatherBaseKind = desc.primary;
    if (desc.pattern === 'later' && desc.secondary) {
      slotKind = hour >= transitionHour ? desc.secondary : desc.primary;
    } else if (desc.pattern === 'sometimes' && desc.secondary) {
      if (rawText.includes('朝晩')) {
        slotKind = hour <= 6 || hour >= 21 ? desc.secondary : desc.primary;
      } else if (rawText.includes('夜')) {
        slotKind = hour >= 18 ? desc.secondary : desc.primary;
      } else if (slotPop >= 50) {
        slotKind = hour === 12 || hour === 15 ? desc.secondary : desc.primary;
      } else {
        slotKind = hour === 15 ? desc.secondary : desc.primary;
      }
    }

    const factor = diurnalFactors[hour] ?? 0.5;
    const temp = Math.round(tempMin + span * factor);

    return {
      timeLabel: `${String(hour).padStart(2, '0')}時`,
      hour,
      weatherCode: SINGLE_KIND_CODE[slotKind],
      weatherText: KIND_KANJI[slotKind],
      temp,
      pop: slotPop,
    };
  });
}

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

function formatJstDateStr(ms: number): string {
  const jst = new Date(ms + 9 * 3600 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateLabelJa(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const dayNum = Number(m[3]);
  const w = WEEKDAY_JA[dt.getUTCDay()] || '';
  return `${dayNum}日(${w})`;
}

/**
 * Parses JMA `bosai/forecast/data/forecast/{officeCode}.json` for a specific target city
 * (`areaCode` & `tempStationCode`), returning an enriched `CityForecastItem` with Today, Tomorrow,
 * Day-After-Tomorrow weather codes, temperatures, PoPs, and 3-hourly forecast slots.
 */
export function parseJmaCityForecastJson(
  rawJson: any,
  target: MajorForecastCityTarget,
  fallbackCity: CityForecastItem,
  nowMs: number = Date.now()
): CityForecastItem {
  if (!Array.isArray(rawJson) || rawJson.length === 0) {
    return fallbackCity;
  }

  const shortTerm = rawJson[0];
  const weekly = rawJson[1];

  const tsWeather = shortTerm?.timeSeries?.[0];
  const tsPop = shortTerm?.timeSeries?.[1];
  const tsTemp = shortTerm?.timeSeries?.[2];

  const tsWeeklyWeather = weekly?.timeSeries?.[0];
  const tsWeeklyTemp = weekly?.timeSeries?.[1];

  const todayStr = formatJstDateStr(nowMs);
  const tomorrowStr = formatJstDateStr(nowMs + 86400 * 1000);
  const dayAfterStr = formatJstDateStr(nowMs + 2 * 86400 * 1000);

  // Find matching sub-area in short-term weather timeSeries
  const findArea = (areas: any[] | undefined, code: string) => {
    if (!Array.isArray(areas) || areas.length === 0) return null;
    return (
      areas.find((a) => String(a?.area?.code || '') === code) || areas[0]
    );
  };

  const weatherArea0 = findArea(tsWeather?.areas, target.areaCode);
  const popArea0 = findArea(tsPop?.areas, target.areaCode);
  const tempArea0 = findArea(tsTemp?.areas, target.tempStationCode);

  const weeklyWeatherArea = findArea(tsWeeklyWeather?.areas, target.areaCode);
  const weeklyTempArea = findArea(tsWeeklyTemp?.areas, target.tempStationCode);

  // Map date `YYYY-MM-DD` -> { weatherCode, weatherText, pop }
  const dateWeatherMap = new Map<
    string,
    { weatherCode?: string; weatherText?: string; pop?: number }
  >();

  if (Array.isArray(tsWeeklyWeather?.timeDefines) && weeklyWeatherArea) {
    tsWeeklyWeather.timeDefines.forEach((td: string, idx: number) => {
      const dStr = String(td || '').slice(0, 10);
      if (!dStr) return;
      const wc = String(weeklyWeatherArea.weatherCodes?.[idx] || '').trim();
      const popRaw = Number(weeklyWeatherArea.pops?.[idx]);
      dateWeatherMap.set(dStr, {
        weatherCode: wc || undefined,
        weatherText: wc
          ? classifyJmaWeatherDescriptor(wc).shortLabel
          : undefined,
        pop: !Number.isNaN(popRaw) && weeklyWeatherArea.pops?.[idx] !== '' ? popRaw : undefined,
      });
    });
  }

  if (Array.isArray(tsWeather?.timeDefines) && weatherArea0) {
    tsWeather.timeDefines.forEach((td: string, idx: number) => {
      const dStr = String(td || '').slice(0, 10);
      if (!dStr) return;
      const wc = String(weatherArea0.weatherCodes?.[idx] || '').trim();
      const wt = String(weatherArea0.weathers?.[idx] || '')
        .replace(/　+/g, ' ')
        .trim();
      const prev = dateWeatherMap.get(dStr) || {};
      dateWeatherMap.set(dStr, {
        ...prev,
        weatherCode: wc || prev.weatherCode,
        weatherText: wt || (wc ? classifyJmaWeatherDescriptor(wc).shortLabel : prev.weatherText),
      });
    });
  }

  // Extract 6-hour PoPs
  const pops6h: [number, number, number, number] = [...fallbackCity.pops];
  const dateMaxPopMap = new Map<string, number>();
  if (Array.isArray(tsPop?.timeDefines) && popArea0 && Array.isArray(popArea0.pops)) {
    tsPop.timeDefines.forEach((td: string, idx: number) => {
      const val = Number(popArea0.pops[idx]);
      if (Number.isNaN(val)) return;
      if (idx < 4) {
        pops6h[idx] = val;
      }
      const dStr = String(td || '').slice(0, 10);
      if (dStr) {
        const cur = dateMaxPopMap.get(dStr) ?? 0;
        if (val > cur) dateMaxPopMap.set(dStr, val);
      }
    });
  }

  // Map date `YYYY-MM-DD` -> { min?: number, max?: number }
  const dateTempMap = new Map<string, { min?: number; max?: number }>();

  if (Array.isArray(tsWeeklyTemp?.timeDefines) && weeklyTempArea) {
    tsWeeklyTemp.timeDefines.forEach((td: string, idx: number) => {
      const dStr = String(td || '').slice(0, 10);
      if (!dStr) return;
      const minRaw = weeklyTempArea.tempsMin?.[idx];
      const maxRaw = weeklyTempArea.tempsMax?.[idx];
      const minVal = minRaw !== '' && minRaw !== undefined ? Number(minRaw) : undefined;
      const maxVal = maxRaw !== '' && maxRaw !== undefined ? Number(maxRaw) : undefined;
      dateTempMap.set(dStr, {
        min: minVal !== undefined && !Number.isNaN(minVal) ? minVal : undefined,
        max: maxVal !== undefined && !Number.isNaN(maxVal) ? maxVal : undefined,
      });
    });
  }

  if (Array.isArray(tsTemp?.timeDefines) && tempArea0 && Array.isArray(tempArea0.temps)) {
    tsTemp.timeDefines.forEach((td: string, idx: number) => {
      const rawStr = String(td || '');
      const dStr = rawStr.slice(0, 10);
      const tValStr = tempArea0.temps[idx];
      if (!dStr || tValStr === '' || tValStr === undefined) return;
      const tVal = Number(tValStr);
      if (Number.isNaN(tVal)) return;
      const cur = dateTempMap.get(dStr) || {};
      if (rawStr.includes('T00:00') || rawStr.includes('T06:00')) {
        cur.min = tVal;
      } else if (rawStr.includes('T09:00') || rawStr.includes('T12:00')) {
        cur.max = tVal;
      } else if (cur.min === undefined) {
        cur.min = tVal;
      } else {
        cur.max = tVal;
      }
      dateTempMap.set(dStr, cur);
    });
  }

  // Resolve Today, Tomorrow, Day-After-Tomorrow
  const todayW = dateWeatherMap.get(todayStr);
  const tomorrowW = dateWeatherMap.get(tomorrowStr);
  const dayAfterW = dateWeatherMap.get(dayAfterStr);

  const todayWeatherCode =
    todayW?.weatherCode ||
    String(weatherArea0?.weatherCodes?.[0] || fallbackCity.todayWeatherCode || '101');
  const tomorrowWeatherCode =
    tomorrowW?.weatherCode ||
    String(weatherArea0?.weatherCodes?.[1] || fallbackCity.tomorrowWeatherCode || '101');
  const dayAfterWeatherCode =
    dayAfterW?.weatherCode ||
    String(
      weatherArea0?.weatherCodes?.[2] ||
        weeklyWeatherArea?.weatherCodes?.[2] ||
        fallbackCity.dayAfterWeatherCode ||
        '101'
    );

  const todayWeather =
    todayW?.weatherText ||
    classifyJmaWeatherDescriptor(todayWeatherCode, fallbackCity.todayWeather).shortLabel;
  const tomorrowWeather =
    tomorrowW?.weatherText ||
    classifyJmaWeatherDescriptor(tomorrowWeatherCode, fallbackCity.tomorrowWeather).shortLabel;
  const dayAfterWeather =
    dayAfterW?.weatherText ||
    classifyJmaWeatherDescriptor(dayAfterWeatherCode, fallbackCity.dayAfterWeather).shortLabel;

  const todayT = dateTempMap.get(todayStr);
  const tomorrowT = dateTempMap.get(tomorrowStr);
  const dayAfterT = dateTempMap.get(dayAfterStr);

  const todayTempMax =
    todayT?.max ?? fallbackCity.todayTempMax ?? fallbackCity.tempMax;
  const todayTempMin =
    todayT?.min ??
    (todayT?.max !== undefined ? todayT.max - 6 : undefined) ??
    fallbackCity.todayTempMin ??
    fallbackCity.tempMin;

  const tomorrowTempMax =
    tomorrowT?.max ?? fallbackCity.tomorrowTempMax ?? todayTempMax;
  const tomorrowTempMin =
    tomorrowT?.min ?? fallbackCity.tomorrowTempMin ?? todayTempMin;

  const dayAfterTempMax =
    dayAfterT?.max ?? fallbackCity.dayAfterTempMax ?? tomorrowTempMax;
  const dayAfterTempMin =
    dayAfterT?.min ?? fallbackCity.dayAfterTempMin ?? tomorrowTempMin;

  const tomorrowPop =
    tomorrowW?.pop ??
    dateMaxPopMap.get(tomorrowStr) ??
    fallbackCity.tomorrowPop ??
    Math.max(...pops6h);
  const dayAfterPop =
    dayAfterW?.pop ??
    dateMaxPopMap.get(dayAfterStr) ??
    fallbackCity.dayAfterPop ??
    30;

  const hourly3h = buildCity3HourlySlots({
    weatherCode: todayWeatherCode,
    weatherText: todayWeather,
    tempMin: todayTempMin,
    tempMax: todayTempMax,
    pops: pops6h,
  });

  // Format reportDatetime
  let updatedAt = fallbackCity.updatedAt;
  if (typeof shortTerm?.reportDatetime === 'string') {
    const m = shortTerm.reportDatetime.match(/T(\d{2}:\d{2})/);
    if (m) updatedAt = `${m[1]} 発表`;
  }

  return {
    ...fallbackCity,
    todayWeather,
    tomorrowWeather,
    dayAfterWeather,
    todayWeatherCode,
    tomorrowWeatherCode,
    dayAfterWeatherCode,
    tempMin: todayTempMin,
    tempMax: todayTempMax,
    todayTempMin,
    todayTempMax,
    tomorrowTempMin,
    tomorrowTempMax,
    dayAfterTempMin,
    dayAfterTempMax,
    todayDateLabel: formatDateLabelJa(todayStr),
    tomorrowDateLabel: formatDateLabelJa(tomorrowStr),
    dayAfterDateLabel: formatDateLabelJa(dayAfterStr),
    pops: pops6h,
    tomorrowPop,
    dayAfterPop,
    hourly3h,
    updatedAt,
    office: String(shortTerm?.publishingOffice || fallbackCity.office),
  };
}






