import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
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
  computeTyphoonConeEnvelope,
  filterNonOverlappingPoints,
  getAmedasTempGradientColor,
  getSeismicScaleStyle,
} from '../utils/jmaParser';

interface MonitorMapProps {
  activeScene: SceneId;
  activeRegionConfig: RegionConfig;
  data: MonitorDataBundle;
  selectedEarthquake: EarthquakeReport;
  selectedTyphoon: TyphoonReport;
  activeVolcano: VolcanoStatusItem;
  activeTsunamiStation: TsunamiStationItem;
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

// Scene-specific camera positions when in 'national' mode
const SCENE_CAMERA_TARGETS: Record<
  SceneId,
  { center: [number, number]; zoom: number }
> = {
  warnings: { center: [38.2, 137.5], zoom: 5 },
  radar: { center: [36.8, 137.5], zoom: 5 },
  typhoon: { center: [37.5, 149.0], zoom: 4 },
  weather_info: { center: [37.5, 138.0], zoom: 5 },
  amedas: { center: [37.8, 137.5], zoom: 5 },
  forecast: { center: [36.2, 137.5], zoom: 5 },
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
  data,
  selectedEarthquake,
  selectedTyphoon,
  activeVolcano,
  activeTsunamiStation,
  interruptKind,
  isLoopPaused,
  onSceneComplete,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const worldGeoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);
  const hrpnsLayerRef = useRef<L.GridLayer | null>(null);
  const thnsLayerRef = useRef<L.GridLayer | null>(null);
  const worldRendererRef = useRef<L.SVG | null>(null);
  const japanRendererRef = useRef<L.SVG | null>(null);
  const overlayRendererRef = useRef<L.SVG | null>(null);
  const isFirstMountRef = useRef<boolean>(true);
  const onSceneCompleteRef = useRef<() => void>(onSceneComplete);

  useEffect(() => {
    onSceneCompleteRef.current = onSceneComplete;
  }, [onSceneComplete]);

  const [worldGeoJsonData, setWorldGeoJsonData] = useState<any>(null);
  const [geoJsonData, setGeoJsonData] = useState<any>(null);
  const [radarFrameIndex, setRadarFrameIndex] = useState<number>(0);
  const [mapZoomVersion, setMapZoomVersion] = useState<number>(0);

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

  // Load both World Countries GeoJSON and 47-prefecture Japan GeoJSON once
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

    return () => {
      cancelled = true;
    };
  }, []);

  // Reset radar frame index to 0 whenever entering 'radar' scene
  useEffect(() => {
    if (effectiveScene === 'radar') {
      setRadarFrameIndex(0);
    }
  }, [effectiveScene]);

  // Step through all radar timeframes from 0 to last frame, then advance scene
  useEffect(() => {
    if (effectiveScene !== 'radar') return;
    const totalFrames = Math.max(1, data.nowcastTimes.length);

    const timer = setTimeout(() => {
      if (radarFrameIndex < totalFrames - 1) {
        setRadarFrameIndex((prev) => prev + 1);
      } else if (!isLoopPaused && interruptKind === 'none') {
        onSceneCompleteRef.current();
      } else {
        setRadarFrameIndex(0);
      }
    }, 2200);

    return () => clearTimeout(timer);
  }, [
    effectiveScene,
    radarFrameIndex,
    data.nowcastTimes.length,
    isLoopPaused,
    interruptKind,
  ]);

  // Initialize Leaflet Map once with large-padding SVG renderers and explicit z-index panes
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [38.2, 137.5],
      zoom: 5,
      minZoom: 2,
      maxZoom: 12,
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 1,
      wheelPxPerZoomLevel: 60,
      worldCopyJump: true,
    });

    // 1. Create dedicated panes in strict bottom-to-top z-index order:
    //    worldPane (210) -> japanPane (350) -> radarPane (450) -> vectorOverlayPane (500) -> markerPane (600)
    const worldPane = map.createPane('worldPane');
    worldPane.style.zIndex = '210';
    worldPane.style.pointerEvents = 'none';

    const japanPane = map.createPane('japanPane');
    japanPane.style.zIndex = '350';
    japanPane.style.pointerEvents = 'none';

    const radarPane = map.createPane('radarPane');
    radarPane.style.zIndex = '450';
    radarPane.style.pointerEvents = 'none';

    const vectorOverlayPane = map.createPane('vectorOverlayPane');
    vectorOverlayPane.style.zIndex = '500';

    // 2. Create high-padding SVG renderers (padding: 3.5 = 350% buffer around screen)
    //    so map polygons and typhoon tracks/cones NEVER clip during camera flight
    worldRendererRef.current = L.svg({
      padding: 3.5,
      pane: 'worldPane',
    }).addTo(map);
    japanRendererRef.current = L.svg({
      padding: 3.5,
      pane: 'japanPane',
    }).addTo(map);
    overlayRendererRef.current = L.svg({
      padding: 3.5,
      pane: 'vectorOverlayPane',
    }).addTo(map);

    const overlayGroup = L.layerGroup().addTo(map);
    overlayGroupRef.current = overlayGroup;

    map.on('zoomend', () => {
      setMapZoomVersion((v) => v + 1);
    });

    mapInstanceRef.current = map;

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

  // Render / Update 47-prefecture Japan GeoJSON Choropleth Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !geoJsonData || !japanRendererRef.current) return;

    if (geoJsonLayerRef.current) {
      map.removeLayer(geoJsonLayerRef.current);
      geoJsonLayerRef.current = null;
    }

    const layer = L.geoJSON(geoJsonData, {
      pane: 'japanPane',
      style: (feature) => {
        const prefId = Number(feature?.properties?.id || 0);
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
  }, [geoJsonData, effectiveScene, data.prefSeverityMap]);

  // Compute target camera center & zoom for the active scene
  const getSceneCameraTarget = (): {
    center: [number, number];
    zoom: number;
  } => {
    if (effectiveScene === 'earthquake') {
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
        center: [activeTsunamiStation.lat, activeTsunamiStation.lon],
        zoom: 8,
      };
    }
    if (effectiveScene === 'typhoon') {
      const pts = selectedTyphoon.points;
      if (pts.length > 0) {
        const lats = pts.map((p) => p.lat);
        const lons = pts.map((p) => p.lon);
        const minLat = Math.min(...lats, 30.0);
        const maxLat = Math.max(...lats, 45.5);
        const minLon = Math.min(...lons, 132.0);
        const maxLon = Math.max(...lons);
        const latSpan = maxLat - minLat;
        const lonSpan = maxLon - minLon;
        // Zoom 4 ensures the entire Typhoon track, forecast circles, and Japan fit cleanly without cutoff
        const targetZoom = latSpan > 11 || lonSpan > 18 ? 4 : 5;
        return {
          center: [(minLat + maxLat) / 2, (minLon + maxLon) / 2 + 2.0],
          zoom: targetZoom,
        };
      }
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

  // High-acceleration camera flight (`flyTo`) on scene, region, typhoon, or interrupt change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const { center: targetCenter, zoom: targetZoom } = getSceneCameraTarget();

    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      map.setView(targetCenter, targetZoom, { animate: false });
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
    selectedEarthquake.id,
    selectedEarthquake.lat,
    selectedEarthquake.lon,
    selectedTyphoon.id,
    activeVolcano.id,
    activeVolcano.lat,
    activeVolcano.lon,
    activeTsunamiStation.id,
    activeTsunamiStation.lat,
    activeTsunamiStation.lon,
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

        if (entry.thnsBasetime && entry.thnsValidtime) {
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
  }, [effectiveScene, radarFrameIndex, data.nowcastTimes]);

  // Render scene-specific markers & Typhoon Track / Forecast Cone in `vectorOverlayPane` (padding: 3.5)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = overlayGroupRef.current;
    const overlayRenderer = overlayRendererRef.current;
    if (!group || !map || !overlayRenderer) return;
    group.clearLayers();

    if (effectiveScene === 'radar') {
      for (const pt of data.lightningPoints) {
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
    } else if (effectiveScene === 'warnings') {
      // Choropleth polygons color the map directly
    } else if (effectiveScene === 'typhoon') {
      const pts = selectedTyphoon.points;
      if (pts.length > 0) {
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

        // 3. Center Track Polyline (中心進路予想線)
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

          // 5. Point Markers & Broadcast Callout Badges
          if (idx === 0) {
            // Current Typhoon Center '×' Symbol + Primary Badge
            const centerCrossIcon = L.divIcon({
              className: 'custom-typhoon-center-cross',
              html: `
                <div style="position:relative;display:flex;align-items:center;justify-content:center;width:28px;height:28px;">
                  <svg data-testid="typhoon-center-cross" width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M5 5L19 19M19 5L5 19" stroke="#0B0D12" stroke-width="5.5" stroke-linecap="square"/>
                    <path d="M5 5L19 19M19 5L5 19" stroke="#FFFFFF" stroke-width="3" stroke-linecap="square"/>
                  </svg>
                  <div style="position:absolute;top:28px;left:50%;transform:translateX(-50%);background:rgba(17,19,24,0.96);border:2px solid #EF4444;padding:3px 9px;white-space:nowrap;font-family:'JetBrains Mono',monospace;box-shadow:0 4px 12px rgba(0,0,0,0.7);">
                    <div style="color:#FFFFFF;font-size:12px;font-weight:800;">
                      ${selectedTyphoon.displayNumber}（${selectedTyphoon.nameJp}）実況
                    </div>
                    <div style="color:#FDE047;font-size:11px;font-weight:700;">
                      中心気圧 ${pt.pressureHpa}hPa / 最大風速 ${pt.maxWindMs}m/s (${pt.course} ${pt.speedKmh}km/h)
                    </div>
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

            const anchorX = idx % 2 === 1 ? -12 : 175;
            const fcIcon = L.divIcon({
              className: 'custom-typhoon-fc-label',
              html: `
                <div style="display:inline-block;background:rgba(17,19,24,0.93);border:1px solid #94A3B8;padding:2px 7px;white-space:nowrap;font-family:'JetBrains Mono',monospace;">
                  <div style="color:#38BDF8;font-size:11px;font-weight:800;">${pt.timeLabel}</div>
                  <div style="color:#F8FAFC;font-size:10px;">
                    ${pt.categoryJp} · ${pt.pressureHpa}hPa${pt.maxWindMs > 0 ? ` · ${pt.maxWindMs}m/s` : ''}
                  </div>
                </div>
              `,
              iconSize: [165, 34],
              iconAnchor: [anchorX, 17],
            });
            L.marker([pt.lat, pt.lon], { icon: fcIcon }).addTo(group);
          }
        });
      }
    } else if (effectiveScene === 'amedas') {
      // Filter AMeDAS stations at target zoom using Mercator pixel projection (`map.project`)
      // Circle radius 3.3px (diameter 6.6px), minimum center distance 7.6px -> slightly larger and zero overlap!
      const targetZoom = getSceneCameraTarget().zoom;
      const currentZoom = map.getZoom();
      const projectionZoom =
        Math.abs(currentZoom - targetZoom) <= 1 ? currentZoom : targetZoom;

      const nonOverlappingStations = filterNonOverlappingPoints(
        data.amedas,
        (lat, lon) => {
          const pt = map.project([lat, lon], projectionZoom);
          return { x: pt.x, y: pt.y };
        },
        7.6
      );

      for (const st of nonOverlappingStations) {
        const dotColor = getAmedasTempGradientColor(st.temp);
        L.circleMarker([st.lat, st.lon], {
          pane: 'vectorOverlayPane',
          renderer: overlayRenderer,
          className: 'amedas-station-circle',
          radius: 3.3,
          color: '#0B0D12',
          fillColor: dotColor,
          fillOpacity: 0.96,
          weight: 0.5,
          interactive: false,
        }).addTo(group);
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
    } else if (effectiveScene === 'tsunami') {
      L.circle([activeTsunamiStation.lat, activeTsunamiStation.lon], {
        pane: 'vectorOverlayPane',
        renderer: overlayRenderer,
        radius: 18000,
        color: '#F59E0B',
        weight: 2,
        fillColor: '#F59E0B',
        fillOpacity: 0.2,
        interactive: false,
      }).addTo(group);

      const icon = L.divIcon({
        className: 'custom-tsunami-focus',
        html: `
          <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(18,18,22,0.95);border:2px solid #F59E0B;padding:4px 10px;white-space:nowrap;font-family:'JetBrains Mono',monospace;">
            <span style="color:#FDE047;font-size:12px;font-weight:800;">● 潮位変化観測</span>
            <span style="color:#FFFFFF;font-size:12px;font-weight:700;">${activeTsunamiStation.stationName}</span>
            <span style="color:#F59E0B;font-size:12px;font-weight:800;">+${activeTsunamiStation.tideLevelM.toFixed(2)}m</span>
          </div>
        `,
        iconSize: [240, 32],
        iconAnchor: [120, -10],
      });
      L.marker([activeTsunamiStation.lat, activeTsunamiStation.lon], {
        icon,
      }).addTo(group);
    } else if (effectiveScene === 'earthquake') {
      const targetZoom = getSceneCameraTarget().zoom;
      const currentZoom = map.getZoom();
      const projectionZoom =
        Math.abs(currentZoom - targetZoom) <= 1 ? currentZoom : targetZoom;

      const sortedStations = [...selectedEarthquake.stations]
        .filter(
          (st): st is typeof st & { lat: number; lon: number } =>
            typeof st.lat === 'number' &&
            typeof st.lon === 'number' &&
            !Number.isNaN(st.lat) &&
            !Number.isNaN(st.lon)
        )
        .sort((a, b) => b.scaleCode - a.scaleCode);

      // Track placed screen-space bounding boxes so seismic intensity badges never overlap
      const placedBoxes: Array<{
        x: number;
        y: number;
        w: number;
        h: number;
      }> = [];

      // Reserve epicenter cross area first so station badges don't cover the '×' symbol
      const epiPt = map.project(
        [selectedEarthquake.lat, selectedEarthquake.lon],
        projectionZoom
      );
      placedBoxes.push({ x: epiPt.x, y: epiPt.y, w: 30, h: 30 });

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
  }, [
    effectiveScene,
    data,
    selectedEarthquake,
    selectedTyphoon,
    activeVolcano,
    activeTsunamiStation,
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

      {/* Compact Radar Scrubber */}
      {effectiveScene === 'radar' && (
        <div
          data-testid="radar-scrubber-bar"
          className="absolute bottom-3 left-64 z-[400] bg-[#111318]/92 border border-neutral-700/80 px-2.5 py-1 flex items-center gap-1.5"
        >
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
    </div>
  );
};
