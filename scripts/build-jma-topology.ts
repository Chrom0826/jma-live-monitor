/**
 * Build-time generator for `public/geo/jma-class20-topo.json`.
 *
 * Why:
 *   The JMA warning areas (`class20s`, 1,806 市町村等) used to be fetched at runtime as 10 raw GeoJSON
 *   files (~3.1 MB) and every polygon was decimated *independently*. Shared borders between neighbours
 *   were therefore simplified differently on each side, producing slivers / overlaps / jagged
 *   "noise" lines while zooming.
 *
 * What this script does:
 *   1. Downloads `class20s_0..9.json` + `area.json` from JMA.
 *   2. Builds a TopoJSON topology (each shared border becomes ONE arc used by both neighbours).
 *   3. Projects every arc vertex to Web Mercator and computes a Visvalingam effective area per vertex.
 *      From that area we derive the minimum zoom at which the vertex becomes visible (< ~0.5 px² error).
 *      Because simplification happens per *arc*, both sides of a border always use identical vertices
 *      at every zoom level -> no gaps, no overlaps, no flicker.
 *   4. Writes a compact JSON (delta-encoded integer coordinates + one char per vertex for the LOD level).
 *
 * Run:  npx tsx scripts/build-jma-topology.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { topology } from 'topojson-server';
import { resolveWarningDivision } from '../src/utils/jmaParser';
import {
  TOPO_COORD_SCALE,
  TOPO_LEVEL_CHAR_OFFSET,
  TOPO_LEVEL_STEPS_PER_ZOOM,
  TOPO_MAX_ZOOM,
  type JmaTopoFile,
} from '../src/utils/jmaTopology';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '../public/geo/jma-class20-topo.json');

/** Visvalingam area threshold in screen px² at the target zoom. */
const AREA_THRESHOLD_PX2 = 0.5;
const MIN_ZOOM = 2;

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function lonLatToNorm(lon: number, lat: number): [number, number] {
  const MAX = 85.0511287798;
  const la = Math.max(-MAX, Math.min(MAX, lat));
  const s = Math.sin((la * Math.PI) / 180);
  return [lon / 360 + 0.5, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
}

/** Visvalingam effective area (in normalized² units) for each vertex of an open polyline. */
function visvalingamAreas(xs: Float64Array, ys: Float64Array): Float64Array {
  const n = xs.length;
  const area = new Float64Array(n).fill(Infinity);
  if (n <= 2) return area;
  const prev = new Int32Array(n);
  const next = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    prev[i] = i - 1;
    next[i] = i + 1;
  }
  const tri = (i: number) => {
    const a = prev[i];
    const b = next[i];
    return (
      Math.abs(
        (xs[a] - xs[i]) * (ys[b] - ys[i]) - (xs[b] - xs[i]) * (ys[a] - ys[i])
      ) / 2
    );
  };
  // Binary min-heap of [area, index] with lazy invalidation
  const heapA: number[] = [];
  const heapI: number[] = [];
  const push = (a: number, i: number) => {
    heapA.push(a);
    heapI.push(i);
    let c = heapA.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heapA[p] <= heapA[c]) break;
      [heapA[p], heapA[c]] = [heapA[c], heapA[p]];
      [heapI[p], heapI[c]] = [heapI[c], heapI[p]];
      c = p;
    }
  };
  const pop = (): [number, number] => {
    const topA = heapA[0];
    const topI = heapI[0];
    const lastA = heapA.pop()!;
    const lastI = heapI.pop()!;
    if (heapA.length > 0) {
      heapA[0] = lastA;
      heapI[0] = lastI;
      let p = 0;
      for (;;) {
        const l = 2 * p + 1;
        const r = l + 1;
        let m = p;
        if (l < heapA.length && heapA[l] < heapA[m]) m = l;
        if (r < heapA.length && heapA[r] < heapA[m]) m = r;
        if (m === p) break;
        [heapA[p], heapA[m]] = [heapA[m], heapA[p]];
        [heapI[p], heapI[m]] = [heapI[m], heapI[p]];
        p = m;
      }
    }
    return [topA, topI];
  };
  const current = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    current[i] = tri(i);
    push(current[i], i);
  }
  const removed = new Uint8Array(n);
  let maxSoFar = 0;
  while (heapA.length > 0) {
    const [a, i] = pop();
    if (removed[i] || a !== current[i]) continue;
    removed[i] = 1;
    // Monotonic effective area (a vertex can never be less important than one removed before it)
    maxSoFar = Math.max(maxSoFar, a);
    area[i] = maxSoFar;
    const p = prev[i];
    const nx = next[i];
    next[p] = nx;
    prev[nx] = p;
    if (p > 0) {
      current[p] = tri(p);
      push(current[p], p);
    }
    if (nx < n - 1) {
      current[nx] = tri(nx);
      push(current[nx], nx);
    }
  }
  return area;
}

async function main() {
  console.log('Downloading JMA class20s + area.json ...');
  const [areaJson, ...parts] = await Promise.all([
    fetchJson('https://www.jma.go.jp/bosai/common/const/area.json'),
    ...Array.from({ length: 10 }, (_, i) =>
      fetchJson(
        `https://www.jma.go.jp/bosai/common/const/geojson/class20s_${i}.json`
      )
    ),
  ]);
  const features: any[] = parts.flatMap((p: any) => p.features || []);
  console.log(`features: ${features.length}`);

  const topo: any = topology({ c: { type: 'FeatureCollection', features } as any });
  const rawArcs: number[][][] = topo.arcs;
  const geoms: any[] = topo.objects.c.geometries;

  const worldPx = (z: number) => 256 * Math.pow(2, z);
  const outArcs: number[][] = [];
  const outLevels: string[] = [];
  let totalPts = 0;
  const levelHist = new Map<number, number>();

  for (const arc of rawArcs) {
    const n = arc.length;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const [x, y] = lonLatToNorm(arc[i][0], arc[i][1]);
      xs[i] = x;
      ys[i] = y;
    }
    const areas = visvalingamAreas(xs, ys);
    // Closed single-arc rings (islands): keep the vertex farthest from the start and the one most
    // important in between so the ring never collapses below a triangle.
    const closed = n > 3 && xs[0] === xs[n - 1] && ys[0] === ys[n - 1];
    if (closed) {
      let far = 1;
      let farD = -1;
      for (let i = 1; i < n - 1; i++) {
        const d = (xs[i] - xs[0]) ** 2 + (ys[i] - ys[0]) ** 2;
        if (d > farD) {
          farD = d;
          far = i;
        }
      }
      areas[far] = Infinity;
      let best = -1;
      let bestA = -1;
      for (let i = 1; i < n - 1; i++) {
        if (i !== far && areas[i] > bestA) {
          bestA = areas[i];
          best = i;
        }
      }
      if (best > 0) areas[best] = Infinity;
    }

    const flat: number[] = [];
    let lv = '';
    let px = 0;
    let py = 0;
    for (let i = 0; i < n; i++) {
      const qx = Math.round(xs[i] * TOPO_COORD_SCALE);
      const qy = Math.round(ys[i] * TOPO_COORD_SCALE);
      // area in px² at zoom z = areaNorm * worldPx(z)^2  ->  z = 0.5 * log2(thr / areaNorm) - 8
      let minZoom: number;
      if (!Number.isFinite(areas[i])) {
        minZoom = MIN_ZOOM;
      } else if (areas[i] <= 0) {
        minZoom = TOPO_MAX_ZOOM + 1;
      } else {
        minZoom = 0.5 * Math.log2(AREA_THRESHOLD_PX2 / areas[i]) - 8;
      }
      let code = Math.ceil(
        (Math.max(MIN_ZOOM, minZoom) - MIN_ZOOM) * TOPO_LEVEL_STEPS_PER_ZOOM
      );
      const maxCode = (TOPO_MAX_ZOOM - MIN_ZOOM) * TOPO_LEVEL_STEPS_PER_ZOOM;
      if (code > maxCode) {
        // Below 0.5 px² even at max zoom: drop entirely
        continue;
      }
      if (i === 0 || i === n - 1) code = 0;
      flat.push(qx - px, qy - py);
      px = qx;
      py = qy;
      lv += String.fromCharCode(TOPO_LEVEL_CHAR_OFFSET + code);
      levelHist.set(code, (levelHist.get(code) || 0) + 1);
    }
    totalPts += lv.length;
    outArcs.push(flat);
    outLevels.push(lv);
  }
  void worldPx;

  const outFeatures: JmaTopoFile['features'] = geoms.map((g: any) => {
    const p = g.properties || {};
    const code = String(p.code || '');
    const div = code && code !== 'hoppo' ? resolveWarningDivision(code, areaJson) : null;
    const lp = Array.isArray(p.labelPoints?.[0]) ? p.labelPoints[0] : null;
    const polys: number[][][] =
      g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
    return {
      c: code,
      n: String(p.name || ''),
      d: code === 'hoppo' ? 'hoppo' : div?.code || '',
      p: div?.prefId || Number(code.slice(0, 2)) || 0,
      l: lp ? [Number(lp[0]), Number(lp[1])] : null,
      a: polys,
    };
  });

  const out: JmaTopoFile = {
    v: 1,
    source: 'JMA bosai/common/const/geojson/class20s_*.json (気象庁)',
    generatedAt: new Date().toISOString(),
    scale: TOPO_COORD_SCALE,
    minZoom: MIN_ZOOM,
    stepsPerZoom: TOPO_LEVEL_STEPS_PER_ZOOM,
    arcs: outArcs,
    levels: outLevels,
    features: outFeatures,
  };
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  const json = JSON.stringify(out);
  writeFileSync(OUT_PATH, json);
  console.log(
    `arcs: ${outArcs.length}, points: ${totalPts}, size: ${(json.length / 1024).toFixed(0)} KB -> ${OUT_PATH}`
  );
  const hist = [...levelHist.entries()].sort((a, b) => a[0] - b[0]);
  console.log(
    'points visible per zoom:',
    Array.from({ length: TOPO_MAX_ZOOM - MIN_ZOOM + 1 }, (_, k) => {
      const z = MIN_ZOOM + k;
      const lim = k * TOPO_LEVEL_STEPS_PER_ZOOM;
      return `z${z}:${hist.filter(([c]) => c <= lim).reduce((s, [, v]) => s + v, 0)}`;
    }).join(' ')
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
