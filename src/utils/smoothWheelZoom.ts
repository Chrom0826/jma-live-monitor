import L from 'leaflet';

/**
 * Continuous, cursor-anchored mouse-wheel / trackpad zoom for Leaflet.
 *
 * Leaflet's built-in ScrollWheelZoom debounces the wheel, then starts a 250ms CSS zoom animation and
 * IGNORES every further zoom request until that animation ends (`_tryAnimatedZoom` returns early while
 * `_animatingZoom`). Spinning the wheel therefore moves in "accelerate -> stop -> accelerate" steps.
 *
 * This handler instead keeps a target zoom that every wheel event updates immediately, and eases the
 * actual zoom towards it once per animation frame (critically damped, frame-rate independent). Each frame
 * is applied with Leaflet's internal `_move(..., { flyTo: true })` — the same path `flyTo()` uses — so all
 * layers/markers follow and the canvas renderer draws synchronously in the same VSync.
 */

export interface SmoothWheelZoomOptions {
  /** Wheel pixels per zoom level (Leaflet default is 60). */
  pxPerZoomLevel?: number;
  /** Easing time constant in ms (smaller = snappier). */
  timeConstantMs?: number;
}

type MapInternals = L.Map & {
  _move(center: L.LatLng, zoom: number, data?: unknown): L.Map;
  _moveStart(zoomChanged: boolean, noMoveStart: boolean): L.Map;
  _moveEnd(zoomChanged: boolean): L.Map;
  _stop(): L.Map;
  _limitZoom(zoom: number): number;
  _panAnim?: { _inProgress?: boolean };
  _animatingZoom?: boolean;
};

/**
 * Same per-event sensitivity curve as Leaflet's ScrollWheelZoom (incl. its browser/DPR normalisation via
 * `L.DomEvent.getWheelDelta`), so one wheel notch zooms by the amount users are used to (~0.5 level).
 */
const wheelEventToZoomDelta = (e: WheelEvent, pxPerZoomLevel: number): number => {
  const px = L.DomEvent.getWheelDelta(e); // positive = zoom in
  if (!px) return 0;
  const d2 = Math.abs(px) / (pxPerZoomLevel * 4);
  const d3 = (4 * Math.log(2 / (1 + Math.exp(-d2)))) / Math.LN2;
  return px > 0 ? d3 : -d3;
};

export function attachSmoothWheelZoom(
  map: L.Map,
  options: SmoothWheelZoomOptions = {}
): () => void {
  const m = map as MapInternals;
  const pxPerZoomLevel = options.pxPerZoomLevel ?? 60;
  const tau = options.timeConstantMs ?? 75;
  const container = map.getContainer();

  let raf = 0;
  let active = false;
  let selfStarting = false;
  let lastT = 0;
  let curZoom = 0;
  let targetZoom = 0;
  // Geographic point that must stay under the cursor, and the cursor offset from the container center.
  let anchor: L.LatLng | null = null;
  let anchorOffset = L.point(0, 0);

  const centerFor = (zoom: number): L.LatLng => {
    if (!anchor) return map.getCenter();
    const anchorPx = map.project(anchor, zoom);
    return map.unproject(anchorPx.subtract(anchorOffset), zoom);
  };

  const finish = () => {
    raf = 0;
    if (!active) return;
    active = false;
    const z = targetZoom;
    m._move(centerFor(z), z);
    m._moveEnd(true);
  };

  const step = (t: number) => {
    const dt = lastT ? Math.min(64, t - lastT) : 16;
    lastT = t;
    const k = 1 - Math.exp(-dt / tau);
    curZoom += (targetZoom - curZoom) * k;
    if (Math.abs(targetZoom - curZoom) < 0.002) {
      curZoom = targetZoom;
      finish();
      return;
    }
    m._move(centerFor(curZoom), curZoom, { flyTo: true });
    raf = requestAnimationFrame(step);
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    let dz = wheelEventToZoomDelta(e, pxPerZoomLevel);
    if (!dz) return;
    // Trackpad pinch arrives as ctrl+wheel with tiny deltas: make it a bit more sensitive.
    if (e.ctrlKey) dz *= 2.5;
    // Clamp a single event so a free-spinning wheel can't jump several levels at once.
    dz = Math.max(-1, Math.min(1, dz));

    const rect = container.getBoundingClientRect();
    const cursor = L.point(e.clientX - rect.left, e.clientY - rect.top);
    const size = map.getSize();

    if (!active) {
      // Take over from any running flyTo / pan / Leaflet zoom animation.
      if (m._animatingZoom) return; // let a native (e.g. double-click) zoom animation finish first
      m._stop();
      curZoom = map.getZoom();
      targetZoom = curZoom;
      active = true;
      lastT = 0;
      selfStarting = true;
      m._moveStart(true, false);
      selfStarting = false;
    }
    targetZoom = m._limitZoom(targetZoom + dz);
    // Re-anchor at the current cursor position (geographic point under the cursor at the CURRENT zoom).
    anchorOffset = cursor.subtract(size.divideBy(2));
    anchor = map.unproject(
      map.project(map.getCenter(), curZoom).add(anchorOffset),
      curZoom
    );
    if (!raf) raf = requestAnimationFrame(step);
  };

  // A programmatic flyTo / setView started elsewhere (scene patrol, buttons) wins over the wheel animation.
  const onForeignMoveStart = () => {
    if (selfStarting || !active) return;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    active = false;
  };

  container.addEventListener('wheel', onWheel, { passive: false });
  map.on('movestart', onForeignMoveStart);

  return () => {
    container.removeEventListener('wheel', onWheel);
    map.off('movestart', onForeignMoveStart);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    active = false;
  };
}
