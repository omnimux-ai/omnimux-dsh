/**
 * E2E 契约：资产抽屉悬停放大预览按原素材比例，仅限制最大边 360（Issue #3136）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(join(here, 'views/HoverInspector.tsx'), 'utf8');
const mediaThumb = readFileSync(join(here, 'MediaThumb.tsx'), 'utf8');
const css = readFileSync(join(here, '../../../theme/components.css'), 'utf8');

test('E2E: 悬停放大预览按原素材比例（Issue #3136）', async (t) => {
  await t.test('最大边阈值固定为 360，且不再写死 260×140', () => {
    assert.match(component, /PREVIEW_MAX_EDGE\s*=\s*360/);
    assert.equal(/cardWidth\s*=\s*260\b/.test(component), false, '不得再固定宽 260');
    assert.equal(/\.wf-hover-inspector-preview\s*\{[^}]*height:\s*140px;/.test(css), false, '悬停预览区不得再固定高 140');
    assert.equal(/offsetHeight \|\| 142\b/.test(component), false, '不得再使用 142 兜底高度');
  });

  await t.test('按自然尺寸拟合，完整呈现不裁切', () => {
    assert.match(component, /fitWithinMaxEdge/);
    assert.match(component, /onNaturalSize/);
    assert.match(mediaThumb, /onNaturalSize\?:/);
    assert.match(mediaThumb, /naturalWidth/);
    assert.match(mediaThumb, /videoWidth/);
    assert.match(css, /\.wf-hover-inspector-img\s*\{[^}]*object-fit:\s*contain;/);
    assert.equal(/\.wf-hover-inspector-img\s*\{[^}]*object-fit:\s*cover;/.test(css), false);
  });

  await t.test('预览区只限制最大尺寸，宽高由组件内联设定', () => {
    assert.match(css, /max-width:\s*360px;/);
    assert.match(css, /max-height:\s*360px;/);
    assert.match(component, /style=\{\{\s*width:\s*`\$\{fitted\.width\}px`/);
    assert.match(component, /height:\s*`\$\{fitted\.height\}px`/);
  });

  await t.test('仍锚在侧边栏外侧左侧并做视口边界保护', () => {
    assert.match(component, /sidebarLeft\s*-\s*cardWidth/);
    assert.match(component, /top\s*=\s*anchorRect\.top/);
    assert.match(component, /left < 10/);
    assert.match(component, /maxTop/);
  });
});
