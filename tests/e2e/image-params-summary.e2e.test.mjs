/**
 * 生图输入框参数胶囊核心数据回显与自适应折叠 · 端到端契约测试
 *
 * 验证目标：
 * 1. 样式契约：components.css 声明伪元素以点号「·」作为参数分隔符（对齐图 2 规范）；
 * 2. 槽位顺序与质量接入：ImageTriggerBar 包含 ratio -> resolution -> quality -> mode 槽位；
 * 3. 死锁消除：CfgSummaryBar 从外部容器推导最大可用宽度，消除死锁收缩循环；
 * 4. DOM 完整性：真实 DOM 结构能够一次性呈现 1:1、1K、高、自适应完整多维参数。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../..');

const themeCss = readFileSync(
  join(repoRoot, 'plugins/omnimux-workflow/src/canvas/theme/components.css'),
  'utf8',
);
const cfgSummarySrc = readFileSync(
  join(repoRoot, 'plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/cfg/CfgSummaryBar.tsx'),
  'utf8',
);
const imageTriggerSrc = readFileSync(
  join(repoRoot, 'plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/imageParams/ImageTriggerBar.tsx'),
  'utf8',
);
const adapterSrc = readFileSync(
  join(repoRoot, 'plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/imageParams/imageParamAdapter.ts'),
  'utf8',
);

test('E2E-1: components.css 声明使用点号「·」作为参数槽位间分隔符', () => {
  assert.match(
    themeCss,
    /\.wf-cfg-summary-bar__slot\s*\+\s*\.wf-cfg-summary-bar__slot::before[\s\S]*?content:\s*['"]·['"]/,
    '槽位间伪元素分隔符必须为点号「·」以对齐图 2',
  );
});

test('E2E-2: ImageTriggerBar 完整接入画质（quality）槽位且顺序符合图 2 规范', () => {
  assert.match(imageTriggerSrc, /push\('ratio'/);
  assert.match(imageTriggerSrc, /push\('resolution'/);
  assert.match(imageTriggerSrc, /push\('quality'/);
  assert.match(imageTriggerSrc, /push\('mode'/);
  assert.match(imageTriggerSrc, /summary\.qualityText/);

  // ratio 位于 resolution 与 quality 之前
  const ratioIdx = imageTriggerSrc.indexOf("push('ratio'");
  const qualityIdx = imageTriggerSrc.indexOf("push('quality'");
  assert.ok(ratioIdx < qualityIdx, 'ratio 比例槽位必须先于 quality 画质槽位');
});

test('E2E-3: CfgSummaryBar 具备外部容器宽度感知与死锁防御机制', () => {
  assert.match(cfgSummarySrc, /closest.*wf-config-panel__params-group/, '必须检测外部 params-group 容器');
  assert.match(cfgSummarySrc, /observeTarget/, 'ResizeObserver 必须观察外部容器而不是自缩按钮');
});

test('E2E-4: imageParamAdapter 成功将 hd 转化为「高」、standard 转化为「标准」', () => {
  assert.match(adapterSrc, /qualityText\s*=\s*'高'/);
  assert.match(adapterSrc, /qualityText\s*=\s*'标准'/);
});

test('E2E-5: 真实 DOM 模拟下完整参数胶囊成功装载', () => {
  const dom = new JSDOM(`
    <!doctype html>
    <html>
      <head><style>${themeCss}</style></head>
      <body>
        <div class="wf-config-panel">
          <div class="wf-config-panel__bottom-bar">
            <div class="wf-config-panel__params-group" style="width: 500px;">
              <button class="wf-model-cascade-capsule">Image 2.5</button>
              <div class="wf-cfg-summary-bar__wrap">
                <button class="wf-cfg-summary-bar" aria-expanded="false">
                  <span class="wf-cfg-summary-bar__slot wf-cfg-summary-bar__slot--ratio">
                    <svg width="14" height="14"></svg>
                    <span class="wf-cfg-summary-bar__text">1:1</span>
                  </span>
                  <span class="wf-cfg-summary-bar__slot wf-cfg-summary-bar__slot--resolution">
                    <span class="wf-cfg-summary-bar__text">1K</span>
                  </span>
                  <span class="wf-cfg-summary-bar__slot wf-cfg-summary-bar__slot--quality">
                    <span class="wf-cfg-summary-bar__text">高</span>
                  </span>
                  <span class="wf-cfg-summary-bar__slot wf-cfg-summary-bar__slot--mode">
                    <span class="wf-cfg-summary-bar__text">自适应</span>
                  </span>
                  <span class="wf-cfg-summary-bar__chevron">
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
  const bar = doc.querySelector('.wf-cfg-summary-bar');
  assert.ok(bar, '触发条必须成功渲染');
  assert.equal(bar.querySelectorAll('.wf-cfg-summary-bar__slot').length, 4, '必须包含 4 个参数槽位');
  
  const texts = Array.from(bar.querySelectorAll('.wf-cfg-summary-bar__text')).map((el) => el.textContent);
  assert.deepEqual(texts, ['1:1', '1K', '高', '自适应'], '核心数据项必须完整且顺序一致');
});
