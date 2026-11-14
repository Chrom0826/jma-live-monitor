/**
 * Fast prefecture + municipality coordinate lookup for resolving P2PQuake / JMA
 * station addresses (e.g. "北海道" + "標津町北２条") to exact municipality centroids
 * instead of falling back to the prefecture capital (e.g. Sapporo).
 */

export interface RawTopoMunicipalityFeature {
  c: string;
  n: string;
  p: number;
  l: [number, number] | null; // [lon, lat]
}

interface MunicipalityIndexEntry {
  code: string;
  name: string;
  prefId: number;
  lat: number;
  lon: number;
}

interface MunicipalityPrefixGroup {
  prefix: string;
  lat: number;
  lon: number;
  codes: string[];
}

export interface ResolvedMunicipalityPoint {
  muniCode: string;
  muniName: string;
  lat: number;
  lon: number;
  /** True when the coordinate represents a single exact class20 municipality. */
  isExactClass20: boolean;
}

const PREF_NAME_TO_ID: Record<string, number> = {
  北海道: 1,
  青森: 2,
  岩手: 3,
  宮城: 4,
  秋田: 5,
  山形: 6,
  福島: 7,
  茨城: 8,
  栃木: 9,
  群馬: 10,
  埼玉: 11,
  千葉: 12,
  東京: 13,
  神奈川: 14,
  新潟: 15,
  富山: 16,
  石川: 17,
  福井: 18,
  山梨: 19,
  長野: 20,
  岐阜: 21,
  静岡: 22,
  愛知: 23,
  三重: 24,
  滋賀: 25,
  京都: 26,
  大阪: 27,
  兵庫: 28,
  奈良: 29,
  和歌山: 30,
  鳥取: 31,
  島根: 32,
  岡山: 33,
  広島: 34,
  山口: 35,
  徳島: 36,
  香川: 37,
  愛媛: 38,
  高知: 39,
  福岡: 40,
  佐賀: 41,
  長崎: 42,
  熊本: 43,
  大分: 44,
  宮崎: 45,
  鹿児島: 46,
  沖縄: 47,
};

const DESIGNATED_CITY_WARD_RE =
  /^(札幌|仙台|さいたま|千葉|横浜|川崎|相模原|新潟|静岡|浜松|名古屋|京都|大阪|堺|神戸|岡山|広島|北九州|福岡|熊本)([^市].*区)/;

let byPrefExact = new Map<number, MunicipalityIndexEntry[]>();
let byPrefCityPrefix = new Map<number, MunicipalityPrefixGroup[]>();
let byCode = new Map<string, { lat: number; lon: number; name: string }>();
let isLoaded = false;

let sharedTopoJsonPromise: Promise<any | null> | null = null;

function resolvePrefId(pref: string): number {
  const norm = String(pref || '')
    .trim()
    .replace(/(都|府|県)$/, '');
  return PREF_NAME_TO_ID[norm] || 0;
}

function normalizeLookupText(s: string): string {
  return String(s || '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s\u3000]+/g, '')
    .trim();
}

/**
 * Populates the in-memory municipality index from decoded or raw
 * `jma-class20-topo.json` features.
 */
export function registerMunicipalityEntries(
  features: ReadonlyArray<RawTopoMunicipalityFeature>
): void {
  if (!Array.isArray(features) || features.length === 0) return;

  const exactMap = new Map<number, MunicipalityIndexEntry[]>();
  const prefixAccum = new Map<
    number,
    Map<string, { sumLat: number; sumLon: number; codes: string[] }>
  >();
  const codeMap = new Map<string, { lat: number; lon: number; name: string }>();

  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    if (!f || !f.c || !f.n || !Array.isArray(f.l) || f.l.length < 2) continue;
    const prefId = Number(f.p || 0);
    const lon = Number(f.l[0]);
    const lat = Number(f.l[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    codeMap.set(f.c, { lat, lon, name: f.n });

    // Skip non-prefecture territories (e.g. prefId === 0 / hoppo) when matching domestic stations
    if (prefId < 1 || prefId > 47) continue;

    const entry: MunicipalityIndexEntry = {
      code: f.c,
      name: f.n,
      prefId,
      lat,
      lon,
    };

    let list = exactMap.get(prefId);
    if (!list) {
      list = [];
      exactMap.set(prefId, list);
    }
    list.push(entry);

    // Group split city areas such as "仙台市東部"/"仙台市西部", "津市東部"/"津市中西部", "横浜市北部"
    const cityRootMatch = /^(.+?市)(.+)$/.exec(f.n);
    if (cityRootMatch && !cityRootMatch[2].endsWith('区')) {
      const rootCity = cityRootMatch[1];
      let prefAcc = prefixAccum.get(prefId);
      if (!prefAcc) {
        prefAcc = new Map();
        prefixAccum.set(prefId, prefAcc);
      }
      let grp = prefAcc.get(rootCity);
      if (!grp) {
        grp = { sumLat: 0, sumLon: 0, codes: [] };
        prefAcc.set(rootCity, grp);
      }
      grp.sumLat += lat;
      grp.sumLon += lon;
      grp.codes.push(f.c);
    } else if (cityRootMatch && cityRootMatch[2].endsWith('区')) {
      // Also allow designated-city root (e.g. "広島市") fallback when ward isn't matched individually
      const rootCity = cityRootMatch[1];
      let prefAcc = prefixAccum.get(prefId);
      if (!prefAcc) {
        prefAcc = new Map();
        prefixAccum.set(prefId, prefAcc);
      }
      let grp = prefAcc.get(rootCity);
      if (!grp) {
        grp = { sumLat: 0, sumLon: 0, codes: [] };
        prefAcc.set(rootCity, grp);
      }
      grp.sumLat += lat;
      grp.sumLon += lon;
      grp.codes.push(f.c);
    }
  }

  for (const list of exactMap.values()) {
    list.sort((a, b) => b.name.length - a.name.length);
  }

  const prefixMap = new Map<number, MunicipalityPrefixGroup[]>();
  for (const [prefId, acc] of prefixAccum.entries()) {
    const groups: MunicipalityPrefixGroup[] = [];
    for (const [prefix, g] of acc.entries()) {
      if (g.codes.length === 0) continue;
      groups.push({
        prefix,
        lat: Number((g.sumLat / g.codes.length).toFixed(4)),
        lon: Number((g.sumLon / g.codes.length).toFixed(4)),
        codes: g.codes,
      });
    }
    groups.sort((a, b) => b.prefix.length - a.prefix.length);
    prefixMap.set(prefId, groups);
  }

  byPrefExact = exactMap;
  byPrefCityPrefix = prefixMap;
  byCode = codeMap;
  isLoaded = true;
}

export function isMunicipalityLookupLoaded(): boolean {
  return isLoaded;
}

export function resetMunicipalityLookupForTest(): void {
  byPrefExact = new Map();
  byPrefCityPrefix = new Map();
  byCode = new Map();
  isLoaded = false;
  sharedTopoJsonPromise = null;
}

/** Look up center `[lat, lon]` directly by JMA 7-digit class20 municipality code. */
export function getMunicipalityCoordsByCode(
  code: string
): { lat: number; lon: number; name: string } | null {
  return byCode.get(String(code || '').trim()) ?? null;
}

/**
 * Fetches `geo/jma-class20-topo.json` once, populates the municipality index,
 * and returns the raw JSON object (shared with `MonitorMap` to avoid duplicate downloads).
 */
export function fetchSharedJmaTopoFile(
  baseUrl?: string
): Promise<any | null> {
  if (sharedTopoJsonPromise) return sharedTopoJsonPromise;
  if (typeof fetch !== 'function') return Promise.resolve(null);

  const resolvedBase =
    baseUrl ??
    (typeof import.meta !== 'undefined' &&
    typeof (import.meta as any).env?.BASE_URL === 'string'
      ? (import.meta as any).env.BASE_URL
      : '/');
  const url = `${resolvedBase}geo/jma-class20-topo.json`;

  // Relative URLs (e.g. "/geo/...") are only valid inside browser origins; skip in raw Node tests
  if (typeof window === 'undefined' && !/^https?:/i.test(url)) {
    return Promise.resolve(null);
  }

  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 6000) : null;

  sharedTopoJsonPromise = fetch(
    url,
    controller ? { signal: controller.signal } : undefined
  )
    .then((r) => (r.ok ? r.json() : null))
    .then((file) => {
      if (file && Array.isArray(file.features)) {
        registerMunicipalityEntries(file.features);
      }
      return file;
    })
    .catch(() => {
      sharedTopoJsonPromise = null;
      return null;
    })
    .finally(() => {
      if (timer) clearTimeout(timer);
    });

  return sharedTopoJsonPromise;
}

export async function ensureMunicipalityLookupLoaded(): Promise<boolean> {
  if (isLoaded) return true;
  await fetchSharedJmaTopoFile();
  return isLoaded;
}

function matchInLists(
  candidate: string,
  exactList: MunicipalityIndexEntry[],
  prefixList: MunicipalityPrefixGroup[]
): ResolvedMunicipalityPoint | null {
  for (let i = 0; i < exactList.length; i++) {
    const e = exactList[i];
    if (candidate.startsWith(e.name)) {
      return {
        muniCode: e.code,
        muniName: e.name,
        lat: e.lat,
        lon: e.lon,
        isExactClass20: true,
      };
    }
  }
  for (let i = 0; i < prefixList.length; i++) {
    const g = prefixList[i];
    if (candidate.startsWith(g.prefix)) {
      return {
        muniCode: g.codes[0],
        muniName: g.prefix,
        lat: g.lat,
        lon: g.lon,
        isExactClass20: g.codes.length === 1,
      };
    }
  }
  return null;
}

/**
 * Resolves a P2PQuake `points[]` observation point (`pref`, `addr`) to its real
 * JMA `class20` municipality coordinate (e.g. `北海道` + `標津町北２条` -> `0169300` `標津町`).
 */
export function resolveMunicipalityFromP2PPoint(
  pref: string,
  addr: string
): ResolvedMunicipalityPoint | null {
  if (!isLoaded) return null;
  const prefId = resolvePrefId(pref);
  if (!prefId) return null;

  const exactList = byPrefExact.get(prefId) || [];
  const prefixList = byPrefCityPrefix.get(prefId) || [];
  if (exactList.length === 0 && prefixList.length === 0) return null;

  const raw = normalizeLookupText(addr);
  if (!raw) return null;

  const candidates: string[] = [raw];

  // Handle "横浜西区...", "札幌中央区...", "仙台青葉区..." -> "横浜市西区...", "札幌市中央区...", ...
  const designatedMatch = DESIGNATED_CITY_WARD_RE.exec(raw);
  if (designatedMatch) {
    candidates.push(`${designatedMatch[1]}市${designatedMatch[2]}${raw.slice(designatedMatch[0].length)}`);
  }

  // Handle Tokyo 23 wards / Tama / Islands ("東京千代田区..." -> "千代田区...", "東京都大島町..." -> "大島町...")
  if (prefId === 13) {
    if (raw.startsWith('東京都')) {
      candidates.push(raw.slice(3));
    } else if (raw.startsWith('東京')) {
      candidates.push(raw.slice(2));
    }
  }

  // Handle "上川郡東川町..." or "南津軽郡藤崎町..." after checking direct prefixes
  const gunStripped = raw.replace(/^[^都道府県市区町村]+郡/, '');
  if (gunStripped && gunStripped !== raw) {
    candidates.push(gunStripped);
  }

  for (let i = 0; i < candidates.length; i++) {
    const hit = matchInLists(candidates[i], exactList, prefixList);
    if (hit) return hit;
  }

  // Substring fallback (longest municipality name first) for special island station prefixes (e.g. 伊豆大島..., 薩摩川内...)
  for (let i = 0; i < exactList.length; i++) {
    const e = exactList[i];
    if (e.name.length >= 2 && raw.includes(e.name)) {
      return {
        muniCode: e.code,
        muniName: e.name,
        lat: e.lat,
        lon: e.lon,
        isExactClass20: true,
      };
    }
  }
  for (let i = 0; i < prefixList.length; i++) {
    const g = prefixList[i];
    if (g.prefix.length >= 2 && raw.includes(g.prefix)) {
      return {
        muniCode: g.codes[0],
        muniName: g.prefix,
        lat: g.lat,
        lon: g.lon,
        isExactClass20: g.codes.length === 1,
      };
    }
  }

  return null;
}
