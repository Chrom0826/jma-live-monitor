import React, { useEffect, useMemo, useRef } from 'react';
import {
  AmedasMetric,
  AmedasStationData,
  EarthquakeReport,
  EewDisplayMode,
  EewReport,
  ForecastViewMode,
  InterruptKind,
  MapViewportState,
  MonitorDataBundle,
  RegionConfig,
  RegionalWarningItem,
  SceneId,
  TsunamiForecastReport,
  TsunamiStationItem,
  TyphoonReport,
  VolcanoStatusItem,
  WarningSeverity,
} from '../types/jma';
import {
  computeAmedasTop5Rankings,
  getAmedasMetricColor,
  getSeismicScaleStyle,
  renderBroadcastWeatherSvg,
} from '../utils/jmaParser';
import {
  doesEarthquakeMatchEew,
  formatEewScaleRange,
  formatOccurrenceTimeJa,
  getLpgmClassStyle,
  getSeismicScaleBadgeStyle,
  getTsunamiGradeStyle,
  hasActualEewLpgm,
  isEewFinal,
  isEewSpecialWarning,
  isEewStillActive,
  isEewWarning,
} from '../utils/eewTsunami';
import { resolveEffectiveScene } from '../utils/quakeInterrupt';

function formatCompactDateTime(raw: string | null | undefined): string {
  if (!raw) return '直近';
  const s = raw.trim();
  return s.replace(/^\d{4}[/-](\d{1,2})[/-](\d{1,2})/, (_, m, d) => {
    return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
  });
}

const broadcastWeatherSvgCache = new Map<string, string>();
function getCachedBroadcastWeatherSvg(
  weatherCode: string | undefined,
  weatherText: string | undefined,
  width: number,
  height: number
): string {
  const key = `${weatherCode || ''}|${weatherText || ''}|${width}x${height}`;
  let svg = broadcastWeatherSvgCache.get(key);
  if (svg === undefined) {
    svg = renderBroadcastWeatherSvg(weatherCode, weatherText, width, height);
    if (broadcastWeatherSvgCache.size >= 256) {
      const firstKey = broadcastWeatherSvgCache.keys().next().value;
      if (firstKey !== undefined) broadcastWeatherSvgCache.delete(firstKey);
    }
    broadcastWeatherSvgCache.set(key, svg);
  }
  return svg;
}

const EMPTY_AMEDAS_RANKINGS = {
  tempHigh5: [] as AmedasStationData[],
  tempLow5: [] as AmedasStationData[],
  precipTop5: [] as AmedasStationData[],
  windTop5: [] as AmedasStationData[],
  snowTop5: [] as AmedasStationData[],
};

const WarningDivisionRow: React.FC<{
  w: RegionalWarningItem;
  isFocusedDivision: boolean;
}> = React.memo(({ w, isFocusedDivision }) => {
  const divKey = w.divisionCode || w.id;
  return (
    <div
      data-division-code={divKey}
      className={`pb-1.5 transition-colors ${
        isFocusedDivision
          ? 'bg-sky-950/60 ring-2 ring-inset ring-sky-400 border-l-4 border-sky-400'
          : ''
      }`}
    >
      <div
        className={`px-2.5 py-0.5 text-[0.8125rem] font-bold tracking-wide flex items-center justify-between gap-1.5 ${
          isFocusedDivision
            ? 'bg-sky-600 text-white font-extrabold'
            : w.severity === 'special'
              ? 'bg-purple-900 text-white'
              : w.severity === 'warning'
                ? 'bg-red-900/90 text-white'
                : 'bg-[#3E434F] text-white'
        }`}
      >
        <span className="min-w-0 truncate">{w.prefecture}</span>
        {(w.severity === 'warning' || w.severity === 'special') && (
          <span className="text-[0.625rem] font-mono px-1.5 py-0.2 bg-red-600 text-white rounded-xs whitespace-nowrap shrink-0">
            {w.severity === 'special' ? '特別警報' : '警報'}
          </span>
        )}
      </div>
      <div className="px-2.5 pt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {w.badgeItems && w.badgeItems.length > 0 ? (
          w.badgeItems.map((badge) => (
            <span
              key={`${w.id}-${badge.code}`}
              className="inline-flex items-center gap-1 text-[0.8125rem] font-bold text-white whitespace-nowrap"
            >
              {renderSeverityDot(badge.severity)}
              <span>{badge.name}</span>
            </span>
          ))
        ) : (
          <span className="text-xs text-neutral-300">
            {w.activeWarnings.join('・')}
          </span>
        )}
      </div>
    </div>
  );
});

const ForecastCity3hCard: React.FC<{
  fc: MonitorDataBundle['forecasts'][number];
  forecast3hIndex: number;
  onChangeForecast3hIndex?: (idx: number) => void;
}> = React.memo(({ fc, forecast3hIndex, onChangeForecast3hIndex }) => {
  const slots = fc.hourly3h || [];
  return (
    <div className="border border-[#262E3D] bg-[#11151F] rounded-xs overflow-hidden">
      <div className="bg-[#1A2230] px-2 py-0.5 flex items-center justify-between text-xs border-b border-[#262E3D]">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-black text-white whitespace-nowrap">
            {fc.cityName}
          </span>
          <span className="text-[0.6875rem] text-sky-200 font-bold truncate">
            {fc.todayWeather}
          </span>
        </div>
        <span className="font-mono text-[0.6875rem] shrink-0">
          <span className="text-red-400 font-bold">
            {fc.todayTempMax ?? fc.tempMax}℃
          </span>
          <span className="text-neutral-500">/</span>
          <span className="text-sky-400 font-bold">
            {fc.todayTempMin ?? fc.tempMin}℃
          </span>
        </span>
      </div>

      {/* 8-slot 3-hourly progression strip (03時..24時) */}
      <div className="grid grid-cols-8 divide-x divide-neutral-800 bg-[#0D1017]">
        {slots.map((slot, sIdx) => {
          const isCurrent = sIdx === forecast3hIndex;
          return (
            <button
              key={slot.timeLabel}
              type="button"
              onClick={() => onChangeForecast3hIndex?.(sIdx)}
              className={`py-1 px-0.5 flex flex-col items-center justify-between transition-colors cursor-pointer ${
                isCurrent
                  ? 'bg-sky-900/50 ring-1 ring-inset ring-amber-400'
                  : 'hover:bg-neutral-800/60'
              }`}
            >
              <span
                className={`text-[0.5625rem] font-mono leading-none ${
                  isCurrent ? 'text-amber-300 font-black' : 'text-neutral-400'
                }`}
              >
                {slot.hour}時
              </span>
              <div
                className="my-0.5 w-[1.5rem] h-[1.0625rem] [&_svg]:w-full [&_svg]:h-full"
                dangerouslySetInnerHTML={{
                  __html: getCachedBroadcastWeatherSvg(
                    slot.weatherCode,
                    slot.weatherText,
                    24,
                    17
                  ),
                }}
              />
              <span className="text-[0.625rem] font-mono font-bold text-white leading-none">
                {slot.temp}°
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

interface SceneDetailPanelProps {
  activeScene: SceneId;
  activeRegionConfig: RegionConfig;
  activeWarningDivision?: RegionalWarningItem | null;
  isFinalWarningNational?: boolean;
  mapViewport?: MapViewportState;
  data: MonitorDataBundle;
  selectedEarthquake: EarthquakeReport;
  selectedTyphoon: TyphoonReport | null;
  typhoonPatrolStep?: number;
  onSelectTyphoon: (tc: TyphoonReport) => void;
  onReturnTyphoonOverview?: () => void;
  activeVolcano: VolcanoStatusItem;
  activeTsunamiStation?: TsunamiStationItem;
  activeEew?: EewReport | null;
  activeTsunamiForecast?: TsunamiForecastReport | null;
  isTsunamiDemo?: boolean;
  onToggleTsunamiDemo?: () => void;
  amedasMetric: AmedasMetric;
  onChangeAmedasMetric: (metric: AmedasMetric) => void;
  forecastViewMode?: ForecastViewMode;
  onChangeForecastViewMode?: (mode: ForecastViewMode) => void;
  forecast3hIndex?: number;
  onChangeForecast3hIndex?: (idx: number) => void;
  onSelectEarthquake: (eq: EarthquakeReport) => void;
  interruptKind: InterruptKind;
  onDismissInterrupt: () => void;
  isLoopPaused: boolean;
  loopIntervalSec: number;
  eewDisplayMode?: EewDisplayMode;
  onChangeEewDisplayMode?: (mode: EewDisplayMode) => void;
  onSceneComplete: () => void;
  isMobilePortrait?: boolean;
}

function renderSeverityDot(severity: WarningSeverity) {
  if (severity === 'special') {
    return (
      <span
        className="inline-block w-3 h-3 rounded-full bg-purple-600 border border-purple-300 shrink-0"
        title="特別警報"
      />
    );
  }
  if (severity === 'warning') {
    return (
      <span
        className="inline-block w-3 h-3 rounded-full bg-red-600 shrink-0"
        title="警報"
      />
    );
  }
  return (
    <span
      className="inline-block w-3 h-3 rounded-full bg-yellow-400 shrink-0"
      title="注意報"
    />
  );
}



export const SceneDetailPanel: React.FC<SceneDetailPanelProps> = React.memo(({
  activeScene,
  activeRegionConfig,
  activeWarningDivision = null,
  isFinalWarningNational = false,
  mapViewport,
  data,
  selectedEarthquake,
  selectedTyphoon,
  typhoonPatrolStep = 0,
  onSelectTyphoon,
  onReturnTyphoonOverview,
  activeVolcano,
  activeTsunamiStation = null,
  activeEew = null,
  activeTsunamiForecast = null,
  isTsunamiDemo = false,
  onToggleTsunamiDemo,
  amedasMetric,
  onChangeAmedasMetric,
  forecastViewMode = 'today_3h',
  onChangeForecastViewMode,
  forecast3hIndex = 2,
  onChangeForecast3hIndex,
  onSelectEarthquake,
  interruptKind,
  onDismissInterrupt,
  isLoopPaused,
  loopIntervalSec,
  eewDisplayMode = 'intensity',
  onChangeEewDisplayMode,
  onSceneComplete,
  isMobilePortrait = false,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const onSceneCompleteRef = useRef<() => void>(onSceneComplete);

  const effectiveScene: SceneId = resolveEffectiveScene(activeScene, interruptKind);

  const amedasRankings = useMemo(
    () =>
      effectiveScene === 'amedas'
        ? computeAmedasTop5Rankings(data.amedas)
        : EMPTY_AMEDAS_RANKINGS,
    [effectiveScene, data.amedas]
  );

  const radarRainStations = useMemo(
    () =>
      effectiveScene === 'radar'
        ? data.amedas
            .filter((a) => a.precip1h > 0 || a.windSpeed >= 12)
            .slice(0, 18)
        : [],
    [effectiveScene, data.amedas]
  );

  const groupedEarthquakeStations = useMemo(() => {
    if (effectiveScene !== 'earthquake') return [];
    const grouped = new Map<
      string,
      {
        prefecture: string;
        scaleCode: number;
        scaleLabel: string;
        names: string[];
        totalCount: number;
      }
    >();
    for (const st of selectedEarthquake.stations) {
      const key = `${st.prefecture}-${st.scaleCode}`;
      const labelName = st.stationName || st.city;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          prefecture: st.prefecture,
          scaleCode: st.scaleCode,
          scaleLabel: st.scaleLabel,
          names: [labelName],
          totalCount: 1,
        });
      } else {
        existing.totalCount += 1;
        if (existing.names.length < 4 && !existing.names.includes(labelName)) {
          existing.names.push(labelName);
        }
      }
    }
    return Array.from(grouped.values()).sort(
      (a, b) => b.scaleCode - a.scaleCode || b.totalCount - a.totalCount
    );
  }, [effectiveScene, selectedEarthquake]);

  useEffect(() => {
    onSceneCompleteRef.current = onSceneComplete;
  }, [onSceneComplete]);

  // Right panel always groups warnings by the 57 JMA divisions:
  // 「宗谷」「網走・北見・紋別」「上川・留萌」「石狩・空知・後志」「釧路・根室」「胆振・日高」「渡島・檜山」
  // 「各都府県」「鹿児島県（奄美地方除く）」「奄美地方」「沖縄本島地方」「大東島地方」「宮古島地方」「八重山地方」
  const displayWarnings = data.warnings;

  const hasTyphoons = data.typhoons.length > 0;
  const totalTyphoons = data.typhoons.length;
  const activeTyphoon =
    (selectedTyphoon &&
      data.typhoons.find((t) => t.id === selectedTyphoon.id)) ||
    data.typhoons[0] ||
    null;
  const isSingleTyphoonMode =
    effectiveScene === 'typhoon' &&
    hasTyphoons &&
    (totalTyphoons <= 1 ||
      (typeof typhoonPatrolStep === 'number' &&
        typhoonPatrolStep >= 1 &&
        typhoonPatrolStep <= totalTyphoons));

  // Reset scroll position to top when scene, zoomed region, typhoon, or AMeDAS metric changes
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (effectiveScene === 'warnings' && activeWarningDivision) {
      return;
    }
    el.scrollTop = 0;
  }, [
    effectiveScene,
    activeRegionConfig.id,
    activeWarningDivision,
    isFinalWarningNational,
    amedasMetric,
    selectedTyphoon?.id,
    typhoonPatrolStep,
    selectedEarthquake.id,
  ]);

  // Auto-scroll right-side information list and transition to next scene when scroll finishes
  // ('radar' and 'amedas' scene transitions are controlled by MonitorMap)
  useEffect(() => {
    if (effectiveScene === 'radar' || effectiveScene === 'amedas') return;
    if (isLoopPaused || interruptKind !== 'none') return;

    const el = scrollContainerRef.current;
    if (!el) return;

    let scrollRaf = 0;
    let startDelayTimer: ReturnType<typeof setTimeout> | null = null;
    let endHoldTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    // Special handling for warnings scene when zoomed into an active 警報/特別警報 division
    // Scroll the target division into view; bottom XML ticker + min loop interval controls step progression.
    if (effectiveScene === 'warnings' && activeWarningDivision) {
      const targetCode =
        activeWarningDivision.divisionCode || activeWarningDivision.id;
      const targetNode = el.querySelector(
        `[data-division-code="${targetCode}"]`
      ) as HTMLElement | null;
      if (targetNode) {
        const targetScrollTop = Math.max(
          0,
          targetNode.offsetTop - el.clientHeight * 0.25
        );
        el.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      }
      return;
    }

    // Special handling for final nationwide return view in warnings scene after zooming into active divisions
    if (effectiveScene === 'warnings' && isFinalWarningNational) {
      el.scrollTop = 0;
      fallbackTimer = setTimeout(() => {
        if (!cancelled) {
          onSceneCompleteRef.current();
        }
      }, 3200);

      return () => {
        cancelled = true;
        if (fallbackTimer) clearTimeout(fallbackTimer);
      };
    }

    // Special handling for typhoon patrol steps:
    // 0 = overview (all low-pressure systems blocks, no forecasts)
    // 1..M = single cyclone focus (fixed header + forecast timeline with ↓ arrows)
    // M+1 = return to overview
    if (effectiveScene === 'typhoon') {
      const isOverview =
        totalTyphoons > 1 &&
        (typhoonPatrolStep === 0 || typhoonPatrolStep > totalTyphoons);
      const holdMs = !hasTyphoons
        ? Math.max(10000, loopIntervalSec * 1000)
        : isOverview
          ? Math.min(Math.max(5500, loopIntervalSec * 400), 7000)
          : Math.min(Math.max(7000, loopIntervalSec * 500), 9000);

      fallbackTimer = setTimeout(() => {
        if (!cancelled) {
          onSceneCompleteRef.current();
        }
      }, holdMs);

      return () => {
        cancelled = true;
        if (fallbackTimer) clearTimeout(fallbackTimer);
      };
    }

    // When in 'forecast', scene progression is managed by App.tsx's dedicated timer
    // (stepping 03時..24時 -> tomorrow -> day_after -> next scene)
    if (effectiveScene === 'forecast') {
      return;
    }

    const minSceneDurationMs = Math.max(10000, loopIntervalSec * 1000);
    const sceneStartTime = performance.now();
    const maxScroll = el.scrollHeight - el.clientHeight;

    if (maxScroll > 6) {
      // Scrollable list (e.g., nationwide Warnings list, Earthquake station list):
      // Pause briefly at top, smoothly scroll down to the bottom, and hold so the total scene display time
      // is ALWAYS at least `minSceneDurationMs` (never flashes by in an instant when scroll distance is short!)
      let virtualScrollTop = el.scrollTop;
      const rootFontPx =
        typeof window !== 'undefined'
          ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
          : 16;
      const scrollSpeedPxPerTick = 2.4 * (rootFontPx / 16); // ~72px/s scaled at 30fps

      startDelayTimer = setTimeout(() => {
        if (cancelled) return;
        const initialContainer = scrollContainerRef.current;
        const cachedMax = initialContainer
          ? Math.max(0, initialContainer.scrollHeight - initialContainer.clientHeight)
          : maxScroll;

        // vsync-aligned, time-based scrolling (72px/s) instead of a 33ms timer: smoother and no timer jitter
        let lastTs = performance.now();
        const scrollTick = (now: number) => {
          scrollRaf = 0;
          if (cancelled) return;
          const container = scrollContainerRef.current;
          if (!container) return;
          const dt = Math.min(64, now - lastTs);
          lastTs = now;

          if (cachedMax <= 4) {
            const remainingHoldMs = Math.max(
              2000,
              minSceneDurationMs - (performance.now() - sceneStartTime)
            );
            endHoldTimer = setTimeout(() => {
              if (!cancelled) onSceneCompleteRef.current();
            }, remainingHoldMs);
            return;
          }

          virtualScrollTop = Math.min(
            cachedMax,
            virtualScrollTop + (scrollSpeedPxPerTick / 33) * dt
          );
          container.scrollTop = virtualScrollTop;

          if (virtualScrollTop >= cachedMax - 1.5) {
            const remainingHoldMs = Math.max(
              2000,
              minSceneDurationMs - (performance.now() - sceneStartTime)
            );
            endHoldTimer = setTimeout(() => {
              if (!cancelled) onSceneCompleteRef.current();
            }, remainingHoldMs);
            return;
          }
          scrollRaf = requestAnimationFrame(scrollTick);
        };
        scrollRaf = requestAnimationFrame(scrollTick);
      }, 1500);
    } else {
      // Non-overflowing right panel (e.g., Typhoon / Forecast / Earthquake with short list):
      // Hold for at least minSceneDurationMs (or 1s for short earthquake list) before signaling completion
      const holdMs = effectiveScene === 'earthquake' ? 1000 : minSceneDurationMs;
      fallbackTimer = setTimeout(() => {
        if (!cancelled) {
          onSceneCompleteRef.current();
        }
      }, holdMs);
    }

    return () => {
      cancelled = true;
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      if (startDelayTimer) clearTimeout(startDelayTimer);
      if (endHoldTimer) clearTimeout(endHoldTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [
    effectiveScene,
    activeRegionConfig.id,
    activeWarningDivision,
    isFinalWarningNational,
    amedasMetric,
    selectedTyphoon?.id,
    typhoonPatrolStep,
    totalTyphoons,
    hasTyphoons,
    selectedEarthquake.id,
    isLoopPaused,
    interruptKind,
    loopIntervalSec,
    effectiveScene === 'warnings' ? displayWarnings.length : 0,
  ]);

  return (
    <aside
      aria-label="地域別防災ステータス一覧"
      className={`${
        isMobilePortrait ? 'w-full' : 'w-[15.25rem]'
      } h-full flex flex-col gap-1.5 md:gap-2 pointer-events-auto select-none`}
    >
      {/* Interrupt Dismiss Box when an emergency / anomaly interrupt is active */}
      {interruptKind !== 'none' && (() => {
        const isEewSpecial =
          interruptKind === 'eew' &&
          Boolean(
            activeEew &&
              activeEew.isWarning !== false &&
              (activeEew.maxScaleCode >= 55 || (activeEew.maxLpgmClass ?? 0) >= 4)
          );
        const isEewForecastOnly =
          interruptKind === 'eew' && Boolean(activeEew && activeEew.isWarning === false);
        const hasActiveTsunamiWarn =
          interruptKind === 'tsunami' &&
          Boolean(
            activeTsunamiForecast &&
              !activeTsunamiForecast.cancelled &&
              activeTsunamiForecast.areas.length > 0
          );
        const isEewLiveDuringTsunami =
          interruptKind === 'tsunami' &&
          Boolean(activeEew && isEewStillActive(activeEew));
        const isMajorTsunamiInterrupt =
          hasActiveTsunamiWarn &&
          Boolean(activeTsunamiForecast?.areas.some((a) => a.grade === 'MajorWarning'));

        const isPurple = isEewSpecial || isMajorTsunamiInterrupt;
        const isAmber = isEewForecastOnly;

        return (
          <div
            className={`px-2.5 py-1.5 shrink-0 border ${
              isPurple
                ? 'bg-purple-950/95 border-purple-500'
                : isAmber
                  ? 'bg-amber-950/95 border-amber-500'
                  : 'bg-red-950/95 border-red-500'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`text-[0.6875rem] font-mono font-bold whitespace-nowrap min-w-0 truncate ${
                  isPurple
                    ? 'text-purple-200'
                    : isAmber
                      ? 'text-amber-200'
                      : 'text-red-200'
                }`}
              >
                {interruptKind === 'eew'
                  ? '● 緊急地震速報 割込中'
                  : interruptKind === 'earthquake'
                    ? '● 地震情報 割込中'
                    : interruptKind === 'volcano'
                      ? '● 火山Lv変化 割込中'
                      : interruptKind === 'tsunami'
                        ? isEewLiveDuringTsunami
                          ? '● 津波・EEW統合表示'
                          : hasActiveTsunamiWarn
                            ? '● 津波情報 割込中'
                            : '● 潮位変化 割込中'
                        : '● 台風進路 割込中'}
              </span>
              <button
                type="button"
                onClick={onDismissInterrupt}
                className={`px-2 py-0.5 text-[0.6875rem] font-bold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isPurple
                    ? 'bg-purple-600 hover:bg-purple-500'
                    : isAmber
                      ? 'bg-amber-600 hover:bg-amber-500'
                      : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                巡回へ戻る
              </button>
            </div>
          </div>
        );
      })()}

      {/* Main Slim Vertical Regional Strip (Matches NERV防災ライブ right column) */}
      <div
        ref={effectiveScene === 'earthquake' ? null : scrollContainerRef}
        data-testid="scene-detail-scroll-container"
        className={`flex-1 bg-[#111318]/92 border border-[#686E7A] ${
          effectiveScene === 'earthquake'
            ? 'overflow-hidden flex flex-col'
            : 'overflow-y-auto divide-y divide-[#2B303A]'
        }`}
      >
        {/* ==================== WARNINGS (NERV Style 57-Division Regional Strip) ==================== */}
        {effectiveScene === 'warnings' && (
          <>
            <div className="bg-[#1A1E26] px-2.5 py-1 text-[0.6875rem] font-mono text-amber-300 font-bold flex items-center justify-between gap-1.5">
              <span className="min-w-0 truncate">
                {activeWarningDivision
                  ? `警報発表地域 (${activeWarningDivision.prefecture})`
                  : '全国 地域別警報・注意報'}
              </span>
              <span className="whitespace-nowrap shrink-0">{displayWarnings.length}区分</span>
            </div>
            {displayWarnings.length === 0 ? (
              <div className="p-4 text-center text-xs text-neutral-400 font-mono">
                現在、発表されている警報・注意報はありません
              </div>
            ) : (
              displayWarnings.map((w) => {
                const divKey = w.divisionCode || w.id;
                const isFocusedDivision =
                  activeWarningDivision != null &&
                  (activeWarningDivision.divisionCode ||
                    activeWarningDivision.id) === divKey;
                return (
                  <WarningDivisionRow
                    key={w.id}
                    w={w}
                    isFocusedDivision={isFocusedDivision}
                  />
                );
              })
            )}
          </>
        )}

        {/* ==================== TYPHOON TRACK & FORECAST CONE ==================== */}
        {effectiveScene === 'typhoon' && (
          <>
            {!hasTyphoons || !activeTyphoon ? (
              <div data-testid="typhoon-panel-root" className="pb-2">
                <div className="bg-[#3E434F] px-2.5 py-1 text-[0.8125rem] font-bold text-white flex items-center justify-between gap-1.5">
                  <span className="min-w-0 truncate">台風解析・進路予報情報</span>
                  <span className="font-mono text-[0.6875rem] text-neutral-300 whitespace-nowrap shrink-0">
                    0件
                  </span>
                </div>
                <div className="px-2.5 py-3 text-xs text-neutral-300 space-y-2">
                  <div
                    data-testid="typhoon-none-message"
                    className="p-2.5 bg-neutral-900/80 border border-neutral-700 text-neutral-200 font-medium"
                  >
                    現在台風情報は発表されていません
                  </div>
                </div>
              </div>
            ) : !isSingleTyphoonMode ? (
              /* ==================== 1. OVERVIEW MODE (All Cyclones in Blocks, Current Specs Only) ==================== */
              <div className="space-y-2.5 pb-2">
                {/* Header banner */}
                <div className="bg-red-700 px-2.5 py-1.5 text-xs font-bold text-white flex items-center justify-between gap-1.5 shadow-md">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
                    <span className="truncate">低気圧一覧（全 {data.typhoons.length} 件）</span>
                  </div>
                  <span className="text-[0.625rem] font-mono text-red-200 shrink-0 whitespace-nowrap">
                    気象庁実況
                  </span>
                </div>

                {data.typhoons.map((tc) => {
                  const p0 =
                    tc.points.find((p) => !p.isForecast) || tc.points[0];

                  return (
                    <div
                      key={tc.id}
                      onClick={() => onSelectTyphoon(tc)}
                      className="border border-neutral-700 bg-[#141822] rounded-md overflow-hidden shadow-lg transition-all hover:border-sky-400 cursor-pointer group"
                    >
                      {/* Card Header: Number/Name + Time (Category square badge removed) */}
                      <div className="bg-[#1C2230] group-hover:bg-[#222B3D] px-3 py-2 flex items-baseline justify-between border-b border-neutral-700 transition-colors gap-2">
                        <div className="flex items-baseline gap-2 min-w-0">
                          <span className="text-base font-black text-white tracking-wide shrink-0 whitespace-nowrap">
                            {tc.displayNumber}
                          </span>
                          {tc.nameJp && tc.nameJp !== tc.displayNumber && (
                            <span className="text-xs font-bold text-sky-300 truncate">
                              {tc.nameJp} {tc.nameEn && `(${tc.nameEn})`}
                            </span>
                          )}
                        </div>
                        <span className="text-[0.625rem] font-mono text-neutral-400 shrink-0 whitespace-nowrap">
                          {p0?.timeLabel || tc.issueTimeJst}
                        </span>
                      </div>

                      {/* Card Body: Large Bold Numbers for Specs */}
                      <div className="p-3 space-y-2.5">
                        {/* Position & Course on 2 clean rows */}
                        <div className="space-y-1 text-xs border-b border-neutral-800 pb-2">
                          <div className="flex items-baseline justify-between">
                            <span className="text-neutral-400 shrink-0 whitespace-nowrap">
                              現在地:
                            </span>
                            <span className="text-neutral-200 font-bold text-right truncate ml-2">
                              {p0?.location || '実況位置'}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between">
                            <span className="text-neutral-400 shrink-0 whitespace-nowrap">
                              進行・速度:
                            </span>
                            <div className="font-mono text-right ml-2 whitespace-nowrap">
                              {p0?.course && p0?.speedKmh ? (
                                <>
                                  <span className="text-cyan-400 font-bold">
                                    {p0.course}
                                  </span>
                                  <span className="text-base font-black text-cyan-300 ml-1.5">
                                    {p0.speedKmh}
                                  </span>
                                  <span className="text-[0.625rem] text-neutral-400 ml-0.5">
                                    km/h
                                  </span>
                                </>
                              ) : (
                                <span className="text-neutral-400">-</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Large Metric Cards: Pressure & Wind (Gust wrapped cleanly below) */}
                        <div className="grid grid-cols-2 gap-2">
                          {/* Pressure */}
                          <div className="bg-[#0B0F17] border border-neutral-800 p-2.5 rounded flex flex-col justify-between">
                            <span className="text-[0.625rem] text-neutral-400 font-bold tracking-wider">
                              中心気圧
                            </span>
                            <div className="flex items-baseline gap-1 mt-0.5">
                              <span className="text-2xl font-black font-mono text-white tracking-tight">
                                {p0?.pressureHpa || '-'}
                              </span>
                              <span className="text-xs font-bold text-neutral-400">
                                hPa
                              </span>
                            </div>
                            <div className="text-[0.6875rem] font-mono text-transparent mt-0.5 select-none leading-tight">
                              -
                            </div>
                          </div>

                          {/* Max Wind */}
                          <div className="bg-[#0B0F17] border border-neutral-800 p-2.5 rounded flex flex-col justify-between">
                            <span className="text-[0.625rem] text-neutral-400 font-bold tracking-wider">
                              最大風速
                            </span>
                            <div className="flex items-baseline gap-1 mt-0.5">
                              <span className="text-2xl font-black font-mono text-yellow-300 tracking-tight">
                                {p0?.maxWindMs || '-'}
                              </span>
                              <span className="text-xs font-bold text-neutral-400">
                                m/s
                              </span>
                            </div>
                            {p0?.maxGustMs ? (
                              <div className="text-[0.6875rem] font-mono text-neutral-300 mt-0.5 leading-tight whitespace-nowrap">
                                <span className="text-neutral-400">最大瞬間</span>{' '}
                                <span className="font-bold text-yellow-400">
                                  {p0.maxGustMs}
                                </span>{' '}
                                <span className="text-[0.625rem] text-neutral-400">
                                  m/s
                                </span>
                              </div>
                            ) : (
                              <div className="text-[0.6875rem] font-mono text-transparent mt-0.5 select-none leading-tight">
                                -
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Gale / Storm Radius if present */}
                        {(p0?.stormRadiusKm > 0 || p0?.galeRadiusKm > 0) && (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs pt-1 border-t border-neutral-800/80 font-mono">
                            {p0.stormRadiusKm > 0 && (
                              <span className="inline-flex items-center gap-1 text-red-400 whitespace-nowrap">
                                <span className="w-2 h-2 rounded-full bg-red-500 inline-block shrink-0" />
                                暴風域:{' '}
                                <span className="font-bold text-white text-sm">
                                  {p0.stormRadiusKm}
                                </span>
                                km
                              </span>
                            )}
                            {p0.galeRadiusKm > 0 && (
                              <span className="inline-flex items-center gap-1 text-yellow-400 whitespace-nowrap">
                                <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block shrink-0" />
                                強風域:{' '}
                                <span className="font-bold text-white text-sm">
                                  {p0.galeRadiusKm}
                                </span>
                                km
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ==================== 2. SINGLE CYCLONE DETAIL MODE (Header Block Fixed + Forecast Timeline with ↓) ==================== */
              <div className="space-y-2.5 pb-2">
                {/* Back to overview button / status header */}
                <div className="flex items-center justify-between text-xs pb-0.5">
                  <div className="flex items-center gap-1.5 text-sky-300 font-bold shrink-0 whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                    <span>低気圧詳細{totalTyphoons > 1 ? ` (${typhoonPatrolStep}/${totalTyphoons})` : ''}</span>
                  </div>
                  {totalTyphoons > 1 && onReturnTyphoonOverview && (
                    <button
                      type="button"
                      onClick={onReturnTyphoonOverview}
                      className="px-2 py-0.5 text-[0.6875rem] font-bold bg-[#1C2230] border border-neutral-600 text-neutral-300 hover:text-white hover:border-sky-400 rounded transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      全低気圧一覧 ↩
                    </button>
                  )}
                </div>

                {/* Selected Typhoon Primary Header Block (Fixed) with Selection Highlight Animation */}
                {(() => {
                  const p0 =
                    activeTyphoon.points.find((p) => !p.isForecast) ||
                    activeTyphoon.points[0];

                  return (
                    <div className="border-2 border-sky-400 bg-[#141A28] rounded-md overflow-hidden shadow-[0_0_20px_rgba(56,189,248,0.35)] ring-1 ring-sky-300/50 animate-in fade-in slide-in-from-top-2 duration-300">
                      {/* Fixed Top Block Header: NO square category block */}
                      <div className="bg-sky-600 px-3 py-2 flex items-center justify-between text-white border-b border-sky-400/60 gap-2">
                        <div className="flex items-baseline gap-2 min-w-0">
                          <span className="text-base font-black tracking-wide shrink-0 whitespace-nowrap">
                            {activeTyphoon.displayNumber}
                          </span>
                          {activeTyphoon.nameJp &&
                            activeTyphoon.nameJp !==
                              activeTyphoon.displayNumber && (
                              <span className="text-xs font-bold text-sky-100 truncate">
                                {activeTyphoon.nameJp}{' '}
                                {activeTyphoon.nameEn &&
                                  `(${activeTyphoon.nameEn})`}
                              </span>
                            )}
                        </div>
                        <span className="text-[0.625rem] font-bold bg-sky-950 px-2 py-0.5 rounded-full text-sky-200 border border-sky-400/50 shrink-0 whitespace-nowrap">
                          実況
                        </span>
                      </div>

                      {/* Current Stats with BIG BOLD NUMBERS */}
                      <div className="p-3 space-y-2.5">
                        <div className="space-y-1 text-xs border-b border-neutral-700/80 pb-2">
                          <div className="flex items-baseline justify-between">
                            <span className="text-neutral-400 shrink-0 whitespace-nowrap">
                              現在位置:
                            </span>
                            <span className="text-white font-bold text-right truncate ml-2">
                              {p0?.location || '実況位置'}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between">
                            <span className="text-neutral-400 shrink-0 whitespace-nowrap">
                              進行・速度:
                            </span>
                            <div className="font-mono text-right ml-2 whitespace-nowrap">
                              {p0?.course && p0?.speedKmh ? (
                                <>
                                  <span className="text-cyan-400 font-bold">
                                    {p0.course}
                                  </span>
                                  <span className="text-base font-black text-cyan-300 ml-1.5">
                                    {p0.speedKmh}
                                  </span>
                                  <span className="text-[0.625rem] text-neutral-400 ml-0.5">
                                    km/h
                                  </span>
                                </>
                              ) : (
                                <span className="text-neutral-400">-</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-[#0B0F17] border border-neutral-700/80 p-2.5 rounded flex flex-col justify-between">
                            <span className="text-[0.625rem] text-neutral-400 font-bold tracking-wider">
                              現在中心気圧
                            </span>
                            <div className="flex items-baseline gap-1 mt-0.5">
                              <span className="text-2xl font-black font-mono text-white tracking-tight">
                                {p0?.pressureHpa || '-'}
                              </span>
                              <span className="text-xs font-bold text-neutral-400">
                                hPa
                              </span>
                            </div>
                            <div className="text-[0.6875rem] font-mono text-transparent mt-0.5 select-none leading-tight">
                              -
                            </div>
                          </div>

                          <div className="bg-[#0B0F17] border border-neutral-700/80 p-2.5 rounded flex flex-col justify-between">
                            <span className="text-[0.625rem] text-neutral-400 font-bold tracking-wider">
                              現在最大風速
                            </span>
                            <div className="flex items-baseline gap-1 mt-0.5">
                              <span className="text-2xl font-black font-mono text-yellow-300 tracking-tight">
                                {p0?.maxWindMs || '-'}
                              </span>
                              <span className="text-xs font-bold text-neutral-400">
                                m/s
                              </span>
                            </div>
                            {p0?.maxGustMs ? (
                              <div className="text-[0.6875rem] font-mono text-neutral-300 mt-0.5 leading-tight whitespace-nowrap">
                                <span className="text-neutral-400">最大瞬間</span>{' '}
                                <span className="font-bold text-yellow-400">
                                  {p0.maxGustMs}
                                </span>{' '}
                                <span className="text-[0.625rem] text-neutral-400">
                                  m/s
                                </span>
                              </div>
                            ) : (
                              <div className="text-[0.6875rem] font-mono text-transparent mt-0.5 select-none leading-tight">
                                -
                              </div>
                            )}
                          </div>
                        </div>

                        {(p0?.stormRadiusKm > 0 || p0?.galeRadiusKm > 0) && (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs pt-1 border-t border-neutral-700/60 font-mono">
                            {p0.stormRadiusKm > 0 && (
                              <span className="inline-flex items-center gap-1 text-red-400 whitespace-nowrap">
                                <span className="w-2 h-2 rounded-full bg-red-500 inline-block shrink-0" />
                                暴風域:{' '}
                                <span className="font-bold text-white text-sm">
                                  {p0.stormRadiusKm}
                                </span>
                                km
                              </span>
                            )}
                            {p0.galeRadiusKm > 0 && (
                              <span className="inline-flex items-center gap-1 text-yellow-400 whitespace-nowrap">
                                <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block shrink-0" />
                                強風域:{' '}
                                <span className="font-bold text-white text-sm">
                                  {p0.galeRadiusKm}
                                </span>
                                km
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Forecast Timeline Connected by Downward Arrows */}
                {(() => {
                  const forecastPoints = activeTyphoon.points.filter(
                    (p) => p.isForecast
                  );

                  if (forecastPoints.length === 0) {
                    return (
                      <div className="p-3 bg-[#13161F] border border-neutral-800 rounded text-center text-xs text-neutral-400 mt-2">
                        今後の進路予報はありません（現在の実況情報のみ）
                      </div>
                    );
                  }

                  return (
                    <div className="pt-0.5 space-y-1">
                      {forecastPoints.map((pt, fIdx) => (
                        <React.Fragment key={`${activeTyphoon.id}-fc-${fIdx}`}>
                          {/* Downward connecting arrow before each forecast card */}
                          <div className="flex flex-col items-center justify-center my-1.5 py-0.5">
                            <div className="w-0.5 h-3.5 bg-gradient-to-b from-sky-400 to-sky-500" />
                            <svg
                              className="w-4 h-4 text-sky-400 -mt-1"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 14.5a.75.75 0 01-.53-.22l-4.25-4.25a.75.75 0 111.06-1.06L9.25 11.94V3.75a.75.75 0 011.5 0v8.19l2.97-2.97a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-.53.22z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>

                          {/* Forecast Card: Category badge removed so date/time never wraps */}
                          <div className="border border-neutral-700/90 bg-[#141822] rounded-md overflow-hidden shadow-md">
                            {/* Forecast Time Header */}
                            <div className="bg-[#212736] px-3 py-1.5 flex items-baseline justify-between border-b border-neutral-700 gap-2">
                              <span className="text-sm font-black text-white tracking-wide font-mono whitespace-nowrap">
                                {pt.timeLabel}
                              </span>
                              <span className="text-[0.6875rem] font-mono text-neutral-300 shrink-0 whitespace-nowrap">
                                {pt.partLabel}
                              </span>
                            </div>

                            {/* Forecast Stats with BIG NUMBERS & GUST ON NEXT LINE */}
                            <div className="p-2.5 space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                {/* Pressure */}
                                <div className="bg-[#0B0F17] border border-neutral-800 p-2 rounded flex flex-col justify-between">
                                  <span className="text-[0.625rem] text-neutral-400 font-bold">
                                    予想中心気圧
                                  </span>
                                  <div className="flex items-baseline gap-1 mt-0.5">
                                    <span className="text-xl font-black font-mono text-white">
                                      {pt.pressureHpa || '-'}
                                    </span>
                                    <span className="text-xs font-bold text-neutral-400">
                                      hPa
                                    </span>
                                  </div>
                                  <div className="text-[0.6875rem] font-mono text-transparent mt-0.5 select-none leading-tight">
                                    -
                                  </div>
                                </div>

                                {/* Max Wind (Gust on next line) */}
                                <div className="bg-[#0B0F17] border border-neutral-800 p-2 rounded flex flex-col justify-between">
                                  <span className="text-[0.625rem] text-neutral-400 font-bold">
                                    予想最大風速
                                  </span>
                                  <div className="flex items-baseline gap-1 mt-0.5">
                                    <span className="text-xl font-black font-mono text-yellow-300">
                                      {pt.maxWindMs || '-'}
                                    </span>
                                    <span className="text-xs font-bold text-neutral-400">
                                      m/s
                                    </span>
                                  </div>
                                  {pt.maxGustMs > 0 ? (
                                    <div className="text-[0.6875rem] font-mono text-neutral-300 mt-0.5 leading-tight whitespace-nowrap">
                                      <span className="text-neutral-400">最大瞬間</span>{' '}
                                      <span className="font-bold text-yellow-400">
                                        {pt.maxGustMs}
                                      </span>{' '}
                                      <span className="text-[0.625rem] text-neutral-400">
                                        m/s
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="text-[0.6875rem] font-mono text-transparent mt-0.5 select-none leading-tight">
                                      -
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Movement & Probability Circle on 2 clean rows */}
                              <div className="space-y-1 text-xs pt-1.5 border-t border-neutral-800 text-neutral-300 font-mono">
                                <div className="flex items-baseline justify-between">
                                  <span className="text-neutral-400 shrink-0 whitespace-nowrap">
                                    進行・速度:
                                  </span>
                                  <div className="text-right whitespace-nowrap ml-2">
                                    <span className="text-cyan-400 font-bold">
                                      {pt.course}
                                    </span>{' '}
                                    <span className="font-bold text-white text-sm ml-1">
                                      {pt.speedKmh}
                                    </span>
                                    <span className="text-[0.625rem] text-neutral-400 ml-0.5">
                                      km/h
                                    </span>
                                  </div>
                                </div>
                                {pt.probabilityCircleRadiusKm > 0 && (
                                  <div className="flex items-baseline justify-between">
                                    <span className="text-neutral-400 shrink-0 whitespace-nowrap">
                                      予報円半径:
                                    </span>
                                    <div className="text-right whitespace-nowrap ml-2">
                                      <span className="font-bold text-white text-sm">
                                        {pt.probabilityCircleRadiusKm}
                                      </span>
                                      <span className="text-[0.625rem] text-neutral-400 ml-0.5">
                                        km
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}

        {/* ==================== RADAR (High-Res Nowcast + Lightning) ==================== */}
        {effectiveScene === 'radar' && (
          <>
            <div className="pb-2">
              <div className="bg-[#3E434F] px-2.5 py-1 text-[0.8125rem] font-bold text-white">
                高解像度ナウキャスト
              </div>
              <div className="px-2.5 pt-1.5 text-xs text-neutral-200 space-y-1 font-mono">
                <div>解像度: 250mメッシュ (気象庁)</div>
                <div>要素: 降水強度 + 雷ナウキャスト</div>
                <div className="text-yellow-300 font-bold">
                  発雷検知 (LIDEN): {data.lightningPoints.length} 箇所
                </div>
              </div>
            </div>
            {radarRainStations.map((st) => (
                <div key={st.id} className="pb-1.5">
                  <div className="bg-[#3E434F] px-2.5 py-0.5 text-[0.8125rem] font-bold text-white flex items-center justify-between gap-1.5">
                    <span className="min-w-0 truncate">{st.stationName}</span>
                    <span className="text-[0.6875rem] font-mono text-neutral-200 whitespace-nowrap shrink-0">
                      {st.prefecture}
                    </span>
                  </div>
                  <div className="px-2.5 pt-1 flex items-center justify-between gap-2 text-xs font-mono">
                    <span className="text-cyan-300 font-bold whitespace-nowrap">
                      降水 {st.precip1h.toFixed(1)} mm/h
                    </span>
                    <span className="text-neutral-300 whitespace-nowrap shrink-0">
                      風速 {st.windSpeed.toFixed(1)} m/s
                    </span>
                  </div>
                </div>
              ))}
          </>
        )}

        {/* ==================== AMEDAS (Nationwide Top-5 Rankings Fixed: Temp High 5 + Low 5 / Precip Top 5 / Wind Top 5 / Snow Top 5) ==================== */}
        {effectiveScene === 'amedas' &&
          (() => {
            const rankings = amedasRankings;

            const renderRankingCard = (
              st: AmedasStationData,
              rankIdx: number,
              sectionKey: string
            ) => {
              const dotHex = getAmedasMetricColor(st, amedasMetric);
              return (
                <div
                  key={`${sectionKey}-${st.id}`}
                  data-testid={`amedas-rank-item-${sectionKey}`}
                  className="pb-1.5"
                >
                  <div className="bg-[#3E434F] px-2.5 py-0.5 text-[0.8125rem] font-bold text-white flex items-center justify-between gap-1.5">
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <span className="text-[0.6875rem] font-mono font-extrabold text-amber-300 shrink-0">
                        {rankIdx + 1}.
                      </span>
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: dotHex }}
                      />
                      <span className="truncate">{st.stationName}</span>
                    </span>
                    <span className="text-[0.6875rem] text-neutral-200 whitespace-nowrap shrink-0">
                      {st.prefecture}
                    </span>
                  </div>
                  <div className="px-2.5 pt-1 flex items-center justify-between gap-2 text-xs font-mono">
                    {amedasMetric === 'temp' ? (
                      <>
                        <span
                          className="font-extrabold text-sm whitespace-nowrap"
                          style={{ color: dotHex }}
                        >
                          {st.temp.toFixed(1)} ℃
                        </span>
                        <span className="text-neutral-300 whitespace-nowrap shrink-0">
                          {st.windDirection} {st.windSpeed.toFixed(1)}m/s
                        </span>
                      </>
                    ) : amedasMetric === 'precip' ? (
                      <>
                        <span className="text-cyan-300 font-extrabold text-sm whitespace-nowrap">
                          {st.precip1h.toFixed(1)} mm/h
                        </span>
                        <span className="text-neutral-300 whitespace-nowrap shrink-0">
                          {st.hasTemp !== false
                            ? `${st.temp.toFixed(1)}℃`
                            : `${st.windSpeed.toFixed(1)}m/s`}
                        </span>
                      </>
                    ) : amedasMetric === 'wind' ? (
                      <>
                        <span
                          className="font-extrabold text-sm whitespace-nowrap"
                          style={{ color: dotHex }}
                        >
                          {st.windDirection} {st.windSpeed.toFixed(1)} m/s
                        </span>
                        <span className="text-neutral-300 whitespace-nowrap shrink-0">
                          {st.hasTemp !== false
                            ? `${st.temp.toFixed(1)}℃`
                            : `${st.precip1h.toFixed(1)}mm/h`}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-sky-200 font-extrabold text-sm whitespace-nowrap">
                          積雪 {st.snowCm ?? 0} cm
                        </span>
                        <span className="text-neutral-300 whitespace-nowrap shrink-0">
                          {st.hasTemp !== false ? `${st.temp.toFixed(1)}℃` : ''}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            };

            return (
              <>
                <div className="pb-2">
                  <div className="bg-[#3E434F] px-2.5 py-1 text-[0.8125rem] font-bold text-white flex items-center justify-between">
                    <span>アメダス観測ランキング</span>
                    <span className="text-[0.6875rem] font-mono text-amber-300">
                      TOP 5
                    </span>
                  </div>
                  <div className="px-2 pt-1.5 grid grid-cols-4 gap-1">
                    {(
                      [
                        { id: 'temp', label: '気温' },
                        { id: 'precip', label: '降水' },
                        { id: 'wind', label: '風速' },
                        { id: 'snow', label: '積雪' },
                      ] as Array<{ id: AmedasMetric; label: string }>
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onChangeAmedasMetric(m.id)}
                        className={`py-0.5 text-[0.6875rem] font-bold border transition-colors cursor-pointer ${
                          amedasMetric === m.id
                            ? 'bg-amber-500/25 border-amber-400 text-white'
                            : 'bg-[#181B22] border-neutral-700 text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {amedasMetric === 'temp' ? (
                  <>
                    <div
                      data-testid="amedas-ranking-header-temp-high"
                      className="bg-red-950/80 border-y border-red-500/50 px-2.5 py-1 text-xs font-extrabold text-red-200 flex items-center justify-between"
                    >
                      <span>▲ 気温が高い順</span>
                      <span className="font-mono text-[0.625rem]">上位5地点</span>
                    </div>
                    {rankings.tempHigh5.map((st, idx) =>
                      renderRankingCard(st, idx, 'temp-high')
                    )}
                    <div
                      data-testid="amedas-ranking-header-temp-low"
                      className="bg-sky-950/80 border-y border-sky-500/50 px-2.5 py-1 text-xs font-extrabold text-sky-200 flex items-center justify-between"
                    >
                      <span>▼ 気温が低い順</span>
                      <span className="font-mono text-[0.625rem]">上位5地点</span>
                    </div>
                    {rankings.tempLow5.map((st, idx) =>
                      renderRankingCard(st, idx, 'temp-low')
                    )}
                  </>
                ) : amedasMetric === 'precip' ? (
                  <>
                    <div
                      data-testid="amedas-ranking-header-precip"
                      className="bg-cyan-950/80 border-y border-cyan-500/50 px-2.5 py-1 text-xs font-extrabold text-cyan-200 flex items-center justify-between"
                    >
                      <span>▲ 降水量が多い順</span>
                      <span className="font-mono text-[0.625rem]">上位5地点</span>
                    </div>
                    {rankings.precipTop5.length === 0 ? (
                      <div className="px-2.5 py-4 text-xs text-neutral-400 font-mono text-center">
                        現在、降水（0.5mm/h以上）を観測している地点はありません
                      </div>
                    ) : (
                      rankings.precipTop5.map((st, idx) =>
                        renderRankingCard(st, idx, 'precip-top')
                      )
                    )}
                  </>
                ) : amedasMetric === 'wind' ? (
                  <>
                    <div
                      data-testid="amedas-ranking-header-wind"
                      className="bg-emerald-950/80 border-y border-emerald-500/50 px-2.5 py-1 text-xs font-extrabold text-emerald-200 flex items-center justify-between"
                    >
                      <span>▲ 風が強い順</span>
                      <span className="font-mono text-[0.625rem]">上位5地点</span>
                    </div>
                    {rankings.windTop5.map((st, idx) =>
                      renderRankingCard(st, idx, 'wind-top')
                    )}
                  </>
                ) : (
                  <>
                    <div
                      data-testid="amedas-ranking-header-snow"
                      className="bg-indigo-950/80 border-y border-indigo-500/50 px-2.5 py-1 text-xs font-extrabold text-indigo-200 flex items-center justify-between"
                    >
                      <span>▲ 積雪量が多い順</span>
                      <span className="font-mono text-[0.625rem]">上位5地点</span>
                    </div>
                    {rankings.snowTop5.length === 0 ? (
                      <div className="px-2.5 py-4 text-xs text-neutral-400 font-mono text-center">
                        現在、積雪（1cm以上）を観測している地点はありません
                      </div>
                    ) : (
                      rankings.snowTop5.map((st, idx) =>
                        renderRankingCard(st, idx, 'snow-top')
                      )
                    )}
                  </>
                )}
              </>
            );
          })()}

        {/* ==================== FORECAST ==================== */}
        {effectiveScene === 'forecast' &&
          (() => {
            const scopedForecasts = data.forecasts;
            const refFc = scopedForecasts[0];
            const todayDateLabel = refFc?.todayDateLabel || '今日';
            const tomorrowDateLabel = refFc?.tomorrowDateLabel || '明日';
            const dayAfterDateLabel = refFc?.dayAfterDateLabel || '明後日';
            const activeSlot =
              refFc?.hourly3h?.[
                Math.max(
                  0,
                  Math.min(
                    (refFc?.hourly3h?.length || 1) - 1,
                    forecast3hIndex
                  )
                )
              ];

            return (
              <div className="space-y-2 pb-2">
                {/* Sticky Broadcast Mode Switcher Header */}
                <div className="bg-[#181D29] border border-neutral-700 rounded-xs overflow-hidden">
                  <div className="bg-sky-700 px-2.5 py-1 text-xs font-black text-white flex items-center justify-between gap-1.5">
                    <span className="min-w-0 truncate">
                      {forecastViewMode === 'today_3h'
                        ? `今日の3時間ごとの天気 (${todayDateLabel})`
                        : forecastViewMode === 'tomorrow'
                          ? `明日の全国の天気 (${tomorrowDateLabel})`
                          : `明後日の全国の天気 (${dayAfterDateLabel})`}
                    </span>
                    <span className="font-mono text-[0.625rem] bg-sky-950/80 px-1.5 py-0.5 rounded text-sky-200 whitespace-nowrap shrink-0">
                      全{scopedForecasts.length}地域
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 p-1 bg-[#0F131C]">
                    {(
                      [
                        { id: 'today_3h', label: '今日(3時間)' },
                        { id: 'tomorrow', label: `明日 ${tomorrowDateLabel}` },
                        { id: 'day_after', label: `明後日 ${dayAfterDateLabel}` },
                      ] as Array<{ id: ForecastViewMode; label: string }>
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onChangeForecastViewMode?.(m.id)}
                        className={`py-1 text-[0.6875rem] font-bold rounded-xs border transition-colors cursor-pointer truncate ${
                          forecastViewMode === m.id
                            ? 'bg-sky-600 border-sky-300 text-white'
                            : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {forecastViewMode === 'today_3h' ? (
                  /* ==================== 1. TODAY 3-HOURLY UPCOMING WEATHER ==================== */
                  <div className="space-y-1.5">
                    {activeSlot && (
                      <div className="flex items-center justify-between px-2 py-1 bg-amber-950/40 border border-amber-500/50 rounded-xs text-[0.6875rem]">
                        <span className="text-amber-200 font-bold">
                          マップ表示時刻:
                        </span>
                        <span className="font-mono font-black text-amber-300">
                          本日 {activeSlot.timeLabel} 予想
                        </span>
                      </div>
                    )}

                    {scopedForecasts.map((fc) => (
                      <ForecastCity3hCard
                        key={fc.id}
                        fc={fc}
                        forecast3hIndex={forecast3hIndex}
                        onChangeForecast3hIndex={onChangeForecast3hIndex}
                      />
                    ))}
                  </div>
                ) : (
                  /* ==================== 2. TOMORROW / DAY-AFTER-TOMORROW FORECAST CARDS ==================== */
                  <div className="grid grid-cols-2 gap-1.5">
                    {scopedForecasts.map((fc) => {
                      const isTomorrow = forecastViewMode === 'tomorrow';
                      const wCode = isTomorrow
                        ? fc.tomorrowWeatherCode || fc.todayWeatherCode
                        : fc.dayAfterWeatherCode || fc.tomorrowWeatherCode;
                      const wText = isTomorrow
                        ? fc.tomorrowWeather || fc.todayWeather
                        : fc.dayAfterWeather || fc.tomorrowWeather;
                      const tMax = isTomorrow
                        ? (fc.tomorrowTempMax ?? fc.tempMax)
                        : (fc.dayAfterTempMax ?? fc.tempMax);
                      const tMin = isTomorrow
                        ? (fc.tomorrowTempMin ?? fc.tempMin)
                        : (fc.dayAfterTempMin ?? fc.tempMin);
                      const popVal = isTomorrow
                        ? (fc.tomorrowPop ?? Math.max(...fc.pops))
                        : (fc.dayAfterPop ?? Math.max(...fc.pops));

                      return (
                        <div
                          key={fc.id}
                          className="bg-[#11151F] border border-[#262E3D] rounded-xs overflow-hidden shadow-md flex flex-col justify-between"
                        >
                          {/* Dark Theme Header */}
                          <div className="px-2 py-0.5 text-xs font-bold text-slate-200 bg-[#1A2230] flex items-center justify-between border-b border-[#262E3D]">
                            <span className="truncate">{fc.cityName}</span>
                            <span className="text-[0.625rem] font-mono font-bold text-sky-400 shrink-0">
                              {popVal}%
                            </span>
                          </div>

                          {/* Card Body: Left Weather Icon + Right Max/Min Temps */}
                          <div className="p-1.5 flex items-center justify-between gap-1.5 bg-[#0D1017]">
                            <div className="flex flex-col items-center min-w-0">
                              <div
                                className="w-[2.875rem] h-[2rem] [&_svg]:w-full [&_svg]:h-full border border-[#262E3D] rounded-xs overflow-hidden shrink-0 bg-[#0B0F17]"
                                dangerouslySetInnerHTML={{
                                  __html: getCachedBroadcastWeatherSvg(
                                    wCode,
                                    wText,
                                    46,
                                    32
                                  ),
                                }}
                              />
                              <span className="text-[0.625rem] font-bold text-slate-300 truncate max-w-[4.25rem] mt-0.5">
                                {wText}
                              </span>
                            </div>

                            {/* Stacked Dark Theme Temperature Box */}
                            <div className="w-11 border border-[#262E3D] rounded-xs overflow-hidden font-mono shrink-0">
                              <div className="bg-red-950/40 text-red-400 text-xs font-bold text-center leading-4 border-b border-[#262E3D]">
                                {tMax}℃
                              </div>
                              <div className="bg-sky-950/40 text-sky-400 text-xs font-bold text-center leading-4">
                                {tMin}℃
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

        {/* ==================== VOLCANO ==================== */}
        {effectiveScene === 'volcano' && (
          <>
            <div className="pb-2">
              <div className="bg-red-700 px-2.5 py-1 text-[0.8125rem] font-bold text-white">
                噴火警戒レベル変化・詳細監視
              </div>
              <div className="px-2.5 pt-2 space-y-1.5">
                <div className="text-base font-extrabold text-white">
                  {activeVolcano.name}
                </div>
                <div className="inline-block bg-red-600 text-white text-xs font-mono font-bold px-2 py-0.5">
                  {activeVolcano.levelLabel}
                </div>
                <p className="text-xs text-neutral-200 leading-relaxed pt-1">
                  {activeVolcano.headline}
                </p>
                <div className="text-[0.6875rem] text-neutral-400 font-mono pt-1">
                  {activeVolcano.office} · {activeVolcano.lastUpdated}
                </div>
              </div>
            </div>
            {data.volcanoes.map((v) => (
              <div key={v.id} className="pb-1.5">
                <div className="bg-[#3E434F] px-2.5 py-0.5 text-[0.8125rem] font-bold text-white flex items-center justify-between gap-1.5">
                  <span className="min-w-0 truncate">{v.name.split(' ')[0]}</span>
                  <span className="text-xs font-mono text-yellow-300 font-bold whitespace-nowrap shrink-0">
                    Lv.{v.alertLevel}
                  </span>
                </div>
                <div className="px-2.5 pt-1 text-xs text-neutral-300">
                  {v.prefecture} · {v.levelLabel}
                </div>
              </div>
            ))}
          </>
        )}

        {/* ==================== TSUNAMI ==================== */}
        {effectiveScene === 'tsunami' && (() => {
          const hasActiveTsunami = Boolean(
            activeTsunamiForecast &&
              !activeTsunamiForecast.cancelled &&
              activeTsunamiForecast.areas.length > 0
          );
          const isEewLive = Boolean(activeEew && isEewStillActive(activeEew));

          const matchesSelectedEq =
            hasActiveTsunami &&
            selectedEarthquake &&
            ((activeTsunamiForecast?.hypocenterName &&
              selectedEarthquake.hypocenterName.includes(
                activeTsunamiForecast.hypocenterName
              )) ||
              doesEarthquakeMatchEew(selectedEarthquake, activeEew) ||
              selectedEarthquake.domesticTsunami.includes('津波'));

          const activeEq = hasActiveTsunami
            ? (matchesSelectedEq
                ? selectedEarthquake
                : data.earthquakes.find(
                    (eq) =>
                      (activeTsunamiForecast?.hypocenterName &&
                        eq.hypocenterName.includes(
                          activeTsunamiForecast.hypocenterName
                        )) ||
                      doesEarthquakeMatchEew(eq, activeEew) ||
                      eq.domesticTsunami.includes('津波')
                  ))
            : undefined;

          const occurrenceTimeStr =
            activeTsunamiForecast?.occurrenceTime ||
            activeEq?.occurrenceTime ||
            activeEew?.originTime ||
            activeTsunamiForecast?.issueTime;

          const hypocenterName =
            activeTsunamiForecast?.hypocenterName ||
            activeEq?.hypocenterName ||
            activeEew?.hypocenterName ||
            '震央未確定';

          const depthKm =
            activeTsunamiForecast?.depthKm ??
            activeEq?.depthKm ??
            activeEew?.depthKm ??
            10;

          const depthText = depthKm === 0 ? 'ごく浅い' : `${depthKm}km`;

          const magnitude =
            activeTsunamiForecast?.magnitude ??
            activeEq?.magnitude ??
            activeEew?.magnitude;

          const magText =
            typeof magnitude === 'number' && !Number.isNaN(magnitude) && magnitude >= 0
              ? `M${magnitude.toFixed(1)}`
              : '-';

          const maxScaleLabel =
            activeTsunamiForecast?.maxScaleLabel ||
            activeEq?.maxScaleLabel ||
            activeEew?.maxScaleLabel ||
            '-';

          const scaleBadgeStyle = getSeismicScaleBadgeStyle(maxScaleLabel);

          const highestGrade =
            hasActiveTsunami && activeTsunamiForecast
              ? activeTsunamiForecast.areas.reduce<
                  'MajorWarning' | 'Warning' | 'Watch' | 'Forecast' | 'Unknown'
                >((best, a) => {
                  const rank = {
                    MajorWarning: 4,
                    Warning: 3,
                    Watch: 2,
                    Forecast: 1,
                    Unknown: 0,
                  };
                  return rank[a.grade] > rank[best] ? a.grade : best;
                }, 'Unknown')
              : 'Unknown';

          const isMajorTsunami = highestGrade === 'MajorWarning';
          const isWarningTsunami = highestGrade === 'Warning';
          const tsunamiStripeClass = isMajorTsunami
            ? 'hazard-stripe-tsunami-major'
            : isWarningTsunami
              ? 'hazard-stripe-tsunami-warning'
              : '';

          return (
            <div
              data-testid="tsunami-panel-root"
              className={
                tsunamiStripeClass
                  ? `p-[0.1875rem] ${tsunamiStripeClass} ${
                      isMajorTsunami
                        ? 'shadow-[0_0_20px_rgba(168,85,247,0.5)]'
                        : 'shadow-[0_0_18px_rgba(255,255,255,0.35)]'
                    }`
                  : 'pb-2'
              }
            >
              <div className={tsunamiStripeClass ? 'bg-[#111318] pb-2' : ''}>
                {tsunamiStripeClass && (
                  <div className={`h-2.5 w-full ${tsunamiStripeClass}`} />
                )}
                <div
                  className={`px-2.5 py-1 text-[0.8125rem] font-black flex items-center justify-between gap-1.5 ${
                    isMajorTsunami
                      ? 'bg-purple-700 text-white border-y border-white/80'
                      : isWarningTsunami
                        ? 'bg-red-600 text-white border-y border-white/80'
                        : 'bg-amber-600 text-slate-950 font-bold'
                  }`}
                >
                  <span className="min-w-0 truncate">
                    {isMajorTsunami
                      ? '大津波警報 発表中'
                      : isWarningTsunami
                        ? '津波警報 発表中'
                        : '津波警報・注意報・予報'}
                  </span>
                  {hasActiveTsunami && activeTsunamiForecast && (
                    <span
                      className={`font-mono text-[0.6875rem] px-1.5 py-0.2 rounded-xs whitespace-nowrap shrink-0 ${
                        isMajorTsunami || isWarningTsunami
                          ? 'bg-white text-slate-950 font-black'
                          : 'bg-slate-950/60 text-white'
                      }`}
                    >
                      {activeTsunamiForecast.areas.length}沿岸発表中
                    </span>
                  )}
                </div>

                {hasActiveTsunami && activeTsunamiForecast ? (
                  <>
                    {/* Tsunami Headline right at the top (津波優先) */}
                    {activeTsunamiForecast.headline && (
                      <div className="px-2.5 pt-2">
                        <p
                          className={`text-xs leading-snug border-l-2 px-2 py-1 ${
                            isMajorTsunami
                              ? 'text-white bg-purple-950/55 border-white'
                              : isWarningTsunami
                                ? 'text-white bg-red-950/50 border-white'
                                : 'text-amber-100 bg-amber-950/40 border-amber-400'
                          }`}
                        >
                          {activeTsunamiForecast.headline}
                        </p>
                      </div>
                    )}

                    {/* Integrated EEW Card when EEW (P/S waves) is simultaneously active */}
                    {isEewLive && activeEew && (() => {
                      const isWarn = isEewWarning(activeEew);
                      const isSpecialWarn = isEewSpecialWarning(activeEew);
                      const isFinalReport = isEewFinal(activeEew);
                      const eewHasLpgm = hasActualEewLpgm(activeEew);
                      const showEewLpgm = eewHasLpgm && eewDisplayMode === 'lpgm';
                      const eewScaleStyle = getSeismicScaleStyle(activeEew.maxScaleCode);
                      const maxLpgmStyle = getLpgmClassStyle(activeEew.maxLpgmClass);
                      const rawScaleLabel = (activeEew.maxScaleLabel || '').trim();
                      const isUnknownScale =
                        !rawScaleLabel || rawScaleLabel === '不明' || rawScaleLabel === '解析中';
                      const hasOrMore = !isUnknownScale && rawScaleLabel.endsWith('以上');
                      const baseScaleLabel = hasOrMore
                        ? rawScaleLabel.slice(0, -2)
                        : rawScaleLabel;
                      const eewAreas = showEewLpgm
                        ? activeEew.areas.filter((a) => (a.lpgmClass ?? 0) >= 1)
                        : activeEew.areas;

                      return (
                        <div
                          data-testid="tsunami-integrated-eew-card"
                          className={`mx-2.5 mt-2 rounded-xs overflow-hidden border ${
                            isSpecialWarn
                              ? 'border-purple-400/90 bg-[#150A21]'
                              : isWarn
                                ? 'border-red-500/90 bg-[#1A0B0E]'
                                : 'border-amber-500/90 bg-[#1C1408]'
                          }`}
                        >
                          <div
                            className={`px-2 py-1 text-[0.65625rem] font-black text-white flex items-center justify-between gap-1 ${
                              isSpecialWarn
                                ? 'bg-purple-700'
                                : isWarn
                                  ? 'bg-red-600'
                                  : 'bg-amber-600'
                            }`}
                          >
                            <span className="flex items-center gap-1 min-w-0 truncate">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-ping shrink-0" />
                              <span className="truncate">
                                {isSpecialWarn
                                  ? '緊急地震速報(特別警報)'
                                  : isWarn
                                    ? '緊急地震速報(警報)'
                                    : '緊急地震速報(予報)'}
                              </span>
                            </span>
                            <span className="font-mono text-[0.59375rem] bg-black/35 px-1 py-0.2 rounded-xs whitespace-nowrap shrink-0">
                              P/S波·{isFinalReport ? '最終' : `第${activeEew.serial}報`}
                            </span>
                          </div>

                          <div className="p-2 space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="text-[0.8125rem] font-black text-white leading-snug truncate">
                                  {activeEew.hypocenterName || '震源調査中'}
                                </div>
                                <div className="text-[0.6875rem] font-mono text-neutral-300 flex flex-wrap items-baseline gap-x-1 mt-0.5">
                                  <span>
                                    {activeEew.magnitude > 0
                                      ? `M${activeEew.magnitude.toFixed(1)}`
                                      : 'M不明'}
                                  </span>
                                  <span className="text-neutral-500">/</span>
                                  <span>
                                    {activeEew.depthKm >= 0
                                      ? `深さ約${activeEew.depthKm}km`
                                      : '深さ不明'}
                                  </span>
                                </div>
                              </div>

                              {showEewLpgm ? (
                                <div
                                  className="shrink-0 flex flex-col items-center justify-center min-w-[3.375rem] h-[2.75rem] px-1 rounded-xs border"
                                  style={{
                                    backgroundColor: maxLpgmStyle.bg,
                                    color: maxLpgmStyle.text,
                                    borderColor: maxLpgmStyle.border,
                                  }}
                                >
                                  <span className="text-[0.5rem] font-bold leading-none opacity-90 whitespace-nowrap">
                                    最大予想階級
                                  </span>
                                  <div className="flex items-baseline gap-0.5 leading-none mt-0.5 whitespace-nowrap">
                                    <span className="text-[0.5625rem] font-bold">階級</span>
                                    <span className="text-[1.125rem] font-black font-mono">
                                      {activeEew.maxLpgmClass || '-'}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className={`shrink-0 flex flex-col items-center justify-center min-w-[3.375rem] h-[2.75rem] px-1 rounded-xs border ${eewScaleStyle.border} ${eewScaleStyle.bg} ${eewScaleStyle.text}`}
                                >
                                  <span className="text-[0.5rem] font-bold leading-none opacity-85 whitespace-nowrap">
                                    最大予測震度
                                  </span>
                                  {isUnknownScale ? (
                                    <span className="text-[0.6875rem] font-black leading-none mt-1 whitespace-nowrap">
                                      {rawScaleLabel || '不明'}
                                    </span>
                                  ) : (
                                    <div className="flex items-baseline justify-center gap-0.5 leading-none mt-0.5 whitespace-nowrap">
                                      <span className="text-[1.125rem] font-black leading-none tracking-tight">
                                        {baseScaleLabel}
                                      </span>
                                      {hasOrMore && (
                                        <span className="text-[0.5rem] font-extrabold leading-none">
                                          以上
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {eewHasLpgm && (
                              <div className="grid grid-cols-2 gap-1 p-0.5 bg-black/45 border border-neutral-700/80 rounded-xs">
                                <button
                                  type="button"
                                  onClick={() => onChangeEewDisplayMode?.('intensity')}
                                  className={`py-0.5 px-1 text-[0.59375rem] font-bold rounded-xs transition-colors cursor-pointer text-center truncate ${
                                    !showEewLpgm
                                      ? isSpecialWarn
                                        ? 'bg-purple-600 text-white font-black'
                                        : 'bg-red-600 text-white font-black'
                                      : 'text-neutral-400 hover:text-white'
                                  }`}
                                >
                                  震度予測
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onChangeEewDisplayMode?.('lpgm')}
                                  className={`py-0.5 px-1 text-[0.59375rem] font-bold rounded-xs transition-colors cursor-pointer text-center truncate ${
                                    showEewLpgm
                                      ? 'bg-amber-600 text-white font-black'
                                      : 'text-neutral-400 hover:text-white'
                                  }`}
                                >
                                  長周期 (階級)
                                </button>
                              </div>
                            )}

                            {eewAreas.length > 0 && (
                              <div className="max-h-24 overflow-y-auto space-y-0.5 pr-0.5 border-t border-neutral-800/80 pt-1">
                                {eewAreas.slice(0, 6).map((area) => {
                                  const scaleRange = formatEewScaleRange(
                                    area.scaleFrom,
                                    area.scaleTo
                                  );
                                  const lpgmStyle = getLpgmClassStyle(area.lpgmClass);
                                  return (
                                    <div
                                      key={`${area.pref}-${area.name}`}
                                      className="flex items-center justify-between gap-1 text-[0.6875rem] bg-black/30 px-1.5 py-0.5 rounded-xs"
                                    >
                                      <span className="font-bold text-neutral-100 truncate">
                                        {area.name}
                                      </span>
                                      {showEewLpgm ? (
                                        <span
                                          className="px-1 py-0.2 font-mono font-black rounded-xs text-[0.625rem] shrink-0 whitespace-nowrap"
                                          style={{
                                            backgroundColor: lpgmStyle.bg,
                                            color: lpgmStyle.text,
                                          }}
                                        >
                                          {lpgmStyle.label}
                                        </span>
                                      ) : (
                                        <span
                                          className={`px-1 py-0.2 font-mono font-black rounded-xs text-[0.625rem] shrink-0 whitespace-nowrap ${
                                            area.scaleTo >= 50 || area.scaleFrom >= 50
                                              ? 'bg-red-600 text-white'
                                              : 'bg-white text-slate-950'
                                          }`}
                                        >
                                          {scaleRange}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {activeEq && (
                              <div className="text-[0.625rem] font-mono text-neutral-300 border-t border-neutral-800/80 pt-1 flex items-center justify-between gap-1">
                                <span className="truncate">
                                  観測震度 {activeEq.maxScaleLabel}（{activeEq.hypocenterName}）
                                </span>
                                <span
                                  className={`font-bold shrink-0 ${
                                    activeEq.isConfirmed !== false
                                      ? 'text-emerald-300'
                                      : 'text-amber-300'
                                  }`}
                                >
                                  {activeEq.isConfirmed !== false ? '確定済' : '続報待機'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* JMA Official Style Earthquake Card (when EEW is not currently active) */}
                    {!isEewLive && (
                      <div className="mx-2.5 mt-2 bg-neutral-900 border border-neutral-700/80 rounded-xs overflow-hidden shadow-md">
                        <div className="bg-neutral-800/95 px-2.5 py-1 flex items-center justify-between gap-1.5 border-b border-neutral-700/60">
                          <span className="text-[0.6875rem] font-mono font-bold text-neutral-300 whitespace-nowrap">
                            震源・地震情報
                          </span>
                          {activeTsunamiForecast.source === 'demo' && (
                            <span className="bg-purple-600 text-white px-1.5 py-0.2 rounded-xs font-bold text-[0.625rem] whitespace-nowrap shrink-0">
                              デモデータ
                            </span>
                          )}
                        </div>
                        <div className="p-2 space-y-2">
                          <div>
                            <div className="text-[0.625rem] text-neutral-400 font-mono">地震の発生日時</div>
                            <div className="text-[0.8125rem] font-bold text-white tracking-wide whitespace-nowrap">
                              {formatOccurrenceTimeJa(occurrenceTimeStr)}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5 text-xs">
                            <div className="bg-neutral-950/70 p-1.5 rounded-xs border border-neutral-800 min-w-0">
                              <div className="text-[0.625rem] text-neutral-400 font-mono">震央地名</div>
                              <div className="font-bold text-neutral-100 truncate text-[0.75rem]" title={hypocenterName}>
                                {hypocenterName}
                              </div>
                            </div>
                            <div className="bg-neutral-950/70 p-1.5 rounded-xs border border-neutral-800 min-w-0">
                              <div className="text-[0.625rem] text-neutral-400 font-mono">最大震度</div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span
                                  className="px-1.5 py-0.2 rounded-xs font-black text-xs whitespace-nowrap"
                                  style={{
                                    backgroundColor: scaleBadgeStyle.bg,
                                    color: scaleBadgeStyle.text,
                                  }}
                                >
                                  {maxScaleLabel !== '-' ? maxScaleLabel : '不明'}
                                </span>
                              </div>
                            </div>
                            <div className="bg-neutral-950/70 p-1.5 rounded-xs border border-neutral-800 min-w-0">
                              <div className="text-[0.625rem] text-neutral-400 font-mono">深さ</div>
                              <div className="font-bold font-mono text-neutral-100 text-[0.75rem] whitespace-nowrap">
                                {depthText}
                              </div>
                            </div>
                            <div className="bg-neutral-950/70 p-1.5 rounded-xs border border-neutral-800 min-w-0">
                              <div className="text-[0.625rem] text-neutral-400 font-mono">規模</div>
                              <div className="font-bold font-mono text-white text-[0.75rem] whitespace-nowrap">
                                {magText}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="px-2.5 pt-2 space-y-2">
                      <div className="flex items-center justify-between text-[0.6875rem] font-mono text-neutral-300">
                        <span className="whitespace-nowrap">
                          発表: {formatCompactDateTime(activeTsunamiForecast.issueTime) || '随時'}
                        </span>
                      </div>

                      {/* Group areas by grade: MajorWarning -> Warning -> Watch -> Forecast */}
                      {(['MajorWarning', 'Warning', 'Watch', 'Forecast'] as const).map(
                        (targetGrade) => {
                          const matchedAreas = activeTsunamiForecast.areas.filter(
                            (a) => a.grade === targetGrade
                          );
                          if (matchedAreas.length === 0) return null;
                          const style = getTsunamiGradeStyle(targetGrade);
                          return (
                            <div
                              key={targetGrade}
                              className="border border-neutral-700 bg-neutral-900/60 rounded-xs overflow-hidden"
                            >
                              <div
                                className="px-2 py-0.5 text-xs font-bold flex items-center justify-between gap-1.5"
                                style={{
                                  backgroundColor: style.hex,
                                  color: style.textHex,
                                }}
                              >
                                <span className="truncate">{style.label}</span>
                                <span className="font-mono text-[0.6875rem] whitespace-nowrap shrink-0">
                                  {matchedAreas.length}沿岸
                                </span>
                              </div>
                              <div className="p-1.5 space-y-1">
                                {matchedAreas.map((area) => (
                                  <div
                                    key={area.code || area.name}
                                    className="px-1 py-0.5 border-b border-neutral-800/80 last:border-none"
                                  >
                                    <div className="flex items-baseline justify-between gap-1.5 text-xs">
                                      <span className="font-bold text-white min-w-0 truncate">
                                        {area.name}
                                      </span>
                                      <span className="text-amber-300 font-mono font-bold text-[0.6875rem] whitespace-nowrap shrink-0">
                                        {area.maxHeightText}
                                      </span>
                                    </div>
                                    {area.firstHeightText && (
                                      <div className="text-[0.625rem] font-mono text-neutral-400 text-right whitespace-nowrap">
                                        {area.firstHeightText}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </>
                ) : (
                  <div className="px-2.5 py-3 text-xs text-neutral-300 space-y-2">
                    <div
                      data-testid="tsunami-none-message"
                      className="p-2.5 bg-neutral-900/80 border border-neutral-700 text-neutral-200 font-medium"
                    >
                      現在、津波警報・注意報・予報は発表されていません。
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ==================== EARTHQUAKE ==================== */}
        {effectiveScene === 'earthquake' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Fixed Header: Red bar + status + hypocenter info + Big Max Scale Badge */}
            <div className="shrink-0 bg-[#111318] border-b border-[#2B303C] z-10">
              {/* EEW (緊急地震速報 警報・特別警報・予報) Live Banner (NERV / Broadcast Style) */}
              {activeEew && isEewStillActive(activeEew) && (() => {
                const isWarn = activeEew.isWarning !== false;
                const isSpecialWarn =
                  isWarn &&
                  (activeEew.maxScaleCode >= 55 || (activeEew.maxLpgmClass ?? 0) >= 4);
                const isFinalReport = Boolean(activeEew.isFinal) || activeEew.serial >= 5;
                const eewHasLpgm = hasActualEewLpgm(activeEew);
                const showEewLpgm = eewHasLpgm && eewDisplayMode === 'lpgm';
                const displayAreas = showEewLpgm
                  ? activeEew.areas.filter((a) => (a.lpgmClass ?? 0) >= 1)
                  : activeEew.areas;

                const rawScaleLabel = (activeEew.maxScaleLabel || '').trim();
                const isUnknownScale =
                  !rawScaleLabel || rawScaleLabel === '不明' || rawScaleLabel === '解析中';
                const hasOrMore = !isUnknownScale && rawScaleLabel.endsWith('以上');
                const baseScaleLabel = hasOrMore
                  ? rawScaleLabel.slice(0, -2)
                  : rawScaleLabel;
                const eewScaleStyle = getSeismicScaleStyle(activeEew.maxScaleCode);
                const maxLpgmStyle = getLpgmClassStyle(activeEew.maxLpgmClass);

                const stripeClass = isSpecialWarn
                  ? 'hazard-stripe-eew-special'
                  : isWarn
                    ? 'hazard-stripe-eew-warning'
                    : '';

                return (
                  <div
                    data-testid="eew-live-banner"
                    className={`mb-2 rounded-xs shadow-lg ${
                      isSpecialWarn
                        ? `p-[0.125rem] ${stripeClass} shadow-[0_0_16px_rgba(147,51,234,0.45)]`
                        : isWarn
                          ? `p-[0.125rem] ${stripeClass} shadow-[0_0_14px_rgba(220,38,38,0.4)]`
                          : 'border-2 border-amber-500 bg-[#1C1408] shadow-amber-950/60 pb-2'
                    }`}
                  >
                    <div
                      className={
                        stripeClass
                          ? `pb-2 ${isSpecialWarn ? 'bg-[#150A21]' : 'bg-[#1A0B0E]'}`
                          : ''
                      }
                    >
                      {stripeClass && <div className={`h-2 w-full ${stripeClass}`} />}
                      <div
                        className={`px-2.5 py-1 text-[0.78125rem] font-black text-white flex items-center justify-between gap-1.5 tracking-wide ${
                          isSpecialWarn
                            ? 'bg-purple-700'
                            : isWarn
                              ? 'bg-red-600'
                              : 'bg-amber-600'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="inline-block w-2 h-2 rounded-full bg-white animate-ping shrink-0" />
                          <span className="truncate">
                            {isSpecialWarn
                              ? '緊急地震速報 (特別警報)'
                              : isWarn
                                ? '緊急地震速報 (警報)'
                                : '緊急地震速報 (予報)'}
                          </span>
                        </span>
                        <span className="font-mono text-[0.6875rem] text-neutral-100 whitespace-nowrap shrink-0">
                          {isFinalReport ? '最終報' : `第${activeEew.serial}報`}
                        </span>
                      </div>

                      <div className="px-2.5 pt-2 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-[0.9375rem] font-black text-white leading-snug tracking-tight break-words">
                              {activeEew.hypocenterName || '震源調査中'}
                            </div>
                            <div className="text-[0.6875rem] font-mono text-neutral-300 flex flex-wrap items-baseline gap-x-1 mt-0.5">
                              <span className="whitespace-nowrap">
                                {activeEew.magnitude > 0
                                  ? `M${activeEew.magnitude.toFixed(1)}`
                                  : 'M不明'}
                              </span>
                              <span className="text-neutral-500">/</span>
                              <span className="whitespace-nowrap">
                                {activeEew.depthKm >= 0
                                  ? `深さ約${activeEew.depthKm}km`
                                  : '深さ不明'}
                              </span>
                            </div>
                          </div>

                          {showEewLpgm ? (
                            <div
                              className="shrink-0 flex flex-col items-center justify-center min-w-[3.75rem] h-[3.25rem] px-1.5 rounded-xs shadow-md border"
                              style={{
                                backgroundColor: maxLpgmStyle.bg,
                                color: maxLpgmStyle.text,
                                borderColor: maxLpgmStyle.border,
                              }}
                            >
                              <span className="text-[0.5625rem] font-bold leading-none tracking-tighter opacity-90 whitespace-nowrap">
                                最大予想階級
                              </span>
                              <div className="flex items-baseline justify-center gap-0.5 leading-none mt-1 whitespace-nowrap">
                                <span className="text-[0.625rem] font-bold leading-none">階級</span>
                                <span className="text-[1.375rem] font-black leading-none font-mono">
                                  {activeEew.maxLpgmClass || '-'}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div
                              className={`shrink-0 flex flex-col items-center justify-center min-w-[3.75rem] h-[3.25rem] px-1.5 rounded-xs shadow-md border ${eewScaleStyle.border} ${eewScaleStyle.bg} ${eewScaleStyle.text}`}
                            >
                              <span className="text-[0.5625rem] font-bold leading-none tracking-tighter opacity-85 whitespace-nowrap">
                                最大予測震度
                              </span>
                              {isUnknownScale ? (
                                <span className="text-xs font-black leading-none mt-1 whitespace-nowrap">
                                  {rawScaleLabel || '不明'}
                                </span>
                              ) : (
                                <div className="flex items-baseline justify-center gap-0.5 leading-none mt-1 whitespace-nowrap">
                                  <span className="text-[1.375rem] font-black leading-none tracking-tight">
                                    {baseScaleLabel}
                                  </span>
                                  {hasOrMore && (
                                    <span className="text-[0.5625rem] font-extrabold leading-none opacity-95">
                                      以上
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Mode Switcher Pills: 長周期地震動が実際に予測されているときのみ表示 */}
                        {eewHasLpgm && (
                          <div className="grid grid-cols-2 gap-1 p-0.5 bg-black/50 border border-neutral-700/80 rounded-xs">
                            <button
                              type="button"
                              onClick={() => onChangeEewDisplayMode?.('intensity')}
                              className={`py-0.5 px-1 text-[0.59375rem] font-bold rounded-xs transition-colors cursor-pointer text-center min-w-0 truncate ${
                                !showEewLpgm
                                  ? isSpecialWarn
                                    ? 'bg-purple-600 text-white font-black shadow-xs'
                                    : 'bg-red-600 text-white font-black shadow-xs'
                                  : 'text-neutral-400 hover:text-white'
                              }`}
                            >
                              震度予測 (1-7)
                            </button>
                            <button
                              type="button"
                              onClick={() => onChangeEewDisplayMode?.('lpgm')}
                              className={`py-0.5 px-1 text-[0.59375rem] font-bold rounded-xs transition-colors cursor-pointer text-center min-w-0 truncate ${
                                showEewLpgm
                                  ? 'bg-amber-600 text-white font-black shadow-xs'
                                  : 'text-neutral-400 hover:text-white'
                              }`}
                            >
                              長周期 (階級1-4)
                            </button>
                          </div>
                        )}

                        <div
                          className={`text-[0.65625rem] font-mono text-neutral-400 flex items-center justify-between gap-1.5 border-t pt-1 ${
                            isSpecialWarn
                              ? 'border-purple-900/60'
                              : isWarn
                                ? 'border-red-900/50'
                                : 'border-amber-900/50'
                          }`}
                        >
                          <span className="whitespace-nowrap">
                            発生: {formatCompactDateTime(activeEew.originTime)}
                          </span>
                          <span className="flex items-center gap-1 text-[0.625rem] text-amber-300 whitespace-nowrap shrink-0">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping shrink-0" />
                            自動切替中
                          </span>
                        </div>

                        {/* Warning / Affected Areas */}
                        {displayAreas.length > 0 && (
                          <div className="space-y-1 pt-1">
                            <div
                              className={`text-[0.6875rem] font-bold flex items-center justify-between gap-1.5 ${
                                isSpecialWarn ? 'text-purple-300' : 'text-red-300'
                              }`}
                            >
                              <span className="truncate">
                                {showEewLpgm
                                  ? '長周期地震動 予想地域（階級1〜4）'
                                  : '強い揺れの予想地域'}
                              </span>
                              <span className="font-mono text-[0.625rem] text-neutral-400 whitespace-nowrap shrink-0">
                                {displayAreas.length}地域
                              </span>
                            </div>
                            <div className="max-h-52 overflow-y-auto space-y-1 pr-0.5">
                              {displayAreas.map((area) => {
                                const scaleRange = formatEewScaleRange(
                                  area.scaleFrom,
                                  area.scaleTo
                                );
                                const lpgmStyle = getLpgmClassStyle(area.lpgmClass);

                                return (
                                  <div
                                    key={`${area.pref}-${area.name}`}
                                    className="bg-[#121620] border border-neutral-800 px-2 py-1 rounded-xs flex items-center justify-between gap-1.5 text-xs"
                                  >
                                    <div className="font-bold text-white min-w-0 flex-1 truncate">
                                      <span className="text-[0.625rem] text-neutral-400 mr-1 font-normal">
                                        {area.pref}
                                      </span>
                                      <span>{area.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1 font-mono shrink-0">
                                      {showEewLpgm ? (
                                        <span
                                          className="px-1.5 py-0.2 font-black rounded-xs text-[0.6875rem] whitespace-nowrap shrink-0"
                                          style={{
                                            backgroundColor: lpgmStyle.bg,
                                            color: lpgmStyle.text,
                                          }}
                                        >
                                          {lpgmStyle.label}
                                        </span>
                                      ) : (
                                        <span
                                          className={`px-1.5 py-0.2 font-black rounded-xs text-[0.6875rem] whitespace-nowrap shrink-0 ${
                                            area.scaleTo >= 50 || area.scaleFrom >= 50
                                              ? 'bg-red-600 text-white'
                                              : 'bg-yellow-400 text-slate-950'
                                          }`}
                                        >
                                          {scaleRange}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Red Header Bar (EEW対象と無関係な1つ前の地震は表示せず待機表示にする) */}
              {(() => {
                const eewActive = Boolean(activeEew && isEewStillActive(activeEew));
                const matchesActiveEew =
                  !eewActive || doesEarthquakeMatchEew(selectedEarthquake, activeEew);
                if (!matchesActiveEew) {
                  return (
                    <>
                      <div className="bg-red-700 px-2.5 py-1 text-[0.8125rem] font-bold text-white flex items-center justify-between">
                        <span className="truncate">地震情報（観測データ待機中）</span>
                      </div>
                      <div
                        data-testid="earthquake-awaiting-confirm-badge"
                        className="bg-amber-950/80 border-b border-amber-500/70 px-2.5 py-1 text-[0.65625rem] font-bold text-amber-200 flex items-center justify-between gap-1.5"
                      >
                        <span className="flex items-center gap-1.5 min-w-0 truncate">
                          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
                          <span className="truncate">震源・震度確定まで固定中</span>
                        </span>
                        <span className="font-mono text-[0.625rem] text-amber-300 whitespace-nowrap shrink-0">
                          自動取得中
                        </span>
                      </div>
                      <div className="px-2.5 py-3 text-xs text-neutral-300 leading-relaxed">
                        今回の緊急地震速報（{activeEew?.hypocenterName || '震源調査中'}）に対する気象庁の震度速報・観測点情報の入電を待機しています。
                      </div>
                    </>
                  );
                }
                return (
                  <>
                    <div className="bg-red-700 px-2.5 py-1 text-[0.8125rem] font-bold text-white flex items-center justify-between">
                      <span className="truncate">
                        {selectedEarthquake.issueTypeLabel || '各地の震度に関する情報'}
                      </span>
                    </div>

                    {/* Confirmation / Lock Status Bar */}
                    {selectedEarthquake.isConfirmed === false || eewActive ? (
                      <div
                        data-testid="earthquake-awaiting-confirm-badge"
                        className="bg-amber-950/80 border-b border-amber-500/70 px-2.5 py-1 text-[0.65625rem] font-bold text-amber-200 flex items-center justify-between gap-1.5"
                      >
                        <span className="flex items-center gap-1.5 min-w-0 truncate">
                          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
                          <span className="truncate">震源・震度確定まで固定中</span>
                        </span>
                        <span className="font-mono text-[0.625rem] text-amber-300 whitespace-nowrap shrink-0">
                          自動取得中
                        </span>
                      </div>
                    ) : interruptKind === 'earthquake' ? (
                      <div
                        data-testid="earthquake-confirmed-badge"
                        className="bg-emerald-950/70 border-b border-emerald-500/60 px-2.5 py-1 text-[0.6875rem] font-bold text-emerald-200 flex items-center justify-between gap-1.5"
                      >
                        <span className="min-w-0 truncate">✓ 震源・各地の震度 確定</span>
                        <button
                          type="button"
                          onClick={onDismissInterrupt}
                          className="font-mono text-[0.625rem] bg-emerald-800/80 hover:bg-emerald-700 text-white px-1.5 py-0.5 rounded-xs cursor-pointer whitespace-nowrap shrink-0"
                        >
                          巡回再開
                        </button>
                      </div>
                    ) : isLoopPaused ? (
                      <div
                        data-testid="earthquake-manual-pinned-badge"
                        className="bg-neutral-800/90 border-b border-amber-500/50 px-2.5 py-1 text-[0.6875rem] font-bold text-amber-200 flex items-center justify-between gap-1.5"
                      >
                        <span className="flex items-center gap-1.5 min-w-0 truncate">
                          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                          <span className="truncate">手動選択中（巡回停止）</span>
                        </span>
                        <button
                          type="button"
                          onClick={onDismissInterrupt}
                          className="font-mono text-[0.625rem] bg-amber-700/90 hover:bg-amber-600 text-white px-2 py-0.5 rounded-xs cursor-pointer transition-colors shadow-xs whitespace-nowrap shrink-0"
                          title="自動巡回を再開して最新の地震に戻す"
                        >
                          巡回再開 ▶
                        </button>
                      </div>
                    ) : null}

                    {/* Hypocenter Info + Big Max Scale Badge on Right (identical to left sidebar style) */}
                    {(() => {
                      const scaleStyle = getSeismicScaleStyle(selectedEarthquake.maxScaleCode);
                      return (
                        <div className="px-2.5 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="text-[0.9375rem] font-extrabold text-white leading-snug break-words">
                                {selectedEarthquake.hypocenterName ||
                                  (selectedEarthquake.hypocenterUnknown ? '震源精査中' : '震源情報')}
                              </div>
                              <div className="text-xs font-mono text-neutral-200 flex flex-wrap items-baseline gap-x-1">
                                {selectedEarthquake.hypocenterUnknown ? (
                                  <span className="whitespace-nowrap">震源・規模 調査中</span>
                                ) : (
                                  <>
                                    <span className="whitespace-nowrap">
                                      M{selectedEarthquake.magnitude.toFixed(1)}
                                    </span>
                                    <span className="text-neutral-500">/</span>
                                    <span className="whitespace-nowrap">
                                      深さ約{selectedEarthquake.depthKm}km
                                    </span>
                                  </>
                                )}
                              </div>
                              <div className="text-[0.65625rem] font-mono text-neutral-400 whitespace-nowrap min-w-0 truncate">
                                {formatCompactDateTime(selectedEarthquake.occurrenceTime)}
                              </div>
                              <div className="text-xs text-cyan-300 font-bold pt-0.5">
                                {selectedEarthquake.domesticTsunami}
                              </div>
                            </div>

                            {/* Big Max Intensity Box on Right (identical to left sidebar) */}
                            {selectedEarthquake.maxScaleCode >= 10 && (
                              <div
                                className={`shrink-0 flex flex-col items-center justify-center w-[3.375rem] h-[3rem] rounded-xs shadow-md border border-black/30 ${scaleStyle.bg} ${scaleStyle.text}`}
                              >
                                <span className="text-[0.5625rem] font-bold leading-none tracking-tighter opacity-80 whitespace-nowrap">
                                  最大震度
                                </span>
                                <span className="text-[1.4375rem] font-black leading-none mt-0.5 whitespace-nowrap">
                                  {selectedEarthquake.maxScaleLabel}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </>
                );
              })()}
            </div>

            {/* Scrollable stations container: auto-scrolls down while header stays fixed above */}
            {(!activeEew ||
              !isEewStillActive(activeEew) ||
              doesEarthquakeMatchEew(selectedEarthquake, activeEew)) && (
            <div
              ref={scrollContainerRef}
              data-testid="earthquake-stations-scroll-container"
              className="flex-1 overflow-y-auto min-h-0 divide-y divide-[#2B303A]"
            >
              {groupedEarthquakeStations.map((grp, idx) => {
                const style = getSeismicScaleStyle(grp.scaleCode);
                const extraCount = grp.totalCount - grp.names.length;
                return (
                  <div
                    key={`${grp.prefecture}-${grp.scaleCode}-${idx}`}
                    className="pb-1.5"
                  >
                    <div className="bg-[#3E434F] px-2.5 py-0.5 text-[0.8125rem] font-bold text-white flex items-center justify-between gap-1.5">
                      <span className="min-w-0 truncate">{grp.prefecture}</span>
                      <span
                        className="px-1.5 text-xs font-mono font-extrabold rounded-sm whitespace-nowrap shrink-0"
                        style={{
                          backgroundColor: style.hex,
                          color: style.badgeText,
                        }}
                      >
                        震度{grp.scaleLabel}
                      </span>
                    </div>
                    <div className="px-2.5 pt-1 text-xs text-neutral-200 leading-relaxed flex flex-wrap items-baseline">
                      {grp.names.map((name, nIdx) => (
                        <span key={name} className="inline-block whitespace-nowrap">
                          {name}
                          {nIdx < grp.names.length - 1 ? '・' : ''}
                        </span>
                      ))}
                      {extraCount > 0 && (
                        <span className="inline-block whitespace-nowrap text-neutral-400 ml-1">
                          {`ほか${extraCount}地点`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Compact Legend Box */}
      <div className="bg-[#111318]/95 border border-[#686E7A] px-2.5 py-1.5 shrink-0">
        {effectiveScene === 'warnings' ? (
          <div className="flex items-center justify-between text-[0.6875rem] font-bold text-white whitespace-nowrap">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-purple-600 border border-purple-300" />
              特別警報
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-500" />
              危険警報
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600" />
              警報
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400" />
              注意報
            </span>
          </div>
        ) : effectiveScene === 'typhoon' ? (
          <div className="flex items-center justify-between text-[0.6875rem] font-bold text-white whitespace-nowrap">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-sky-400" />
              過去軌跡
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600" />
              暴風域
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400" />
              強風域
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full border border-dashed border-white" />
              予報円
            </span>
          </div>
        ) : effectiveScene === 'radar' ? (
          <div className="flex items-center justify-between text-[0.625rem] font-mono text-neutral-200 whitespace-nowrap">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 bg-sky-300 inline-block" />1
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 bg-blue-500 inline-block" />5
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 bg-amber-400 inline-block" />
              20
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 inline-block" />
              50
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 bg-purple-600 inline-block" />
              80+
            </span>
            <span className="text-yellow-300 font-bold">●雷検知</span>
          </div>
        ) : effectiveScene === 'amedas' ? (
          amedasMetric === 'precip' ? (
            <div className="flex items-center justify-between text-[0.625rem] font-mono font-bold text-white whitespace-nowrap">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#38BDF8] inline-block" />
                1mm
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB] inline-block" />
                5mm
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FACC15] inline-block" />
                10mm
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444] inline-block" />
                30mm
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#9333EA] inline-block" />
                50+
              </span>
            </div>
          ) : amedasMetric === 'wind' ? (
            <div className="flex items-center justify-between text-[0.625rem] font-mono font-bold text-white whitespace-nowrap">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#64748B] inline-block" />
                &lt;5m/s
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E] inline-block" />
                5+
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FACC15] inline-block" />
                10+
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F97316] inline-block" />
                15+
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444] inline-block" />
                20+
              </span>
            </div>
          ) : amedasMetric === 'snow' ? (
            <div className="flex items-center justify-between text-[0.625rem] font-mono font-bold text-white whitespace-nowrap">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F8FAFC] inline-block" />
                1cm+
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#BAE6FD] inline-block" />
                5cm+
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#38BDF8] inline-block" />
                20cm+
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB] inline-block" />
                100cm+
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between text-[0.625rem] font-mono font-bold text-white whitespace-nowrap">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#93C5FD] inline-block" />
                0℃
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E0F2FE] inline-block" />
                8℃
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FEF08A] inline-block" />
                14℃
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FACC15] inline-block" />
                20℃
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F97316] inline-block" />
                26℃+
              </span>
            </div>
          )
        ) : effectiveScene === 'earthquake' ? (
          <div className="flex items-center justify-between text-[0.625rem] font-mono font-bold text-white whitespace-nowrap">
            <span className="text-neutral-300">震度</span>
            <span className="px-1 bg-[#64748B] text-white rounded-xs">1</span>
            <span className="px-1 bg-[#38BDF8] text-slate-950 rounded-xs">2</span>
            <span className="px-1 bg-[#22C55E] text-slate-950 rounded-xs">3</span>
            <span className="px-1 bg-[#FACC15] text-slate-950 rounded-xs">4</span>
            <span className="px-1 bg-[#F97316] text-white rounded-xs">5</span>
            <span className="px-1 bg-[#EF4444] text-white rounded-xs">6</span>
            <span className="px-1 bg-[#9333EA] text-white rounded-xs">7</span>
          </div>
        ) : effectiveScene === 'tsunami' ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[0.6875rem] font-bold text-white whitespace-nowrap">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#C026D3] inline-block" />
                大津波
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444] inline-block" />
                津波警報
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FACC15] inline-block" />
                注意報
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#38BDF8] inline-block" />
                予報
              </span>
            </div>
            {activeEew && isEewStillActive(activeEew) && (
              <div className="flex items-center justify-between text-[0.625rem] font-bold text-neutral-200 border-t border-neutral-800 pt-1 whitespace-nowrap">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full border border-dashed border-[#38BDF8] inline-block" />
                  P波(初期微動)
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full border border-[#EF4444] bg-[#EF4444]/30 inline-block" />
                  S波(主要動)
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 text-[0.6875rem] font-mono text-neutral-300 whitespace-nowrap">
            <span>気象庁防災情報XML</span>
            <span className="shrink-0">更新 {data.lastXmlFetchTime}</span>
          </div>
        )}
      </div>
    </aside>
  );
});
