import {
  EarthquakeReport,
  EewForecastArea,
  EewReport,
  TsunamiForecastArea,
  TsunamiForecastReport,
  TsunamiGrade,
} from '../types/jma';
import { formatSeismicScale, parseJmaIsoCoordinate } from './jmaParser';
import { JMA_SUBDIVISION_AREAS } from '../data/jmaSubdivisions';
import { solveJma2001EpicentralRadiiKm } from './jma2001TravelTime';

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
  let from = Math.trunc(Number(scaleFrom));
  let to = Math.trunc(Number(scaleTo));
  if (from > to && to > 0 && to !== 99) {
    const tmp = from;
    from = to;
    to = tmp;
  }
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
  if (item.isTraining === true) return null;

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
    .map((a: any) => {
      const scaleFrom = Math.trunc(Number(a?.scaleFrom ?? -1));
      const scaleTo = Math.trunc(Number(a?.scaleTo ?? -1));
      const lpgmClass = parseLpgmClassValue(
        a?.lpgmClass ?? a?.Lpgm ?? a?.lpgm ?? a?.LgInt ?? a?.lgInt ?? a?.LgIntensity ?? a?.lgIntensity
      );
      return {
        pref: String(a?.pref || ''),
        name: String(a?.name || ''),
        scaleFrom,
        scaleTo,
        kindCode: String(a?.kindCode ?? ''),
        arrivalTime: a?.arrivalTime ? String(a.arrivalTime) : null,
        lpgmClass,
      };
    })
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

  const topLpgmClass = parseLpgmClassValue(
    eq?.maxLgInt ?? item?.maxLgInt ?? issue?.maxLgInt ?? item?.maxLpgmClass ?? item?.MaxLgIntensity
  );
  const areaMaxLpgmClass = areas.reduce<0 | 1 | 2 | 3 | 4>(
    (max, a) => (typeof a.lpgmClass === 'number' && a.lpgmClass > max ? a.lpgmClass : max),
    0
  );
  const maxLpgmClass = (Math.max(topLpgmClass, areaMaxLpgmClass) as 0 | 1 | 2 | 3 | 4);
  const maxLpgmLabel = maxLpgmClass >= 1 ? `階級${maxLpgmClass}` : undefined;

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
    isWarning: true,
    isFinal: false,
    isAssumedHypocenter: String(eq.condition || '') === '仮定震源要素',
    maxScaleCode,
    maxScaleLabel:
      maxScaleCode < 0
        ? '不明'
        : `${formatSeismicScaleJa(maxScaleCode)}${maxHasUpper ? '以上' : ''}`,
    maxLpgmClass,
    maxLpgmLabel,
    areas,
    receivedAtMs,
    source: 'p2p',
  };
}

/**
 * Maps a Japanese/JMA intensity string (e.g. "3", "5弱", "5-", "6強", "不明") to P2P numeric scaleCode.
 */
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

function parseEewIntensityStringToCode(raw: unknown): {
  scaleCode: number;
  scaleLabel: string;
} {
  const s = String(raw ?? '').trim().replace(/^震度/, '');
  switch (s) {
    case '7':
      return { scaleCode: 70, scaleLabel: '7' };
    case '6強':
    case '6+':
      return { scaleCode: 60, scaleLabel: '6強' };
    case '6弱':
    case '6-':
      return { scaleCode: 55, scaleLabel: '6弱' };
    case '5強':
    case '5+':
      return { scaleCode: 50, scaleLabel: '5強' };
    case '5弱':
    case '5-':
    case '5弱程度以上':
      return { scaleCode: 45, scaleLabel: s.includes('以上') ? '5弱以上' : '5弱' };
    case '4':
      return { scaleCode: 40, scaleLabel: '4' };
    case '3':
      return { scaleCode: 30, scaleLabel: '3' };
    case '2':
      return { scaleCode: 20, scaleLabel: '2' };
    case '1':
      return { scaleCode: 10, scaleLabel: '1' };
    default:
      return { scaleCode: -1, scaleLabel: '不明' };
  }
}

/**
 * Parses a P2P地震情報 code 554 (`緊急地震速報 発表検出`) payload into an immediate placeholder `EewReport`.
 */
export function parseP2PEewDetection(
  item: Record<string, any>,
  receivedAtMs: number = Date.now()
): EewReport | null {
  if (!item || Number(item.code) !== P2P_CODES.EEW_DETECTION) return null;
  const timeStr = String(item.time || '');
  const id = String(item.id || `p2p-554-${timeStr || receivedAtMs}`);
  return {
    id,
    eventId: `p2p-554-${id}`,
    serial: 1,
    issueTime: timeStr,
    originTime: timeStr,
    hypocenterName: '緊急地震速報 発表検出（解析中）',
    lat: Number.NaN,
    lon: Number.NaN,
    depthKm: -1,
    magnitude: -1,
    isCancelled: false,
    isTest: false,
    isWarning: true,
    isFinal: false,
    isAssumedHypocenter: false,
    maxScaleCode: -1,
    maxScaleLabel: '解析中',
    areas: [],
    receivedAtMs,
  };
}

/**
 * Parses a Wolfx JMA EEW JSON / WebSocket payload (`https://api.wolfx.jp/jma_eew.json` or `wss://ws-api.wolfx.jp/jma_eew`).
 * Supports BOTH `緊急地震速報（予報）` (`isWarn: false`) and `緊急地震速報（警報）` (`isWarn: true`),
 * including every serial (`第1報..最終報`).
 */
export function parseWolfxEew(
  item: Record<string, any>,
  nowMs: number = Date.now()
): EewReport | null {
  if (!item || typeof item !== 'object') return null;
  if (item.type && item.type !== 'jma_eew') return null;
  if (item.isTraining === true) return null;

  const eventId = String(item.EventID || '').trim();
  if (!eventId) return null;

  const serialNum = Number.parseInt(String(item.Serial ?? '1'), 10);
  const serial = Number.isNaN(serialNum) || serialNum < 1 ? 1 : serialNum;
  const isCancelled = Boolean(item.isCancel);
  const isTest = Boolean(item.isTraining);
  const isWarning = Boolean(item.isWarn) || String(item.Title || '').includes('警報');
  const isFinal = Boolean(item.isFinal);
  const isAssumedHypocenter = Boolean(item.isAssumption);

  const issueTime = String(item.AnnouncedTime || '');
  const originTime = String(item.OriginTime || '');
  const hypocenterName = String(
    item.Hypocenter || (isCancelled ? '' : '震源調査中')
  );

  const rawLat = Number(item.Latitude);
  const rawLon = Number(item.Longitude);
  const hasHypo =
    !Number.isNaN(rawLat) &&
    rawLat > -90 &&
    rawLat < 90 &&
    !Number.isNaN(rawLon) &&
    rawLon > -180 &&
    rawLon < 180;

  const rawDepth = Number(item.Depth);
  const rawMag = Number(item.Magnitude ?? item.Magunitude);

  const maxIntInfo = parseEewIntensityStringToCode(item.MaxIntensity);

  const rawAreas = Array.isArray(item.WarnArea) ? item.WarnArea : [];
  const areas: EewForecastArea[] = rawAreas
    .map((a: any) => {
      const name = String(a?.Chiiki || a?.name || '').trim();
      const s1 = parseEewIntensityStringToCode(a?.Shindo1);
      const s2 =
        a?.Shindo2 === '以上' || String(a?.Shindo2 || '').includes('以上')
          ? { scaleCode: 99, scaleLabel: '以上' }
          : parseEewIntensityStringToCode(a?.Shindo2);
      const arrived =
        a?.Arrive === true ||
        a?.Arrive === 'true' ||
        String(a?.Arrive || '').includes('到達') ||
        String(a?.Time || '').includes('//');
      let arrivalTime: string | null = null;
      const rawTime = String(a?.Time || '').trim();
      if (/^\d{2}:\d{2}:\d{2}$/.test(rawTime) && issueTime.length >= 10) {
        arrivalTime = `${issueTime.slice(0, 10)} ${rawTime}`;
      }
      const c1 = s1.scaleCode;
      const c2 = s2.scaleCode;
      const scaleFrom = c2 === 99 ? c1 : c2 > 0 ? Math.min(c1, c2) : c1;
      const scaleTo = c2 === 99 ? 99 : c2 > 0 ? Math.max(c1, c2) : c1;
      const lpgmClass = parseLpgmClassValue(
        a?.lpgmClass ?? a?.Lpgm ?? a?.lpgm ?? a?.LgInt ?? a?.lgInt ?? a?.LgIntensity ?? a?.lgIntensity
      );
      return {
        pref: /^(.+?[都道府県])/.exec(name)?.[1] || name.slice(0, 3),
        name,
        scaleFrom,
        scaleTo,
        kindCode: isAssumedHypocenter ? '19' : arrived ? '11' : '10',
        arrivalTime,
        lpgmClass,
      };
    })
    .filter((a: EewForecastArea) => a.name)
    .sort(
      (a: EewForecastArea, b: EewForecastArea) =>
        getEewAreaRepresentativeScale(b) - getEewAreaRepresentativeScale(a)
    );

  const topLpgmClass = parseLpgmClassValue(
    item?.MaxLgIntensity ??
      item?.maxLgIntensity ??
      item?.MaxLgInt ??
      item?.maxLgInt ??
      item?.MaxLpgm ??
      item?.maxLpgm ??
      item?.LgIntensity ??
      item?.lgIntensity
  );
  const areaMaxLpgmClass = areas.reduce<0 | 1 | 2 | 3 | 4>(
    (max, a) => (typeof a.lpgmClass === 'number' && a.lpgmClass > max ? a.lpgmClass : max),
    0
  );
  const maxLpgmClass = (Math.max(topLpgmClass, areaMaxLpgmClass) as 0 | 1 | 2 | 3 | 4);
  const maxLpgmLabel = maxLpgmClass >= 1 ? `階級${maxLpgmClass}` : undefined;

  // Use AnnouncedTime (or OriginTime) to determine receivedAtMs so REST polling
  // does not treat an old EEW from hours ago as newly received right now.
  const announcedMs = parseJstDateTimeMs(issueTime);
  const originMs = parseJstDateTimeMs(originTime);
  const refTimeMs = !Number.isNaN(announcedMs)
    ? announcedMs
    : !Number.isNaN(originMs)
      ? originMs
      : nowMs;

  return {
    id: `wolfx-eew-${eventId}-${serial}`,
    eventId,
    serial,
    issueTime,
    originTime,
    hypocenterName,
    lat: hasHypo ? rawLat : Number.NaN,
    lon: hasHypo ? rawLon : Number.NaN,
    depthKm: !Number.isNaN(rawDepth) && rawDepth >= 0 ? Math.trunc(rawDepth) : -1,
    magnitude: !Number.isNaN(rawMag) && rawMag > 0 ? Number(rawMag.toFixed(1)) : -1,
    isCancelled,
    isTest,
    isWarning,
    isFinal,
    isAssumedHypocenter,
    maxScaleCode: maxIntInfo.scaleCode,
    maxScaleLabel: maxIntInfo.scaleLabel,
    maxLpgmClass,
    maxLpgmLabel,
    areas,
    receivedAtMs: refTimeMs,
    source: 'wolfx',
  };
}

/** 警報を含むか（未指定は警報扱い: P2P 556 / デモ） */
export function isEewWarning(eew: EewReport | null | undefined): boolean {
  return Boolean(eew) && eew!.isWarning !== false;
}

/** 特別警報に該当するか（気象庁基準: 警報かつ 予想最大震度6弱以上(55+) または 長周期地震動階級4） */
export function isEewSpecialWarning(eew: EewReport | null | undefined): boolean {
  return Boolean(
    eew &&
      eew.isWarning !== false &&
      (eew.maxScaleCode >= 55 || (eew.maxLpgmClass ?? 0) >= 4)
  );
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
 * - Placeholder detection (`p2p-554-*`) is always replaced by an actual EEW report.
 * - New event (different `eventId`) replaces if its timestamp is >= current event.
 * - Same event: replace when `serial` is newer, or when `serial` is equal and the incoming
 *   report has richer data (e.g. warning areas, final flag, or cancellation).
 */
export function shouldReplaceEew(
  prev: EewReport | null | undefined,
  next: EewReport
): boolean {
  if (!prev) return true;
  if (prev.eventId.startsWith('p2p-554-') && !next.eventId.startsWith('p2p-554-')) {
    return true;
  }
  if (!prev.eventId.startsWith('p2p-554-') && next.eventId.startsWith('p2p-554-')) {
    return false;
  }
  if (prev.eventId !== next.eventId) {
    return next.receivedAtMs >= prev.receivedAtMs - 60000;
  }
  if (next.isCancelled) return true;
  if (next.serial > prev.serial) return true;
  if (next.serial === prev.serial) {
    if (next.areas.length > prev.areas.length) return true;
    if (next.isFinal && !prev.isFinal) return true;
    if (next.isWarning && !prev.isWarning) return true;
  }
  return false;
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
  if (sec === null) return '到達時刻不明';
  if (sec <= 0) return '到達と予測';
  return `あと${sec}秒`;
}

/**
 * Computes horizontal radii (km) of P-wave and S-wave fronts on the surface since `originTime`.
 * Uses the official JMA2001 travel-time table (気象庁 JMA2001 走時表) with 2D bilinear
 * interpolation and monotonic piecewise linear inversion.
 */
export function computeEewWaveRadiiKm(
  originTime: string,
  depthKm: number,
  nowMs: number = Date.now()
): { pKm: number; sKm: number; elapsedSec: number } {
  const t0 = parseJstDateTimeMs(originTime);
  if (Number.isNaN(t0) || !Number.isFinite(nowMs)) {
    return { pKm: 0, sKm: 0, elapsedSec: 0 };
  }
  const elapsedSec = Math.max(0, (nowMs - t0) / 1000);
  if (elapsedSec <= 0) {
    return { pKm: 0, sKm: 0, elapsedSec: 0 };
  }
  const depth = Number.isFinite(depthKm) ? Math.max(0, depthKm) : 0;
  const { pKm, sKm } = solveJma2001EpicentralRadiiKm(depth, elapsedSec);
  return { pKm, sKm, elapsedSec };
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

/** 長周期地震動（LPGM: Long-Period Ground Motion）階級のスタイルと解説定義 */
export interface LpgmClassStyle {
  bg: string;
  text: string;
  border: string;
  label: string;
  description: string;
}

export function getLpgmClassStyle(lpgmClass: number | undefined): LpgmClassStyle {
  switch (lpgmClass) {
    case 4:
      return {
        bg: '#EF4444',
        text: '#FFFFFF',
        border: '#DC2626',
        label: '階級4',
        description: '立っていることができず、はいつくばらないと動けない',
      };
    case 3:
      return {
        bg: '#F97316',
        text: '#FFFFFF',
        border: '#EA580C',
        label: '階級3',
        description: '立っていることが困難。固定していない家具が移動・転倒',
      };
    case 2:
      return {
        bg: '#F59E0B',
        text: '#0B0D13',
        border: '#D97706',
        label: '階級2',
        description: '室内で大きな揺れ。物につかまらないと歩行が困難',
      };
    case 1:
      return {
        bg: '#10B981',
        text: '#FFFFFF',
        border: '#059669',
        label: '階級1',
        description: '室内のほとんどの人が揺れを感じる。ブラインドが揺れる',
      };
    default:
      return {
        bg: '#334155',
        text: '#94A3B8',
        border: '#1E293B',
        label: '階級0',
        description: '長周期地震動による顕著な揺れは予測されていません',
      };
  }
}

/**
 * Parses an explicit JMA Long-Period Ground Motion class (`1`..`4`) from API payloads.
 * Returns `0` when absent, `"0"`, `"-"`, or invalid (never fabricated from seismic intensity).
 */
export function parseLpgmClassValue(raw: unknown): 0 | 1 | 2 | 3 | 4 {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') {
    const n = Math.trunc(raw);
    return n >= 1 && n <= 4 ? (n as 1 | 2 | 3 | 4) : 0;
  }
  const s = String(raw)
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const m = /(?:^|階級)([1-4])$/.exec(s);
  if (!m) return 0;
  return Number(m[1]) as 1 | 2 | 3 | 4;
}

/**
 * True only when the EEW explicitly carries an actual long-period ground motion prediction (階級1〜4).
 */
export function hasActualEewLpgm(eew: EewReport | null | undefined): boolean {
  if (!eew) return false;
  if (typeof eew.maxLpgmClass === 'number' && eew.maxLpgmClass >= 1) return true;
  return Array.isArray(eew.areas) && eew.areas.some((a) => (a.lpgmClass ?? 0) >= 1);
}

/**
 * True when `selectedEarthquake` corresponds to the same seismic event as `activeEew`
 * (origin/occurrence time within ±5 minutes), so stale previous earthquakes are not
 * conflated with an unfolding EEW.
 */
export function doesEarthquakeMatchEew(
  eq: EarthquakeReport | null | undefined,
  eew: EewReport | null | undefined
): boolean {
  if (!eq || !eew) return false;
  if (eew.isDemo) {
    return Boolean(eq.isTest && eq.hypocenterName === eew.hypocenterName);
  }
  const eqMs = parseJstDateTimeMs(eq.occurrenceTime);
  const eewOriginMs = parseJstDateTimeMs(eew.originTime || eew.issueTime);
  if (!Number.isNaN(eqMs) && !Number.isNaN(eewOriginMs)) {
    return Math.abs(eqMs - eewOriginMs) <= 5 * 60 * 1000;
  }
  return Boolean(
    eq.hypocenterName &&
      eew.hypocenterName &&
      eq.hypocenterName === eew.hypocenterName
  );
}

/**
 * EEW予測震度・規模（M）から長周期地震動階級（1〜4）を気象庁基準に準拠して推定・付与する
 */
export function estimateLpgmClassFromScale(
  scaleFrom: number,
  scaleTo: number,
  magnitude: number = 6.0
): 0 | 1 | 2 | 3 | 4 {
  const maxS = scaleTo > 0 && scaleTo !== 99 ? scaleTo : scaleFrom;
  if (magnitude < 5.4 && maxS < 45) return 0;
  if (maxS >= 65) return 4; // 震度6強以上 -> 階級4
  if (maxS >= 55) return 3; // 震度5強〜6弱 -> 階級3
  if (maxS >= 45) return 2; // 震度5弱 -> 階級2
  if (maxS >= 40 && magnitude >= 5.8) return 1; // 震度4かつM5.8以上 -> 階級1
  return 0;
}

// 北海道の4大予報区（緊急地震速報・震度速報用）と気象庁細分区域コード（100〜167番台）の対応
const HOKKAIDO_DO_O_CODES = ['100', '101', '102', '115', '116', '117', '120', '121', '122', '145', '146', '150', '151', '152'];
const HOKKAIDO_DO_NAN_CODES = ['105', '106', '107', '110', '119'];
const HOKKAIDO_DO_HOKU_CODES = ['125', '126', '127', '130', '131', '135', '136', '139'];
const HOKKAIDO_DO_TO_CODES = ['140', '141', '142', '155', '156', '157', '160', '161', '165', '166', '167'];
const HOKKAIDO_ALL_CODES = [
  ...HOKKAIDO_DO_O_CODES,
  ...HOKKAIDO_DO_NAN_CODES,
  ...HOKKAIDO_DO_HOKU_CODES,
  ...HOKKAIDO_DO_TO_CODES,
];

/**
 * EEW 電文の府県名（pref）と細分区域名（name）から
 * 気象庁震度細分区域コード（100〜790番台）を照合・取得する
 */
export function findSubdivisionAreaCodes(pref: string, name: string): string[] {
  const normPref = (pref || '').replace(/(都|府|県)$/, '').trim();
  const rawCleanName = (name || '')
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .replace(/(地方|地域)$/, '')
    .trim();
  const normName = rawCleanName.replace(/(都|府|県)$/, '').trim();

  // 北海道の緊急地震速報・震度速報の4大予報区域（道央・道南・道北・道東）
  const isHokkaido = normPref === '北海道' || rawCleanName.includes('北海道') || pref === '北海道';
  if (isHokkaido) {
    if (rawCleanName.includes('道央')) return [...HOKKAIDO_DO_O_CODES];
    if (rawCleanName.includes('道南')) return [...HOKKAIDO_DO_NAN_CODES];
    if (rawCleanName.includes('道北')) return [...HOKKAIDO_DO_HOKU_CODES];
    if (rawCleanName.includes('道東')) return [...HOKKAIDO_DO_TO_CODES];
  }

  // 都道府県名そのものが指定されている場合（例: pref="福岡県", name="福岡県" または name=""）
  // は、その都道府県の全細分区域を返す
  const isWholePrefecture =
    !normName ||
    rawCleanName === pref ||
    (Boolean(normPref) && rawCleanName === `${normPref}県`) ||
    (Boolean(normPref) && rawCleanName === `${normPref}府`) ||
    (Boolean(normPref) && rawCleanName === `${normPref}都`) ||
    (Boolean(normPref) && rawCleanName === '北海道');

  if (isWholePrefecture) {
    if (normPref === '北海道') return [...HOKKAIDO_ALL_CODES];
    const list: string[] = [];
    for (const [code, fullName] of Object.entries(JMA_SUBDIVISION_AREAS)) {
      if (normPref && fullName.includes(normPref)) list.push(code);
    }
    return list;
  }

  // 1. 細分区域名または都道府県+区域名の完全一致を最優先
  const matches: string[] = [];
  for (const [code, fullName] of Object.entries(JMA_SUBDIVISION_AREAS)) {
    const fullNorm = fullName.replace(/[０-９]/g, (s) =>
      String.fromCharCode(s.charCodeAt(0) - 0xfee0)
    );
    const specific = fullNorm.replace(
      new RegExp(`^${normPref}(都|府|県)?`),
      ''
    );

    if (
      fullNorm === rawCleanName ||
      fullNorm === `${pref}${name}` ||
      fullNorm === `${normPref}${rawCleanName}` ||
      (normName && specific === normName)
    ) {
      matches.push(code);
    }
  }

  if (matches.length > 0) return matches;

  // 2. 部分一致（区域名を含む・含まれる）
  if (normName) {
    for (const [code, fullName] of Object.entries(JMA_SUBDIVISION_AREAS)) {
      const fullNorm = fullName.replace(/[０-９]/g, (s) =>
        String.fromCharCode(s.charCodeAt(0) - 0xfee0)
      );
      if (normPref && !fullNorm.includes(normPref)) continue;

      const specific = fullNorm.replace(
        new RegExp(`^${normPref}(都|府|県)?`),
        ''
      );
      if (
        (specific && normName.includes(specific)) ||
        (normName && specific.includes(normName))
      ) {
        matches.push(code);
      }
    }
  }

  if (matches.length > 0) return matches;

  // 3. 固有の細分区域にヒットしなかった場合のフォールバック（都道府県全域）
  if (normPref === '北海道') return [...HOKKAIDO_ALL_CODES];
  if (normPref) {
    const list: string[] = [];
    for (const [code, fullName] of Object.entries(JMA_SUBDIVISION_AREAS)) {
      if (fullName.includes(normPref)) list.push(code);
    }
    return list;
  }

  return [];
}

/**
 * EEW レポートから気象庁細分区域コード（188区域）ごとの最大予測震度コード Map を算出する
 */
export function computeEewAreaScales(eew: EewReport | null | undefined): Map<string, number> {
  const scaleMap = new Map<string, number>();
  if (!eew || !Array.isArray(eew.areas)) return scaleMap;

  for (const area of eew.areas) {
    // 代表予測震度（scaleTo が 99 の場合は scaleFrom、そうでなければ scaleTo を基本とする）
    let repScale =
      area.scaleTo > 0 && area.scaleTo !== 99 ? area.scaleTo : area.scaleFrom;
    if (repScale <= 0) repScale = area.scaleFrom > 0 ? area.scaleFrom : 10;

    const codes = findSubdivisionAreaCodes(area.pref, area.name);
    for (const code of codes) {
      const current = scaleMap.get(code) || 0;
      if (repScale > current) {
        scaleMap.set(code, repScale);
      }
    }
  }

  return scaleMap;
}

/**
 * EEW レポートから気象庁細分区域コード（188区域）ごとの長周期地震動予測階級（1〜4）Map を算出する
 */
export function computeEewAreaLpgmClasses(eew: EewReport | null | undefined): Map<string, number> {
  const lpgmMap = new Map<string, number>();
  if (!eew || !Array.isArray(eew.areas)) return lpgmMap;

  for (const area of eew.areas) {
    const cls = typeof area.lpgmClass === 'number' ? area.lpgmClass : 0;
    if (cls < 1 || cls > 4) continue;

    const codes = findSubdivisionAreaCodes(area.pref, area.name);
    for (const code of codes) {
      const current = lpgmMap.get(code) || 0;
      if (cls > current) {
        lpgmMap.set(code, cls);
      }
    }
  }

  return lpgmMap;
}

/**
 * 地震情報・EEWマップ上で位置関係を直感的に把握するための主要都市（県庁所在地・中核市）座標一覧
 */
export const MAJOR_CITIES: Array<{ name: string; lat: number; lon: number }> = [
  { name: '札幌市', lat: 43.0642, lon: 141.3469 },
  { name: '旭川市', lat: 43.7706, lon: 142.3649 },
  { name: '函館市', lat: 41.7687, lon: 140.7288 },
  { name: '釧路市', lat: 42.9849, lon: 144.3818 },
  { name: '青森市', lat: 40.8244, lon: 140.7400 },
  { name: '盛岡市', lat: 39.7036, lon: 141.1527 },
  { name: '仙台市', lat: 38.2682, lon: 140.8694 },
  { name: '秋田市', lat: 39.7186, lon: 140.1024 },
  { name: '山形市', lat: 38.2404, lon: 140.3633 },
  { name: '福島市', lat: 37.7503, lon: 140.4678 },
  { name: '水戸市', lat: 36.3418, lon: 140.4468 },
  { name: '宇都宮市', lat: 36.5658, lon: 139.8836 },
  { name: '前橋市', lat: 36.3911, lon: 139.0608 },
  { name: 'さいたま市', lat: 35.8617, lon: 139.6455 },
  { name: '千葉市', lat: 35.6074, lon: 140.1065 },
  { name: '東京都', lat: 35.6895, lon: 139.6917 },
  { name: '横浜市', lat: 35.4478, lon: 139.6425 },
  { name: '新潟市', lat: 37.9026, lon: 139.0232 },
  { name: '富山市', lat: 36.6953, lon: 137.2113 },
  { name: '金沢市', lat: 36.5947, lon: 136.6256 },
  { name: '福井市', lat: 36.0652, lon: 136.2219 },
  { name: '甲府市', lat: 35.6639, lon: 138.5683 },
  { name: '長野市', lat: 36.6513, lon: 138.1810 },
  { name: '岐阜市', lat: 35.3912, lon: 136.7223 },
  { name: '静岡市', lat: 34.9769, lon: 138.3831 },
  { name: '浜松市', lat: 34.7108, lon: 137.7261 },
  { name: '名古屋市', lat: 35.1802, lon: 136.9066 },
  { name: '津市', lat: 34.7303, lon: 136.5086 },
  { name: '大津市', lat: 35.0045, lon: 135.8686 },
  { name: '京都市', lat: 35.0210, lon: 135.7556 },
  { name: '大阪市', lat: 34.6863, lon: 135.5200 },
  { name: '神戸市', lat: 34.6946, lon: 135.1955 },
  { name: '奈良市', lat: 34.6853, lon: 135.8327 },
  { name: '和歌山市', lat: 34.2260, lon: 135.1675 },
  { name: '鳥取市', lat: 35.5039, lon: 134.2377 },
  { name: '松江市', lat: 35.4723, lon: 133.0505 },
  { name: '岡山市', lat: 34.6618, lon: 133.9350 },
  { name: '広島市', lat: 34.3966, lon: 132.4596 },
  { name: '山口市', lat: 34.1861, lon: 131.4705 },
  { name: '徳島市', lat: 34.0658, lon: 134.5593 },
  { name: '高松市', lat: 34.3401, lon: 134.0434 },
  { name: '松山市', lat: 33.8417, lon: 132.7661 },
  { name: '高知市', lat: 33.5597, lon: 133.5311 },
  { name: '福岡市', lat: 33.6064, lon: 130.4183 },
  { name: '北九州市', lat: 33.8835, lon: 130.8752 },
  { name: '佐賀市', lat: 33.2494, lon: 130.2988 },
  { name: '長崎市', lat: 32.7448, lon: 129.8737 },
  { name: '熊本市', lat: 32.7898, lon: 130.7417 },
  { name: '大分市', lat: 33.2382, lon: 131.6126 },
  { name: '宮崎市', lat: 31.9111, lon: 131.4239 },
  { name: '鹿児島市', lat: 31.5602, lon: 130.5581 },
  { name: '那覇市', lat: 26.2124, lon: 127.6809 },
];

