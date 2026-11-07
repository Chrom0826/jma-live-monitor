import {
  EewForecastArea,
  EewReport,
  TsunamiForecastArea,
  TsunamiForecastReport,
  TsunamiGrade,
} from '../types/jma';
import { formatSeismicScale, parseJmaIsoCoordinate } from './jmaParser';

/**
 * P2P地震情報 API v2 で利用する情報コード
 * (仕様: https://github.com/p2pquake/epsp-specifications/blob/master/json-api-v2.yaml)
 */
export const P2P_CODES = {
  /** 地震情報（震度速報・震源情報・各地の震度） */
  JMA_QUAKE: 551,
  /** 津波予報（大津波警報・津波警報・津波注意報） */
  JMA_TSUNAMI: 552,
  /** 緊急地震速報 発表検出（NHKチャイム検出。内容なし） */
  EEW_DETECTION: 554,
  /** 緊急地震速報（警報）本文（第n報ごとにプッシュ配信） */
  EEW: 556,
} as const;

/** P2P地震情報 issue.type → 日本語ラベル */
export const P2P_QUAKE_ISSUE_TYPE_LABELS: Record<string, string> = {
  ScalePrompt: '震度速報',
  Destination: '震源に関する情報',
  ScaleAndDestination: '震源・震度に関する情報',
  DetailScale: '各地の震度に関する情報',
  Foreign: '遠地地震に関する情報',
  Other: 'その他の情報',
};

/**
 * Parses P2P / JMA style JST datetime strings (`"2026/11/06 19:56:15"`, `"2026/11/06 17:06:16.583"`,
 * or ISO `"2026-11-06T19:53:00+09:00"`) into epoch milliseconds.
 */
export function parseJstDateTimeMs(str: string | null | undefined): number {
  if (!str) return Number.NaN;
  const s = String(str).trim();
  if (s.includes('T')) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? Number.NaN : t;
  }
  const m =
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?/.exec(
      s
    );
  if (!m) return Number.NaN;
  const [, y, mo, d, h, mi, se, ms] = m;
  const utc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h) - 9,
    Number(mi),
    Number(se || 0),
    Number((ms || '0').padEnd(3, '0').slice(0, 3))
  );
  return utc;
}

/** Formats a JST datetime string into `HH:mm:ss` (falls back to the original text). */
export function formatJstHms(str: string | null | undefined): string {
  const ms = parseJstDateTimeMs(str);
  if (Number.isNaN(ms)) return String(str || '');
  const jst = new Date(ms + 9 * 3600 * 1000);
  const hh = String(jst.getUTCHours()).padStart(2, '0');
  const mm = String(jst.getUTCMinutes()).padStart(2, '0');
  const ss = String(jst.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/** Formats a seismic scale code into a Japanese label (e.g. 45 -> '5弱', 50 -> '5強'). */
export function formatSeismicScaleJa(scaleCode: number): string {
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
      return '5弱';
    case 50:
      return '5強';
    case 55:
      return '6弱';
    case 60:
      return '6強';
    case 70:
      return '7';
    default:
      return formatSeismicScale(scaleCode);
  }
}

/**
 * Formats EEW predicted intensity range (`scaleFrom` / `scaleTo`) into a Japanese label:
 * - `45 / 45` -> `"5弱"`
 * - `40 / 45` -> `"4～5弱"`
 * - `50 / 99` -> `"5強以上"` (99 = ～程度以上)
 * - `-1` -> `"不明"`
 */
export function formatEewScaleRange(scaleFrom: number, scaleTo: number): string {
  const from = Math.trunc(Number(scaleFrom));
  const to = Math.trunc(Number(scaleTo));
  if (Number.isNaN(from) || from < 0) return '不明';
  const fromLabel = formatSeismicScaleJa(from);
  if (to === 99) return `${fromLabel}以上`;
  if (Number.isNaN(to) || to < 0 || to === from) return fromLabel;
  return `${fromLabel}～${formatSeismicScaleJa(to)}`;
}

/** Representative (upper-bound) intensity code for coloring / sorting an EEW area. */
export function getEewAreaRepresentativeScale(area: EewForecastArea): number {
  const from = Math.trunc(area.scaleFrom);
  const to = Math.trunc(area.scaleTo);
  if (to === 99 || to < 0) return from;
  return Math.max(from, to);
}

/**
 * Parses a P2P地震情報 code 556 (緊急地震速報（警報）) item into a normalized `EewReport` (第n報).
 * Returns `null` for invalid payloads.
 */
export function parseP2PEew(
  item: Record<string, any>,
  receivedAtMs: number = Date.now()
): EewReport | null {
  if (!item || Number(item.code) !== P2P_CODES.EEW) return null;
  const issue = item.issue || {};
  const eventId = String(issue.eventId || '');
  if (!eventId) return null;

  const serialNum = Number.parseInt(String(issue.serial ?? '1'), 10);
  const serial = Number.isNaN(serialNum) ? 1 : serialNum;
  const isCancelled = Boolean(item.cancelled);
  const eq = item.earthquake || {};
  const hypo = eq.hypocenter || {};

  const rawLat = Number(hypo.latitude);
  const rawLon = Number(hypo.longitude);
  const hasHypo = !Number.isNaN(rawLat) && rawLat > -100 && !Number.isNaN(rawLon);
  const rawDepth = Number(hypo.depth);
  const rawMag = Number(hypo.magnitude);

  const areas: EewForecastArea[] = (Array.isArray(item.areas) ? item.areas : [])
    .map((a: any) => ({
      pref: String(a?.pref || ''),
      name: String(a?.name || ''),
      scaleFrom: Math.trunc(Number(a?.scaleFrom ?? -1)),
      scaleTo: Math.trunc(Number(a?.scaleTo ?? -1)),
      kindCode: String(a?.kindCode ?? ''),
      arrivalTime: a?.arrivalTime ? String(a.arrivalTime) : null,
    }))
    .filter((a: EewForecastArea) => a.name)
    .sort(
      (a: EewForecastArea, b: EewForecastArea) =>
        getEewAreaRepresentativeScale(b) - getEewAreaRepresentativeScale(a) ||
        parseJstDateTimeMs(a.arrivalTime) - parseJstDateTimeMs(b.arrivalTime)
    );

  const maxScaleCode = areas.reduce(
    (max, a) => Math.max(max, getEewAreaRepresentativeScale(a)),
    -1
  );
  const maxHasUpper = areas.some(
    (a) => a.scaleTo === 99 && getEewAreaRepresentativeScale(a) === maxScaleCode
  );

  return {
    id: String(item.id || `${eventId}-${serial}`),
    eventId,
    serial,
    issueTime: String(issue.time || ''),
    originTime: String(eq.originTime || ''),
    hypocenterName: String(hypo.name || (isCancelled ? '' : '震源調査中')),
    lat: hasHypo ? rawLat : Number.NaN,
    lon: hasHypo ? rawLon : Number.NaN,
    depthKm: !Number.isNaN(rawDepth) && rawDepth >= 0 ? Math.trunc(rawDepth) : -1,
    magnitude: !Number.isNaN(rawMag) && rawMag >= 0 ? Number(rawMag.toFixed(1)) : -1,
    isCancelled,
    isTest: Boolean(item.test),
    isAssumedHypocenter: String(eq.condition || '') === '仮定震源要素',
    maxScaleCode,
    maxScaleLabel:
      maxScaleCode < 0
        ? '不明'
        : `${formatSeismicScaleJa(maxScaleCode)}${maxHasUpper ? '以上' : ''}`,
    areas,
    receivedAtMs,
    isWarning: true,
    source: 'p2p',
  };
}

// ===================== Wolfx 緊急地震速報（予報・警報） =====================

/** Wolfx の震度文字列（"3", "5弱", "5-", "6強", "7", "不明"）→ 10倍値の震度コード。不明は -1 */
export function parseWolfxShindo(raw: unknown): number {
  const s = String(raw ?? '')
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/^震度/, '');
  const m = /^([0-7])\s*(弱|強|-|\+|－|＋)?/.exec(s);
  if (!m) return -1;
  const n = Number(m[1]);
  const mod = m[2];
  if (n === 5 || n === 6) {
    const strong = mod === '強' || mod === '+' || mod === '＋';
    return n === 5 ? (strong ? 50 : 45) : strong ? 60 : 55;
  }
  return n === 0 ? 0 : n * 10;
}

/**
 * Parses a Wolfx `jma_eew` message (https://wolfx.jp/apidoc) into an `EewReport`.
 * Unlike P2P (code 556 = 警報 only), Wolfx delivers every 緊急地震速報 including 予報.
 * Returns `null` for heartbeat / pong / invalid payloads and 訓練報.
 */
export function parseWolfxEew(
  item: Record<string, any>,
  receivedAtMs: number = Date.now()
): EewReport | null {
  if (!item || typeof item !== 'object') return null;
  if (item.type !== undefined && item.type !== 'jma_eew') return null;
  const eventId = String(item.EventID ?? '').trim();
  if (!eventId) return null;
  if (item.isTraining === true) return null;

  const serialNum = Number.parseInt(String(item.Serial ?? '1'), 10);
  const serial = Number.isNaN(serialNum) ? 1 : serialNum;
  const isCancelled = item.isCancel === true;

  const rawLat = Number(item.Latitude);
  const rawLon = Number(item.Longitude);
  const hasHypo =
    Number.isFinite(rawLat) &&
    Number.isFinite(rawLon) &&
    !(rawLat === 0 && rawLon === 0) &&
    Math.abs(rawLat) <= 90;
  const rawDepth = Number(item.Depth);
  const rawMag = Number(item.Magnitude ?? item.Magunitude);

  const areas: EewForecastArea[] = (Array.isArray(item.WarnArea) ? item.WarnArea : [])
    .map((a: any) => {
      const name = String(a?.Chiiki || '');
      const max = parseWolfxShindo(a?.Shindo1);
      const min = parseWolfxShindo(a?.Shindo2);
      const pref = /^(.+?[都道府県])/.exec(name)?.[1] || '';
      const arrived = a?.Arrive === true || a?.Arrive === 'true';
      return {
        pref,
        name,
        scaleFrom: min >= 0 ? min : max,
        scaleTo: max >= 0 && max !== min ? max : min >= 0 ? min : max,
        kindCode: arrived ? '11' : '10',
        arrivalTime: null,
      } as EewForecastArea;
    })
    .filter((a: EewForecastArea) => a.name)
    .sort(
      (a: EewForecastArea, b: EewForecastArea) =>
        getEewAreaRepresentativeScale(b) - getEewAreaRepresentativeScale(a)
    );

  const headMax = parseWolfxShindo(item.MaxIntensity);
  const areaMax = areas.reduce((m, a) => Math.max(m, getEewAreaRepresentativeScale(a)), -1);
  const maxScaleCode = Math.max(headMax, areaMax);
  const isWarning = item.isWarn === true || /警報/.test(String(item.Title || ''));

  return {
    id: `wolfx-${eventId}-${serial}${isCancelled ? '-c' : ''}`,
    eventId,
    serial,
    issueTime: String(item.AnnouncedTime || ''),
    originTime: String(item.OriginTime || ''),
    hypocenterName: String(item.Hypocenter || (isCancelled ? '' : '震源調査中')),
    lat: hasHypo ? rawLat : Number.NaN,
    lon: hasHypo ? rawLon : Number.NaN,
    depthKm: Number.isFinite(rawDepth) && rawDepth >= 0 ? Math.trunc(rawDepth) : -1,
    magnitude: Number.isFinite(rawMag) && rawMag > 0 ? Number(rawMag.toFixed(1)) : -1,
    isCancelled,
    isTest: false,
    isAssumedHypocenter: item.isAssumption === true,
    maxScaleCode,
    maxScaleLabel: maxScaleCode < 0 ? '不明' : formatSeismicScaleJa(maxScaleCode),
    areas,
    receivedAtMs,
    isWarning,
    isFinal: item.isFinal === true,
    source: 'wolfx',
  };
}

/** 警報を含むか（未指定は警報扱い: P2P 556 / デモ） */
export function isEewWarning(eew: EewReport | null | undefined): boolean {
  return Boolean(eew) && eew!.isWarning !== false;
}

/** 最終報か（Wolfx は isFinal、それ以外は従来どおり第5報以降を最終報扱い） */
export function isEewFinal(eew: EewReport | null | undefined): boolean {
  if (!eew) return false;
  return eew.isFinal ?? eew.serial >= 5;
}

/**
 * Merges an incoming EEW (P2P 警報 or Wolfx 予報/警報) into the currently displayed one.
 * - Different event: the incoming report wins.
 * - Same event, older serial: ignored (out-of-order / duplicate delivery from the other feed).
 * - Same event: once a 警報 was issued the event stays 警報; area lists (with P2P arrival
 *   times) are kept when the newer report carries none (Wolfx 予報 has no WarnArea).
 * Returns `prev` itself when nothing changed so React can bail out.
 */
export function mergeEew(prev: EewReport | null | undefined, next: EewReport): EewReport {
  if (!prev || prev.eventId !== next.eventId) return next;
  if (next.serial < prev.serial && !next.isCancelled) return prev;
  if (next.serial === prev.serial && !next.isCancelled && prev.isCancelled) return prev;

  const isWarning = isEewWarning(prev) || isEewWarning(next);
  let areas = next.areas;
  if (next.serial === prev.serial) {
    // same report from both feeds: keep the richer area list (P2P has arrival times)
    const prevTimed = prev.areas.some((a) => a.arrivalTime);
    const nextTimed = next.areas.some((a) => a.arrivalTime);
    if ((prevTimed && !nextTimed) || (next.areas.length === 0 && prev.areas.length > 0)) {
      areas = prev.areas;
    }
  } else if (next.areas.length === 0 && prev.areas.length > 0 && !next.isCancelled && isWarning) {
    areas = prev.areas;
  }
  const merged: EewReport = {
    ...next,
    areas,
    isWarning,
    isFinal: next.isFinal ?? prev.isFinal,
    maxScaleCode: Math.max(next.maxScaleCode, areas === next.areas ? -1 : prev.maxScaleCode),
    receivedAtMs: next.serial === prev.serial ? prev.receivedAtMs : next.receivedAtMs,
  };
  if (merged.maxScaleCode !== next.maxScaleCode) merged.maxScaleLabel = prev.maxScaleLabel;
  if (
    next.serial === prev.serial &&
    merged.isWarning === isEewWarning(prev) &&
    merged.areas === prev.areas &&
    merged.isFinal === prev.isFinal &&
    merged.isCancelled === prev.isCancelled
  ) {
    return prev;
  }
  return merged;
}

/**
 * Determines whether an incoming EEW report should replace the currently displayed one:
 * - New event (different `eventId`) always replaces.
 * - Same event: replace only when `serial` is newer or equal (handles WebSocket duplicates / out-of-order delivery),
 *   or when the incoming report is a cancellation.
 */
export function shouldReplaceEew(
  prev: EewReport | null | undefined,
  next: EewReport
): boolean {
  if (!prev) return true;
  if (prev.eventId !== next.eventId) return true;
  if (next.isCancelled) return true;
  return next.serial >= prev.serial;
}

/**
 * Seconds until the principal motion (主要動) reaches the area.
 * Returns `null` when no arrival time (PLUM法 / already arrived).
 */
export function getEewArrivalCountdownSec(
  arrivalTime: string | null | undefined,
  nowMs: number = Date.now()
): number | null {
  const t = parseJstDateTimeMs(arrivalTime);
  if (Number.isNaN(t)) return null;
  return Math.round((t - nowMs) / 1000);
}

/** Japanese status label for an EEW area's arrival (`あと12秒` / `到達と予測` / `PLUM法`). */
export function formatEewArrivalLabel(
  area: EewForecastArea,
  nowMs: number = Date.now()
): string {
  if (area.kindCode === '11') return '既に到達と予測';
  if (area.kindCode === '19') return '到達予想なし(PLUM法)';
  const sec = getEewArrivalCountdownSec(area.arrivalTime, nowMs);
  if (sec === null) return area.kindCode === '10' ? '未到達と予測' : '到達時刻不明';
  if (sec <= 0) return '到達と予測';
  return `あと${sec}秒`;
}

/**
 * Computes horizontal radii (km) of P-wave and S-wave fronts on the surface since `originTime`.
 * Uses simple homogeneous velocities (P: 6.0 km/s, S: 3.5 km/s) and hypocentral depth.
 */
export function computeEewWaveRadiiKm(
  originTime: string,
  depthKm: number,
  nowMs: number = Date.now()
): { pKm: number; sKm: number; elapsedSec: number } {
  const t0 = parseJstDateTimeMs(originTime);
  if (Number.isNaN(t0)) return { pKm: 0, sKm: 0, elapsedSec: 0 };
  const elapsedSec = Math.max(0, (nowMs - t0) / 1000);
  const depth = Math.max(0, depthKm);
  const horizontal = (dist: number) =>
    dist > depth ? Math.sqrt(dist * dist - depth * depth) : 0;
  return {
    pKm: horizontal(6.0 * elapsedSec),
    sKm: horizontal(3.5 * elapsedSec),
    elapsedSec,
  };
}

/** EEW display remains active for this long after the last received serial. */
export const EEW_DISPLAY_HOLD_MS = 3 * 60 * 1000;

export function isEewStillActive(
  eew: EewReport | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!eew) return false;
  const hold = eew.isCancelled ? 15 * 1000 : EEW_DISPLAY_HOLD_MS;
  return nowMs - eew.receivedAtMs < hold;
}

// ===================== 津波予報 =====================

/**
 * 気象庁 津波予報区コード（`bosai/common/const/geojson/tsunami.json` の properties.code）→ 名称
 */
export const TSUNAMI_AREA_CODES: Record<string, string> = {
  '100': '北海道太平洋沿岸東部',
  '101': '北海道太平洋沿岸中部',
  '102': '北海道太平洋沿岸西部',
  '110': '北海道日本海沿岸北部',
  '111': '北海道日本海沿岸南部',
  '120': 'オホーツク海沿岸',
  '200': '青森県日本海沿岸',
  '201': '青森県太平洋沿岸',
  '202': '陸奥湾',
  '210': '岩手県',
  '220': '宮城県',
  '230': '秋田県',
  '240': '山形県',
  '250': '福島県',
  '300': '茨城県',
  '310': '千葉県九十九里・外房',
  '311': '千葉県内房',
  '312': '東京湾内湾',
  '320': '伊豆諸島',
  '321': '小笠原諸島',
  '330': '相模湾・三浦半島',
  '340': '新潟県上中下越',
  '341': '佐渡',
  '350': '富山県',
  '360': '石川県能登',
  '361': '石川県加賀',
  '370': '福井県',
  '380': '静岡県',
  '390': '愛知県外海',
  '391': '伊勢・三河湾',
  '400': '三重県南部',
  '500': '京都府',
  '510': '大阪府',
  '520': '兵庫県北部',
  '521': '兵庫県瀬戸内海沿岸',
  '522': '淡路島南部',
  '530': '和歌山県',
  '540': '鳥取県',
  '550': '島根県出雲・石見',
  '551': '隠岐',
  '560': '岡山県',
  '570': '広島県',
  '580': '徳島県',
  '590': '香川県',
  '600': '愛媛県宇和海沿岸',
  '601': '愛媛県瀬戸内海沿岸',
  '610': '高知県',
  '700': '山口県日本海沿岸',
  '701': '山口県瀬戸内海沿岸',
  '710': '福岡県瀬戸内海沿岸',
  '711': '福岡県日本海沿岸',
  '712': '有明・八代海',
  '720': '佐賀県北部',
  '730': '長崎県西方',
  '731': '壱岐・対馬',
  '740': '熊本県天草灘沿岸',
  '750': '大分県瀬戸内海沿岸',
  '751': '大分県豊後水道沿岸',
  '760': '宮崎県',
  '770': '鹿児島県東部',
  '771': '種子島・屋久島地方',
  '772': '奄美群島・トカラ列島',
  '773': '鹿児島県西部',
  '800': '沖縄本島地方',
  '801': '大東島地方',
  '802': '宮古島・八重山地方',
};

const TSUNAMI_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(TSUNAMI_AREA_CODES).map(([code, name]) => [name, code])
);

export function getTsunamiAreaCode(name: string): string | undefined {
  return TSUNAMI_NAME_TO_CODE[String(name || '').trim()];
}

export const TSUNAMI_GRADE_RANK: Record<TsunamiGrade, number> = {
  MajorWarning: 4,
  Warning: 3,
  Watch: 2,
  Forecast: 1,
  Unknown: 0,
};

export function getTsunamiGradeStyle(grade: TsunamiGrade): {
  label: string;
  shortLabel: string;
  hex: string;
  textHex: string;
} {
  switch (grade) {
    case 'MajorWarning':
      return { label: '大津波警報', shortLabel: '大津波警報', hex: '#C026D3', textHex: '#FFFFFF' };
    case 'Warning':
      return { label: '津波警報', shortLabel: '津波警報', hex: '#EF4444', textHex: '#FFFFFF' };
    case 'Watch':
      return { label: '津波注意報', shortLabel: '津波注意報', hex: '#FACC15', textHex: '#111827' };
    case 'Forecast':
      return {
        label: '津波予報（若干の海面変動）',
        shortLabel: '津波予報',
        hex: '#38BDF8',
        textHex: '#0B1220',
      };
    default:
      return { label: '津波情報', shortLabel: '不明', hex: '#94A3B8', textHex: '#0B1220' };
  }
}

function sortTsunamiAreas(areas: TsunamiForecastArea[]): TsunamiForecastArea[] {
  return [...areas].sort(
    (a, b) =>
      TSUNAMI_GRADE_RANK[b.grade] - TSUNAMI_GRADE_RANK[a.grade] ||
      Number(a.code || 999) - Number(b.code || 999)
  );
}

/** Parses P2P地震情報 code 552 (津波予報) into `TsunamiForecastReport`. */
export function parseP2PTsunami(item: Record<string, any>): TsunamiForecastReport | null {
  if (!item || Number(item.code) !== P2P_CODES.JMA_TSUNAMI) return null;
  const cancelled = Boolean(item.cancelled);
  const areas: TsunamiForecastArea[] = (Array.isArray(item.areas) ? item.areas : []).map(
    (a: any) => {
      const gradeRaw = String(a?.grade || 'Unknown');
      const grade: TsunamiGrade =
        gradeRaw === 'MajorWarning' || gradeRaw === 'Warning' || gradeRaw === 'Watch'
          ? gradeRaw
          : 'Unknown';
      const fh = a?.firstHeight || {};
      const mh = a?.maxHeight || {};
      const arrival = fh.arrivalTime ? String(fh.arrivalTime) : undefined;
      const name = String(a?.name || '');
      return {
        code: getTsunamiAreaCode(name),
        name,
        grade,
        immediate: Boolean(a?.immediate),
        firstHeightText: fh.condition
          ? String(fh.condition)
          : arrival
            ? `${formatJstHms(arrival).slice(0, 5)} 到達予想`
            : a?.immediate
              ? 'ただちに津波来襲と予測'
              : '-',
        arrivalTime: arrival,
        maxHeightText: mh.description
          ? String(mh.description)
          : typeof mh.value === 'number'
            ? `${mh.value}m`
            : '-',
        maxHeightValue: typeof mh.value === 'number' ? mh.value : undefined,
      };
    }
  );
  return {
    id: String(item.id || `p2p-tsunami-${item.issue?.time || ''}`),
    issueTime: String(item.issue?.time || ''),
    cancelled,
    source: 'p2p',
    areas: sortTsunamiAreas(areas),
  };
}

function normalizeJmaTsunamiHeight(raw: unknown): { text: string; value?: number } {
  const s = String(raw ?? '').trim();
  if (!s) return { text: '-' };
  if (s === '<0.2' || s.includes('0.2未満')) return { text: '0.2m未満', value: 0.2 };
  if (s.startsWith('>')) {
    const v = Number(s.slice(1));
    return { text: `${v}m超`, value: Number.isNaN(v) ? undefined : v };
  }
  const v = Number(s);
  if (!Number.isNaN(v)) return { text: `${v}m`, value: v };
  return { text: s };
}

function jmaKindNameToGrade(name: string): TsunamiGrade {
  if (name.includes('大津波警報')) return 'MajorWarning';
  if (name.includes('津波警報')) return 'Warning';
  if (name.includes('津波注意報')) return 'Watch';
  if (name.includes('津波予報')) return 'Forecast';
  return 'Unknown';
}

/**
 * Parses JMA bosai `tsunami/data/{json}` detail (津波警報・注意報・予報) into `TsunamiForecastReport`.
 * Areas whose kind is "津波なし" / "警報解除" are excluded.
 */
export function parseJmaTsunamiDetail(
  detail: Record<string, any>
): TsunamiForecastReport | null {
  if (!detail || typeof detail !== 'object') return null;
  const head = detail.Head || {};
  const body = detail.Body || {};
  const infoType = String(head.InfoType || '');
  const rawItems = body.Tsunami?.Forecast?.Item;
  const items: any[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  const areas: TsunamiForecastArea[] = [];
  for (const it of items) {
    const kindName = String(it?.Category?.Kind?.Name || '');
    const grade = jmaKindNameToGrade(kindName);
    if (grade === 'Unknown') continue;
    const fh = it?.FirstHeight || {};
    const arrival = fh.ArrivalTime ? String(fh.ArrivalTime) : undefined;
    const height = normalizeJmaTsunamiHeight(
      it?.MaxHeight?.TsunamiHeight ?? it?.MaxHeight?.Condition
    );
    const code = String(it?.Area?.Code || '');
    areas.push({
      code: code || getTsunamiAreaCode(String(it?.Area?.Name || '')),
      name: String(it?.Area?.Name || TSUNAMI_AREA_CODES[code] || ''),
      grade,
      immediate: String(fh.Condition || '').includes('ただちに'),
      firstHeightText: fh.Condition
        ? String(fh.Condition)
        : arrival
          ? `${formatJstHms(arrival).slice(0, 5)} 到達予想`
          : '-',
      arrivalTime: arrival,
      maxHeightText: height.text,
      maxHeightValue: height.value,
    });
  }

  const eq = Array.isArray(body.Earthquake) ? body.Earthquake[0] : body.Earthquake;
  const coord = String(eq?.Hypocenter?.Area?.Coordinate || '');
  const parsedCoord = parseJmaIsoCoordinate(coord);
  const cm = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(coord);
  const mag = Number(eq?.Magnitude);
  const originTime = eq?.OriginTime ? String(eq.OriginTime) : undefined;
  const maxInt = eq?.MaxInt ? String(eq.MaxInt) : undefined;

  return {
    id: `jma-tsunami-${head.EventID || ''}-${head.ReportDateTime || ''}`,
    issueTime: String(head.ReportDateTime || ''),
    validUntil: head.ValidDateTime ? String(head.ValidDateTime) : undefined,
    cancelled: infoType === '取消' || areas.length === 0,
    source: 'jma',
    hypocenterName: eq?.Hypocenter?.Area?.Name
      ? String(eq.Hypocenter.Area.Name)
      : undefined,
    magnitude: Number.isNaN(mag) ? undefined : mag,
    lat: parsedCoord?.lat ?? (cm ? Number(cm[1]) : undefined),
    lon: parsedCoord?.lon ?? (cm ? Number(cm[2]) : undefined),
    depthKm: parsedCoord?.depthKm,
    occurrenceTime: originTime,
    maxScaleLabel: maxInt,
    headline: head.Headline?.Text ? String(head.Headline.Text) : undefined,
    areas: sortTsunamiAreas(areas),
  };
}

/**
 * Formats a JST / ISO occurrence time string into a clean Japanese disaster label:
 * Example: "2026/11/06 19:39:00" -> "11月06日 19時39分頃"
 */
export function formatOccurrenceTimeJa(str: string | null | undefined): string {
  if (!str) return '-';
  const ms = parseJstDateTimeMs(str);
  if (!Number.isNaN(ms)) {
    const jst = new Date(ms + 9 * 3600 * 1000);
    const mo = String(jst.getUTCMonth() + 1).padStart(2, '0');
    const d = String(jst.getUTCDate()).padStart(2, '0');
    const h = String(jst.getUTCHours()).padStart(2, '0');
    const m = String(jst.getUTCMinutes()).padStart(2, '0');
    return `${mo}月${d}日 ${h}時${m}分頃`;
  }
  return str.endsWith('頃') ? str : `${str}頃`;
}

/** Returns background and text color style for seismic intensity badge */
export function getSeismicScaleBadgeStyle(scaleLabel: string): { bg: string; text: string } {
  if (scaleLabel.includes('7')) return { bg: '#800080', text: '#FFFFFF' };
  if (scaleLabel.includes('6強')) return { bg: '#A50021', text: '#FFFFFF' };
  if (scaleLabel.includes('6弱')) return { bg: '#E60000', text: '#FFFFFF' };
  if (scaleLabel.includes('5強')) return { bg: '#FF5A00', text: '#FFFFFF' };
  if (scaleLabel.includes('5弱')) return { bg: '#FF9900', text: '#FFFFFF' };
  if (scaleLabel.includes('4')) return { bg: '#FACC15', text: '#111827' };
  if (scaleLabel.includes('3')) return { bg: '#38BDF8', text: '#0B1220' };
  if (scaleLabel.includes('2')) return { bg: '#22C55E', text: '#0B1220' };
  if (scaleLabel.includes('1')) return { bg: '#94A3B8', text: '#0B1220' };
  return { bg: '#475569', text: '#FFFFFF' };
}

/**
 * Returns true when a tsunami forecast is currently in effect:
 * not cancelled, has at least one area, and (if provided) `validUntil` is in the future.
 * P2P reports without `validUntil` are treated as active for 24h after issue.
 */
export function isTsunamiForecastActive(
  report: TsunamiForecastReport | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!report || report.cancelled || report.areas.length === 0) return false;
  if (report.source === 'demo') return true;
  if (report.validUntil) {
    const until = parseJstDateTimeMs(report.validUntil);
    if (!Number.isNaN(until)) return nowMs < until;
  }
  const issued = parseJstDateTimeMs(report.issueTime);
  if (Number.isNaN(issued)) return true;
  return nowMs - issued < 24 * 3600 * 1000;
}

/** Highest tsunami grade among areas (for headline / color). */
export function getTsunamiHighestGrade(report: TsunamiForecastReport): TsunamiGrade {
  return report.areas.reduce<TsunamiGrade>(
    (best, a) => (TSUNAMI_GRADE_RANK[a.grade] > TSUNAMI_GRADE_RANK[best] ? a.grade : best),
    'Unknown'
  );
}

export type TsunamiAlertSeverity = 'none' | 'forecast' | 'warning_or_above';

/**
 * Evaluates the severity of the currently active tsunami forecast:
 * - 'warning_or_above': MajorWarning (大津波警報), Warning (津波警報), or Watch (津波注意報) is active.
 *   The monitor LOCKS ONTO the tsunami tab continuously until cancelled.
 * - 'forecast': Only Forecast (津波予報 / 若干の海面変動) is active.
 *   The monitor includes the tsunami scene in the normal loop, and advances to rain radar ('radar') after hold.
 * - 'none': No active tsunami forecast. The tsunami scene is not in the automatic loop.
 */
export function getTsunamiAlertSeverity(
  report: TsunamiForecastReport | null | undefined,
  nowMs: number = Date.now()
): TsunamiAlertSeverity {
  if (!isTsunamiForecastActive(report, nowMs)) return 'none';
  if (!report || !Array.isArray(report.areas) || report.areas.length === 0) return 'none';

  const hasWarningOrAbove = report.areas.some(
    (a) => a.grade === 'MajorWarning' || a.grade === 'Warning' || a.grade === 'Watch'
  );
  if (hasWarningOrAbove) return 'warning_or_above';

  const hasForecast = report.areas.some((a) => a.grade === 'Forecast');
  if (hasForecast) return 'forecast';

  return 'none';
}
