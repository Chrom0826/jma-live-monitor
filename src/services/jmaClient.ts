import {
  INITIAL_AMEDAS_STATIONS,
  INITIAL_EARTHQUAKES,
  INITIAL_FORECASTS,
  INITIAL_LIGHTNING_POINTS,
  INITIAL_NOWCAST_TIMES,
  INITIAL_PREF_SEVERITY_MAP,
  INITIAL_TSUNAMI_STATIONS,
  INITIAL_TYPHOONS,
  INITIAL_VOLCANOES,
  INITIAL_WARNINGS,
  INITIAL_WEATHER_BULLETINS,
  INITIAL_XML_ENTRIES,
} from '../data/fallbackData';
import {
  AmedasStationData,
  EarthquakeReport,
  EarthquakeStationIntensity,
  JmaXmlEntry,
  LightningPoint,
  MonitorDataBundle,
  NowcastTimeEntry,
  RegionalWarningItem,
  RegionId,
  TyphoonReport,
  WarningSeverity,
  XmlFeedType,
} from '../types/jma';
import {
  formatSeismicScale,
  parseJmaAmedasNationwide,
  parseJmaAtomXml,
  parseJmaQuakeDetailJson,
  parseJmaTyphoonSpecifications,
  parseJmaWarningMapData,
  PREFECTURE_NAMES,
} from '../utils/jmaParser';

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
  'https://www.jma.go.jp/bosai/warning/data/warning/map.json';
const JMA_TYPHOON_TARGET_URL =
  'https://www.jma.go.jp/bosai/typhoon/data/targetTc.json';
const JMA_AMEDAS_TABLE_URL =
  'https://www.jma.go.jp/bosai/amedas/const/amedastable.json';
const JMA_AMEDAS_LATEST_TIME_URL =
  'https://www.jma.go.jp/bosai/amedas/data/latest_time.txt';
const JMA_QUAKE_LIST_URL =
  'https://www.jma.go.jp/bosai/quake/data/list.json';
const P2P_QUAKE_HISTORY_URL =
  'https://api.p2pquake.net/v2/history?codes=551&limit=20';

let cachedAmedasTable: Record<string, any> | null = null;
const cachedJmaQuakeDetails = new Map<string, EarthquakeReport>();

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

    // Find latest thns and liden timestamps from N3
    const thnsEntries = dataN3
      .filter((item) => Array.isArray(item.elements) && item.elements.includes('thns'))
      .sort((a, b) => a.validtime.localeCompare(b.validtime));
    const latestThns = thnsEntries[thnsEntries.length - 1];

    const sortedPast = [...dataN1]
      .sort((a, b) => a.validtime.localeCompare(b.validtime))
      .slice(-5)
      .map((item, idx, arr) => ({
        basetime: item.basetime,
        validtime: item.validtime,
        label:
          idx === arr.length - 1
            ? `${formatUtcTimestampToJst(item.validtime)} (最新実況)`
            : `${formatUtcTimestampToJst(item.validtime)} (実況)`,
        isForecast: false,
        thnsBasetime: latestThns?.basetime,
        thnsValidtime: latestThns?.validtime,
      }));

    const sortedForecast = [...dataN2]
      .sort((a, b) => a.validtime.localeCompare(b.validtime))
      .slice(0, 3)
      .map((item) => ({
        basetime: item.basetime,
        validtime: item.validtime,
        label: `${formatUtcTimestampToJst(item.validtime)} (高解像度予測)`,
        isForecast: true,
        thnsBasetime: latestThns?.basetime,
        thnsValidtime: latestThns?.validtime,
      }));

    // Fetch latest liden GeoJSON points if available
    const lidenEntries = dataN3
      .filter((item) => Array.isArray(item.elements) && item.elements.includes('liden'))
      .sort((a, b) => b.validtime.localeCompare(a.validtime))
      .slice(0, 3);

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
                };
              })
              .filter((p: LightningPoint | null): p is LightningPoint => p !== null);
          } catch {
            return [];
          }
        })
      );
      lightningPoints = lidenResults.flat().slice(0, 80);
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
 * Fetches live JMA nationwide warnings/advisories from `warning/data/warning/map.json`
 * so all 47 prefectures are accurately colored and listed in the NERV right strip.
 */
async function fetchLiveJmaWarnings(): Promise<{
  warnings: RegionalWarningItem[];
  prefSeverityMap: Record<number, WarningSeverity>;
  live: boolean;
}> {
  try {
    const res = await fetchWithTimeout(JMA_WARNING_MAP_URL, 4500);
    if (!res.ok) {
      return {
        warnings: INITIAL_WARNINGS,
        prefSeverityMap: INITIAL_PREF_SEVERITY_MAP,
        live: false,
      };
    }
    const rawJson = await res.json();
    const parsed = parseJmaWarningMapData(rawJson);
    if (parsed.warnings.length > 0) {
      return {
        warnings: parsed.warnings,
        prefSeverityMap: parsed.prefSeverityMap,
        live: true,
      };
    }
    return {
      warnings: INITIAL_WARNINGS,
      prefSeverityMap: INITIAL_PREF_SEVERITY_MAP,
      live: false,
    };
  } catch {
    return {
      warnings: INITIAL_WARNINGS,
      prefSeverityMap: INITIAL_PREF_SEVERITY_MAP,
      live: false,
    };
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
    const timeLabel =
      latestIso.length >= 16 ? `${latestIso.slice(11, 16)} 実況` : '最新実況';

    const mapRes = await fetchWithTimeout(
      `https://www.jma.go.jp/bosai/amedas/data/map/${ts14}.json`,
      4500
    );
    if (!mapRes.ok) {
      return { amedas: INITIAL_AMEDAS_STATIONS, live: false };
    }
    const mapJson = await mapRes.json();
    const stations = parseJmaAmedasNationwide(tableData, mapJson, timeLabel);
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
    const hypocenterName = hypo.name || '震源調査中';
    const maxScaleCode = typeof eq.maxScale === 'number' ? eq.maxScale : 10;
    const rawPoints = Array.isArray(item.points) ? item.points : [];
    const hypoLat =
      typeof hypo.latitude === 'number' && hypo.latitude > 0
        ? hypo.latitude
        : 35.68;
    const hypoLon =
      typeof hypo.longitude === 'number' && hypo.longitude > 0
        ? hypo.longitude
        : 139.76;

    const stations: EarthquakeStationIntensity[] = [];
    for (let i = 0; i < Math.min(rawPoints.length, 45); i++) {
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

    return {
      id: String(item.id || `p2p-${eq.time}`),
      issueTime: `${item.issue?.time || eq.time || ''} 発表`,
      occurrenceTime: `${eq.time || ''} 頃発生`,
      hypocenterName,
      regionId: guessRegionFromName(hypocenterName),
      lat: hypoLat,
      lon: hypoLon,
      depthKm: typeof hypo.depth === 'number' && hypo.depth >= 0 ? hypo.depth : 10,
      magnitude:
        typeof hypo.magnitude === 'number' && hypo.magnitude >= 0
          ? Number(hypo.magnitude.toFixed(1))
          : 4.0,
      maxScaleCode,
      maxScaleLabel: formatSeismicScale(maxScaleCode),
      domesticTsunami:
        TSUNAMI_LABEL_MAP[eq.domesticTsunami] ||
        'この地震による津波の心配はありません。',
      foreignTsunami: eq.foreignTsunami || 'なし',
      sourceOffice: item.issue?.source || '気象庁（P2P地震情報経由）',
      stations:
        stations.length > 0
          ? stations
          : [
              {
                prefecture: hypocenterName,
                city: '震源周辺地域',
                stationName: '各地の検震点',
                scaleCode: maxScaleCode,
                scaleLabel: formatSeismicScale(maxScaleCode),
                lat: hypoLat,
                lon: hypoLon,
              },
            ],
    };
  } catch {
    return null;
  }
}

/**
 * Fetches recent earthquakes and exact seismic intensity station coordinates (`IntensityStation` with `latlon`)
 * directly from JMA's official `bosai/quake/data/list.json` and detail JSONs, with fallback to P2PQuake.
 */
async function fetchRecentEarthquakes(): Promise<{
  earthquakes: EarthquakeReport[];
  live: boolean;
}> {
  // 1. Primary: Official JMA Bosai Earthquake JSON (includes exact lat/lon for every seismic intensity meter)
  try {
    const listRes = await fetchWithTimeout(JMA_QUAKE_LIST_URL, 4000);
    if (listRes.ok) {
      const listJson = (await listRes.json()) as Array<Record<string, any>>;
      if (Array.isArray(listJson) && listJson.length > 0) {
        const seenEids = new Set<string>();
        const targetEntries: Array<Record<string, any>> = [];

        for (const entry of listJson) {
          const jsonFile = String(entry?.json || '');
          const eid = String(entry?.eid || jsonFile);
          if (!jsonFile || !eid || seenEids.has(eid)) continue;
          // Prefer entries that have both hypocenter (cod) and intensity (maxi)
          if (!entry.cod && !entry.maxi) continue;
          seenEids.add(eid);
          targetEntries.push(entry);
          if (targetEntries.length >= 10) break;
        }

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

        const validReports = detailReports.filter(
          (r): r is EarthquakeReport => r !== null
        );
        if (validReports.length > 0) {
          return { earthquakes: validReports, live: true };
        }
      }
    }
  } catch {
    // Fall through to P2PQuake fallback
  }

  // 2. Secondary fallback: P2PQuake API
  try {
    const res = await fetchWithTimeout(P2P_QUAKE_HISTORY_URL, 4000);
    if (!res.ok) {
      return { earthquakes: INITIAL_EARTHQUAKES, live: false };
    }
    const json = (await res.json()) as Array<Record<string, any>>;
    const parsed = json
      .map(convertP2PQuakeItem)
      .filter((x): x is EarthquakeReport => x !== null);
    if (parsed.length > 0) {
      return { earthquakes: parsed, live: true };
    }
    return { earthquakes: INITIAL_EARTHQUAKES, live: false };
  } catch {
    return { earthquakes: INITIAL_EARTHQUAKES, live: false };
  }
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

async function fetchLiveJmaTyphoons(): Promise<{
  typhoons: TyphoonReport[];
  live: boolean;
}> {
  try {
    const res = await fetchWithTimeout(JMA_TYPHOON_TARGET_URL, 3500);
    if (!res.ok) {
      return { typhoons: INITIAL_TYPHOONS, live: false };
    }
    const targetList = (await res.json()) as Array<{
      tropicalCyclone?: string;
    }>;
    if (!Array.isArray(targetList) || targetList.length === 0) {
      return { typhoons: INITIAL_TYPHOONS, live: false };
    }

    const parsedReports = await Promise.all(
      targetList.map(async (item) => {
        const tcId = item.tropicalCyclone;
        if (!tcId) return null;
        try {
          const specRes = await fetchWithTimeout(
            `https://www.jma.go.jp/bosai/typhoon/data/${tcId}/specifications.json`,
            3500
          );
          if (!specRes.ok) return null;
          const rawSpecs = await specRes.json();
          return parseJmaTyphoonSpecifications(rawSpecs, tcId);
        } catch {
          return null;
        }
      })
    );

    const validReports = parsedReports.filter(
      (r): r is TyphoonReport => r !== null
    );
    if (validReports.length > 0) {
      return {
        typhoons: validReports,
        live: true,
      };
    }
    return { typhoons: INITIAL_TYPHOONS, live: false };
  } catch {
    return { typhoons: INITIAL_TYPHOONS, live: false };
  }
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
    fetchJmaOverviewForecast(),
  ]);

  const liveXmlEntries = [
    ...eqvolXml.entries,
    ...extraXml.entries,
    ...regularXml.entries,
  ].sort((a, b) => b.updated.localeCompare(a.updated));

  const xmlEntries =
    liveXmlEntries.length > 0 ? liveXmlEntries : INITIAL_XML_ENTRIES;

  const forecasts = INITIAL_FORECASTS.map((fc) => {
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
    prefSeverityMap: liveWarningsRes.prefSeverityMap,
    typhoons: liveTyphoonsRes.typhoons,
    bulletins: INITIAL_WEATHER_BULLETINS,
    amedas: liveAmedasRes.amedas,
    volcanoes: INITIAL_VOLCANOES,
    tsunamiStations: INITIAL_TSUNAMI_STATIONS,
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
        tokyoOverview.live,
      p2pQuakeLive: quakeRes.live,
    },
  };
}

