import {
  EarthquakeReport,
  EewReport,
  InterruptKind,
  SceneId,
} from '../types/jma';
import {
  decideIncomingEarthquake,
  earthquakeEventTimeMs,
} from './jmaParser';
import {
  doesEarthquakeMatchEew,
  isEewWarning,
} from './eewTsunami';

export const DEFAULT_QUAKE_FRESH_WINDOW_MS = 60 * 60 * 1000;
export const DEFAULT_STARTUP_UNCONFIRMED_WINDOW_MS = 15 * 60 * 1000;

export interface EarthquakeTrackerState {
  hasInitializedLive: boolean;
  latestKnown: EarthquakeReport | null;
}

export function createInitialEarthquakeTrackerState(): EarthquakeTrackerState {
  return {
    hasInitializedLive: false,
    latestKnown: null,
  };
}

/**
 * True when an earthquake report is still preliminary/unconfirmed
 * (e.g. 震度速報 / 震源に関する情報) and the monitor should stay locked
 * on the earthquake scene until the final confirmed intensity report arrives.
 */
export function isEarthquakeAwaitingDetail(
  eq:
    | Pick<
        EarthquakeReport,
        'isTest' | 'isConfirmed' | 'issueTypeLabel' | 'hypocenterUnknown'
      >
    | null
    | undefined
): boolean {
  if (!eq) return false;
  if (eq.isTest) return false;
  if (eq.isConfirmed === true) return false;
  if (eq.isConfirmed === false) return true;
  return (
    eq.hypocenterUnknown === true ||
    eq.issueTypeLabel === '震度速報' ||
    eq.issueTypeLabel === '震源に関する情報' ||
    eq.issueTypeLabel === '震度速報・震源情報（各地の震度集計中）'
  );
}

/**
 * True when a follow-up report for the same earthquake represents a meaningful
 * progression (e.g. preliminary -> confirmed, hypocenter resolved, max scale increased,
 * or additional stations while still awaiting confirmation).
 */
export function hasEarthquakeReportUpgraded(
  prev: EarthquakeReport,
  next: EarthquakeReport
): boolean {
  const prevAwaiting = isEarthquakeAwaitingDetail(prev);
  const nextAwaiting = isEarthquakeAwaitingDetail(next);
  if (prevAwaiting && !nextAwaiting) return true;
  if (prev.hypocenterUnknown && !next.hypocenterUnknown) return true;
  if (next.maxScaleCode > prev.maxScaleCode) return true;
  if (nextAwaiting && next.stations.length > prev.stations.length) return true;
  if (nextAwaiting && next.issueTypeLabel !== prev.issueTypeLabel) return true;
  return false;
}

export interface EvaluateEarthquakeUpdateOptions {
  mergedList: EarthquakeReport[];
  tracker: EarthquakeTrackerState;
  nowMs: number;
  isLive: boolean;
  isRealtimePush?: boolean;
  isTsunamiWarningActive?: boolean;
  currentInterruptKind: InterruptKind;
  freshWindowMs?: number;
  startupUnconfirmedWindowMs?: number;
}

export type EarthquakeUpdateAction =
  | { type: 'noop'; nextTracker: EarthquakeTrackerState }
  | {
      type: 'silent_sync';
      nextTracker: EarthquakeTrackerState;
      selectedEarthquake: EarthquakeReport;
    }
  | {
      type: 'interrupt_unconfirmed';
      nextTracker: EarthquakeTrackerState;
      selectedEarthquake: EarthquakeReport;
      resetFlipLoop: boolean;
    }
  | {
      type: 'interrupt_confirmed';
      nextTracker: EarthquakeTrackerState;
      selectedEarthquake: EarthquakeReport;
      resetFlipLoop: boolean;
    };

/**
 * Evaluates a merged earthquake list (newest first) against the current tracker state
 * and decides whether to stay idle, silently sync, lock on an unconfirmed quake,
 * or trigger/confirm a non-EEW earthquake interrupt.
 */
export function evaluateIncomingEarthquakeUpdate(
  options: EvaluateEarthquakeUpdateOptions
): EarthquakeUpdateAction {
  const {
    mergedList,
    tracker,
    nowMs,
    isLive,
    isRealtimePush = false,
    isTsunamiWarningActive = false,
    currentInterruptKind,
    freshWindowMs = DEFAULT_QUAKE_FRESH_WINDOW_MS,
    startupUnconfirmedWindowMs = DEFAULT_STARTUP_UNCONFIRMED_WINDOW_MS,
  } = options;

  if (!mergedList || mergedList.length === 0) {
    return { type: 'noop', nextTracker: tracker };
  }

  const newest = mergedList[0];

  // Offline / fallback data must never establish the live baseline or trigger interrupts.
  if (!isLive) {
    if (!tracker.hasInitializedLive && !tracker.latestKnown) {
      return {
        type: 'silent_sync',
        nextTracker: tracker,
        selectedEarthquake: newest,
      };
    }
    return { type: 'noop', nextTracker: tracker };
  }

  // First live snapshot: establish baseline without false-positive interrupts on historical quakes,
  // unless it's a real-time WebSocket push or an actively unfolding recent unconfirmed quake.
  if (!tracker.hasInitializedLive) {
    const nextTracker: EarthquakeTrackerState = {
      hasInitializedLive: true,
      latestKnown: newest,
    };

    if (isRealtimePush) {
      const decision = decideIncomingEarthquake(newest, null, nowMs, freshWindowMs);
      if (decision === 'interrupt' && !isTsunamiWarningActive) {
        return isEarthquakeAwaitingDetail(newest)
          ? {
              type: 'interrupt_unconfirmed',
              nextTracker,
              selectedEarthquake: newest,
              resetFlipLoop: true,
            }
          : {
              type: 'interrupt_confirmed',
              nextTracker,
              selectedEarthquake: newest,
              resetFlipLoop: true,
            };
      }
      return {
        type: 'silent_sync',
        nextTracker,
        selectedEarthquake: newest,
      };
    }

    const eqTimeMs = earthquakeEventTimeMs(newest);
    const isRecentUnconfirmed =
      isEarthquakeAwaitingDetail(newest) &&
      eqTimeMs > 0 &&
      nowMs - eqTimeMs <= startupUnconfirmedWindowMs;

    if (isRecentUnconfirmed && !isTsunamiWarningActive) {
      return {
        type: 'interrupt_unconfirmed',
        nextTracker,
        selectedEarthquake: newest,
        resetFlipLoop: true,
      };
    }

    return {
      type: 'silent_sync',
      nextTracker,
      selectedEarthquake: newest,
    };
  }

  const decision = decideIncomingEarthquake(
    newest,
    tracker.latestKnown,
    nowMs,
    freshWindowMs
  );

  if (decision === 'interrupt') {
    const nextTracker: EarthquakeTrackerState = {
      hasInitializedLive: true,
      latestKnown: newest,
    };

    if (isTsunamiWarningActive) {
      return {
        type: 'silent_sync',
        nextTracker,
        selectedEarthquake: newest,
      };
    }

    return isEarthquakeAwaitingDetail(newest)
      ? {
          type: 'interrupt_unconfirmed',
          nextTracker,
          selectedEarthquake: newest,
          resetFlipLoop: true,
        }
      : {
          type: 'interrupt_confirmed',
          nextTracker,
          selectedEarthquake: newest,
          resetFlipLoop: true,
        };
  }

  if (decision === 'update') {
    const prevKnown = tracker.latestKnown;
    const nextTracker: EarthquakeTrackerState = {
      hasInitializedLive: true,
      latestKnown: newest,
    };

    if (prevKnown && hasEarthquakeReportUpgraded(prevKnown, newest)) {
      if (isTsunamiWarningActive) {
        return {
          type: 'silent_sync',
          nextTracker,
          selectedEarthquake: newest,
        };
      }

      if (isEarthquakeAwaitingDetail(newest)) {
        const alreadyInterruptingEq =
          currentInterruptKind === 'earthquake' ||
          currentInterruptKind === 'eew';
        return {
          type: 'interrupt_unconfirmed',
          nextTracker,
          selectedEarthquake: newest,
          resetFlipLoop: !alreadyInterruptingEq,
        };
      }

      return {
        type: 'interrupt_confirmed',
        nextTracker,
        selectedEarthquake: newest,
        resetFlipLoop: true,
      };
    }

    return {
      type: 'silent_sync',
      nextTracker,
      selectedEarthquake: newest,
    };
  }

  return { type: 'noop', nextTracker: tracker };
}

/**
 * Computes the active card index and completed full rounds from a monotonic flip tick count.
 */
export function computeFlipCycleState(
  tickCount: number,
  cardCount: number
): {
  cardIndex: number;
  completedRounds: number;
} {
  if (cardCount <= 0) {
    return { cardIndex: 0, completedRounds: 0 };
  }
  const safeTick = Math.max(0, Math.floor(tickCount));
  return {
    cardIndex: safeTick % cardCount,
    completedRounds: Math.floor(safeTick / cardCount),
  };
}

export interface EvaluateEarthquakeLoopParams {
  effectiveScene: SceneId;
  interruptKind: InterruptKind;
  isLoopPaused: boolean;
  pinnedEarthquakeId: string | null;
  isEewActive: boolean;
  eqLockUntilConfirmed: boolean;
  selectedEarthquake: EarthquakeReport | null | undefined;
  flipCompletedRounds: number;
  isEarthquakeScrollDone: boolean;
  isMobileDetachedFromDetailTab: boolean;
}

export type EarthquakeLoopOutcome =
  | 'stay'
  | 'return_from_interrupt'
  | 'advance_normal_patrol';

/**
 * Decides whether the earthquake scene should stay, exit a non-EEW interrupt
 * after 2 completed loops of the bottom flip feed, or advance in normal patrol.
 */
export function evaluateEarthquakeLoopCompletion(
  params: EvaluateEarthquakeLoopParams
): EarthquakeLoopOutcome {
  if (params.effectiveScene !== 'earthquake') return 'stay';
  if (params.isLoopPaused || params.pinnedEarthquakeId) return 'stay';
  if (params.isEewActive) return 'stay';
  if (params.flipCompletedRounds < 2) return 'stay';

  if (params.interruptKind === 'earthquake') {
    if (
      params.eqLockUntilConfirmed ||
      isEarthquakeAwaitingDetail(params.selectedEarthquake)
    ) {
      return 'stay';
    }
    return 'return_from_interrupt';
  }

  if (params.interruptKind === 'none') {
    if (params.isEarthquakeScrollDone || params.isMobileDetachedFromDetailTab) {
      return 'advance_normal_patrol';
    }
  }

  return 'stay';
}

export function shouldBlockNormalPatrolAdvance(params: {
  tsunamiSeverity: 'none' | 'forecast' | 'warning_or_above';
  eqLockUntilConfirmed: boolean;
  interruptKind: InterruptKind;
  isEewActive: boolean;
}): boolean {
  if (params.tsunamiSeverity === 'warning_or_above') return true;
  if (params.eqLockUntilConfirmed) return true;
  if (params.interruptKind === 'eew' || params.interruptKind === 'earthquake') {
    return true;
  }
  if (params.isEewActive) return true;
  return false;
}

/**
 * Shallow equivalence check for earthquake lists to prevent idle poll re-renders in App.
 */
export function areEarthquakeListsEquivalent(
  a: EarthquakeReport[],
  b: EarthquakeReport[]
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.reportKey !== y.reportKey ||
      x.maxScaleCode !== y.maxScaleCode ||
      x.isConfirmed !== y.isConfirmed ||
      x.stations.length !== y.stations.length
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Resolves the effective scene with Tsunami taking priority over EEW / Earthquake / Volcano interrupts.
 */
export function resolveEffectiveScene(
  activeScene: SceneId,
  interruptKind: InterruptKind
): SceneId {
  if (interruptKind === 'tsunami') return 'tsunami';
  if (interruptKind === 'earthquake' || interruptKind === 'eew') {
    return 'earthquake';
  }
  if (interruptKind === 'volcano') return 'volcano';
  if (interruptKind === 'typhoon') return 'typhoon';
  return activeScene;
}

/**
 * Resolves the next `interruptKind` when an incoming EEW arrives:
 * keeps `'tsunami'` priority if a Tsunami Warning/Advisory is active or already interrupting,
 * otherwise switches to `'eew'`.
 */
export function resolveInterruptKindOnEew(
  prev: InterruptKind,
  tsunamiSeverity: 'none' | 'forecast' | 'warning_or_above'
): InterruptKind {
  if (tsunamiSeverity === 'warning_or_above' || prev === 'tsunami') {
    return 'tsunami';
  }
  return 'eew';
}

/**
 * Resolves the next `interruptKind` when a Tsunami report arrives or becomes active:
 * transitions `'eew'` / `'earthquake'` (or explicit push) to `'tsunami'` when severity is `'warning_or_above'`.
 */
export function resolveInterruptKindOnTsunami(
  prev: InterruptKind,
  tsunamiSeverity: 'none' | 'forecast' | 'warning_or_above',
  forceInterrupt: boolean = false
): InterruptKind {
  if (tsunamiSeverity !== 'warning_or_above') return prev;
  if (forceInterrupt || prev === 'eew' || prev === 'earthquake') {
    return 'tsunami';
  }
  return prev;
}

/**
 * Resolves `interruptKind` when `tsunamiSeverity` transitions (including cancellation):
 * - On escalation to `'warning_or_above'`, transitions `'eew'` / `'earthquake'` to `'tsunami'`.
 * - On cancellation (`'warning_or_above'` -> non-warning), releases `'tsunami'` interrupt back
 *   to `'eew'` if an EEW is still active, or `'none'` so normal patrol resumes.
 */
export function resolveInterruptKindOnTsunamiChange(
  prev: InterruptKind,
  prevSeverity: 'none' | 'forecast' | 'warning_or_above',
  nextSeverity: 'none' | 'forecast' | 'warning_or_above',
  isEewActive: boolean
): InterruptKind {
  if (nextSeverity === 'warning_or_above') {
    return resolveInterruptKindOnTsunami(prev, nextSeverity);
  }
  if (prevSeverity === 'warning_or_above' && prev === 'tsunami') {
    return isEewActive ? 'eew' : 'none';
  }
  return prev;
}

/**
 * Computes the effective list of scenes included in automatic normal patrol:
 * - Tsunami Warning/Advisory locks onto `['tsunami']`.
 * - Inactive typhoon (`hasActiveTyphoons === false`) is skipped in automatic patrol just like inactive tsunami.
 * - Tsunami Forecast (`'forecast'`) dynamically inserts `'tsunami'` after `'earthquake'`; `'none'` excludes `'tsunami'`.
 */
export function resolveEffectiveEnabledScenes(options: {
  enabledScenes: SceneId[];
  tsunamiSeverity: 'none' | 'forecast' | 'warning_or_above';
  hasActiveTyphoons: boolean;
}): SceneId[] {
  const { enabledScenes, tsunamiSeverity, hasActiveTyphoons } = options;
  if (tsunamiSeverity === 'warning_or_above') {
    return ['tsunami'];
  }
  const baseScenes = hasActiveTyphoons
    ? enabledScenes
    : enabledScenes.filter((s) => s !== 'typhoon');

  if (tsunamiSeverity === 'forecast') {
    if (baseScenes.includes('tsunami')) {
      return baseScenes;
    }
    const eqIdx = baseScenes.indexOf('earthquake');
    if (eqIdx !== -1) {
      const next = [...baseScenes];
      next.splice(eqIdx + 1, 0, 'tsunami');
      return next;
    }
    return [...baseScenes, 'tsunami'];
  }
  return baseScenes.filter((s) => s !== 'tsunami');
}

/**
 * Finds an observed earthquake intensity report matching an active EEW Forecast
 * (`緊急地震速報（予報）`, i.e., `isWarning === false`) when intensity observations
 * (`maxScaleCode >= 10` or reported station intensities) have arrived.
 * EEW Warnings (`警報`) and Special Warnings (`特別警報`) are never cleared by this check.
 */
export function findMatchingIntensityEarthquakeForEewForecast(
  eew: EewReport | null | undefined,
  earthquakes: EarthquakeReport[]
): EarthquakeReport | null {
  if (!eew || eew.isCancelled || isEewWarning(eew)) return null;
  if (!Array.isArray(earthquakes) || earthquakes.length === 0) return null;
  for (const eq of earthquakes) {
    if (!eq) continue;
    const hasObservedIntensity =
      eq.maxScaleCode >= 10 ||
      (Array.isArray(eq.stations) && eq.stations.some((s) => s.scaleCode >= 10));
    if (!hasObservedIntensity) continue;
    if (doesEarthquakeMatchEew(eq, eew)) {
      return eq;
    }
  }
  return null;
}

/**
 * Resolves the post-clear `interruptKind` when an active EEW Forecast is cleared by a
 * matching seismic intensity report: transitions `'eew'` to `'earthquake'` (while leaving
 * `'tsunami'` or unrelated interrupts intact).
 */
export function resolveInterruptKindOnEewForecastCleared(
  prev: InterruptKind,
  matchedEarthquake: EarthquakeReport,
  nowMs: number = Date.now(),
  freshWindowMs: number = DEFAULT_QUAKE_FRESH_WINDOW_MS
): InterruptKind {
  if (prev === 'tsunami') return 'tsunami';
  const eqMs = earthquakeEventTimeMs(matchedEarthquake);
  if (
    isEarthquakeAwaitingDetail(matchedEarthquake) ||
    (eqMs > 0 && nowMs - eqMs <= freshWindowMs)
  ) {
    return 'earthquake';
  }
  if (prev === 'eew') {
    return eqMs <= 0 ? 'earthquake' : 'none';
  }
  return prev;
}
