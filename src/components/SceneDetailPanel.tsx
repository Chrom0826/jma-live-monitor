import React, { useEffect, useRef } from 'react';
import {
  EarthquakeReport,
  InterruptKind,
  MonitorDataBundle,
  RegionConfig,
  SceneId,
  TsunamiStationItem,
  TyphoonReport,
  VolcanoStatusItem,
  WarningSeverity,
} from '../types/jma';
import {
  getAmedasTempGradientColor,
  getSeismicScaleStyle,
} from '../utils/jmaParser';

interface SceneDetailPanelProps {
  activeScene: SceneId;
  activeRegionConfig: RegionConfig;
  data: MonitorDataBundle;
  selectedEarthquake: EarthquakeReport;
  selectedTyphoon: TyphoonReport;
  onSelectTyphoon: (tc: TyphoonReport) => void;
  activeVolcano: VolcanoStatusItem;
  activeTsunamiStation: TsunamiStationItem;
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

export const SceneDetailPanel: React.FC<SceneDetailPanelProps> = ({
  activeScene,
  activeRegionConfig,
  data,
  selectedEarthquake,
  selectedTyphoon,
  onSelectTyphoon,
  activeVolcano,
  activeTsunamiStation,
  interruptKind,
  onDismissInterrupt,
  isLoopPaused,
  loopIntervalSec,
  onSceneComplete,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const onSceneCompleteRef = useRef<() => void>(onSceneComplete);

  useEffect(() => {
    onSceneCompleteRef.current = onSceneComplete;
  }, [onSceneComplete]);

  const effectiveScene: SceneId =
    interruptKind === 'earthquake'
      ? 'earthquake'
      : interruptKind === 'volcano'
        ? 'volcano'
        : interruptKind === 'tsunami'
          ? 'tsunami'
          : interruptKind === 'typhoon'
            ? 'typhoon'
            : activeScene;

  const filteredWarnings =
    activeRegionConfig.id === 'national'
      ? data.warnings
      : data.warnings.filter((w) => w.regionId === activeRegionConfig.id);

  const displayWarnings =
    filteredWarnings.length > 0 ? filteredWarnings : data.warnings;

  // Reset scroll position to top when scene changes
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = 0;
    }
  }, [effectiveScene, activeRegionConfig.id]);

  // Auto-scroll right-side information list and transition to next scene when scroll finishes
  // ('radar' scene transition is controlled by MonitorMap after all radar timeframes play)
  useEffect(() => {
    if (effectiveScene === 'radar') return;
    if (isLoopPaused || interruptKind !== 'none') return;

    const el = scrollContainerRef.current;
    if (!el) return;

    let scrollIntervalId: ReturnType<typeof setInterval> | null = null;
    let startDelayTimer: ReturnType<typeof setTimeout> | null = null;
    let endHoldTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const maxScroll = el.scrollHeight - el.clientHeight;

    if (maxScroll > 6) {
      // Scrollable list (e.g., Warnings list, AMeDAS list):
      // Pause briefly at top, smoothly scroll down to the bottom, pause briefly, then transition scene
      let virtualScrollTop = el.scrollTop;
      const scrollSpeedPxPerTick = 2.0; // ~60px/s at 30fps

      startDelayTimer = setTimeout(() => {
        if (cancelled) return;

        scrollIntervalId = setInterval(() => {
          if (cancelled) return;
          const container = scrollContainerRef.current;
          if (!container) return;

          const currentMax = container.scrollHeight - container.clientHeight;
          if (currentMax <= 4) {
            if (scrollIntervalId) clearInterval(scrollIntervalId);
            endHoldTimer = setTimeout(() => {
              if (!cancelled) onSceneCompleteRef.current();
            }, 1300);
            return;
          }

          virtualScrollTop = Math.min(
            currentMax,
            virtualScrollTop + scrollSpeedPxPerTick
          );
          container.scrollTop = virtualScrollTop;

          if (virtualScrollTop >= currentMax - 1.5) {
            if (scrollIntervalId) clearInterval(scrollIntervalId);
            endHoldTimer = setTimeout(() => {
              if (!cancelled) onSceneCompleteRef.current();
            }, 1300);
          }
        }, 33);
      }, 1100);
    } else {
      // Non-overflowing right panel (e.g., Typhoon / Forecast / Earthquake):
      // Hold for loopIntervalSec seconds, then advance to next scene
      fallbackTimer = setTimeout(() => {
        if (!cancelled) {
          onSceneCompleteRef.current();
        }
      }, loopIntervalSec * 1000);
    }

    return () => {
      cancelled = true;
      if (scrollIntervalId) clearInterval(scrollIntervalId);
      if (startDelayTimer) clearTimeout(startDelayTimer);
      if (endHoldTimer) clearTimeout(endHoldTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [
    effectiveScene,
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
        {/* ==================== WARNINGS (NERV Style Regional Strip) ==================== */}
        {effectiveScene === 'warnings' &&
          displayWarnings.map((w) => (
            <div key={w.id} className="pb-1.5">
              <div className="bg-[#3E434F] px-2.5 py-0.5 text-[13px] font-bold text-white tracking-wide">
                {w.prefecture}
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
          ))}

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
            {data.amedas
              .filter((a) => a.precip1h > 0 || a.windSpeed >= 12)
              .slice(0, 18)
              .map((st) => (
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

        {/* ==================== AMEDAS (Nationwide Temperature Distribution) ==================== */}
        {effectiveScene === 'amedas' && (
          <>
            <div className="pb-2">
              <div className="bg-[#3E434F] px-2.5 py-1 text-[13px] font-bold text-white flex items-center justify-between">
                <span>全国アメダス観測網</span>
                <span className="text-[11px] font-mono text-amber-300">
                  {data.amedas.length}地点
                </span>
              </div>
              <div className="px-2.5 pt-1.5 text-[11px] text-neutral-300 font-mono">
                全国の気温観測点を重ならないようフィルタリング表示中
              </div>
            </div>
            {[...data.amedas]
              .sort((a, b) => b.temp - a.temp)
              .filter((_, idx, arr) => {
                const step = Math.max(1, Math.floor(arr.length / 22));
                return idx % step === 0;
              })
              .slice(0, 22)
              .map((st) => {
                const dotHex = getAmedasTempGradientColor(st.temp);
                return (
                  <div key={st.id} className="pb-1.5">
                    <div className="bg-[#3E434F] px-2.5 py-0.5 text-[13px] font-bold text-white flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5">
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
                      <span
                        className="font-extrabold"
                        style={{ color: dotHex }}
                      >
                        {st.temp.toFixed(1)}℃
                      </span>
                      <span className="text-cyan-300">
                        {st.precip1h.toFixed(1)}mm/h
                      </span>
                      <span className="text-neutral-300">
                        {st.windSpeed.toFixed(1)}m/s
                      </span>
                    </div>
                  </div>
                );
              })}
          </>
        )}

        {/* ==================== FORECAST ==================== */}
        {effectiveScene === 'forecast' &&
          data.forecasts.map((fc) => (
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
          ))}

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
        {effectiveScene === 'tsunami' && (
          <>
            <div className="pb-2">
              <div className="bg-amber-600 px-2.5 py-1 text-[13px] font-bold text-slate-950">
                潮位変化・津波観測フォーカス
              </div>
              <div className="px-2.5 pt-2 space-y-1">
                <div className="text-sm font-extrabold text-white">
                  {activeTsunamiStation.stationName}
                </div>
                <div className="text-xs text-amber-300 font-bold">
                  {activeTsunamiStation.statusLabel}
                </div>
                <div className="text-sm font-mono font-bold text-white pt-1">
                  観測潮位: +{activeTsunamiStation.tideLevelM.toFixed(2)}m (
                  {activeTsunamiStation.maxHeightText})
                </div>
              </div>
            </div>
            {data.tsunamiStations.map((ts) => (
              <div key={ts.id} className="pb-1.5">
                <div className="bg-[#3E434F] px-2.5 py-0.5 text-[13px] font-bold text-white">
                  {ts.stationName}
                </div>
                <div className="px-2.5 pt-1 flex items-center justify-between text-xs font-mono">
                  <span className="text-neutral-300">{ts.areaName.slice(0, 8)}</span>
                  <span className="text-cyan-300 font-bold">
                    +{ts.tideLevelM.toFixed(2)}m
                  </span>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ==================== EARTHQUAKE ==================== */}
        {effectiveScene === 'earthquake' && (
          <>
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
                <div className="text-xs font-mono text-neutral-200">
                  M{selectedEarthquake.magnitude.toFixed(1)} / 深さ約
                  {selectedEarthquake.depthKm}km
                </div>
                <div className="text-[11px] font-mono text-neutral-400">
                  {selectedEarthquake.occurrenceTime}
                </div>
                <div className="text-xs text-cyan-300 font-bold pt-1">
                  {selectedEarthquake.domesticTsunami}
                </div>
              </div>
            </div>
            {selectedEarthquake.stations.map((st, idx) => {
              const style = getSeismicScaleStyle(st.scaleCode);
              return (
                <div key={`${st.prefecture}-${idx}`} className="pb-1.5">
                  <div className="bg-[#3E434F] px-2.5 py-0.5 text-[13px] font-bold text-white flex items-center justify-between">
                    <span>{st.prefecture}</span>
                    <span
                      className={`px-1.5 text-xs font-mono font-extrabold ${style.bg} ${style.text}`}
                    >
                      震度{st.scaleLabel}
                    </span>
                  </div>
                  <div className="px-2.5 pt-1 text-xs text-neutral-200">
                    {st.city}
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
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600" />
              暴風域(25m/s)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400" />
              強風域(15m/s)
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
        ) : (
          <div className="flex items-center justify-between text-[11px] font-mono text-neutral-300">
            <span>気象庁防災情報XML</span>
            <span>更新 {data.lastXmlFetchTime}</span>
          </div>
        )}
      </div>
    </aside>
  );
};
