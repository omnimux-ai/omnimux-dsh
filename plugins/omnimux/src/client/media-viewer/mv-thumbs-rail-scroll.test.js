/**
 * 大图预览页左侧缩略图栏契约测试 (specs/viewer-thumbs-rail-scroll.spec.md)
 * 验证：
 * 1. 去胶囊外壳：栏贴画布左缘从顶到底（top/left/bottom 0），无背景/边框/磨砂/投影；
 * 2. 自身纵向滚动：overflow-y:auto + overscroll-behavior-y:contain，滚轮不外泄；
 * 3. 滚轮守卫：stage 的 wheel 监听在栏内命中 .omx-mv-thumbnails-rail 时放行，
 *    不再 preventDefault 拦截为画布缩放。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { MEDIA_VIEWER_CSS } from './styles.js';

function railBlock(css) {
  const match = css.match(/\.omx-mv-thumbnails-rail\s*\{[^}]*\}/s);
  assert.ok(match, 'thumbnails rail rule must exist');
  return match[0];
}

describe('左侧缩略图栏贴边与滚轮放行契约', () => {
  it('AC-1: 栏贴画布左缘从顶到底', () => {
    const rail = railBlock(MEDIA_VIEWER_CSS);
    assert.match(rail, /top:\s*0;/, 'rail top 必须为 0');
    assert.match(rail, /left:\s*0;/, 'rail left 必须为 0');
    assert.match(rail, /bottom:\s*0;/, 'rail bottom 必须为 0');
    assert.doesNotMatch(rail, /top:\s*20px|left:\s*20px/, '严禁残留 20px 悬浮偏移');
  });

  it('AC-2: 无胶囊外壳', () => {
    const rail = railBlock(MEDIA_VIEWER_CSS);
    assert.doesNotMatch(rail, /background:/, 'rail 不得有背景色');
    assert.doesNotMatch(rail, /border:/, 'rail 不得有边框');
    assert.doesNotMatch(rail, /backdrop-filter/, 'rail 不得有磨砂');
    assert.doesNotMatch(rail, /box-shadow/, 'rail 不得有投影');
    assert.doesNotMatch(rail, /border-radius/, 'rail 不得有圆角');
  });

  it('AC-3: 自身可纵向滚动且滚轮不外泄', () => {
    const rail = railBlock(MEDIA_VIEWER_CSS);
    assert.match(rail, /overflow-y:\s*auto/, 'rail 必须 overflow-y:auto');
    assert.match(rail, /overscroll-behavior-y:\s*contain/, 'rail 滚轮边界不得传给父级');
    assert.match(rail, /scrollbar-width:\s*none/, '滚动条保持隐藏');
  });

  it('AC-4: stage wheel 监听放行栏内滚轮', () => {
    const tabSource = readFileSync(
      new URL('../../../../omnimux-viewer/src/media-viewer/MediaViewerTab.jsx', import.meta.url),
      'utf8'
    );
    assert.match(
      tabSource,
      /closest\(['"]\.omx-mv-thumbnails-rail['"]\)\)\s*return;/s,
      'stage wheel 监听必须在栏内命中时 return 放行，严禁 preventDefault 拦截'
    );
    // 守卫必须在 preventDefault 之前
    const guardIdx = tabSource.indexOf(".closest('.omx-mv-thumbnails-rail')) return;");
    const preventIdx = tabSource.indexOf('e.preventDefault();', guardIdx - 200);
    assert.ok(guardIdx > -1 && preventIdx > guardIdx, '栏内放行守卫必须先于 preventDefault 执行');
  });
});
