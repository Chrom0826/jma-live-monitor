import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
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
  TsunamiForecastReport,
  TsunamiStationItem,
  TsunamiForecastArea,
  TyphoonReport,
  VolcanoStatusItem,
  WarningSeverity,
} from '../types/jma';
import { fetchSharedJmaAreaConst } from '../services/jmaClient';
import {
  AMEDAS_PATROL_STOPS,
  computeTyphoonConeEnvelope,
  dissolveGeoJsonByGroup,
  formatCompactTyphoonCenterLabel,
  formatCompactTyphoonTime,
  formatMunicipalityMapLabel,
  formatWarningDivisionMapLabel,
  getAmedasMetricColor,
  getAmedasPointRadiusForZoom,
  getAmedasWindArrowSizeForZoom,
  getEffectiveMunicipalitySeverity,
  getSeismicScaleStyle,
  getWarningMapZoomTier,
  getWindDirectionRotationDeg,
  inferRegionFromCoords,
  isExtratropicalCyclone,
  PREFECTURE_NAMES,
  resolveWarningDivision,
  selectNonOverlappingAmedasStations,
  WARNING_DIVISIONS,
  WarningMapZoomTier,
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
let cachedDissolvedDivisionsGeoJson: any = null;
let cachedTsunamiGeoJson: any = null;
const cachedClass20LabelPoints: Record<string, [number, number]> = {};
let class20FetchPromise: Promise<{
  class20: any;
  class10: any;
  dissolvedDivisions: any;
}> | null = null;
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

function loadJmaMunicipalityGeoJson(): Promise<{
  class20: any;
  class10: any;
  dissolvedDivisions: any;
}> {
  if (
    cachedClass20GeoJson &&
    cachedClass10GeoJson &&
    cachedDissolvedDivisionsGeoJson
  ) {
    return Promise.resolve({
      class20: cachedClass20GeoJson,
      class10: cachedClass10GeoJson,
      dissolvedDivisions: cachedDissolvedDivisionsGeoJson,
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
    fetchSharedJmaAreaConst(),
  ]).then(([c20Parts, c10Json, areaJson]) => {
    const validParts = c20Parts.filter(
      (p) => p && Array.isArray(p.features)
    );
    if (validParts.length > 0) {
      const allFeatures = validParts.flatMap((p) => p.features);
      for (const f of allFeatures) {
        const code = String(f?.properties?.code || '');
        const divMeta =
          code && code !== 'hoppo'
            ? resolveWarningDivision(code, areaJson)
            : null;
        if (f.properties) {
          f.properties.divisionCode = divMeta?.code || (code === 'hoppo' ? 'hoppo' : '');
          f.properties.prefId = divMeta?.prefId || Number(code.slice(0, 2)) || 0;
        }
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
      // Topologically dissolve the 153 `class10s` sub-regions into the 57 JMA Warning Divisions
      // (`宗谷`, `上川・留萌`, `網走・北見・紋別`, `石狩・空知・後志`, `胆振・日高`, `釧路・根室・十勝`, `渡島・檜山`, `[各都府県]`, `奄美`, `沖縄4地方`)
      // so every prefecture and Hokkaido division is 100% unified with zero internal sub-boundaries!
      cachedDissolvedDivisionsGeoJson = dissolveGeoJsonByGroup(
        c10Json.features,
        (f) => {
          const code = String(f?.properties?.code || '');
          if (!code) return null;
          if (code === 'hoppo') return 'hoppo';
          const divMeta = resolveWarningDivision(code, areaJson);
          return divMeta?.code || code;
        }
      );
    }
    return {
      class20: cachedClass20GeoJson,
      class10: cachedClass10GeoJson,
      dissolvedDivisions: cachedDissolvedDivisionsGeoJson,
    };
  });

  return class20FetchPromise;
}

/**
 * Fast Web Mercator projection from (lat, lon) at fractional zoom level.
 * Matches `L.CRS.EPSG3857.latLngToPoint(L.latLng(lat, lon), zoom)` without object allocation.
 */
const DEG_TO_RAD = Math.PI / 180;
const MAX_MERCATOR_LAT = 85.0511287798;

function latLonToNormMercator(
  lat: number,
  lon: number
): { normX: number; normY: number } {
  const clampedLat = Math.max(
    -MAX_MERCATOR_LAT,
    Math.min(MAX_MERCATOR_LAT, lat)
  );
  const sin = Math.sin(clampedLat * DEG_TO_RAD);
  const normX = lon / 360 + 0.5;
  const normY = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  return { normX, normY };
}

function projectLatLonToWorldPx(
  lat: number,
  lon: number,
  scale: number
): { x: number; y: number } {
  const { normX, normY } = latLonToNormMercator(lat, lon);
  return { x: normX * scale, y: normY * scale };
}

interface CompiledGeoRing {
  normCoords: Float64Array; // [normX0, normY0, normX1, normY1, ...]
}

interface CompiledGeoShape {
  id: string;
  divisionCode: string;
  prefId: number;
  severity: WarningSeverity;
  minNormX: number;
  minNormY: number;
  maxNormX: number;
  maxNormY: number;
  rings: CompiledGeoRing[];
}

function compileGeoJsonShapes(
  geoJson: any,
  extractMeta: (feature: any) => {
    id: string;
    divisionCode?: string;
    prefId?: number;
    severity?: WarningSeverity;
  },
  exteriorRingsOnly = false
): CompiledGeoShape[] {
  if (!geoJson || !Array.isArray(geoJson.features)) return [];
  const shapes: CompiledGeoShape[] = [];

  for (const f of geoJson.features) {
    const geom = f?.geometry;
    if (!geom) continue;
    const polys: number[][][][] =
      geom.type === 'Polygon'
        ? [geom.coordinates]
        : geom.type === 'MultiPolygon'
          ? geom.coordinates
          : [];
    if (polys.length === 0) continue;

    let minNormX = Infinity;
    let minNormY = Infinity;
    let maxNormX = -Infinity;
    let maxNormY = -Infinity;
    const rings: CompiledGeoRing[] = [];

    for (const poly of polys) {
      if (!Array.isArray(poly) || poly.length === 0) continue;
      const ringLimit = exteriorRingsOnly ? 1 : poly.length;
      for (let rIdx = 0; rIdx < ringLimit; rIdx++) {
        const rawRing = poly[rIdx];
        if (!Array.isArray(rawRing) || rawRing.length < 3) continue;
        const normCoords = new Float64Array(rawRing.length * 2);
        let ptr = 0;
        for (let i = 0; i < rawRing.length; i++) {
          const pt = rawRing[i];
          if (!Array.isArray(pt) || pt.length < 2) continue;
          const lon = Number(pt[0]);
          const lat = Number(pt[1]);
          if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
          const { normX, normY } = latLonToNormMercator(lat, lon);
          normCoords[ptr++] = normX;
          normCoords[ptr++] = normY;
          if (normX < minNormX) minNormX = normX;
          if (normX > maxNormX) maxNormX = normX;
          if (normY < minNormY) minNormY = normY;
          if (normY > maxNormY) maxNormY = normY;
        }
        if (ptr >= 6) {
          rings.push({
            normCoords:
              ptr === normCoords.length
                ? normCoords
                : normCoords.subarray(0, ptr),
          });
        }
      }
    }

    if (rings.length > 0) {
      const meta = extractMeta(f);
      shapes.push({
        id: meta.id,
        divisionCode: meta.divisionCode || '',
        prefId: meta.prefId || 0,
        severity: meta.severity || 'normal',
        minNormX,
        minNormY,
        maxNormX,
        maxNormY,
        rings,
      });
    }
  }

  return shapes;
}

function severityToFillColor(sev: WarningSeverity): string {
  if (sev === 'special') return '#9333EA';
  if (sev === 'warning') return '#EF4444';
  if (sev === 'advisory') return '#FACC15';
  return '#374151';
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
    // Light tile loading: small buffer, no per-intermediate-zoom tile requests while flying
    keepBuffer: 2,
    updateWhenIdle: true,
    updateWhenZooming: false,
    updateInterval: 250,
    opacity,
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
  tsunami: { center: [36.8, 137.5], zoom: 5.2 },
  earthquake: { center: [36.4, 140.8], zoom: 7 },
};

export const MonitorMap: React.FC<MonitorMapProps> = React.memo(({
  activeScene,
  activeRegionConfig,
  activeWarningDivision,
  activeEew,
  activeTsunamiForecast,
  data,
  selectedEarthquake,
  selectedTyphoon,
  activeVolcano,
  amedasMetric,
  onChangeAmedasMetric,
  onViewportChange,
  interruptKind,
  isLoopPaused,
  onSceneComplete,
}) => {
  const baseMapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const interactiveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderInteractiveCanvasRef = useRef<
    (overrideCenter?: { lat: number; lng: number }, overrideZoom?: number) => void
  >(() => {});
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tsunamiCasingLayerRef = useRef<L.GeoJSON | null>(null);
  const tsunamiGeoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);
  const radarLayerCacheRef = useRef<Map<string, L.GridLayer>>(new Map());
  const overlayRendererRef = useRef<L.SVG | null>(null);
  const isFirstMountRef = useRef<boolean>(true);
  const warningZoomTierRef = useRef<WarningMapZoomTier>('prefecture');
  const onSceneCompleteRef = useRef<() => void>(onSceneComplete);
  const onViewportChangeRef = useRef<typeof onViewportChange>(onViewportChange);
  const lastMuniSeveritySigRef = useRef<string>('');
  // True while the camera is moving (flyTo / pan / zoom): enables cheaper draw LOD in the canvas renderer
  const isMovingRef = useRef<boolean>(false);
  const viewportSizeRef = useRef<{ width: number; height: number; dpr: number }>({
    width: 1280,
    height: 720,
    dpr: 1,
  });

  // Pre-compiled normalized Web Mercator geometry refs for 60fps razor-sharp Canvas rendering
  const worldCompiledRef = useRef<CompiledGeoShape[]>([]);
  const japanPrefCompiledRef = useRef<CompiledGeoShape[]>([]);
  const dissolvedDivisionsCompiledRef = useRef<CompiledGeoShape[]>([]);
  const class20CompiledRef = useRef<CompiledGeoShape[]>([]);
  const dissolvedWarningFillCompiledRef = useRef<CompiledGeoShape[]>([]);

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
  const [dissolvedDivisionsGeoJson, setDissolvedDivisionsGeoJson] =
    useState<any>(cachedDissolvedDivisionsGeoJson);
  const [tsunamiGeoJsonData, setTsunamiGeoJsonData] = useState<any>(
    cachedTsunamiGeoJson
  );
  const [compiledVersion, setCompiledVersion] = useState<number>(0);
  const [radarFrameIndex, setRadarFrameIndex] = useState<number>(0);
  // radarPass: 0 = 1st loop (Rain Radar only), 1 = 2nd loop (Rain Radar + Lightning Radar & LIDEN)
  const [radarPass, setRadarPass] = useState<0 | 1>(0);
  const [mapZoomVersion, setMapZoomVersion] = useState<number>(0);
  const [warningZoomTier, setWarningZoomTier] =
    useState<WarningMapZoomTier>('prefecture');
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

  // Compile World GeoJSON into normalized Web Mercator coordinates once
  useEffect(() => {
    if (!worldGeoJsonData) return;
    worldCompiledRef.current = compileGeoJsonShapes(worldGeoJsonData, (f) => ({
      id: String(f?.properties?.ISO_A3 || f?.properties?.ADMIN || 'country'),
    }));
    setCompiledVersion((v) => v + 1);
  }, [worldGeoJsonData]);

  // Compile 47-prefecture fallback GeoJSON once
  useEffect(() => {
    if (!geoJsonData) return;
    japanPrefCompiledRef.current = compileGeoJsonShapes(
      geoJsonData,
      (f) => {
        const prefId = Number(f?.properties?.id || 0);
        const divCode =
          prefId >= 2 && prefId <= 45
            ? `${String(prefId).padStart(2, '0')}0000`
            : prefId === 46
              ? '460100'
              : prefId === 47
                ? '471000'
                : '016000';
        return {
          id: String(prefId),
          divisionCode: divCode,
          prefId,
        };
      },
      true
    );
    setCompiledVersion((v) => v + 1);
  }, [geoJsonData]);

  // Compile dissolved 57-division JMA GeoJSON once
  useEffect(() => {
    if (!dissolvedDivisionsGeoJson) return;
    dissolvedDivisionsCompiledRef.current = compileGeoJsonShapes(
      dissolvedDivisionsGeoJson,
      (f) => {
        const divCode = String(f?.properties?.groupKey || '');
        const prefId =
          WARNING_DIVISIONS[divCode]?.prefId ||
          Number(divCode.slice(0, 2)) ||
          0;
        return {
          id: divCode,
          divisionCode: divCode,
          prefId,
        };
      },
      true
    );
    setCompiledVersion((v) => v + 1);
  }, [dissolvedDivisionsGeoJson]);

  // Compile class20 municipality shapes once when class20GeoJsonData loads
  useEffect(() => {
    if (!class20GeoJsonData || !Array.isArray(class20GeoJsonData.features)) {
      return;
    }
    class20CompiledRef.current = compileGeoJsonShapes(
      class20GeoJsonData,
      (f) => {
        const code = String(f?.properties?.code || '');
        const divCode = String(f?.properties?.divisionCode || '');
        const prefId = Number(f?.properties?.prefId || 0);
        return {
          id: code,
          divisionCode: divCode,
          prefId,
        };
      },
      true
    );
    setCompiledVersion((v) => v + 1);
  }, [class20GeoJsonData]);

  // Compile topologically dissolved warning fill shapes when class20GeoJsonData or muniSeverityMap updates
  useEffect(() => {
    if (!class20GeoJsonData || !Array.isArray(class20GeoJsonData.features)) {
      return;
    }
    const muniMap = data.muniSeverityMap || {};
    const sigEntries: string[] = [];
    for (const [k, v] of Object.entries(muniMap)) {
      if (v && v !== 'normal') {
        sigEntries.push(`${k}:${v}`);
      }
    }
    sigEntries.sort();
    const nextSig = `${class20GeoJsonData.features.length}|${sigEntries.join(',')}`;
    if (
      nextSig === lastMuniSeveritySigRef.current &&
      dissolvedWarningFillCompiledRef.current.length > 0
    ) {
      return;
    }
    lastMuniSeveritySigRef.current = nextSig;

    // Topologically dissolve adjacent municipalities with the same `(divisionCode, severity)`
    // so nationwide (`zoom < 5.5`) and regional (`5.5 <= zoom < 6.8`) views have ZERO internal seams or black noise (`黒いノイズ`)!
    const dissolvedFillGeoJson = dissolveGeoJsonByGroup(
      class20GeoJsonData.features,
      (f) => {
        const code = String(f?.properties?.code || '');
        const divCode = String(f?.properties?.divisionCode || '');
        if (!divCode) return null;
        const sev = muniMap[code] || 'normal';
        return `${divCode}:${sev}`;
      }
    );

    dissolvedWarningFillCompiledRef.current = compileGeoJsonShapes(
      dissolvedFillGeoJson,
      (f) => {
        const groupKey = String(f?.properties?.groupKey || '');
        const [divCode, sevStr] = groupKey.split(':');
        return {
          id: groupKey,
          divisionCode: divCode || '',
          severity: (sevStr as WarningSeverity) || 'normal',
        };
      },
      true
    );

    setCompiledVersion((v) => v + 1);
  }, [class20GeoJsonData, data.muniSeverityMap]);

  // Pre-compile and pre-sort AMeDAS stations when `data.amedas` or `amedasMetric` changes
  // Eliminates 1,300+ filter/sort/trigonometric calls on every 60fps animation frame!
  const preCompiledAmedas = useMemo(() => {
    const candidates = data.amedas.filter((st) => {
      if (amedasMetric === 'temp') return st.hasTemp !== false;
      if (amedasMetric === 'snow') return (st.snowCm ?? 0) > 0;
      return true;
    });

    candidates.sort((a, b) => {
      if (amedasMetric === 'wind') {
        if (b.windSpeed !== a.windSpeed) return b.windSpeed - a.windSpeed;
      } else if (amedasMetric === 'precip') {
        if (b.precip1h !== a.precip1h) return b.precip1h - a.precip1h;
      } else if (amedasMetric === 'snow') {
        const sa = a.snowCm ?? 0;
        const sb = b.snowCm ?? 0;
        if (sb !== sa) return sb - sa;
      } else {
        const devA = Math.abs(a.temp - 15);
        const devB = Math.abs(b.temp - 15);
        if (devB !== devA) return devB - devA;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    const metaByStation = new WeakMap<
      AmedasStationData,
      { normX: number; normY: number; dotColor: string; windRotRad: number }
    >();
    const coordByLatLon = new Map<string, { normX: number; normY: number }>();

    for (let i = 0; i < candidates.length; i++) {
      const st = candidates[i];
      const { normX, normY } = latLonToNormMercator(st.lat, st.lon);
      metaByStation.set(st, {
        normX,
        normY,
        dotColor: getAmedasMetricColor(st, amedasMetric),
        windRotRad:
          (getWindDirectionRotationDeg(st.windDirection) * Math.PI) / 180,
      });
      coordByLatLon.set(`${st.lat},${st.lon}`, { normX, normY });
    }

    // Screen-space selection only depends on zoom (translation invariant), so work on normalized coords
    // (lat := normX, lon := normY) and memoize the picked subset per quantized zoom level.
    const proxies = candidates.map((st) => {
      const m = metaByStation.get(st)!;
      return { lat: m.normX, lon: m.normY, st };
    });
    const selectionCache = new Map<number, AmedasStationData[]>();

    return {
      sortedCandidates: candidates,
      metaByStation,
      coordByLatLon,
      proxies,
      selectionCache,
    };
  }, [data.amedas, amedasMetric]);

  // Pre-compile and pre-sort municipality warning labels once when `data.municipalityWarnings` or `compiledVersion` updates
  const preCompiledMunicipalityLabels = useMemo(() => {
    const muniList = data.municipalityWarnings || [];
    const rank: Record<WarningSeverity, number> = {
      special: 3,
      warning: 2,
      advisory: 1,
      normal: 0,
    };
    return [...muniList]
      .map((m) => {
        const exactCoord = m.muniCode
          ? cachedClass20LabelPoints[m.muniCode]
          : undefined;
        const lat = exactCoord ? exactCoord[0] : m.lat;
        const lon = exactCoord ? exactCoord[1] : m.lon;
        const { normX, normY } = latLonToNormMercator(lat, lon);
        const resolved = exactCoord ? { ...m, lat, lon } : m;
        return {
          muni: resolved,
          labelText: formatMunicipalityMapLabel(resolved),
          normX,
          normY,
        };
      })
      .sort((a, b) => rank[b.muni.severity] - rank[a.muni.severity]);
  }, [data.municipalityWarnings, compiledVersion]);

  // Pre-compile warning division label normalized Mercator coordinates once
  const preCompiledDivisionLabels = useMemo(() => {
    return Object.values(WARNING_DIVISIONS).map((div) => {
      const { normX, normY } = latLonToNormMercator(div.lat, div.lon);
      return {
        div,
        labelText: formatWarningDivisionMapLabel(div),
        normX,
        normY,
      };
    });
  }, []);

  // Keep 60fps High-DPI Base-Map Canvas & Interactive Overlay Canvas renderer function up to date
  // Draws both:
  // 1) `baseMapCanvasRef` (`z-[5]`): World Map, Japan Base Map (`白地図`), Warning Choropleth, 3-Stage Borders, and Blue Focus Border at native HiDPI resolution (never blurs during or after zoom!)
  // 2) `interactiveCanvasRef` (`z-[390]`): AMeDAS dots/wind arrows & Warning 3-Stage Hierarchy Labels
  useEffect(() => {
    renderInteractiveCanvasRef.current = (overrideCenter, overrideZoom) => {
      const baseCanvas = baseMapCanvasRef.current;
      const canvas = interactiveCanvasRef.current;
      const map = mapInstanceRef.current;
      if (!canvas || !map) return;

      let { width, height, dpr } = viewportSizeRef.current;
      if (width <= 0 || height <= 0) {
        const container = map.getContainer();
        width = container.clientWidth || 1280;
        height = container.clientHeight || 720;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        viewportSizeRef.current = { width, height, dpr };
      }

      const currentZoom =
        typeof overrideZoom === 'number' ? overrideZoom : map.getZoom();
      const center = overrideCenter ?? map.getCenter();
      const worldScale = 256 * Math.pow(2, currentZoom);
      const centerWorld = projectLatLonToWorldPx(
        center.lat,
        center.lng,
        worldScale
      );
      const moving = isMovingRef.current;
      // Coarser sub-pixel vertex decimation while the camera is in motion (invisible at speed, ~2x fewer lineTo)
      const decimPx = moving ? 1.4 : 0.65;
      // Diagnostic dataset attributes are only written when idle and only when the value changed
      const setDs = (el: HTMLCanvasElement, key: string, val: string) => {
        if (!moving && el.dataset[key] !== val) el.dataset[key] = val;
      };
      const halfW = width / 2;
      const halfH = height / 2;
      const originX = centerWorld.x - halfW;
      const originY = centerWorld.y - halfH;

      // Normalized Web Mercator viewport bounds for fast frustum culling
      const padPx = 48;
      const viewMinNormX = (originX - padPx) / worldScale;
      const viewMaxNormX = (originX + width + padPx) / worldScale;
      const viewMinNormY = (originY - padPx) / worldScale;
      const viewMaxNormY = (originY + height + padPx) / worldScale;

      const projectToScreen = (
        lat: number,
        lon: number
      ): { x: number; y: number } => {
        const cached = preCompiledAmedas.coordByLatLon.get(`${lat},${lon}`);
        if (cached) {
          return {
            x: cached.normX * worldScale - originX,
            y: cached.normY * worldScale - originY,
          };
        }
        const pt = projectLatLonToWorldPx(lat, lon, worldScale);
        return {
          x: pt.x - originX,
          y: pt.y - originY,
        };
      };

      // ==================== A. RENDER 60FPS HIGH-DPI BASE MAP (`baseMapCanvasRef`) ====================
      if (baseCanvas) {
        const targetW = Math.round(width * dpr);
        const targetH = Math.round(height * dpr);
        if (baseCanvas.width !== targetW || baseCanvas.height !== targetH) {
          baseCanvas.width = targetW;
          baseCanvas.height = targetH;
        }
        const bCtx = baseCanvas.getContext('2d');
        if (bCtx) {
          bCtx.save();
          bCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          bCtx.fillStyle = '#0E1014';
          bCtx.fillRect(0, 0, width, height);
          bCtx.lineJoin = 'round';
          bCtx.lineCap = 'round';

          // Screen-space sub-pixel vertex decimation (`< 0.65px`) eliminates ~85% of redundant
          // sub-pixel `lineTo` calls at overview zooms while keeping zoomed-in coastlines 100% razor-sharp!
          const traceShapePath = (
            ctx2d: CanvasRenderingContext2D,
            shape: CompiledGeoShape,
            worldWrapOffsetNormX = 0
          ) => {
            for (let r = 0; r < shape.rings.length; r++) {
              const coords = shape.rings[r].normCoords;
              const len = coords.length;
              if (len < 6) continue;
              let prevX =
                (coords[0] + worldWrapOffsetNormX) * worldScale - originX;
              let prevY = coords[1] * worldScale - originY;
              ctx2d.moveTo(prevX, prevY);
              const lastIdx = len - 2;
              for (let i = 2; i < lastIdx; i += 2) {
                const px =
                  (coords[i] + worldWrapOffsetNormX) * worldScale - originX;
                const py = coords[i + 1] * worldScale - originY;
                if (Math.abs(px - prevX) + Math.abs(py - prevY) < decimPx) {
                  continue;
                }
                ctx2d.lineTo(px, py);
                prevX = px;
                prevY = py;
              }
              ctx2d.lineTo(
                (coords[lastIdx] + worldWrapOffsetNormX) * worldScale - originX,
                coords[lastIdx + 1] * worldScale - originY
              );
              ctx2d.closePath();
            }
          };

          const isShapeVisible = (
            shape: CompiledGeoShape,
            wrapX = 0
          ): boolean => {
            return !(
              shape.maxNormX + wrapX < viewMinNormX ||
              shape.minNormX + wrapX > viewMaxNormX ||
              shape.maxNormY < viewMinNormY ||
              shape.minNormY > viewMaxNormY
            );
          };

          // 1. World Countries Silhouette (`#1B1F28` fill, `#384152` crisp outline)
          const worldShapes = worldCompiledRef.current;
          if (worldShapes.length > 0) {
            bCtx.fillStyle = '#1B1F28';
            bCtx.strokeStyle = '#384152';
            bCtx.lineWidth = currentZoom >= 6 ? 1.0 : 0.75;
            for (const wrapX of [0, -1, 1]) {
              if (
                wrapX !== 0 &&
                1 + wrapX < viewMinNormX &&
                wrapX > viewMaxNormX
              ) {
                continue;
              }
              bCtx.beginPath();
              let anyWorld = false;
              for (let i = 0; i < worldShapes.length; i++) {
                const sh = worldShapes[i];
                if (!isShapeVisible(sh, wrapX)) continue;
                traceShapePath(bCtx, sh, wrapX);
                anyWorld = true;
              }
              if (anyWorld) {
                bCtx.fill();
                if (!moving) bCtx.stroke();
              }
            }
          }

          const divShapes =
            dissolvedDivisionsCompiledRef.current.length > 0
              ? dissolvedDivisionsCompiledRef.current
              : japanPrefCompiledRef.current;

          // 2. Japan Map: Warning Choropleth vs Crisp Blank Map (`白地図`)
          if (effectiveScene === 'warnings') {
            const tier = getWarningMapZoomTier(currentZoom);
            const focusedDivCode = activeWarningDivision?.divisionCode || null;
            const muniMap = data.muniSeverityMap || {};

            // Map each divisionCode to whether it has any warning/advisory for solid lake-hole underfill
            const divHasActiveWarning = new Map<string, WarningSeverity>();
            for (const w of data.warnings) {
              if (w.divisionCode) {
                divHasActiveWarning.set(w.divisionCode, w.severity);
              }
            }

            // 2a. Batched Solid 57-Division Underfill (2 draw calls instead of 57!)
            // Guarantees interior lakes like 洞爺湖 / 支笏湖 / 十和田湖 have ZERO black holes
            const underfillGrayShapes: CompiledGeoShape[] = [];
            const underfillYellowShapes: CompiledGeoShape[] = [];
            for (let i = 0; i < divShapes.length; i++) {
              const sh = divShapes[i];
              if (!isShapeVisible(sh)) continue;
              let isYellow = false;
              if (!focusedDivCode || sh.divisionCode === focusedDivCode) {
                const divSev =
                  divHasActiveWarning.get(sh.divisionCode) ||
                  data.prefSeverityMap[sh.prefId] ||
                  'normal';
                isYellow =
                  divSev === 'special' ||
                  divSev === 'warning' ||
                  divSev === 'advisory';
              }
              if (isYellow) {
                underfillYellowShapes.push(sh);
              } else {
                underfillGrayShapes.push(sh);
              }
            }

            if (underfillGrayShapes.length > 0) {
              bCtx.beginPath();
              for (let i = 0; i < underfillGrayShapes.length; i++) {
                traceShapePath(bCtx, underfillGrayShapes[i]);
              }
              bCtx.fillStyle = '#374151';
              bCtx.fill();
              if (!moving) {
                bCtx.strokeStyle = '#374151';
                bCtx.lineWidth = 0.8;
                bCtx.stroke();
              }
            }
            if (underfillYellowShapes.length > 0) {
              bCtx.beginPath();
              for (let i = 0; i < underfillYellowShapes.length; i++) {
                traceShapePath(bCtx, underfillYellowShapes[i]);
              }
              bCtx.fillStyle = '#FACC15';
              bCtx.fill();
              if (!moving) {
                bCtx.strokeStyle = '#FACC15';
                bCtx.lineWidth = 0.8;
                bCtx.stroke();
              }
            }

            // 2b. Batched Warning Choropleth Fill (at most 4 draw calls by severity color instead of 100..1,900!)
            let coloredMuniCount = 0;
            let uncoloredOtherDivMuniCount = 0;

            const bucketBySeverity: Record<
              WarningSeverity,
              CompiledGeoShape[]
            > = {
              normal: [],
              advisory: [],
              warning: [],
              special: [],
            };

            if (
              tier !== 'municipality' &&
              !focusedDivCode &&
              dissolvedWarningFillCompiledRef.current.length > 0
            ) {
              const dissolvedShapes = dissolvedWarningFillCompiledRef.current;
              for (let i = 0; i < dissolvedShapes.length; i++) {
                const sh = dissolvedShapes[i];
                if (sh.severity !== 'normal') coloredMuniCount++;
                if (!isShapeVisible(sh)) continue;
                bucketBySeverity[sh.severity].push(sh);
              }

              for (const sev of [
                'normal',
                'advisory',
                'warning',
                'special',
              ] as const) {
                const bucket = bucketBySeverity[sev];
                if (bucket.length === 0) continue;
                const fillColor = severityToFillColor(sev);
                bCtx.beginPath();
                for (let i = 0; i < bucket.length; i++) {
                  traceShapePath(bCtx, bucket[i]);
                }
                bCtx.fillStyle = fillColor;
                bCtx.fill();
                if (!moving) {
                  bCtx.strokeStyle = fillColor;
                  bCtx.lineWidth = 0.75;
                  bCtx.stroke();
                }
              }
            } else if (class20CompiledRef.current.length > 0) {
              const c20Shapes = class20CompiledRef.current;
              const innerBorderShapes: CompiledGeoShape[] = [];
              for (let i = 0; i < c20Shapes.length; i++) {
                const sh = c20Shapes[i];
                if (focusedDivCode && sh.divisionCode !== focusedDivCode) {
                  if ((muniMap[sh.id] || 'normal') !== 'normal') {
                    uncoloredOtherDivMuniCount++;
                  }
                  continue;
                }
                const effSev = getEffectiveMunicipalitySeverity(
                  sh.id,
                  sh.divisionCode,
                  muniMap,
                  focusedDivCode
                );
                if (effSev !== 'normal') {
                  coloredMuniCount++;
                }
                if (!isShapeVisible(sh)) continue;
                bucketBySeverity[effSev].push(sh);
                if (
                  tier === 'municipality' &&
                  (!focusedDivCode || sh.divisionCode === focusedDivCode)
                ) {
                  innerBorderShapes.push(sh);
                }
              }

              for (const sev of [
                'normal',
                'advisory',
                'warning',
                'special',
              ] as const) {
                const bucket = bucketBySeverity[sev];
                if (bucket.length === 0) continue;
                const fillColor = severityToFillColor(sev);
                bCtx.beginPath();
                for (let i = 0; i < bucket.length; i++) {
                  traceShapePath(bCtx, bucket[i]);
                }
                bCtx.fillStyle = fillColor;
                bCtx.fill();
                if (tier !== 'municipality' && !moving) {
                  bCtx.strokeStyle = fillColor;
                  bCtx.lineWidth = 0.65;
                  bCtx.stroke();
                }
              }

              if (innerBorderShapes.length > 0) {
                bCtx.beginPath();
                for (let i = 0; i < innerBorderShapes.length; i++) {
                  traceShapePath(bCtx, innerBorderShapes[i]);
                }
                bCtx.strokeStyle = '#1E293B';
                bCtx.lineWidth = 0.85;
                bCtx.stroke();
              }
            }

            // 2c. Crisp Outer 57-Division / Prefecture Borders (`#0B0F19`)
            bCtx.beginPath();
            for (let i = 0; i < divShapes.length; i++) {
              const sh = divShapes[i];
              if (!isShapeVisible(sh)) continue;
              traceShapePath(bCtx, sh);
            }
            bCtx.strokeStyle = '#0B0F19';
            bCtx.lineWidth =
              tier === 'municipality'
                ? 1.75
                : tier === 'division'
                  ? 1.45
                  : 1.25;
            bCtx.stroke();

            // 2d. Vivid Blue Border Highlight around Focused Division (`その地方・都府県を青で囲む`)
            if (focusedDivCode) {
              bCtx.beginPath();
              let foundFocused = false;
              for (let i = 0; i < divShapes.length; i++) {
                const sh = divShapes[i];
                if (sh.divisionCode === focusedDivCode) {
                  traceShapePath(bCtx, sh);
                  foundFocused = true;
                }
              }
              if (foundFocused) {
                if (!moving) {
                  bCtx.strokeStyle = '#050810';
                  bCtx.lineWidth = 5.2;
                  bCtx.stroke();
                }
                bCtx.strokeStyle = '#38BDF8';
                bCtx.lineWidth = 2.8;
                bCtx.stroke();
              }
              setDs(baseCanvas, 'focusedDivisionCode', focusedDivCode);
              setDs(baseCanvas, 'focusedDivisionBlueBorder', String(foundFocused));
              setDs(baseCanvas, 'uncoloredOtherDivMuniCount', String(
                uncoloredOtherDivMuniCount
              ));
            } else {
              delete baseCanvas.dataset.focusedDivisionCode;
              delete baseCanvas.dataset.focusedDivisionBlueBorder;
              delete baseCanvas.dataset.uncoloredOtherDivMuniCount;
            }
            setDs(baseCanvas, 'coloredWarningCount', String(coloredMuniCount));
            setDs(baseCanvas, 'warningZoomTier', tier);
          } else {
            // Crisp Blank Map (`白地図`) for `radar`, `amedas`, `typhoon`, `forecast`, `earthquake`, `volcano`, `tsunami`
            const isTsunami = effectiveScene === 'tsunami';
            const fillCol = isTsunami ? '#28303D' : '#232731';
            const borderCol = isTsunami ? '#151922' : '#4B5563';
            const borderW = currentZoom >= 7 ? 1.3 : 1.0;

            bCtx.beginPath();
            for (let i = 0; i < divShapes.length; i++) {
              const sh = divShapes[i];
              if (!isShapeVisible(sh)) continue;
              traceShapePath(bCtx, sh);
            }
            bCtx.fillStyle = fillCol;
            bCtx.fill();
            bCtx.strokeStyle = borderCol;
            bCtx.lineWidth = borderW;
            bCtx.stroke();

            delete baseCanvas.dataset.focusedDivisionCode;
            delete baseCanvas.dataset.focusedDivisionBlueBorder;
          }

          setDs(baseCanvas, 'currentZoom', currentZoom.toFixed(2));
          setDs(baseCanvas, 'dpr', String(dpr));
          bCtx.restore();
        }
      }

      // ==================== B. RENDER 60FPS HIGH-DPI INTERACTIVE OVERLAY (`interactiveCanvasRef`) ====================
      const targetOverlayW = Math.round(width * dpr);
      const targetOverlayH = Math.round(height * dpr);
      if (
        canvas.width !== targetOverlayW ||
        canvas.height !== targetOverlayH
      ) {
        canvas.width = targetOverlayW;
        canvas.height = targetOverlayH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      setDs(canvas, 'currentZoom', currentZoom.toFixed(2));
      setDs(canvas, 'effectiveScene', effectiveScene);

      // 1. AMeDAS Interactive High-Density Non-Overlapping Rendering
      if (effectiveScene === 'amedas') {
        const zoomKey = Math.round(currentZoom * 20);
        let visibleStations = preCompiledAmedas.selectionCache.get(zoomKey);
        if (!visibleStations) {
          const zq = zoomKey / 20;
          const ws = 256 * Math.pow(2, zq);
          const picked = selectNonOverlappingAmedasStations(
            preCompiledAmedas.proxies as unknown as AmedasStationData[],
            amedasMetric,
            zq,
            (nx, ny) => ({ x: nx * ws, y: ny * ws }),
            true
          ) as unknown as Array<{ st: AmedasStationData }>;
          visibleStations = picked.map((p) => p.st);
          if (preCompiledAmedas.selectionCache.size > 80) {
            const firstKey = preCompiledAmedas.selectionCache.keys().next().value;
            if (firstKey !== undefined) preCompiledAmedas.selectionCache.delete(firstKey);
          }
          preCompiledAmedas.selectionCache.set(zoomKey, visibleStations);
        }

        let drawnCount = 0;

        if (amedasMetric === 'wind') {
          const arrowSize = getAmedasWindArrowSizeForZoom(currentZoom);
          const s = arrowSize / 24;
          const strokeW = Math.max(1.5, 1.8 / Math.max(0.55, s));
          ctx.lineWidth = strokeW;
          ctx.lineJoin = 'round';
          ctx.strokeStyle = '#0B0D12';

          for (let i = 0; i < visibleStations.length; i++) {
            const st = visibleStations[i];
            const meta = preCompiledAmedas.metaByStation.get(st);
            const posX = meta
              ? meta.normX * worldScale - originX
              : projectToScreen(st.lat, st.lon).x;
            const posY = meta
              ? meta.normY * worldScale - originY
              : projectToScreen(st.lat, st.lon).y;

            if (
              posX < -arrowSize ||
              posX > width + arrowSize ||
              posY < -arrowSize ||
              posY > height + arrowSize
            ) {
              continue;
            }
            drawnCount++;
            const dotColor =
              meta?.dotColor || getAmedasMetricColor(st, amedasMetric);
            const rotRad =
              meta?.windRotRad ??
              (getWindDirectionRotationDeg(st.windDirection) * Math.PI) / 180;

            ctx.save();
            ctx.translate(posX, posY);
            ctx.rotate(rotRad);
            ctx.scale(s, s);

            ctx.beginPath();
            ctx.moveTo(0, -11);
            ctx.lineTo(8.5, 9);
            ctx.lineTo(0, 4.2);
            ctx.lineTo(-8.5, 9);
            ctx.closePath();

            ctx.fillStyle = dotColor;
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
        } else {
          const radius = getAmedasPointRadiusForZoom(currentZoom);
          const strokeWidth = currentZoom >= 6 ? 1.0 : 0.7;
          const colorBatches = new Map<
            string,
            Array<{ x: number; y: number }>
          >();

          for (let i = 0; i < visibleStations.length; i++) {
            const st = visibleStations[i];
            const meta = preCompiledAmedas.metaByStation.get(st);
            const posX = meta
              ? meta.normX * worldScale - originX
              : projectToScreen(st.lat, st.lon).x;
            const posY = meta
              ? meta.normY * worldScale - originY
              : projectToScreen(st.lat, st.lon).y;

            if (
              posX < -radius * 2 ||
              posX > width + radius * 2 ||
              posY < -radius * 2 ||
              posY > height + radius * 2
            ) {
              continue;
            }
            drawnCount++;
            const dotColor =
              meta?.dotColor || getAmedasMetricColor(st, amedasMetric);
            let group = colorBatches.get(dotColor);
            if (!group) {
              group = [];
              colorBatches.set(dotColor, group);
            }
            group.push({ x: posX, y: posY });
          }

          ctx.lineWidth = strokeWidth;
          ctx.strokeStyle = '#0B0D12';
          for (const [dotColor, pts] of colorBatches.entries()) {
            ctx.beginPath();
            for (let i = 0; i < pts.length; i++) {
              const p = pts[i];
              ctx.moveTo(p.x + radius, p.y);
              ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            }
            ctx.fillStyle = dotColor;
            ctx.fill();
            ctx.stroke();
          }
        }

        setDs(canvas, 'amedasMetric', amedasMetric);
        setDs(canvas, 'renderedStationCount', String(drawnCount));
        setDs(canvas, 'selectedStationCount', String(visibleStations.length));
      } else {
        delete canvas.dataset.renderedStationCount;
        delete canvas.dataset.selectedStationCount;
      }

      // 2. Warnings 3-Stage Hierarchy Labels:
      //    - tier === 'prefecture' (`zoom < 5.5`): 0 labels (clean nationwide map like JMA)
      //    - tier === 'division' (`5.5 <= zoom < 6.8`): 地方・都府県名ラベル (`宗谷地方`, `上川・留萌地方`, `青森県`, etc.)
      //    - tier === 'municipality' (`zoom >= 6.8`): 市区町村名ラベル (`稚内市`, `札幌市`, etc.)
      if (effectiveScene === 'warnings') {
        const tier = getWarningMapZoomTier(currentZoom);
        const focusedDivCode = activeWarningDivision?.divisionCode || null;
        setDs(canvas, 'warningZoomTier', tier);
        const drawnLabels: string[] = [];

        const minSafeX = 28;
        const maxSafeX = width - 28;
        const minSafeY = 92;
        const maxSafeY = height - 42;

        if (tier === 'division') {
          ctx.font =
            '800 12px "Noto Sans JP", "Hiragino Kaku Gothic ProN", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 3.4;
          ctx.lineJoin = 'round';
          ctx.strokeStyle = '#0B0D12';
          ctx.fillStyle = '#FFFFFF';

          const placedBoxes: Array<{
            x: number;
            y: number;
            w: number;
            h: number;
          }> = [];

          for (let idx = 0; idx < preCompiledDivisionLabels.length; idx++) {
            const entry = preCompiledDivisionLabels[idx];
            if (focusedDivCode && entry.div.code !== focusedDivCode) continue;
            const labelText = entry.labelText;
            if (!labelText) continue;
            const posX = entry.normX * worldScale - originX;
            const posY = entry.normY * worldScale - originY;
            const boxW = Math.max(44, labelText.length * 12 + 6);
            const boxH = 18;

            if (
              posX - boxW / 2 < minSafeX ||
              posX + boxW / 2 > maxSafeX ||
              posY - boxH / 2 < minSafeY ||
              posY + boxH / 2 > maxSafeY
            ) {
              continue;
            }

            let overlaps = false;
            for (let i = 0; i < placedBoxes.length; i++) {
              const b = placedBoxes[i];
              if (
                Math.abs(posX - b.x) < (boxW + b.w) / 2 + 2 &&
                Math.abs(posY - b.y) < (boxH + b.h) / 2 + 2
              ) {
                overlaps = true;
                break;
              }
            }
            if (overlaps) continue;
            placedBoxes.push({ x: posX, y: posY, w: boxW, h: boxH });
            drawnLabels.push(labelText);

            ctx.strokeText(labelText, posX, posY);
            ctx.fillText(labelText, posX, posY);
          }
        } else if (tier === 'municipality') {
          ctx.font =
            '800 11px "Noto Sans JP", "Hiragino Kaku Gothic ProN", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 3.2;
          ctx.lineJoin = 'round';
          ctx.strokeStyle = '#0B0D12';
          ctx.fillStyle = '#FFFFFF';

          const placedMuniBoxes: Array<{
            x: number;
            y: number;
            w: number;
            h: number;
          }> = [];

          const maxMuniLabels = moving ? 80 : Infinity;
          for (let idx = 0; idx < preCompiledMunicipalityLabels.length; idx++) {
            if (placedMuniBoxes.length >= maxMuniLabels) break;
            const entry = preCompiledMunicipalityLabels[idx];
            if (
              focusedDivCode &&
              entry.muni.divisionCode !== focusedDivCode
            ) {
              continue;
            }
            const labelText = entry.labelText;
            if (!labelText) continue;
            const posX = entry.normX * worldScale - originX;
            const posY = entry.normY * worldScale - originY;
            const boxW = Math.max(38, labelText.length * 11 + 4);
            const boxH = 16;

            if (
              posX - boxW / 2 < minSafeX ||
              posX + boxW / 2 > maxSafeX ||
              posY - boxH / 2 < minSafeY ||
              posY + boxH / 2 > maxSafeY
            ) {
              continue;
            }

            let overlaps = false;
            for (let i = 0; i < placedMuniBoxes.length; i++) {
              const b = placedMuniBoxes[i];
              if (
                Math.abs(posX - b.x) < (boxW + b.w) / 2 + 3 &&
                Math.abs(posY - b.y) < (boxH + b.h) / 2 + 3
              ) {
                overlaps = true;
                break;
              }
            }
            if (overlaps) continue;
            placedMuniBoxes.push({ x: posX, y: posY, w: boxW, h: boxH });
            drawnLabels.push(labelText);

            ctx.strokeText(labelText, posX, posY);
            ctx.fillText(labelText, posX, posY);
          }
        }

        setDs(canvas, 'renderedWarningLabelCount', String(drawnLabels.length));
        setDs(canvas, 'renderedWarningLabelsSample', drawnLabels
          .slice(0, 10)
          .join(','));
      } else {
        delete canvas.dataset.warningZoomTier;
        delete canvas.dataset.renderedWarningLabelCount;
        delete canvas.dataset.renderedWarningLabelsSample;
      }

      ctx.restore();
    };

    renderInteractiveCanvasRef.current();
  }, [
    effectiveScene,
    preCompiledAmedas,
    preCompiledMunicipalityLabels,
    preCompiledDivisionLabels,
    data.warnings,
    data.muniSeverityMap,
    data.prefSeverityMap,
    amedasMetric,
    warningZoomTier,
    activeWarningDivision?.divisionCode,
    compiledVersion,
  ]);

  // Real-time animation clock for EEW wave front propagation (P-wave & S-wave expansion)
  useEffect(() => {
    if (!activeEew || !isEewStillActive(activeEew)) return;
    const timer = setInterval(() => {
      setEewAnimNow(Date.now());
    }, 200);
    return () => clearInterval(timer);
  }, [activeEew]);

  // Load World Countries GeoJSON, 47-prefecture Japan GeoJSON, JMA Municipality (`class20s`) + Dissolved 57 Divisions (`class10s`), and Tsunami coastline GeoJSON
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
      .then(({ class20, dissolvedDivisions }) => {
        if (!cancelled) {
          if (class20) setClass20GeoJsonData(class20);
          if (dissolvedDivisions) {
            setDissolvedDivisionsGeoJson(dissolvedDivisions);
          }
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
  // Smoothly moves (`flyTo`) to each regional stop (including smooth transition when entering AMeDAS from another zoomed-in tab!)
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

    // 1. Smoothly transition (`flyTo`) to Nationwide view (`全国表示`: `[36.8, 137.5], zoom: 5`) if not already there
    map.stop();
    const initialStop = AMEDAS_PATROL_STOPS[0];
    const curCenter = map.getCenter();
    const curZoom = map.getZoom();
    const needsInitialFly =
      Math.abs(curCenter.lat - initialStop.center[0]) > 0.02 ||
      Math.abs(curCenter.lng - initialStop.center[1]) > 0.02 ||
      Math.abs(curZoom - initialStop.zoom) > 0.02;

    if (needsInitialFly) {
      map.flyTo(initialStop.center, initialStop.zoom, {
        animate: true,
        duration: 1.5,
        easeLinearity: 0.1,
      });
    }

    // Step through each stop in AMEDAS_PATROL_STOPS[1..] (`北海道 -> 東北 -> 関東中部近畿 -> 中国四国九州 -> 沖縄 -> 全国表示`)
    // Hold ~5 seconds (5000ms) at each regional stop so viewers can clearly inspect every region!
    let cumulativeDelayMs = (needsInitialFly ? 1500 : 0) + 3500;

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

  // Initialize Leaflet Map once with compact SVG overlay renderer and explicit z-index panes
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

    const radarPane = map.createPane('radarPane');
    radarPane.style.zIndex = '450';
    radarPane.style.pointerEvents = 'none';

    const vectorOverlayPane = map.createPane('vectorOverlayPane');
    vectorOverlayPane.style.zIndex = '500';

    // Use compact padding (0.4) on overlay SVG renderer so it never exceeds Chromium's GPU texture limit
    overlayRendererRef.current = L.svg({
      padding: 0.4,
      pane: 'vectorOverlayPane',
    }).addTo(map);

    const overlayGroup = L.layerGroup().addTo(map);
    overlayGroupRef.current = overlayGroup;

    let zoomAnimRaf = 0;
    let frameRenderRaf = 0;
    let lastEmitTime = 0;

    const syncViewportSize = () => {
      const container = map.getContainer();
      viewportSizeRef.current = {
        width: container.clientWidth || 1280,
        height: container.clientHeight || 720,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      };
    };
    syncViewportSize();

    // Adaptive duty-cycle throttle: remember how long the last canvas render took and never let the renderer
    // occupy more than ~50% of the main thread while the camera moves (keeps Leaflet's own animation smooth).
    let lastRenderMs = 0;
    let lastRenderEnd = 0;
    const timedRender = (
      overrideCenter?: { lat: number; lng: number },
      overrideZoom?: number
    ) => {
      const t0 = performance.now();
      renderInteractiveCanvasRef.current(overrideCenter, overrideZoom);
      lastRenderEnd = performance.now();
      lastRenderMs = lastRenderEnd - t0;
    };
    const shouldSkipFrame = () =>
      isMovingRef.current &&
      lastRenderMs > 8 &&
      performance.now() - lastRenderEnd < lastRenderMs;

    const flushFrameUpdate = () => {
      frameRenderRaf = 0;
      const z = map.getZoom();
      const nextTier = getWarningMapZoomTier(z);
      if (nextTier !== warningZoomTierRef.current) {
        warningZoomTierRef.current = nextTier;
        setWarningZoomTier(nextTier);
      }
      timedRender();
    };

    const handleFrameUpdate = () => {
      if (frameRenderRaf !== 0) return;
      frameRenderRaf = requestAnimationFrame(() => {
        if (shouldSkipFrame()) {
          frameRenderRaf = 0;
          return;
        }
        flushFrameUpdate();
      });
    };

    const handleMoveStart = () => {
      isMovingRef.current = true;
    };

    const handleResize = () => {
      syncViewportSize();
      flushFrameUpdate();
    };

    const handleZoomAnim = (e: L.ZoomAnimEvent) => {
      cancelAnimationFrame(zoomAnimRaf);
      if ((e as any).noUpdate) {
        return;
      }
      const startCenter = map.getCenter();
      const startZoom = map.getZoom();
      const targetCenter = e.center;
      const targetZoom = e.zoom;
      const startTime = performance.now();
      const durationMs = 250;

      const step = (now: number) => {
        const rawT = Math.min(1, (now - startTime) / durationMs);
        const easeT = 1 - Math.pow(1 - rawT, 3);
        const curZoom = startZoom + (targetZoom - startZoom) * easeT;
        const curLat =
          startCenter.lat + (targetCenter.lat - startCenter.lat) * easeT;
        const curLng =
          startCenter.lng + (targetCenter.lng - startCenter.lng) * easeT;

        const nextTier = getWarningMapZoomTier(curZoom);
        if (nextTier !== warningZoomTierRef.current) {
          warningZoomTierRef.current = nextTier;
          setWarningZoomTier(nextTier);
        }
        if (!shouldSkipFrame()) {
          timedRender({ lat: curLat, lng: curLng }, curZoom);
        }

        if (rawT < 1) {
          zoomAnimRaf = requestAnimationFrame(step);
        }
      };

      zoomAnimRaf = requestAnimationFrame(step);
    };

    const emitViewport = () => {
      isMovingRef.current = false;
      cancelAnimationFrame(zoomAnimRaf);
      if (frameRenderRaf !== 0) {
        cancelAnimationFrame(frameRenderRaf);
        frameRenderRaf = 0;
      }
      const now = performance.now();
      if (now - lastEmitTime < 12) {
        return;
      }
      lastEmitTime = now;

      (overlayRendererRef.current as any)?._reset?.();
      flushFrameUpdate();
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

    map.on('movestart', handleMoveStart);
    map.on('zoomstart', handleMoveStart);
    map.on('move', handleFrameUpdate);
    map.on('zoom', handleFrameUpdate);
    map.on('zoomanim', handleZoomAnim);
    map.on('viewreset', flushFrameUpdate);
    map.on('resize', handleResize);
    map.on('zoomend', emitViewport);
    map.on('moveend', emitViewport);

    mapInstanceRef.current = map;
    emitViewport();

    return () => {
      cancelAnimationFrame(zoomAnimRaf);
      cancelAnimationFrame(frameRenderRaf);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);


  // Render JMA Tsunami Coastline Vector Layer (`tsunami.json`) in `tsunami` scene
  // Rendered with dual-pass (underlay dark casing + bold colored warning stroke)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tsunamiCasingLayerRef.current) {
      map.removeLayer(tsunamiCasingLayerRef.current);
      tsunamiCasingLayerRef.current = null;
    }
    if (tsunamiGeoJsonLayerRef.current) {
      map.removeLayer(tsunamiGeoJsonLayerRef.current);
      tsunamiGeoJsonLayerRef.current = null;
    }

    if (effectiveScene !== 'tsunami' || !tsunamiGeoJsonData) return;

    const areaForecasts =
      activeTsunamiForecast && !activeTsunamiForecast.cancelled
        ? activeTsunamiForecast.areas
        : [];
    const areaMapByCode: Record<string, TsunamiForecastArea> = {};
    const areaMapByName: Record<string, TsunamiForecastArea> = {};
    for (const a of areaForecasts) {
      if (a.code) areaMapByCode[a.code] = a;
      if (a.name) areaMapByName[a.name] = a;
    }

    // 1. Underlay dark casing stroke layer (eliminates gaps / outlines coastline cleanly)
    const casingLayer = L.geoJSON(tsunamiGeoJsonData, {
      pane: 'vectorOverlayPane',
      style: (feature) => {
        const code = String(
          feature?.properties?.code || feature?.properties?.areaCode || ''
        );
        const name = String(feature?.properties?.name || '');
        const matched = areaMapByCode[code] || areaMapByName[name];
        const grade = matched?.grade;
        if (grade && grade !== 'Unknown') {
          const casingWeight =
            grade === 'MajorWarning'
              ? 16
              : grade === 'Warning'
                ? 14.5
                : grade === 'Watch'
                  ? 12.5
                  : 11;
          return {
            pane: 'vectorOverlayPane',
            renderer: overlayRendererRef.current ?? undefined,
            color: '#050810',
            weight: casingWeight,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round',
          };
        }
        return {
          pane: 'vectorOverlayPane',
          renderer: overlayRendererRef.current ?? undefined,
          color: '#000000',
          weight: 0,
          opacity: 0,
        };
      },
      interactive: false,
    }).addTo(map);
    tsunamiCasingLayerRef.current = casingLayer;

    // 2. Top warning color stroke layer (Bold JMA disaster broadcast aesthetic)
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
              ? 11.5
              : grade === 'Warning'
                ? 10.0
                : grade === 'Watch'
                  ? 8.5
                  : 7.5;
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
      const hasActiveTsunami = Boolean(
        activeTsunamiForecast &&
          !activeTsunamiForecast.cancelled &&
          activeTsunamiForecast.areas.length > 0
      );
      if (!hasActiveTsunami) {
        return {
          center: [36.8, 137.5],
          zoom: 5.2,
        };
      }

      const hypoLat =
        typeof activeTsunamiForecast?.lat === 'number' &&
        !Number.isNaN(activeTsunamiForecast.lat)
          ? activeTsunamiForecast.lat
          : null;
      const hypoLon =
        typeof activeTsunamiForecast?.lon === 'number' &&
        !Number.isNaN(activeTsunamiForecast.lon)
          ? activeTsunamiForecast.lon
          : null;

      const areaForecasts = activeTsunamiForecast?.areas || [];
      const activeAreaCodes = new Set<string>();
      const activeAreaNames = new Set<string>();
      for (const a of areaForecasts) {
        if (a.grade && a.grade !== 'Unknown') {
          if (a.code) activeAreaCodes.add(a.code);
          if (a.name) activeAreaNames.add(a.name);
        }
      }

      const allLats: number[] = [];
      const allLons: number[] = [];

      if (hypoLat !== null && hypoLon !== null) {
        allLats.push(hypoLat);
        allLons.push(hypoLon);
      }

      if (tsunamiGeoJsonData && Array.isArray(tsunamiGeoJsonData.features)) {
        for (const f of tsunamiGeoJsonData.features) {
          const code = String(
            f?.properties?.code || f?.properties?.areaCode || ''
          );
          const name = String(f?.properties?.name || '');
          if (activeAreaCodes.has(code) || activeAreaNames.has(name)) {
            const geom = f.geometry;
            if (!geom) continue;
            if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
              for (const pt of geom.coordinates) {
                if (Array.isArray(pt) && pt.length >= 2) {
                  allLons.push(Number(pt[0]));
                  allLats.push(Number(pt[1]));
                }
              }
            } else if (
              geom.type === 'MultiLineString' &&
              Array.isArray(geom.coordinates)
            ) {
              for (const line of geom.coordinates) {
                if (Array.isArray(line)) {
                  for (const pt of line) {
                    if (Array.isArray(pt) && pt.length >= 2) {
                      allLons.push(Number(pt[0]));
                      allLats.push(Number(pt[1]));
                    }
                  }
                }
              }
            }
          }
        }
      }

      if (allLats.length > 0 && allLons.length > 0) {
        const minLat = Math.min(...allLats);
        const maxLat = Math.max(...allLats);
        const minLon = Math.min(...allLons);
        const maxLon = Math.max(...allLons);

        const latSpan = maxLat - minLat;
        const lonSpan = maxLon - minLon;
        const maxSpan = Math.max(latSpan, lonSpan * 0.7);

        let targetZoom = 5.2;
        if (maxSpan <= 1.2) {
          targetZoom = 7.5;
        } else if (maxSpan <= 2.2) {
          targetZoom = 6.8;
        } else if (maxSpan <= 3.8) {
          targetZoom = 6.2;
        } else if (maxSpan <= 6.0) {
          targetZoom = 5.7;
        } else if (maxSpan <= 9.0) {
          targetZoom = 5.2;
        } else {
          targetZoom = 4.8;
        }

        // Slightly offset lon to the east so the feature center isn't covered by the right panel
        const lonOffset = targetZoom >= 6.5 ? 0.35 : 0.8;

        return {
          center: [
            (minLat + maxLat) / 2,
            (minLon + maxLon) / 2 + lonOffset,
          ],
          zoom: targetZoom,
        };
      }

      return {
        center: [36.8, 137.5],
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
      duration: 1.35,
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
    activeTsunamiForecast?.id,
    activeTsunamiForecast?.lat,
    activeTsunamiForecast?.lon,
    activeTsunamiForecast?.areas.length,
    tsunamiGeoJsonData,
  ]);

  // Update JMA High-Resolution Precipitation Nowcast (`hrpns`) + Lightning Nowcast (`thns`)
  // Rendered inside `radarPane` (z-index: 450) directly ON TOP of the Japan & World maps.
  // Layers are cached per frame and the NEXT frame is preloaded invisibly (opacity 0), so frame changes are
  // a cheap opacity swap instead of destroying/recreating a tile layer (which re-downloaded every tile each 1.8s).
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const cache = radarLayerCacheRef.current;

    const wanted = new Map<
      string,
      { opacity: number; make: () => L.GridLayer }
    >();

    if (effectiveScene === 'radar' && data.nowcastTimes.length > 0) {
      const total = data.nowcastTimes.length;
      const safeIdx = Math.min(radarFrameIndex, total - 1);

      const addFrame = (idx: number, visible: boolean) => {
        const entry = data.nowcastTimes[idx];
        if (!entry || !entry.basetime || !entry.validtime) return;
        wanted.set(`hrpns:${entry.basetime}:${entry.validtime}`, {
          opacity: visible ? 0.92 : 0,
          make: () =>
            createJmaSeamlessNowcastLayer(
              entry.basetime,
              entry.validtime,
              'hrpns',
              0.92,
              450
            ),
        });
        // Lightning Nowcast (`thns`) overlay ONLY during Pass 1 (2周目: 雨雲＋雷レーダー)
        if (radarPass === 1 && entry.thnsBasetime && entry.thnsValidtime) {
          wanted.set(`thns:${entry.thnsBasetime}:${entry.thnsValidtime}`, {
            opacity: visible ? 0.84 : 0,
            make: () =>
              createJmaSeamlessNowcastLayer(
                entry.thnsBasetime!,
                entry.thnsValidtime!,
                'thns',
                0.84,
                460
              ),
          });
        }
      };

      // Preload next frame first so the visible (current) frame wins if both resolve to the same key
      if (total > 1) addFrame((safeIdx + 1) % total, false);
      addFrame(safeIdx, true);
    }

    for (const [key, layer] of Array.from(cache.entries())) {
      if (!wanted.has(key)) {
        map.removeLayer(layer);
        cache.delete(key);
      }
    }
    for (const [key, spec] of wanted.entries()) {
      let layer = cache.get(key);
      if (!layer) {
        layer = spec.make();
        layer.addTo(map);
        cache.set(key, layer);
      }
      layer.setOpacity(spec.opacity);
    }
  }, [effectiveScene, radarFrameIndex, radarPass, data.nowcastTimes]);

  // Render scene-specific markers & Typhoon Track / Forecast Cone in `vectorOverlayPane` (padding: 3.5)
  // Note: `amedas` and `warnings` labels are rendered on the 60fps `interactiveCanvasRef` so they never blur or snap during zoom!
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

    if (effectiveScene === 'tsunami') {
      const hasActiveTsunami = Boolean(
        activeTsunamiForecast &&
          !activeTsunamiForecast.cancelled &&
          activeTsunamiForecast.areas.length > 0
      );

      const hypoLat =
        hasActiveTsunami &&
        typeof activeTsunamiForecast?.lat === 'number' &&
        !Number.isNaN(activeTsunamiForecast.lat)
          ? activeTsunamiForecast.lat
          : null;
      const hypoLon =
        hasActiveTsunami &&
        typeof activeTsunamiForecast?.lon === 'number' &&
        !Number.isNaN(activeTsunamiForecast.lon)
          ? activeTsunamiForecast.lon
          : null;

      if (hypoLat !== null && hypoLon !== null) {
        const epiIcon = L.divIcon({
          className: 'tsunami-epicenter-marker',
          html: `
            <div style="position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;transform:translate(-50%, -50%);">
              <svg width="34" height="34" viewBox="0 0 32 32" fill="none" style="filter: drop-shadow(0 2px 5px rgba(0,0,0,0.95));">
                <path d="M6 6L26 26M26 6L6 26" stroke="#050810" stroke-width="8" stroke-linecap="round"/>
                <path d="M6 6L26 26M26 6L6 26" stroke="#EF4444" stroke-width="4.8" stroke-linecap="round"/>
                <path d="M6 6L26 26M26 6L6 26" stroke="#FCA5A5" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <div style="margin-top:2px;white-space:nowrap;background:rgba(15,23,42,0.94);border:1px solid #DC2626;border-radius:2px;padding:1px 6px;font-family:'JetBrains Mono',sans-serif;font-size:11px;font-weight:bold;color:#FCA5A5;box-shadow:0 2px 6px rgba(0,0,0,0.85);">
                ✕ 震央
              </div>
            </div>
          `,
          iconSize: [34, 52],
          iconAnchor: [17, 17],
        });
        L.marker([hypoLat, hypoLon], {
          icon: epiIcon,
          zIndexOffset: 3000,
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
      {/* Crisp 60fps High-DPI Base Map & Warning Choropleth Canvas (Never Blurs During or After Zoom) */}
      <canvas
        ref={baseMapCanvasRef}
        data-testid="crisp-basemap-canvas"
        className="absolute inset-0 w-full h-full pointer-events-none z-[5]"
      />

      {/* Main Full-Screen Leaflet Map Container (Radar Tiles & Vector Overlays) */}
      <div
        ref={mapContainerRef}
        data-testid="monitor-map-canvas"
        className="w-full h-full z-[10] cursor-crosshair"
      />

      {/* Interactive 60fps High-DPI Overlay Canvas for Smooth AMeDAS & Warning Hierarchy Labels */}
      <canvas
        ref={interactiveCanvasRef}
        data-testid="interactive-map-overlay-canvas"
        className="absolute inset-0 w-full h-full pointer-events-none z-[390]"
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
              duration: 0.75,
              easeLinearity: 0.15,
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
              duration: 0.75,
              easeLinearity: 0.15,
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
              duration: 1.3,
              easeLinearity: 0.1,
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
              duration: 1.4,
              easeLinearity: 0.1,
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
            (ズーム連動・重なり防止高密度表示)
          </span>
        </div>
      )}
    </div>
  );
});

