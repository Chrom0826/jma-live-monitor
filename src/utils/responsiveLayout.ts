export const DESKTOP_UI_BASE_FONT_SIZE_PX = 16;
export const DESKTOP_LEFT_PANEL_WIDTH_PX = 264;
export const DESKTOP_RIGHT_PANEL_WIDTH_PX = 244;
export const DESKTOP_RIGHT_PANEL_OFFSET_PX = 12;
export const DESKTOP_BOTTOM_BAR_HEIGHT_PX = 84;

const REF_LAPTOP_WIDTH_PX = 1480;
const REF_LAPTOP_HEIGHT_PX = 860;
const NARROW_DESKTOP_WIDTH_PX = 1100;
const MIN_DESKTOP_SCALE = 0.84;
const MAX_DESKTOP_SCALE = 2.35;

/**
 * Computes a responsive UI scale factor for desktop viewports so that panels,
 * headers, clocks, and typography keep balanced proportions from standard laptops
 * (~1280x720..1536x864 -> scale 1.0) up to 27-inch WQHD/4K monitors.
 *
 * Mobile portrait layouts always use scale 1.0.
 */
export function computeDesktopUiScale(
  viewportWidth: number,
  viewportHeight: number,
  isMobilePortrait: boolean
): number {
  if (isMobilePortrait) return 1;
  if (
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return 1;
  }

  if (viewportWidth < NARROW_DESKTOP_WIDTH_PX) {
    const narrowScale = Math.max(
      MIN_DESKTOP_SCALE,
      viewportWidth / NARROW_DESKTOP_WIDTH_PX
    );
    return Math.round(narrowScale * 100) / 100;
  }

  const rawScale = Math.min(
    viewportWidth / REF_LAPTOP_WIDTH_PX,
    viewportHeight / REF_LAPTOP_HEIGHT_PX
  );
  const clamped = Math.min(MAX_DESKTOP_SCALE, Math.max(1, rawScale));
  return Math.round(clamped * 100) / 100;
}

export function getRootFontSizePx(
  uiScale: number,
  isMobilePortrait: boolean
): number {
  if (isMobilePortrait || !Number.isFinite(uiScale) || uiScale <= 0) {
    return DESKTOP_UI_BASE_FONT_SIZE_PX;
  }
  return Math.round(DESKTOP_UI_BASE_FONT_SIZE_PX * uiScale * 100) / 100;
}

export interface SafeViewportPadding {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Safe margins inside the map container matching the responsive floating
 * right detail panel, top-left header margin, and bottom control bars.
 */
export function getSafeViewportPadding(opts: {
  isMobilePortrait: boolean;
  isRightPanelHidden: boolean;
  uiScale: number;
}): SafeViewportPadding {
  if (opts.isMobilePortrait) {
    return {
      left: 10,
      right: 10,
      top: 32,
      bottom: 10,
    };
  }

  const s =
    Number.isFinite(opts.uiScale) && opts.uiScale > 0 ? opts.uiScale : 1;
  const rightUnobstructed =
    DESKTOP_RIGHT_PANEL_WIDTH_PX + DESKTOP_RIGHT_PANEL_OFFSET_PX;

  return {
    left: Math.round(20 * s),
    right: Math.round((opts.isRightPanelHidden ? 20 : rightUnobstructed) * s),
    top: Math.round(44 * s),
    bottom: Math.round(54 * s),
  };
}

/**
 * Adjusts map maxZoom bounds proportionally on larger desktop displays so
 * Japan and regional bounds maintain consistent screen coverage instead of
 * shrinking inside a large viewport.
 */
export function getScaledMaxZoom(
  baseMaxZoom: number,
  uiScale: number,
  isMobilePortrait: boolean,
  hardMaxZoom = 12
): number {
  if (isMobilePortrait || !Number.isFinite(uiScale) || uiScale <= 1) {
    return baseMaxZoom;
  }
  return Math.min(hardMaxZoom, baseMaxZoom + Math.log2(uiScale));
}
