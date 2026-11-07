import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AmedasMetric,
  AmedasStationData,
  EarthquakeReport,
  EewReport,
  InterruptKind,
  MapViewportState,
  MonitorDataBundle,
  RegionConfig,
  RegionalWarningItem,
  SceneId,
  TsunamiForecastArea,
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
} from '../utils/jmaParser';
import {
  formatEewArrivalLabel,
  formatEewScaleRange,
  formatOccurrenceTimeJa,
  getSeismicScaleBadgeStyle,
  getTsunamiGradeStyle,
  isEewStillActive,
} from '../utils/eewTsunami';

interface SceneDetailPanelProps {
  activeScene: SceneId;
  activeRegionConfig: RegionConfig;
  activeWarningDivision?: RegionalWarningItem | null;
  isFinalWarningNational?: boolean;
  mapViewport?: MapViewportState;
  data: MonitorDataBundle;
  selectedEarthquake: EarthquakeReport;
  selectedTyphoon: TyphoonReport;
  onSelectTyphoon: (tc: TyphoonReport) => void;
  activeVolcano: VolcanoStatusItem;
  activeTsunamiStation?: TsunamiStationItem;
  activeEew?: EewReport | null;
  activeTsunamiForecast?: TsunamiForecastReport | null;
  isTsunamiDemo?: boolean;
  onToggleTsunamiDemo?: () => void;
  amedasMetric: AmedasMetric;
  onChangeAmedasMetric: (metric: AmedasMetric) => void;
  onSelectEarthquake: (eq: EarthquakeReport) => void;
  interruptKind: InterruptKind;
  onDismissInterrupt: () => void;
  isLoopPaused: boolean;
  loopIntervalSec: number;
  onSceneComplete: () => void;
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
  onSelectTyphoon,
  activeVolcano,
  activeTsunamiStation = null,
  activeEew = null,
  activeTsunamiForecast = null,
  isTsunamiDemo = false,
  onToggleTsunamiDemo,
  amedasMetric,
  onChangeAmedasMetric,
  onSelectEarthquake,
  interruptKind,
  onDismissInterrupt,
  isLoopPaused,
  loopIntervalSec,
  onSceneComplete,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const onSceneCompleteRef = useRef<() => void>(onSceneComplete);
  const [eewAnimNow, setEewAnimNow] = useState<number>(Date.now());

  const amedasRankings = useMemo(
    () => computeAmedasTop5Rankings(data.amedas),
    [data.amedas]
  );

  const radarRainStations = useMemo(
    () =>
      data.amedas
        .filter((a) => a.precip1h > 0 || a.windSpeed >= 12)
        .slice(0, 18),
    [data.amedas]
  );

  const groupedEarthquakeStations = useMemo(() => {
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
  }, [selectedEarthquake]);

  useEffect(() => {
    onSceneCompleteRef.current = onSceneComplete;
  }, [onSceneComplete]);

  // Keep EEW arrival countdown timer active every second
  useEffect(() => {
    if (!activeEew || !isEewStillActive(activeEew)) return;
    const timer = setInterval(() => {
      setEewAnimNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [activeEew]);

  const effectiveScene: SceneId =
    interruptKind === 'earthquake' || interruptKind === 'eew'
      ? 'earthquake'
      : interruptKind === 'volcano'
        ? 'volcano'
        : interruptKind === 'tsunami'
          ? 'tsunami'
          : interruptKind === 'typhoon'
            ? 'typhoon'
            : activeScene;

  // Determine whether the map is zoomed into a specific region (either via regional patrol/selection or manual map zoom >= 6)
  const isZoomedIn =
    (activeRegionConfig.id !== 'national' &&
      activeRegionConfig.id !== 'world') ||
    (mapViewport ? mapViewport.zoom >= 6 : false);

  const syncedRegionId =
    activeRegionConfig.id !== 'national' && activeRegionConfig.id !== 'world'
      ? activeRegionConfig.id
      : mapViewport && mapViewport.zoom >= 6
        ? mapViewport.inferredRegionId
        : 'national';

  const isPointInViewport = (lat: number, lon: number): boolean => {
    if (!mapViewport || mapViewport.zoom < 6) return true;
    const b = mapViewport.bounds;
    return (
      lat >= b.south - 0.6 &&
      lat <= b.north + 0.6 &&
      lon >= b.west - 0.6 &&
      lon <= b.east + 0.6
    );
  };

  // Right panel always groups warnings by the 57 JMA divisions:
  // 「宗谷」「網走・北見・紋別」「上川・留萌」「石狩・空知・後志」「釧路・根室」「胆振・日高」「渡島・檜山」
  // 「各都府県」「鹿児島県（奄美地方除く）」「奄美地方」「沖縄本島地方」「大東島地方」「宮古島地方」「八重山地方」
  const displayWarnings = data.warnings;

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
    selectedTyphoon.id,
    selectedEarthquake.id,
  ]);

  // Auto-scroll right-side information list and transition to next scene when scroll finishes
  // ('radar' and 'amedas' scene transitions are controlled by MonitorMap)
  useEffect(() => {
    if (effectiveScene === 'radar' || effectiveScene === 'amedas') return;
    if (isLoopPaused || interruptKind !== 'none') return;

    const el = scrollContainerRef.current;
    if (!el) return;

    let scrollIntervalId: ReturnType<typeof setInterval> | null = null;
    let scrollRaf = 0;
    let startDelayTimer: ReturnType<typeof setTimeout> | null = null;
    let endHoldTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    // Special handling for warnings scene when zoomed into an active 警報/特別警報 division
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
      fallbackTimer = setTimeout(() => {
        if (!cancelled) {
          onSceneCompleteRef.current();
        }
      }, 4200);

      return () => {
        cancelled = true;
        if (fallbackTimer) clearTimeout(fallbackTimer);
      };
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

    const minSceneDurationMs = Math.max(10000, loopIntervalSec * 1000);
    const sceneStartTime = performance.now();
    const maxScroll = el.scrollHeight - el.clientHeight;

    if (maxScroll > 6) {
      // Scrollable list (e.g., nationwide Warnings list, Earthquake station list):
      // Pause briefly at top, smoothly scroll down to the bottom, and hold so the total scene display time
      // is ALWAYS at least `minSceneDurationMs` (never flashes by in an instant when scroll distance is short!)
      let virtualScrollTop = el.scrollTop;
      const scrollSpeedPxPerTick = 2.4; // ~72px/s at 30fps

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
      // Hold for at least minSceneDurationMs before advancing to next scene
      fallbackTimer = setTimeout(() => {
        if (!cancelled) {
          onSceneCompleteRef.current();
        }
      }, minSceneDurationMs);
    }

    return () => {
      cancelled = true;
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      if (scrollIntervalId) clearInterval(scrollIntervalId);
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
    selectedTyphoon.id,
    selectedEarthquake.id,
    isLoopPaused,
    interruptKind,
    loopIntervalSec,
    displayWarnings.length,
    data.amedas.length,
  ]);

  return (
    <aside
      aria-label="地域別防災ステータス一覧"
      className="w-[244px] h-full flex flex-col gap-2 pointer-events-auto select-none"
    >
      {/* Interrupt Dismiss Box when an emergency / anomaly interrupt is active */}
      {interruptKind !== 'none' && (
        <div className="bg-red-950/95 border border-red-500 px-2.5 py-1.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono font-bold text-red-200 whitespace-nowrap">
              {interruptKind === 'earthquake'
                ? '● 地震情報 割込中'
                : interruptKind === 'volcano'
                  ? '● 火山Lv変化 割込中'
                  : interruptKind === 'tsunami'
                    ? '● 潮位変化 割込中'
                    : '● 台風進路 割込中'}
            </span>
            <button
              type="button"
              onClick={onDismissInterrupt}
              className="px-2 py-0.5 text-[11px] font-bold bg-red-600 hover:bg-red-500 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              巡回へ戻る
            </button>
          </div>
        </div>
      )}

      {/* Main Slim Vertical Regional Strip (Matches NERV防災ライブ right column) */}
      <div
        ref={scrollContainerRef}
        data-testid="scene-detail-scroll-container"
        className="flex-1 bg-[#111318]/92 border border-[#686E7A] overflow-y-auto divide-y divide-[#2B303A]"
      >
        {/* ==================== WARNINGS (NERV Style 57-Division Regional Strip) ==================== */}
        {effectiveScene === 'warnings' && (
          <>
            <div className="bg-[#1A1E26] px-2.5 py-1 text-[11px] font-mono text-amber-300 font-bold flex items-center justify-between">
              <span>
                {activeWarningDivision
                  ? `警報発表地域 (${activeWarningDivision.prefecture})`
                  : '全国 地域別警報・注意報'}
              </span>
              <span>{displayWarnings.length}区分</span>
            </div>
            {displayWarnings.map((w) => {
              const divKey = w.divisionCode || w.id;
              const isFocusedDivision =
                activeWarningDivision != null &&
                (activeWarningDivision.divisionCode ||
                  activeWarningDivision.id) === divKey;
              return (
                <div
                  key={w.id}
                  data-division-code={divKey}
                  className={`pb-1.5 transition-colors ${
                    isFocusedDivision
                      ? 'bg-sky-950/60 ring-2 ring-inset ring-sky-400 border-l-4 border-sky-400'
                      : ''
                  }`}
                >
                  <div
                    className={`px-2.5 py-0.5 text-[13px] font-bold tracking-wide flex items-center justify-between ${
                      isFocusedDivision
                        ? 'bg-sky-600 text-white font-extrabold'
                        : w.severity === 'special'
                          ? 'bg-purple-900 text-white'
                          : w.severity === 'warning'
                            ? 'bg-red-900/90 text-white'
                            : 'bg-[#3E434F] text-white'
                    }`}
                  >
                    <span>{w.prefecture}</span>
                    {(w.severity === 'warning' || w.severity === 'special') && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 bg-red-600 text-white rounded-xs">
                        {w.severity === 'special' ? '特別警報' : '警報'}
                      </span>
                    )}
                  </div>
                  <div className="px-2.5 pt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    {w.badgeItems && w.badgeItems.length > 0 ? (
                      w.badgeItems.map((badge) => (
                        <span
                          key={`${w.id}-${badge.code}`}
                          className="inline-flex items-center gap-1 text-[13px] font-bold text-white whitespace-nowrap"
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
            })}
          </>
        )}

        {/* ==================== TYPHOON TRACK & FORECAST CONE ==================== */}
        {effectiveScene === 'typhoon' && (
          <>
            {/* Typhoon Selector (Only shown if multiple active JMA typhoons exist) */}
            {data.typhoons.length > 1 && (
              <div className="p-2 bg-[#1A1E26] space-y-1">
                <div className="text-[10px] font-mono text-neutral-400">
                  対象台風切替 ({data.typhoons.length}件)
                </div>
                <div className="flex flex-col gap-1">
                  {data.typhoons.map((tc) => (
                    <button
                      key={tc.id}
                      type="button"
                      onClick={() => onSelectTyphoon(tc)}
                      className={`w-full text-left px-2 py-1 text-xs font-bold border transition-colors cursor-pointer ${
                        selectedTyphoon.id === tc.id
                          ? 'bg-red-700 border-red-400 text-white'
                          : 'bg-[#111318] border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                      }`}
                    >
                      {tc.displayNumber}（{tc.nameJp}）
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Selected Typhoon Primary Summary */}
            <div className="pb-2">
              <div className="bg-red-700 px-2.5 py-1 text-[13px] font-bold text-white flex items-center justify-between">
                <span>{selectedTyphoon.displayNumber}</span>
                <span className="text-[11px] font-mono">気象庁実況</span>
              </div>
              <div className="px-2.5 pt-2 space-y-1">
                <div className="text-base font-extrabold text-white">
                  {selectedTyphoon.nameJp}
                  {selectedTyphoon.nameEn ? (
                    <span className="text-xs font-normal text-neutral-300 ml-1.5">
                      ({selectedTyphoon.nameEn})
                    </span>
                  ) : null}
                </div>
                <div className="text-[11px] font-mono text-neutral-300">
                  {selectedTyphoon.issueTimeJst}
                </div>
              </div>
            </div>

            {/* Chronological Analysis & Forecast Track Points */}
            {selectedTyphoon.points.map((pt, idx) => (
              <div key={`${selectedTyphoon.id}-pt-${idx}`} className="pb-1.5">
                <div
                  className={`px-2.5 py-0.5 text-[12px] font-bold flex items-center justify-between ${
                    idx === 0
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-[#3E434F] text-white'
                  }`}
                >
                  <span>{pt.timeLabel}</span>
                  <span className="font-mono text-[11px]">{pt.categoryJp}</span>
                </div>
                <div className="px-2.5 pt-1.5 space-y-0.5 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-300">中心気圧:</span>
                    <span className="text-white font-bold">
                      {pt.pressureHpa} hPa
                    </span>
                  </div>
                  {pt.maxWindMs > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-300">最大風速:</span>
                      <span className="text-yellow-300 font-bold">
                        {pt.maxWindMs} m/s (瞬間{pt.maxGustMs}m/s)
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-300">進行・速度:</span>
                    <span className="text-cyan-300">
                      {pt.course} {pt.speedKmh} km/h
                    </span>
                  </div>
                  {pt.probabilityCircleRadiusKm > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">予報円半径:</span>
                      <span className="text-neutral-200">
                        {pt.probabilityCircleRadiusKm} km
                      </span>
                    </div>
                  )}
                  {pt.stormRadiusKm > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-red-300">暴風域(25m/s+):</span>
                      <span className="text-red-400 font-bold">
                        半径 {pt.stormRadiusKm} km
                      </span>
                    </div>
                  )}
                  {pt.galeRadiusKm > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-yellow-300">強風域(15m/s+):</span>
                      <span className="text-yellow-300">
                        半径 {pt.galeRadiusKm} km
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {/* ==================== RADAR (High-Res Nowcast + Lightning) ==================== */}
        {effectiveScene === 'radar' && (
          <>
            <div className="pb-2">
              <div className="bg-[#3E434F] px-2.5 py-1 text-[13px] font-bold text-white">
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
                  <div className="bg-[#3E434F] px-2.5 py-0.5 text-[13px] font-bold text-white flex items-center justify-between">
                    <span>{st.stationName}</span>
                    <span className="text-[11px] font-mono text-neutral-200">
                      {st.prefecture}
                    </span>
                  </div>
                  <div className="px-2.5 pt-1 flex items-center justify-between text-xs font-mono">
                    <span className="text-cyan-300 font-bold">
                      降水 {st.precip1h.toFixed(1)} mm/h
                    </span>
                    <span className="text-neutral-300">
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
                  <div className="bg-[#3E434F] px-2.5 py-0.5 text-[13px] font-bold text-white flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-[11px] font-mono font-extrabold text-amber-300">
                        {rankIdx + 1}.
                      </span>
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: dotHex }}
                      />
                      <span>{st.stationName}</span>
                    </span>
                    <span className="text-[11px] text-neutral-200">
                      {st.prefecture}
                    </span>
                  </div>
                  <div className="px-2.5 pt-1 flex items-center justify-between text-xs font-mono">
                    {amedasMetric === 'temp' ? (
                      <>
                        <span
                          className="font-extrabold text-sm"
                          style={{ color: dotHex }}
                        >
                          {st.temp.toFixed(1)} ℃
                        </span>
                        <span className="text-neutral-300">
                          {st.windDirection} {st.windSpeed.toFixed(1)}m/s
                        </span>
                      </>
                    ) : amedasMetric === 'precip' ? (
                      <>
                        <span className="text-cyan-300 font-extrabold text-sm">
                          {st.precip1h.toFixed(1)} mm/h
                        </span>
                        <span className="text-neutral-300">
                          {st.hasTemp !== false
                            ? `${st.temp.toFixed(1)}℃`
                            : `${st.windSpeed.toFixed(1)}m/s`}
                        </span>
                      </>
                    ) : amedasMetric === 'wind' ? (
                      <>
                        <span
                          className="font-extrabold text-sm"
                          style={{ color: dotHex }}
                        >
                          {st.windDirection} {st.windSpeed.toFixed(1)} m/s
                        </span>
                        <span className="text-neutral-300">
                          {st.hasTemp !== false
                            ? `${st.temp.toFixed(1)}℃`
                            : `${st.precip1h.toFixed(1)}mm/h`}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-sky-200 font-extrabold text-sm">
                          積雪 {st.snowCm ?? 0} cm
                        </span>
                        <span className="text-neutral-300">
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
                  <div className="bg-[#3E434F] px-2.5 py-1 text-[13px] font-bold text-white flex items-center justify-between">
                    <span>アメダス観測ランキング</span>
                    <span className="text-[11px] font-mono text-amber-300">
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
                        className={`py-0.5 text-[11px] font-bold border transition-colors cursor-pointer ${
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
                      <span className="font-mono text-[10px]">上位5地点</span>
                    </div>
                    {rankings.tempHigh5.map((st, idx) =>
                      renderRankingCard(st, idx, 'temp-high')
                    )}
                    <div
                      data-testid="amedas-ranking-header-temp-low"
                      className="bg-sky-950/80 border-y border-sky-500/50 px-2.5 py-1 text-xs font-extrabold text-sky-200 flex items-center justify-between"
                    >
                      <span>▼ 気温が低い順</span>
                      <span className="font-mono text-[10px]">上位5地点</span>
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
                      <span className="font-mono text-[10px]">上位5地点</span>
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
                      <span className="font-mono text-[10px]">上位5地点</span>
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
                      <span className="font-mono text-[10px]">上位5地点</span>
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
            const scopedForecasts = isZoomedIn
              ? (() => {
                  const matched = data.forecasts.filter((fc) =>
                    activeRegionConfig.id !== 'national' &&
                    activeRegionConfig.id !== 'world'
                      ? fc.regionId === activeRegionConfig.id
                      : isPointInViewport(fc.lat, fc.lon) ||
                        fc.regionId === syncedRegionId
                  );
                  return matched.length > 0 ? matched : data.forecasts;
                })()
              : data.forecasts;

            return scopedForecasts.map((fc) => (
              <div key={fc.id} className="pb-1.5">
                <div className="bg-[#3E434F] px-2.5 py-0.5 text-[13px] font-bold text-white flex items-center justify-between">
                  <span>{fc.cityName}</span>
                  <span className="text-[11px] font-mono text-neutral-200">
                    降水 {Math.max(...fc.pops)}%
                  </span>
                </div>
                <div className="px-2.5 pt-1 flex items-center justify-between text-xs">
                  <span className="text-white font-bold">{fc.todayWeather}</span>
                  <span className="font-mono">
                    <span className="text-red-400 font-bold">{fc.tempMax}℃</span>
                    <span className="text-neutral-500">/</span>
                    <span className="text-sky-400 font-bold">{fc.tempMin}℃</span>
                  </span>
                </div>
              </div>
            ));
          })()}

        {/* ==================== VOLCANO ==================== */}
        {effectiveScene === 'volcano' && (
          <>
            <div className="pb-2">
              <div className="bg-red-700 px-2.5 py-1 text-[13px] font-bold text-white">
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
                <div className="text-[11px] text-neutral-400 font-mono pt-1">
                  {activeVolcano.office} · {activeVolcano.lastUpdated}
                </div>
              </div>
            </div>
            {data.volcanoes.map((v) => (
              <div key={v.id} className="pb-1.5">
                <div className="bg-[#3E434F] px-2.5 py-0.5 text-[13px] font-bold text-white flex items-center justify-between">
                  <span>{v.name.split(' ')[0]}</span>
                  <span className="text-xs font-mono text-yellow-300 font-bold">
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

          const activeEq = hasActiveTsunami
            ? data.earthquakes.find(
                (eq) =>
                  (activeTsunamiForecast?.hypocenterName &&
                    eq.hypocenterName.includes(
                      activeTsunamiForecast.hypocenterName
                    )) ||
                  eq.domesticTsunami.includes('津波')
              )
            : undefined;

          const occurrenceTimeStr =
            activeTsunamiForecast?.occurrenceTime ||
            activeEq?.occurrenceTime ||
            activeTsunamiForecast?.issueTime;

          const hypocenterName =
            activeTsunamiForecast?.hypocenterName ||
            activeEq?.hypocenterName ||
            '震央未確定';

          const depthKm =
            activeTsunamiForecast?.depthKm ??
            activeEq?.depthKm ??
            10;

          const depthText = depthKm === 0 ? 'ごく浅い' : `${depthKm}km`;

          const magnitude =
            activeTsunamiForecast?.magnitude ??
            activeEq?.magnitude;

          const magText =
            typeof magnitude === 'number' && !Number.isNaN(magnitude)
              ? `M${magnitude.toFixed(1)}`
              : '-';

          const maxScaleLabel =
            activeTsunamiForecast?.maxScaleLabel ||
            activeEq?.maxScaleLabel ||
            '-';

          const scaleBadgeStyle = getSeismicScaleBadgeStyle(maxScaleLabel);

          return (
            <div className="pb-2">
              <div className="bg-amber-600 px-2.5 py-1 text-[13px] font-bold text-slate-950 flex items-center justify-between">
                <span>津波警報・注意報・予報</span>
                {hasActiveTsunami && activeTsunamiForecast && (
                  <span className="font-mono text-xs bg-slate-950/60 text-white px-1.5 py-0.2 rounded-xs">
                    {activeTsunamiForecast.areas.length}沿岸発表中
                  </span>
                )}
              </div>

              {hasActiveTsunami && activeTsunamiForecast ? (
                <>
                  {/* JMA Official Style Earthquake Card (only displayed when a tsunami forecast is actively issued) */}
                  <div className="mx-2.5 mt-2 bg-neutral-900 border border-neutral-700/80 rounded-xs overflow-hidden shadow-md">
                    <div className="bg-neutral-800/95 px-2.5 py-1 flex items-center justify-between border-b border-neutral-700/60">
                      <span className="text-[11px] font-mono font-bold text-neutral-300">
                        震源・地震情報
                      </span>
                      {activeTsunamiForecast.source === 'demo' && (
                        <span className="bg-purple-600 text-white px-1.5 py-0.2 rounded-xs font-bold text-[10px]">
                          デモデータ
                        </span>
                      )}
                    </div>
                    <div className="p-2 space-y-2">
                      <div>
                        <div className="text-[10px] text-neutral-400 font-mono">地震の発生日時</div>
                        <div className="text-sm font-bold text-white tracking-wide">
                          {formatOccurrenceTimeJa(occurrenceTimeStr)}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 text-xs">
                        <div className="bg-neutral-950/70 p-1.5 rounded-xs border border-neutral-800">
                          <div className="text-[10px] text-neutral-400 font-mono">震央地名</div>
                          <div className="font-bold text-neutral-100 truncate text-[12px]" title={hypocenterName}>
                            {hypocenterName}
                          </div>
                        </div>
                        <div className="bg-neutral-950/70 p-1.5 rounded-xs border border-neutral-800">
                          <div className="text-[10px] text-neutral-400 font-mono">最大震度</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span
                              className="px-1.5 py-0.2 rounded-xs font-bold text-xs"
                              style={{
                                backgroundColor: scaleBadgeStyle.bg,
                                color: scaleBadgeStyle.text,
                              }}
                            >
                              {maxScaleLabel !== '-' ? `震度 ${maxScaleLabel}` : '不明'}
                            </span>
                          </div>
                        </div>
                        <div className="bg-neutral-950/70 p-1.5 rounded-xs border border-neutral-800">
                          <div className="text-[10px] text-neutral-400 font-mono">深さ</div>
                          <div className="font-bold font-mono text-neutral-100 text-[12px]">
                            {depthText}
                          </div>
                        </div>
                        <div className="bg-neutral-950/70 p-1.5 rounded-xs border border-neutral-800">
                          <div className="text-[10px] text-neutral-400 font-mono">規模</div>
                          <div className="font-bold font-mono text-amber-400 text-[12px]">
                            {magText}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-2.5 pt-2 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono text-neutral-300">
                      <span>
                        発表: {activeTsunamiForecast.issueTime || '随時'}
                      </span>
                    </div>

                    {activeTsunamiForecast.headline && (
                      <p className="text-xs text-yellow-200 leading-snug bg-yellow-950/40 border-l-2 border-yellow-400 px-2 py-1">
                        {activeTsunamiForecast.headline}
                      </p>
                    )}

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
                              className="px-2 py-0.5 text-xs font-bold flex items-center justify-between"
                              style={{
                                backgroundColor: style.hex,
                                color: style.textHex,
                              }}
                            >
                              <span>{style.label}</span>
                              <span className="font-mono text-[11px]">
                                {matchedAreas.length}沿岸
                              </span>
                            </div>
                            <div className="p-1.5 space-y-1">
                              {matchedAreas.map((area) => (
                                <div
                                  key={area.code || area.name}
                                  className="flex items-center justify-between text-xs px-1 py-0.5 border-b border-neutral-800/80 last:border-none"
                                >
                                  <span className="font-bold text-white">
                                    {area.name}
                                  </span>
                                  <div className="text-right font-mono text-[11px] space-x-2">
                                    <span className="text-amber-300 font-bold">
                                      {area.maxHeightText}
                                    </span>
                                    <span className="text-neutral-400">
                                      {area.firstHeightText}
                                    </span>
                                  </div>
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
          );
        })()}

        {/* ==================== EARTHQUAKE ==================== */}
        {effectiveScene === 'earthquake' && (
          <>
            {/* EEW (緊急地震速報) Live Banner (NERV / Broadcast Style) */}
            {activeEew && isEewStillActive(activeEew) && (
              <div className="pb-2 mb-2 bg-[#1A0B0E] border-2 border-red-500 rounded-xs shadow-lg shadow-red-950/60 animate-pulse-slow">
                <div className="bg-red-600 px-2.5 py-1 text-[13px] font-black text-white flex items-center justify-between tracking-wide">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                    緊急地震速報 (警報)
                  </span>
                  <span className="font-mono text-xs bg-black/40 px-1.5 py-0.2 rounded-xs">
                    第{activeEew.serial}報
                    {activeEew.serial >= 5 ? ' (最終報)' : ''}
                  </span>
                </div>

                <div className="px-2.5 pt-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-black text-white tracking-wide">
                        {activeEew.hypocenterName || '震源調査中'}
                      </div>
                      <div className="text-xs font-mono text-neutral-300">
                        {activeEew.magnitude > 0
                          ? `M${activeEew.magnitude.toFixed(1)}`
                          : 'M不明'}{' '}
                        /{' '}
                        {activeEew.depthKm >= 0
                          ? `深さ約${activeEew.depthKm}km`
                          : '深さ不明'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-neutral-400 font-mono">
                        最大予測震度
                      </div>
                      <div className="text-2xl font-black text-yellow-300 font-mono tracking-wider">
                        震度{activeEew.maxScaleLabel}
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] font-mono text-neutral-400 flex items-center justify-between border-t border-red-900/50 pt-1">
                    <span>発生: {activeEew.originTime || '直近'}</span>
                    <span>発表: {activeEew.issueTime || '随時'}</span>
                  </div>

                  {/* Warning Areas with Arrival Countdown */}
                  {activeEew.areas.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <div className="text-[11px] font-bold text-red-300 flex items-center justify-between">
                        <span>強い揺れの予想地域</span>
                        <span className="font-mono text-[10px] text-neutral-400">
                          {activeEew.areas.length}地域
                        </span>
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-1 pr-0.5">
                        {activeEew.areas.map((area) => {
                          const scaleRange = formatEewScaleRange(
                            area.scaleFrom,
                            area.scaleTo
                          );
                          const arrival = formatEewArrivalLabel(
                            area,
                            eewAnimNow
                          );
                          const isArrived = arrival.includes('到達');
                          return (
                            <div
                              key={`${area.pref}-${area.name}`}
                              className="bg-neutral-900/90 border border-neutral-800 px-2 py-1 rounded-xs flex items-center justify-between text-xs"
                            >
                              <div className="font-bold text-white">
                                <span className="text-[11px] text-neutral-400 mr-1.5">
                                  {area.pref}
                                </span>
                                {area.name}
                              </div>
                              <div className="flex items-center gap-2 font-mono">
                                <span className="px-1.5 py-0.2 bg-yellow-400 text-slate-950 font-black rounded-xs text-[11px]">
                                  {scaleRange}
                                </span>
                                <span
                                  className={`text-[11px] font-bold ${
                                    isArrived
                                      ? 'text-red-400'
                                      : 'text-amber-300'
                                  }`}
                                >
                                  {arrival}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Regular Earthquake Detailed Report */}
            <div className="pb-2">
              <div className="bg-red-700 px-2.5 py-1 text-[13px] font-bold text-white flex items-center justify-between">
                <span>震源・震度詳細</span>
                <span className="font-mono text-xs">
                  最大震度 {selectedEarthquake.maxScaleLabel}
                </span>
              </div>
              <div className="px-2.5 pt-2 space-y-1">
                <div className="text-base font-extrabold text-white">
                  {selectedEarthquake.hypocenterName}
                </div>
                <div className="text-xs font-mono text-neutral-200 flex items-center justify-between">
                  <span>
                    M{selectedEarthquake.magnitude.toFixed(1)} / 深さ約
                    {selectedEarthquake.depthKm}km
                  </span>
                  <span className="text-amber-300 font-bold">
                    観測点 {selectedEarthquake.stations.length}箇所
                  </span>
                </div>
                <div className="text-[11px] font-mono text-neutral-400">
                  {selectedEarthquake.occurrenceTime}
                </div>
                <div className="text-xs text-cyan-300 font-bold pt-1">
                  {selectedEarthquake.domesticTsunami}
                </div>
              </div>
            </div>
            {groupedEarthquakeStations.map((grp, idx) => {
                const style = getSeismicScaleStyle(grp.scaleCode);
                const extraCount = grp.totalCount - grp.names.length;
                return (
                  <div
                    key={`${grp.prefecture}-${grp.scaleCode}-${idx}`}
                    className="pb-1.5"
                  >
                    <div className="bg-[#3E434F] px-2.5 py-0.5 text-[13px] font-bold text-white flex items-center justify-between">
                      <span>{grp.prefecture}</span>
                      <span
                        className="px-1.5 text-xs font-mono font-extrabold rounded-sm"
                        style={{
                          backgroundColor: style.hex,
                          color: style.badgeText,
                        }}
                      >
                        震度{grp.scaleLabel}
                      </span>
                    </div>
                    <div className="px-2.5 pt-1 text-xs text-neutral-200 leading-relaxed">
                      {grp.names.join('・')}
                      {extraCount > 0 ? ` ほか${extraCount}地点` : ''}
                    </div>
                  </div>
                );
              })}
          </>
        )}
      </div>

      {/* Bottom Compact Legend Box */}
      <div className="bg-[#111318]/95 border border-[#686E7A] px-2.5 py-1.5 shrink-0">
        {effectiveScene === 'warnings' ? (
          <div className="flex items-center justify-between text-[11px] font-bold text-white whitespace-nowrap">
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
          <div className="flex items-center justify-between text-[11px] font-bold text-white whitespace-nowrap">
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
          <div className="flex items-center justify-between text-[10px] font-mono text-neutral-200 whitespace-nowrap">
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
            <div className="flex items-center justify-between text-[10px] font-mono font-bold text-white whitespace-nowrap">
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
            <div className="flex items-center justify-between text-[10px] font-mono font-bold text-white whitespace-nowrap">
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
            <div className="flex items-center justify-between text-[10px] font-mono font-bold text-white whitespace-nowrap">
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
            <div className="flex items-center justify-between text-[10px] font-mono font-bold text-white whitespace-nowrap">
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
          <div className="flex items-center justify-between text-[10px] font-mono font-bold text-white whitespace-nowrap">
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
          <div className="flex items-center justify-between text-[11px] font-bold text-white whitespace-nowrap">
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
        ) : (
          <div className="flex items-center justify-between text-[11px] font-mono text-neutral-300">
            <span>気象庁防災情報XML</span>
            <span>更新 {data.lastXmlFetchTime}</span>
          </div>
        )}
      </div>
    </aside>
  );
});
