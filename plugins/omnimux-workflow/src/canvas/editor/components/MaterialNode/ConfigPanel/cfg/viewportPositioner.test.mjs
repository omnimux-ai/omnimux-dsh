/**
 * Unit tests for viewportPositioner & aspectRatioGeometry
 *
 * 遵循 Node 纯单测规范，覆盖 6 大场景：
 * 1. 正常视口居中位置 -> 上方弹出，限高 480px，bottom 坐标正确，left 对齐正确
 * 2. 靠视口顶部狭窄位置 -> 上方弹出，maxHeight 动态压缩为 280px，内部可滚动
 * 3. 极度贴近视口顶部位置 -> 向下翻转 (placement='bottom')，top 坐标正确，限高正常
 * 4. 靠视口右边缘位置 -> left 坐标向左推移，确保 left + 360 不超出视口边界
 * 5. 靠视口左边缘负坐标位置 -> left 被纠偏到 VIEWPORT_PADDING (12px)
 * 6. 画幅几何信息完整性校验 (16:9, 9:16, 1:1, 4:3, 3:4, 21:9, auto 及降级)
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculatePopoverPosition,
  GAP,
  PANEL_DEFAULT_MAX_HEIGHT,
  PANEL_MIN_HEIGHT,
  PANEL_WIDTH,
  resolvePanelWidth,
  VIEWPORT_PADDING,
} from './viewportPositioner.ts';
import {
  ASPECT_RATIO_GEOMETRIES,
  getAspectRatioGeometry,
  SUPPORTED_ASPECT_RATIOS,
} from './aspectRatioGeometry.ts';

describe('ViewportPositioner - 视口自适应弹性定位纯算法', () => {
  it('场景 1: 正常视口居中位置 -> 上方弹出，限高 480px，bottom 坐标正确，left 对齐正确', () => {
    const viewport = { width: 1200, height: 800 };
    const triggerRect = {
      top: 600,
      bottom: 632,
      left: 300,
      right: 420,
      width: 120,
      height: 32,
    };

    const pos = calculatePopoverPosition(triggerRect, viewport);

    // 校验基本规格
    assert.equal(pos.width, PANEL_WIDTH);
    assert.equal(pos.width, 360);

    // 校验向上弹出判定与限高
    assert.equal(pos.placement, 'top');
    assert.equal(pos.maxHeight, PANEL_DEFAULT_MAX_HEIGHT);
    assert.equal(pos.maxHeight, 480);

    // 校验坐标：bottom = viewport.height - triggerRect.top + GAP = 800 - 600 + 8 = 208
    assert.equal(pos.bottom, 208);
    assert.equal(pos.top, undefined);

    // 校验横向坐标无偏移
    assert.equal(pos.left, 300);
  });

  it('场景 2: 靠视口顶部狭窄位置 (如 triggerRect.top=300，spaceAbove约280px) -> 上方弹出，maxHeight 动态压缩为 280px，内部可滚动', () => {
    const viewport = { width: 1200, height: 800 };
    // triggerRect.top = 300
    // spaceAbove = 300 - 12 - 8 = 280px
    // spaceBelow = 800 - 332 - 12 - 8 = 448px
    // 尽管 spaceBelow > spaceAbove，但 spaceAbove (280) >= PANEL_MIN_HEIGHT (200)，优先上方弹出并弹性压缩
    const triggerRect = {
      top: 300,
      bottom: 332,
      left: 300,
      right: 420,
      width: 120,
      height: 32,
    };

    const pos = calculatePopoverPosition(triggerRect, viewport);

    assert.equal(pos.placement, 'top');
    // maxHeight 应精确压缩为 280px
    assert.equal(pos.maxHeight, 280);
    // bottom = 800 - 300 + 8 = 508
    assert.equal(pos.bottom, 508);
    assert.equal(pos.top, undefined);
    assert.equal(pos.left, 300);
  });

  it('场景 3: 极度贴近视口顶部位置 (如 triggerRect.top=50，spaceAbove<200 且 spaceBelow 充裕) -> 向下翻转 (placement=bottom)，top 坐标正确，限高正常', () => {
    const viewport = { width: 1200, height: 800 };
    // triggerRect.top = 50, bottom = 82
    // spaceAbove = 50 - 12 - 8 = 30px < 200px
    // spaceBelow = 800 - 82 - 12 - 8 = 698px
    const triggerRect = {
      top: 50,
      bottom: 82,
      left: 300,
      right: 420,
      width: 120,
      height: 32,
    };

    const pos = calculatePopoverPosition(triggerRect, viewport);

    assert.equal(pos.placement, 'bottom');
    // 下方空间充裕 (698px)，限高为默认最大高度 480px
    assert.equal(pos.maxHeight, PANEL_DEFAULT_MAX_HEIGHT);
    assert.equal(pos.maxHeight, 480);
    // top = triggerRect.bottom + GAP = 82 + 8 = 90
    assert.equal(pos.top, 90);
    assert.equal(pos.bottom, undefined);
    assert.equal(pos.left, 300);
  });

  it('场景 4: 靠视口右边缘位置 -> left 坐标向左推移，确保 left + width 不超出 viewport - VIEWPORT_PADDING', () => {
    const viewport = { width: 1000, height: 800 };
    // triggerRect.left = 850
    // left + width = 850 + 360 = 1210 > 1000 - 12 (988)
    // expectedLeft = 1000 - 12 - 360 = 628
    const triggerRect = {
      top: 600,
      bottom: 632,
      left: 850,
      right: 970,
      width: 120,
      height: 32,
    };

    const pos = calculatePopoverPosition(triggerRect, viewport);

    assert.equal(pos.left, 628);
    assert.equal(pos.left + pos.width, viewport.width - VIEWPORT_PADDING);
    assert.equal(pos.left + pos.width, 988);
  });

  it('场景 4b: 窄视口宽度夹紧 -> width = min(360, viewport-24)，left + width 不超出 viewport - 12', () => {
    // viewport.width = 320 → width = 320 - 24 = 296（宽视口仍为 360）
    assert.equal(resolvePanelWidth(1200), 360);
    assert.equal(resolvePanelWidth(320), 296);
    assert.equal(resolvePanelWidth(384), 360);

    const viewport = { width: 320, height: 800 };
    const triggerRect = {
      top: 600,
      bottom: 632,
      left: 40,
      right: 160,
      width: 120,
      height: 32,
    };

    const pos = calculatePopoverPosition(triggerRect, viewport);

    assert.equal(pos.width, 296);
    // left 被纠偏到安全边距，且 left + width 不超出 viewport - VIEWPORT_PADDING
    assert.equal(pos.left, VIEWPORT_PADDING);
    assert.ok(pos.left + pos.width <= viewport.width - VIEWPORT_PADDING);
  });

  it('场景 5: 靠视口左边缘负坐标位置 -> left 被纠偏到 VIEWPORT_PADDING (12px)', () => {
    const viewport = { width: 1000, height: 800 };
    // triggerRect.left = -50 (被拖拽出左边界)
    const triggerRect = {
      top: 600,
      bottom: 632,
      left: -50,
      right: 70,
      width: 120,
      height: 32,
    };

    const pos = calculatePopoverPosition(triggerRect, viewport);

    assert.equal(pos.left, VIEWPORT_PADDING);
    assert.equal(pos.left, 12);
  });

  it('边界测试: 极小视口与正好处于 PANEL_MIN_HEIGHT 临界点', () => {
    const viewport = { width: 400, height: 500 };
    // triggerRect.top = 220
    // spaceAbove = 220 - 12 - 8 = 200 (刚好等于 PANEL_MIN_HEIGHT)
    const triggerRect = {
      top: 220,
      bottom: 252,
      left: 10,
      right: 130,
      width: 120,
      height: 32,
    };

    const pos = calculatePopoverPosition(triggerRect, viewport);

    assert.equal(pos.placement, 'top');
    assert.equal(pos.maxHeight, PANEL_MIN_HEIGHT);
    assert.equal(pos.maxHeight, 200);
    assert.equal(pos.left, VIEWPORT_PADDING);
  });
});

describe('AspectRatioGeometry - 画幅几何规格与映射校验', () => {
  it('场景 6: 画幅几何信息完整性校验 (16:9, 9:16, 1:1, 4:3, 3:4, 21:9, auto)', () => {
    // 1. 校验 16:9
    const geo16_9 = getAspectRatioGeometry('16:9');
    assert.equal(geo16_9.ratio, '16:9');
    assert.equal(geo16_9.width, 22);
    assert.equal(geo16_9.height, 12.4);
    assert.equal(geo16_9.x, 1);
    assert.equal(geo16_9.y, 5.8);
    assert.equal(geo16_9.rx, 2);
    assert.equal(geo16_9.ry, 2);
    assert.equal(geo16_9.strokeWidth, 1.5);
    assert.equal(geo16_9.viewBox, '0 0 24 24');
    assert.equal(geo16_9.isDashed, false);

    // 2. 校验 9:16
    const geo9_16 = getAspectRatioGeometry('9:16');
    assert.equal(geo9_16.ratio, '9:16');
    assert.equal(geo9_16.width, 12.4);
    assert.equal(geo9_16.height, 22);
    assert.equal(geo9_16.x, 5.8);
    assert.equal(geo9_16.y, 1);
    assert.equal(geo9_16.rx, 2);
    assert.equal(geo9_16.ry, 2);
    assert.equal(geo9_16.strokeWidth, 1.5);

    // 3. 校验 1:1
    const geo1_1 = getAspectRatioGeometry('1:1');
    assert.equal(geo1_1.ratio, '1:1');
    assert.equal(geo1_1.width, 18);
    assert.equal(geo1_1.height, 18);
    assert.equal(geo1_1.x, 3);
    assert.equal(geo1_1.y, 3);

    // 4. 校验 4:3
    const geo4_3 = getAspectRatioGeometry('4:3');
    assert.equal(geo4_3.ratio, '4:3');
    assert.equal(geo4_3.width, 20);
    assert.equal(geo4_3.height, 15);
    assert.equal(geo4_3.x, 2);
    assert.equal(geo4_3.y, 4.5);

    // 5. 校验 3:4
    const geo3_4 = getAspectRatioGeometry('3:4');
    assert.equal(geo3_4.ratio, '3:4');
    assert.equal(geo3_4.width, 15);
    assert.equal(geo3_4.height, 20);
    assert.equal(geo3_4.x, 4.5);
    assert.equal(geo3_4.y, 2);

    // 6. 校验 21:9
    const geo21_9 = getAspectRatioGeometry('21:9');
    assert.equal(geo21_9.ratio, '21:9');
    assert.equal(geo21_9.width, 22);
    assert.equal(geo21_9.height, 9.4);
    assert.equal(geo21_9.x, 1);
    assert.equal(geo21_9.y, 7.3);

    // 7. 校验 auto (虚线)
    const geoAuto = getAspectRatioGeometry('auto');
    assert.equal(geoAuto.ratio, 'auto');
    assert.equal(geoAuto.width, 18);
    assert.equal(geoAuto.height, 18);
    assert.equal(geoAuto.x, 3);
    assert.equal(geoAuto.y, 3);
    assert.equal(geoAuto.strokeDasharray, '2 2');
    assert.equal(geoAuto.isDashed, true);

    // 8. 校验全量支持比例列表
    assert.ok(SUPPORTED_ASPECT_RATIOS.includes('16:9'));
    assert.ok(SUPPORTED_ASPECT_RATIOS.includes('9:16'));
    assert.ok(SUPPORTED_ASPECT_RATIOS.includes('1:1'));
    assert.ok(SUPPORTED_ASPECT_RATIOS.includes('4:3'));
    assert.ok(SUPPORTED_ASPECT_RATIOS.includes('3:4'));
    assert.ok(SUPPORTED_ASPECT_RATIOS.includes('21:9'));
    assert.ok(SUPPORTED_ASPECT_RATIOS.includes('auto'));

    // 9. 校验未知比例降级回退到 16:9
    const fallbackGeo = getAspectRatioGeometry('unknown_ratio');
    assert.equal(fallbackGeo.ratio, '16:9');
    assert.equal(fallbackGeo.width, 22);

    // 空字符串降级
    const emptyGeo = getAspectRatioGeometry('');
    assert.equal(emptyGeo.ratio, '16:9');
  });
});
