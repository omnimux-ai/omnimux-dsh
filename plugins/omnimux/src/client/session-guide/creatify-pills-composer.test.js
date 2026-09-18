import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const output = await build({
  entryPoints: [new URL('./CreatifyPillsBar.jsx', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
});
const module = { exports: {} };
new Function('require', 'module', 'exports', output.outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports
);
const { CreatifyPillsBar } = module.exports;

test('CreatifyPillsBar: 中文环境下渲染 4 个中文大胶囊按键', async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;

  const container = document.getElementById('root');
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(CreatifyPillsBar, { locale: 'zh' }));
  });

  const buttons = document.querySelectorAll('.omnimux-pill-btn');
  assert.equal(buttons.length, 4, '必须严格且仅渲染 4 个核心大胶囊按钮');
  assert.match(buttons[0].textContent, /技能/);
  assert.match(buttons[1].textContent, /视频广告/);
  assert.match(buttons[2].textContent, /图片广告/);
  assert.match(buttons[3].textContent, /竞争对手研究/);

  root.unmount();
});

test('CreatifyPillsBar: 英文环境下渲染 4 个英文大胶囊按键', async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;

  const container = document.getElementById('root');
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(CreatifyPillsBar, { locale: 'en' }));
  });

  const buttons = document.querySelectorAll('.omnimux-pill-btn');
  assert.equal(buttons.length, 4);
  assert.match(buttons[0].textContent, /Skills/);
  assert.match(buttons[1].textContent, /Video ads/);
  assert.match(buttons[2].textContent, /Image ads/);
  assert.match(buttons[3].textContent, /Competitor research/);

  root.unmount();
});

test('CreatifyPillsBar: 点击 Video ads 展开专属 7 项子菜单，点击子项触发提示词注入', async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;

  const container = document.getElementById('root');
  const root = createRoot(container);
  let injected = '';

  await act(async () => {
    root.render(React.createElement(CreatifyPillsBar, {
      locale: 'zh',
      onApplyPrompt: (prompt) => { injected = prompt; }
    }));
  });

  const videoBtn = document.querySelectorAll('.omnimux-pill-btn')[1];
  await act(async () => {
    videoBtn.click();
  });

  const options = document.querySelectorAll('.omnimux-subprompt-popover > div');
  assert.equal(options.length, 7, 'Video ads 必须呈现专属 7 项子菜单');

  await act(async () => {
    options[0].click();
  });

  assert.ok(injected.length > 0, '点击后必须成功回调并注入提示词');
  assert.match(injected, /Create a video ad with an AI avatar for/);

  root.unmount();
});

test('CreatifyPillsBar: 点击 Skills 展开的技能列表数据来自技能市场真实数据（65+ 项）', async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;

  const container = document.getElementById('root');
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(CreatifyPillsBar, { locale: 'zh' }));
  });

  const skillsBtn = document.querySelectorAll('.omnimux-pill-btn')[0];
  await act(async () => {
    skillsBtn.click();
  });

  const skillsPopover = document.querySelector('.omnimux-skills-popover');
  assert.ok(skillsPopover, '技能面板必须展开');
  assert.ok(!skillsPopover.querySelector('button[aria-label*="关闭"], button[aria-label*="Close"]'), '严禁包含关闭按钮');

  // 验证技能数据来自技能市场（大于 60 项）
  const skillItems = skillsPopover.querySelectorAll('.skills-list-box > div, div[style*="cursor: pointer"]');
  assert.ok(skillItems.length >= 60, `技能列表数据必须来自技能市场（当前实测项数: ${skillItems.length}）`);

  root.unmount();
});
