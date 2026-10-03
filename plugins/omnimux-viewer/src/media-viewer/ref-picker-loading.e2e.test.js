/**
 * Issue #3012 追加需求：选择素材弹层布局修正与数据加载优化的样式/结构契约。
 * 规格：specs/3012-ref-picker-align-composer.spec.md §6 追加需求
 * 浏览器证据：.agent-reports/issue-3012/layout-*.png + layout-loading-geometry.json
 * 几何实测：上传卡 120×190 固定左侧、与第一列素材间距 10px；网格 190px 高独立滚动
 * （本地 14 素材 scrollHeight 290 > clientHeight 190，公共 3 素材 190=190 无滚动条）；
 * 弹层与 body 均不滚动（scrollTop 恒 0）；底部内边距 12px（bodyBottomSpace ≈ 1px 含边框）。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { MEDIA_VIEWER_CSS } from '../../../omnimux/src/client/media-viewer/styles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const popoverSrc = fs.readFileSync(path.join(__dirname, 'ReferencePickerPopover.jsx'), 'utf8');

function ruleBody(selector) {
  const start = MEDIA_VIEWER_CSS.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `缺少规则 ${selector}`);
  const open = MEDIA_VIEWER_CSS.indexOf('{', start);
  return MEDIA_VIEWER_CSS.slice(open + 1, MEDIA_VIEWER_CSS.indexOf('}', open));
}

describe('Issue #3012 追加需求：弹层布局修正', () => {
  it('内容区为 flex 行布局（上传卡左、网格右），间距 10px，不再整层滚动', () => {
    const body = ruleBody('.omx-ref-picker-body');
    assert.match(body, /display:\s*flex;/);
    assert.match(body, /gap:\s*10px;/);
    assert.doesNotMatch(body, /min-height:/);
    assert.doesNotMatch(body, /overflow(-y)?:\s*auto/, 'body 不得再承载滚动');
    assert.match(body, /padding:\s*12px 14px;/, '底部只保留标准内边距');
  });

  it('素材网格为独立滚动区：固定 190px 两行高、行高 90px、只纵向滚动', () => {
    const body = ruleBody('.omx-ref-picker-grid');
    assert.match(body, /height:\s*190px;/);
    assert.match(body, /grid-auto-rows:\s*90px;/);
    assert.match(body, /overflow-y:\s*auto;/);
    assert.match(body, /overflow-x:\s*hidden;/);
    assert.match(body, /flex:\s*1;/, '无上传卡的 Tab 网格占满剩余宽度');
  });

  it('上传卡脱离网格为固定 120×190 左列（保留锁定断言要求的历史属性）', () => {
    const body = ruleBody('.omx-ref-picker-upload-card');
    assert.match(body, /grid-row:\s*span\s*2;/);
    assert.match(body, /min-width:\s*120px;/);
    assert.match(body, /min-height:\s*190px;/);
    assert.match(body, /flex-shrink:\s*0;/);
    assert.doesNotMatch(body, /aspect-ratio:\s*1\s*\/\s*1;/);
    // DOM 结构：上传卡在 body 内、网格外
    const bodyIdx = popoverSrc.indexOf('omx-ref-picker-body');
    const uploadIdx = popoverSrc.indexOf('omx-ref-picker-upload-card', bodyIdx);
    const gridIdx = popoverSrc.indexOf('omx-ref-picker-grid', bodyIdx);
    assert.ok(bodyIdx > -1 && uploadIdx > bodyIdx && gridIdx > uploadIdx,
      '上传卡必须位于 body 内且在网格之前（网格外）');
  });
});

describe('Issue #3012 追加需求：加载态与缩略图', () => {
  it('骨架卡样式存在：灰底 + 扫光，数量按 SKELETON_COUNT=8 铺满两行', () => {
    assert.match(popoverSrc, /SKELETON_COUNT\s*=\s*8/);
    assert.match(popoverSrc, /is-skeleton/);
    assert.ok(MEDIA_VIEWER_CSS.includes('.omx-ref-picker-asset-thumb.is-skeleton'));
    assert.ok(MEDIA_VIEWER_CSS.includes('omx-ref-picker-skeleton-sweep'));
  });

  it('缩略图 lazy + async 解码，加载完成前透明度 0、onLoad 后 200ms 淡入', () => {
    assert.match(popoverSrc, /decoding="async"/);
    assert.match(popoverSrc, /loading="lazy"/);
    const imgBody = ruleBody('.omx-ref-picker-asset-thumb img');
    assert.match(imgBody, /opacity:\s*0;/);
    assert.match(imgBody, /transition:\s*opacity\s*0\.2s/);
    assert.match(ruleBody('.omx-ref-picker-asset-thumb img.is-loaded'), /opacity:\s*1;/);
  });

  it('prefers-reduced-motion 下关闭扫光与淡入', () => {
    const rm = MEDIA_VIEWER_CSS.indexOf('prefers-reduced-motion');
    assert.notEqual(rm, -1);
    const slice = MEDIA_VIEWER_CSS.slice(rm, rm + 900);
    assert.match(slice, /animation:\s*none;/);
    assert.match(slice, /opacity:\s*1;/);
  });

  it('离线占位只在「无缓存且请求失败」时使用；加载态为骨架而非占位', () => {
    assert.match(popoverSrc, /status === 'error'/);
    assert.match(popoverSrc, /showSkeleton/);
    assert.match(popoverSrc, /ensureReferenceTab\(activeTab, fetchTabAssets\)/);
    assert.match(popoverSrc, /subscribeReferenceAssets/);
    assert.ok(!popoverSrc.includes('setLoading('), '不得再出现单一 loading 布尔');
    assert.ok(!popoverSrc.includes('realData['), '不得再走组件级 state 缓存');
  });

  it('新增可见文字数量为 0：无加载中/失败/重试/toast 等字样', () => {
    for (const banned of ['加载中', '加载失败', '正在加载', '重新加载', '刷新数据', 'toast', 'Loading']) {
      assert.equal(popoverSrc.includes(banned), false, `不得出现可见字样/控件: ${banned}`);
    }
    assert.equal(popoverSrc.includes('从本地上传'), true, '上传卡文案保持不变');
    assert.equal(popoverSrc.includes('只看我的'), true, '过滤开关文案保持不变');
  });
});
