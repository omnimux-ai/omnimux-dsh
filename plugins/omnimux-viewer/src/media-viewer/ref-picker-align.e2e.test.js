/**
 * Issue #3012 选择素材弹层与输入框左右对齐：样式契约。
 * 弹层 `.omx-ref-picker-popover` 用 left/right:0 绝对定位，它的定位容器必须是输入框卡片
 * `.omx-mv-composer-root`，不能落到包含左侧「图像/视频」切换栏的 `.omx-mv-composer-outer`。
 * 规格：specs/3012-ref-picker-align-composer.spec.md
 * 浏览器证据：.agent-reports/issue-3012/ref-picker-align.{png,json}（左右边缘差 ≤1px）
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MEDIA_VIEWER_CSS } from '../../../omnimux/src/client/media-viewer/styles.js';

function ruleBody(selector) {
  const start = MEDIA_VIEWER_CSS.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `缺少规则 ${selector}`);
  const open = MEDIA_VIEWER_CSS.indexOf('{', start);
  return MEDIA_VIEWER_CSS.slice(open + 1, MEDIA_VIEWER_CSS.indexOf('}', open));
}

describe('Issue #3012 选择素材弹层与输入框对齐', () => {
  it('输入框卡片在外层容器内是 relative 定位容器，并清掉基础规则的居中偏移', () => {
    const body = ruleBody('.omx-mv-composer-outer .omx-mv-composer-root');
    assert.match(body, /position: relative;/);
    assert.match(body, /transform: none;/);
    assert.match(body, /left: auto;/);
    assert.match(body, /bottom: auto;/);
  });

  it('弹层仍以左右 0 撑满定位容器，并在其上方 8px 弹出', () => {
    const body = ruleBody('.omx-ref-picker-popover');
    assert.match(body, /position: absolute;/);
    assert.match(body, /left: 0;/);
    assert.match(body, /right: 0;/);
    assert.match(body, /bottom: calc\(100% \+ 8px\);/);
  });

  it('外层容器本身仍是绝对定位，不成为弹层的就近定位容器之外的第二层偏移', () => {
    const body = ruleBody('.omx-mv-composer-outer');
    assert.match(body, /position: absolute;/);
    assert.match(body, /max-width: 920px;/);
  });
});
