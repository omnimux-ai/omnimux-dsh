import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const output = await build({
  entryPoints: [new URL('../../src/client/session-guide/CreatifyPillsBar.jsx', import.meta.url).pathname],
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

describe('E2E: 4大Creatify胶囊按键与输入框交互链路', () => {
  it('4大胶囊按键完整渲染且点击触发对应专属下拉弹窗', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>');
    global.window = dom.window;
    global.document = dom.window.document;

    const container = document.getElementById('root');
    const root = createRoot(container);
    let capturedPrompt = '';

    await act(async () => {
      root.render(React.createElement(CreatifyPillsBar, {
        locale: 'zh',
        onApplyPrompt: (p) => { capturedPrompt = p; }
      }));
    });

    const bar = document.querySelector('.omnimux-creatify-pills-bar');
    assert.ok(bar, '必须存在按钮组容器');
    assert.equal(bar.style.justifyContent, 'center', '按钮组必须相对输入框水平居中');
    assert.equal(bar.style.width, '100%', '按钮组容器应铺满输入框同宽基准');

    const pills = document.querySelectorAll('.omnimux-pill-btn');
    assert.equal(pills.length, 4, '必须渲染 4 个胶囊');

    // 1. 点击 Video ads
    await act(async () => { pills[1].click(); });
    const videoPopover = document.querySelector('.omnimux-subprompt-popover');
    assert.ok(videoPopover, 'Video ads 弹窗必须展开');
    
    // 点击第一项子提示词
    const firstOption = videoPopover.querySelector('div');
    await act(async () => { firstOption.click(); });
    assert.ok(capturedPrompt.length > 0, '提示词注入成功');

    root.unmount();
  });
});
