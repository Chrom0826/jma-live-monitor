import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  AmedasMetric,
  EarthquakeReport,
  EewReport,
  InterruptKind,
  MapViewportState,
  MonitorDataBundle,
  RegionConfig,
  RegionalWarningItem,
  SceneId,
  TsunamiForecastReport,
  TsunamiStationItem,
  TsunamiForecastArea,
  TyphoonReport,
  VolcanoStatusItem,
  WarningSeverity,
} from '../types/jma';
import {
  AMEDAS_PATROL_STOPS,
  computeTyphoonConeEnvelope,
  formatCompactTyphoonCenterLabel,
  formatCompactTyphoonTime,
  formatMunicipalityMapLabel,
  getAmedasMetricColor,
  getAmedasPointRadiusForZoom,
  getAmedasWindArrowSizeForZoom,
  getSeismicScaleStyle,
  getWindDirectionRotationDeg,
  inferRegionFromCoords,
  isExtratropicalCyclone,
  PREFECTURE_NAMES,
} from '../utils/jmaParser';
import {
  computeEewWaveRadiiKm,
  formatEewArrivalLabel,
  formatEewScaleRange,
  getTsunamiGradeStyle,
  isEewStillActive,
} from '../utils/eewTsunami';

let cachedClass20GeoJson: any = null;
let cachedClass10GeoJson: any = null;
let cachedTsunamiGeoJson: any = null;
const cachedClass20LabelPoints: Record<string, [number, number]> = {};
let class20FetchPromise: Promise<{ class20: any; class10: any }> | null = null;
let tsunamiFetchPromise: Promise<any> | null = null;

function loadJmaTsunamiGeoJson(): Promise<any> {
  if (cachedTsunamiGeoJson) return Promise.resolve(cachedTsunamiGeoJson);
  if (tsunamiFetchPromise) return tsunamiFetchPromise;
  tsunamiFetchPromise = fetch(
    'https://www.jma.go.jp/bosai/common/const/geojson/tsunami.json'
  )
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      if (json && Array.isArray(json.features)) {
        cachedTsunamiGeoJson = json;
      }
      return cachedTsunamiGeoJson;
    })
    .catch(() => null);
  return tsunamiFetchPromise;
}

function loadJmaMunicipalityGeoJson(): Promise<{ class20: any; class10: any }> {
  if (cachedClass20GeoJson && cachedClass10GeoJson) {
    return Promise.resolve({
      class20: cachedClass20GeoJson,
      class10: cachedClass10GeoJson,
    });
  }
  if (class20FetchPromise) return class20FetchPromise;

  class20FetchPromise = Promise.all([
    Promise.all(
      Array.from({ length: 10 }, (_, idx) =>
        fetch(
          `https://www.jma.go.jp/bosai/common/const/geojson/class20s_${idx}.json`
        )
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    ),
    fetch('https://www.jma.go.jp/bosai/common/const/geojson/class10s.json')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]).then(([c20Parts, c10Json]) => {
    const validParts = c20Parts.filter(
      (p) => p && Array.isArray(p.features)
    );
    if (validParts.length > 0) {
      const allFeatures = validParts.flatMap((p) => p.features);
      for (const f of allFeatures) {
        const code = String(f?.properties?.code || '');
        const lp = f?.properties?.labelPoints?.[0];
        if (code && Array.isArray(lp) && lp.length >= 2) {
          const lon = Number(lp[0]);
          const lat = Number(lp[1]);
          if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
            cachedClass20LabelPoints[code] = [lat, lon];
          }
        }
      }
      cachedClass20GeoJson = {
        type: 'FeatureCollection',
        features: allFeatures,
      };
    }
    if (c10Json && Array.isArray(c10Json.features)) {
      cachedClass10GeoJson = c10Json;
    }
    return {
      class20: cachedClass20GeoJson,
      class10: cachedClass10GeoJson,
    };
  });

  return class20FetchPromise;
}

interface MonitorMapProps {
  activeScene: SceneId;
  activeRegionConfig: RegionConfig;
  activeWarningDivision?: RegionalWarningItem | null;
  activeEew?: EewReport | null;
  activeTsunamiForecast?: TsunamiForecastReport | null;
  data: MonitorDataBundle;
  selectedEarthquake: EarthquakeReport;
  selectedTyphoon: TyphoonReport;
  activeVolcano: VolcanoStatusItem;
  activeTsunamiStation?: TsunamiStationItem;
  amedasMetric: AmedasMetric;
  onChangeAmedasMetric: (metric: AmedasMetric) => void;
  onViewportChange?: (viewport: MapViewportState) => void;
  interruptKind: InterruptKind;
  isLoopPaused: boolean;
  onSceneComplete: () => void;
}

/**
 * Custom Leaflet GridLayer for JMA High-Resolution Nowcast (`hrpns` or `thns`).
 * Rendered inside `radarPane` (z-index: 450) so rain clouds always appear ON TOP of the Japan & World maps.
 */
function createJmaSeamlessNowcastLayer(
  basetime: string,
  validtime: string,
  element: 'hrpns' | 'thns' = 'hrpns',
  opacity = 0.92,
  zIndex = 450
): L.GridLayer {
  const SeamlessLayer = L.GridLayer.extend({
    createTile: function (coords: L.Coords, done: L.DoneCallback) {
      const tile = document.createElement('div');
      tile.style.width = '256px';
      tile.style.height = '256px';
      tile.style.opacity = String(opacity);
      tile.style.pointerEvents = 'none';

      const inner = document.createElement('div');
      inner.style.position = 'relative';
      inner.style.width = '256px';
      inner.style.height = '256px';
      inner.style.overflow = 'hidden';
      tile.appendChild(inner);

      const z = coords.z;
      let zEven: number;
      if (z <= 4) {
        zEven = 4;
      } else if (z >= 10) {
        zEven = 10;
      } else {
        zEven = z % 2 === 0 ? z : z - 1;
      }

      const diff = z - zEven;
      const scale = diff >= 0 ? 1 << diff : 1;
      const xEven = diff >= 0 ? Math.floor(coords.x / scale) : coords.x;
      const yEven = diff >= 0 ? Math.floor(coords.y / scale) : coords.y;
      const offsetX = diff >= 0 ? (coords.x % scale) * 256 : 0;
      const offsetY = diff >= 0 ? (coords.y % scale) * 256 : 0;

      const img = document.createElement('img');
      img.alt = '';
      img.setAttribute('role', 'presentation');
      img.style.position = 'absolute';
      img.style.left = `-${offsetX}px`;
      img.style.top = `-${offsetY}px`;
      img.style.width = `${256 * scale}px`;
      img.style.height = `${256 * scale}px`;
      img.style.maxWidth = 'none';
      img.style.maxHeight = 'none';
      img.style.imageRendering = 'pixelated';

      img.onload = () => done(undefined, tile);
      img.onerror = () => done(undefined, tile);
      img.src = `https://www.jma.go.jp/bosai/jmatile/data/nowc/${basetime}/none/${validtime}/surf/${element}/${zEven}/${xEven}/${yEven}.png`;

      inner.appendChild(img);
      return tile;
    },
  });

  return new (SeamlessLayer as unknown as new (
    options?: L.GridLayerOptions
  ) => L.GridLayer)({
    pane: 'radarPane',
    tileSize: 256,
    minZoom: 2,
    maxZoom: 12,
    keepBuffer: 8,
    updateWhenIdle: false,
    updateWhenZooming: true,
    zIndex,
  });
}

// Unified nationwide camera position fixed to Radar's nationwide view (`[36.8, 137.5], zoom: 5`)
const NATIONAL_CAMERA_VIEW: { center: [number, number]; zoom: number } = {
  center: [36.8, 137.5],
  zoom: 5,
};

// Scene-specific camera positions when in 'national' mode
const SCENE_CAMERA_TARGETS: Record<
  SceneId,
  { center: [number, number]; zoom: number }
> = {
  warnings: NATIONAL_CAMERA_VIEW,
  radar: NATIONAL_CAMERA_VIEW,
  typhoon: { center: [37.5, 149.0], zoom: 4 },
  weather_info: NATIONAL_CAMERA_VIEW,
  amedas: NATIONAL_CAMERA_VIEW,
  forecast: NATIONAL_CAMERA_VIEW,
  volcano: { center: [31.585, 130.657], zoom: 9 },
  tsunami: { center: [33.095, 139.772], zoom: 8 },
  earthquake: { center: [36.4, 140.8], zoom: 7 },
};

function getPrefecturePolygonStyle(
  prefId: number,
  effectiveScene: SceneId,
  prefSeverityMap: Record<number, WarningSeverity>
): L.PathOptions {
  if (effectiveScene === 'warnings') {
    const severity = prefSeverityMap[prefId] || 'normal';
    if (severity === 'special') {
      return {
        fillColor: '#9333EA',
        fillOpacity: 0.95,
        color: '#E9D5FF',
        weight: 1.3,
      };
    }
    if (severity === 'warning') {
      return {
        fillColor: '#DC2626',
        fillOpacity: 0.94,
        color: '#FCA5A5',
        weight: 1.1,
      };
    }
    if (severity === 'advisory') {
      // Vivid broadcast yellow for advisories
      return {
        fillColor: '#FACC15',
        fillOpacity: 0.93,
        color: '#FEF08A',
        weight: 0.9,
      };
    }
    return {
      fillColor: '#262B36',
      fillOpacity: 0.92,
      color: '#434C5E',
      weight: 0.8,
    };
  }

  return {
    fillColor: '#232731',
    fillOpacity: 0.9,
    color: '#4B5563',
    weight: 0.9,
  };
}

export const MonitorMap: React.FC<MonitorMapProps> = ({
  activeScene,
  activeRegionConfig,
  activeWarningDivision,
  activeEew,
  activeTsunamiForecast,
  data,
  selectedEarthquake,
  selectedTyphoon,
  activeVolcano,
  activeTsunamiStation,
  amedasMetric,
  onChangeAmedasMetric,
  onViewportChange,
  interruptKind,
  isLoopPaused,
  onSceneComplete,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const worldGeoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const muniGeoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const muniBorderLayerRef = useRef<L.GeoJSON | null>(null);
  const tsunamiGeoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);
  const hrpnsLayerRef = useRef<L.GridLayer | null>(null);
  const thnsLayerRef = useRef<L.GridLayer | null>(null);
  const worldRendererRef = useRef<L.SVG | null>(null);
  const japanRendererRef = useRef<L.SVG | null>(null);
  const muniCanvasRendererRef = useRef<L.Canvas | null>(null);
  const muniBorderRendererRef = useRef<L.Canvas | null>(null);
  const overlayRendererRef = useRef<L.SVG | null>(null);
  const isFirstMountRef = useRef<boolean>(true);
  const onSceneCompleteRef = useRef<() => void>(onSceneComplete);
  const onViewportChangeRef = useRef<typeof onViewportChange>(onViewportChange);

  useEffect(() => {
    onSceneCompleteRef.current = onSceneComplete;
  }, [onSceneComplete]);

  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  const [worldGeoJsonData, setWorldGeoJsonData] = useState<any>(null);
  const [geoJsonData, setGeoJsonData] = useState<any>(null);
  const [class20GeoJsonData, setClass20GeoJsonData] = useState<any>(
    cachedClass20GeoJson
  );
  const [class10GeoJsonData, setClass10GeoJsonData] = useState<any>(
    cachedClass10GeoJson
  );
  const [tsunamiGeoJsonData, setTsunamiGeoJsonData] = useState<any>(
    cachedTsunamiGeoJson
  );
  const [radarFrameIndex, setRadarFrameIndex] = useState<number>(0);
  // radarPass: 0 = 1st loop (Rain Radar only), 1 = 2nd loop (Rain Radar + Lightning Radar & LIDEN)
  const [radarPass, setRadarPass] = useState<0 | 1>(0);
  const [mapZoomVersion, setMapZoomVersion] = useState<number>(0);
  const [eewAnimNow, setEewAnimNow] = useState<number>(Date.now());

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

  // Real-time animation clock for EEW wave front propagation (P-wave & S-wave expansion)
  useEffect(() => {
    if (!activeEew || !isEewStillActive(activeEew)) return;
    const timer = setInterval(() => {
      setEewAnimNow(Date.now());
    }, 200);
    return () => clearInterval(timer);
  }, [activeEew]);

  // Load World Countries GeoJSON, 47-prefecture Japan GeoJSON, JMA Municipality (`class20s`) + Region (`class10s`), and Tsunami coastline GeoJSON
  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}world-countries.geojson`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json) {
          setWorldGeoJsonData(json);
        }
      })
      .catch(() => {});

    fetch(`${import.meta.env.BASE_URL}japan-prefectures.geojson`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json) {
          setGeoJsonData(json);
        }
      })
      .catch(() => {});

    loadJmaMunicipalityGeoJson()
      .then(({ class20, class10 }) => {
        if (!cancelled) {
          if (class20) setClass20GeoJsonData(class20);
          if (class10) setClass10GeoJsonData(class10);
        }
      })
      .catch(() => {});

    loadJmaTsunamiGeoJson()
      .then((json) => {
        if (!cancelled && json) {
          setTsunamiGeoJsonData(json);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  // Reset radar frame index and pass to 0 whenever entering 'radar' scene
  useEffect(() => {
    if (effectiveScene === 'radar') {
      setRadarFrameIndex(0);
      setRadarPass(0);
    }
  }, [effectiveScene]);

  // Step through all radar timeframes twice per loop:
  // Pass 0 (1周目): Rain Radar (hrpns) only
  // Pass 1 (2周目): Rain Radar (hrpns) + Lightning Radar (thns + LIDEN strikes on top)
  useEffect(() => {
    if (effectiveScene !== 'radar') return;
    const totalFrames = Math.max(1, data.nowcastTimes.length);

    const timer = setTimeout(() => {
      if (radarFrameIndex < totalFrames - 1) {
        setRadarFrameIndex((prev) => prev + 1);
      } else if (radarPass === 0) {
        setRadarPass(1);
        setRadarFrameIndex(0);
      } else if (!isLoopPaused && interruptKind === 'none') {
        onSceneCompleteRef.current();
      } else {
        setRadarPass(0);
        setRadarFrameIndex(0);
      }
    }, 1800);

    return () => clearTimeout(timer);
  }, [
    effectiveScene,
    radarFrameIndex,
    radarPass,
    data.nowcastTimes.length,
    isLoopPaused,
    interruptKind,
  ]);

  // AMeDAS Camera Choreography:
  // 全国表示 -> 北海道 -> 東北 -> 関東中部近畿 -> 中国四国九州 -> 沖縄 -> もう一度全国表示
  // Smoothly moves (`flyTo`) to each regional stop and pauses briefly (`いったん止まる`) at each stop,
  // then advances to the next AMeDAS metric (`temp` -> `precip` -> `wind` -> `snow`) or next scene!
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || effectiveScene !== 'amedas') return;
    if (
      activeRegionConfig.id !== 'national' &&
      activeRegionConfig.id !== 'world'
    ) {
      return;
    }

    let cancelled = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];

    // 1. Start at Nationwide view (`全国表示`: `[36.8, 137.5], zoom: 5`)
    map.stop();
    const initialStop = AMEDAS_PATROL_STOPS[0];
    map.setView(initialStop.center, initialStop.zoom, {
      animate: false,
    });

    // Step through each stop in AMEDAS_PATROL_STOPS[1..] (`北海道 -> 東北 -> 関東中部近畿 -> 中国四国九州 -> 沖縄 -> 全国表示`)
    // Hold ~5 seconds (5000ms) at each regional stop so viewers can clearly inspect every region!
    let cumulativeDelayMs = 3500; // Initial hold on 全国表示

    for (let i = 1; i < AMEDAS_PATROL_STOPS.length; i++) {
      const stop = AMEDAS_PATROL_STOPS[i];
      const isFinalNational = i === AMEDAS_PATROL_STOPS.length - 1;
      const flyDurationSec = i === 1 || i >= 5 ? 1.5 : 1.35;
      const pauseAtStopMs = isFinalNational ? 3500 : 5000;

      const tFly = setTimeout(() => {
        if (cancelled || isLoopPaused || interruptKind !== 'none') return;
        map.stop();
        map.flyTo(stop.center, stop.zoom, {
          animate: true,
          duration: flyDurationSec,
          easeLinearity: 0.15,
        });
      }, cumulativeDelayMs);
      timers.push(tFly);

      cumulativeDelayMs += Math.round(flyDurationSec * 1000) + pauseAtStopMs;
    }

    // Complete metric / scene after holding on the final Nationwide view
    const tComplete = setTimeout(() => {
      if (cancelled || isLoopPaused || interruptKind !== 'none') return;
      onSceneCompleteRef.current();
    }, cumulativeDelayMs);
    timers.push(tComplete);

    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
    };
  }, [
    effectiveScene,
    amedasMetric,
    activeRegionConfig.id,
    isLoopPaused,
    interruptKind,
  ]);

  // Initialize Leaflet Map once with large-padding SVG/Canvas renderers and explicit z-index panes
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [36.8, 137.5],
      zoom: 5,
      minZoom: 2,
      maxZoom: 12,
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 60,
      worldCopyJump: true,
    });

    // 1. Create dedicated panes in strict bottom-to-top z-index order:
    //    worldPane (210) -> japanPane (350) -> muniPane (360) -> muniBorderPane (365) -> radarPane (450) -> vectorOverlayPane (500) -> markerPane (600)
    const worldPane = map.createPane('worldPane');
    worldPane.style.zIndex = '210';
    worldPane.style.pointerEvents = 'none';

    const japanPane = map.createPane('japanPane');
    japanPane.style.zIndex = '350';
    japanPane.style.pointerEvents = 'none';

    const muniPane = map.createPane('muniPane');
    muniPane.style.zIndex = '360';
    muniPane.style.pointerEvents = 'none';

    const muniBorderPane = map.createPane('muniBorderPane');
    muniBorderPane.style.zIndex = '365';
    muniBorderPane.style.pointerEvents = 'none';

    const radarPane = map.createPane('radarPane');
    radarPane.style.zIndex = '450';
    radarPane.style.pointerEvents = 'none';

    const vectorOverlayPane = map.createPane('vectorOverlayPane');
    vectorOverlayPane.style.zIndex = '500';

    // 2. Create high-padding SVG/Canvas renderers
    worldRendererRef.current = L.svg({
      padding: 3.5,
      pane: 'worldPane',
    }).addTo(map);
    japanRendererRef.current = L.svg({
      padding: 3.5,
      pane: 'japanPane',
    }).addTo(map);
    muniCanvasRendererRef.current = L.canvas({
      padding: 0.6,
      pane: 'muniPane',
    }).addTo(map);
    muniBorderRendererRef.current = L.canvas({
      padding: 0.6,
      pane: 'muniBorderPane',
    }).addTo(map);
    overlayRendererRef.current = L.svg({
      padding: 3.5,
      pane: 'vectorOverlayPane',
    }).addTo(map);

    const overlayGroup = L.layerGroup().addTo(map);
    overlayGroupRef.current = overlayGroup;

    const emitViewport = () => {
      setMapZoomVersion((v) => v + 1);
      if (onViewportChangeRef.current) {
        const c = map.getCenter();
        const b = map.getBounds();
        onViewportChangeRef.current({
          zoom: map.getZoom(),
          center: [c.lat, c.lng],
          bounds: {
            north: b.getNorth(),
            south: b.getSouth(),
            east: b.getEast(),
            west: b.getWest(),
          },
          inferredRegionId: inferRegionFromCoords(c.lat, c.lng).regionId,
        });
      }
    };

    map.on('zoomend', emitViewport);
    map.on('moveend', emitViewport);

    mapInstanceRef.current = map;
    emitViewport();

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Render World Countries Vector Layer (seamless global map with zero tile-load delay)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !worldGeoJsonData || !worldRendererRef.current) return;

    if (worldGeoJsonLayerRef.current) {
      map.removeLayer(worldGeoJsonLayerRef.current);
      worldGeoJsonLayerRef.current = null;
    }

    const worldLayer = L.geoJSON(worldGeoJsonData, {
      pane: 'worldPane',
      style: () => ({
        pane: 'worldPane',
        renderer: worldRendererRef.current ?? undefined,
        fillColor: '#1B1F28',
        fillOpacity: 0.9,
        color: '#384152',
        weight: 0.7,
      }),
      interactive: false,
    }).addTo(map);

    worldGeoJsonLayerRef.current = worldLayer;
  }, [worldGeoJsonData]);

  // Render / Update 47-prefecture Japan GeoJSON Base Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !geoJsonData || !japanRendererRef.current) return;

    if (geoJsonLayerRef.current) {
      map.removeLayer(geoJsonLayerRef.current);
      geoJsonLayerRef.current = null;
    }

    const hasMuniPolygons =
      effectiveScene === 'warnings' && Boolean(class20GeoJsonData);

    const layer = L.geoJSON(geoJsonData, {
      pane: 'japanPane',
      style: (feature) => {
        const prefId = Number(feature?.properties?.id || 0);
        if (hasMuniPolygons) {
          return {
            fillColor: '#374151',
            fillOpacity: 0.92,
            color: '#1E293B',
            weight: 0.8,
            pane: 'japanPane',
            renderer: japanRendererRef.current ?? undefined,
          };
        }
        return {
          ...getPrefecturePolygonStyle(
            prefId,
            effectiveScene,
            data.prefSeverityMap
          ),
          pane: 'japanPane',
          renderer: japanRendererRef.current ?? undefined,
        };
      },
      interactive: false,
    }).addTo(map);

    geoJsonLayerRef.current = layer;
  }, [geoJsonData, class20GeoJsonData, effectiveScene, data.prefSeverityMap]);

  // Render Municipality-level (`市区町村単位: class20s`) Choropleth Layer + Crisp Municipality & Division Boundaries
  // in `warnings` scene (both in Nationwide view and Zoomed-in view!)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !muniCanvasRendererRef.current || !muniBorderRendererRef.current)
      return;

    if (muniGeoJsonLayerRef.current) {
      map.removeLayer(muniGeoJsonLayerRef.current);
      muniGeoJsonLayerRef.current = null;
    }
    if (muniBorderLayerRef.current) {
      map.removeLayer(muniBorderLayerRef.current);
      muniBorderLayerRef.current = null;
    }

    if (effectiveScene !== 'warnings' || !class20GeoJsonData) return;

    const muniMap = data.muniSeverityMap || {};

    const muniLayer = L.geoJSON(class20GeoJsonData, {
      pane: 'muniPane',
      style: (feature) => {
        const code = String(feature?.properties?.code || '');
        const sev: WarningSeverity = muniMap[code] || 'normal';
        const fillColor =
          sev === 'special'
            ? '#9333EA'
            : sev === 'warning'
              ? '#EF4444'
              : sev === 'advisory'
                ? '#FACC15'
                : '#374151';
        return {
          pane: 'muniPane',
          renderer: muniCanvasRendererRef.current ?? undefined,
          fillColor,
          fillOpacity: 0.95,
          // Crisp municipality boundary lines (`市区町村の境目には境界線がわかるようにする`)
          color: '#1E293B',
          weight: 0.65,
          opacity: 0.95,
        };
      },
      interactive: false,
    }).addTo(map);
    muniGeoJsonLayerRef.current = muniLayer;

    const borderSource = class10GeoJsonData || geoJsonData;
    if (borderSource) {
      const borderLayer = L.geoJSON(borderSource, {
        pane: 'muniBorderPane',
        style: () => ({
          pane: 'muniBorderPane',
          renderer: muniBorderRendererRef.current ?? undefined,
          fillOpacity: 0,
          color: '#0F172A',
          weight: 1.35,
          opacity: 0.95,
        }),
        interactive: false,
      }).addTo(map);
      muniBorderLayerRef.current = borderLayer;
    }
  }, [
    effectiveScene,
    class20GeoJsonData,
    class10GeoJsonData,
    geoJsonData,
    data.muniSeverityMap,
  ]);

  // Render JMA Tsunami Coastline Vector Layer (`tsunami.json`) in `tsunami` scene
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tsunamiGeoJsonLayerRef.current) {
      map.removeLayer(tsunamiGeoJsonLayerRef.current);
      tsunamiGeoJsonLayerRef.current = null;
    }

    if (effectiveScene !== 'tsunami' || !tsunamiGeoJsonData) return;

    const areaForecasts = activeTsunamiForecast?.areas || [];
    const areaMapByCode: Record<string, TsunamiForecastArea> = {};
    const areaMapByName: Record<string, TsunamiForecastArea> = {};
    for (const a of areaForecasts) {
      if (a.code) areaMapByCode[a.code] = a;
      if (a.name) areaMapByName[a.name] = a;
    }

    const tsunamiLayer = L.geoJSON(tsunamiGeoJsonData, {
      pane: 'vectorOverlayPane',
      style: (feature) => {
        const code = String(
          feature?.properties?.code || feature?.properties?.areaCode || ''
        );
        const name = String(feature?.properties?.name || '');
        const matched = areaMapByCode[code] || areaMapByName[name];
        const grade = matched?.grade;
        if (grade && grade !== 'Unknown') {
          const gradeStyle = getTsunamiGradeStyle(grade);
          const weight =
            grade === 'MajorWarning'
              ? 6.5
              : grade === 'Warning'
                ? 5.0
                : grade === 'Watch'
                  ? 4.0
                  : 3.0;
          return {
            pane: 'vectorOverlayPane',
            renderer: overlayRendererRef.current ?? undefined,
            color: gradeStyle.hex,
            weight,
            opacity: 1,
            lineCap: 'round',
            lineJoin: 'round',
          };
        }
        return {
          pane: 'vectorOverlayPane',
          renderer: overlayRendererRef.current ?? undefined,
          color: '#334155',
          weight: 1.5,
          opacity: 0.45,
        };
      },
      interactive: true,
      onEachFeature: (feature, layer) => {
        const code = String(
          feature?.properties?.code || feature?.properties?.areaCode || ''
        );
        const name = String(feature?.properties?.name || '');
        const matched = areaMapByCode[code] || areaMapByName[name];
        if (matched && matched.grade && matched.grade !== 'Unknown') {
          const gradeStyle = getTsunamiGradeStyle(matched.grade);
          const heightStr = matched.maxHeightText
            ? `予想の高さ: ${matched.maxHeightText}`
            : '';
          const arrivalStr = matched.firstHeightText
            ? `第1波: ${matched.firstHeightText}`
            : '';
          layer.bindTooltip(
            `
            <div style="font-family:'JetBrains Mono',monospace;font-size:12px;padding:3px 6px;">
              <strong style="color:${gradeStyle.hex};">${gradeStyle.label}</strong>: ${matched.name}<br/>
              ${heightStr ? `<span style="color:#FFF;">${heightStr}</span><br/>` : ''}
              ${arrivalStr ? `<span style="color:#CBD5E1;">${arrivalStr}</span>` : ''}
            </div>
          `,
            { sticky: true, className: 'tsunami-coastline-tooltip' }
          );
        }
      },
    }).addTo(map);

    tsunamiGeoJsonLayerRef.current = tsunamiLayer;
  }, [effectiveScene, tsunamiGeoJsonData, activeTsunamiForecast]);

  // Compute target camera center & zoom for the active scene
  const getSceneCameraTarget = (): {
    center: [number, number];
    zoom: number;
  } => {
    if (effectiveScene === 'earthquake') {
      if (
        activeEew &&
        typeof activeEew.lat === 'number' &&
        !Number.isNaN(activeEew.lat) &&
        typeof activeEew.lon === 'number' &&
        !Number.isNaN(activeEew.lon)
      ) {
        return {
          center: [activeEew.lat, activeEew.lon],
          zoom: 7.2,
        };
      }
      const validStations = selectedEarthquake.stations.filter(
        (s): s is typeof s & { lat: number; lon: number } =>
          typeof s.lat === 'number' &&
          typeof s.lon === 'number' &&
          !Number.isNaN(s.lat) &&
          !Number.isNaN(s.lon)
      );
      if (validStations.length > 0) {
        const lats = [
          selectedEarthquake.lat,
          ...validStations.map((s) => s.lat),
        ];
        const lons = [
          selectedEarthquake.lon,
          ...validStations.map((s) => s.lon),
        ];
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);
        const latSpan = maxLat - minLat;
        const lonSpan = maxLon - minLon;
        const targetZoom =
          latSpan <= 1.2 && lonSpan <= 1.5
            ? 8
            : latSpan <= 3.8 && lonSpan <= 4.8
              ? 7
              : 6;
        return {
          center: [(minLat + maxLat) / 2, (minLon + maxLon) / 2],
          zoom: targetZoom,
        };
      }
      return {
        center: [selectedEarthquake.lat, selectedEarthquake.lon],
        zoom: 7,
      };
    }
    if (effectiveScene === 'volcano') {
      return {
        center: [activeVolcano.lat, activeVolcano.lon],
        zoom: 9,
      };
    }
    if (effectiveScene === 'tsunami') {
      return {
        center: [37.2, 137.5],
        zoom: 5.2,
      };
    }
    if (effectiveScene === 'typhoon') {
      const targetList =
        data.typhoons.length > 0 ? data.typhoons : [selectedTyphoon];
      const allLats: number[] = [];
      const allLons: number[] = [];
      for (const tc of targetList) {
        for (const p of tc.points) {
          allLats.push(p.lat);
          allLons.push(p.lon);
        }
        if (Array.isArray(tc.pastTrack)) {
          for (const [lat, lon] of tc.pastTrack) {
            allLats.push(lat);
            allLons.push(lon);
          }
        }
      }
      if (allLats.length > 0) {
        const minLat = Math.min(...allLats, 30.0);
        const maxLat = Math.max(...allLats, 45.5);
        const minLon = Math.min(...allLons, 132.0);
        const maxLon = Math.max(...allLons);
        const latSpan = maxLat - minLat;
        const lonSpan = maxLon - minLon;
        const targetZoom = latSpan > 11 || lonSpan > 18 ? 4 : 5;
        return {
          center: [(minLat + maxLat) / 2, (minLon + maxLon) / 2 + 2.0],
          zoom: targetZoom,
        };
      }
    }
    if (effectiveScene === 'warnings' && activeWarningDivision) {
      return {
        center: [activeWarningDivision.lat, activeWarningDivision.lon],
        zoom: activeWarningDivision.zoom || 7,
      };
    }
    if (activeRegionConfig.id === 'world') {
      return {
        center: activeRegionConfig.center,
        zoom: activeRegionConfig.zoom,
      };
    }
    if (activeRegionConfig.id === 'national') {
      const sceneTarget = SCENE_CAMERA_TARGETS[effectiveScene];
      if (sceneTarget) {
        return sceneTarget;
      }
    }
    return {
      center: activeRegionConfig.center,
      zoom: activeRegionConfig.zoom,
    };
  };

  // High-acceleration camera flight (`flyTo`) on scene, warning division patrol, region, typhoon, or interrupt change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const { center: targetCenter, zoom: targetZoom } = getSceneCameraTarget();

    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      map.setView(targetCenter, targetZoom, { animate: false });
      return;
    }

    // In 'amedas' national mode, the dedicated AMeDAS sweep effect controls the camera
    if (
      effectiveScene === 'amedas' &&
      (activeRegionConfig.id === 'national' ||
        activeRegionConfig.id === 'world')
    ) {
      return;
    }

    const curCenter = map.getCenter();
    const curZoom = map.getZoom();
    if (
      Math.abs(curCenter.lat - targetCenter[0]) < 0.005 &&
      Math.abs(curCenter.lng - targetCenter[1]) < 0.005 &&
      curZoom === targetZoom
    ) {
      return;
    }

    map.stop();
    map.flyTo(targetCenter, targetZoom, {
      animate: true,
      duration: 1.8,
      easeLinearity: 0.08,
    });
  }, [
    effectiveScene,
    activeRegionConfig,
    activeWarningDivision?.id,
    activeWarningDivision?.lat,
    activeWarningDivision?.lon,
    selectedEarthquake.id,
    selectedEarthquake.lat,
    selectedEarthquake.lon,
    selectedTyphoon.id,
    activeVolcano.id,
    activeVolcano.lat,
    activeVolcano.lon,
    activeEew?.id,
    activeEew?.serial,
    activeTsunamiForecast?.areas.length,
  ]);

  // Update JMA High-Resolution Precipitation Nowcast (`hrpns`) + Lightning Nowcast (`thns`)
  // Rendered inside `radarPane` (z-index: 450) directly ON TOP of the Japan & World maps
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (hrpnsLayerRef.current) {
      map.removeLayer(hrpnsLayerRef.current);
      hrpnsLayerRef.current = null;
    }
    if (thnsLayerRef.current) {
      map.removeLayer(thnsLayerRef.current);
      thnsLayerRef.current = null;
    }

    if (effectiveScene === 'radar' && data.nowcastTimes.length > 0) {
      const safeIdx = Math.min(radarFrameIndex, data.nowcastTimes.length - 1);
      const entry = data.nowcastTimes[safeIdx];
      if (entry && entry.basetime && entry.validtime) {
        const hrpnsLayer = createJmaSeamlessNowcastLayer(
          entry.basetime,
          entry.validtime,
          'hrpns',
          0.92,
          450
        );
        hrpnsLayer.addTo(map);
        hrpnsLayerRef.current = hrpnsLayer;

        // Overlay Lightning Nowcast (`thns`) on top ONLY during Pass 1 (2周目: 雨雲＋雷レーダー)
        if (radarPass === 1 && entry.thnsBasetime && entry.thnsValidtime) {
          const thnsLayer = createJmaSeamlessNowcastLayer(
            entry.thnsBasetime,
            entry.thnsValidtime,
            'thns',
            0.84,
            460
          );
          thnsLayer.addTo(map);
          thnsLayerRef.current = thnsLayer;
        }
      }
    }
  }, [effectiveScene, radarFrameIndex, radarPass, data.nowcastTimes]);

  // Render scene-specific markers & Typhoon Track / Forecast Cone in `vectorOverlayPane` (padding: 3.5)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = overlayGroupRef.current;
    const overlayRenderer = overlayRendererRef.current;
    if (!group || !map || !overlayRenderer) return;
    group.clearLayers();

    if (effectiveScene === 'radar') {
      const safeIdx = Math.min(radarFrameIndex, data.nowcastTimes.length - 1);
      const currentEntry = data.nowcastTimes[safeIdx];
      // Show LIDEN lightning strikes ONLY during Pass 1 (2周目) AND ONLY for past observation frames (!isForecast)
      // matched to the current frame's validtime. Never show LIDEN on high-resolution forecast frames!
      if (radarPass === 1 && currentEntry && !currentEntry.isForecast) {
        const frameLightning = data.lightningPoints.filter((pt) =>
          pt.validtime ? pt.validtime === currentEntry.validtime : true
        );
        for (const pt of frameLightning) {
          L.circleMarker([pt.lat, pt.lon], {
            pane: 'vectorOverlayPane',
            renderer: overlayRenderer,
            radius: 4.5,
            color: '#FEF08A',
            fillColor: '#FACC15',
            fillOpacity: 0.95,
            weight: 1.5,
            interactive: false,
          }).addTo(group);
        }
      }
    } else if (effectiveScene === 'warnings') {
      // Choropleth polygons color the map directly.
      // When zoomed in (`currentZoom >= 6`), render municipality-level (`市区町村名のみ`) labels on the map!
      const currentZoom = map.getZoom();
      const muniList = data.municipalityWarnings || [];
      if (currentZoom >= 6 && muniList.length > 0) {
        const bounds = map.getBounds();
        const visibleMunis = muniList
          .map((m) => {
            const exactCoord = m.muniCode
              ? cachedClass20LabelPoints[m.muniCode]
              : undefined;
            return exactCoord
              ? { ...m, lat: exactCoord[0], lon: exactCoord[1] }
              : m;
          })
          .filter(
            (m) =>
              m.lat >= bounds.getSouth() - 0.8 &&
              m.lat <= bounds.getNorth() + 0.8 &&
              m.lon >= bounds.getWest() - 0.8 &&
              m.lon <= bounds.getEast() + 0.8
          )
          .sort((a, b) => {
            const rank: Record<WarningSeverity, number> = {
              special: 3,
              warning: 2,
              advisory: 1,
              normal: 0,
            };
            return rank[b.severity] - rank[a.severity];
          });

        const placedMuniBoxes: Array<{
          x: number;
          y: number;
          w: number;
          h: number;
        }> = [];
        for (const muni of visibleMunis) {
          const ptScreen = map.project([muni.lat, muni.lon], currentZoom);
          // Strictly show ONLY the municipality name in white text without a surrounding rectangular box
          // (`地名表示は四角に囲まず文字だけを白文字で表示するように`)
          const labelText = formatMunicipalityMapLabel(muni);
          if (!labelText) continue;
          const boxW = Math.max(38, labelText.length * 11 + 4);
          const boxH = 16;

          let overlaps = false;
          for (let i = 0; i < placedMuniBoxes.length; i++) {
            const b = placedMuniBoxes[i];
            if (
              Math.abs(ptScreen.x - b.x) < (boxW + b.w) / 2 + 3 &&
              Math.abs(ptScreen.y - b.y) < (boxH + b.h) / 2 + 3
            ) {
              overlaps = true;
              break;
            }
          }
          if (overlaps) continue;
          placedMuniBoxes.push({
            x: ptScreen.x,
            y: ptScreen.y,
            w: boxW,
            h: boxH,
          });

          const muniIcon = L.divIcon({
            className: 'custom-muni-warning-badge',
            html: `
              <div data-testid="muni-warning-map-badge" style="display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;font-family:'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif;pointer-events:none;">
                <span style="color:#FFFFFF;font-size:11px;font-weight:800;letter-spacing:0.02em;text-shadow:-1.5px -1.5px 0 #0B0D12,1.5px -1.5px 0 #0B0D12,-1.5px 1.5px 0 #0B0D12,1.5px 1.5px 0 #0B0D12,0 0 4px rgba(0,0,0,0.95);">${labelText}</span>
              </div>
            `,
            iconSize: [boxW, boxH],
            iconAnchor: [Math.round(boxW / 2), Math.round(boxH / 2)],
          });
          L.marker([muni.lat, muni.lon], {
            icon: muniIcon,
            interactive: false,
          }).addTo(group);
        }
      }
    } else if (effectiveScene === 'typhoon') {
      const targetZoom = getSceneCameraTarget().zoom;
      const currentZoom = map.getZoom();
      const projectionZoom =
        Math.abs(currentZoom - targetZoom) <= 1 ? currentZoom : targetZoom;

      // Track placed screen-space bounding boxes so typhoon labels and forecast time badges never overlap
      const placedBoxes: Array<{
        x: number;
        y: number;
        w: number;
        h: number;
      }> = [];

      const collidesWithPlaced = (
        x: number,
        y: number,
        w: number,
        h: number,
        gap = 4
      ): boolean => {
        for (let i = 0; i < placedBoxes.length; i++) {
          const b = placedBoxes[i];
          if (
            Math.abs(x - b.x) < (w + b.w) / 2 + gap &&
            Math.abs(y - b.y) < (h + b.h) / 2 + gap
          ) {
            return true;
          }
        }
        return false;
      };

      const typhoonsToRender =
        data.typhoons.length > 0 ? data.typhoons : [selectedTyphoon];

      for (const tc of typhoonsToRender) {
        const pts = tc.points;
        if (pts.length === 0) continue;
        const extratropical = isExtratropicalCyclone(tc);

        // Reserve all track point dots in placedBoxes so labels don't cover track dots
        for (const p of pts) {
          const dotScreen = map.project([p.lat, p.lon], projectionZoom);
          placedBoxes.push({ x: dotScreen.x, y: dotScreen.y, w: 16, h: 16 });
        }

        // Special Case: Already converted to Extratropical Cyclone (`温帯低気圧`)
        // -> Single solid gray line (`#9CA3AF`) with NO intermediate circle dots!
        if (extratropical) {
          const grayTrackCoords: Array<[number, number]> = [];
          if (Array.isArray(tc.pastTrack)) {
            for (const c of tc.pastTrack) {
              grayTrackCoords.push([c[0], c[1]]);
            }
          }
          for (const p of pts) {
            const last = grayTrackCoords[grayTrackCoords.length - 1];
            if (
              !last ||
              Math.abs(last[0] - p.lat) > 0.001 ||
              Math.abs(last[1] - p.lon) > 0.001
            ) {
              grayTrackCoords.push([p.lat, p.lon]);
            }
          }
          if (grayTrackCoords.length >= 2) {
            L.polyline(grayTrackCoords, {
              pane: 'vectorOverlayPane',
              renderer: overlayRenderer,
              color: '#9CA3AF',
              weight: 2.8,
              opacity: 0.92,
              interactive: false,
            }).addTo(group);
          }

          const pt0 = pts[0];
          const centerLabel = formatCompactTyphoonCenterLabel(tc, pt0);
          const ptScreen = map.project([pt0.lat, pt0.lon], projectionZoom);
          const badgeW = Math.max(72, centerLabel.length * 13 + 16);
          const badgeH = 22;
          placedBoxes.push({
            x: ptScreen.x,
            y: ptScreen.y + 24,
            w: badgeW,
            h: badgeH,
          });

          const centerCrossIcon = L.divIcon({
            className: 'custom-typhoon-center-cross',
            html: `
              <div style="position:relative;display:flex;align-items:center;justify-content:center;width:28px;height:28px;">
                <svg data-testid="typhoon-center-cross" width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M5 5L19 19M19 5L5 19" stroke="#0B0D12" stroke-width="5.5" stroke-linecap="square"/>
                  <path d="M5 5L19 19M19 5L5 19" stroke="#D1D5DB" stroke-width="3" stroke-linecap="square"/>
                </svg>
                <div data-testid="typhoon-center-label" style="position:absolute;top:24px;left:50%;transform:translateX(-50%);background:rgba(17,19,24,0.95);border:1.5px solid #9CA3AF;padding:1px 7px;white-space:nowrap;font-family:'JetBrains Mono',monospace;box-shadow:0 2px 8px rgba(0,0,0,0.75);">
                  <span style="color:#E5E7EB;font-size:11px;font-weight:800;">${centerLabel}</span>
                </div>
              </div>
            `,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          L.marker([pt0.lat, pt0.lon], {
            icon: centerCrossIcon,
            zIndexOffset: 950,
          }).addTo(group);
          continue;
        }

        // 0. Historical Past Track (過去の移動軌跡 — 実線＋小ドット)
        if (Array.isArray(tc.pastTrack) && tc.pastTrack.length >= 2) {
          L.polyline(tc.pastTrack, {
            pane: 'vectorOverlayPane',
            renderer: overlayRenderer,
            color: '#38BDF8',
            weight: 2.5,
            opacity: 0.9,
            interactive: false,
          }).addTo(group);

          for (let i = 0; i < tc.pastTrack.length - 1; i++) {
            const [pLat, pLon] = tc.pastTrack[i];
            L.circleMarker([pLat, pLon], {
              pane: 'vectorOverlayPane',
              renderer: overlayRenderer,
              radius: 2.6,
              color: '#0B0D12',
              fillColor: '#38BDF8',
              fillOpacity: 0.9,
              weight: 1,
              interactive: false,
            }).addTo(group);
          }
        }

        // 1. Forecast Cone Envelope (進路予報円の包絡線・扇形)
        const cone = computeTyphoonConeEnvelope(pts);
        if (cone.polygon.length >= 4) {
          L.polygon(cone.polygon, {
            pane: 'vectorOverlayPane',
            renderer: overlayRenderer,
            color: 'transparent',
            fillColor: '#F8FAFC',
            fillOpacity: 0.12,
            interactive: false,
          }).addTo(group);

          L.polyline(cone.leftEdge, {
            pane: 'vectorOverlayPane',
            renderer: overlayRenderer,
            color: '#E2E8F0',
            weight: 1.8,
            dashArray: '6 4',
            interactive: false,
          }).addTo(group);

          L.polyline(cone.rightEdge, {
            pane: 'vectorOverlayPane',
            renderer: overlayRenderer,
            color: '#E2E8F0',
            weight: 1.8,
            dashArray: '6 4',
            interactive: false,
          }).addTo(group);
        }

        // 2. Analysis Gale Warning Zone (強風域 15m/s以上 — 黄色円) & Storm Warning Zone (暴風域 25m/s以上 — 赤色円)
        const currentPt = pts[0];
        if (currentPt.galeRadiusKm > 0) {
          L.circle([currentPt.lat, currentPt.lon], {
            pane: 'vectorOverlayPane',
            renderer: overlayRenderer,
            radius: currentPt.galeRadiusKm * 1000,
            color: '#FACC15',
            weight: 2,
            fillColor: '#EAB308',
            fillOpacity: 0.18,
            interactive: false,
          }).addTo(group);
        }
        if (currentPt.stormRadiusKm > 0) {
          L.circle([currentPt.lat, currentPt.lon], {
            pane: 'vectorOverlayPane',
            renderer: overlayRenderer,
            radius: currentPt.stormRadiusKm * 1000,
            color: '#EF4444',
            weight: 2.5,
            fillColor: '#DC2626',
            fillOpacity: 0.3,
            interactive: false,
          }).addTo(group);
        }

        // 3. Forecast Center Track Polyline (中心進路予想線 — 破線)
        const trackCoords: Array<[number, number]> = pts.map((p) => [
          p.lat,
          p.lon,
        ]);
        L.polyline(trackCoords, {
          pane: 'vectorOverlayPane',
          renderer: overlayRenderer,
          color: '#38BDF8',
          weight: 2.5,
          dashArray: '6 4',
          interactive: false,
        }).addTo(group);

        // 4. Forecast Probability Circles (予報円) & Storm Warning Probability Circles (暴風警戒域)
        pts.forEach((pt, idx) => {
          if (idx > 0 && pt.probabilityCircleRadiusKm > 0) {
            if (pt.stormRadiusKm > 0) {
              L.circle([pt.lat, pt.lon], {
                pane: 'vectorOverlayPane',
                renderer: overlayRenderer,
                radius: (pt.probabilityCircleRadiusKm + pt.stormRadiusKm) * 1000,
                color: '#EF4444',
                weight: 1.8,
                dashArray: '5 4',
                fillColor: '#EF4444',
                fillOpacity: 0.08,
                interactive: false,
              }).addTo(group);
            }

            L.circle([pt.lat, pt.lon], {
              pane: 'vectorOverlayPane',
              renderer: overlayRenderer,
              radius: pt.probabilityCircleRadiusKm * 1000,
              color: '#FFFFFF',
              weight: 1.8,
              dashArray: '5 5',
              fillColor: '#FFFFFF',
              fillOpacity: 0.08,
              interactive: false,
            }).addTo(group);
          }

          // 5. Point Markers & Compact Non-Overlapping Labels
          if (idx === 0) {
            const centerLabel = formatCompactTyphoonCenterLabel(tc, pt);
            const ptScreen = map.project([pt.lat, pt.lon], projectionZoom);
            const badgeW = Math.max(72, centerLabel.length * 13 + 16);
            const badgeH = 22;
            placedBoxes.push({
              x: ptScreen.x,
              y: ptScreen.y + 24,
              w: badgeW,
              h: badgeH,
            });

            const centerCrossIcon = L.divIcon({
              className: 'custom-typhoon-center-cross',
              html: `
                <div style="position:relative;display:flex;align-items:center;justify-content:center;width:28px;height:28px;">
                  <svg data-testid="typhoon-center-cross" width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M5 5L19 19M19 5L5 19" stroke="#0B0D12" stroke-width="5.5" stroke-linecap="square"/>
                    <path d="M5 5L19 19M19 5L5 19" stroke="#FFFFFF" stroke-width="3" stroke-linecap="square"/>
                  </svg>
                  <div data-testid="typhoon-center-label" style="position:absolute;top:24px;left:50%;transform:translateX(-50%);background:rgba(17,19,24,0.95);border:1.5px solid #EF4444;padding:1px 7px;white-space:nowrap;font-family:'JetBrains Mono',monospace;box-shadow:0 2px 8px rgba(0,0,0,0.75);">
                    <span style="color:#FFFFFF;font-size:11px;font-weight:800;">${centerLabel}</span>
                  </div>
                </div>
              `,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            });
            L.marker([pt.lat, pt.lon], {
              icon: centerCrossIcon,
              zIndexOffset: 1000,
            }).addTo(group);
          } else {
            L.circleMarker([pt.lat, pt.lon], {
              pane: 'vectorOverlayPane',
              renderer: overlayRenderer,
              radius: 4.5,
              color: '#0F172A',
              fillColor: '#FFFFFF',
              fillOpacity: 1,
              weight: 1.5,
              interactive: false,
            }).addTo(group);

            const compactTime = formatCompactTyphoonTime(pt.timeLabel);
            const ptScreen = map.project([pt.lat, pt.lon], projectionZoom);
            const boxW = 68;
            const boxH = 20;

            // Try 4 candidate offsets around the forecast point so labels never overlap
            const candidates: Array<{
              dx: number;
              dy: number;
              anchorX: number;
              anchorY: number;
            }> =
              idx % 2 === 1
                ? [
                    { dx: 44, dy: 0, anchorX: -10, anchorY: 10 },
                    { dx: -44, dy: 0, anchorX: 78, anchorY: 10 },
                    { dx: 0, dy: -22, anchorX: 34, anchorY: 32 },
                    { dx: 0, dy: 22, anchorX: 34, anchorY: -12 },
                  ]
                : [
                    { dx: -44, dy: 0, anchorX: 78, anchorY: 10 },
                    { dx: 44, dy: 0, anchorX: -10, anchorY: 10 },
                    { dx: 0, dy: -22, anchorX: 34, anchorY: 32 },
                    { dx: 0, dy: 22, anchorX: 34, anchorY: -12 },
                  ];

            const chosen = candidates.find(
              (c) =>
                !collidesWithPlaced(
                  ptScreen.x + c.dx,
                  ptScreen.y + c.dy,
                  boxW,
                  boxH,
                  4
                )
            );

            if (chosen) {
              placedBoxes.push({
                x: ptScreen.x + chosen.dx,
                y: ptScreen.y + chosen.dy,
                w: boxW,
                h: boxH,
              });

              const fcIcon = L.divIcon({
                className: 'custom-typhoon-fc-label',
                html: `
                  <div data-testid="typhoon-fc-compact-label" style="display:inline-flex;align-items:center;justify-content:center;width:${boxW}px;height:${boxH}px;background:rgba(17,19,24,0.92);border:1px solid #94A3B8;padding:1px 5px;white-space:nowrap;font-family:'JetBrains Mono',monospace;">
                    <span style="color:#38BDF8;font-size:11px;font-weight:800;">${compactTime}</span>
                  </div>
                `,
                iconSize: [boxW, boxH],
                iconAnchor: [chosen.anchorX, chosen.anchorY],
              });
              L.marker([pt.lat, pt.lon], { icon: fcIcon }).addTo(group);
            }
          }
        });
      }
    } else if (effectiveScene === 'amedas') {
      const currentZoom = map.getZoom();
      const pointRadius = getAmedasPointRadiusForZoom(currentZoom);

      // Display ALL observing AMeDAS stations on the map (`アメダスは地図上に今まで通り、全地点の点を表示する。ランキングとは異なる。`)
      // ('precip' and 'snow' hide stations with 0mm / 0cm)
      const stationsToRender = data.amedas.filter((st) => {
        if (amedasMetric === 'precip') return st.precip1h > 0;
        if (amedasMetric === 'snow') return (st.snowCm ?? 0) > 0;
        if (amedasMetric === 'wind') return st.windSpeed > 0;
        return st.hasTemp !== false && !Number.isNaN(st.temp);
      });

      for (const st of stationsToRender) {
        const dotColor = getAmedasMetricColor(st, amedasMetric);

        if (amedasMetric === 'wind') {
          const rotDeg = getWindDirectionRotationDeg(st.windDirection);
          const arrowPx = getAmedasWindArrowSizeForZoom(currentZoom);
          const halfPx = Math.round(arrowPx / 2);
          const windArrowIcon = L.divIcon({
            className: 'custom-amedas-wind-arrow',
            html: `
              <div data-testid="amedas-wind-arrow" title="${st.stationName}: ${st.windDirection} ${st.windSpeed.toFixed(1)}m/s" style="display:flex;align-items:center;justify-content:center;width:${arrowPx}px;height:${arrowPx}px;transform:rotate(${rotDeg}deg);pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.85));">
                <svg width="${arrowPx}" height="${arrowPx}" viewBox="0 0 24 24" fill="none">
                  <path d="M12 1L21 21L12 16.2L3 21L12 1Z" fill="${dotColor}" stroke="#0B0D12" stroke-width="1.8" stroke-linejoin="round"/>
                </svg>
              </div>
            `,
            iconSize: [arrowPx, arrowPx],
            iconAnchor: [halfPx, halfPx],
          });
          L.marker([st.lat, st.lon], {
            icon: windArrowIcon,
            interactive: false,
          }).addTo(group);
        } else {
          L.circleMarker([st.lat, st.lon], {
            pane: 'vectorOverlayPane',
            renderer: overlayRenderer,
            className: 'amedas-station-circle',
            radius: pointRadius,
            color: '#0B0D12',
            fillColor: dotColor,
            fillOpacity: 0.96,
            weight: currentZoom >= 6 ? 1.0 : 0.6,
            interactive: false,
          }).addTo(group);
        }
      }
    } else if (effectiveScene === 'forecast') {
      // Dedicated ocean-side callout positions + leader lines so no two city labels ever overlap
      const FORECAST_LABEL_COORDS: Record<string, [number, number]> = {
        'fc-016000': [43.8, 138.2], // 札幌 -> 日本海側北西
        'fc-040000': [38.6, 143.6], // 仙台 -> 太平洋側東
        'fc-150000': [39.3, 135.8], // 新潟 -> 日本海側北西
        'fc-130000': [35.6, 143.1], // 東京 -> 太平洋側東
        'fc-230000': [32.9, 139.2], // 名古屋 -> 太平洋側南東
        'fc-270000': [36.9, 133.2], // 大阪 -> 日本海側北西
        'fc-340000': [31.3, 134.4], // 広島・高松 -> 四国沖南
        'fc-400000': [33.8, 127.1], // 福岡・鹿児島 -> 東シナ海西
        'fc-471000': [26.2, 130.6], // 那覇 -> 太平洋側東
      };

      for (const fc of data.forecasts) {
        const targetPos = FORECAST_LABEL_COORDS[fc.id] || [
          fc.lat + 0.8,
          fc.lon + 1.8,
        ];

        // Leader line from city coordinate to callout box
        L.polyline(
          [
            [fc.lat, fc.lon],
            [targetPos[0], targetPos[1]],
          ],
          {
            pane: 'vectorOverlayPane',
            renderer: overlayRenderer,
            color: '#64748B',
            weight: 1.2,
            interactive: false,
          }
        ).addTo(group);

        // City dot on the map
        L.circleMarker([fc.lat, fc.lon], {
          pane: 'vectorOverlayPane',
          renderer: overlayRenderer,
          radius: 3.8,
          color: '#0E1014',
          fillColor: '#38BDF8',
          fillOpacity: 1,
          weight: 1.2,
          interactive: false,
        }).addTo(group);

        const icon = L.divIcon({
          className: 'custom-forecast-callout',
          html: `
            <div data-testid="forecast-city-label" style="display:inline-flex;align-items:center;gap:5px;background:rgba(13,15,18,0.95);border:1px solid #4B5563;padding:2px 7px;white-space:nowrap;font-family:'JetBrains Mono',monospace;box-shadow:0 2px 8px rgba(0,0,0,0.65);">
              <span style="color:#F8FAFC;font-size:11px;font-weight:700;">${fc.cityName}</span>
              <span style="color:#F87171;font-size:11px;font-weight:700;">${fc.tempMax}℃</span>
              <span style="color:#38BDF8;font-size:11px;font-weight:700;">/${fc.tempMin}℃</span>
            </div>
          `,
          iconSize: [130, 24],
          iconAnchor: [65, 12],
        });
        L.marker([targetPos[0], targetPos[1]], { icon }).addTo(group);
      }
    } else if (effectiveScene === 'volcano') {
      L.circle([activeVolcano.lat, activeVolcano.lon], {
        pane: 'vectorOverlayPane',
        renderer: overlayRenderer,
        radius: 2500,
        color: '#EF4444',
        weight: 2,
        dashArray: '6 4',
        fillColor: '#EF4444',
        fillOpacity: 0.22,
        interactive: false,
      }).addTo(group);

      const icon = L.divIcon({
        className: 'custom-volcano-focus',
        html: `
          <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(18,18,22,0.95);border:2px solid #EF4444;padding:4px 10px;white-space:nowrap;">
            <span style="color:#EF4444;font-size:14px;font-weight:900;">▲</span>
            <span style="color:#FFFFFF;font-size:13px;font-weight:800;">${activeVolcano.name}</span>
            <span style="background:#EF4444;color:#FFFFFF;font-size:11px;font-weight:800;padding:1px 6px;font-family:'JetBrains Mono',monospace;">Lv.${activeVolcano.alertLevel}</span>
          </div>
        `,
        iconSize: [220, 32],
        iconAnchor: [110, -10],
      });
      L.marker([activeVolcano.lat, activeVolcano.lon], { icon }).addTo(group);
    } else if (effectiveScene === 'earthquake') {
      const targetZoom = getSceneCameraTarget().zoom;
      const currentZoom = map.getZoom();
      const projectionZoom =
        Math.abs(currentZoom - targetZoom) <= 1 ? currentZoom : targetZoom;

      // Track placed screen-space bounding boxes so badges never overlap
      const placedBoxes: Array<{
        x: number;
        y: number;
        w: number;
        h: number;
      }> = [];

      const collidesWithPlaced = (
        x: number,
        y: number,
        w: number,
        h: number,
        gap = 3
      ): boolean => {
        for (let i = 0; i < placedBoxes.length; i++) {
          const b = placedBoxes[i];
          if (
            Math.abs(x - b.x) < (w + b.w) / 2 + gap &&
            Math.abs(y - b.y) < (h + b.h) / 2 + gap
          ) {
            return true;
          }
        }
        return false;
      };

      // 1. EEW (緊急地震速報) Wave propagation concentric circles & Epicenter
      if (activeEew) {
        const eewLat =
          typeof activeEew.lat === 'number' && !Number.isNaN(activeEew.lat)
            ? activeEew.lat
            : selectedEarthquake.lat;
        const eewLon =
          typeof activeEew.lon === 'number' && !Number.isNaN(activeEew.lon)
            ? activeEew.lon
            : selectedEarthquake.lon;
        const eewDepth = activeEew.depthKm >= 0 ? activeEew.depthKm : 10;

        // Wave propagation concentric circles (P-wave & S-wave expansion)
        const { pKm, sKm } = computeEewWaveRadiiKm(
          activeEew.originTime,
          eewDepth,
          eewAnimNow
        );

        if (pKm > 0) {
          L.circle([eewLat, eewLon], {
            pane: 'vectorOverlayPane',
            renderer: overlayRenderer,
            radius: pKm * 1000,
            color: '#38BDF8',
            weight: 2,
            dashArray: '6 6',
            fill: false,
            opacity: 0.85,
            interactive: false,
          }).addTo(group);
        }

        if (sKm > 0) {
          L.circle([eewLat, eewLon], {
            pane: 'vectorOverlayPane',
            renderer: overlayRenderer,
            radius: sKm * 1000,
            color: '#EF4444',
            weight: 2.8,
            fillColor: '#EF4444',
            fillOpacity: 0.16,
            opacity: 0.95,
            interactive: false,
          }).addTo(group);
        }

        // EEW Epicenter Marker
        const isFinal = activeEew.serial >= 5;
        const reportBadge = isFinal
          ? `最終報(第${activeEew.serial}報)`
          : `第${activeEew.serial}報`;
        const epiPt = map.project([eewLat, eewLon], projectionZoom);
        placedBoxes.push({ x: epiPt.x, y: epiPt.y, w: 60, h: 40 });

        const magLabel =
          activeEew.magnitude > 0
            ? `M${activeEew.magnitude.toFixed(1)}`
            : 'M不明';
        const eewEpiIcon = L.divIcon({
          className: 'custom-eew-epicenter-marker',
          html: `
            <div style="position:relative;display:flex;flex-direction:column;align-items:center;pointer-events:none;">
              <div style="position:relative;display:flex;align-items:center;justify-content:center;width:40px;height:40px;">
                <div style="position:absolute;width:36px;height:36px;border-radius:50%;background:rgba(239,68,68,0.45);animation:ping 1.4s cubic-bezier(0,0,0.2,1) infinite;"></div>
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <path d="M5 5L27 27M27 5L5 27" stroke="#0B0D12" stroke-width="7" stroke-linecap="square"/>
                  <path d="M5 5L27 27M27 5L5 27" stroke="#EF4444" stroke-width="4.2" stroke-linecap="square"/>
                  <path d="M5 5L27 27M27 5L5 27" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="square"/>
                </svg>
              </div>
              <div style="background:rgba(18,20,26,0.96);border:2px solid #EF4444;padding:2px 8px;white-space:nowrap;margin-top:2px;box-shadow:0 3px 10px rgba(0,0,0,0.85);border-radius:3px;font-family:'JetBrains Mono',monospace;">
                <span style="background:#EF4444;color:#FFFFFF;font-weight:900;font-size:10px;padding:1px 4px;margin-right:4px;">EEW</span>
                <span style="color:#EF4444;font-size:11px;font-weight:800;">${reportBadge}</span>
                <span style="color:#FFFFFF;font-size:11px;font-weight:800;margin-left:4px;">${magLabel}</span>
              </div>
            </div>
          `,
          iconSize: [160, 68],
          iconAnchor: [80, 20],
        });
        L.marker([eewLat, eewLon], {
          icon: eewEpiIcon,
          zIndexOffset: 3000,
        }).addTo(group);

        // EEW Warning Area badges on the map
        const prefCoordMap: Record<string, [number, number]> = {};
        for (const p of Object.values(PREFECTURE_NAMES)) {
          prefCoordMap[p.name] = [p.lat, p.lon];
        }

        activeEew.areas.forEach((area) => {
          let pos = prefCoordMap[area.pref];
          if (!pos) {
            for (const [pName, pCoord] of Object.entries(prefCoordMap)) {
              if (
                area.pref.includes(pName) ||
                pName.includes(area.pref) ||
                area.name.includes(pName)
              ) {
                pos = pCoord;
                break;
              }
            }
          }
          if (!pos) return;

          const scaleText = formatEewScaleRange(area.scaleFrom, area.scaleTo);
          const arrivalLabel = formatEewArrivalLabel(area, eewAnimNow);
          const isArrived = arrivalLabel.includes('到達');
          const pt = map.project(pos, projectionZoom);
          const boxW = 120;
          const boxH = 22;

          if (!collidesWithPlaced(pt.x, pt.y, boxW, boxH, 2)) {
            placedBoxes.push({ x: pt.x, y: pt.y, w: boxW, h: boxH });
            const areaIcon = L.divIcon({
              className: 'custom-eew-area-badge',
              html: `
                <div style="display:inline-flex;align-items:center;gap:4px;background:rgba(18,20,26,0.92);border:1.5px solid ${isArrived ? '#EF4444' : '#F59E0B'};padding:1px 5px;border-radius:3px;font-family:'JetBrains Mono',monospace;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.8);">
                  <span style="color:#FFFFFF;font-size:10px;font-weight:700;">${area.name}</span>
                  <span style="background:${isArrived ? '#EF4444' : '#F59E0B'};color:#000;font-size:10px;font-weight:900;padding:0 3px;border-radius:2px;">${scaleText}</span>
                  <span style="color:${isArrived ? '#FCA5A5' : '#FDE047'};font-size:9px;font-weight:700;">${arrivalLabel}</span>
                </div>
              `,
              iconSize: [boxW, boxH],
              iconAnchor: [Math.round(boxW / 2), Math.round(boxH / 2)],
            });
            L.marker(pos, { icon: areaIcon, zIndexOffset: 2500 }).addTo(group);
          }
        });
      }

      // 2. Standard Observed Earthquake Stations (if available)
      const sortedStations = [...selectedEarthquake.stations]
        .filter(
          (st): st is typeof st & { lat: number; lon: number } =>
            typeof st.lat === 'number' &&
            typeof st.lon === 'number' &&
            !Number.isNaN(st.lat) &&
            !Number.isNaN(st.lon)
        )
        .sort((a, b) => b.scaleCode - a.scaleCode);

      // Reserve epicenter cross area for regular quake if no EEW is active
      if (!activeEew) {
        const epiPt = map.project(
          [selectedEarthquake.lat, selectedEarthquake.lon],
          projectionZoom
        );
        placedBoxes.push({ x: epiPt.x, y: epiPt.y, w: 30, h: 30 });
      }

      sortedStations.forEach((st) => {
        const pt = map.project([st.lat, st.lon], projectionZoom);
        const style = getSeismicScaleStyle(st.scaleCode);
        const compactW = st.scaleLabel.length > 1 ? 22 : 18;
        const compactH = 18;

        if (!collidesWithPlaced(pt.x, pt.y, compactW, compactH, 2)) {
          placedBoxes.push({ x: pt.x, y: pt.y, w: compactW, h: compactH });

          const compactIcon = L.divIcon({
            className: 'custom-eq-station-compact',
            html: `
              <div data-testid="eq-station-compact-badge" title="${st.prefecture} ${st.stationName}（震度${st.scaleLabel}）" style="display:flex;align-items:center;justify-content:center;width:${compactW}px;height:${compactH}px;background:${style.hex};color:${style.badgeText};border:1.5px solid #0B0D12;border-radius:3px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:900;line-height:1;box-shadow:0 1px 4px rgba(0,0,0,0.8);">
                ${st.scaleLabel}
              </div>
            `,
            iconSize: [compactW, compactH],
            iconAnchor: [Math.round(compactW / 2), Math.round(compactH / 2)],
          });
          L.marker([st.lat, st.lon], {
            icon: compactIcon,
            zIndexOffset: st.scaleCode * 10,
          }).addTo(group);
        }
      });

      if (!activeEew) {
        const epiIcon = L.divIcon({
          className: 'custom-epicenter-marker',
          html: `
            <div style="position:relative;display:flex;align-items:center;justify-content:center;width:32px;height:32px;">
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <path d="M6 6L26 26M26 6L6 26" stroke="#0B0D12" stroke-width="6.5" stroke-linecap="square"/>
                <path d="M6 6L26 26M26 6L6 26" stroke="#EF4444" stroke-width="3.8" stroke-linecap="square"/>
                <path d="M6 6L26 26M26 6L6 26" stroke="#FCA5A5" stroke-width="1.2" stroke-linecap="square"/>
              </svg>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        L.marker([selectedEarthquake.lat, selectedEarthquake.lon], {
          icon: epiIcon,
          zIndexOffset: 2000,
        }).addTo(group);
      }
    }
  }, [
    effectiveScene,
    data,
    radarFrameIndex,
    radarPass,
    amedasMetric,
    selectedEarthquake,
    selectedTyphoon,
    activeVolcano,
    activeEew,
    activeTsunamiForecast,
    eewAnimNow,
    mapZoomVersion,
  ]);

  const currentNowcastEntry =
    data.nowcastTimes[Math.min(radarFrameIndex, data.nowcastTimes.length - 1)];

  return (
    <div className="relative w-full h-full bg-[#0E1014] overflow-hidden select-none">
      {/* Main Full-Screen Leaflet Map Canvas */}
      <div
        ref={mapContainerRef}
        data-testid="monitor-map-canvas"
        className="w-full h-full z-0 cursor-crosshair"
      />

      {/* Subtle Map Zoom & World/Japan View Controls (Bottom-Left of Map Canvas) */}
      <div className="absolute bottom-3 left-3 z-[400] flex items-center gap-1 bg-[#111318]/92 border border-neutral-700/80 p-1">
        <button
          type="button"
          onClick={() => {
            const map = mapInstanceRef.current;
            if (!map) return;
            map.flyTo(map.getCenter(), Math.min(12, map.getZoom() + 1), {
              animate: true,
              duration: 1.0,
              easeLinearity: 0.1,
            });
          }}
          aria-label="地図を拡大"
          className="px-2 py-0.5 text-[11px] font-mono text-neutral-200 hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          +拡大
        </button>
        <button
          type="button"
          onClick={() => {
            const map = mapInstanceRef.current;
            if (!map) return;
            map.flyTo(map.getCenter(), Math.max(2, map.getZoom() - 1), {
              animate: true,
              duration: 1.0,
              easeLinearity: 0.1,
            });
          }}
          aria-label="地図を縮小"
          className="px-2 py-0.5 text-[11px] font-mono text-neutral-200 hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          -縮小
        </button>
        <button
          type="button"
          onClick={() => {
            const map = mapInstanceRef.current;
            if (!map) return;
            map.flyTo([36.8, 137.5], 5, {
              animate: true,
              duration: 1.5,
              easeLinearity: 0.08,
            });
          }}
          aria-label="日本全体を表示"
          className="px-2 py-0.5 text-[11px] font-mono text-neutral-300 hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          日本全体
        </button>
        <button
          type="button"
          data-testid="world-map-view-btn"
          onClick={() => {
            const map = mapInstanceRef.current;
            if (!map) return;
            map.flyTo([30.0, 140.0], 3, {
              animate: true,
              duration: 1.6,
              easeLinearity: 0.08,
            });
          }}
          aria-label="世界全体を表示"
          className="px-2 py-0.5 text-[11px] font-mono text-cyan-300 hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          世界全体
        </button>
      </div>

      {/* Compact Radar Scrubber (2-Pass: 1周目 雨雲レーダー -> 2周目 雨雲＋雷レーダー) */}
      {effectiveScene === 'radar' && (
        <div
          data-testid="radar-scrubber-bar"
          className="absolute bottom-3 left-64 z-[400] bg-[#111318]/92 border border-neutral-700/80 px-2.5 py-1 flex items-center gap-1.5"
        >
          <button
            type="button"
            data-testid="radar-pass-toggle-btn"
            onClick={() => setRadarPass((p) => (p === 0 ? 1 : 0))}
            className={`px-2 py-0.5 text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
              radarPass === 1
                ? 'bg-yellow-500/25 border-yellow-400 text-yellow-200'
                : 'bg-cyan-500/20 border-cyan-500/70 text-cyan-200'
            }`}
          >
            {radarPass === 0 ? '1周目: 雨雲レーダー' : '2周目: 雨雲＋雷レーダー'}
          </button>
          <span
            data-testid="radar-current-frame-label"
            className="text-[11px] font-mono text-cyan-300 font-bold mr-1"
          >
            {currentNowcastEntry ? currentNowcastEntry.label : '現在 (実況)'}{' '}
            ({radarFrameIndex + 1}/{data.nowcastTimes.length})
          </span>
          {data.nowcastTimes.map((entry, idx) => (
            <button
              key={`${entry.basetime}-${entry.validtime}-${idx}`}
              type="button"
              onClick={() => setRadarFrameIndex(idx)}
              aria-label={`レーダー時刻 ${entry.label}`}
              className={`px-1.5 py-0.5 text-[10px] font-mono transition-colors border cursor-pointer ${
                idx === radarFrameIndex
                  ? 'bg-cyan-500/25 border-cyan-400 text-white font-bold'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {entry.label.split(' ')[0]}
            </button>
          ))}
        </div>
      )}

      {/* Compact AMeDAS Metric Switcher Bar (気温 / 降水 / 風速 / 積雪) */}
      {effectiveScene === 'amedas' && (
        <div
          data-testid="amedas-metric-bar"
          className="absolute bottom-3 left-64 z-[400] bg-[#111318]/92 border border-neutral-700/80 px-2.5 py-1 flex items-center gap-1.5"
        >
          <span className="text-[11px] font-mono text-neutral-300 font-bold mr-1">
            表示要素:
          </span>
          {(
            [
              { id: 'temp', label: '気温 (℃)' },
              { id: 'precip', label: '降水 (mm/h)' },
              { id: 'wind', label: '風速 (m/s)' },
              { id: 'snow', label: '積雪 (cm)' },
            ] as Array<{ id: AmedasMetric; label: string }>
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              data-testid={`amedas-metric-btn-${m.id}`}
              onClick={() => onChangeAmedasMetric(m.id)}
              className={`px-2 py-0.5 text-[11px] font-mono font-bold transition-colors border cursor-pointer ${
                amedasMetric === m.id
                  ? 'bg-amber-500/25 border-amber-400 text-white'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {m.label}
            </button>
          ))}
          <span className="text-[10px] font-mono text-neutral-400 ml-1">
            (拡大時は全観測地点を表示)
          </span>
        </div>
      )}
    </div>
  );
};
