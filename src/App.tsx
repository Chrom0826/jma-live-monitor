import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MonitorMap } from './components/MonitorMap';
import { SceneDetailPanel } from './components/SceneDetailPanel';
import { ModalTabMode, XmlInspectorModal } from './components/XmlInspectorModal';
import {
  INITIAL_AMEDAS_STATIONS,
  INITIAL_EARTHQUAKES,
  INITIAL_FORECASTS,
  INITIAL_LIGHTNING_POINTS,
  INITIAL_MUNI_SEVERITY_MAP,
  INITIAL_MUNICIPALITY_WARNINGS,
  INITIAL_NOWCAST_TIMES,
  INITIAL_PREF_SEVERITY_MAP,
  INITIAL_TSUNAMI_FORECAST,
  INITIAL_TSUNAMI_STATIONS,
  INITIAL_TYPHOONS,
  INITIAL_VOLCANOES,
  INITIAL_WARNINGS,
  INITIAL_WEATHER_BULLETINS,
  INITIAL_XML_ENTRIES,
  TEST_EEW_REPORTS,
  TEST_INTERRUPT_EARTHQUAKE,
  TEST_TSUNAMI_ANOMALY_STATION,
  TEST_TSUNAMI_FORECAST_DEMO,
  TEST_VOLCANO_LEVEL_CHANGE,
} from './data/fallbackData';
import {
  convertP2PQuakeItem,
  fetchMonitorDataBundle,
} from './services/jmaClient';
import {
  AmedasMetric,
  EarthquakeReport,
  EewReport,
  InterruptKind,
  JmaXmlEntry,
  MapViewportState,
  MonitorDataBundle,
  RegionId,
  SceneId,
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
  REGION_CONFIGS,
  SCENE_LIST,
} from './utils/jmaParser';
import {
  parseP2PEew,
  parseP2PTsunami,
  shouldReplaceEew,
} from './utils/eewTsunami';

const INITIAL_BUNDLE: MonitorDataBundle = {
  xmlEntries: INITIAL_XML_ENTRIES,
  nowcastTimes: INITIAL_NOWCAST_TIMES,
  lightningPoints: INITIAL_LIGHTNING_POINTS,
  warnings: INITIAL_WARNINGS,
  municipalityWarnings: INITIAL_MUNICIPALITY_WARNINGS,
  muniSeverityMap: INITIAL_MUNI_SEVERITY_MAP,
  prefSeverityMap: INITIAL_PREF_SEVERITY_MAP,
  typhoons: INITIAL_TYPHOONS,
  bulletins: INITIAL_WEATHER_BULLETINS,
  amedas: INITIAL_AMEDAS_STATIONS,
  volcanoes: INITIAL_VOLCANOES,
  tsunamiStations: INITIAL_TSUNAMI_STATIONS,
  tsunamiForecast: INITIAL_TSUNAMI_FORECAST,
  forecasts: INITIAL_FORECASTS,
  earthquakes: INITIAL_EARTHQUAKES,
  lastXmlFetchTime: '13:43:07',
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

export default function App() {
  const [data, setData] = useState<MonitorDataBundle>(INITIAL_BUNDLE);
  // Start on 'warnings' so the NERV choropleth map is immediately visible, then rotate through normal loop scenes
  const [activeScene, setActiveScene] = useState<SceneId>('warnings');
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
  const [selectedTyphoon, setSelectedTyphoon] = useState<TyphoonReport>(
    INITIAL_TYPHOONS[0]
  );
  const [activeVolcano, setActiveVolcano] = useState<VolcanoStatusItem>(
    INITIAL_VOLCANOES[0]
  );
  const [activeTsunamiStation, setActiveTsunamiStation] =
    useState<TsunamiStationItem>(INITIAL_TSUNAMI_STATIONS[0]);
  const [activeEew, setActiveEew] = useState<EewReport | null>(null);
  const [isTsunamiDemo, setIsTsunamiDemo] = useState<boolean>(false);
  const [amedasMetric, setAmedasMetric] = useState<AmedasMetric>('temp');
  const eewDemoTimerRef = useRef<NodeJS.Timeout[]>([]);

  // XML Inspector & Settings Popup Modal state
  const [isXmlModalOpen, setIsXmlModalOpen] = useState<boolean>(false);
  const [modalInitialTab, setModalInitialTab] =
    useState<ModalTabMode>('settings');
  const [selectedXmlEntry, setSelectedXmlEntry] = useState<JmaXmlEntry | null>(
    INITIAL_XML_ENTRIES[0]
  );
  const [isRefreshingXml, setIsRefreshingXml] = useState<boolean>(false);

  // Live JST Clock (matches NERV防災ライブ top-left clock)
  const [dateHeaderText, setDateHeaderText] = useState<string>('11月5日 木曜日');
  const [timeHeaderText, setTimeHeaderText] = useState<string>('13:43:07');
  const [fullUpdateDateText, setFullUpdateDateText] =
    useState<string>('2026年11月5日 13:43 更新');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const latestEqIdRef = useRef<string>(INITIAL_EARTHQUAKES[0].id);
  const latestVolcanoXmlIdRef = useRef<string>('');
  const latestTsunamiXmlIdRef = useRef<string>('');

  // Bottom XML Ticker refs (uses tiled scrollLeft instead of GPU-texture-limited translate3d)
  const tickerContainerRef = useRef<HTMLDivElement | null>(null);
  const tickerFirstCopyRef = useRef<HTMLDivElement | null>(null);
  const isTickerHoveredRef = useRef<boolean>(false);

  // Update clock every second
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const yyyy = now.getFullYear();
      const month = now.getMonth() + 1;
      const day = now.getDate();
      const weekday = WEEKDAYS_JA[now.getDay()];
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      setDateHeaderText(`${month}月${day}日 ${weekday}`);
      setTimeHeaderText(`${hh}:${min}:${ss}`);
      setFullUpdateDateText(`${yyyy}年${month}月${day}日 ${hh}:${min} 更新`);
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Smooth scrollLeft-based bottom XML ticker (never hits Chromium's 16,384px GPU texture limit)
  useEffect(() => {
    let subPixelScroll = tickerContainerRef.current?.scrollLeft || 0;
    const speedPxPerTick = 1.9; // ~57px/s at 30fps

    const intervalId = setInterval(() => {
      const container = tickerContainerRef.current;
      const firstCopy = tickerFirstCopyRef.current;
      if (container && firstCopy && !isTickerHoveredRef.current) {
        const copyWidth = firstCopy.offsetWidth;
        if (copyWidth > 0) {
          subPixelScroll += speedPxPerTick;
          if (subPixelScroll >= copyWidth) {
            subPixelScroll -= copyWidth;
          }
          container.scrollLeft = subPixelScroll;
        }
      }
    }, 33);

    return () => clearInterval(intervalId);
  }, [data.xmlEntries]);

  // Low-frequency JMA XML & JSON fetch (on mount + every 5 minutes)
  const refreshJmaData = useCallback(async () => {
    setIsRefreshingXml(true);
    try {
      const bundle = await fetchMonitorDataBundle();
      setData(bundle);

      // 0. Sync live typhoon selection
      if (bundle.typhoons.length > 0) {
        setSelectedTyphoon(bundle.typhoons[0]);
      }

      // 1. Check for new earthquake
      if (bundle.earthquakes.length > 0) {
        const newest = bundle.earthquakes[0];
        if (
          latestEqIdRef.current &&
          newest.id !== latestEqIdRef.current &&
          latestEqIdRef.current !== INITIAL_EARTHQUAKES[0].id
        ) {
          setSelectedEarthquake(newest);
          setInterruptKind('earthquake');
        } else if (interruptKind === 'none') {
          setSelectedEarthquake(newest);
        }
        latestEqIdRef.current = newest.id;
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

      // 3. Check for Tsunami / Abnormal Tide report in eqvol.xml
      const tsunamiXml = bundle.xmlEntries.find(
        (e) =>
          e.category === 'tsunami' &&
          (e.title.includes('津波') || e.title.includes('潮位'))
      );
      if (
        tsunamiXml &&
        latestTsunamiXmlIdRef.current &&
        tsunamiXml.id !== latestTsunamiXmlIdRef.current
      ) {
        latestTsunamiXmlIdRef.current = tsunamiXml.id;
        setActiveTsunamiStation(TEST_TSUNAMI_ANOMALY_STATION);
        setInterruptKind('tsunami');
      } else if (tsunamiXml && !latestTsunamiXmlIdRef.current) {
        latestTsunamiXmlIdRef.current = tsunamiXml.id;
      }
    } finally {
      setIsRefreshingXml(false);
    }
  }, [interruptKind]);

  useEffect(() => {
    refreshJmaData();
    const pollTimer = setInterval(refreshJmaData, 300000);
    return () => clearInterval(pollTimer);
  }, [refreshJmaData]);

  // Subscribe to P2PQuake WebSocket for low-latency earthquake / EEW / Tsunami push delivery
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket('wss://api.p2pquake.net/v2/ws');
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (!payload || typeof payload.code !== 'number') return;

          // 1. EEW (緊急地震速報（警報） code: 556)
          if (payload.code === 556) {
            const eew = parseP2PEew(payload);
            if (eew) {
              setActiveEew((prev) => {
                if (shouldReplaceEew(prev, eew)) {
                  return eew;
                }
                return prev;
              });
              setInterruptKind('eew');
              setActiveScene('earthquake');
              // Immediately trigger low-latency refresh of earthquake data
              refreshJmaData();
            }
          }
          // 2. EEW Announcement Detection (NHKチャイム検出 code: 554)
          else if (payload.code === 554) {
            setActiveScene('earthquake');
            refreshJmaData();
          }
          // 3. Tsunami forecast (津波予報 code: 552)
          else if (payload.code === 552) {
            const tsunami = parseP2PTsunami(payload);
            if (tsunami) {
              setData((prev) => ({
                ...prev,
                tsunamiForecast: tsunami,
              }));
              if (!tsunami.cancelled && tsunami.areas.length > 0) {
                setActiveScene('tsunami');
              }
            }
          }
          // 4. Earthquake detail (各地の震度・震源情報 code: 551)
          else if (payload.code === 551) {
            const report = convertP2PQuakeItem(payload);
            if (report && report.id !== latestEqIdRef.current) {
              latestEqIdRef.current = report.id;
              setData((prev) => ({
                ...prev,
                earthquakes: [
                  report,
                  ...prev.earthquakes.filter((e) => e.id !== report.id),
                ].slice(0, 20),
              }));
              setSelectedEarthquake(report);
              setInterruptKind('earthquake');
              setActiveScene('earthquake');
            }
          }
        } catch {
          // Ignore malformed WS message
        }
      };
    } catch {
      // Ignore WS connection failure
    }
    return () => {
      if (ws && ws.readyState <= 1) {
        ws.close();
      }
    };
  }, [refreshJmaData]);

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

  // Step to next scene in the normal loop:
  // 1. In `'warnings'` (`regionScope === 'national' || 'auto'`), start at 全国表示, then zoom ONLY into divisions with 警報/特別警報 (`severeWarningDivisions`), return to 全国表示, then advance to next scene.
  // 2. When `regionScope === 'auto'` on `forecast` or `weather_info`, step North-to-South before advancing.
  // 3. When in `'typhoon'` and multiple typhoons/TDs/extratropical cyclones exist, automatically cycle through all of them in the right panel.
  // 4. When in `'amedas'`, step through `'temp' -> 'precip' -> 'wind' (-> 'snow')` (each metric performs 全国表示 -> 北海道〜沖縄連続スイープ -> 全国表示 in MonitorMap) before moving to the next scene.
  const advanceScene = useCallback(() => {
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

    const isRegionalPatrolScene =
      activeScene === 'forecast' || activeScene === 'weather_info';

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

    if (activeScene === 'typhoon' && data.typhoons.length > 1) {
      const curIdx = data.typhoons.findIndex(
        (t) => t.id === selectedTyphoon.id
      );
      if (curIdx !== -1 && curIdx < data.typhoons.length - 1) {
        setSelectedTyphoon(data.typhoons[curIdx + 1]);
        return;
      }
      setSelectedTyphoon(data.typhoons[0]);
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
      const nextScene = getNextSceneId(prevScene, enabledScenes);
      if (nextScene === 'warnings') {
        setWarningPatrolStep(0);
      }
      if (nextScene === 'amedas') {
        setAmedasMetric('temp');
      }
      if (nextScene === 'typhoon' && data.typhoons.length > 0) {
        setSelectedTyphoon(data.typhoons[0]);
      }
      if (regionScope === 'auto') {
        setPatrolStepIndex(0);
        setPatrolRegionId('national');
      }
      return nextScene;
    });
  }, [
    activeScene,
    amedasMetric,
    data.amedas,
    data.typhoons,
    selectedTyphoon.id,
    enabledScenes,
    regionScope,
    patrolStepIndex,
    severeWarningDivisions.length,
    warningPatrolStep,
  ]);

  const handleSelectSceneManual = (sceneId: SceneId) => {
    setInterruptKind('none');
    setWarningPatrolStep(0);
    if (sceneId === 'amedas') {
      setAmedasMetric('temp');
    }
    if (sceneId === 'typhoon' && data.typhoons.length > 0) {
      setSelectedTyphoon(data.typhoons[0]);
    }
    if (regionScope === 'auto') {
      setPatrolStepIndex(0);
      setPatrolRegionId('national');
    }
    setActiveScene(sceneId);
  };

  // Test Interrupt 1: Earthquake
  const handleTriggerTestEarthquake = () => {
    setSelectedEarthquake(TEST_INTERRUPT_EARTHQUAKE);
    setInterruptKind('earthquake');
    setActiveScene('earthquake');
  };

  // Test Interrupt 1-b: EEW (緊急地震速報 Progressive Demo: 第1報 -> 第3報 -> 最終報)
  const handleTriggerEewDemo = useCallback(() => {
    eewDemoTimerRef.current.forEach((t) => clearTimeout(t));
    eewDemoTimerRef.current = [];

    // Step 1: 第1報（M5.9 震度5強以上）
    const r1 = { ...TEST_EEW_REPORTS[0], receivedAtMs: Date.now() };
    setActiveEew(r1);
    setInterruptKind('eew');
    setActiveScene('earthquake');

    // Step 2: 第3報（M6.8 震度6強） - 4秒後
    const t1 = setTimeout(() => {
      const r2 = { ...TEST_EEW_REPORTS[1], receivedAtMs: Date.now() };
      setActiveEew(r2);
    }, 4000);
    eewDemoTimerRef.current.push(t1);

    // Step 3: 最終報（M7.6 震度7） - 8秒後
    const t2 = setTimeout(() => {
      const r3 = { ...TEST_EEW_REPORTS[2], receivedAtMs: Date.now() };
      setActiveEew(r3);
    }, 8000);
    eewDemoTimerRef.current.push(t2);
  }, []);

  // Test Interrupt 2: Volcano Alert Level Change (zooms directly to volcano)
  const handleTriggerTestVolcano = () => {
    setActiveVolcano(TEST_VOLCANO_LEVEL_CHANGE);
    setInterruptKind('volcano');
    setActiveScene('volcano');
  };

  // Test Interrupt 3: Tsunami / Abnormal Tide Level (zooms directly to tide station)
  const handleTriggerTestTsunami = () => {
    setActiveTsunamiStation(TEST_TSUNAMI_ANOMALY_STATION);
    setInterruptKind('tsunami');
    setActiveScene('tsunami');
  };

  // Tsunami Full-scale Demo Toggle (大津波警報・津波警報・注意報シミュレーション)
  const handleToggleTsunamiDemo = useCallback(() => {
    setIsTsunamiDemo((prev) => {
      const next = !prev;
      if (next) {
        setData((d) => ({
          ...d,
          tsunamiForecast: TEST_TSUNAMI_FORECAST_DEMO,
        }));
        setActiveScene('tsunami');
      } else {
        setData((d) => ({
          ...d,
          tsunamiForecast: INITIAL_TSUNAMI_FORECAST,
        }));
      }
      return next;
    });
  }, []);

  const handleDismissInterrupt = () => {
    setInterruptKind('none');
    setActiveEew(null);
    eewDemoTimerRef.current.forEach((t) => clearTimeout(t));
    eewDemoTimerRef.current = [];
    if (selectedEarthquake.isTest && data.earthquakes.length > 0) {
      setSelectedEarthquake(data.earthquakes[0]);
    }
    setActiveScene('warnings');
  };

  const handleToggleSceneEnabled = (sceneId: SceneId) => {
    setEnabledScenes((prev) => {
      if (prev.includes(sceneId)) {
        if (prev.length <= 1) return prev;
        return prev.filter((id) => id !== sceneId);
      }
      return [...prev, sceneId];
    });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Sort earthquake list so the largest seismic intensity (`maxScaleCode`) is always at the top
  const sortedEarthquakes = useMemo(() => {
    return [...data.earthquakes].sort(
      (a, b) =>
        b.maxScaleCode - a.maxScaleCode ||
        b.occurrenceTime.localeCompare(a.occurrenceTime)
    );
  }, [data.earthquakes]);

  const activeRegionConfig = useMemo(() => {
    const targetId = regionScope === 'auto' ? patrolRegionId : regionScope;
    return (
      REGION_CONFIGS.find((r) => r.id === targetId) || REGION_CONFIGS[0]
    );
  }, [regionScope, patrolRegionId]);

  const effectiveScene: SceneId =
    interruptKind === 'earthquake'
      ? 'earthquake'
      : interruptKind === 'volcano'
        ? 'volcano'
        : interruptKind === 'tsunami'
           ? 'tsunami'
           : activeScene;

  const sceneMeta =
    SCENE_LIST.find((s) => s.id === effectiveScene) || SCENE_LIST[0];

  return (
    <div className="h-screen w-screen bg-[#0D0F12] text-white p-1.5 overflow-hidden select-none flex">
      {/* Outer Broadcast Frame with NERV-inspired crisp border */}
      <div className="flex-1 flex border border-[#5A606D] bg-[#0E1014] overflow-hidden relative">
        {/* ==================== LEFT COLUMN (Clock + Dynamic XML Timeline OR Earthquake History + Compact Settings) ==================== */}
        <aside
          aria-label="時計および履歴タイムライン"
          className="w-[264px] shrink-0 border-r border-[#5A606D] bg-[#111318] flex flex-col overflow-hidden"
        >
          {/* Top Clock Box (Exact NERV防災ライブ style) */}
          <div className="border-b border-[#5A606D] px-4 py-3 text-center bg-[#111318] shrink-0">
            <div className="text-[20px] font-bold tracking-wider text-white leading-snug">
              {dateHeaderText}
            </div>
            <div
              data-testid="live-digital-clock"
              className="text-[42px] font-mono font-bold tracking-wider text-white leading-none mt-1"
            >
              {timeHeaderText}
            </div>
          </div>

          {/* Left Column Mode Header: Switches to Earthquake History ONLY when effectiveScene === 'earthquake' */}
          <div
            data-testid="left-panel-mode-header"
            className={`px-3 py-1.5 border-b border-[#2B303C] text-xs font-bold flex items-center justify-between shrink-0 ${
              effectiveScene === 'earthquake'
                ? 'bg-red-950/80 text-red-200'
                : 'bg-[#171A21] text-neutral-300'
            }`}
          >
            {effectiveScene === 'earthquake' ? (
              <>
                <span>地震履歴（震源・震度一覧）</span>
                <span className="font-mono text-[11px] text-amber-300">
                  {data.earthquakes.length}件取得
                </span>
              </>
            ) : (
              <>
                <span>気象庁防災XML 受信タイムライン</span>
                <span className="font-mono text-[11px] text-cyan-300">
                  {data.xmlEntries.length}件
                </span>
              </>
            )}
          </div>

          {/* Middle List: Earthquake History when effectiveScene === 'earthquake', otherwise XML Feed Timeline */}
          {effectiveScene === 'earthquake' ? (
            <div
              aria-label="地震履歴一覧"
              data-testid="left-earthquake-history-list"
              className="flex-1 overflow-y-auto divide-y divide-[#2B303C]"
            >
              {sortedEarthquakes.map((eq) => {
                const isSelected = selectedEarthquake.id === eq.id;
                const scaleStyle = getSeismicScaleStyle(eq.maxScaleCode);
                return (
                  <button
                    key={eq.id}
                    type="button"
                    onClick={() => setSelectedEarthquake(eq)}
                    className={`w-full text-left px-3 py-2.5 transition-colors cursor-pointer block ${
                      isSelected
                        ? 'bg-[#251A22] border-l-2 border-red-500'
                        : 'hover:bg-[#181B22]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono text-neutral-400">
                        {eq.occurrenceTime.replace(' 頃発生', '')}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 text-[11px] font-mono font-extrabold ${scaleStyle.bg} ${scaleStyle.text}`}
                      >
                        最大震度{eq.maxScaleLabel}
                      </span>
                    </div>
                    <div className="text-[14px] font-extrabold text-white mt-1 leading-snug">
                      {eq.hypocenterName}
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono text-neutral-300 mt-1">
                      <span>M{eq.magnitude.toFixed(1)}</span>
                      <span>深さ約{eq.depthKm}km</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div
              aria-label="気象庁XML電文タイムライン"
              data-testid="left-xml-timeline-list"
              className="flex-1 overflow-y-auto divide-y divide-[#2B303C]"
            >
              {data.xmlEntries.map((entry) => {
                const isSelected = selectedXmlEntry?.id === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setSelectedXmlEntry(entry);
                      setModalInitialTab('xml');
                      setIsXmlModalOpen(true);
                    }}
                    className={`w-full text-left px-3 py-2.5 transition-colors cursor-pointer block ${
                      isSelected
                        ? 'bg-[#1D222B] border-l-2 border-amber-400'
                        : 'hover:bg-[#181B22]'
                    }`}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-mono text-neutral-400 shrink-0">
                        {formatTimeHm(entry.updated)}
                      </span>
                      <span className="text-[13px] font-bold text-white leading-snug">
                        {entry.title}
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-300 leading-relaxed mt-1 break-words">
                      {entry.content}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Compact Bottom-Left Control Bar (Pause/Resume, Next Scene, and Settings Popup Button) */}
          <div className="border-t border-[#5A606D] bg-[#0D0F13] p-2 shrink-0 flex items-center justify-between gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => setIsLoopPaused((p) => !p)}
              className={`flex-1 px-2 py-1.5 font-bold border transition-colors text-center cursor-pointer ${
                isLoopPaused
                  ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                  : 'bg-[#181C24] border-neutral-700 text-neutral-200 hover:bg-neutral-800'
              }`}
            >
              {isLoopPaused ? '▶ 再開' : '⏸ 巡回中'}
            </button>

            <button
              type="button"
              onClick={advanceScene}
              className="px-2.5 py-1.5 bg-[#181C24] border border-neutral-700 text-neutral-200 hover:bg-neutral-800 transition-colors cursor-pointer shrink-0"
            >
              次画面 ⏭
            </button>

            <button
              type="button"
              data-testid="open-settings-modal-btn"
              onClick={() => {
                setModalInitialTab('settings');
                setIsXmlModalOpen(true);
              }}
              className="px-2.5 py-1.5 font-bold bg-[#181C24] border border-cyan-600/80 text-cyan-300 hover:bg-neutral-800 transition-colors cursor-pointer shrink-0"
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
              activeVolcano={activeVolcano}
              activeTsunamiStation={activeTsunamiStation}
              amedasMetric={amedasMetric}
              onChangeAmedasMetric={setAmedasMetric}
              onViewportChange={setMapViewport}
              interruptKind={interruptKind}
              isLoopPaused={isLoopPaused}
              onSceneComplete={advanceScene}
            />

            {/* Floating Top-Left Scene Title Box (Matches NERV防災ライブ `全国の気象警報・注意報`) */}
            <div className="absolute top-3 left-3 z-[400] bg-[#111318]/94 border border-[#686E7A] px-4 py-2.5 pointer-events-auto">
              <h1 className="text-[28px] font-extrabold tracking-tight text-white leading-none">
                {effectiveScene === 'amedas'
                  ? amedasMetric === 'precip'
                    ? '全国アメダス気象実況（降水量）'
                    : amedasMetric === 'wind'
                      ? '全国アメダス気象実況（風向・風速）'
                      : amedasMetric === 'snow'
                        ? '全国アメダス気象実況（積雪深）'
                        : '全国アメダス気象実況（気温分布）'
                  : sceneMeta.title}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-neutral-200">
                <span className="font-mono font-semibold text-neutral-100">
                  {fullUpdateDateText}
                </span>
                <span aria-hidden="true" className="text-neutral-600">
                  |
                </span>
                {/* Quick Scene Switch Tabs (Includes earthquake in normal loop) */}
                <nav
                  aria-label="表示シーン切替"
                  className="flex items-center gap-1"
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
                        className={`px-2 py-0.5 text-[11px] font-bold transition-colors border cursor-pointer ${
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

            {/* Floating Right-Side Slim Regional Strip (Matches NERV防災ライブ right strip) */}
            <div className="absolute top-3 right-3 bottom-3 z-[400] pointer-events-none">
              <SceneDetailPanel
                activeScene={activeScene}
                activeRegionConfig={activeRegionConfig}
                activeWarningDivision={activeWarningDivision}
                isFinalWarningNational={isFinalWarningNational}
                mapViewport={mapViewport}
                data={data}
                selectedEarthquake={selectedEarthquake}
                selectedTyphoon={selectedTyphoon}
                activeVolcano={activeVolcano}
                activeTsunamiStation={activeTsunamiStation}
                activeEew={activeEew}
                activeTsunamiForecast={data.tsunamiForecast}
                isTsunamiDemo={isTsunamiDemo}
                onToggleTsunamiDemo={handleToggleTsunamiDemo}
                amedasMetric={amedasMetric}
                onChangeAmedasMetric={setAmedasMetric}
                onSelectEarthquake={(eq) => {
                  setSelectedEarthquake(eq);
                  setActiveScene('earthquake');
                }}
                onSelectTyphoon={(ty) => {
                  setSelectedTyphoon(ty);
                  setActiveScene('typhoon');
                }}
                interruptKind={interruptKind}
                onDismissInterrupt={handleDismissInterrupt}
                isLoopPaused={isLoopPaused}
                loopIntervalSec={loopIntervalSec}
                onSceneComplete={advanceScene}
              />
            </div>
          </div>

          {/* Slim Single-Row Full-Text XML Feed Ticker (ScrollLeft-driven so text never disappears mid-scroll) */}
          <footer
            aria-label="気象解説情報および全文フィード"
            className="border-t border-[#5A606D] bg-[#111318] px-3 py-1.5 shrink-0 flex items-center gap-2.5 overflow-hidden"
          >
            <span className="bg-[#2B303C] text-amber-300 px-2 py-0.5 text-[11px] font-mono font-bold shrink-0">
              XML全文FEED
            </span>
            <div
              ref={tickerContainerRef}
              data-testid="xml-ticker-scroll-container"
              onMouseEnter={() => {
                isTickerHoveredRef.current = true;
              }}
              onMouseLeave={() => {
                isTickerHoveredRef.current = false;
              }}
              className="flex-1 overflow-x-hidden whitespace-nowrap relative"
            >
              <div
                ref={tickerFirstCopyRef}
                className="inline-flex items-center gap-10 pr-10 text-xs text-neutral-200"
              >
                {data.xmlEntries.map((entry, idx) => (
                  <span
                    key={`${entry.id}-copy1-${idx}`}
                    className="inline-flex items-center gap-2"
                  >
                    <span className="font-mono text-amber-400 font-bold">
                      [{entry.feedType}.xml]
                    </span>
                    <span className="font-bold text-white">{entry.title}:</span>
                    <span className="text-neutral-200">{entry.content}</span>
                    <span aria-hidden="true" className="text-neutral-600 ml-4">
                      ｜
                    </span>
                  </span>
                ))}
              </div>
              <div
                aria-hidden="true"
                className="inline-flex items-center gap-10 pr-10 text-xs text-neutral-200"
              >
                {data.xmlEntries.map((entry, idx) => (
                  <span
                    key={`${entry.id}-copy2-${idx}`}
                    className="inline-flex items-center gap-2"
                  >
                    <span className="font-mono text-amber-400 font-bold">
                      [{entry.feedType}.xml]
                    </span>
                    <span className="font-bold text-white">{entry.title}:</span>
                    <span className="text-neutral-200">{entry.content}</span>
                    <span className="text-neutral-600 ml-4">｜</span>
                  </span>
                ))}
              </div>
            </div>
          </footer>
        </div>
      </div>

      {/* ==================== XML INSPECTOR & SETTINGS POPUP MODAL ==================== */}
      <XmlInspectorModal
        isOpen={isXmlModalOpen}
        initialTab={modalInitialTab}
        onClose={() => setIsXmlModalOpen(false)}
        xmlEntries={data.xmlEntries}
        selectedEntry={selectedXmlEntry}
        onSelectEntry={setSelectedXmlEntry}
        enabledScenes={enabledScenes}
        onToggleSceneEnabled={handleToggleSceneEnabled}
        regionScope={regionScope}
        onChangeRegionScope={(val) => {
          setRegionScope(val);
          setPatrolStepIndex(0);
          if (val !== 'auto') {
            setPatrolRegionId(val);
          } else {
            setPatrolRegionId('national');
          }
        }}
        loopIntervalSec={loopIntervalSec}
        onChangeLoopIntervalSec={(sec) => {
          setLoopIntervalSec(sec);
        }}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onTriggerTestEarthquake={handleTriggerTestEarthquake}
        onTriggerTestEew={handleTriggerEewDemo}
        onTriggerTestVolcano={handleTriggerTestVolcano}
        onTriggerTestTsunami={handleTriggerTestTsunami}
        onToggleTsunamiDemo={handleToggleTsunamiDemo}
        isTsunamiDemo={isTsunamiDemo}
        onManualRefresh={refreshJmaData}
        isRefreshing={isRefreshingXml}
        lastFetchTime={data.lastXmlFetchTime}
      />
    </div>
  );
}
