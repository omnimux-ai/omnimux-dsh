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

test('e2e: model cascade menu columns strictly lock 480px height to prevent hover fluttering', () => {
  // 1. 验证品牌列、型号列与渠道策略列高度统一锁定为 480px
  assert.match(cssSrc, /\.wf-loomi-col--brand\s*\{[^}]*height:\s*480px;/s, 'Brand column must have height: 480px');
  assert.match(cssSrc, /\.wf-loomi-col--model\s*\{[^}]*height:\s*480px;/s, 'Model column must have height: 480px');
  assert.match(cssSrc, /\.wf-loomi-col--channel\s*\{[^}]*height:\s*480px;/s, 'Channel column must have height: 480px');

  // 2. 验证浮层已移除 max-height 导致的动态高度差
  assert.doesNotMatch(cssSrc, /\.wf-loomi-col--channel\s*\{[^}]*max-height:\s*520px;/s, 'Channel column must not use variable max-height');

  // 3. 验证 ModelCascadeMenu 声明 POPOVER_HEIGHT 并在 place() 执行纵向绝对位置防溢出保护
  assert.match(cascadeSrc, /POPOVER_HEIGHT\s*=\s*480/, 'ModelCascadeMenu must define POPOVER_HEIGHT constant');
  assert.match(cascadeSrc, /POPOVER_HEIGHT\s*-\s*12/, 'ModelCascadeMenu place() must guard top overflow with POPOVER_HEIGHT');

  // 4. 验证结构完备性与无障碍属性
  assert.match(cascadeSrc, /aria-label="选择品牌"/, 'Brand column accessibility intact');
  assert.match(cascadeSrc, /aria-label="选择模型版本"/, 'Model column accessibility intact');
  assert.match(cascadeSrc, /aria-label="选择渠道策略"/, 'Channel column accessibility intact');
});
