/**
 * 图像画布舞台身份（image canvas stage）单测。
 *
 * 该模块把「媒体查看器正在展示单张画布」这一业务事实投影成 DOM 可见标识，
 * 供 hub 侧的输入框投射规则消费：只有在画布 + 右侧栏全屏时才把原生输入框
 * 悬浮到画布底端。测试覆盖身份判定与可见性同步两条口径。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  IMAGE_CANVAS_ATTR,
  IMAGE_CANVAS_VISIBLE_ATTR,
  isImageCanvasActive,
  syncImageCanvasStage,
} from './image-canvas-stage.js';

/** 最小 DOM 替身：只实现被使用到的属性接口。 */
function createNode() {
  const attrs = new Map();
  return {
    attrs,
    offsetParent: {},
    getAttribute(name) {
      return attrs.has(name) ? attrs.get(name) : null;
    },
    setAttribute(name, value) {
      attrs.set(name, String(value));
    },
    removeAttribute(name) {
      attrs.delete(name);
    },
    hasAttribute(name) {
      return attrs.has(name);
    },
  };
}

function assertCanvasActive(root, message) {
  assert.equal(root.getAttribute(IMAGE_CANVAS_ATTR), 'true', message);
}

function assertCanvasInactive(root, message) {
  assert.equal(root.hasAttribute(IMAGE_CANVAS_ATTR), false, message);
}

describe('isImageCanvasActive', () => {
  it('单图浏览且存在活动媒体时声明画布身份', () => {
    assert.equal(isImageCanvasActive({ subViewMode: 'single', hasActiveMedia: true }), true);
  });

  it('时间线（grid）不声明画布身份', () => {
    assert.equal(isImageCanvasActive({ subViewMode: 'grid', hasActiveMedia: true }), false);
  });

  it('没有活动媒体时不声明画布身份', () => {
    assert.equal(isImageCanvasActive({ subViewMode: 'single', hasActiveMedia: false }), false);
  });

  it('视图模式缺省时按非画布处理', () => {
    assert.equal(isImageCanvasActive({}), false);
    assert.equal(isImageCanvasActive(), false);
  });
});

describe('syncImageCanvasStage', () => {
  it('单图可见时写入画布身份与可见标识', () => {
    const root = createNode();
    syncImageCanvasStage(root, { subViewMode: 'single', hasActiveMedia: true, visible: true });
    assertCanvasActive(root, '画布身份应写入');
    assert.equal(root.getAttribute(IMAGE_CANVAS_VISIBLE_ATTR), 'true');
  });

  it('时间线态清除画布身份', () => {
    const root = createNode();
    syncImageCanvasStage(root, { subViewMode: 'single', hasActiveMedia: true, visible: true });
    syncImageCanvasStage(root, { subViewMode: 'grid', hasActiveMedia: true, visible: true });
    assertCanvasInactive(root, '切到时间线必须清除画布身份');
    assert.equal(root.getAttribute(IMAGE_CANVAS_VISIBLE_ATTR), 'true');
  });

  it('画布身份存在但舞台不可见时标记不可见', () => {
    const root = createNode();
    syncImageCanvasStage(root, { subViewMode: 'single', hasActiveMedia: true, visible: false });
    assertCanvasActive(root, '不可见不等于撤销身份');
    assert.equal(root.getAttribute(IMAGE_CANVAS_VISIBLE_ATTR), 'false');
  });

  it('重复同步是幂等的', () => {
    const root = createNode();
    const state = { subViewMode: 'single', hasActiveMedia: true, visible: true };
    syncImageCanvasStage(root, state);
    syncImageCanvasStage(root, state);
    assertCanvasActive(root, '幂等：再次同步仍为画布');
    assert.equal(root.getAttribute(IMAGE_CANVAS_VISIBLE_ATTR), 'true');
  });

  it('失效节点不抛错（组件卸载后同步安全）', () => {
    assert.doesNotThrow(() => syncImageCanvasStage(null, { subViewMode: 'single', hasActiveMedia: true, visible: true }));
    assert.doesNotThrow(() => syncImageCanvasStage({}, { subViewMode: 'single', hasActiveMedia: true }));
  });
});
