import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDesktopUiScale,
  DESKTOP_BOTTOM_BAR_HEIGHT_PX,
  DESKTOP_LEFT_PANEL_WIDTH_PX,
  DESKTOP_RIGHT_PANEL_WIDTH_PX,
  getRootFontSizePx,
  getSafeViewportPadding,
  getScaledMaxZoom,
} from './responsiveLayout';

test('computeDesktopUiScale preserves 1.0 across typical laptop resolutions', () => {
  assert.equal(computeDesktopUiScale(1280, 720, false), 1);
  assert.equal(computeDesktopUiScale(1366, 768, false), 1);
  assert.equal(computeDesktopUiScale(1440, 900, false), 1);
  assert.equal(computeDesktopUiScale(1536, 864, false), 1);
});

test('computeDesktopUiScale scales up smoothly for 27-inch WQHD and 4K displays', () => {
  const fhdScale = computeDesktopUiScale(1920, 1080, false);
  assert.ok(fhdScale > 1.15 && fhdScale < 1.35, `unexpected FHD scale: ${fhdScale}`);

  const wqhdScale = computeDesktopUiScale(2560, 1440, false);
  assert.ok(wqhdScale >= 1.55 && wqhdScale <= 1.75, `unexpected 27" WQHD scale: ${wqhdScale}`);

  // Left/right/bottom panel proportions stay close to laptop proportions (~16-18% side, ~9-10% bottom)
  const leftRatio = (DESKTOP_LEFT_PANEL_WIDTH_PX * wqhdScale) / 2560;
  const rightRatio = (DESKTOP_RIGHT_PANEL_WIDTH_PX * wqhdScale) / 2560;
  const bottomRatio = (DESKTOP_BOTTOM_BAR_HEIGHT_PX * wqhdScale) / 1440;
  assert.ok(leftRatio >= 0.15 && leftRatio <= 0.2, `leftRatio=${leftRatio}`);
  assert.ok(rightRatio >= 0.14 && rightRatio <= 0.19, `rightRatio=${rightRatio}`);
  assert.ok(bottomRatio >= 0.08 && bottomRatio <= 0.11, `bottomRatio=${bottomRatio}`);

  const uhdScale = computeDesktopUiScale(3840, 2160, false);
  assert.equal(uhdScale, 2.35);

  // Ultrawide uses height constraint so vertical bars don't bloat
  const ultrawideScale = computeDesktopUiScale(3440, 1440, false);
  assert.equal(ultrawideScale, wqhdScale);
});

test('computeDesktopUiScale preserves scale 1.0 in mobile portrait and handles edge inputs safely', () => {
  assert.equal(computeDesktopUiScale(390, 844, true), 1);
  assert.equal(computeDesktopUiScale(2560, 1440, true), 1);
  assert.equal(computeDesktopUiScale(0, 0, false), 1);
  assert.equal(computeDesktopUiScale(-100, 800, false), 1);
  assert.equal(computeDesktopUiScale(Number.NaN, 900, false), 1);

  const narrowDesktop = computeDesktopUiScale(960, 720, false);
  assert.ok(narrowDesktop >= 0.84 && narrowDesktop < 1);
});

test('getRootFontSizePx returns 16 on mobile portrait and scales on desktop', () => {
  assert.equal(getRootFontSizePx(1.67, true), 16);
  assert.equal(getRootFontSizePx(1, false), 16);
  assert.equal(getRootFontSizePx(1.5, false), 24);
});

test('getSafeViewportPadding aligns with responsive panel widths and preserves mobile portrait', () => {
  assert.deepEqual(
    getSafeViewportPadding({
      isMobilePortrait: true,
      isRightPanelHidden: false,
      uiScale: 1.67,
    }),
    { left: 10, right: 10, top: 32, bottom: 10 }
  );

  assert.deepEqual(
    getSafeViewportPadding({
      isMobilePortrait: false,
      isRightPanelHidden: false,
      uiScale: 1,
    }),
    { left: 20, right: 256, top: 44, bottom: 54 }
  );

  const wqhdPad = getSafeViewportPadding({
    isMobilePortrait: false,
    isRightPanelHidden: false,
    uiScale: 1.67,
  });
  assert.deepEqual(wqhdPad, {
    left: 33,
    right: 428,
    top: 73,
    bottom: 90,
  });

  const hiddenRightPad = getSafeViewportPadding({
    isMobilePortrait: false,
    isRightPanelHidden: true,
    uiScale: 1.67,
  });
  assert.deepEqual(hiddenRightPad, {
    left: 33,
    right: 33,
    top: 73,
    bottom: 90,
  });
});

test('getScaledMaxZoom scales zoom caps by log2(uiScale) on desktop while clamping to hardMaxZoom', () => {
  assert.equal(getScaledMaxZoom(5.1, 1, false), 5.1);
  assert.equal(getScaledMaxZoom(5.1, 1.67, true), 5.1);
  assert.ok(Math.abs(getScaledMaxZoom(5.1, 2, false) - 6.1) < 1e-6);
  assert.equal(getScaledMaxZoom(11.5, 2, false), 12);
});
