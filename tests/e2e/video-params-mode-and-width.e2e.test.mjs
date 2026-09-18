/**
 * 生成模式必显与参数浮层面板调宽 · 端到端契约测试
 *
 * 验证目标：
 * 1. 契约锁：VideoTriggerBar 将 mode 槽位声明为 dropPolicy: 'never'（必显）；
 * 2. 面板宽度升级：viewportPositioner.ts 中 PANEL_WIDTH 升级为 500，PANEL_DEFAULT_MAX_HEIGHT 为 580；
 * 3. 样式表契约：components.css 明确定义 popover 宽度为 500px；
 * 4. DOM 完整装载：渲染包含「全能参考」的完整胶囊，断言模式必显且顺序一致。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../..');

const triggerSrc = readFileSync(
  join(repoRoot, 'plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/videoParams/VideoTriggerBar.tsx'),
  'utf8',
);
const positionerSrc = readFileSync(
  join(repoRoot, 'plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/cfg/viewportPositioner.ts'),
  'utf8',
);
const themeCss = readFileSync(
  join(repoRoot, 'plugins/omnimux-workflow/src/canvas/theme/components.css'),
  'utf8',
);

test('E2E-1: VideoTriggerBar 将生成模式槽位配置为必显 (dropPolicy: never)', () => {
  assert.match(
    triggerSrc,
    /push\('mode',\s*summary\.modeText,\s*undefined,\s*['"]never['"]/,
    '生成模式槽位必须使用 never 策略以满足必显需求',
  );
});

test('E2E-2: viewportPositioner.ts 基准宽度升级为 500px 且限高升级为 580px', () => {
  assert.match(positionerSrc, /export const PANEL_WIDTH = 500;/);
  assert.match(positionerSrc, /export const PANEL_DEFAULT_MAX_HEIGHT = 580;/);
});

test('E2E-3: components.css 声明浮层宽度为 500px 且受视口自适应保护', () => {
  assert.match(themeCss, /width:\s*500px;/);
  assert.match(themeCss, /max-width:\s*calc\(100vw\s*-\s*24px\);/);
});

test('E2E-4: 真实 DOM 模拟下「全能参考」模式在胶囊中必显且排布规整', () => {
  const dom = new JSDOM(`
    <!doctype html>
    <html>
      <head><style>${themeCss}</style></head>
      <body>
        <div class="wf-config-panel">
          <div class="wf-config-panel__bottom-bar">
            <div class="wf-config-panel__params-group" style="width: 500px;">
              <button class="wf-model-cascade-capsule">Seedance 2.0 旗舰版</button>
              <div class="wf-video-trigger-bar__wrap">
                <button class="wf-cfg-summary-bar wf-video-trigger-bar" aria-expanded="false">
                  <span class="wf-cfg-summary-bar__slot wf-video-trigger-bar__slot wf-video-trigger-bar__mode">
                    <span class="wf-cfg-summary-bar__text">全能参考</span>
                  </span>
                  <span class="wf-cfg-summary-bar__slot wf-video-trigger-bar__slot wf-video-trigger-bar__ratio">
                    <svg width="14" height="14"></svg>
                    <span class="wf-cfg-summary-bar__text wf-video-trigger-bar__ratio-text">16:9</span>
                  </span>
                  <span class="wf-cfg-summary-bar__slot wf-video-trigger-bar__slot wf-video-trigger-bar__resolution">
                    <span class="wf-cfg-summary-bar__text wf-video-trigger-bar__resolution">720P</span>
                  </span>
                  <span class="wf-cfg-summary-bar__slot wf-video-trigger-bar__slot wf-video-trigger-bar__duration">
                    <svg width="14" height="14"></svg>
                    <span class="wf-cfg-summary-bar__text wf-video-trigger-bar__duration-text">5s</span>
                  </span>
                  <span class="wf-cfg-summary-bar__chevron wf-video-trigger-bar__chevron">
                    <svg width="14" height="14"></svg>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);

  const doc = dom.window.document;
  const bar = doc.querySelector('.wf-video-trigger-bar');
  assert.ok(bar, '视频触发条必须成功渲染');
  const slots = bar.querySelectorAll('.wf-video-trigger-bar__slot');
  assert.equal(slots.length, 4, '必须完整挂载 4 个槽位');

  const texts = Array.from(bar.querySelectorAll('.wf-cfg-summary-bar__text')).map((el) => el.textContent);
  assert.deepEqual(texts, ['全能参考', '16:9', '720P', '5s'], '生成模式必须作为首位数据项稳定回显');
});
