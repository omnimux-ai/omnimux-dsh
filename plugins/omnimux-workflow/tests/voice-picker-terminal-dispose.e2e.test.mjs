/**
 * Issue #3058 OCR closure F3：VoicePickerDialog 请求终态释放全部 attempt element。
 *
 * CLI 根因：ended、最后候选失败、NotAllowedError 三条终态此前只清理当前
 * element 与状态；早先失败的 attempt element 及其 handlers/src 仍留在
 * elementsRef，已结束 element 也滞留到之后 stop/close/unmount。
 * 契约：
 *   - ended 终态：该请求全部 attempt element pause + currentTime=0 +
 *     onended/onerror 摘除 + src 清空；elementsRef 集合释放；
 *   - 穷尽失败与当前 attempt 的 NotAllowedError 同样全量释放；
 *   - 请求令牌守卫不变：旧请求迟到回调不影响新试听（不新 Toast、不暂停新
 *     element）；终态释放后旧 element 迟到的 error 不再触发任何回调。
 *
 * 真实组件经 esbuild 打包（lucide-react 与 ui/index.ts 替换为桩，
 * toast.info 计数），react / react-dom 由 Node 侧同一实例注入，DOM 由
 * JSDOM 提供。每条断言都是强断言；不验证真实媒体可播。
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

/** 受控 Audio 桩：onerror/onended 属性回调 + 类级 deferred play()。 */
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
      if (FakeAudio.playOutcome === 'not-allowed') {
        return Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
      }
      return Promise.resolve();
    }
    pause() { this.paused = true; }
    load() {}
  }
  FakeAudio.instances = instances;
  FakeAudio.deferAll = false;
  FakeAudio.playOutcome = 'resolve';
  instances.FakeAudio = FakeAudio;
  globalThis.Audio = FakeAudio;
  globalThis.window.Audio = FakeAudio;
  return instances;
}

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

/** 终态释放断言：element 全部 pause/归零/摘监听/清 src。 */
function assertReleased(element, label) {
  assert.equal(element.paused, true, `${label}：element 已暂停`);
  assert.equal(element.currentTime, 0, `${label}：element 已归零`);
  assert.equal(element.onended, null, `${label}：onended 已摘除`);
  assert.equal(element.onerror, null, `${label}：onerror 已摘除`);
  assert.equal(element.src, '', `${label}：src 已清空`);
}

test('VoicePickerDialog：终态释放全部 attempt element，令牌守卫不受影响（F3）', async () => {
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

  // ── 终态 1：primary error → alt 播放 → alt ended（自然结束）。
  // 请求终态须释放该请求全部 attempt element（含已失败的 primary）。
  instances.FakeAudio.deferAll = true;
  await act(async () => {
    buttons()[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  const elA = instances[0];
  await act(async () => { elA.dispatch('error') });
  const elB = instances[1];
  assert.equal(elB.src, 'https://cdn.example.com/alt.mp3');
  await act(async () => { elB.dispatch('ended') });
  await flush();
  assertReleased(elA, 'ended 终态·已失败 primary attempt');
  assertReleased(elB, 'ended 终态·播放完成的 alt attempt');
  assert.ok(!container.querySelector('.wf-voice-picker__preview--playing'), 'ended 后回非播放态');
  assert.deepEqual(toastCalls, [], 'ended 终态不 Toast');

  // 终态释放后旧 element 迟到的 error：handlers 已摘除，无任何回调副作用。
  await act(async () => { elA.dispatch('error') });
  await flush();
  assert.deepEqual(toastCalls, [], '已释放 element 的迟到 error 不触发任何处理');
  assert.equal(instances.length, 2, '已释放 element 的迟到 error 不新建 attempt');

  // ── 终态 2：穷尽失败 → 同样全量释放 + 一次核定 Toast。
  await act(async () => {
    buttons()[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  const elC = instances[instances.length - 1];
  await act(async () => { elC.dispatch('error') });
  const elD = instances[instances.length - 1];
  await act(async () => { elD.dispatch('error') });
  await flush();
  assertReleased(elC, '穷尽失败·primary attempt');
  assertReleased(elD, '穷尽失败·alt attempt');
  assert.deepEqual(toastCalls, ['试听暂不可用，请稍后重试。'], '穷尽仍一次核定文案');

  // ── 终态 3：当前 attempt 的 NotAllowedError → 全量释放。
  await act(async () => {
    buttons()[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  const elE = instances[instances.length - 1];
  await act(async () => { elE.dispatch('error') });
  const elF = instances[instances.length - 1];
  await act(async () => {
    elF.playDeferreds[0].reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    await Promise.resolve();
  });
  await flush();
  assertReleased(elE, 'NotAllowedError·已失败 primary attempt');
  assertReleased(elF, 'NotAllowedError·被拒 alt attempt');
  assert.deepEqual(toastCalls.slice(1), ['试听暂不可用，请稍后重试。'], '权限拒绝仍一次核定文案');

  // ── 令牌守卫：新试听中旧请求 element 迟到的 error/ended 不影响新播放。
  await act(async () => {
    buttons()[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  const elG = instances[instances.length - 1];
  assert.equal(elG.src, 'https://cdn.example.com/primary.mp3');
  await act(async () => { elF.dispatch('error') });
  await act(async () => { elD.dispatch('ended') });
  await flush();
  assert.equal(elG.paused, false, '旧请求 element 迟到事件不得暂停新试听');
  assert.ok(container.querySelector('.wf-voice-picker__preview--playing'), '新试听不受影响');
  assert.equal(toastCalls.length, 2, '旧请求迟到事件不新增 Toast');

  await act(async () => { root.unmount() });
});
