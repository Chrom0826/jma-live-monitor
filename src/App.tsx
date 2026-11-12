import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MonitorMap } from './components/MonitorMap';
import { SceneDetailPanel } from './components/SceneDetailPanel';
import { ModalTabMode, XmlInspectorModal } from './components/XmlInspectorModal';
import {
  computeDesktopUiScale,
  getRootFontSizePx,
} from './utils/responsiveLayout';
import {
  INITIAL_AMEDAS_STATIONS,
  INITIAL_EARTHQUAKES,
  INITIAL_FORECASTS,
  INITIAL_LIGHTNING_POINTS,
  INITIAL_MUNI_SEVERITY_MAP,
  INITIAL_MUNICIPALITY_WARNINGS,
  INITIAL_NOWCAST_TIMES,
  INITIAL_PREF_SEVERITY_MAP,
  CLEAN_PREF_SEVERITY_MAP,
  INITIAL_TSUNAMI_FORECAST,
  INITIAL_TSUNAMI_STATIONS,
  INITIAL_TYPHOONS,
  INITIAL_VOLCANOES,
  INITIAL_WARNINGS,
  INITIAL_WEATHER_BULLETINS,
  INITIAL_XML_ENTRIES,
  TEST_EEW_FORECAST_REPORT,
  TEST_EEW_REPORTS,
  TEST_INTERRUPT_EARTHQUAKE,
  TEST_NOTO_EARTHQUAKE_DEMO,
  TEST_TSUNAMI_ANOMALY_STATION,
  TEST_TSUNAMI_FORECAST_DEMO,
  TEST_VOLCANO_LEVEL_CHANGE,
} from './data/fallbackData';
import { connectWolfxEewSocket } from './services/wolfxEewSocket';
import {
  convertP2PQuakeItem,
  fetchLatestLiveEew,
  fetchMonitorDataBundle,
  fetchRecentEarthquakes,
} from './services/jmaClient';
import {
  AmedasMetric,
  EarthquakeReport,
  EewDisplayMode,
  EewReport,
  ForecastViewMode,
  InterruptKind,
  JmaXmlEntry,
  MapViewportState,
  MonitorDataBundle,
  RegionId,
  SceneId,
  TsunamiForecastReport,
  TsunamiStationItem,
  TyphoonReport,
  VolcanoStatusItem,
} from './types/jma';
import {
  DEFAULT_NORMAL_LOOP_SCENES,
  getActiveSevereWarningDivisions,
  getNextAmedasMetric,
  getNextPatrolStep,
  getNextSceneId,
  getSeismicScaleStyle,
  mergeProgressiveEarthquakeReports,
  REGION_CONFIGS,
  SCENE_LIST,
  sortEarthquakesByNewest,
} from './utils/jmaParser';
import {
  EEW_DISPLAY_HOLD_MS,
  formatJstHms,
  getTsunamiAlertSeverity,
  getTsunamiHighestGrade,
  hasActualEewLpgm,
  isEewFinal,
  isEewSpecialWarning,
  isEewStillActive,
  isEewWarning,
  isTsunamiForecastActive,
  parseJstDateTimeMs,
  parseP2PEew,
  parseP2PEewDetection,
  parseP2PTsunami,
  parseWolfxEew,
  shouldReplaceEew,
} from './utils/eewTsunami';
import {
  buildSceneFeed,
  buildBottomFlipFeed,
  BottomFlipFeedResult,
  SceneFeedData,
} from './utils/sceneFeedBuilder';
import {
  areEarthquakeListsEquivalent,
  computeFlipCycleState,
  createInitialEarthquakeTrackerState,
  EarthquakeTrackerState,
  evaluateEarthquakeLoopCompletion,
  evaluateIncomingEarthquakeUpdate,
  isEarthquakeAwaitingDetail,
  resolveEffectiveScene,
  resolveInterruptKindOnEew,
  resolveInterruptKindOnTsunami,
  resolveInterruptKindOnTsunamiChange,
  shouldBlockNormalPatrolAdvance,
} from './utils/quakeInterrupt';

const INITIAL_BUNDLE: MonitorDataBundle = {
  xmlEntries: [],
  nowcastTimes: INITIAL_NOWCAST_TIMES,
  lightningPoints: [],
  warnings: [],
  municipalityWarnings: [],
  muniSeverityMap: {},
  prefSeverityMap: CLEAN_PREF_SEVERITY_MAP,
  typhoons: INITIAL_TYPHOONS,
  bulletins: INITIAL_WEATHER_BULLETINS,
  amedas: INITIAL_AMEDAS_STATIONS,
  volcanoes: INITIAL_VOLCANOES,
  tsunamiStations: INITIAL_TSUNAMI_STATIONS,
  tsunamiForecast: INITIAL_TSUNAMI_FORECAST,
  forecasts: INITIAL_FORECASTS,
  earthquakes: INITIAL_EARTHQUAKES,
  lastXmlFetchTime: '',
  dataSourceStatus: {
    jmaXmlLive: false,
    jmaBosaiLive: false,
    p2pQuakeLive: false,
  },
};

const WEEKDAYS_JA = [
  '日曜日',
  '月曜日',
  '火曜日',
  '水曜日',
  '木曜日',
  '金曜日',
  '土曜日',
];

function formatTimeHm(isoOrText: string): string {
  try {
    const d = new Date(isoOrText);
    if (!Number.isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    }
  } catch {
    // ignore
  }
  return '13:40';
}

const LiveClockBox = memo(function LiveClockBox({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [dateHeaderText, setDateHeaderText] = useState<string>('11月5日 木曜日');
  const [shortDateText, setShortDateText] = useState<string>('11/5(木)');
  const [timeHeaderText, setTimeHeaderText] = useState<string>('13:43:07');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const month = now.getMonth() + 1;
      const day = now.getDate();
      const weekday = WEEKDAYS_JA[now.getDay()];
      const shortWeekday = weekday.slice(0, 1);
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      const nextDate = `${month}月${day}日 ${weekday}`;
      const nextShortDate = `${month}/${day}(${shortWeekday})`;
      setDateHeaderText((prev) => (prev === nextDate ? prev : nextDate));
      setShortDateText((prev) => (prev === nextShortDate ? prev : nextShortDate));
      setTimeHeaderText(`${hh}:${min}:${ss}`);
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  if (compact) {
    return (
      <div className="flex items-baseline gap-1.5 bg-[#0B0D12] border border-[#3B4252] px-2 py-1 rounded-xs shrink-0">
        <span className="text-[11px] font-bold text-neutral-300 tracking-tight whitespace-nowrap">
          {shortDateText}
        </span>
        <span
          data-testid="live-digital-clock"
          className="text-[17px] font-mono font-extrabold tracking-wider text-white leading-none whitespace-nowrap"
        >
          {timeHeaderText}
        </span>
      </div>
    );
  }

  return (
    <div className="border-b border-[#5A606D] px-4 py-3 text-center bg-[#111318] shrink-0">
      <div className="text-[1.25rem] font-bold tracking-wider text-white leading-snug whitespace-nowrap">
        {dateHeaderText}
      </div>
      <div
        data-testid="live-digital-clock"
        className="text-[2.625rem] font-mono font-bold tracking-wider text-white leading-none mt-1 whitespace-nowrap"
      >
        {timeHeaderText}
      </div>
    </div>
  );
});


function formatTsunamiStatusBadge(domesticTsunami?: string) {
  const text = domesticTsunami || '';
  if (text.includes('警報')) {
    return (
      <span className="text-red-400 font-bold flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
        津波警報等 発表中
      </span>
    );
  }
  if (text.includes('注意報')) {
    return (
      <span className="text-amber-400 font-bold flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
        津波注意報 発表中
      </span>
    );
  }
  if (text.includes('調査中') || text.includes('Checking')) {
    return (
      <span className="text-amber-300 font-bold flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        津波の有無は調査中
      </span>
    );
  }
  return <span className="text-neutral-400 font-normal">津波の心配なし</span>;
}

interface EarthquakeHistoryItemProps {
  eq: EarthquakeReport;
  isSelected: boolean;
  isPinned: boolean;
  isEewActive: boolean;
  onSelect: (eq: EarthquakeReport) => void;
}

const EarthquakeHistoryItem = memo(function EarthquakeHistoryItem({
  eq,
  isSelected,
  isPinned,
  isEewActive,
  onSelect,
}: EarthquakeHistoryItemProps) {
    const scaleStyle = getSeismicScaleStyle(eq.maxScaleCode);

    return (
      <button
        key={eq.id}
        type="button"
        disabled={isEewActive}
        onClick={() => onSelect(eq)}
        className={`w-full text-left px-3 py-2.5 transition-colors block border-b border-[#242933] ${
          isEewActive
            ? 'opacity-60 cursor-not-allowed'
            : isSelected
              ? 'bg-[#251A22] border-l-4 border-l-red-500 shadow-inner'
              : 'hover:bg-[#181B22] cursor-pointer'
        }`}
      >
        {/* Top Row: Left has Time + Region (Hypocenter), Right has Big Max Intensity Box */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[0.6875rem] font-mono text-neutral-400">
              <span className="whitespace-nowrap">{eq.occurrenceTime.replace(' 頃発生', '')}</span>
              {isPinned && (
                <span className="text-[0.5625rem] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/50 px-1 py-0.2 rounded-xs whitespace-nowrap shrink-0">
                  固定中
                </span>
              )}
              {eq.isConfirmed === false && (
                <span className="text-[0.5625rem] font-mono font-bold text-amber-300 bg-amber-950/80 border border-amber-500/60 px-1 py-0.2 rounded-xs shrink-0 whitespace-nowrap">
                  続報待機
                </span>
              )}
            </div>
            <div className="text-[0.9375rem] font-black text-white mt-0.5 leading-snug truncate">
              {eq.hypocenterName ||
                (eq.hypocenterUnknown ? '震源精査中' : '震源情報')}
            </div>
          </div>

          {/* Big Max Intensity Box on Right */}
          <div
            className={`shrink-0 flex flex-col items-center justify-center w-[3.375rem] h-[3rem] rounded-xs shadow-md border border-black/30 ${scaleStyle.bg} ${scaleStyle.text}`}
          >
            <span className="text-[0.5625rem] font-bold leading-none tracking-tighter opacity-80 whitespace-nowrap">
              最大震度
            </span>
            <span className="text-[1.4375rem] font-black leading-none mt-0.5 tracking-tight font-mono whitespace-nowrap">
              {eq.maxScaleCode >= 10 ? eq.maxScaleLabel : '-'}
            </span>
          </div>
        </div>

        {/* Middle Row: Magnitude and Depth */}
        <div className="mt-1 flex items-center justify-between text-xs font-mono text-neutral-300">
          {eq.hypocenterUnknown ? (
            <span className="text-amber-300 text-[0.6875rem] whitespace-nowrap">
              {eq.issueTypeLabel || '震度速報'}（震源精査中）
            </span>
          ) : (
            <>
              <span className="font-bold text-white whitespace-nowrap">
                {eq.magnitude >= 0 ? `M${eq.magnitude.toFixed(1)}` : 'M不明'}
              </span>
              <span className="text-neutral-400 whitespace-nowrap">
                {eq.depthKm >= 0 ? `深さ約${eq.depthKm}km` : '深さ不明'}
              </span>
            </>
          )}
        </div>

        {/* Bottom Row: Tsunami status ("その下に津波心配なしみたいな") */}
        <div className="mt-1 pt-1 border-t border-neutral-800/80 flex items-center justify-between text-[0.6875rem] truncate">
          {formatTsunamiStatusBadge(eq.domesticTsunami)}
        </div>
      </button>
    );
  }
);

interface EarthquakeHistoryListProps {
  variant: 'desktop' | 'mobile';
  earthquakes: EarthquakeReport[];
  selectedEarthquakeId: string;
  pinnedEarthquakeId: string | null;
  isLoopPaused: boolean;
  isEewActive: boolean;
  onSelect: (eq: EarthquakeReport) => void;
}

const EarthquakeHistoryList = memo(function EarthquakeHistoryList({
  variant,
  earthquakes,
  selectedEarthquakeId,
  pinnedEarthquakeId,
  isLoopPaused,
  isEewActive,
  onSelect,
}: EarthquakeHistoryListProps) {
  return (
    <div
      key={variant === 'desktop' ? 'desktop-quake-history-list' : 'mobile-quake-history-list'}
      aria-label="地震履歴一覧"
      data-testid="left-earthquake-history-list"
      className="flex-1 overflow-y-auto divide-y divide-[#2B303C] animate-title-swap"
    >
      {isEewActive && (
        <div
          data-testid="eew-history-locked-banner"
          className="bg-red-950/95 border-b border-red-500/80 px-2.5 py-1.5 text-xs text-red-200 font-bold flex items-center gap-1.5 shrink-0"
        >
          <span className="inline-block w-2 h-2 rounded-full bg-red-400 animate-ping shrink-0" />
          <span className="truncate">緊急地震速報 発表中（手動選択無効）</span>
        </div>
      )}
      {earthquakes.map((eq) => {
        const isSelected = selectedEarthquakeId === eq.id;
        const isPinned =
          isSelected && pinnedEarthquakeId === eq.id && isLoopPaused;
        return (
          <EarthquakeHistoryItem
            key={eq.id}
            eq={eq}
            isSelected={isSelected}
            isPinned={isPinned}
            isEewActive={isEewActive}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
});

interface XmlTimelineListProps {
  variant: 'desktop' | 'mobile';
  xmlEntries: JmaXmlEntry[];
  selectedXmlEntryId: string | null;
  onSelectEntry: (entry: JmaXmlEntry) => void;
}

const XmlTimelineList = memo(function XmlTimelineList({
  variant,
  xmlEntries,
  selectedXmlEntryId,
  onSelectEntry,
}: XmlTimelineListProps) {
  return (
    <div
      aria-label="気象庁XML電文タイムライン"
      data-testid="left-xml-timeline-list"
      className="flex-1 overflow-y-auto divide-y divide-[#2B303C]"
    >
      {xmlEntries.map((entry) => {
        const isSelected = selectedXmlEntryId === entry.id;
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onSelectEntry(entry)}
            className={`w-full text-left px-3 transition-colors cursor-pointer block ${
              variant === 'mobile' ? 'py-2' : 'py-2.5'
            } ${
              isSelected
                ? 'bg-[#1D222B] border-l-2 border-amber-400'
                : 'hover:bg-[#181B22]'
            }`}
          >
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-mono text-neutral-400 shrink-0">
                {formatTimeHm(entry.updated)}
              </span>
              <span className="text-[0.8125rem] font-bold text-white leading-snug">
                {entry.title}
              </span>
            </div>
            <div
              className={`text-[0.6875rem] text-neutral-300 leading-relaxed break-words ${
                variant === 'mobile' ? 'mt-0.5' : 'mt-1'
              }`}
            >
              {entry.content}
            </div>
          </button>
        );
      })}
    </div>
  );
});

interface BroadcastBottomBarProps {
  variant: 'desktop' | 'mobile';
  flipFeed: BottomFlipFeedResult | null;
  sceneFeed: SceneFeedData;
  flipSessionKey: string;
  onFlipRoundsChange: (sessionKey: string, completedRounds: number) => void;
}

/**
 * Isolated bottom/feed bar owning the 4.8s flip timer and compositor ticker measurements
 * so flip card transitions never re-render App, MonitorMap, or SceneDetailPanel.
 */
const BroadcastBottomBar = memo(function BroadcastBottomBar({
  variant,
  flipFeed,
  sceneFeed,
  flipSessionKey,
  onFlipRoundsChange,
}: BroadcastBottomBarProps) {
  const cardCount = flipFeed?.cards.length ?? 0;
  const isFlipFeedActive = cardCount > 0;

  const [flipState, setFlipState] = useState<{
    sessionKey: string;
    ticks: number;
  }>(() => ({ sessionKey: flipSessionKey, ticks: 0 }));

  useEffect(() => {
    setFlipState({ sessionKey: flipSessionKey, ticks: 0 });
    if (!isFlipFeedActive) {
      return;
    }
    const timer = setInterval(() => {
      setFlipState((prev) => ({
        sessionKey: flipSessionKey,
        ticks: prev.sessionKey === flipSessionKey ? prev.ticks + 1 : 1,
      }));
    }, 4800);
    return () => clearInterval(timer);
  }, [flipSessionKey, isFlipFeedActive]);

  const activeTicks =
    flipState.sessionKey === flipSessionKey ? flipState.ticks : 0;
  const { cardIndex: safeFlipIndex, completedRounds } = computeFlipCycleState(
    activeTicks,
    cardCount
  );
  const currentFlipCard = flipFeed?.cards[safeFlipIndex];

  const onFlipRoundsChangeRef = useRef(onFlipRoundsChange);
  useEffect(() => {
    onFlipRoundsChangeRef.current = onFlipRoundsChange;
  }, [onFlipRoundsChange]);

  const lastReportedRef = useRef<{ sessionKey: string; rounds: number }>({
    sessionKey: flipSessionKey,
    rounds: 0,
  });

  useEffect(() => {
    if (
      lastReportedRef.current.sessionKey === flipSessionKey &&
      lastReportedRef.current.rounds === completedRounds
    ) {
      return;
    }
    lastReportedRef.current = {
      sessionKey: flipSessionKey,
      rounds: completedRounds,
    };
    onFlipRoundsChangeRef.current(flipSessionKey, completedRounds);
  }, [flipSessionKey, completedRounds]);

  const tickerTrackRef = useRef<HTMLDivElement | null>(null);
  const tickerFirstCopyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isFlipFeedActive) return;
    const track = tickerTrackRef.current;
    const copy = tickerFirstCopyRef.current;
    const applyTickerGeometry = () => {
      if (!track || !copy) return;
      const w = copy.offsetWidth;
      if (w <= 0) return;
      const rootFontPx =
        parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const speedPxPerSec = 72 * (rootFontPx / 16);
      track.style.setProperty('--ticker-shift', `${w}px`);
      track.style.setProperty(
        '--ticker-duration',
        `${Math.max(10, w / speedPxPerSec)}s`
      );
    };
    applyTickerGeometry();
    const resizeObserver =
      copy && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(applyTickerGeometry)
        : null;
    if (resizeObserver && copy) resizeObserver.observe(copy);

    return () => {
      resizeObserver?.disconnect();
    };
  }, [sceneFeed.textKey, variant, isFlipFeedActive]);

  const accentColor =
    isFlipFeedActive && flipFeed ? flipFeed.accentColor : sceneFeed.accentColor;
  const headerTitle =
    isFlipFeedActive && flipFeed ? flipFeed.headerTitle : sceneFeed.title;
  const headerTime =
    isFlipFeedActive && flipFeed ? flipFeed.headerTime : sceneFeed.timeLabel;

  if (variant === 'mobile') {
    return (
      <section
        aria-label="気象防災ライブフィード"
        data-testid="mobile-top-feed-bar"
        className="h-[58px] shrink-0 border-b-2 border-[#5A606D] bg-[#0B0D12] flex items-center overflow-hidden z-20 px-2.5 py-1"
      >
        <div className="flex-1 min-w-0 h-full flex flex-col justify-between overflow-hidden">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="w-1.5 h-3.5 rounded-xs shrink-0"
              style={{ backgroundColor: accentColor }}
            />
            <span className="text-[11px] font-black text-neutral-100 tracking-wider truncate">
              {headerTitle}
            </span>
            <div className="ml-auto shrink-0 flex items-center gap-1.5 font-mono text-[10px] text-neutral-300 whitespace-nowrap">
              <span className="whitespace-nowrap">{headerTime}</span>
              <span className="px-1 py-0.2 bg-[#1C2029] text-neutral-200 border border-neutral-700 rounded-xs text-[10px] font-sans font-bold whitespace-nowrap">
                気象庁発表
              </span>
              {isFlipFeedActive && flipFeed && flipFeed.cards.length > 1 && (
                <span className="px-1 py-0.2 bg-black/50 text-neutral-300 border border-neutral-700 rounded-xs text-[10px] font-mono font-bold whitespace-nowrap">
                  {safeFlipIndex + 1}/{flipFeed.cards.length}
                </span>
              )}
            </div>
          </div>

          {isFlipFeedActive && currentFlipCard ? (
            <div
              key={`mobile-flip-${safeFlipIndex}-${currentFlipCard.id}`}
              data-testid="mobile-flip-feed-card"
              className="flex-1 flex items-center min-w-0 animate-title-swap overflow-hidden"
            >
              <div className="flex items-center gap-2 w-full min-w-0">
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-black rounded-xs shrink-0 tracking-wide uppercase shadow-xs whitespace-nowrap ${currentFlipCard.badgeBg}`}
                >
                  {currentFlipCard.badge}
                </span>
                <div className="min-w-0 flex-1 truncate">
                  <span className="text-[14px] font-black text-white tracking-wide truncate block">
                    {currentFlipCard.mainText}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div
              data-testid="xml-ticker-scroll-container"
              className="ticker-viewport flex-1 flex items-center overflow-hidden whitespace-nowrap relative"
            >
              <div ref={tickerTrackRef} className="ticker-track">
                <div
                  ref={tickerFirstCopyRef}
                  className="inline-flex items-center gap-8 pr-8 text-[15px] font-bold text-white tracking-wide leading-none"
                >
                  {sceneFeed.items.map((item, idx) => (
                    <span
                      key={`mobile-feed-copy1-${idx}`}
                      className="inline-flex items-center gap-2 shrink-0"
                    >
                      {item.prefix && (
                        <span
                          className="font-extrabold"
                          style={{ color: sceneFeed.accentColor }}
                        >
                          {item.prefix}
                        </span>
                      )}
                      <span className="text-neutral-100">{item.text}</span>
                      <span
                        aria-hidden="true"
                        className="text-neutral-600 ml-2 font-normal"
                      >
                        ｜
                      </span>
                    </span>
                  ))}
                </div>
                <div
                  aria-hidden="true"
                  className="inline-flex items-center gap-8 pr-8 text-[15px] font-bold text-white tracking-wide leading-none"
                >
                  {sceneFeed.items.map((item, idx) => (
                    <span
                      key={`mobile-feed-copy2-${idx}`}
                      className="inline-flex items-center gap-2 shrink-0"
                    >
                      {item.prefix && (
                        <span
                          className="font-extrabold"
                          style={{ color: sceneFeed.accentColor }}
                        >
                          {item.prefix}
                        </span>
                      )}
                      <span className="text-neutral-100">{item.text}</span>
                      <span
                        aria-hidden="true"
                        className="text-neutral-600 ml-2 font-normal"
                      >
                        ｜
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <footer
      aria-label="気象防災ライブフィード"
      className="h-[5.25rem] shrink-0 border-t-2 border-[#5A606D] bg-[#0B0D12] flex items-center overflow-hidden animate-startup-bottom z-30 px-4 py-2"
    >
      <div className="flex-1 min-w-0 h-full flex flex-col justify-between overflow-hidden">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-1.5 h-4 rounded-xs shrink-0"
            style={{ backgroundColor: accentColor }}
          />
          <span className="text-sm md:text-[0.9375rem] font-black text-neutral-100 tracking-wider truncate">
            {headerTitle}
          </span>
          <div className="ml-auto shrink-0 flex items-center gap-2.5 font-mono text-xs text-neutral-300 whitespace-nowrap">
            <span className="whitespace-nowrap">{headerTime}</span>
            <span className="px-1.5 py-0.5 bg-[#1C2029] text-neutral-200 border border-neutral-700 rounded-xs text-[0.6875rem] font-sans font-bold whitespace-nowrap">
              気象庁発表
            </span>
            {isFlipFeedActive && flipFeed && flipFeed.cards.length > 1 && (
              <span className="px-1.5 py-0.5 bg-black/50 text-neutral-300 border border-neutral-700 rounded-xs text-[0.6875rem] font-mono font-bold whitespace-nowrap">
                {safeFlipIndex + 1}/{flipFeed.cards.length}
              </span>
            )}
          </div>
        </div>

        {isFlipFeedActive && currentFlipCard ? (
          <div
            key={`desktop-flip-${safeFlipIndex}-${currentFlipCard.id}`}
            data-testid="desktop-flip-feed-card"
            className="flex-1 flex items-center min-w-0 animate-title-swap overflow-hidden"
          >
            <div className="flex items-center gap-3 w-full min-w-0">
              <span
                className={`px-2.5 py-0.5 text-xs md:text-[0.8125rem] font-black rounded-xs shrink-0 tracking-wide uppercase shadow-xs whitespace-nowrap ${currentFlipCard.badgeBg}`}
              >
                {currentFlipCard.badge}
              </span>
              <div className="min-w-0 flex-1 flex items-baseline gap-3 truncate">
                <span className="text-[1.1875rem] md:text-[1.4375rem] font-black text-white tracking-wide truncate">
                  {currentFlipCard.mainText}
                </span>
                {currentFlipCard.subText && (
                  <span className="text-xs md:text-sm font-mono text-neutral-400 truncate">
                    {currentFlipCard.subText}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div
            data-testid="xml-ticker-scroll-container"
            className="ticker-viewport flex-1 flex items-center overflow-hidden whitespace-nowrap relative"
          >
            <div ref={tickerTrackRef} className="ticker-track">
              <div
                ref={tickerFirstCopyRef}
                className="inline-flex items-center gap-12 pr-12 text-[1.3125rem] md:text-[1.4375rem] font-bold text-white tracking-wide leading-none"
              >
                {sceneFeed.items.map((item, idx) => (
                  <span
                    key={`feed-item-copy1-${idx}`}
                    className="inline-flex items-center gap-2.5 shrink-0"
                  >
                    {item.prefix && (
                      <span
                        className="font-extrabold"
                        style={{ color: sceneFeed.accentColor }}
                      >
                        {item.prefix}
                      </span>
                    )}
                    <span className="text-neutral-100">{item.text}</span>
                    <span
                      aria-hidden="true"
                      className="text-neutral-600 ml-4 font-normal"
                    >
                      ｜
                    </span>
                  </span>
                ))}
              </div>
              <div
                aria-hidden="true"
                className="inline-flex items-center gap-12 pr-12 text-[1.3125rem] md:text-[1.4375rem] font-bold text-white tracking-wide leading-none"
              >
                {sceneFeed.items.map((item, idx) => (
                  <span
                    key={`feed-item-copy2-${idx}`}
                    className="inline-flex items-center gap-2.5 shrink-0"
                  >
                    {item.prefix && (
                      <span
                        className="font-extrabold"
                        style={{ color: sceneFeed.accentColor }}
                      >
                        {item.prefix}
                      </span>
                    )}
                    <span className="text-neutral-100">{item.text}</span>
                    <span
                      aria-hidden="true"
                      className="text-neutral-600 ml-4 font-normal"
                    >
                      ｜
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </footer>
  );
});

export default function App() {
  const [data, setData] = useState<MonitorDataBundle>(INITIAL_BUNDLE);
  // Start on 'warnings' so the NERV choropleth map is immediately visible, then rotate through normal loop scenes
  const [activeScene, setActiveScene] = useState<SceneId>('radar');
  // Normal loop includes radar, warnings, typhoon, amedas, forecast, earthquake
  const [enabledScenes, setEnabledScenes] = useState<SceneId[]>(
    () => DEFAULT_NORMAL_LOOP_SCENES
  );

  // Region selection: 'national' by default so the full Japan map is shown clearly
  const [regionScope, setRegionScope] = useState<'auto' | RegionId>('national');
  const [patrolRegionId, setPatrolRegionId] = useState<RegionId>('national');
  const [patrolStepIndex, setPatrolStepIndex] = useState<number>(0);
  // Warning patrol step: 0 = initial national view, 1..N = active 警報/特別警報 divisions (North->South), N+1 = final national view
  const [warningPatrolStep, setWarningPatrolStep] = useState<number>(0);
  // Typhoon patrol step: 0 = overview (all cyclones blocks), 1..M = single cyclone focus, M+1 = return to overview
  // When total typhoons <= 1, overview is never shown, start directly at step 1
  const [typhoonPatrolStep, setTyphoonPatrolStep] = useState<number>(
    INITIAL_TYPHOONS.length <= 1 ? 1 : 0
  );
  const [mapViewport, setMapViewport] = useState<MapViewportState | undefined>(
    undefined
  );

  // Loop timing controls (base hold duration for non-scrolling scenes)
  const [loopIntervalSec, setLoopIntervalSec] = useState<number>(15);
  const [isLoopPaused, setIsLoopPaused] = useState<boolean>(false);

  // Interrupt state ('none' | 'earthquake' | 'volcano' | 'tsunami' | 'typhoon')
  const [interruptKind, setInterruptKind] = useState<InterruptKind>('none');
  const [selectedEarthquake, setSelectedEarthquake] = useState<EarthquakeReport>(
    INITIAL_EARTHQUAKES[0]
  );
  // 手動で特定の地震が選択・固定されている場合の ID（自動巡回を停止して該当地震を保持）
  const [pinnedEarthquakeId, setPinnedEarthquakeId] = useState<string | null>(
    null
  );
  const pinnedEarthquakeIdRef = useRef<string | null>(null);

  const updatePinnedEarthquakeId = useCallback((id: string | null) => {
    pinnedEarthquakeIdRef.current = id;
    setPinnedEarthquakeId(id);
  }, []);
  const [selectedTyphoon, setSelectedTyphoon] = useState<TyphoonReport>(
    INITIAL_TYPHOONS[0]
  );
  const [activeVolcano, setActiveVolcano] = useState<VolcanoStatusItem>(
    INITIAL_VOLCANOES[0]
  );
  const [activeEew, setActiveEew] = useState<EewReport | null>(null);
  const [isTsunamiDemo, setIsTsunamiDemo] = useState<boolean>(false);
  const [amedasMetric, setAmedasMetric] = useState<AmedasMetric>('temp');
  const [forecastViewMode, setForecastViewMode] =
    useState<ForecastViewMode>('today_3h');
  const [forecast3hIndex, setForecast3hIndex] = useState<number>(() => {
    const h = new Date().getHours();
    return Math.min(7, Math.max(0, Math.floor(h / 3)));
  });
  const [eewDisplayMode, setEewDisplayMode] =
    useState<EewDisplayMode>('intensity');
  const eewDemoTimerRef = useRef<NodeJS.Timeout[]>([]);

  // XML Inspector & Settings Popup Modal state
  const [isXmlModalOpen, setIsXmlModalOpen] = useState<boolean>(false);
  const [modalInitialTab, setModalInitialTab] =
    useState<ModalTabMode>('settings');
  const [selectedXmlEntry, setSelectedXmlEntry] = useState<JmaXmlEntry | null>(
    INITIAL_XML_ENTRIES[0]
  );
  const [isRefreshingXml, setIsRefreshingXml] = useState<boolean>(false);

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Smartphone Portrait Layout detection & bottom dock controls
  const [viewportSize, setViewportSize] = useState<{
    width: number;
    height: number;
  }>(() => {
    if (typeof window === 'undefined') return { width: 1280, height: 720 };
    return { width: window.innerWidth, height: window.innerHeight };
  });
  const [isMobilePortrait, setIsMobilePortrait] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.innerWidth < 768 ||
      (window.innerWidth < 920 && window.innerHeight > window.innerWidth)
    );
  });
  const [mobileLayoutOverride, setMobileLayoutOverride] = useState<
    'auto' | 'mobile' | 'desktop'
  >('auto');
  const [mobileBottomTab, setMobileBottomTab] = useState<
    'detail' | 'earthquake' | 'xml'
  >('detail');
  const [isMobileDockExpanded, setIsMobileDockExpanded] =
    useState<boolean>(false);

  useEffect(() => {
    const checkViewport = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const isNarrowOrPortrait = w < 768 || (w < 920 && h > w);
      setIsMobilePortrait(isNarrowOrPortrait);
      setViewportSize((prev) =>
        prev.width === w && prev.height === h ? prev : { width: w, height: h }
      );
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  const effectiveMobilePortrait =
    mobileLayoutOverride === 'mobile'
      ? true
      : mobileLayoutOverride === 'desktop'
        ? false
        : isMobilePortrait;

  const uiScale = useMemo(
    () =>
      computeDesktopUiScale(
        viewportSize.width,
        viewportSize.height,
        effectiveMobilePortrait
      ),
    [viewportSize.width, viewportSize.height, effectiveMobilePortrait]
  );

  useLayoutEffect(() => {
    const root = document.documentElement;
    const fontSizePx = getRootFontSizePx(uiScale, effectiveMobilePortrait);
    root.style.fontSize = `${fontSizePx}px`;
    return () => {
      root.style.fontSize = '';
    };
  }, [uiScale, effectiveMobilePortrait]);

  const { fullUpdateDateText, compactUpdateDateText } = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const hm = data.lastXmlFetchTime
      ? data.lastXmlFetchTime.slice(0, 5)
      : `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return {
      fullUpdateDateText: `${yyyy}年${month}月${day}日 ${hm} 更新`,
      compactUpdateDateText: `${month}/${day} ${hm}更新`,
    };
  }, [data.lastXmlFetchTime]);

  const eqTrackerRef = useRef<EarthquakeTrackerState>(
    createInitialEarthquakeTrackerState()
  );
  // True while an active EEW or an unconfirmed earthquake (震度速報 / 震源情報) is unfolding;
  // locks the monitor onto the 'earthquake' scene until the final confirmed report (各地の震度に関する情報) arrives!
  const eqLockUntilConfirmedRef = useRef<boolean>(false);
  const eqUnconfirmedTimedOutRef = useRef<boolean>(false);
  const eqConfirmedHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const latestVolcanoXmlIdRef = useRef<string>('');
  const [flipSessionNonce, setFlipSessionNonce] = useState<number>(0);

  // Refs synced in render/effect so callbacks passed to memoized children & WS effects stay 100% stable
  const activeEewRef = useRef<EewReport | null>(activeEew);
  activeEewRef.current = activeEew;
  const interruptKindRef = useRef<InterruptKind>(interruptKind);
  interruptKindRef.current = interruptKind;
  const selectedEarthquakeRef = useRef<EarthquakeReport>(selectedEarthquake);
  selectedEarthquakeRef.current = selectedEarthquake;
  const typhoonsRef = useRef<TyphoonReport[]>(data.typhoons);
  typhoonsRef.current = data.typhoons;
  const tsunamiSeverityRef = useRef<'none' | 'forecast' | 'warning_or_above'>(
    'none'
  );
  const prevTsunamiSeverityRef = useRef<'none' | 'forecast' | 'warning_or_above'>(
    'none'
  );

  // Unified handler for incoming EEW (緊急地震速報 予報・警報・発表検出)
  const handleIncomingEew = useCallback((eew: EewReport) => {
    setActiveEew((prev) => {
      if (shouldReplaceEew(prev, eew)) {
        return eew;
      }
      return prev;
    });
    if (!eew.isCancelled) {
      eqLockUntilConfirmedRef.current = true;
      eqUnconfirmedTimedOutRef.current = false;
      if (eqConfirmedHoldTimerRef.current) {
        clearTimeout(eqConfirmedHoldTimerRef.current);
        eqConfirmedHoldTimerRef.current = null;
      }
      setEewDisplayMode('intensity');
      if (tsunamiSeverityRef.current === 'warning_or_above') {
        setActiveScene('tsunami');
      }
      setInterruptKind((prev) =>
        resolveInterruptKindOnEew(prev, tsunamiSeverityRef.current)
      );
    }
  }, []);

  // Unified handler for earthquake list updates (JMA bosai + P2P 551):
  // Immediately interrupts onto 'earthquake' when a newly arrived quake (with or without EEW)
  // or progressive report upgrade arrives, locks while unconfirmed, and returns after 2 bottom-bar loops once confirmed.
  const applyEarthquakeListUpdate = useCallback(
    (
      rawList: EarthquakeReport[],
      options?: { isLive?: boolean; isRealtimePush?: boolean }
    ) => {
      if (!rawList || rawList.length === 0) return;
      const merged = mergeProgressiveEarthquakeReports(rawList);
      if (merged.length === 0) return;

      const isLive = options?.isLive ?? true;
      const isRealtimePush = options?.isRealtimePush ?? false;
      const isTsunamiWarningActive =
        tsunamiSeverityRef.current === 'warning_or_above';

      const action = evaluateIncomingEarthquakeUpdate({
        mergedList: merged,
        tracker: eqTrackerRef.current,
        nowMs: Date.now(),
        isLive,
        isRealtimePush,
        isTsunamiWarningActive,
        currentInterruptKind: interruptKindRef.current,
      });

      eqTrackerRef.current = action.nextTracker;

      if (action.type === 'noop') {
        return;
      }

      if (action.type === 'silent_sync') {
        setSelectedEarthquake((prev) => {
          if (prev.isTest) return prev;
          // ユーザーが手動で特定の地震を選択・固定している場合は勝手に最新に書き換えない
          if (pinnedEarthquakeIdRef.current) {
            const matched = merged.find(
              (e) => e.id === pinnedEarthquakeIdRef.current
            );
            return matched || prev;
          }
          if (
            prev.id === action.selectedEarthquake.id &&
            prev.reportKey === action.selectedEarthquake.reportKey
          ) {
            return prev;
          }
          return action.selectedEarthquake;
        });
        return;
      }

      // If patrol was paused only because a historical quake was pinned, clear pin & resume
      // so the newly arrived earthquake interrupt can auto-return after 2 bottom-bar loops.
      if (pinnedEarthquakeIdRef.current) {
        setIsLoopPaused(false);
      }
      updatePinnedEarthquakeId(null);
      setSelectedEarthquake(action.selectedEarthquake);
      eqUnconfirmedTimedOutRef.current = false;

      if (action.type === 'interrupt_unconfirmed') {
        // Interim report (震度速報 / 震源に関する情報 / 震源・震度に関する情報):
        // Keep locked on 'earthquake' tab until confirmed report arrives (5-min safety cap if feed stalls).
        eqLockUntilConfirmedRef.current = true;
        if (eqConfirmedHoldTimerRef.current) {
          clearTimeout(eqConfirmedHoldTimerRef.current);
        }
        eqConfirmedHoldTimerRef.current = setTimeout(() => {
          eqConfirmedHoldTimerRef.current = null;
          eqLockUntilConfirmedRef.current = false;
          eqUnconfirmedTimedOutRef.current = true;
          setFlipSessionNonce((n) => n + 1);
        }, 5 * 60 * 1000);

        setInterruptKind((prev) =>
          prev === 'tsunami' && tsunamiSeverityRef.current === 'warning_or_above'
            ? 'tsunami'
            : prev === 'eew' && isEewStillActive(activeEewRef.current)
              ? 'eew'
              : 'earthquake'
        );
        if (action.resetFlipLoop) {
          setFlipSessionNonce((n) => n + 1);
        }
      } else {
        // Confirmed earthquake report (including non-EEW earthquakes):
        // Release unconfirmed lock and let the bottom flip bar play 2 full loops before returning.
        eqLockUntilConfirmedRef.current = false;
        if (eqConfirmedHoldTimerRef.current) {
          clearTimeout(eqConfirmedHoldTimerRef.current);
          eqConfirmedHoldTimerRef.current = null;
        }
        setInterruptKind((prev) =>
          prev === 'tsunami' && tsunamiSeverityRef.current === 'warning_or_above'
            ? 'tsunami'
            : prev === 'eew' && isEewStillActive(activeEewRef.current)
              ? 'eew'
              : 'earthquake'
        );
        if (action.resetFlipLoop) {
          setFlipSessionNonce((n) => n + 1);
        }
      }
    },
    [updatePinnedEarthquakeId]
  );

  // Automatically clear expired EEW state so non-EEW/confirmed earthquakes or normal loop can resume cleanly
  useEffect(() => {
    if (!activeEew) return;
    const holdMs = activeEew.isCancelled ? 15 * 1000 : EEW_DISPLAY_HOLD_MS;
    const remainingMs = Math.max(
      0,
      holdMs - (Date.now() - activeEew.receivedAtMs)
    );
    const timer = setTimeout(() => {
      setActiveEew(null);
      setFlipSessionNonce((n) => n + 1);
      setInterruptKind((prev) => {
        if (prev !== 'eew') return prev;
        if (
          eqLockUntilConfirmedRef.current ||
          (!eqUnconfirmedTimedOutRef.current &&
            isEarthquakeAwaitingDetail(selectedEarthquakeRef.current))
        ) {
          return 'earthquake';
        }
        return 'none';
      });
    }, remainingMs);
    return () => clearTimeout(timer);
  }, [activeEew]);

  // Fast 10-second background poll specifically for EEW (Wolfx + P2P 556) & Earthquake (JMA + P2P 551)
  const pollFastEarthquakeAndEew = useCallback(async () => {
    try {
      const [liveEew, eqRes] = await Promise.all([
        fetchLatestLiveEew(),
        fetchRecentEarthquakes(),
      ]);
      if (liveEew && isEewStillActive(liveEew)) {
        handleIncomingEew(liveEew);
      }
      if (eqRes.live && eqRes.earthquakes.length > 0) {
        setData((prev) => {
          if (
            prev.dataSourceStatus.p2pQuakeLive &&
            areEarthquakeListsEquivalent(prev.earthquakes, eqRes.earthquakes)
          ) {
            return prev;
          }
          return {
            ...prev,
            earthquakes: eqRes.earthquakes,
            dataSourceStatus: {
              ...prev.dataSourceStatus,
              p2pQuakeLive: true,
            },
          };
        });
        applyEarthquakeListUpdate(eqRes.earthquakes, {
          isLive: true,
          isRealtimePush: false,
        });
      }
    } catch {
      // Ignore fast poll network errors
    }
  }, [applyEarthquakeListUpdate, handleIncomingEew]);

  // Full JMA XML & JSON bundle fetch (on mount + every 1 minute)
  const refreshJmaData = useCallback(async () => {
    setIsRefreshingXml(true);
    try {
      const [bundle, liveEew] = await Promise.all([
        fetchMonitorDataBundle(),
        fetchLatestLiveEew(),
      ]);
      let nextEarthquakesForDecision = bundle.earthquakes;
      setData((prev) => {
        const prevLiveEq = prev.dataSourceStatus.p2pQuakeLive
          ? prev.earthquakes
          : [];
        const mergedEq =
          prevLiveEq.length > 0 && bundle.dataSourceStatus.p2pQuakeLive
            ? mergeProgressiveEarthquakeReports([
                ...bundle.earthquakes,
                ...prevLiveEq,
              ]).slice(0, 20)
            : bundle.earthquakes;
        nextEarthquakesForDecision = mergedEq;
        const nextEq = areEarthquakeListsEquivalent(prev.earthquakes, mergedEq)
          ? prev.earthquakes
          : mergedEq;
        return {
          ...bundle,
          earthquakes: nextEq,
          ...(isTsunamiDemoRef.current && prev.tsunamiForecast?.source === 'demo'
            ? { tsunamiForecast: prev.tsunamiForecast }
            : {}),
        };
      });

      if (liveEew && isEewStillActive(liveEew)) {
        handleIncomingEew(liveEew);
      }

      // 0. Sync live typhoon selection
      if (bundle.typhoons.length > 0) {
        setSelectedTyphoon((prev) => {
          const found = bundle.typhoons.find((t) => t.id === prev.id);
          return found || bundle.typhoons[0];
        });
      }

      // 1. Check for new or upgraded earthquake report
      if (nextEarthquakesForDecision.length > 0) {
        applyEarthquakeListUpdate(nextEarthquakesForDecision, {
          isLive: bundle.dataSourceStatus.p2pQuakeLive,
          isRealtimePush: false,
        });
      }

      // 2. Check for Volcano Alert Level change in eqvol.xml
      const volcanoLevelXml = bundle.xmlEntries.find(
        (e) =>
          e.category === 'volcano' &&
          (e.title.includes('噴火警報') ||
            e.title.includes('火口周辺警報') ||
            e.content.includes('引き上げ') ||
            e.content.includes('レベル変更'))
      );
      if (
        volcanoLevelXml &&
        latestVolcanoXmlIdRef.current &&
        volcanoLevelXml.id !== latestVolcanoXmlIdRef.current
      ) {
        latestVolcanoXmlIdRef.current = volcanoLevelXml.id;
        setActiveVolcano(TEST_VOLCANO_LEVEL_CHANGE);
        setInterruptKind('volcano');
      } else if (volcanoLevelXml && !latestVolcanoXmlIdRef.current) {
        latestVolcanoXmlIdRef.current = volcanoLevelXml.id;
      }
    } finally {
      setIsRefreshingXml(false);
    }
  }, [applyEarthquakeListUpdate, handleIncomingEew]);

  useEffect(() => {
    refreshJmaData();
    const pollTimer = setInterval(refreshJmaData, 60000);
    const fastEqTimer = setInterval(pollFastEarthquakeAndEew, 10000);
    return () => {
      clearInterval(pollTimer);
      clearInterval(fastEqTimer);
    };
  }, [refreshJmaData, pollFastEarthquakeAndEew]);

  // Subscribe to BOTH P2PQuake WebSocket (`wss://api.p2pquake.net/v2/ws`) AND Wolfx JMA EEW WebSocket (`wss://ws-api.wolfx.jp/jma_eew`)
  // with automatic reconnection for real-time push delivery of EEW (Forecast & Warning), Earthquake, and Tsunami reports
  useEffect(() => {
    let p2pWs: WebSocket | null = null;
    let p2pReconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    const connectP2p = () => {
      if (unmounted) return;
      try {
        p2pWs = new WebSocket('wss://api.p2pquake.net/v2/ws');
        p2pWs.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (!payload || typeof payload.code !== 'number') return;

            // 1. EEW Warning (緊急地震速報（警報） code: 556)
            if (payload.code === 556) {
              const eew = parseP2PEew(payload);
              if (eew) {
                handleIncomingEew(eew);
                pollFastEarthquakeAndEew();
              }
            }
            // 2. EEW Announcement Detection (緊急地震速報 発表検出 code: 554)
            else if (payload.code === 554) {
              const det = parseP2PEewDetection(payload);
              if (det) {
                handleIncomingEew(det);
              } else {
                eqLockUntilConfirmedRef.current = true;
                setInterruptKind((prev) =>
                  resolveInterruptKindOnEew(prev, tsunamiSeverityRef.current)
                );
              }
              pollFastEarthquakeAndEew();
            }
            // 3. Tsunami forecast (津波予報 code: 552)
            else if (payload.code === 552) {
              const tsunami = parseP2PTsunami(payload);
              if (tsunami) {
                setData((prev) => ({
                  ...prev,
                  tsunamiForecast: tsunami,
                }));
                const sev = getTsunamiAlertSeverity(tsunami);
                if (sev === 'warning_or_above') {
                  setActiveScene('tsunami');
                  setInterruptKind((prev) =>
                    resolveInterruptKindOnTsunami(prev, sev, true)
                  );
                }
              }
            }
            // 4. Earthquake report (震度速報 / 震源に関する情報 / 各地の震度に関する情報 code: 551)
            else if (payload.code === 551) {
              const report = convertP2PQuakeItem(payload);
              if (report) {
                setData((prev) => {
                  const basePrev = prev.dataSourceStatus.p2pQuakeLive
                    ? prev.earthquakes
                    : [];
                  const nextList = mergeProgressiveEarthquakeReports([
                    report,
                    ...basePrev,
                  ]).slice(0, 20);
                  queueMicrotask(() =>
                    applyEarthquakeListUpdate(nextList, {
                      isLive: true,
                      isRealtimePush: true,
                    })
                  );
                  return {
                    ...prev,
                    earthquakes: nextList,
                    dataSourceStatus: {
                      ...prev.dataSourceStatus,
                      p2pQuakeLive: true,
                    },
                  };
                });
                // Also fetch JMA bosai detail JSON shortly after for exact station lat/lon coordinates
                setTimeout(() => {
                  if (!unmounted) pollFastEarthquakeAndEew();
                }, 1500);
              }
            }
          } catch {
            // Ignore malformed WS message
          }
        };
        p2pWs.onclose = () => {
          if (!unmounted) {
            p2pReconnectTimer = setTimeout(connectP2p, 3500);
          }
        };
        p2pWs.onerror = () => {
          try {
            p2pWs?.close();
          } catch {
            // ignore
          }
        };
      } catch {
        if (!unmounted) {
          p2pReconnectTimer = setTimeout(connectP2p, 5000);
        }
      }
    };

    connectP2p();

    // Resilient Wolfx client: connects to WebSocket, sends query on open,
    // sends ping keepalives, and automatically runs fallback HTTP polling if WS is blocked/down.
    const stopWolfx = connectWolfxEewSocket({
      onMessage: (payload) => {
        if (unmounted) return;
        const eew = parseWolfxEew(payload, Date.now());
        if (eew && isEewStillActive(eew)) {
          handleIncomingEew(eew);
          pollFastEarthquakeAndEew();
        }
      },
    });

    return () => {
      unmounted = true;
      if (p2pReconnectTimer) clearTimeout(p2pReconnectTimer);
      if (p2pWs && p2pWs.readyState <= 1) {
        p2pWs.close();
      }
      stopWolfx();
    };
  }, [applyEarthquakeListUpdate, handleIncomingEew, pollFastEarthquakeAndEew]);

  // Divisions (out of the 57 JMA divisions) that currently have 警報 (warning) or 特別警報 (special), ordered North to South
  const severeWarningDivisions = useMemo(
    () => getActiveSevereWarningDivisions(data.warnings),
    [data.warnings]
  );

  const activeWarningDivision = useMemo(() => {
    if (
      activeScene === 'warnings' &&
      (regionScope === 'national' || regionScope === 'auto') &&
      warningPatrolStep >= 1 &&
      warningPatrolStep <= severeWarningDivisions.length
    ) {
      return severeWarningDivisions[warningPatrolStep - 1];
    }
    return null;
  }, [
    activeScene,
    regionScope,
    warningPatrolStep,
    severeWarningDivisions,
  ]);

  const isFinalWarningNational =
    activeScene === 'warnings' &&
    (regionScope === 'national' || regionScope === 'auto') &&
    severeWarningDivisions.length > 0 &&
    warningPatrolStep === severeWarningDivisions.length + 1;

  // Dynamic Tsunami Alert Severity: 'none' | 'forecast' | 'warning_or_above'
  const tsunamiSeverity = useMemo(
    () => getTsunamiAlertSeverity(data.tsunamiForecast),
    [data.tsunamiForecast]
  );
  tsunamiSeverityRef.current = tsunamiSeverity;

  // When Tsunami Forecast ('forecast' / 若干の海面変動) is active, dynamically include 'tsunami' in the normal loop.
  // Order: ... -> forecast -> earthquake -> tsunami -> radar -> ...
  // When 'warning_or_above' is active, scenes are restricted so it continuously locks onto 'tsunami'.
  // When 'none', tsunami is excluded from the automated normal loop.
  const effectiveEnabledScenes = useMemo<SceneId[]>(() => {
    if (tsunamiSeverity === 'warning_or_above') {
      return ['tsunami'];
    }
    if (tsunamiSeverity === 'forecast') {
      if (enabledScenes.includes('tsunami')) {
        return enabledScenes;
      }
      // Insert tsunami right after earthquake (or at the end so it advances to radar)
      const eqIdx = enabledScenes.indexOf('earthquake');
      if (eqIdx !== -1) {
        const next = [...enabledScenes];
        next.splice(eqIdx + 1, 0, 'tsunami');
        return next;
      }
      return [...enabledScenes, 'tsunami'];
    }
    // 'none': do not include tsunami in normal automatic loop unless explicitly forced
    return enabledScenes.filter((s) => s !== 'tsunami');
  }, [enabledScenes, tsunamiSeverity]);

  // If a Tsunami Warning or Major Warning or Advisory is active, continuously lock onto the tsunami scene until cancelled!
  // If an EEW or earthquake interrupt is currently active, switch to 'tsunami' priority while preserving activeEew (P/S waves).
  // When tsunami warning is cancelled, release 'tsunami' interrupt back to active EEW (if still active) or normal patrol.
  useEffect(() => {
    const prevSeverity = prevTsunamiSeverityRef.current;
    prevTsunamiSeverityRef.current = tsunamiSeverity;
    const isEewLiveNow = Boolean(
      activeEewRef.current && isEewStillActive(activeEewRef.current)
    );

    if (tsunamiSeverity === 'warning_or_above') {
      setActiveScene('tsunami');
      setInterruptKind((prev) =>
        resolveInterruptKindOnTsunamiChange(
          prev,
          prevSeverity,
          tsunamiSeverity,
          isEewLiveNow
        )
      );
    } else if (prevSeverity === 'warning_or_above') {
      setInterruptKind((prev) =>
        resolveInterruptKindOnTsunamiChange(
          prev,
          prevSeverity,
          tsunamiSeverity,
          isEewLiveNow
        )
      );
      if (tsunamiSeverity === 'none') {
        setActiveScene((prev) =>
          prev === 'tsunami'
            ? getNextSceneId('tsunami', effectiveEnabledScenes)
            : prev
        );
      }
    }
  }, [tsunamiSeverity, effectiveEnabledScenes]);

  // Step to next scene in the normal loop:
  // 1. In `'warnings'` (`regionScope === 'national' || 'auto'`), start at 全国表示, then zoom ONLY into divisions with 警報/特別警報 (`severeWarningDivisions`), return to 全国表示, then advance to next scene.
  // 2. When `regionScope === 'auto'` on `forecast` or `weather_info`, step North-to-South before advancing.
  // 3. When in `'typhoon'` and multiple typhoons/TDs/extratropical cyclones exist, automatically cycle through all of them in the right panel.
  // 4. When in `'amedas'`, step through `'temp' -> 'precip' -> 'wind' (-> 'snow')` (each metric performs 全国表示 -> 北海道〜沖縄連続スイープ -> 全国表示 in MonitorMap) before moving to the next scene.
  // 5. If a Tsunami Warning/Advisory is active ('warning_or_above'), lock onto the tsunami scene continuously until cancelled.
  const advanceScene = useCallback(() => {
    // While a Tsunami warning, EEW/earthquake interrupt, or unconfirmed detail lock is active,
    // keep the current interrupt active without overwriting `activeScene`.
    if (
      shouldBlockNormalPatrolAdvance({
        tsunamiSeverity,
        eqLockUntilConfirmed: eqLockUntilConfirmedRef.current,
        interruptKind,
        isEewActive: Boolean(activeEew && isEewStillActive(activeEew)),
      })
    ) {
      return;
    }

    if (
      activeScene === 'warnings' &&
      (regionScope === 'national' || regionScope === 'auto')
    ) {
      if (
        severeWarningDivisions.length > 0 &&
        warningPatrolStep <= severeWarningDivisions.length
      ) {
        setWarningPatrolStep((prev) => prev + 1);
        return;
      }
      setWarningPatrolStep(0);
    }

    const isRegionalPatrolScene = activeScene === 'weather_info';

    if (regionScope === 'auto' && isRegionalPatrolScene) {
      const { nextStepIndex, regionId, completedCycle } =
        getNextPatrolStep(patrolStepIndex);
      if (!completedCycle) {
        setPatrolStepIndex(nextStepIndex);
        setPatrolRegionId(regionId);
        return;
      }
      setPatrolStepIndex(0);
      setPatrolRegionId('national');
    }

    if (activeScene === 'forecast') {
      // Step through the 3 TV broadcast forecast views on the nationwide map:
      // 1. 'today_3h' (今日の3時間ごとのこれからの天気)
      // 2. 'tomorrow' (明日の天気)
      // 3. 'day_after' (明後日の天気) -> then advance to next scene
      if (forecastViewMode === 'today_3h') {
        setForecastViewMode('tomorrow');
        return;
      }
      if (forecastViewMode === 'tomorrow') {
        setForecastViewMode('day_after');
        return;
      }
      setForecastViewMode('today_3h');
      setForecast3hIndex(0);
    }

    if (activeScene === 'typhoon') {
      const totalTyphoons = data.typhoons.length > 0 ? data.typhoons.length : 1;
      // Step 0: Overview (all cyclones in blocks, no forecasts) - only when totalTyphoons > 1
      // Step 1..totalTyphoons: Single cyclone detail (header pinned + forecast timeline with ↓ arrows)
      // Step totalTyphoons + 1: Return to overview (all cyclones in blocks again)
      if (totalTyphoons > 1 && typhoonPatrolStep <= totalTyphoons) {
        const nextStep = typhoonPatrolStep + 1;
        setTyphoonPatrolStep(nextStep);
        if (nextStep >= 1 && nextStep <= totalTyphoons) {
          const nextTc = data.typhoons[nextStep - 1] || data.typhoons[0];
          if (nextTc) setSelectedTyphoon(nextTc);
        }
        return;
      }
      setTyphoonPatrolStep(totalTyphoons <= 1 ? 1 : 0);
    }

    if (activeScene === 'amedas') {
      const nextMetric = getNextAmedasMetric(amedasMetric, data.amedas);
      if (nextMetric) {
        setAmedasMetric(nextMetric);
        return;
      }
      setAmedasMetric('temp');
    }

    setActiveScene((prevScene) => {
      const nextScene = getNextSceneId(prevScene, effectiveEnabledScenes);
      if (nextScene === 'warnings') {
        setWarningPatrolStep(0);
      }
      if (nextScene === 'amedas') {
        setAmedasMetric('temp');
      }
      if (nextScene === 'forecast') {
        setForecastViewMode('today_3h');
        setForecast3hIndex(0);
      }
      if (nextScene === 'typhoon') {
        const totalTyphoons = data.typhoons.length > 0 ? data.typhoons.length : 1;
        setTyphoonPatrolStep(totalTyphoons <= 1 ? 1 : 0);
        if (data.typhoons.length > 0) {
          setSelectedTyphoon(data.typhoons[0]);
        }
      }
      if (regionScope === 'auto') {
        setPatrolStepIndex(0);
        setPatrolRegionId('national');
      }
      return nextScene;
    });
  }, [
    activeScene,
    activeEew,
    amedasMetric,
    forecastViewMode,
    data.amedas,
    data.typhoons,
    interruptKind,
    typhoonPatrolStep,
    effectiveEnabledScenes,
    regionScope,
    patrolStepIndex,
    severeWarningDivisions.length,
    warningPatrolStep,
    tsunamiSeverity,
  ]);

  const advanceSceneRef = useRef(advanceScene);
  advanceSceneRef.current = advanceScene;
  const advanceSceneStable = useCallback(() => {
    advanceSceneRef.current();
  }, []);

  const isTsunamiDemoRef = useRef<boolean>(isTsunamiDemo);
  isTsunamiDemoRef.current = isTsunamiDemo;

  const clearEewDemoTimers = useCallback(() => {
    eewDemoTimerRef.current.forEach((t) => clearTimeout(t));
    eewDemoTimerRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      clearEewDemoTimers();
    };
  }, [clearEewDemoTimers]);

  const handleSelectSceneManual = useCallback(
    (sceneId: SceneId) => {
      clearEewDemoTimers();
      if (activeEewRef.current?.isDemo) {
        setActiveEew(null);
      }
      eqLockUntilConfirmedRef.current = false;
      eqUnconfirmedTimedOutRef.current = false;
      if (eqConfirmedHoldTimerRef.current) {
        clearTimeout(eqConfirmedHoldTimerRef.current);
        eqConfirmedHoldTimerRef.current = null;
      }
      setInterruptKind('none');
      setWarningPatrolStep(0);
      const totalTyphoons =
        typhoonsRef.current.length > 0 ? typhoonsRef.current.length : 1;
      setTyphoonPatrolStep(totalTyphoons <= 1 ? 1 : 0);
      if (sceneId === 'amedas') {
        setAmedasMetric('temp');
      }
      if (sceneId === 'forecast') {
        setForecastViewMode('today_3h');
        setForecast3hIndex(0);
      }
      if (sceneId === 'typhoon' && typhoonsRef.current.length > 0) {
        setSelectedTyphoon(typhoonsRef.current[0]);
      }
      if (regionScope === 'auto') {
        setPatrolStepIndex(0);
        setPatrolRegionId('national');
      }
      setActiveScene(sceneId);
    },
    [clearEewDemoTimers, regionScope]
  );

  const handleChangeForecastViewMode = useCallback((mode: ForecastViewMode) => {
    setForecastViewMode(mode);
    if (mode === 'today_3h') {
      setForecast3hIndex(0);
    }
  }, []);

  const clearDemoTsunamiIfActive = useCallback(() => {
    if (isTsunamiDemoRef.current) {
      setIsTsunamiDemo(false);
      setData((d) =>
        d.tsunamiForecast?.source === 'demo'
          ? { ...d, tsunamiForecast: INITIAL_TSUNAMI_FORECAST }
          : d
      );
    }
  }, []);

  // Test Interrupt 1: Earthquake (returns cleanly after 2 loops of the bottom info bar)
  const handleTriggerTestEarthquake = useCallback(() => {
    clearEewDemoTimers();
    setActiveEew(null);
    clearDemoTsunamiIfActive();
    eqLockUntilConfirmedRef.current = false;
    eqUnconfirmedTimedOutRef.current = false;
    if (eqConfirmedHoldTimerRef.current) {
      clearTimeout(eqConfirmedHoldTimerRef.current);
      eqConfirmedHoldTimerRef.current = null;
    }
    updatePinnedEarthquakeId(null);
    setIsLoopPaused(false);
    setSelectedEarthquake(TEST_INTERRUPT_EARTHQUAKE);
    setInterruptKind('earthquake');
    setFlipSessionNonce((n) => n + 1);
  }, [clearDemoTsunamiIfActive, clearEewDemoTimers, updatePinnedEarthquakeId]);

  const formatJstStamp = useCallback((ms: number): string => {
    const d = new Date(ms + 9 * 3600 * 1000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd} ${hh}:${mi}:${ss}`;
  }, []);

  const stampDemoEewTimestamps = useCallback(
    (base: EewReport, liveOriginMs: number, nowMs: number): EewReport => {
      const origMs = parseJstDateTimeMs(base.originTime);
      return {
        ...base,
        originTime: formatJstStamp(liveOriginMs),
        issueTime: formatJstStamp(nowMs),
        areas: base.areas.map((a) => {
          if (!a.arrivalTime || Number.isNaN(origMs)) return a;
          const arrMs = parseJstDateTimeMs(a.arrivalTime);
          if (Number.isNaN(arrMs)) return a;
          return {
            ...a,
            arrivalTime: formatJstStamp(liveOriginMs + (arrMs - origMs)),
          };
        }),
        receivedAtMs: nowMs,
      };
    },
    [formatJstStamp]
  );

  const stampDemoTsunamiTimestamps = useCallback(
    (
      base: TsunamiForecastReport,
      liveOriginMs: number,
      nowMs: number
    ): TsunamiForecastReport => {
      const origMs = parseJstDateTimeMs(base.occurrenceTime || base.issueTime);
      return {
        ...base,
        occurrenceTime: formatJstStamp(liveOriginMs),
        issueTime: formatJstStamp(nowMs),
        validUntil: formatJstStamp(nowMs + 12 * 3600 * 1000),
        areas: base.areas.map((a) => {
          if (!a.arrivalTime || Number.isNaN(origMs)) return a;
          const arrMs = parseJstDateTimeMs(a.arrivalTime);
          if (Number.isNaN(arrMs)) return a;
          const nextArrival = formatJstStamp(liveOriginMs + (arrMs - origMs));
          const nextFirstHeightText = a.firstHeightText.includes('到達予想')
            ? `${formatJstHms(nextArrival).slice(0, 5)} 到達予想`
            : a.firstHeightText;
          return {
            ...a,
            arrivalTime: nextArrival,
            firstHeightText: nextFirstHeightText,
          };
        }),
      };
    },
    [formatJstStamp]
  );

  const stampDemoEarthquakeTimestamps = useCallback(
    (
      base: EarthquakeReport,
      liveOriginMs: number,
      nowMs: number
    ): EarthquakeReport => ({
      ...base,
      occurrenceTime: `${formatJstStamp(liveOriginMs)} 頃発生`,
      issueTime: `${formatJstStamp(nowMs)} 発表`,
    }),
    [formatJstStamp]
  );

  // Test Interrupt 1-b: EEW 警報デモ (第1報: 長周期なし -> 第3報: 階級3 -> 最終報: 階級4)
  const handleTriggerEewDemo = useCallback(() => {
    clearEewDemoTimers();
    clearDemoTsunamiIfActive();
    eqLockUntilConfirmedRef.current = false;
    eqUnconfirmedTimedOutRef.current = false;
    if (eqConfirmedHoldTimerRef.current) {
      clearTimeout(eqConfirmedHoldTimerRef.current);
      eqConfirmedHoldTimerRef.current = null;
    }
    if (selectedEarthquakeRef.current?.isTest && sortedEarthquakesRef.current.length > 0) {
      setSelectedEarthquake(sortedEarthquakesRef.current[0]);
    }

    const baseOriginMs = Date.now() - 2000;
    // Step 1: 第1報（M5.9 震度5強以上・長周期予測なし）
    const r1 = stampDemoEewTimestamps(TEST_EEW_REPORTS[0], baseOriginMs, Date.now());
    setEewDisplayMode('intensity');
    setActiveEew(r1);
    setInterruptKind('eew');
    setFlipSessionNonce((n) => n + 1);

    // Step 2: 第3報（M6.8 震度6強・長周期階級3あり） - 4秒後
    const t1 = setTimeout(() => {
      const r2 = stampDemoEewTimestamps(TEST_EEW_REPORTS[1], baseOriginMs, Date.now());
      setActiveEew(r2);
    }, 4000);
    eewDemoTimerRef.current.push(t1);

    // Step 3: 最終報（M7.6 震度7・長周期階級4あり） - 8秒後
    const t2 = setTimeout(() => {
      const r3 = stampDemoEewTimestamps(TEST_EEW_REPORTS[2], baseOriginMs, Date.now());
      setActiveEew(r3);
    }, 8000);
    eewDemoTimerRef.current.push(t2);
  }, [clearDemoTsunamiIfActive, clearEewDemoTimers, stampDemoEewTimestamps]);

  // Test Interrupt 1-c: EEW 予報デモ (長周期地震動なし・警報地域なし・深さ50km P/S波)
  const handleTriggerEewForecastDemo = useCallback(() => {
    clearEewDemoTimers();
    clearDemoTsunamiIfActive();
    eqLockUntilConfirmedRef.current = false;
    eqUnconfirmedTimedOutRef.current = false;
    if (eqConfirmedHoldTimerRef.current) {
      clearTimeout(eqConfirmedHoldTimerRef.current);
      eqConfirmedHoldTimerRef.current = null;
    }
    const nowMs = Date.now();
    const rForecast = stampDemoEewTimestamps(
      TEST_EEW_FORECAST_REPORT,
      nowMs - 2000,
      nowMs
    );
    setEewDisplayMode('intensity');
    setActiveEew(rForecast);
    setInterruptKind('eew');
    setFlipSessionNonce((n) => n + 1);
  }, [clearDemoTsunamiIfActive, clearEewDemoTimers, stampDemoEewTimestamps]);

  // Test Interrupt 1-d: EEW → 津波連動デモ (0s警報 → 4s特別警報 → 8s最終報+震度観測同期 → 12s大津波警報)
  const handleTriggerEewToTsunamiDemo = useCallback(() => {
    clearEewDemoTimers();
    clearDemoTsunamiIfActive();
    eqLockUntilConfirmedRef.current = false;
    eqUnconfirmedTimedOutRef.current = false;
    if (eqConfirmedHoldTimerRef.current) {
      clearTimeout(eqConfirmedHoldTimerRef.current);
      eqConfirmedHoldTimerRef.current = null;
    }
    updatePinnedEarthquakeId(null);
    setIsLoopPaused(false);
    if (selectedEarthquakeRef.current?.isTest && sortedEarthquakesRef.current.length > 0) {
      setSelectedEarthquake(sortedEarthquakesRef.current[0]);
    }

    const baseOriginMs = Date.now() - 2000;

    // t = 0s: 緊急地震速報（警報）第1報 (M5.9 震度5強以上 — 赤黒斜線)
    const r1 = stampDemoEewTimestamps(TEST_EEW_REPORTS[0], baseOriginMs, Date.now());
    setEewDisplayMode('intensity');
    setActiveEew(r1);
    setInterruptKind('eew');
    setFlipSessionNonce((n) => n + 1);

    // t = 4s: 緊急地震速報（特別警報）第3報 (M6.8 震度6強・長周期階級3 — 紫黒斜線)
    const t1 = setTimeout(() => {
      const r2 = stampDemoEewTimestamps(TEST_EEW_REPORTS[1], baseOriginMs, Date.now());
      setActiveEew(r2);
    }, 4000);
    eewDemoTimerRef.current.push(t1);

    // t = 8s: 緊急地震速報（特別警報）最終報 (M7.6 震度7・階級4) + 各地の震度/震源確定同期
    const t2 = setTimeout(() => {
      const nowMs = Date.now();
      const r3 = stampDemoEewTimestamps(TEST_EEW_REPORTS[2], baseOriginMs, nowMs);
      const syncedQuake = stampDemoEarthquakeTimestamps(
        TEST_NOTO_EARTHQUAKE_DEMO,
        baseOriginMs,
        nowMs
      );
      setActiveEew(r3);
      setSelectedEarthquake(syncedQuake);
    }, 8000);
    eewDemoTimerRef.current.push(t2);

    // t = 12s: 大津波警報発表！ P波/S波とEEW情報を保持したまま津波優先で統合表示へ自動遷移（紫＋白強調斜線）
    const t3 = setTimeout(() => {
      const nowMs = Date.now();
      const liveTsunami = stampDemoTsunamiTimestamps(
        TEST_TSUNAMI_FORECAST_DEMO,
        baseOriginMs,
        nowMs
      );
      eqLockUntilConfirmedRef.current = false;
      eqUnconfirmedTimedOutRef.current = false;
      setIsTsunamiDemo(true);
      setData((d) => ({
        ...d,
        tsunamiForecast: liveTsunami,
      }));
      setInterruptKind('tsunami');
      setActiveScene('tsunami');
      setFlipSessionNonce((n) => n + 1);
    }, 12000);
    eewDemoTimerRef.current.push(t3);
  }, [
    clearDemoTsunamiIfActive,
    clearEewDemoTimers,
    stampDemoEarthquakeTimestamps,
    stampDemoEewTimestamps,
    stampDemoTsunamiTimestamps,
    updatePinnedEarthquakeId,
  ]);

  // Test Interrupt 2: Volcano Alert Level Change (zooms directly to volcano)
  const handleTriggerTestVolcano = useCallback(() => {
    clearEewDemoTimers();
    setActiveEew(null);
    clearDemoTsunamiIfActive();
    setActiveVolcano(TEST_VOLCANO_LEVEL_CHANGE);
    setInterruptKind('volcano');
  }, [clearDemoTsunamiIfActive, clearEewDemoTimers]);

  // Tsunami Full-scale Demo Toggle (大津波警報・津波警報・注意報シミュレーション)
  const handleToggleTsunamiDemo = useCallback(() => {
    clearEewDemoTimers();
    eqLockUntilConfirmedRef.current = false;
    eqUnconfirmedTimedOutRef.current = false;
    if (eqConfirmedHoldTimerRef.current) {
      clearTimeout(eqConfirmedHoldTimerRef.current);
      eqConfirmedHoldTimerRef.current = null;
    }

    const next = !isTsunamiDemoRef.current;
    setIsTsunamiDemo(next);
    if (next) {
      const nowMs = Date.now();
      const liveTsunami = stampDemoTsunamiTimestamps(
        TEST_TSUNAMI_FORECAST_DEMO,
        nowMs - 5 * 60 * 1000,
        nowMs
      );
      setActiveEew(null);
      setInterruptKind('none');
      setData((d) => ({
        ...d,
        tsunamiForecast: liveTsunami,
      }));
      setActiveScene('tsunami');
      setFlipSessionNonce((n) => n + 1);
    } else {
      setData((d) => ({
        ...d,
        tsunamiForecast: INITIAL_TSUNAMI_FORECAST,
      }));
      setInterruptKind('none');
      setActiveScene('radar');
    }
  }, [clearEewDemoTimers, stampDemoTsunamiTimestamps]);

  const handleToggleSceneEnabled = useCallback((sceneId: SceneId) => {
    setEnabledScenes((prev) => {
      if (prev.includes(sceneId)) {
        if (prev.length <= 1) return prev;
        return prev.filter((id) => id !== sceneId);
      }
      return [...prev, sceneId];
    });
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  // Sort earthquake list in reverse chronological order (most recently occurred first / 最近発生した順)
  const sortedEarthquakes = useMemo(
    () => sortEarthquakesByNewest(data.earthquakes),
    [data.earthquakes]
  );
  const sortedEarthquakesRef = useRef<EarthquakeReport[]>(sortedEarthquakes);
  sortedEarthquakesRef.current = sortedEarthquakes;

  // "地震情報でほかの地震を選択したら勝手に巡回するのをやめてそれを表示しておくようにしたい"
  // 地震を選択したら自動巡回ループを停止し、選択された地震を固定表示する
  const handleSelectEarthquake = useCallback(
    (eq: EarthquakeReport) => {
      // "緊急地震速報 表示中は 選択しない"
      if (activeEewRef.current && isEewStillActive(activeEewRef.current)) {
        return;
      }
      setSelectedEarthquake(eq);
      setActiveScene('earthquake');
      setIsLoopPaused(true);
      updatePinnedEarthquakeId(eq.id);
      setFlipSessionNonce((n) => n + 1);
    },
    [updatePinnedEarthquakeId]
  );

  // 巡回再開: 固定解除・割り込み解除し、最新の地震に戻して自動巡回を再開する
  const handleResumePatrol = useCallback(() => {
    clearEewDemoTimers();
    setIsLoopPaused(false);
    updatePinnedEarthquakeId(null);
    eqLockUntilConfirmedRef.current = false;
    eqUnconfirmedTimedOutRef.current = false;
    if (eqConfirmedHoldTimerRef.current) {
      clearTimeout(eqConfirmedHoldTimerRef.current);
      eqConfirmedHoldTimerRef.current = null;
    }
    if (activeEewRef.current?.isDemo) {
      setActiveEew(null);
    }
    clearDemoTsunamiIfActive();
    if (
      interruptKindRef.current === 'eew' ||
      interruptKindRef.current === 'earthquake' ||
      interruptKindRef.current === 'volcano' ||
      interruptKindRef.current === 'tsunami'
    ) {
      setInterruptKind('none');
    }
    if (sortedEarthquakesRef.current.length > 0) {
      setSelectedEarthquake(sortedEarthquakesRef.current[0]);
    }
  }, [clearDemoTsunamiIfActive, clearEewDemoTimers, updatePinnedEarthquakeId]);

  const handleSelectTyphoonFromPanel = useCallback((ty: TyphoonReport) => {
    const idx = typhoonsRef.current.findIndex((t) => t.id === ty.id);
    setTyphoonPatrolStep(idx !== -1 ? idx + 1 : 1);
    setSelectedTyphoon(ty);
    setActiveScene('typhoon');
  }, []);

  const handleReturnTyphoonOverview = useCallback(() => {
    const totalTyphoons =
      typhoonsRef.current.length > 0 ? typhoonsRef.current.length : 1;
    setTyphoonPatrolStep(totalTyphoons <= 1 ? 1 : 0);
    setActiveScene('typhoon');
  }, []);

  const handleSelectXmlEntryFromList = useCallback((entry: JmaXmlEntry) => {
    setSelectedXmlEntry(entry);
    setModalInitialTab('xml');
    setIsXmlModalOpen(true);
  }, []);

  const handleCloseXmlModal = useCallback(() => {
    setIsXmlModalOpen(false);
  }, []);

  const handleChangeRegionScope = useCallback((val: 'auto' | RegionId) => {
    setRegionScope(val);
    setPatrolStepIndex(0);
    if (val !== 'auto') {
      setPatrolRegionId(val);
    } else {
      setPatrolRegionId('national');
    }
  }, []);

  const activeRegionConfig = useMemo(() => {
    const targetId = regionScope === 'auto' ? patrolRegionId : regionScope;
    return (
      REGION_CONFIGS.find((r) => r.id === targetId) || REGION_CONFIGS[0]
    );
  }, [regionScope, patrolRegionId]);

  const effectiveScene: SceneId = resolveEffectiveScene(activeScene, interruptKind);

  // The right detail panel is hidden for 'forecast' (全国天気予報) and 'radar' (雨雲レーダー) scenes,
  // sliding smoothly out to the right.
  const isRightPanelHidden =
    effectiveScene === 'forecast' || effectiveScene === 'radar';

  // Automated sequential playback for the forecast scene:
  // 1. In 'today_3h': Step through 3-hourly slots from 03時 up to 24時 (index 7).
  //    Once 24時 has been displayed for its full 1.8s duration, smoothly advance to 'tomorrow' ("24時までを表示してその次に明日にいく").
  // 2. In 'tomorrow': Display for 6.5s, then advance to 'day_after'.
  // 3. In 'day_after': Display for 6.5s, then advance to next scene via advanceScene().
  useEffect(() => {
    if (effectiveScene !== 'forecast' || isLoopPaused) {
      return;
    }

    if (forecastViewMode === 'today_3h') {
      const timer = setInterval(() => {
        setForecast3hIndex((prev) => {
          if (prev >= 7) {
            clearInterval(timer);
            setForecastViewMode('tomorrow');
            return 7;
          }
          return prev + 1;
        });
      }, 1800);
      return () => clearInterval(timer);
    }

    if (forecastViewMode === 'tomorrow') {
      const timer = setTimeout(() => {
        setForecastViewMode('day_after');
      }, 6500);
      return () => clearTimeout(timer);
    }

    if (forecastViewMode === 'day_after') {
      const timer = setTimeout(() => {
        advanceSceneRef.current();
      }, 6500);
      return () => clearTimeout(timer);
    }
  }, [effectiveScene, forecastViewMode, isLoopPaused]);

  // 長周期地震動の表示モード制御:
  // 長周期地震動が実際に予測されているときだけ切り替え・表示を許可し、それ以外は常に 'intensity' に保つ
  const activeEewEventId = activeEew?.eventId || '';
  const activeEewHasLpgm =
    Boolean(activeEew && isEewStillActive(activeEew) && hasActualEewLpgm(activeEew));

  useEffect(() => {
    setEewDisplayMode('intensity');
  }, [activeEewEventId, effectiveScene]);

  useEffect(() => {
    if (!activeEewHasLpgm && eewDisplayMode !== 'intensity') {
      setEewDisplayMode('intensity');
    }
  }, [activeEewHasLpgm, eewDisplayMode]);

  const sceneMeta =
    SCENE_LIST.find((s) => s.id === effectiveScene) || SCENE_LIST[0];

  const activeTsunamiForecast = data.tsunamiForecast;
  const isActiveTsunami = Boolean(
    effectiveScene === 'tsunami' && isTsunamiForecastActive(activeTsunamiForecast)
  );
  const highestTsunamiGrade =
    isActiveTsunami && activeTsunamiForecast
      ? getTsunamiHighestGrade(activeTsunamiForecast)
      : null;

  const effectiveSceneTitle = useMemo(() => {
    if (effectiveScene === 'earthquake') {
      if (activeEew && isEewStillActive(activeEew)) {
        if (isEewSpecialWarning(activeEew)) {
          return '緊急地震速報（特別警報）';
        }
        return isEewWarning(activeEew)
          ? '緊急地震速報（警報）'
          : '緊急地震速報（予報）';
      }
      return selectedEarthquake.issueTypeLabel || '地震情報（震源・震度に関する情報）';
    }
    if (effectiveScene === 'tsunami' && highestTsunamiGrade) {
      if (highestTsunamiGrade === 'MajorWarning') return '大津波警報 発表中';
      if (highestTsunamiGrade === 'Warning') return '津波警報 発表中';
      if (highestTsunamiGrade === 'Watch') return '津波注意報 発表中';
      if (highestTsunamiGrade === 'Forecast') return '津波予報（若干の海面変動）';
    }
    if (effectiveScene === 'amedas') {
      if (amedasMetric === 'precip') return '全国アメダス気象実況（降水量）';
      if (amedasMetric === 'wind') return '全国アメダス気象実況（風向・風速）';
      if (amedasMetric === 'snow') return '全国アメダス気象実況（積雪深）';
      return '全国アメダス気象実況（気温分布）';
    }
    if (effectiveScene === 'forecast') {
      const refFc = data.forecasts[0];
      const todayLabel = refFc?.todayDateLabel || '今日';
      const tomorrowLabel = refFc?.tomorrowDateLabel || '明日';
      const dayAfterLabel = refFc?.dayAfterDateLabel || '明後日';
      const slot =
        refFc?.hourly3h?.[
          Math.max(
            0,
            Math.min((refFc?.hourly3h?.length || 1) - 1, forecast3hIndex)
          )
        ];
      if (forecastViewMode === 'today_3h') {
        return `今日のこれからの天気（${todayLabel} ${slot?.timeLabel || '15時'}）`;
      }
      if (forecastViewMode === 'tomorrow') {
        return `全国の天気　明日 ${tomorrowLabel}`;
      }
      return `全国の天気　明後日 ${dayAfterLabel}`;
    }
    if (effectiveScene === 'typhoon') {
      const totalTyphoons = data.typhoons.length > 0 ? data.typhoons.length : 1;
      if (totalTyphoons <= 1 || (typhoonPatrolStep >= 1 && typhoonPatrolStep <= totalTyphoons)) {
        return `${selectedTyphoon.displayNumber}（${selectedTyphoon.nameJp}）実況・進路予想`;
      }
      return '全国 台風・熱帯低気圧 進路実況';
    }
    return sceneMeta.title;
  }, [
    effectiveScene,
    highestTsunamiGrade,
    amedasMetric,
    forecastViewMode,
    forecast3hIndex,
    data.forecasts,
    typhoonPatrolStep,
    selectedTyphoon,
    data.typhoons.length,
    sceneMeta.title,
    activeEew,
    eewDisplayMode,
    selectedEarthquake,
  ]);

  const headerHazard = useMemo<{
    kind:
      | 'normal'
      | 'eew_forecast'
      | 'eew_warning'
      | 'eew_special'
      | 'tsunami_forecast'
      | 'tsunami_watch'
      | 'tsunami_warning'
      | 'tsunami_major';
    stripeBg: string | null;
    hasBottomStripe: boolean;
    topAccentHex: string | null;
    boxClass: string;
    mobileBoxClass: string;
    titleClass: string;
    badgeText: string | null;
    badgeClass: string;
    secondaryBadgeText: string | null;
    secondaryBadgeShortText: string | null;
    secondaryBadgeClass: string;
  }>(() => {
    const isEewLive = Boolean(activeEew && isEewStillActive(activeEew));
    const integratedEewBadge =
      isEewLive && activeEew
        ? (() => {
            const isSpecial = isEewSpecialWarning(activeEew);
            const isWarn = isEewWarning(activeEew);
            const fin = isEewFinal(activeEew) ? '・最終' : '';
            const kindText = isSpecial ? '特別警報' : isWarn ? '警報' : '予報';
            return {
              secondaryBadgeText: `緊急地震速報(${kindText}) 第${activeEew.serial}報${fin}・P/S波`,
              secondaryBadgeShortText: `EEW(${kindText}) P/S波`,
              secondaryBadgeClass: isSpecial
                ? 'bg-purple-700 text-white border border-purple-300/80 font-black'
                : isWarn
                  ? 'bg-red-600 text-white border border-red-300/80 font-black'
                  : 'bg-amber-500 text-slate-950 border border-amber-200 font-black',
            };
          })()
        : {
            secondaryBadgeText: null,
            secondaryBadgeShortText: null,
            secondaryBadgeClass: '',
          };

    if (effectiveScene === 'tsunami' && highestTsunamiGrade) {
      if (highestTsunamiGrade === 'MajorWarning') {
        return {
          kind: 'tsunami_major',
          stripeBg:
            'repeating-linear-gradient(-45deg, #9333EA 0px, #9333EA 11px, #FFFFFF 11px, #FFFFFF 22px)',
          hasBottomStripe: true,
          topAccentHex: null,
          boxClass:
            'bg-[#1D0A30]/96 border-2 border-white shadow-[0_0_26px_rgba(147,51,234,0.7),0_0_14px_rgba(255,255,255,0.42)]',
          mobileBoxClass:
            'bg-[#1D0A30] border-b-2 border-white shadow-[0_0_18px_rgba(147,51,234,0.6)]',
          titleClass:
            'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.45)]',
          badgeText: '直ちに高台へ避難',
          badgeClass:
            'bg-white text-[#111827] border border-white font-black',
          ...integratedEewBadge,
        };
      }
      if (highestTsunamiGrade === 'Warning') {
        return {
          kind: 'tsunami_warning',
          stripeBg:
            'repeating-linear-gradient(-45deg, #DC2626 0px, #DC2626 11px, #FFFFFF 11px, #FFFFFF 22px)',
          hasBottomStripe: true,
          topAccentHex: null,
          boxClass:
            'bg-[#260B0F]/96 border-2 border-white shadow-[0_0_24px_rgba(220,38,38,0.7),0_0_12px_rgba(255,255,255,0.38)]',
          mobileBoxClass:
            'bg-[#260B0F] border-b-2 border-white shadow-[0_0_16px_rgba(220,38,38,0.55)]',
          titleClass:
            'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]',
          badgeText: '直ちに避難',
          badgeClass:
            'bg-white text-[#111827] border border-white font-black',
          ...integratedEewBadge,
        };
      }
      if (highestTsunamiGrade === 'Watch') {
        return {
          kind: 'tsunami_watch',
          stripeBg: null,
          hasBottomStripe: false,
          topAccentHex: '#FACC15',
          boxClass: 'bg-[#181409]/95 border-2 border-amber-400',
          mobileBoxClass: 'bg-[#181409]',
          titleClass: 'text-amber-200',
          badgeText: '海岸から離れて',
          badgeClass: 'bg-amber-400 text-slate-950 font-black',
          ...integratedEewBadge,
        };
      }
      return {
        kind: 'tsunami_forecast',
        stripeBg: null,
        hasBottomStripe: false,
        topAccentHex: '#38BDF8',
        boxClass: 'bg-[#0E1621]/95 border border-sky-400/70',
        mobileBoxClass: 'bg-[#0E1621]',
        titleClass: 'text-sky-100',
        badgeText: null,
        badgeClass: '',
        ...integratedEewBadge,
      };
    }

    if (effectiveScene === 'earthquake' && isEewLive && activeEew) {
      if (isEewSpecialWarning(activeEew)) {
        return {
          kind: 'eew_special',
          stripeBg:
            'repeating-linear-gradient(-45deg, #9333EA 0px, #9333EA 9px, #0B0D12 9px, #0B0D12 18px)',
          hasBottomStripe: false,
          topAccentHex: null,
          boxClass:
            'bg-[#150E1E]/95 border-2 border-[#9333EA] shadow-[0_0_16px_rgba(147,51,234,0.45)]',
          mobileBoxClass: 'bg-[#150E1E]',
          titleClass:
            'text-white drop-shadow-[0_0_8px_rgba(168,85,247,0.45)]',
          badgeText: `第${activeEew.serial}報${activeEew.isFinal ? '・最終' : ''}`,
          badgeClass:
            'bg-[#9333EA] text-white border border-purple-300/70 font-black',
          secondaryBadgeText: null,
          secondaryBadgeShortText: null,
          secondaryBadgeClass: '',
        };
      }
      if (isEewWarning(activeEew)) {
        return {
          kind: 'eew_warning',
          stripeBg:
            'repeating-linear-gradient(-45deg, #DC2626 0px, #DC2626 9px, #0B0D12 9px, #0B0D12 18px)',
          hasBottomStripe: false,
          topAccentHex: null,
          boxClass:
            'bg-[#1A0D10]/95 border-2 border-[#DC2626] shadow-[0_0_14px_rgba(220,38,38,0.4)]',
          mobileBoxClass: 'bg-[#1A0D10]',
          titleClass: 'text-white',
          badgeText: `第${activeEew.serial}報${activeEew.isFinal ? '・最終' : ''}`,
          badgeClass:
            'bg-[#DC2626] text-white border border-red-300/70 font-black',
          secondaryBadgeText: null,
          secondaryBadgeShortText: null,
          secondaryBadgeClass: '',
        };
      }
      return {
        kind: 'eew_forecast',
        stripeBg: null,
        hasBottomStripe: false,
        topAccentHex: '#F59E0B',
        boxClass: 'bg-[#17130B]/95 border border-amber-500/80',
        mobileBoxClass: 'bg-[#17130B]',
        titleClass: 'text-amber-100',
        badgeText: `第${activeEew.serial}報${activeEew.isFinal ? '・最終' : ''}`,
        badgeClass: 'bg-amber-500 text-slate-950 font-black',
        secondaryBadgeText: null,
        secondaryBadgeShortText: null,
        secondaryBadgeClass: '',
      };
    }

    return {
      kind: 'normal',
      stripeBg: null,
      hasBottomStripe: false,
      topAccentHex: null,
      boxClass: 'bg-[#111318]/94 border border-[#686E7A]',
      mobileBoxClass: 'bg-[#14171F]',
      titleClass: 'text-white',
      badgeText: null,
      badgeClass: '',
      secondaryBadgeText: null,
      secondaryBadgeShortText: null,
      secondaryBadgeClass: '',
    };
  }, [effectiveScene, highestTsunamiGrade, activeEew]);

  // Real-time scene-aware broadcast feed (Pattern B: 画面の現在情報に完全に合致するリアルタイムテロップ)
  const sceneFeed = useMemo(
    () =>
      buildSceneFeed({
        effectiveScene,
        data,
        activeEew,
        selectedEarthquake,
        pinnedEarthquakeId,
        activeWarningDivision,
        selectedTyphoon,
        activeVolcano,
        amedasMetric,
      }),
    [
      effectiveScene,
      data,
      activeEew,
      selectedEarthquake,
      pinnedEarthquakeId,
      activeWarningDivision,
      selectedTyphoon,
      activeVolcano,
      amedasMetric,
    ]
  );

  // High-priority bottom flip feed for Earthquake, EEW, and Tsunami alerts (Pattern B TV disaster style)
  const flipFeed = useMemo(
    () =>
      buildBottomFlipFeed({
        effectiveScene,
        data,
        activeEew,
        selectedEarthquake,
        pinnedEarthquakeId,
        isLiveInterrupt: interruptKind === 'earthquake' || interruptKind === 'eew',
      }),
    [
      effectiveScene,
      data,
      activeEew,
      selectedEarthquake,
      pinnedEarthquakeId,
      interruptKind,
    ]
  );

  const currentFlipSessionKey = `${effectiveScene}|${flipSessionNonce}`;
  const [flipRoundsState, setFlipRoundsState] = useState<{
    sessionKey: string;
    rounds: number;
  }>({ sessionKey: currentFlipSessionKey, rounds: 0 });
  const [isEarthquakeScrollDone, setIsEarthquakeScrollDone] = useState<boolean>(false);

  // Reset right-panel scroll completion state when scene, selected earthquake, or interrupt session changes
  useEffect(() => {
    setIsEarthquakeScrollDone(false);
  }, [effectiveScene, selectedEarthquake?.id, flipSessionNonce]);

  const handleFlipRoundsChange = useCallback(
    (sessionKey: string, completedRounds: number) => {
      setFlipRoundsState({ sessionKey, rounds: completedRounds });
    },
    []
  );

  const activeFlipCompletedRounds =
    flipRoundsState.sessionKey === currentFlipSessionKey
      ? flipRoundsState.rounds
      : 0;

  const isEewActive = Boolean(activeEew && isEewStillActive(activeEew));

  const effectiveSceneRef = useRef<SceneId>(effectiveScene);
  effectiveSceneRef.current = effectiveScene;

  const handleSceneCompleteStable = useCallback(() => {
    if (effectiveSceneRef.current === 'earthquake') {
      setIsEarthquakeScrollDone(true);
      return;
    }
    advanceSceneRef.current();
  }, []);

  // Return cleanly after 2 bottom-bar loops on non-EEW earthquake interrupts,
  // or advance in normal patrol once BOTH 2 bottom-bar loops and right-panel scroll finish.
  useEffect(() => {
    const outcome = evaluateEarthquakeLoopCompletion({
      effectiveScene,
      interruptKind,
      isLoopPaused,
      pinnedEarthquakeId,
      isEewActive,
      eqLockUntilConfirmed: eqLockUntilConfirmedRef.current,
      selectedEarthquake: eqUnconfirmedTimedOutRef.current
        ? { ...selectedEarthquake, isConfirmed: true }
        : selectedEarthquake,
      flipCompletedRounds: activeFlipCompletedRounds,
      isEarthquakeScrollDone,
      isMobileDetachedFromDetailTab:
        isMobilePortrait && mobileBottomTab !== 'detail',
    });

    if (outcome === 'return_from_interrupt') {
      if (eqConfirmedHoldTimerRef.current) {
        clearTimeout(eqConfirmedHoldTimerRef.current);
        eqConfirmedHoldTimerRef.current = null;
      }
      eqLockUntilConfirmedRef.current = false;
      eqUnconfirmedTimedOutRef.current = false;
      setInterruptKind('none');
      if (
        selectedEarthquakeRef.current?.isTest &&
        sortedEarthquakesRef.current.length > 0
      ) {
        setSelectedEarthquake(sortedEarthquakesRef.current[0]);
      }
      setActiveScene((prev) =>
        prev === 'earthquake'
          ? getNextSceneId('earthquake', effectiveEnabledScenes)
          : prev
      );
    } else if (outcome === 'advance_normal_patrol') {
      advanceSceneRef.current();
    }
  }, [
    effectiveScene,
    interruptKind,
    isLoopPaused,
    pinnedEarthquakeId,
    isEewActive,
    selectedEarthquake,
    activeFlipCompletedRounds,
    isEarthquakeScrollDone,
    isMobilePortrait,
    mobileBottomTab,
    effectiveEnabledScenes,
  ]);

  return (
    <div className="h-screen w-screen bg-[#0D0F12] text-white p-1 md:p-1.5 overflow-hidden select-none flex">
      {effectiveMobilePortrait ? (
        /* ==================== SMARTPHONE PORTRAIT LAYOUT (Top Header -> Broadcast FEED -> Map Stage -> Bottom Detail Dock) ==================== */
        <div
          data-testid="mobile-portrait-layout"
          className="flex-1 flex flex-col border border-[#5A606D] bg-[#0E1014] overflow-hidden relative"
        >
          {/* 1. TOP HEADER BAR (Clock, Patrol Controls, Settings & Scene Switcher) */}
          <header
            aria-label="モバイルヘッダーおよび設定操作バー"
            data-testid="mobile-top-header"
            className="bg-[#111318] border-b border-[#5A606D] shrink-0 z-30 flex flex-col"
          >
            {/* Row 1A: Live Clock + Patrol Controls + Layout Switch + Settings */}
            <div className="px-2 py-1.5 flex items-center justify-between gap-1.5 border-b border-[#252A36]">
              <LiveClockBox compact />

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  data-testid="mobile-patrol-toggle-btn"
                  onClick={() => {
                    if (isLoopPaused) {
                      handleResumePatrol();
                    } else {
                      setIsLoopPaused(true);
                    }
                  }}
                  className={`px-2 py-1 text-[11px] font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                    isLoopPaused
                      ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                      : 'bg-[#181C24] border-neutral-700 text-neutral-200 hover:bg-neutral-800'
                  }`}
                >
                  {isLoopPaused ? '▶ 再開' : '⏸ 巡回中'}
                </button>

                <button
                  type="button"
                  data-testid="mobile-next-scene-btn"
                  onClick={advanceSceneStable}
                  className="px-2 py-1 text-[11px] font-bold bg-[#181C24] border border-neutral-700 text-neutral-200 hover:bg-neutral-800 transition-colors cursor-pointer whitespace-nowrap"
                >
                  次画面 ⏭
                </button>

                {!isMobilePortrait && (
                  <button
                    type="button"
                    data-testid="switch-to-desktop-layout-btn"
                    onClick={() => setMobileLayoutOverride('desktop')}
                    className="px-2 py-1 text-[11px] font-bold bg-[#181C24] border border-neutral-600 text-neutral-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                    title="PC横画面レイアウトへ戻す"
                  >
                    🖥 PC表示
                  </button>
                )}

                <button
                  type="button"
                  data-testid="open-settings-modal-btn"
                  onClick={() => {
                    setModalInitialTab('settings');
                    setIsXmlModalOpen(true);
                  }}
                  className="px-2.5 py-1 text-[11px] font-bold bg-[#181C24] border border-cyan-600/80 text-cyan-300 hover:bg-neutral-800 transition-colors cursor-pointer whitespace-nowrap"
                >
                  ⚙ 設定
                </button>
              </div>
            </div>

            {/* Row 1B: Active Scene Title + Horizontal Scrollable Scene Tabs */}
            <div
              data-testid="mobile-scene-header-box"
              data-hazard-level={headerHazard.kind}
              className={`flex flex-col ${headerHazard.mobileBoxClass}`}
            >
              {headerHazard.stripeBg && (
                <div
                  aria-hidden="true"
                  className={
                    headerHazard.hasBottomStripe ? 'h-[7px] w-full' : 'h-[5px] w-full'
                  }
                  style={{ backgroundImage: headerHazard.stripeBg }}
                />
              )}
              {!headerHazard.stripeBg && headerHazard.topAccentHex && (
                <div
                  aria-hidden="true"
                  className="h-[4px] w-full"
                  style={{ backgroundColor: headerHazard.topAccentHex }}
                />
              )}
              <div className="px-2.5 py-1.5 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-1.5 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h1
                      key={effectiveSceneTitle}
                      className={`text-[15px] font-extrabold tracking-tight leading-snug truncate animate-title-swap ${headerHazard.titleClass}`}
                    >
                      {effectiveSceneTitle}
                    </h1>
                    {headerHazard.badgeText && !headerHazard.secondaryBadgeShortText && (
                      <span
                        className={`px-1.5 py-0.5 text-[10px] rounded-xs shrink-0 whitespace-nowrap leading-none ${headerHazard.badgeClass}`}
                      >
                        {headerHazard.badgeText}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-neutral-300 shrink-0 whitespace-nowrap">
                    {compactUpdateDateText}
                  </span>
                </div>
                {headerHazard.secondaryBadgeShortText && (
                  <div className="flex flex-wrap items-center gap-1">
                    {headerHazard.badgeText && (
                      <span
                        className={`px-1.5 py-0.5 text-[10px] rounded-xs shrink-0 whitespace-nowrap leading-none ${headerHazard.badgeClass}`}
                      >
                        {headerHazard.badgeText}
                      </span>
                    )}
                    <span
                      data-testid="mobile-integrated-eew-badge"
                      className={`px-1.5 py-0.5 text-[10px] rounded-xs shrink-0 whitespace-nowrap leading-none ${headerHazard.secondaryBadgeClass}`}
                    >
                      {headerHazard.secondaryBadgeText || headerHazard.secondaryBadgeShortText}
                    </span>
                  </div>
                )}

                <nav
                  aria-label="表示シーン切替"
                  className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5"
                >
                  {SCENE_LIST.filter(
                    (s) => !s.isInterruptOnly || s.id === effectiveScene
                  ).map((sc) => {
                    const isCurrent = effectiveScene === sc.id;
                    return (
                      <button
                        key={sc.id}
                        type="button"
                        data-testid={`scene-tab-${sc.id}`}
                        onClick={() => handleSelectSceneManual(sc.id)}
                        className={`px-2 py-0.5 text-[11px] font-bold transition-colors border cursor-pointer shrink-0 whitespace-nowrap ${
                          isCurrent
                            ? 'bg-white text-black border-white shadow-xs'
                            : 'bg-[#1A1D24] text-neutral-300 border-neutral-700 hover:text-white'
                        }`}
                      >
                        {sc.shortLabel}
                      </button>
                    );
                  })}
                </nav>
              </div>
              {headerHazard.stripeBg && headerHazard.hasBottomStripe && (
                <div
                  aria-hidden="true"
                  className="h-[4px] w-full"
                  style={{ backgroundImage: headerHazard.stripeBg }}
                />
              )}
            </div>
          </header>

          {/* 2. UPPER BROADCAST FEED BAR (Isolated memo component so 4.8s flip ticks never re-render App/Map/Panel) */}
          <BroadcastBottomBar
            variant="mobile"
            flipFeed={flipFeed}
            sceneFeed={sceneFeed}
            flipSessionKey={currentFlipSessionKey}
            onFlipRoundsChange={handleFlipRoundsChange}
          />

          {/* 3. INTERACTIVE CENTER MAP STAGE */}
          <div
            data-testid="mobile-map-stage"
            className="flex-1 relative min-h-[200px] overflow-hidden"
          >
            <MonitorMap
              activeScene={activeScene}
              activeRegionConfig={activeRegionConfig}
              activeWarningDivision={activeWarningDivision}
              activeEew={activeEew}
              activeTsunamiForecast={data.tsunamiForecast}
              data={data}
              selectedEarthquake={selectedEarthquake}
              selectedTyphoon={selectedTyphoon}
              typhoonPatrolStep={typhoonPatrolStep}
              activeVolcano={activeVolcano}
              amedasMetric={amedasMetric}
              onChangeAmedasMetric={setAmedasMetric}
              forecastViewMode={forecastViewMode}
              onChangeForecastViewMode={handleChangeForecastViewMode}
              forecast3hIndex={forecast3hIndex}
              onChangeForecast3hIndex={setForecast3hIndex}
              onViewportChange={setMapViewport}
              interruptKind={interruptKind}
              isLoopPaused={isLoopPaused}
              isRightPanelHidden={true}
              isMobilePortrait={true}
              eewDisplayMode={eewDisplayMode}
              onChangeEewDisplayMode={setEewDisplayMode}
              onSceneComplete={advanceSceneStable}
            />
          </div>

          {/* 4. BOTTOM TABBED DETAIL & HISTORY DOCK */}
          <section
            aria-label="モバイル下部詳細および履歴ドック"
            data-testid="mobile-bottom-dock"
            className={`shrink-0 border-t-2 border-[#5A606D] bg-[#111318] flex flex-col overflow-hidden transition-all duration-300 z-20 ${
              isMobileDockExpanded ? 'h-[48%]' : 'h-[31%] min-h-[175px]'
            }`}
          >
            {/* Dock Tab Switcher Header */}
            <div className="px-2 py-1 bg-[#161922] border-b border-[#2B303C] flex items-center justify-between gap-1 shrink-0">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  data-testid="mobile-dock-tab-detail"
                  onClick={() => setMobileBottomTab('detail')}
                  className={`px-2.5 py-1 text-[11px] font-bold border rounded-xs transition-colors cursor-pointer whitespace-nowrap ${
                    mobileBottomTab === 'detail'
                      ? 'bg-cyan-500/25 border-cyan-400 text-white'
                      : 'bg-[#111318] border-neutral-700 text-neutral-300 hover:text-white'
                  }`}
                >
                  現在の詳細
                </button>
                <button
                  type="button"
                  data-testid="mobile-dock-tab-earthquake"
                  onClick={() => setMobileBottomTab('earthquake')}
                  className={`px-2.5 py-1 text-[11px] font-bold border rounded-xs transition-colors cursor-pointer whitespace-nowrap ${
                    mobileBottomTab === 'earthquake'
                      ? 'bg-red-500/25 border-red-400 text-white'
                      : 'bg-[#111318] border-neutral-700 text-neutral-300 hover:text-white'
                  }`}
                >
                  地震履歴 ({data.earthquakes.length})
                </button>
                <button
                  type="button"
                  data-testid="mobile-dock-tab-xml"
                  onClick={() => setMobileBottomTab('xml')}
                  className={`px-2.5 py-1 text-[11px] font-bold border rounded-xs transition-colors cursor-pointer whitespace-nowrap ${
                    mobileBottomTab === 'xml'
                      ? 'bg-amber-500/25 border-amber-400 text-white'
                      : 'bg-[#111318] border-neutral-700 text-neutral-300 hover:text-white'
                  }`}
                >
                  XML電文 ({data.xmlEntries.length})
                </button>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {pinnedEarthquakeId && isLoopPaused && (
                  <button
                    type="button"
                    onClick={handleResumePatrol}
                    className="font-mono text-[10px] font-bold bg-red-800/90 hover:bg-red-700 text-white px-2 py-0.5 rounded cursor-pointer transition-colors"
                  >
                    固定解除 ▶
                  </button>
                )}
                <button
                  type="button"
                  data-testid="mobile-dock-expand-btn"
                  onClick={() => setIsMobileDockExpanded((v) => !v)}
                  className="px-2 py-0.5 text-[10px] font-mono font-bold bg-[#1C2029] border border-neutral-700 text-neutral-300 hover:text-white rounded-xs cursor-pointer"
                >
                  {isMobileDockExpanded ? '▼ 標準' : '▲ 拡大'}
                </button>
              </div>
            </div>

            {/* Dock Content Body */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {mobileBottomTab === 'detail' ? (
                <div className="flex-1 min-h-0 p-1.5 overflow-hidden">
                  <SceneDetailPanel
                    activeScene={activeScene}
                    activeRegionConfig={activeRegionConfig}
                    activeWarningDivision={activeWarningDivision}
                    isFinalWarningNational={isFinalWarningNational}
                    mapViewport={mapViewport}
                    data={data}
                    selectedEarthquake={selectedEarthquake}
                    selectedTyphoon={selectedTyphoon}
                    typhoonPatrolStep={typhoonPatrolStep}
                    activeVolcano={activeVolcano}
                    activeEew={activeEew}
                    activeTsunamiForecast={data.tsunamiForecast}
                    isTsunamiDemo={isTsunamiDemo}
                    amedasMetric={amedasMetric}
                    onChangeAmedasMetric={setAmedasMetric}
                    forecastViewMode={forecastViewMode}
                    onChangeForecastViewMode={handleChangeForecastViewMode}
                    forecast3hIndex={forecast3hIndex}
                    onChangeForecast3hIndex={setForecast3hIndex}
                    onSelectEarthquake={handleSelectEarthquake}
                    onSelectTyphoon={handleSelectTyphoonFromPanel}
                    onReturnTyphoonOverview={handleReturnTyphoonOverview}
                    interruptKind={interruptKind}
                    onDismissInterrupt={handleResumePatrol}
                    isLoopPaused={isLoopPaused}
                    loopIntervalSec={loopIntervalSec}
                    eewDisplayMode={eewDisplayMode}
                    onChangeEewDisplayMode={setEewDisplayMode}
                    onSceneComplete={handleSceneCompleteStable}
                    isMobilePortrait={true}
                  />
                </div>
              ) : mobileBottomTab === 'earthquake' ? (
                <EarthquakeHistoryList
                  variant="mobile"
                  earthquakes={sortedEarthquakes}
                  selectedEarthquakeId={selectedEarthquake.id}
                  pinnedEarthquakeId={pinnedEarthquakeId}
                  isLoopPaused={isLoopPaused}
                  isEewActive={isEewActive}
                  onSelect={handleSelectEarthquake}
                />
              ) : (
                <XmlTimelineList
                  variant="mobile"
                  xmlEntries={data.xmlEntries}
                  selectedXmlEntryId={selectedXmlEntry?.id ?? null}
                  onSelectEntry={handleSelectXmlEntryFromList}
                />
              )}
            </div>
          </section>
        </div>
      ) : (
        /* ==================== DESKTOP BROADCAST LAYOUT (16:9 Landscape) ==================== */
        <div
          data-testid="desktop-broadcast-layout"
          className="flex-1 flex border border-[#5A606D] bg-[#0E1014] overflow-hidden relative"
        >
          {/* ==================== LEFT COLUMN (Clock + Dynamic XML Timeline OR Earthquake History + Compact Settings) ==================== */}
          <aside
            aria-label="時計および履歴タイムライン"
            className="w-[16.5rem] shrink-0 border-r border-[#5A606D] bg-[#111318] flex flex-col overflow-hidden animate-startup-left z-20"
          >
            {/* Top Clock Box (Isolated memoized component so 1s ticks never re-render the map or panels) */}
            <LiveClockBox />

            {/* Left Column Mode Header: Switches to Earthquake History ONLY when effectiveScene === 'earthquake' */}
            <div
              key={effectiveScene === 'earthquake' ? 'desktop-left-hdr-quake' : 'desktop-left-hdr-xml'}
              data-testid="left-panel-mode-header"
              className={`px-3 py-1.5 border-b border-[#2B303C] text-xs font-bold flex items-center justify-between shrink-0 animate-title-swap ${
                effectiveScene === 'earthquake'
                  ? 'bg-red-950/80 text-red-200'
                  : 'bg-[#171A21] text-neutral-300'
              }`}
            >
              {effectiveScene === 'earthquake' ? (
                <>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate">地震履歴（震源・震度一覧）</span>
                    {pinnedEarthquakeId && isLoopPaused && (
                      <span className="text-[0.625rem] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/50 px-1 py-0.2 rounded shrink-0">
                        固定表示中
                      </span>
                    )}
                  </div>
                  {pinnedEarthquakeId && isLoopPaused ? (
                    <button
                      type="button"
                      onClick={handleResumePatrol}
                      className="font-mono text-[0.625rem] font-bold bg-red-800/90 hover:bg-red-700 text-white px-2 py-0.5 rounded cursor-pointer transition-colors shadow-xs shrink-0"
                      title="自動巡回を再開して最新の地震に戻す"
                    >
                      巡回再開 ▶
                    </button>
                  ) : (
                    <span className="font-mono text-[0.6875rem] text-amber-300 shrink-0 whitespace-nowrap">
                      {data.earthquakes.length}件取得
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="truncate">気象庁防災XML 受信タイムライン</span>
                  <span className="font-mono text-[0.6875rem] text-cyan-300 shrink-0 whitespace-nowrap">
                    {data.xmlEntries.length}件
                  </span>
                </>
              )}
            </div>

            {/* Middle List: Earthquake History when effectiveScene === 'earthquake', otherwise XML Feed Timeline */}
            {effectiveScene === 'earthquake' ? (
              <EarthquakeHistoryList
                variant="desktop"
                earthquakes={sortedEarthquakes}
                selectedEarthquakeId={selectedEarthquake.id}
                pinnedEarthquakeId={pinnedEarthquakeId}
                isLoopPaused={isLoopPaused}
                isEewActive={isEewActive}
                onSelect={handleSelectEarthquake}
              />
            ) : (
              <XmlTimelineList
                variant="desktop"
                xmlEntries={data.xmlEntries}
                selectedXmlEntryId={selectedXmlEntry?.id ?? null}
                onSelectEntry={handleSelectXmlEntryFromList}
              />
            )}

            {/* Compact Bottom-Left Control Bar (Pause/Resume, Next Scene, Mobile Preview, and Settings Popup Button) */}
            <div className="border-t border-[#5A606D] bg-[#0D0F13] px-1.5 py-1.5 shrink-0 grid grid-cols-4 gap-1 text-[0.6875rem]">
              <button
                type="button"
                onClick={() => {
                  if (isLoopPaused) {
                    handleResumePatrol();
                  } else {
                    setIsLoopPaused(true);
                  }
                }}
                className={`px-1 py-1.5 font-bold border transition-colors text-center cursor-pointer whitespace-nowrap ${
                  isLoopPaused
                    ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                    : 'bg-[#181C24] border-neutral-700 text-neutral-200 hover:bg-neutral-800'
                }`}
              >
                {isLoopPaused ? '▶ 再開' : '⏸ 巡回中'}
              </button>

              <button
                type="button"
                onClick={advanceSceneStable}
                className="px-1 py-1.5 bg-[#181C24] border border-neutral-700 text-neutral-200 hover:bg-neutral-800 transition-colors text-center cursor-pointer whitespace-nowrap"
              >
                次画面 ⏭
              </button>

              <button
                type="button"
                data-testid="switch-to-mobile-layout-btn"
                onClick={() => setMobileLayoutOverride('mobile')}
                className="px-1 py-1.5 font-bold bg-[#181C24] border border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-center cursor-pointer whitespace-nowrap"
                title="スマホ用縦画面レイアウトに切り替え"
              >
                📱 縦画面
              </button>

              <button
                type="button"
                data-testid="open-settings-modal-btn"
                onClick={() => {
                  setModalInitialTab('settings');
                  setIsXmlModalOpen(true);
                }}
                className="px-1 py-1.5 font-bold bg-[#181C24] border border-cyan-600/80 text-cyan-300 hover:bg-neutral-800 transition-colors text-center cursor-pointer whitespace-nowrap"
              >
                ⚙ 設定
              </button>
            </div>
          </aside>

          {/* ==================== RIGHT MAIN AREA (Full-Screen Map + Slim Bottom XML Feed Ticker) ==================== */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Upper Map Stage */}
            <div className="flex-1 relative min-h-0">
              {/* Full-Bleed Map */}
              <MonitorMap
                activeScene={activeScene}
                activeRegionConfig={activeRegionConfig}
                activeWarningDivision={activeWarningDivision}
                activeEew={activeEew}
                activeTsunamiForecast={data.tsunamiForecast}
                data={data}
                selectedEarthquake={selectedEarthquake}
                selectedTyphoon={selectedTyphoon}
                typhoonPatrolStep={typhoonPatrolStep}
                activeVolcano={activeVolcano}
                amedasMetric={amedasMetric}
                onChangeAmedasMetric={setAmedasMetric}
                forecastViewMode={forecastViewMode}
                onChangeForecastViewMode={handleChangeForecastViewMode}
                forecast3hIndex={forecast3hIndex}
                onChangeForecast3hIndex={setForecast3hIndex}
                onViewportChange={setMapViewport}
                interruptKind={interruptKind}
                isLoopPaused={isLoopPaused}
                isRightPanelHidden={isRightPanelHidden}
                isMobilePortrait={false}
                uiScale={uiScale}
                eewDisplayMode={eewDisplayMode}
                onChangeEewDisplayMode={setEewDisplayMode}
                onSceneComplete={advanceSceneStable}
              />

              {/* Floating Top-Left Scene Title Box (Matches NERV防災ライブ `全国の気象警報・注意報`) */}
              <div
                data-testid="scene-header-box"
                data-hazard-level={headerHazard.kind}
                className={`absolute top-3 left-3 z-[400] ${
                  isRightPanelHidden
                    ? 'max-w-[calc(100%-1.5rem)]'
                    : 'max-w-[calc(100%-17.25rem)]'
                } pointer-events-auto animate-startup-top overflow-hidden ${headerHazard.boxClass}`}
              >
                {headerHazard.stripeBg && (
                  <div
                    data-testid="scene-header-hazard-stripe-top"
                    aria-hidden="true"
                    className={
                      headerHazard.hasBottomStripe
                        ? 'h-[0.625rem] w-full'
                        : 'h-[0.4375rem] w-full'
                    }
                    style={{ backgroundImage: headerHazard.stripeBg }}
                  />
                )}
                {!headerHazard.stripeBg && headerHazard.topAccentHex && (
                  <div
                    aria-hidden="true"
                    className="h-[0.25rem] w-full"
                    style={{ backgroundColor: headerHazard.topAccentHex }}
                  />
                )}
                <div className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1
                      key={effectiveSceneTitle}
                      className={`text-[1.75rem] font-extrabold tracking-tight leading-none whitespace-nowrap animate-title-swap ${headerHazard.titleClass}`}
                    >
                      {effectiveSceneTitle}
                    </h1>
                    {headerHazard.badgeText && (
                      <span
                        className={`px-2 py-0.5 text-xs rounded-xs shrink-0 whitespace-nowrap leading-tight ${headerHazard.badgeClass}`}
                      >
                        {headerHazard.badgeText}
                      </span>
                    )}
                    {headerHazard.secondaryBadgeText && (
                      <span
                        data-testid="desktop-integrated-eew-badge"
                        className={`px-2 py-0.5 text-xs rounded-xs shrink-0 whitespace-nowrap leading-tight ${headerHazard.secondaryBadgeClass}`}
                      >
                        {headerHazard.secondaryBadgeText}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-neutral-200">
                    <span className="font-mono font-semibold text-neutral-100 whitespace-nowrap">
                      {fullUpdateDateText}
                    </span>
                    <span aria-hidden="true" className="text-neutral-600">
                      |
                    </span>
                    {/* Quick Scene Switch Tabs (Includes earthquake in normal loop) */}
                    <nav
                      aria-label="表示シーン切替"
                      className="flex items-center gap-1 flex-wrap"
                    >
                      {SCENE_LIST.filter(
                        (s) => !s.isInterruptOnly || s.id === effectiveScene
                      ).map((sc) => {
                        const isCurrent = effectiveScene === sc.id;
                        return (
                          <button
                            key={sc.id}
                            type="button"
                            onClick={() => handleSelectSceneManual(sc.id)}
                            className={`px-2 py-0.5 text-[0.6875rem] font-bold transition-colors border cursor-pointer whitespace-nowrap shrink-0 ${
                              isCurrent
                                ? 'bg-white text-black border-white'
                                : 'bg-[#1A1D24] text-neutral-300 border-neutral-700 hover:text-white'
                            }`}
                          >
                            {sc.shortLabel}
                          </button>
                        );
                      })}
                    </nav>
                  </div>
                </div>
                {headerHazard.stripeBg && headerHazard.hasBottomStripe && (
                  <div
                    data-testid="scene-header-hazard-stripe-bottom"
                    aria-hidden="true"
                    className="h-[0.375rem] w-full"
                    style={{ backgroundImage: headerHazard.stripeBg }}
                  />
                )}
              </div>

              {/* Floating Right-Side Slim Regional Strip (Slides smoothly off-screen for 'forecast' and 'radar' scenes) */}
              <div
                className={`absolute top-3 right-3 bottom-3 z-[400] transition-all duration-500 ease-in-out ${
                  isRightPanelHidden
                    ? 'translate-x-[calc(100%+1.5rem)] opacity-0 pointer-events-none'
                    : 'translate-x-0 opacity-100 pointer-events-none'
                }`}
              >
                <SceneDetailPanel
                  activeScene={activeScene}
                  activeRegionConfig={activeRegionConfig}
                  activeWarningDivision={activeWarningDivision}
                  isFinalWarningNational={isFinalWarningNational}
                  mapViewport={mapViewport}
                  data={data}
                  selectedEarthquake={selectedEarthquake}
                  selectedTyphoon={selectedTyphoon}
                  typhoonPatrolStep={typhoonPatrolStep}
                  activeVolcano={activeVolcano}
                  activeEew={activeEew}
                  activeTsunamiForecast={data.tsunamiForecast}
                  isTsunamiDemo={isTsunamiDemo}
                  amedasMetric={amedasMetric}
                  onChangeAmedasMetric={setAmedasMetric}
                  forecastViewMode={forecastViewMode}
                  onChangeForecastViewMode={handleChangeForecastViewMode}
                  forecast3hIndex={forecast3hIndex}
                  onChangeForecast3hIndex={setForecast3hIndex}
                  onSelectEarthquake={handleSelectEarthquake}
                  onSelectTyphoon={handleSelectTyphoonFromPanel}
                  onReturnTyphoonOverview={handleReturnTyphoonOverview}
                  interruptKind={interruptKind}
                  onDismissInterrupt={handleResumePatrol}
                  isLoopPaused={isLoopPaused}
                  loopIntervalSec={loopIntervalSec}
                  eewDisplayMode={eewDisplayMode}
                  onChangeEewDisplayMode={setEewDisplayMode}
                  onSceneComplete={handleSceneCompleteStable}
                  isMobilePortrait={false}
                />
              </div>
            </div>

            {/* ==================== BROADCAST FEED FOOTER (Isolated memo component) ==================== */}
            <BroadcastBottomBar
              variant="desktop"
              flipFeed={flipFeed}
              sceneFeed={sceneFeed}
              flipSessionKey={currentFlipSessionKey}
              onFlipRoundsChange={handleFlipRoundsChange}
            />
          </div>
        </div>
      )}

      {/* ==================== XML INSPECTOR & SETTINGS POPUP MODAL ==================== */}
      {isXmlModalOpen && (
        <XmlInspectorModal
          isOpen={isXmlModalOpen}
          initialTab={modalInitialTab}
          onClose={handleCloseXmlModal}
          xmlEntries={data.xmlEntries}
          selectedEntry={selectedXmlEntry}
          onSelectEntry={setSelectedXmlEntry}
          enabledScenes={enabledScenes}
          onToggleSceneEnabled={handleToggleSceneEnabled}
          regionScope={regionScope}
          onChangeRegionScope={handleChangeRegionScope}
          loopIntervalSec={loopIntervalSec}
          onChangeLoopIntervalSec={setLoopIntervalSec}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onTriggerTestEarthquake={handleTriggerTestEarthquake}
          onTriggerTestEew={handleTriggerEewDemo}
          onTriggerTestEewForecast={handleTriggerEewForecastDemo}
          onTriggerTestEewToTsunami={handleTriggerEewToTsunamiDemo}
          onTriggerTestVolcano={handleTriggerTestVolcano}
          onToggleTsunamiDemo={handleToggleTsunamiDemo}
          isTsunamiDemo={isTsunamiDemo}
          onManualRefresh={refreshJmaData}
          isRefreshing={isRefreshingXml}
          lastFetchTime={data.lastXmlFetchTime}
        />
      )}
    </div>
  );
}
