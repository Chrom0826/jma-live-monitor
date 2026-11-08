import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  decodeJmaTopology,
  topologyToGeoJson,
  traceTopoShape,
  type PathSink,
} from './jmaTopology';

const file = JSON.parse(
  readFileSync(new URL('../../public/geo/jma-class20-topo.json', import.meta.url), 'utf8')
);
const topo = decodeJmaTopology(file);

test('topology asset covers all JMA class20 warning areas with division metadata', () => {
  assert.ok(topo.shapes.length >= 1800);
  assert.ok(topo.shapeById.get('0620100'), '山形市');
  assert.equal(topo.shapeById.get('0620100')!.divisionCode, '060000');
  assert.equal(topo.shapeById.get('0110000')!.divisionCode, '016000', '札幌市 -> 石狩・空知・後志');
  const unresolved = topo.shapes.filter((s) => !s.divisionCode);
  assert.equal(unresolved.length, 0);
});

test('every interior border is a single shared arc, traversed once forward and once reversed', () => {
  const fwd = new Uint16Array(topo.arcCount);
  const rev = new Uint16Array(topo.arcCount);
  for (const sh of topo.shapes)
    for (const ring of sh.rings)
      for (const ref of ring) (ref < 0 ? rev : fwd)[ref < 0 ? ~ref : ref]++;
  let shared = 0;
  for (let a = 0; a < topo.arcCount; a++) {
    if (topo.arcKind[a] !== 'coast') {
      shared++;
      assert.ok(fwd[a] >= 1 && rev[a] >= 1, `arc ${a} must be used from both sides`);
    }
  }
  assert.ok(shared > 4000);
});

test('LOD levels keep arc endpoints, so neighbouring polygons stay closed and seamless at every zoom', () => {
  for (const z of [3, 5, 6.5, 8, 10, 12]) {
    const arcs = topo.getArcsAtLevel(topo.levelForZoom(z));
    for (let a = 0; a < topo.arcCount; a += 7) {
      const full = topo.arcCoords[a];
      const lod = arcs[a];
      assert.equal(lod[0], full[0]);
      assert.equal(lod[1], full[1]);
      assert.equal(lod[lod.length - 2], full[full.length - 2]);
      assert.equal(lod[lod.length - 1], full[full.length - 1]);
    }
  }
  const low = topo.getArcsAtLevel(topo.levelForZoom(5)).reduce((s, c) => s + c.length / 2, 0);
  const high = topo.getArcsAtLevel(topo.levelForZoom(12)).reduce((s, c) => s + c.length / 2, 0);
  assert.ok(low < high * 0.3, `nationwide LOD should be much lighter (${low} vs ${high})`);
});

test('traceTopoShape emits rings without closePath and topologyToGeoJson round-trips label points', () => {
  const calls: string[] = [];
  const sink: PathSink = {
    moveTo: () => calls.push('M'),
    lineTo: () => calls.push('L'),
  };
  const sh = topo.shapeById.get('0620100')!;
  traceTopoShape(sink, sh, topo.getArcsAtLevel(topo.levelForZoom(8)), {
    worldScale: 256 * 2 ** 8,
    originX: 0,
    originY: 0,
    minNormX: -1,
    minNormY: -1,
    maxNormX: 2,
    maxNormY: 2,
    minSpanNorm: 0,
  });
  assert.equal(calls[0], 'M');
  assert.ok(calls.filter((c) => c === 'M').length >= 1);
  assert.ok(!calls.includes('Z'), 'closePath must not be used (O(n^2) in Chromium batched paths)');
  const geo = topologyToGeoJson(topo);
  const f = geo.features.find((x: any) => x.properties.code === '0620100');
  assert.equal(f.geometry.type, 'MultiPolygon');
  const ring = f.geometry.coordinates[0][0];
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  const [lon, lat] = ring[0];
  assert.ok(lon > 139.9 && lon < 140.7 && lat > 38 && lat < 38.6, '山形市 near 140.3E 38.25N');
});
