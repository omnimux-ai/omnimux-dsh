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
    assert.match(bar.style.margin, /6px auto 16px/, '默认态胶囊条外边距必须向上收敛为 6px auto 16px');

    const pills = document.querySelectorAll('.omnimux-pill-btn');
    assert.equal(pills.length, 4, '必须渲染 4 个胶囊');

    // 1. 点击 Video ads
    await act(async () => { pills[1].click(); });
    assert.match(bar.style.margin, /4px auto 16px/, '激活态胶囊条外边距必须进一步收敛为 4px auto 16px 紧贴输入框');
    const videoPopover = document.querySelector('.omnimux-subprompt-popover');
    assert.ok(videoPopover, 'Video ads 弹窗必须展开');
    assert.ok(!videoPopover.querySelector('button[aria-label*="关闭"], button[aria-label*="Close"]'), '视频弹窗严禁包含关闭按钮');
    assert.equal(videoPopover.style.width, '100%', '弹窗必须撑满宽度基准');
    assert.equal(videoPopover.style.left, '0px', '弹窗左边缘必须贴齐基准');
    assert.equal(videoPopover.style.right, '0px', '弹窗右边缘必须贴齐基准');
    assert.match(videoPopover.style.background, /dsw-alias-bg-elevated/, '弹窗必须采用设计系统标准提升背景色');
    assert.ok(!videoPopover.style.backdropFilter, '弹窗禁止使用毛玻璃透底滤镜');
    
    // 点击第一项子提示词（验证中文环境下注入中文提示词）
    const firstOption = videoPopover.querySelector('div');
    await act(async () => { firstOption.click(); });
    assert.ok(capturedPrompt.length > 0, '提示词注入成功');
    assert.match(capturedPrompt, /使用 AI 数字人|制作视频广告/);

    // 2. 验证英文环境下点击子选项注入英文提示词
    root.unmount();
    const enContainer = document.getElementById('root');
    const enRoot = createRoot(enContainer);
    let enCapturedPrompt = '';
    await act(async () => {
      enRoot.render(React.createElement(CreatifyPillsBar, {
        locale: 'en',
        onApplyPrompt: (p) => { enCapturedPrompt = p; }
      }));
    });
    const enPills = document.querySelectorAll('.omnimux-pill-btn');
    assert.match(enPills[1].textContent, /Video ads/);
    await act(async () => { enPills[1].click(); });
    const enVideoPopover = document.querySelector('.omnimux-subprompt-popover');
    const enFirstOption = enVideoPopover.querySelector('div');
    await act(async () => { enFirstOption.click(); });
    assert.ok(enCapturedPrompt.length > 0, '英文提示词注入成功');
    assert.match(enCapturedPrompt, /Create a video ad with an AI avatar/);
    enRoot.unmount();

    // 3. 点击 Skills 按钮验证技能菜单面板两端对齐与不透明
    const finalContainer = document.getElementById('root');
    const finalRoot = createRoot(finalContainer);
    await act(async () => {
      finalRoot.render(React.createElement(CreatifyPillsBar, {
        locale: 'zh',
      }));
    });
    const finalPills = document.querySelectorAll('.omnimux-pill-btn');
    await act(async () => { finalPills[0].click(); });
    const skillsPopover = document.querySelector('.omnimux-skills-popover');
    assert.ok(skillsPopover, 'Skills 技能弹窗必须展开');
    assert.ok(!skillsPopover.querySelector('button[aria-label*="关闭"], button[aria-label*="Close"]'), '技能弹窗严禁包含关闭按钮，必须支持点击外部任意位置收起');
    assert.equal(skillsPopover.style.width, '100%', '技能弹窗宽度必须100%');
    assert.equal(skillsPopover.style.left, '0px', '技能弹窗左边必须对齐');
    assert.equal(skillsPopover.style.right, '0px', '技能弹窗右边必须对齐');
    assert.match(skillsPopover.style.background, /dsw-alias-bg-elevated/, '技能弹窗必须采用设计系统标准提升背景色');
    assert.ok(!skillsPopover.style.backdropFilter, '技能弹窗禁止使用毛玻璃透底滤镜');

    finalRoot.unmount();
  });
});
