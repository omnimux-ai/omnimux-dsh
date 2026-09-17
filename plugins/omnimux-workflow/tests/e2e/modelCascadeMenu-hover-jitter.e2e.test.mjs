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
  assert.match(cascadeSrc, /POPOVER_MAX_HEIGHT\s*-\s*12/, 'ModelCascadeMenu place() must guard top overflow with POPOVER_MAX_HEIGHT');

  // 4. 验证结构完备性与无障碍属性
  assert.match(cascadeSrc, /aria-label="选择品牌"/, 'Brand column accessibility intact');
  assert.match(cascadeSrc, /aria-label="选择模型版本"/, 'Model column accessibility intact');
  assert.match(cascadeSrc, /aria-label="选择渠道策略"/, 'Channel column accessibility intact');
});
