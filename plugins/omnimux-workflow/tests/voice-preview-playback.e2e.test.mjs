/**
 * Issue #3058 OCR 整改 #1/#3：VoicePickerDialog 候选回退的 deferred-promise 竞态。
 *
 * 复现链路（修复前 bug）：candidate 0 的 mediaerror 先推进到 candidate 1，而
 * candidate 0 的 play() promise 稍后才拒绝——旧实现里 catch 读共享可变的
 * candidateIndex（已是 1），把刚推进的 candidate 1 误结算为失败并提前弹出
 * 「试听暂不可用」Toast，跳过了一个本可能成功的回退候选。
 *
 * 源码字符串断言（既有 voicePickerDialog.test.mjs / voicePreviewContract.test.mjs）
 * 无法覆盖这个时序——只有受控 Audio 的 deferred play() 能真实复现。
 * 本测试用 esbuild 打包真实 VoicePickerDialog.tsx（lucide-react 与 ui/index.ts
 * 替换为桩：CustomModal 直接渲染 children/footer，toast.info 计数），
 * react / react-dom 由 Node 侧同一实例注入，DOM 由 JSDOM 提供。
 * 每条断言都是强断言 assert.equal / deepEqual；不验证真实媒体可播。
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRequire = createRequire(join(here, '..', 'package.json'));
const { JSDOM } = pluginRequire('jsdom');
const DIALOG_PATH = join(
  here, '..', 'src', 'canvas', 'editor', 'components', 'MaterialNode',
  'ConfigPanel', 'audioParams', 'VoicePickerDialog.tsx',
);

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://127.0.0.1/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true });
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Node = window.Node;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return window;
}

/** 受控 Audio 桩：onerror/onended 属性回调 + deferred play()。 */
function installAudioStub() {
  const instances = [];
  class FakeAudio {
    constructor(src) {
      this.src = src ?? '';
      this.paused = true;
      this.currentTime = 0;
      this.playCalls = [];
      this.playDeferreds = [];
      this.deferPlays = FakeAudio.deferAll === true;
      instances.push(this);
    }
    dispatch(type) {
      const handler = this[`on${type}`];
      if (typeof handler === 'function') handler.call(this, { type, target: this });
    }
    play() {
      this.paused = false;
      this.playCalls.push(this.src);
      if (this.deferPlays) {
        return new Promise((resolve, reject) => {
          this.playDeferreds.push({ src: this.src, resolve, reject });
        });
      }
      return Promise.resolve();
    }
    pause() { this.paused = true; }
    load() {}
  }
  FakeAudio.instances = instances;
  FakeAudio.deferAll = false;
  instances.FakeAudio = FakeAudio;
  globalThis.Audio = FakeAudio;
  globalThis.window.Audio = FakeAudio;
  return instances;
}

/** toast.info 计数桩：核定失败文案只应出现一次。 */
function installToast() {
  const calls = [];
  globalThis.__voiceToast = {
    calls,
    info: (msg) => calls.push(msg),
    success: () => {},
    warning: () => {},
    error: () => {},
  };
  return calls;
}

/** 打包 VoicePickerDialog.tsx：lucide-react 与 ui/index.ts 替换为桩。 */
async function loadDialog() {
  const esbuild = pluginRequire('esbuild');
  const stubPlugin = {
    name: 'test-stubs',
    setup(b) {
      b.onResolve({ filter: /lucide-react/ }, (a) => ({ path: a.path, namespace: 'stub-icons' }));
      b.onResolve({ filter: /ui\/index(\.ts)?$/ }, (a) => ({ path: a.path, namespace: 'stub-ui' }));
      b.onLoad({ filter: /./, namespace: 'stub-icons' }, () => ({
        contents:
          "const React = require('react');" +
          "const icon = () => null;" +
          'module.exports = { AudioLines: icon, Check: icon, Pause: icon, Play: icon, Search: icon };',
        loader: 'js',
      }));
      b.onLoad({ filter: /./, namespace: 'stub-ui' }, () => ({
        contents:
          "const React = require('react');" +
          'module.exports = {' +
          '  CustomModal: (p) => React.createElement(React.Fragment, null, p.children, p.footer),' +
          '  CustomSelect: () => null,' +
          '  toast: globalThis.__voiceToast,' +
          '};',
        loader: 'js',
      }));
    },
  };
  const result = await esbuild.build({
    entryPoints: [DIALOG_PATH],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
    plugins: [stubPlugin],
  });
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(pluginRequire, mod, mod.exports);
  return mod.exports.VoicePickerDialog;
}

/** 构造带 meta.preview 的音色选项（对齐 VoiceCatalogOption / snake_case 契约）。 */
const voiceOf = (voiceType, preview) => ({
  value: voiceType,
  label: voiceType,
  meta: {
    voice_type: voiceType,
    name: voiceType,
    display_name: voiceType,
    category: '通用场景',
    language: '中文',
    accent: '普通话',
    gender: 'male',
    tags: [],
    resource_id: 'seed-tts-2.0',
    is_hot: false,
    hot_order: 0,
    preview,
  },
});

const VERIFIED_PREVIEW = {
  purpose: 'official-voice-preview',
  state: 'verified-file',
  primary_url: 'https://cdn.example.com/primary.mp3',
  candidates: ['https://cdn.example.com/primary.mp3', 'https://cdn.example.com/alt.mp3'],
  checked_at: '2026-10-03T00:00:00.000Z',
  evidence_ref: 'audit',
};

test('VoicePickerDialog：旧候选 play() 迟到 rejection 只结算它自己，不误伤新候选（OCR #1/#3）', async () => {
  const window = installDom();
  const instances = installAudioStub();
  const toastCalls = installToast();
  const React = pluginRequire('react');
  const { createRoot } = pluginRequire('react-dom/client');
  const VoicePickerDialog = await loadDialog();
  const { act } = React;

  const container = window.document.getElementById('root');
  const root = createRoot(container);
  const option = voiceOf('zh_male_linxiao', VERIFIED_PREVIEW);
  await act(async () => {
    root.render(React.createElement(VoicePickerDialog, {
      open: true,
      options: [option],
      onSelect: () => {},
      onClose: () => {},
    }));
  });
  const flush = async () => { await act(async () => { await Promise.resolve() }) };

  const previewBtn = container.querySelector('.wf-voice-picker__preview');
  assert.ok(previewBtn, 'verified 行渲染播放键');

  // 首次 play() 在点击内同步发起——deferred 模式必须在点击前就位。
  instances.FakeAudio.deferAll = true;
  await act(async () => {
    previewBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  assert.equal(instances.length, 1);
  const audio = instances[0];
  assert.equal(audio.src, 'https://cdn.example.com/primary.mp3');
  assert.equal(audio.playDeferreds.length, 1, 'candidate 0 的 play() 挂起待结算');
  assert.ok(container.querySelector('.wf-voice-picker__preview--playing'), '试听中样式存在');

  // candidate 0 的 error 先到达 → 推进 candidate 1：新 attempt 使用独立原生
  // Audio element（每个 attempt 一个，不再同一 element 换 src）。
  await act(async () => { audio.dispatch('error') });
  assert.equal(instances.length, 2, '回退候选使用独立 Audio element');
  const fallback = instances[1];
  assert.notEqual(fallback, audio, '每个 attempt 独立 Audio element');
  assert.equal(fallback.src, 'https://cdn.example.com/alt.mp3');
  assert.equal(fallback.playDeferreds.length, 1);

  // 修复前 bug：candidate 0 的 play() 迟到 rejection 读 candidateIndex(=1)，
  // 把 candidate 1 误结算失败并直接 Toast「全部不可用」。
  await act(async () => {
    audio.playDeferreds[0].reject(new Error('late primary failure'));
    await Promise.resolve();
  });
  assert.equal(fallback.src, 'https://cdn.example.com/alt.mp3',
    '旧候选的迟到 rejection 不得把 candidate 1 当成失败跳过');
  assert.deepEqual(toastCalls, [], '未到穷尽不得 Toast');
  assert.ok(container.querySelector('.wf-voice-picker__preview--playing'),
    'candidate 1 仍是当前候选，试听不被提前终结');

  // candidate 1 自己真正失败（error 到达）→ 穷尽，一次核定文案 Toast。
  await act(async () => { fallback.dispatch('error') });
  assert.deepEqual(toastCalls, ['试听暂不可用，请稍后重试。'], '穷尽后只提示一次核定文案');
  assert.ok(!container.querySelector('.wf-voice-picker__preview--playing'), '失败后回到非播放态');

  // candidate 1 的 play() rejection 迟到：同候选已结算，不得第二次 Toast。
  await act(async () => {
    fallback.playDeferreds[0].reject(new Error('alt failed too'));
    await Promise.resolve();
  });
  assert.deepEqual(toastCalls, ['试听暂不可用，请稍后重试。'], '同候选不双结算、不重复提示');

  await act(async () => { root.unmount() });
});

test('VoicePickerDialog：反向失败顺序每候选一次结算 + 旧 attempt 迟到 NotAllowedError 短路（Sol 规格轴 HIGH #1/#2）', async () => {
  const window = installDom();
  const instances = installAudioStub();
  const toastCalls = installToast();
  const React = pluginRequire('react');
  const { createRoot } = pluginRequire('react-dom/client');
  const VoicePickerDialog = await loadDialog();
  const { act } = React;

  const container = window.document.getElementById('root');
  const root = createRoot(container);
  const optionA = voiceOf('zh_male_linxiao', VERIFIED_PREVIEW);
  const optionB = voiceOf('zh_female_xin', VERIFIED_PREVIEW);
  await act(async () => {
    root.render(React.createElement(VoicePickerDialog, {
      open: true,
      options: [optionA, optionB],
      onSelect: () => {},
      onClose: () => {},
    }));
  });
  const flush = async () => { await act(async () => { await Promise.resolve() }) };
  const buttons = () => container.querySelectorAll('.wf-voice-picker__preview');

  // ── 场景 A：deferred rejection 先到 → 回退开始 → 旧候选 error 不得跳过新候选
  // （error 无 URL 身份：每 attempt 独立 element，旧 error 由 attempt 令牌短路）。
  instances.FakeAudio.deferAll = true;
  await act(async () => {
    buttons()[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  const elA = instances[0];
  assert.equal(elA.src, 'https://cdn.example.com/primary.mp3');
  await act(async () => {
    elA.playDeferreds[0].reject(new Error('primary rejected first'));
    await Promise.resolve();
  });
  assert.equal(instances.length, 2, 'rejection 先行推进回退（新 element）');
  const elB = instances[1];
  assert.equal(elB.src, 'https://cdn.example.com/alt.mp3');
  await act(async () => { elA.dispatch('error') });
  await flush();
  assert.equal(instances.length, 2, '旧 attempt 的迟到 error 不得推进/终结新候选');
  assert.equal(elB.paused, false, '新候选播放不被旧 error 干扰');
  assert.ok(container.querySelector('.wf-voice-picker__preview--playing'),
    '试听状态不被旧 error 清空');
  assert.deepEqual(toastCalls, [], '未到穷尽不得 Toast');

  // ── 场景 B：error 先推进回退 → 旧 attempt 迟到 NotAllowedError 必须先经
  // !currentAttempt/settled 短路：不得清新状态、不得暂停新 element、不 Toast。
  // 点另一音色行发起新试听（同一行再点是停止语义）。
  await act(async () => {
    buttons()[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  assert.equal(elA.paused, true, '新试听启动时清理旧请求全部 attempt element');
  assert.equal(elB.paused, true);
  const elC = instances[instances.length - 1];
  await act(async () => { elC.dispatch('error') });
  const elD = instances[instances.length - 1];
  assert.notEqual(elD, elC, '回退候选使用独立 element');
  assert.equal(elD.src, 'https://cdn.example.com/alt.mp3');
  await act(async () => {
    elC.playDeferreds[0].reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    await Promise.resolve();
  });
  await flush();
  assert.equal(elD.paused, false,
    '旧 attempt 迟到 NotAllowedError 不得暂停新 element');
  assert.ok(container.querySelector('.wf-voice-picker__preview--playing'),
    '旧 attempt 迟到 NotAllowedError 不得清空新试听状态');
  assert.deepEqual(toastCalls, [], '旧 attempt 迟到拒绝不出失败文案');

  // ── 场景 C：当前 attempt 的 NotAllowedError（候选 0 直接被拒）→
  // pause/归零清理 + 回空闲 + 一次 Toast，不留仍在播放的孤儿 element。
  // 点第一音色行发起新试听（场景 B 的试听仍在播放中，新试听先切停它）。
  await act(async () => {
    buttons()[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  assert.equal(elD.paused, true, '新试听启动切停上一试听（含全部 attempt element）');
  const elF = instances[instances.length - 1];
  assert.equal(elF.src, 'https://cdn.example.com/primary.mp3');
  await act(async () => {
    elF.playDeferreds[0].reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    await Promise.resolve();
  });
  await flush();
  assert.equal(elF.paused, true,
    '当前权限拒绝须先 pause/归零清理再回空闲，不留孤儿 element');
  assert.deepEqual(toastCalls, ['试听暂不可用，请稍后重试。'],
    '当前权限拒绝按核定文案提示一次');
  assert.ok(!container.querySelector('.wf-voice-picker__preview--playing'), '拒绝后回非播放态');

  // ── 正向路径：新试听正常播放后 unmount 清理当前 element。
  await act(async () => {
    buttons()[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  const elG = instances[instances.length - 1];
  assert.equal(elG.paused, false, '新试听开始播放');
  await act(async () => { root.unmount() });
  assert.equal(elG.paused, true, 'unmount 清理当前 element');
});

test('VoicePickerDialog：试听按钮键盘操作只试听不误选，行本体 Enter/Space 才选音色（Sol 复核 HIGH）', async () => {
  const window = installDom();
  const instances = installAudioStub();
  installToast();
  const React = pluginRequire('react');
  const { createRoot } = pluginRequire('react-dom/client');
  const VoicePickerDialog = await loadDialog();
  const { act } = React;

  const container = window.document.getElementById('root');
  const root = createRoot(container);
  const selected = [];
  const option = voiceOf('zh_male_linxiao', VERIFIED_PREVIEW);
  await act(async () => {
    root.render(React.createElement(VoicePickerDialog, {
      open: true,
      options: [option],
      onSelect: (v) => selected.push(v),
      onClose: () => {},
    }));
  });

  const row = container.querySelector('.wf-voice-picker__row');
  const previewBtn = container.querySelector('.wf-voice-picker__preview');
  assert.ok(row && previewBtn, 'verified 行 + 试听键已渲染');

  // 键盘事件落在试听按钮上：冒泡到行的 onKeyDown 不得误触发选择，
  // 也不得 preventDefault 吞掉原生 button 激活（Enter→click / Space→keyup click）。
  const keyOnButton = (key) => {
    const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    previewBtn.dispatchEvent(event);
    return event;
  };
  const enterOnButton = keyOnButton('Enter');
  const spaceOnButton = keyOnButton(' ');
  assert.equal(enterOnButton.defaultPrevented, false,
    '按钮上的 Enter 不得被行处理器 preventDefault（否则原生 click 启动试听被吞）');
  assert.equal(spaceOnButton.defaultPrevented, false,
    '按钮上的 Space 不得被行处理器 preventDefault（否则 keyup 激活试听被吞）');
  assert.equal(selected.length, 0, '试听按钮上按键不得误选音色');

  // 原生激活路径不变：按钮 click 启动试听（JSDOM 不合成键盘 click，
  // 但真实浏览器 Enter/Space 走同一条原生 click 入口，此处验证该入口）。
  await act(async () => {
    previewBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  assert.equal(instances.length, 1, '试听按钮原生 click 启动试听');
  assert.equal(instances[0].src, 'https://cdn.example.com/primary.mp3');
  assert.equal(selected.length, 0, '试听仍不改变选中音色');

  // 行本体（currentTarget）的 Enter/Space 才是选择语义：正常触发 onSelect。
  const enterOnRow = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  await act(async () => { row.dispatchEvent(enterOnRow); });
  assert.equal(enterOnRow.defaultPrevented, true, '行本体 Enter 仍可 preventDefault 并选择');
  assert.deepEqual(selected, ['zh_male_linxiao'], '行本体 Enter 触发选择');
  const spaceOnRow = new window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
  await act(async () => { row.dispatchEvent(spaceOnRow); });
  assert.deepEqual(selected, ['zh_male_linxiao', 'zh_male_linxiao'], '行本体 Space 同样触发选择');

  await act(async () => { root.unmount() });
});

test('VoicePickerDialog：unverified 行不渲染播放键且不构造 Audio（OCR seam 对称）', async () => {
  const window = installDom();
  const instances = installAudioStub();
  installToast();
  const React = pluginRequire('react');
  const { createRoot } = pluginRequire('react-dom/client');
  const VoicePickerDialog = await loadDialog();
  const { act } = React;

  const container = window.document.getElementById('root');
  const root = createRoot(container);
  const verified = voiceOf('zh_male_verified', VERIFIED_PREVIEW);
  const unverified = voiceOf('zh_female_pending', {
    ...VERIFIED_PREVIEW,
    state: 'unverified',
    primary_url: null,
    candidates: ['https://cdn.example.com/guess.mp3'],
  });
  await act(async () => {
    root.render(React.createElement(VoicePickerDialog, {
      open: true,
      options: [verified, unverified],
      onSelect: () => {},
      onClose: () => {},
    }));
  });

  const buttons = container.querySelectorAll('.wf-voice-picker__preview');
  assert.equal(buttons.length, 1, '仅 verified 行渲染播放键，未验证行无死键');
  assert.equal(instances.length, 0, '未验证行不产生任何 Audio 构造/探测');

  // 行选择不受试听门控影响：点击未验证行仍回调 onSelect。
  let selected = '';
  await act(async () => {
    root.render(React.createElement(VoicePickerDialog, {
      open: true,
      options: [verified, unverified],
      onSelect: (v) => { selected = v; },
      onClose: () => {},
    }));
  });
  const rows = container.querySelectorAll('.wf-voice-picker__row');
  assert.equal(rows.length, 2);
  await act(async () => {
    rows[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  assert.equal(selected, 'zh_female_pending', '未验证音色行保持可选');
  assert.equal(instances.length, 0, '行选择不触发试听构造');

  await act(async () => { root.unmount() });
});
