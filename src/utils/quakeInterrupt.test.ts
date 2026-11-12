import test from 'node:test';
import assert from 'node:assert/strict';
import { EarthquakeReport } from '../types/jma';
import { TEST_INTERRUPT_EARTHQUAKE } from '../data/fallbackData';
import {
  areEarthquakeListsEquivalent,
  computeFlipCycleState,
  createInitialEarthquakeTrackerState,
  evaluateEarthquakeLoopCompletion,
  evaluateIncomingEarthquakeUpdate,
  isEarthquakeAwaitingDetail,
} from './quakeInterrupt';

function makeEq(overrides: Partial<EarthquakeReport> = {}): EarthquakeReport {
  return {
    id: 'eq-default',
    issueTime: '2026/11/12 14:02:00 発表',
    occurrenceTime: '2026/11/12 14:00:00 頃発生',
    hypocenterName: '茨城県沖',
    regionId: 'kanto',
    lat: 36.4,
    lon: 140.8,
    depthKm: 40,
    magnitude: 3.4,
    maxScaleCode: 20,
    maxScaleLabel: '2',
    domesticTsunami: 'この地震による津波の心配はありません。',
    foreignTsunami: 'なし',
    sourceOffice: '気象庁',
    issueTypeLabel: '各地の震度に関する情報',
    hypocenterUnknown: false,
    isConfirmed: true,
    reportKey: 'eq-default|各地の震度に関する情報|茨城県沖|20|3|1',
    stations: [
      {
        prefecture: '茨城県',
        city: '水戸市',
        stationName: '水戸市中央',
        scaleCode: 20,
        scaleLabel: '2',
        lat: 36.36,
        lon: 140.47,
      },
    ],
    ...overrides,
  };
}

test('initial fallback load and historical initial live load do not falsely interrupt', () => {
  const now = Date.parse('2026-11-12T15:00:00+09:00');
  const fallbackEq = makeEq({
    id: 'eq-20261105-01',
    occurrenceTime: '2026/11/05 13:39 頃発生',
    issueTime: '2026/11/05 13:42 発表',
  });
  const historicalLiveEq = makeEq({
    id: 'jma-eq-hist-1',
    occurrenceTime: '2026/11/12 14:40:00 頃発生', // 20 min ago, already confirmed
    issueTime: '2026/11/12 14:43:00 発表',
    isConfirmed: true,
  });

  // 1. Offline fallback does NOT initialize live tracker
  const step1 = evaluateIncomingEarthquakeUpdate({
    mergedList: [fallbackEq],
    tracker: createInitialEarthquakeTrackerState(),
    nowMs: now,
    isLive: false,
    currentInterruptKind: 'none',
  });
  assert.equal(step1.type, 'silent_sync');
  assert.equal(step1.nextTracker.hasInitializedLive, false);

  // 2. First live poll with historical confirmed quake establishes baseline silently (no interrupt!)
  const step2 = evaluateIncomingEarthquakeUpdate({
    mergedList: [historicalLiveEq],
    tracker: step1.nextTracker,
    nowMs: now,
    isLive: true,
    isRealtimePush: false,
    currentInterruptKind: 'none',
  });
  assert.equal(step2.type, 'silent_sync');
  assert.equal(step2.nextTracker.hasInitializedLive, true);
  assert.equal(step2.nextTracker.latestKnown?.id, 'jma-eq-hist-1');
});

test('initial live load with recent unconfirmed quake (震度速報) locks immediately', () => {
  const now = Date.parse('2026-11-12T15:00:00+09:00');
  const recentUnconfirmed = makeEq({
    id: 'p2p-unconf-1',
    occurrenceTime: '2026/11/12 14:58:00 頃発生',
    issueTime: '2026/11/12 14:59:30 発表',
    hypocenterName: '震源調査中',
    hypocenterUnknown: true,
    issueTypeLabel: '震度速報',
    isConfirmed: false,
    maxScaleCode: 30,
    maxScaleLabel: '3',
  });

  const res = evaluateIncomingEarthquakeUpdate({
    mergedList: [recentUnconfirmed],
    tracker: createInitialEarthquakeTrackerState(),
    nowMs: now,
    isLive: true,
    isRealtimePush: false,
    currentInterruptKind: 'none',
  });
  assert.equal(res.type, 'interrupt_unconfirmed');
  assert.equal(res.nextTracker.hasInitializedLive, true);
});

test('non-EEW newly arrived low-intensity earthquake triggers interrupt, while stale/older quakes are ignored', () => {
  const now = Date.parse('2026-11-12T15:00:00+09:00');
  const baselineEq = makeEq({
    id: 'jma-eq-old',
    occurrenceTime: '2026/11/12 13:00:00 頃発生',
    issueTime: '2026/11/12 13:03:00 発表',
  });
  const tracker = {
    hasInitializedLive: true,
    latestKnown: baselineEq,
  };

  // Older earthquake -> noop
  const olderEq = makeEq({
    id: 'jma-eq-even-older',
    occurrenceTime: '2026/11/12 12:00:00 頃発生',
    issueTime: '2026/11/12 12:03:00 発表',
  });
  const resOlder = evaluateIncomingEarthquakeUpdate({
    mergedList: [olderEq],
    tracker,
    nowMs: now,
    isLive: true,
    currentInterruptKind: 'none',
  });
  assert.equal(resOlder.type, 'noop');

  // Stale earthquake (> 60 min old even if newer than 13:00) -> noop
  const staleEq = makeEq({
    id: 'jma-eq-stale',
    occurrenceTime: '2026/11/12 13:30:00 頃発生', // 90 min ago
    issueTime: '2026/11/12 13:33:00 発表',
  });
  const resStale = evaluateIncomingEarthquakeUpdate({
    mergedList: [staleEq],
    tracker,
    nowMs: now,
    isLive: true,
    currentInterruptKind: 'none',
  });
  assert.equal(resStale.type, 'noop');

  // Brand-new non-EEW small earthquake (M2.8, maxScale 10 = 震度1, confirmed directly) -> interrupt_confirmed!
  const newSmallEq = makeEq({
    id: 'p2p-small-1',
    occurrenceTime: '2026/11/12 14:58:00 頃発生',
    issueTime: '2026/11/12 14:59:50 発表',
    magnitude: 2.8,
    maxScaleCode: 10,
    maxScaleLabel: '1',
    isConfirmed: true,
    issueTypeLabel: '各地の震度に関する情報',
  });
  const resNew = evaluateIncomingEarthquakeUpdate({
    mergedList: [newSmallEq, baselineEq],
    tracker,
    nowMs: now,
    isLive: true,
    currentInterruptKind: 'none',
  });
  assert.equal(resNew.type, 'interrupt_confirmed');
  assert.equal(resNew.resetFlipLoop, true);
  assert.equal(resNew.selectedEarthquake.id, 'p2p-small-1');
});

test('realtime P2P WebSocket push arriving before HTTP init still interrupts for a fresh quake', () => {
  const now = Date.parse('2026-11-12T15:00:00+09:00');
  const wsQuake = makeEq({
    id: 'p2p-ws-1',
    occurrenceTime: '2026/11/12 14:59:10 頃発生',
    issueTime: '2026/11/12 14:59:55 発表',
    maxScaleCode: 20,
    maxScaleLabel: '2',
    isConfirmed: true,
  });

  const res = evaluateIncomingEarthquakeUpdate({
    mergedList: [wsQuake],
    tracker: createInitialEarthquakeTrackerState(),
    nowMs: now,
    isLive: true,
    isRealtimePush: true,
    currentInterruptKind: 'none',
  });
  assert.equal(res.type, 'interrupt_confirmed');
  assert.equal(res.resetFlipLoop, true);
});

test('progressive non-EEW updates lock on preliminary, reset loop on confirmation, and dedupe P2P->JMA confirmed merge', () => {
  const now = Date.parse('2026-11-12T15:00:00+09:00');
  const tracker0 = {
    hasInitializedLive: true,
    latestKnown: makeEq({
      id: 'jma-old',
      occurrenceTime: '2026/11/12 12:00:00 頃発生',
    }),
  };

  // Stage 1: 震度速報 arrives (non-EEW, unconfirmed)
  const stage1 = makeEq({
    id: 'p2p-stage1',
    occurrenceTime: '2026/11/12 14:58:00 頃発生',
    issueTime: '2026/11/12 14:59:30 発表',
    hypocenterName: '震源調査中',
    hypocenterUnknown: true,
    issueTypeLabel: '震度速報',
    isConfirmed: false,
    maxScaleCode: 30,
    maxScaleLabel: '3',
  });
  const res1 = evaluateIncomingEarthquakeUpdate({
    mergedList: [stage1],
    tracker: tracker0,
    nowMs: now,
    isLive: true,
    currentInterruptKind: 'none',
  });
  assert.equal(res1.type, 'interrupt_unconfirmed');
  assert.equal(res1.resetFlipLoop, true);

  // Stage 2: 震源情報 merges (hypocenter resolved, still awaiting detail)
  const stage2 = makeEq({
    id: 'p2p-stage1',
    occurrenceTime: '2026/11/12 14:58:00 頃発生',
    issueTime: '2026/11/12 15:00:20 発表',
    hypocenterName: '千葉県北西部',
    hypocenterUnknown: false,
    issueTypeLabel: '震度速報・震源情報（各地の震度集計中）',
    isConfirmed: false,
    maxScaleCode: 30,
    maxScaleLabel: '3',
  });
  const res2 = evaluateIncomingEarthquakeUpdate({
    mergedList: [stage2],
    tracker: res1.nextTracker,
    nowMs: now + 20_000,
    isLive: true,
    currentInterruptKind: 'earthquake',
  });
  assert.equal(res2.type, 'interrupt_unconfirmed');
  assert.equal(res2.resetFlipLoop, false);

  // Stage 3: 各地の震度に関する情報 arrives -> confirmed! Must reset 2-loop counter for confirmed display
  const stage3 = makeEq({
    id: 'p2p-stage1',
    occurrenceTime: '2026/11/12 14:58:00 頃発生',
    issueTime: '2026/11/12 15:01:30 発表',
    hypocenterName: '千葉県北西部',
    hypocenterUnknown: false,
    issueTypeLabel: '各地の震度に関する情報',
    isConfirmed: true,
    maxScaleCode: 30,
    maxScaleLabel: '3',
  });
  const res3 = evaluateIncomingEarthquakeUpdate({
    mergedList: [stage3],
    tracker: res2.nextTracker,
    nowMs: now + 90_000,
    isLive: true,
    currentInterruptKind: 'earthquake',
  });
  assert.equal(res3.type, 'interrupt_confirmed');
  assert.equal(res3.resetFlipLoop, true);

  // Stage 4: JMA bosai report arrives for same confirmed event -> silent_sync (no re-interrupt, no loop reset)
  const stage4Jma = makeEq({
    id: 'jma-eq-stage4',
    occurrenceTime: '2026-11-12T14:58:10+09:00',
    issueTime: '2026-11-12T15:02:00+09:00',
    hypocenterName: '千葉県北西部',
    hypocenterUnknown: false,
    issueTypeLabel: '各地の震度に関する情報',
    isConfirmed: true,
    maxScaleCode: 30,
    maxScaleLabel: '3',
    stations: [
      ...stage3.stations,
      {
        prefecture: '千葉県',
        city: '千葉市',
        stationName: '千葉市中央区',
        scaleCode: 30,
        scaleLabel: '3',
        lat: 35.6,
        lon: 140.1,
      },
    ],
  });
  const res4 = evaluateIncomingEarthquakeUpdate({
    mergedList: [stage4Jma],
    tracker: res3.nextTracker,
    nowMs: now + 120_000,
    isLive: true,
    currentInterruptKind: 'none', // even after already returning!
  });
  assert.equal(res4.type, 'silent_sync');
});

test('computeFlipCycleState tracks card index and full loop completions accurately', () => {
  // 4-card feed
  assert.deepEqual(computeFlipCycleState(0, 4), { cardIndex: 0, completedRounds: 0 });
  assert.deepEqual(computeFlipCycleState(3, 4), { cardIndex: 3, completedRounds: 0 });
  assert.deepEqual(computeFlipCycleState(4, 4), { cardIndex: 0, completedRounds: 1 });
  assert.deepEqual(computeFlipCycleState(7, 4), { cardIndex: 3, completedRounds: 1 });
  assert.deepEqual(computeFlipCycleState(8, 4), { cardIndex: 0, completedRounds: 2 });

  // 3-card feed
  assert.deepEqual(computeFlipCycleState(5, 3), { cardIndex: 2, completedRounds: 1 });
  assert.deepEqual(computeFlipCycleState(6, 3), { cardIndex: 0, completedRounds: 2 });
});

test('evaluateEarthquakeLoopCompletion returns on 2 loops for confirmed non-EEW interrupt while preserving EEW & unconfirmed locks', () => {
  const confirmedEq = makeEq({ isConfirmed: true });
  const unconfirmedEq = makeEq({ isConfirmed: false, issueTypeLabel: '震度速報' });

  // 1. Confirmed non-EEW interrupt stays at round 0 and round 1, returns at round 2
  assert.equal(
    evaluateEarthquakeLoopCompletion({
      effectiveScene: 'earthquake',
      interruptKind: 'earthquake',
      isLoopPaused: false,
      pinnedEarthquakeId: null,
      isEewActive: false,
      eqLockUntilConfirmed: false,
      selectedEarthquake: confirmedEq,
      flipCompletedRounds: 1,
      isEarthquakeScrollDone: false,
      isMobileDetachedFromDetailTab: false,
    }),
    'stay'
  );
  assert.equal(
    evaluateEarthquakeLoopCompletion({
      effectiveScene: 'earthquake',
      interruptKind: 'earthquake',
      isLoopPaused: false,
      pinnedEarthquakeId: null,
      isEewActive: false,
      eqLockUntilConfirmed: false,
      selectedEarthquake: confirmedEq,
      flipCompletedRounds: 2,
      isEarthquakeScrollDone: false,
      isMobileDetachedFromDetailTab: false,
    }),
    'return_from_interrupt'
  );

  // 2. Unconfirmed preliminary report stays even after 2 loops
  assert.equal(
    evaluateEarthquakeLoopCompletion({
      effectiveScene: 'earthquake',
      interruptKind: 'earthquake',
      isLoopPaused: false,
      pinnedEarthquakeId: null,
      isEewActive: false,
      eqLockUntilConfirmed: true,
      selectedEarthquake: unconfirmedEq,
      flipCompletedRounds: 3,
      isEarthquakeScrollDone: false,
      isMobileDetachedFromDetailTab: false,
    }),
    'stay'
  );

  // 3. Active EEW preserves priority and does NOT exit after 2 loops
  assert.equal(
    evaluateEarthquakeLoopCompletion({
      effectiveScene: 'earthquake',
      interruptKind: 'eew',
      isLoopPaused: false,
      pinnedEarthquakeId: null,
      isEewActive: true,
      eqLockUntilConfirmed: false,
      selectedEarthquake: confirmedEq,
      flipCompletedRounds: 2,
      isEarthquakeScrollDone: true,
      isMobileDetachedFromDetailTab: false,
    }),
    'stay'
  );

  // 4. Test earthquake interrupt is not treated as awaiting detail and returns at 2 loops
  assert.equal(isEarthquakeAwaitingDetail(TEST_INTERRUPT_EARTHQUAKE), false);
  assert.equal(
    evaluateEarthquakeLoopCompletion({
      effectiveScene: 'earthquake',
      interruptKind: 'earthquake',
      isLoopPaused: false,
      pinnedEarthquakeId: null,
      isEewActive: false,
      eqLockUntilConfirmed: false,
      selectedEarthquake: TEST_INTERRUPT_EARTHQUAKE,
      flipCompletedRounds: 2,
      isEarthquakeScrollDone: false,
      isMobileDetachedFromDetailTab: false,
    }),
    'return_from_interrupt'
  );

  // 5. Normal patrol requires both 2 loops AND scroll done
  assert.equal(
    evaluateEarthquakeLoopCompletion({
      effectiveScene: 'earthquake',
      interruptKind: 'none',
      isLoopPaused: false,
      pinnedEarthquakeId: null,
      isEewActive: false,
      eqLockUntilConfirmed: false,
      selectedEarthquake: confirmedEq,
      flipCompletedRounds: 2,
      isEarthquakeScrollDone: false,
      isMobileDetachedFromDetailTab: false,
    }),
    'stay'
  );
  assert.equal(
    evaluateEarthquakeLoopCompletion({
      effectiveScene: 'earthquake',
      interruptKind: 'none',
      isLoopPaused: false,
      pinnedEarthquakeId: null,
      isEewActive: false,
      eqLockUntilConfirmed: false,
      selectedEarthquake: confirmedEq,
      flipCompletedRounds: 2,
      isEarthquakeScrollDone: true,
      isMobileDetachedFromDetailTab: false,
    }),
    'advance_normal_patrol'
  );
});

test('areEarthquakeListsEquivalent avoids unnecessary re-renders on identical polls', () => {
  const eq1 = makeEq({ id: 'eq-1', reportKey: 'k1' });
  const eq2 = makeEq({ id: 'eq-2', reportKey: 'k2' });
  const copy1 = makeEq({ id: 'eq-1', reportKey: 'k1' });
  const copy2 = makeEq({ id: 'eq-2', reportKey: 'k2' });
  const updated2 = makeEq({ id: 'eq-2', reportKey: 'k2-upgraded' });

  assert.equal(areEarthquakeListsEquivalent([eq1, eq2], [copy1, copy2]), true);
  assert.equal(areEarthquakeListsEquivalent([eq1, eq2], [copy1, updated2]), false);
  assert.equal(areEarthquakeListsEquivalent([eq1], [eq1, eq2]), false);
});
