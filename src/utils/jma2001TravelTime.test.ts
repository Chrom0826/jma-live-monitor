import assert from 'node:assert/strict';
import test from 'node:test';
import {
  JMA2001_DEPTH_GRID_KM,
  JMA2001_DISTANCE_GRID_KM,
  getJma2001VerticalTravelTime,
  lookupJma2001TravelTime,
  solveJma2001EpicentralRadiiKm,
} from './jma2001TravelTime.ts';
import { computeEewWaveRadiiKm } from './eewTsunami.ts';

test('JMA2001 grid dimensions and bounds match official tjma2001 specification', () => {
  assert.equal(JMA2001_DEPTH_GRID_KM.length, 106);
  assert.equal(JMA2001_DEPTH_GRID_KM[0], 0);
  assert.equal(JMA2001_DEPTH_GRID_KM[JMA2001_DEPTH_GRID_KM.length - 1], 700);

  assert.equal(JMA2001_DISTANCE_GRID_KM.length, 236);
  assert.equal(JMA2001_DISTANCE_GRID_KM[0], 0);
  assert.equal(JMA2001_DISTANCE_GRID_KM[JMA2001_DISTANCE_GRID_KM.length - 1], 2000);
});

test('lookupJma2001TravelTime reproduces exact official tjma2001 grid values', () => {
  // Exact values verified against official tjma2001 from JMA
  const officialSamples: Array<{
    depthKm: number;
    distanceKm: number;
    pTimeSec: number;
    sTimeSec: number;
  }> = [
    { depthKm: 0, distanceKm: 0, pTimeSec: 0.0, sTimeSec: 0.0 },
    { depthKm: 0, distanceKm: 10, pTimeSec: 2.052, sTimeSec: 3.465 },
    { depthKm: 0, distanceKm: 50, pTimeSec: 9.226, sTimeSec: 15.63 },
    { depthKm: 0, distanceKm: 100, pTimeSec: 17.683, sTimeSec: 30.048 },
    { depthKm: 10, distanceKm: 0, pTimeSec: 1.773, sTimeSec: 3.007 },
    { depthKm: 10, distanceKm: 30, pTimeSec: 5.539, sTimeSec: 9.404 },
    { depthKm: 10, distanceKm: 100, pTimeSec: 17.037, sTimeSec: 29.054 },
    { depthKm: 30, distanceKm: 0, pTimeSec: 4.872, sTimeSec: 8.33 },
    { depthKm: 30, distanceKm: 50, pTimeSec: 9.375, sTimeSec: 16.051 },
    { depthKm: 50, distanceKm: 0, pTimeSec: 7.57, sTimeSec: 13.035 },
    { depthKm: 50, distanceKm: 42, pTimeSec: 9.828, sTimeSec: 16.936 },
    { depthKm: 50, distanceKm: 44, pTimeSec: 10.019, sTimeSec: 17.267 },
    { depthKm: 50, distanceKm: 55, pTimeSec: 11.149, sTimeSec: 19.223 },
    { depthKm: 50, distanceKm: 60, pTimeSec: 11.697, sTimeSec: 20.174 },
    { depthKm: 50, distanceKm: 120, pTimeSec: 19.052, sTimeSec: 32.982 },
    { depthKm: 50, distanceKm: 125, pTimeSec: 19.691, sTimeSec: 34.1 },
    { depthKm: 100, distanceKm: 0, pTimeSec: 13.927, sTimeSec: 24.341 },
    { depthKm: 100, distanceKm: 100, pTimeSec: 19.497, sTimeSec: 34.132 },
    { depthKm: 300, distanceKm: 0, pTimeSec: 38.137, sTimeSec: 67.831 },
    { depthKm: 300, distanceKm: 200, pTimeSec: 45.407, sTimeSec: 80.806 },
    { depthKm: 600, distanceKm: 0, pTimeSec: 70.461, sTimeSec: 126.167 },
    { depthKm: 600, distanceKm: 500, pTimeSec: 89.438, sTimeSec: 160.266 },
    { depthKm: 700, distanceKm: 0, pTimeSec: 79.996, sTimeSec: 143.377 },
    { depthKm: 700, distanceKm: 2000, pTimeSec: 213.863, sTimeSec: 384.747 },
  ];

  for (const row of officialSamples) {
    const got = lookupJma2001TravelTime(row.depthKm, row.distanceKm);
    assert.equal(
      got.pTimeSec,
      row.pTimeSec,
      `P mismatch at depth=${row.depthKm}, dist=${row.distanceKm}`
    );
    assert.equal(
      got.sTimeSec,
      row.sTimeSec,
      `S mismatch at depth=${row.depthKm}, dist=${row.distanceKm}`
    );
  }
});

test('lookupJma2001TravelTime performs exact 2D bilinear interpolation between grid points', () => {
  // Depth midpoint between 10 and 12 (depth = 11), distance midpoint between 20 and 22 (dist = 21)
  const q00 = lookupJma2001TravelTime(10, 20);
  const q01 = lookupJma2001TravelTime(10, 22);
  const q10 = lookupJma2001TravelTime(12, 20);
  const q11 = lookupJma2001TravelTime(12, 22);
  const expectedP = 0.25 * (q00.pTimeSec + q01.pTimeSec + q10.pTimeSec + q11.pTimeSec);
  const expectedS = 0.25 * (q00.sTimeSec + q01.sTimeSec + q10.sTimeSec + q11.sTimeSec);

  const got = lookupJma2001TravelTime(11, 21);
  assert.ok(Math.abs(got.pTimeSec - expectedP) < 1e-12);
  assert.ok(Math.abs(got.sTimeSec - expectedS) < 1e-12);

  // Asymmetric point: depth 153 (between 150 and 155, wd = 0.6), dist 182.5 (between 180 and 185, wr = 0.5)
  const a00 = lookupJma2001TravelTime(150, 180);
  const a01 = lookupJma2001TravelTime(150, 185);
  const a10 = lookupJma2001TravelTime(155, 180);
  const a11 = lookupJma2001TravelTime(155, 185);
  const wd = 0.6;
  const wr = 0.5;
  const asymP =
    (1 - wd) * ((1 - wr) * a00.pTimeSec + wr * a01.pTimeSec) +
    wd * ((1 - wr) * a10.pTimeSec + wr * a11.pTimeSec);
  const asymS =
    (1 - wd) * ((1 - wr) * a00.sTimeSec + wr * a01.sTimeSec) +
    wd * ((1 - wr) * a10.sTimeSec + wr * a11.sTimeSec);

  const asymGot = lookupJma2001TravelTime(153, 182.5);
  assert.ok(Math.abs(asymGot.pTimeSec - asymP) < 1e-12);
  assert.ok(Math.abs(asymGot.sTimeSec - asymS) < 1e-12);
});

test('solveJma2001EpicentralRadiiKm round-trips accurately across shallow and deep earthquakes', () => {
  const depths = [0, 10, 15, 30, 50, 77, 100, 185, 300, 450, 600, 700];
  const elapsedSamples = [0.5, 2, 5, 10, 20, 40, 80, 130, 180, 260, 400];

  for (const depth of depths) {
    const vertical = getJma2001VerticalTravelTime(depth);
    let prevP = -1;
    let prevS = -1;

    for (const t of elapsedSamples) {
      const { pKm, sKm } = solveJma2001EpicentralRadiiKm(depth, t);
      assert.ok(Number.isFinite(pKm) && pKm >= 0);
      assert.ok(Number.isFinite(sKm) && sKm >= 0);
      assert.ok(pKm >= sKm, `P radius must be >= S radius (depth=${depth}, t=${t})`);
      assert.ok(pKm >= prevP && sKm >= prevS, `Radii must be monotonic in t (depth=${depth}, t=${t})`);
      prevP = pKm;
      prevS = sKm;

      if (t <= vertical.pTimeSec) {
        assert.equal(pKm, 0, `Expected pKm=0 before vertical P arrival (depth=${depth}, t=${t})`);
      } else {
        const fwdP = lookupJma2001TravelTime(depth, pKm).pTimeSec;
        assert.ok(
          Math.abs(fwdP - t) < 1e-9,
          `P round-trip failed at depth=${depth}, t=${t}: got ${fwdP} (pKm=${pKm})`
        );
      }

      if (t <= vertical.sTimeSec) {
        assert.equal(sKm, 0, `Expected sKm=0 before vertical S arrival (depth=${depth}, t=${t})`);
      } else {
        const fwdS = lookupJma2001TravelTime(depth, sKm).sTimeSec;
        assert.ok(
          Math.abs(fwdS - t) < 1e-9,
          `S round-trip failed at depth=${depth}, t=${t}: got ${fwdS} (sKm=${sKm})`
        );
      }
    }
  }
});

test('solveJma2001EpicentralRadiiKm handles deep flat near-epicenter steps and surface thresholds', () => {
  // At depth=600km, vertical P=70.461s, vertical S=126.167s
  const beforeBoth = solveJma2001EpicentralRadiiKm(600, 70);
  assert.deepEqual(beforeBoth, { pKm: 0, sKm: 0 });

  const exactAt500S = solveJma2001EpicentralRadiiKm(600, 160.266);
  assert.ok(Math.abs(exactAt500S.sKm - 500) < 1e-9);

  // At depth=700km, dist=0 and dist=2 both have P=79.996s, S=143.377s due to 1ms rounding
  assert.deepEqual(solveJma2001EpicentralRadiiKm(700, 79.996), { pKm: 0, sKm: 0 });
  const justAfterVerticalP = solveJma2001EpicentralRadiiKm(700, 79.997);
  assert.ok(justAfterVerticalP.pKm > 2 && Number.isFinite(justAfterVerticalP.pKm));
  assert.equal(justAfterVerticalP.sKm, 0);
});

test('computeEewWaveRadiiKm handles originTime, depth clamping, and edge cases', () => {
  const origin = '2026/11/06 19:56:00';
  const originMs = new Date('2026-11-06T19:56:00+09:00').getTime();

  // At origin (elapsed = 0) and before origin (elapsed < 0)
  assert.deepEqual(computeEewWaveRadiiKm(origin, 10, originMs), {
    pKm: 0,
    sKm: 0,
    elapsedSec: 0,
  });
  assert.deepEqual(computeEewWaveRadiiKm(origin, 10, originMs - 5000), {
    pKm: 0,
    sKm: 0,
    elapsedSec: 0,
  });

  // Invalid date or invalid nowMs
  assert.deepEqual(computeEewWaveRadiiKm('', 10, originMs), {
    pKm: 0,
    sKm: 0,
    elapsedSec: 0,
  });
  assert.deepEqual(computeEewWaveRadiiKm('not-a-date', 10, originMs), {
    pKm: 0,
    sKm: 0,
    elapsedSec: 0,
  });
  assert.deepEqual(computeEewWaveRadiiKm(origin, 10, Number.NaN), {
    pKm: 0,
    sKm: 0,
    elapsedSec: 0,
  });

  // Depth=0km at elapsed=9.226s -> P radius exactly 50km (official table: 0km, 50km -> P=9.226s)
  const shallowAt9226 = computeEewWaveRadiiKm(origin, 0, originMs + 9226);
  assert.ok(Math.abs(shallowAt9226.pKm - 50) < 1e-9);
  assert.ok(shallowAt9226.elapsedSec === 9.226);

  // Negative / NaN depth clamps to 0 km; depth > 700 clamps to 700 km
  assert.deepEqual(
    computeEewWaveRadiiKm(origin, -1, originMs + 10000),
    computeEewWaveRadiiKm(origin, 0, originMs + 10000)
  );
  assert.deepEqual(
    computeEewWaveRadiiKm(origin, Number.NaN, originMs + 10000),
    computeEewWaveRadiiKm(origin, 0, originMs + 10000)
  );
  assert.deepEqual(
    computeEewWaveRadiiKm(origin, 850, originMs + 100000),
    computeEewWaveRadiiKm(origin, 700, originMs + 100000)
  );

  // ISO originTime format works identically
  const isoRes = computeEewWaveRadiiKm('2026-11-06T19:56:00+09:00', 30, originMs + 16051);
  assert.ok(Math.abs(isoRes.sKm - 50) < 1e-9);
});
