import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cascadePath = join(here, '../../src/canvas/editor/components/MaterialNode/ConfigPanel/ModelCascadeMenu.tsx');
const cssPath = join(here, '../../src/canvas/theme/components.css');

const cascadeSrc = readFileSync(cascadePath, 'utf8');
const cssSrc = readFileSync(cssPath, 'utf8');

test('e2e: model cascade menu columns adopt 160px min and 400px max adaptive height (Issue #2191)', () => {
  // 1. 验证品牌列、型号列与渠道策略列已移除固定 480px 机械写死
  assert.doesNotMatch(cssSrc, /\.wf-loomi-col--brand\s*\{[^}]*height:\s*480px;/s, 'Brand column must not lock fixed 480px');
  assert.doesNotMatch(cssSrc, /\.wf-loomi-col--model\s*\{[^}]*height:\s*480px;/s, 'Model column must not lock fixed 480px');
  assert.doesNotMatch(cssSrc, /\.wf-loomi-col--channel\s*\{[^}]*height:\s*480px;/s, 'Channel column must not lock fixed 480px');

  // 2. 验证多列采用 stretch 保持等高，且设置 min-height: 160px 与 max-height 400px 封顶
  assert.match(cssSrc, /\.wf-loomi-popover\s*\{[^}]*align-items:\s*stretch;/s, 'Popover must stretch columns for uniform height');
  assert.match(cssSrc, /\.wf-loomi-col\s*\{[^}]*min-height:\s*160px;/s, 'Columns must have min-height: 160px');
  assert.match(cssSrc, /\.wf-loomi-col\s*\{[^}]*max-height:\s*min\(400px,\s*calc\(100vh\s*-\s*120px\)\);/s, 'Columns must clamp at 400px max-height');

  // 3. 验证 ModelCascadeMenu 声明 POPOVER_MIN_HEIGHT 与 POPOVER_MAX_HEIGHT 并在 place() 执行纵向绝对位置防溢出保护
  assert.match(cascadeSrc, /POPOVER_MIN_HEIGHT\s*=\s*160/, 'ModelCascadeMenu must define POPOVER_MIN_HEIGHT');
  assert.match(cascadeSrc, /POPOVER_MAX_HEIGHT\s*=\s*400/, 'ModelCascadeMenu must define POPOVER_MAX_HEIGHT');
  assert.match(cascadeSrc, /\(lockedHeightRef\.current \?\? POPOVER_MAX_HEIGHT\) - 12/, 'ModelCascadeMenu place() must guard top overflow with the locked height');

  // 4. 验证结构完备性与无障碍属性
  assert.match(cascadeSrc, /aria-label="选择品牌"/, 'Brand column accessibility intact');
  assert.match(cascadeSrc, /aria-label="选择模型版本"/, 'Model column accessibility intact');
  assert.match(cascadeSrc, /aria-label="选择渠道策略"/, 'Channel column accessibility intact');
});

test('e2e: cascade popover locks one height per open so hovering cannot move the menu (Issue #2250)', () => {
  // 1. 量尺覆盖三种列形态，且离屏、不可见、不进无障碍树、不可交互
  assert.match(cascadeSrc, /wf-loomi-col--brand" data-cascade-probe-col=""/, 'Probe covers the brand column');
  assert.match(cascadeSrc, /wf-loomi-col--model" data-cascade-probe-col=""/, 'Probe covers every brand model column');
  assert.match(cascadeSrc, /wf-loomi-col--channel" data-cascade-probe-col=""/, 'Probe covers every model channel column');
  assert.match(cascadeSrc, /aria-hidden="true" style=\{PROBE_HOST_STYLE\}/, 'Probe host is hidden from assistive tech');
  assert.match(cascadeSrc, /visibility: 'hidden'/, 'Probe host is not visible');
  assert.match(cascadeSrc, /pointerEvents: 'none'/, 'Probe host is not interactive');

  // 2. 展开时用 useLayoutEffect 量最大自然高度并锁定到 160..400
  assert.match(cascadeSrc, /useLayoutEffect\(\(\) => \{/, 'Lock runs in useLayoutEffect (before paint)');
  assert.match(cascadeSrc, /height: lockedHeight/, 'Popover applies the locked height');
  assert.match(cascadeSrc, /Math\.min\(POPOVER_MAX_HEIGHT, Math\.max\(POPOVER_MIN_HEIGHT, Math\.round\(tallest\)\)\)/, 'Locked height stays within 160..400');

  // 3. 支点：锁定逻辑与悬停状态完全解耦。底边锚定的浮层一旦高度随悬停变化，顶边就会位移、
  //    光标下的行随之移走、悬停态翻转，形成整块浮层频闪抖动——这正是 #2195 引入的回归。
  const lockStart = cascadeSrc.indexOf('useLayoutEffect(() => {');
  const lockTail = '}, [isOpen, brandList]);';
  const lockEnd = cascadeSrc.indexOf(lockTail, lockStart);
  assert.ok(lockStart > -1 && lockEnd > lockStart, 'Height lock effect must be locatable');
  const lockEffect = cascadeSrc.slice(lockStart, lockEnd + lockTail.length);
  assert.doesNotMatch(lockEffect, /hoverBrandId|hoverModelId/, 'Height lock must not depend on hover state');
  assert.match(lockEffect, /querySelectorAll<HTMLElement>\('\[data-cascade-probe-col\]'\)/, 'Height lock measures every probe column');

  // 4. 真实列与量尺共用同一批子组件，量到的高度才等于真实渲染高度
  for (const shared of ['CascadeBrandItem', 'CascadeModelItem', 'CascadeChannelColumn']) {
    assert.ok(cascadeSrc.includes(`const ${shared}: React.FC<`), `${shared} must be shared between real columns and probe`);
    assert.ok((cascadeSrc.match(new RegExp(`<${shared}`, 'g')) ?? []).length >= 2, `${shared} must be used by both real columns and probe`);
  }
});
