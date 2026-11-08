import {
  INITIAL_AMEDAS_STATIONS,
  INITIAL_EARTHQUAKES,
  INITIAL_FORECASTS,
  INITIAL_LIGHTNING_POINTS,
  INITIAL_MUNI_SEVERITY_MAP,
  INITIAL_MUNICIPALITY_WARNINGS,
  INITIAL_NOWCAST_TIMES,
  INITIAL_PREF_SEVERITY_MAP,
  INITIAL_TSUNAMI_FORECAST,
  INITIAL_TSUNAMI_STATIONS,
  INITIAL_TYPHOONS,
  INITIAL_VOLCANOES,
  INITIAL_WARNINGS,
  INITIAL_WEATHER_BULLETINS,
  INITIAL_XML_ENTRIES,
} from '../data/fallbackData';
import {
  AmedasStationData,
  CityForecastItem,
  EarthquakeReport,
  EarthquakeStationIntensity,
  EewReport,
  JmaXmlEntry,
  LightningPoint,
  MonitorDataBundle,
  NowcastTimeEntry,
  RegionalWarningItem,
  RegionId,
  TsunamiForecastReport,
  TyphoonReport,
  WarningSeverity,
  XmlFeedType,
} from '../types/jma';
import {
  formatSeismicScale,
  MAJOR_FORECAST_CITY_TARGETS,
  mergeProgressiveEarthquakeReports,
  parseJmaAmedasNationwide,
  parseJmaAtomXml,
  parseJmaCityForecastJson,
  parseJmaQuakeDetailJson,
  parseJmaTyphoonSpecifications,
  parseJmaWarningMapData,
  PREFECTURE_NAMES,
  sortEarthquakesByNewest,
} from '../utils/jmaParser';
import {
  isEewStillActive,
  isTsunamiForecastActive,
  P2P_QUAKE_ISSUE_TYPE_LABELS,
  parseJmaTsunamiDetail,
  parseP2PEew,
  parseP2PTsunami,
  parseWolfxEew,
  shouldReplaceEew,
} from '../utils/eewTsunami';

const JMA_XML_URLS: Record<XmlFeedType, string> = {
  regular: 'https://www.data.jma.go.jp/developer/xml/feed/regular.xml',
  extra: 'https://www.data.jma.go.jp/developer/xml/feed/extra.xml',
  eqvol: 'https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml',
};

const NOWCAST_N1_URL =
  'https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json';
const NOWCAST_N2_URL =
  'https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N2.json';
const NOWCAST_N3_URL =
  'https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N3.json';
const JMA_WARNING_MAP_URL =
  'https://www.jma.go.jp/bosai/warning/data/r8/map.json';
const JMA_WARNING_MAP_LEGACY_URL =
  'https://www.jma.go.jp/bosai/warning/data/warning/map.json';
const JMA_AREA_CONST_URL =
  'https://www.jma.go.jp/bosai/common/const/area.json';
const JMA_XY_CONST_URL =
  'https://www.jma.go.jp/bosai/common/const/xy.json';
const JMA_TYPHOON_TARGET_URL =
  'https://www.jma.go.jp/bosai/typhoon/data/targetTc.json';
const JMA_AMEDAS_TABLE_URL =
  'https://www.jma.go.jp/bosai/amedas/const/amedastable.json';
const JMA_AMEDAS_LATEST_TIME_URL =
  'https://www.jma.go.jp/bosai/amedas/data/latest_time.txt';
const JMA_QUAKE_LIST_URL =
  'https://www.jma.go.jp/bosai/quake/data/list.json';
const JMA_TSUNAMI_LIST_URL =
  'https://www.jma.go.jp/bosai/tsunami/data/list.json';
const P2P_QUAKE_HISTORY_URL =
  'https://api.p2pquake.net/v2/history?codes=551&limit=20';
const P2P_TSUNAMI_HISTORY_URL =
  'https://api.p2pquake.net/v2/history?codes=552&limit=5';

let cachedAmedasTable: Record<string, any> | null = null;
let cachedJmaAreaConst: Record<string, any> | null = null;
let jmaAreaConstPromise: Promise<Record<string, any> | null> | null = null;
let cachedJmaXyConst: Record<string, any> | null = null;
let cachedHourlySnowTs = '';
let cachedHourlySnowMap: Record<string, any> | null = null;
const cachedJmaQuakeDetails = new Map<string, EarthquakeReport>();
const TYPHOON_24H_CACHE_KEY = 'jma_typhoons_24h_cache_v1';
const TYPHOON_RETENTION_MS = 24 * 3600 * 1000; // 24 hours (1 day)

async function fetchWithTimeout(url: string, timeoutMs = 4500): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

export function fetchSharedJmaAreaConst(): Promise<Record<string, any> | null> {
  if (cachedJmaAreaConst) return Promise.resolve(cachedJmaAreaConst);
  if (jmaAreaConstPromise) return jmaAreaConstPromise;
  jmaAreaConstPromise = fetchWithTimeout(JMA_AREA_CONST_URL, 4500)
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      if (json) cachedJmaAreaConst = json;
      return cachedJmaAreaConst;
    })
    .catch(() => null);
  return jmaAreaConstPromise;
}

async function fetchSingleJmaXmlFeed(
  feedType: XmlFeedType
): Promise<{ entries: JmaXmlEntry[]; live: boolean }> {
  const url = JMA_XML_URLS[feedType];
  try {
    const res = await fetchWithTimeout(url, 4000);
    if (!res.ok) {
      return { entries: [], live: false };
    }
    const text = await res.text();
    const parsed = parseJmaAtomXml(text, feedType, 16);
    return { entries: parsed, live: parsed.length > 0 };
  } catch {
    return { entries: [], live: false };
  }
}

function formatUtcTimestampToJst(vt: string): string {
  if (vt.length < 12) return vt;
  const y = Number(vt.slice(0, 4));
  const m = Number(vt.slice(4, 6)) - 1;
  const d = Number(vt.slice(6, 8));
  const h = Number(vt.slice(8, 10));
  const min = Number(vt.slice(10, 12));
  const jstDate = new Date(Date.UTC(y, m, d, h + 9, min));
  const hh = String(jstDate.getUTCHours()).padStart(2, '0');
  const mm = String(jstDate.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Fetches JMA High-Resolution Precipitation Nowcast (hrpns) + Lightning Nowcast (thns / liden).
 */
async function fetchNowcastAndLightning(): Promise<{
  times: NowcastTimeEntry[];
  lightningPoints: LightningPoint[];
  live: boolean;
}> {
  try {
    const [resN1, resN2, resN3] = await Promise.all([
      fetchWithTimeout(NOWCAST_N1_URL, 3500),
      fetchWithTimeout(NOWCAST_N2_URL, 3500).catch(() => null),
      fetchWithTimeout(NOWCAST_N3_URL, 3500).catch(() => null),
    ]);
    if (!resN1.ok) {
      return {
        times: INITIAL_NOWCAST_TIMES,
        lightningPoints: INITIAL_LIGHTNING_POINTS,
        live: false,
      };
    }
    const dataN1 = (await resN1.json()) as Array<{
      basetime: string;
      validtime: string;
    }>;
    const dataN2 =
      resN2 && resN2.ok
        ? ((await resN2.json()) as Array<{ basetime: string; validtime: string }>)
        : [];
    const dataN3 =
      resN3 && resN3.ok
        ? ((await resN3.json()) as Array<{
            basetime: string;
            validtime: string;
            elements?: string[];
          }>)
        : [];

    // Find thns entries from N3 so each timeframe gets its matching thns layer
    const thnsEntries = dataN3
      .filter((item) => Array.isArray(item.elements) && item.elements.includes('thns'))
      .sort((a, b) => a.validtime.localeCompare(b.validtime));
    const latestThns = thnsEntries[thnsEntries.length - 1];

    const findMatchingThns = (vt: string) => {
      for (let i = thnsEntries.length - 1; i >= 0; i--) {
        if (thnsEntries[i].validtime <= vt) {
          return thnsEntries[i];
        }
      }
      return thnsEntries[0] || latestThns;
    };

    const sortedPast = [...dataN1]
      .sort((a, b) => a.validtime.localeCompare(b.validtime))
      .slice(-5)
      .map((item, idx, arr) => {
        const matchedThns = findMatchingThns(item.validtime);
        return {
          basetime: item.basetime,
          validtime: item.validtime,
          label:
            idx === arr.length - 1
              ? `${formatUtcTimestampToJst(item.validtime)} (最新実況)`
              : `${formatUtcTimestampToJst(item.validtime)} (実況)`,
          isForecast: false,
          thnsBasetime: matchedThns?.basetime,
          thnsValidtime: matchedThns?.validtime,
        };
      });

    const sortedForecast = [...dataN2]
      .sort((a, b) => a.validtime.localeCompare(b.validtime))
      .slice(0, 3)
      .map((item) => {
        const matchedThns = findMatchingThns(item.validtime);
        return {
          basetime: item.basetime,
          validtime: item.validtime,
          label: `${formatUtcTimestampToJst(item.validtime)} (高解像度予測)`,
          isForecast: true,
          thnsBasetime: matchedThns?.basetime,
          thnsValidtime: matchedThns?.validtime,
        };
      });

    // Fetch liden GeoJSON points for each past observation timeframe (`sortedPast`)
    const pastValidtimeSet = new Set(sortedPast.map((p) => p.validtime));
    const lidenEntries = dataN3
      .filter(
        (item) =>
          Array.isArray(item.elements) &&
          item.elements.includes('liden') &&
          (pastValidtimeSet.size === 0 || pastValidtimeSet.has(item.validtime))
      )
      .sort((a, b) => b.validtime.localeCompare(a.validtime))
      .slice(0, 5);

    let lightningPoints: LightningPoint[] = [];
    if (lidenEntries.length > 0) {
      const lidenResults = await Promise.all(
        lidenEntries.map(async (entry) => {
          try {
            const url = `https://www.jma.go.jp/bosai/jmatile/data/nowc/${entry.basetime}/none/${entry.validtime}/surf/liden/data.geojson`;
            const r = await fetchWithTimeout(url, 2500);
            if (!r.ok) return [];
            const gj = await r.json();
            if (!gj || !Array.isArray(gj.features)) return [];
            return gj.features
              .map((f: any, idx: number): LightningPoint | null => {
                const coords = f?.geometry?.coordinates;
                if (!Array.isArray(coords) || coords.length < 2) return null;
                return {
                  id: `liden-${entry.validtime}-${idx}`,
                  lon: Number(coords[0]),
                  lat: Number(coords[1]),
                  timeJst: formatUtcTimestampToJst(entry.validtime),
                  type: Number(f?.properties?.type ?? 4),
                  validtime: entry.validtime,
                };
              })
              .filter((p: LightningPoint | null): p is LightningPoint => p !== null)
              .slice(0, 120);
          } catch {
            return [];
          }
        })
      );
      lightningPoints = lidenResults.flat();
    }

    const combined = [...sortedPast, ...sortedForecast];
    return {
      times: combined.length > 0 ? combined : INITIAL_NOWCAST_TIMES,
      lightningPoints:
        lightningPoints.length > 0 ? lightningPoints : INITIAL_LIGHTNING_POINTS,
      live: combined.length > 0,
    };
  } catch {
    return {
      times: INITIAL_NOWCAST_TIMES,
      lightningPoints: INITIAL_LIGHTNING_POINTS,
      live: false,
    };
  }
}

/**
 * Fetches live JMA nationwide warnings/advisories from `warning/data/r8/map.json`
 * (with fallback to `warning/data/warning/map.json`) along with `area.json` and `xy.json`
 * so both 57-division warnings AND municipality-level (`市区町村単位`) polygons are accurately colored and listed.
 */
type LiveWarningsResult = {
  warnings: RegionalWarningItem[];
  municipalityWarnings: RegionalWarningItem[];
  muniSeverityMap: Record<string, WarningSeverity>;
  prefSeverityMap: Record<number, WarningSeverity>;
  live: boolean;
};

/** Last successfully parsed LIVE warnings (used instead of mock data when a poll fails). */
let lastLiveWarnings: LiveWarningsResult | null = null;

function offlineWarningsFallback(): LiveWarningsResult {
  // Never mix demo data into a live session: once live data was received, keep showing it.
  if (lastLiveWarnings) return { ...lastLiveWarnings, live: false };
  return {
    warnings: INITIAL_WARNINGS,
    municipalityWarnings: INITIAL_MUNICIPALITY_WARNINGS,
    muniSeverityMap: INITIAL_MUNI_SEVERITY_MAP,
    prefSeverityMap: INITIAL_PREF_SEVERITY_MAP,
    live: false,
  };
}

async function fetchLiveJmaWarnings(): Promise<LiveWarningsResult> {
  try {
    const [resR8, areaData, xyData] = await Promise.all([
      // r8/map.json is ~1 MB: allow enough time instead of silently falling back to demo data
      fetchWithTimeout(JMA_WARNING_MAP_URL, 15000).catch(() => null),
      fetchSharedJmaAreaConst(),
      cachedJmaXyConst
        ? Promise.resolve(cachedJmaXyConst)
        : fetchWithTimeout(JMA_XY_CONST_URL, 10000)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
    ]);
    if (xyData) cachedJmaXyConst = xyData;

    const res =
      resR8 && resR8.ok
        ? resR8
        : await fetchWithTimeout(JMA_WARNING_MAP_LEGACY_URL, 10000).catch(
            () => null
          );

    if (!res || !res.ok) return offlineWarningsFallback();
    const rawJson = await res.json();
    if (!Array.isArray(rawJson) || rawJson.length === 0) {
      return offlineWarningsFallback();
    }
    const parsed = parseJmaWarningMapData(rawJson, areaData, xyData);
    // A successful fetch is authoritative even when nothing is in effect nationwide (0 warnings).
    const result: LiveWarningsResult = {
      warnings: parsed.warnings,
      municipalityWarnings: parsed.municipalityWarnings,
      muniSeverityMap: parsed.muniSeverityMap,
      prefSeverityMap: parsed.prefSeverityMap,
      live: true,
    };
    lastLiveWarnings = result;
    return result;
  } catch {
    return offlineWarningsFallback();
  }
}

/**
 * Fetches nationwide AMeDAS observations (~930 temperature stations across Japan).
 * `amedastable.json` is cached in memory so subsequent refreshes only fetch the single map JSON.
 */
async function fetchLiveAmedasData(): Promise<{
  amedas: AmedasStationData[];
  live: boolean;
}> {
  try {
    const [tableData, latestTimeRes] = await Promise.all([
      cachedAmedasTable
        ? Promise.resolve(cachedAmedasTable)
        : fetchWithTimeout(JMA_AMEDAS_TABLE_URL, 4500).then((r) =>
            r.ok ? r.json() : null
          ),
      fetchWithTimeout(JMA_AMEDAS_LATEST_TIME_URL, 3500),
    ]);

    if (!tableData || !latestTimeRes.ok) {
      return { amedas: INITIAL_AMEDAS_STATIONS, live: false };
    }
    cachedAmedasTable = tableData;

    const latestIso = (await latestTimeRes.text()).trim();
    // Convert "2026-11-06T01:10:00+09:00" -> "20261106011000"
    const ts14 = latestIso.replace(/[-T:]/g, '').slice(0, 14);
    const hourlyTs14 = `${ts14.slice(0, 10)}0000`;
    const timeLabel =
      latestIso.length >= 16 ? `${latestIso.slice(11, 16)} 実況` : '最新実況';

    const [mapRes, hourlySnowData] = await Promise.all([
      fetchWithTimeout(
        `https://www.jma.go.jp/bosai/amedas/data/map/${ts14}.json`,
        4500
      ),
      ts14 === hourlyTs14
        ? Promise.resolve(null)
        : cachedHourlySnowTs === hourlyTs14 && cachedHourlySnowMap
          ? Promise.resolve(cachedHourlySnowMap)
          : fetchWithTimeout(
              `https://www.jma.go.jp/bosai/amedas/data/map/${hourlyTs14}.json`,
              4000
            )
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
    ]);
    if (!mapRes.ok) {
      return { amedas: INITIAL_AMEDAS_STATIONS, live: false };
    }
    const mapJson = await mapRes.json();
    if (ts14 === hourlyTs14) {
      cachedHourlySnowTs = hourlyTs14;
      cachedHourlySnowMap = mapJson;
    } else if (hourlySnowData) {
      cachedHourlySnowTs = hourlyTs14;
      cachedHourlySnowMap = hourlySnowData;
    }

    const stations = parseJmaAmedasNationwide(
      tableData,
      mapJson,
      timeLabel,
      hourlySnowData || cachedHourlySnowMap
    );
    if (stations.length > 50) {
      return { amedas: stations, live: true };
    }
    return { amedas: INITIAL_AMEDAS_STATIONS, live: false };
  } catch {
    return { amedas: INITIAL_AMEDAS_STATIONS, live: false };
  }
}

function guessRegionFromName(name: string): RegionId {
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
  if (name.includes('沖縄') || name.includes('奄美') || name.includes('宮古') || name.includes('石垣') || name.includes('与那国'))
    return 'okinawa';
  return 'kyushu';
}

const TSUNAMI_LABEL_MAP: Record<string, string> = {
  None: 'この地震による津波の心配はありません。',
  Unknown: '津波の有無については現在調査中です。',
  Checking: '津波の有無については現在調査中です。',
  NonEffective: '若干の海面変動が予想されますが、被害の心配はありません。',
  Watch: '津波注意報が発表されています。海岸から離れてください。',
  Warning: '津波警報が発表されています！直ちに高台へ避難してください。',
};

function findPrefectureBaseCoords(
  prefName: string,
  fallbackLat: number,
  fallbackLon: number
): { lat: number; lon: number } {
  for (const meta of Object.values(PREFECTURE_NAMES)) {
    if (prefName.includes(meta.name) || meta.name.includes(prefName)) {
      return { lat: meta.lat, lon: meta.lon };
    }
  }
  return { lat: fallbackLat, lon: fallbackLon };
}

export function convertP2PQuakeItem(item: Record<string, any>): EarthquakeReport | null {
  try {
    const eq = item.earthquake;
    if (!eq || !eq.hypocenter) return null;
    const hypo = eq.hypocenter;
    const rawHypoName = String(hypo.name || '').trim();
    const hypocenterName = rawHypoName || '震源調査中';
    const rawMaxScale = typeof eq.maxScale === 'number' ? eq.maxScale : -1;
    const maxScaleCode = rawMaxScale >= 10 ? rawMaxScale : -1;
    const rawPoints = Array.isArray(item.points) ? item.points : [];
    const hypocenterUnknown =
      (typeof hypo.latitude === 'number' && hypo.latitude <= -100) ||
      !rawHypoName;
    const hypoLat =
      typeof hypo.latitude === 'number' && hypo.latitude > 0
        ? hypo.latitude
        : 35.68;
    const hypoLon =
      typeof hypo.longitude === 'number' && hypo.longitude > 0
        ? hypo.longitude
        : 139.76;

    const issueType = String(item.issue?.type || '');
    const issueTypeLabel =
      P2P_QUAKE_ISSUE_TYPE_LABELS[issueType] ||
      (issueType ? `地震情報（${issueType}）` : '地震情報');

    const stations: EarthquakeStationIntensity[] = [];
    for (let i = 0; i < Math.min(rawPoints.length, 60); i++) {
      const pt = rawPoints[i];
      const pref = String(pt.pref || '');
      const addr = String(pt.addr || '');
      const scale = typeof pt.scale === 'number' ? pt.scale : 10;
      const base = findPrefectureBaseCoords(pref, hypoLat, hypoLon);

      // Deterministic small spatial offset around prefecture/hypocenter when P2PQuake point lacks lat/lon
      let hash = 0;
      for (let c = 0; c < addr.length; c++) {
        hash = (hash * 31 + addr.charCodeAt(c)) & 0xffff;
      }
      const dLat = (((hash % 17) - 8) * 0.045);
      const dLon = ((((hash >> 4) % 17) - 8) * 0.045);

      stations.push({
        prefecture: pref,
        city: addr,
        stationName: addr,
        scaleCode: scale,
        scaleLabel: formatSeismicScale(scale),
        lat:
          typeof pt.lat === 'number'
            ? pt.lat
            : Number((base.lat + dLat).toFixed(4)),
        lon:
          typeof pt.lon === 'number'
            ? pt.lon
            : Number((base.lon + dLon).toFixed(4)),
      });
    }

    stations.sort((a, b) => b.scaleCode - a.scaleCode);

    const isConfirmed =
      !hypocenterUnknown &&
      maxScaleCode >= 10 &&
      issueType !== 'ScalePrompt' &&
      issueType !== 'Destination';

    const id = String(item.id || `p2p-${eq.time}`);
    const finalLat =
      hypocenterUnknown && stations[0]?.lat ? stations[0].lat : hypoLat;
    const finalLon =
      hypocenterUnknown && stations[0]?.lon ? stations[0].lon : hypoLon;

    const reportKey = `${id}|${issueTypeLabel}|${hypocenterName}|${maxScaleCode}|${stations.length}|${isConfirmed ? 1 : 0}`;

    return {
      id,
      issueTime: `${item.issue?.time || eq.time || ''} 発表`,
      occurrenceTime: `${eq.time || ''} 頃発生`,
      hypocenterName,
      regionId: guessRegionFromName(hypocenterName || stations[0]?.prefecture || ''),
      lat: finalLat,
      lon: finalLon,
      depthKm: typeof hypo.depth === 'number' && hypo.depth >= 0 ? hypo.depth : 10,
      magnitude:
        typeof hypo.magnitude === 'number' && hypo.magnitude >= 0
          ? Number(hypo.magnitude.toFixed(1))
          : 4.0,
      maxScaleCode,
      maxScaleLabel: maxScaleCode >= 10 ? formatSeismicScale(maxScaleCode) : '-',
      domesticTsunami:
        TSUNAMI_LABEL_MAP[eq.domesticTsunami] ||
        'この地震による津波の心配はありません。',
      foreignTsunami: eq.foreignTsunami || 'なし',
      sourceOffice: item.issue?.source || '気象庁（P2P地震情報経由）',
      issueTypeLabel,
      hypocenterUnknown,
      isConfirmed,
      reportKey,
      stations:
        stations.length > 0
          ? stations
          : maxScaleCode >= 10
            ? [
                {
                  prefecture: hypocenterName,
                  city: '震源周辺地域',
                  stationName: '各地の検震点',
                  scaleCode: maxScaleCode,
                  scaleLabel: formatSeismicScale(maxScaleCode),
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
 * Fetches active live EEW (both `緊急地震速報（予報）` and `緊急地震速報（警報）`)
 * from Wolfx (`https://api.wolfx.jp/jma_eew.json`) and P2PQuake (`codes=556`),
 * returning the active `EewReport` if one was issued within `EEW_DISPLAY_HOLD_MS`.
 */
export async function fetchLatestLiveEew(
  nowMs: number = Date.now()
): Promise<EewReport | null> {
  try {
    const [wolfxRes, p2pRes] = await Promise.all([
      fetchWithTimeout('https://api.wolfx.jp/jma_eew.json', 3000).catch(
        () => null
      ),
      fetchWithTimeout(
        'https://api.p2pquake.net/v2/history?codes=556&limit=2',
        3000
      ).catch(() => null),
    ]);

    let candidate: EewReport | null = null;

    if (wolfxRes && wolfxRes.ok) {
      const wolfxJson = await wolfxRes.json().catch(() => null);
      const parsedWolfx = wolfxJson ? parseWolfxEew(wolfxJson, nowMs) : null;
      if (parsedWolfx && isEewStillActive(parsedWolfx, nowMs)) {
        candidate = parsedWolfx;
      }
    }

    if (p2pRes && p2pRes.ok) {
      const p2pJson = await p2pRes.json().catch(() => null);
      if (Array.isArray(p2pJson) && p2pJson.length > 0) {
        const latest556 = p2pJson[0];
        const issueMs = Date.parse(
          String(latest556?.issue?.time || latest556?.time || '').replace(
            /\//g,
            '-'
          )
        );
        const recMs = !Number.isNaN(issueMs) ? issueMs : nowMs;
        const parsed556 = parseP2PEew(latest556, recMs);
        if (
          parsed556 &&
          isEewStillActive(parsed556, nowMs) &&
          shouldReplaceEew(candidate, parsed556)
        ) {
          candidate = parsed556;
        }
      }
    }

    return candidate;
  } catch {
    return null;
  }
}

/**
 * Fetches recent earthquakes and exact seismic intensity station coordinates (`IntensityStation` with `latlon`)
 * from BOTH JMA's official `bosai/quake/data/list.json` AND P2P地震情報 (`codes=551`),
 * merging progressive reports (`震度速報` + `震源に関する情報` + `各地の震度に関する情報`).
 */
export async function fetchRecentEarthquakes(): Promise<{
  earthquakes: EarthquakeReport[];
  live: boolean;
}> {
  const [jmaReports, p2pReports] = await Promise.all([
    (async (): Promise<EarthquakeReport[]> => {
      try {
        const listRes = await fetchWithTimeout(JMA_QUAKE_LIST_URL, 3800);
        if (!listRes.ok) return [];
        const listJson = (await listRes.json()) as Array<Record<string, any>>;
        if (!Array.isArray(listJson) || listJson.length === 0) return [];

        const eidEntriesMap = new Map<string, Array<Record<string, any>>>();
        const orderedEids: string[] = [];

        for (const entry of listJson) {
          const jsonFile = String(entry?.json || '');
          const eid = String(entry?.eid || jsonFile);
          if (!jsonFile || !eid) continue;
          if (!entry.cod && !entry.maxi) continue;
          let arr = eidEntriesMap.get(eid);
          if (!arr) {
            if (orderedEids.length >= 10) continue;
            arr = [];
            eidEntriesMap.set(eid, arr);
            orderedEids.push(eid);
          }
          // Keep up to 2 progressive entries per eid (e.g., VXSE52 震源情報 + VXSE51 震度速報)
          if (arr.length === 0) {
            arr.push(entry);
          } else if (
            arr.length === 1 &&
            ((!arr[0].maxi && entry.maxi) || (!arr[0].cod && entry.cod))
          ) {
            arr.push(entry);
          }
        }

        const targetEntries = orderedEids.flatMap(
          (eid) => eidEntriesMap.get(eid) || []
        );

        const detailReports = await Promise.all(
          targetEntries.map(async (entry) => {
            const jsonFile = String(entry.json);
            const cached = cachedJmaQuakeDetails.get(jsonFile);
            if (cached) return cached;
            try {
              const detailRes = await fetchWithTimeout(
                `https://www.jma.go.jp/bosai/quake/data/${jsonFile}`,
                3500
              );
              if (!detailRes.ok) return null;
              const detailData = await detailRes.json();
              const parsed = parseJmaQuakeDetailJson(detailData, entry);
              if (parsed) {
                cachedJmaQuakeDetails.set(jsonFile, parsed);
              }
              return parsed;
            } catch {
              return null;
            }
          })
        );

        return detailReports.filter(
          (r): r is EarthquakeReport => r !== null
        );
      } catch {
        return [];
      }
    })(),
    (async (): Promise<EarthquakeReport[]> => {
      try {
        const res = await fetchWithTimeout(P2P_QUAKE_HISTORY_URL, 3800);
        if (!res.ok) return [];
        const json = (await res.json()) as Array<Record<string, any>>;
        if (!Array.isArray(json)) return [];
        return json
          .map(convertP2PQuakeItem)
          .filter((x): x is EarthquakeReport => x !== null);
      } catch {
        return [];
      }
    })(),
  ]);

  const combined = mergeProgressiveEarthquakeReports([
    ...jmaReports,
    ...p2pReports,
  ]);

  if (combined.length > 0) {
    return { earthquakes: combined.slice(0, 15), live: true };
  }

  return { earthquakes: INITIAL_EARTHQUAKES, live: false };
}

async function fetchJmaOverviewForecast(): Promise<{
  overviewText: string | null;
  live: boolean;
}> {
  try {
    const res = await fetchWithTimeout(
      'https://www.jma.go.jp/bosai/forecast/data/overview_forecast/130000.json',
      3500
    );
    if (!res.ok) return { overviewText: null, live: false };
    const data = await res.json();
    if (data && typeof data.text === 'string') {
      return {
        overviewText: data.text.replace(/\s+/g, ' ').trim(),
        live: true,
      };
    }
    return { overviewText: null, live: false };
  } catch {
    return { overviewText: null, live: false };
  }
}

async function fetchLiveJmaForecasts(): Promise<{
  forecasts: CityForecastItem[];
  live: boolean;
}> {
  try {
    const uniqueOfficeCodes = Array.from(
      new Set(MAJOR_FORECAST_CITY_TARGETS.map((t) => t.officeCode))
    );
    const officeJsonMap = new Map<string, any>();

    await Promise.all(
      uniqueOfficeCodes.map(async (officeCode) => {
        try {
          const res = await fetchWithTimeout(
            `https://www.jma.go.jp/bosai/forecast/data/forecast/${officeCode}.json`,
            3800
          );
          if (!res.ok) return;
          const json = await res.json();
          if (Array.isArray(json) && json.length > 0) {
            officeJsonMap.set(officeCode, json);
          }
        } catch {
          // Ignore individual office fetch errors
        }
      })
    );

    if (officeJsonMap.size === 0) {
      return { forecasts: INITIAL_FORECASTS, live: false };
    }

    const nowMs = Date.now();
    const forecasts = MAJOR_FORECAST_CITY_TARGETS.map((target) => {
      const fallbackCity =
        INITIAL_FORECASTS.find((fc) => fc.id === target.id) ||
        INITIAL_FORECASTS[0];
      const rawJson = officeJsonMap.get(target.officeCode);
      if (!rawJson) return fallbackCity;
      return parseJmaCityForecastJson(rawJson, target, fallbackCity, nowMs);
    });

    return { forecasts, live: true };
  } catch {
    return { forecasts: INITIAL_FORECASTS, live: false };
  }
}

function loadCachedTyphoons24h(): TyphoonReport[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(TYPHOON_24H_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(
      (tc: any) =>
        tc &&
        typeof tc.id === 'string' &&
        Array.isArray(tc.points) &&
        tc.points.length > 0 &&
        now - Number(tc.lastSeenMs || 0) <= TYPHOON_RETENTION_MS
    );
  } catch {
    return [];
  }
}

function saveCachedTyphoons24h(reports: TyphoonReport[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(TYPHOON_24H_CACHE_KEY, JSON.stringify(reports));
  } catch {
    // ignore storage errors
  }
}

async function fetchLiveJmaTyphoons(): Promise<{
  typhoons: TyphoonReport[];
  live: boolean;
}> {
  const recentCached = loadCachedTyphoons24h();
  try {
    const res = await fetchWithTimeout(JMA_TYPHOON_TARGET_URL, 3500);
    if (!res.ok) {
      return {
        typhoons: recentCached.length > 0 ? recentCached : INITIAL_TYPHOONS,
        live: recentCached.length > 0,
      };
    }
    const targetList = (await res.json()) as Array<{
      tropicalCyclone?: string;
    }>;

    const parsedReports = Array.isArray(targetList)
      ? await Promise.all(
          targetList.map(async (item) => {
            const tcId = item.tropicalCyclone;
            if (!tcId) return null;
            try {
              const [specRes, fcRes] = await Promise.all([
                fetchWithTimeout(
                  `https://www.jma.go.jp/bosai/typhoon/data/${tcId}/specifications.json`,
                  3500
                ),
                fetchWithTimeout(
                  `https://www.jma.go.jp/bosai/typhoon/data/${tcId}/forecast.json`,
                  3500
                ).catch(() => null),
              ]);
              if (!specRes.ok) return null;
              const rawSpecs = await specRes.json();
              const rawForecast =
                fcRes && fcRes.ok ? await fcRes.json().catch(() => undefined) : undefined;
              return parseJmaTyphoonSpecifications(rawSpecs, tcId, rawForecast);
            } catch {
              return null;
            }
          })
        )
      : [];

    const validReports = parsedReports.filter(
      (r): r is TyphoonReport => r !== null
    );

    // Merge live reports with any typhoon/tropical depression seen within the last 24 hours
    // so that weakened tropical/extratropical cyclones keep their trajectory visible for ~1 day.
    const mergedMap = new Map<string, TyphoonReport>();
    for (const liveTc of validReports) {
      mergedMap.set(liveTc.id, { ...liveTc, lastSeenMs: Date.now() });
    }
    for (const cachedTc of recentCached) {
      if (!mergedMap.has(cachedTc.id)) {
        mergedMap.set(cachedTc.id, cachedTc);
      }
    }

    const mergedList = Array.from(mergedMap.values());
    if (mergedList.length > 0) {
      saveCachedTyphoons24h(mergedList);
      return {
        typhoons: mergedList,
        live: true,
      };
    }
    return { typhoons: INITIAL_TYPHOONS, live: false };
  } catch {
    return {
      typhoons: recentCached.length > 0 ? recentCached : INITIAL_TYPHOONS,
      live: recentCached.length > 0,
    };
  }
}

async function fetchLiveTsunami(): Promise<{
  tsunami: TsunamiForecastReport | null;
  live: boolean;
}> {
  // 1. Primary: Official JMA bosai/tsunami/data/list.json
  try {
    const res = await fetchWithTimeout(JMA_TSUNAMI_LIST_URL, 4000);
    if (res.ok) {
      const list = (await res.json()) as Array<Record<string, any>>;
      if (Array.isArray(list) && list.length > 0) {
        const target =
          list.find(
            (it) =>
              it.json &&
              it.ift !== '取消' &&
              (it.ttl?.includes('津波') || it.ift === '発表')
          ) || list[0];
        if (target && target.json) {
          const detailRes = await fetchWithTimeout(
            `https://www.jma.go.jp/bosai/tsunami/data/${target.json}`,
            3500
          );
          if (detailRes.ok) {
            const detail = await detailRes.json();
            const parsed = parseJmaTsunamiDetail(detail);
            if (parsed && isTsunamiForecastActive(parsed)) {
              return { tsunami: parsed, live: true };
            }
          }
        }
      }
    }
  } catch {
    // Fall through to P2PQuake
  }

  // 2. Secondary: P2PQuake code 552
  try {
    const res = await fetchWithTimeout(P2P_TSUNAMI_HISTORY_URL, 3500);
    if (res.ok) {
      const list = (await res.json()) as Array<Record<string, any>>;
      if (Array.isArray(list) && list.length > 0) {
        for (const item of list) {
          const parsed = parseP2PTsunami(item);
          if (parsed && isTsunamiForecastActive(parsed)) {
            return { tsunami: parsed, live: true };
          }
        }
      }
    }
  } catch {
    // Ignore
  }

  return { tsunami: null, live: false };
}

/**
 * Fetches all JMA XML & JSON feeds at low frequency (every 5 minutes) and returns a unified bundle.
 */
export async function fetchMonitorDataBundle(): Promise<MonitorDataBundle> {
  const [
    eqvolXml,
    extraXml,
    regularXml,
    nowcastRes,
    liveWarningsRes,
    liveTyphoonsRes,
    liveAmedasRes,
    quakeRes,
    tsunamiRes,
    liveForecastsRes,
    tokyoOverview,
  ] = await Promise.all([
    fetchSingleJmaXmlFeed('eqvol'),
    fetchSingleJmaXmlFeed('extra'),
    fetchSingleJmaXmlFeed('regular'),
    fetchNowcastAndLightning(),
    fetchLiveJmaWarnings(),
    fetchLiveJmaTyphoons(),
    fetchLiveAmedasData(),
    fetchRecentEarthquakes(),
    fetchLiveTsunami(),
    fetchLiveJmaForecasts(),
    fetchJmaOverviewForecast(),
  ]);

  const liveXmlEntries = [
    ...eqvolXml.entries,
    ...extraXml.entries,
    ...regularXml.entries,
  ].sort((a, b) => b.updated.localeCompare(a.updated));

  const xmlEntries =
    liveXmlEntries.length > 0 ? liveXmlEntries : INITIAL_XML_ENTRIES;

  const forecasts = liveForecastsRes.forecasts.map((fc) => {
    if (fc.id === 'fc-130000' && tokyoOverview.overviewText) {
      return {
        ...fc,
        overviewText: tokyoOverview.overviewText,
      };
    }
    return fc;
  });

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  return {
    xmlEntries,
    nowcastTimes: nowcastRes.times,
    lightningPoints: nowcastRes.lightningPoints,
    warnings: liveWarningsRes.warnings,
    municipalityWarnings: liveWarningsRes.municipalityWarnings,
    muniSeverityMap: liveWarningsRes.muniSeverityMap,
    prefSeverityMap: liveWarningsRes.prefSeverityMap,
    typhoons: liveTyphoonsRes.typhoons,
    bulletins: INITIAL_WEATHER_BULLETINS,
    amedas: liveAmedasRes.amedas,
    volcanoes: INITIAL_VOLCANOES,
    tsunamiStations: INITIAL_TSUNAMI_STATIONS,
    tsunamiForecast: tsunamiRes.tsunami ?? INITIAL_TSUNAMI_FORECAST,
    forecasts,
    earthquakes: quakeRes.earthquakes,
    lastXmlFetchTime: `${hh}:${mm}:${ss}`,
    dataSourceStatus: {
      jmaXmlLive: eqvolXml.live || extraXml.live || regularXml.live,
      jmaBosaiLive:
        nowcastRes.live ||
        liveWarningsRes.live ||
        liveTyphoonsRes.live ||
        liveAmedasRes.live ||
        liveForecastsRes.live ||
        tokyoOverview.live ||
        tsunamiRes.live,
      p2pQuakeLive: quakeRes.live,
    },
  };
}

