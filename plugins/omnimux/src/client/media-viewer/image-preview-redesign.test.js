/**
 * 图像生成大图预览与缩略图优化设计契约测试 (Issue #1844, specs/image-preview-redesign.spec.md)
 * 验证：
 * 1. 消除黑边：单图视口 padding: 0，大图 display 具备全景等比铺展能力；
 * 2. 左上角 1:1 居中缩略图：位置位于 top/left 20px，aspect-ratio 为 1:1，同轴水平居中对齐；
 * 3. 视觉层级：当前选中项为大尺寸纯白强发光边框，候选项目为微型暗色半透明；
 * 4. 跨图缩放锁定：切换素材时 zoom 状态保持锁定不自动重置。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMediaViewerStore } from './media-viewer-store.js';
import { MEDIA_VIEWER_CSS } from './styles.js';

describe('大图预览与左上角 1:1 居中缩略图契约测试 (Issue #1844)', () => {
  it('AC-1: 单图视口无死板黑边，无限制等比自适应', () => {
    const css = MEDIA_VIEWER_CSS;

    // 验证视口单图模式下 padding 为 0
    assert.match(
      css,
      /\.omx-mv-stage-wrapper\[data-subview="single"\]\s+\.omx-mv-viewport\s*\{[^}]*padding:\s*0\s*!important;/s,
      '单图视口必须消除 padding 以彻底去除黑边'
    );

    // 验证 display 容器不再硬编码 max-width: 90%
    assert.doesNotMatch(
      css,
      /\.omx-mv-display\s*\{[^}]*max-width:\s*90%/s,
      '大图展示容器不得硬编码 max-width: 90%'
    );
  });

  it('AC-2 & AC-3: 左上角 1:1 居中微型缩略图悬浮工具栏契约', () => {
    const css = MEDIA_VIEWER_CSS;

    // 验证缩略图栏位于左上角并居中对齐
    assert.match(
      css,
      /\.omx-mv-thumbnails-rail\s*\{[^}]*top:\s*20px;[^}]*left:\s*20px;/s,
      '缩略图悬浮栏必须定位在视口左上角'
    );
    assert.match(
      css,
      /\.omx-mv-thumbnails-rail\s*\{[^}]*align-items:\s*center;/s,
      '缩略图悬浮栏内子项必须同轴水平居中对齐'
    );

    // 验证缩略图项统一为 1:1 比例
    assert.match(
      css,
      /\.omx-mv-thumbnails-rail__item\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1;/s,
      '所有缩略图卡片必须保持 1:1 正方形比例'
    );

    // 验证当前选中项 (active) 具备纯白高亮边框和强光晕
    assert.match(
      css,
      /\.omx-mv-thumbnails-rail__item\.active\s*\{[^}]*border:\s*2\.5px solid/s,
      '当前选中的缩略图必须具备 2.5px 纯白高亮聚焦边框'
    );

    // 验证候选未选中项 (inactive) 尺寸更小且暗淡
    assert.match(
      css,
      /\.omx-mv-thumbnails-rail__item\.inactive[^}]*\{[^}]*width:\s*38px;[^}]*height:\s*38px;[^}]*opacity:\s*0\.38/s,
      '候选未选中的缩略图必须保持 38px 微型尺寸并压暗'
    );
  });

  it('AC-4: 跨图缩放记忆锁定：切图时不重置 zoom 状态', () => {
    const store = createMediaViewerStore({
      mediaList: [
        { id: 'img-1', url: 'https://example.com/1.jpg', title: '图1' },
        { id: 'img-2', url: 'https://example.com/2.jpg', title: '图2' },
      ],
      activeId: 'img-1',
      zoom: 100,
    });

    // 用户将画面放大至 180%
    store.setZoom(180);
    assert.equal(store.getSnapshot().zoom, 180, '缩放比例应设置为 180%');

    // 切换至第二张图片
    store.setActiveId('img-2');
    const snapshot = store.getSnapshot();
    assert.equal(snapshot.activeId, 'img-2', '活动图片应切换至图2');
    assert.equal(snapshot.zoom, 180, '切换图片后缩放比例必须保持锁定在 180%，严禁还原重置');
  });

  it('AC-5: 缩略图栏对视频素材正常渲染 video 封面而非破损 img (Issue #1852)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const tabSource = fs.readFileSync(new URL('./MediaViewerTab.jsx', import.meta.url), 'utf8');

    assert.match(
      tabSource,
      /item\.type === 'video'\s*\?\s*\(\s*<video[^>]*className="omx-mv-thumbnails-rail__img"/s,
      '当素材为视频时必须渲染包含 omx-mv-thumbnails-rail__img 类名的 video 标签'
    );
  });
});
