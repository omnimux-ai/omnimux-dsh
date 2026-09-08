import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Offline component evidence only: no layout, browser decoder or native runner.
const { JSDOM } = createRequire(new URL('../../../../../../omnimux/package.json', import.meta.url))('jsdom');
const bundle = await build({
  stdin: {
    contents: `export { default as Preview } from './MediaPreview.tsx'; export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client';`,
    resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'tsx',
  },
  bundle: true, write: false, format: 'iife', globalName: 'api', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
});
const local = '/omnimux-workflow/api/workspaces/ws_audio/file?rel=assets/a.wav';

async function fixture(t) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', runScripts: 'outside-only' });
  const win = dom.window;
  win.IS_REACT_ACT_ENVIRONMENT = true;
  win.MessageChannel = class {
    port1 = { onmessage: null };
    port2 = { postMessage: () => setImmediate(() => this.port1.onmessage?.()) };
  };
  const paused = new WeakMap();
  const calls = { play: 0, pause: 0, load: 0 };
  Object.defineProperty(win.HTMLMediaElement.prototype, 'paused', { configurable: true, get() { return paused.get(this) ?? true; } });
  win.HTMLMediaElement.prototype.load = function () { calls.load += 1; };
  win.HTMLMediaElement.prototype.pause = function () {
    calls.pause += 1; paused.set(this, true); this.dispatchEvent(new win.Event('pause'));
  };
  win.HTMLMediaElement.prototype.play = async function () {
    calls.play += 1; paused.set(this, false); this.dispatchEvent(new win.Event('play'));
  };
  win.fetch = async () => { throw new Error('offline waveform fixture'); };
  win.eval(bundle.outputFiles[0].text);
  const root = win.api.createRoot(win.document.getElementById('root'));
  const flush = fn => win.api.act(async () => { await fn?.(); for (let i = 0; i < 8; i += 1) await Promise.resolve(); });
  const render = props => flush(() => root.render(win.api.createElement(win.api.Preview, {
    materialType: 'audio', workspaceId: 'ws_audio', mediaUrl: local, ...props,
  })));
  t.after(async () => { await flush(() => root.unmount()); win.close(); });
  return { win, calls, flush, render, query: selector => win.document.querySelector(selector) };
}

async function metadata(f, duration = 10) {
  const media = f.query('audio');
  Object.defineProperty(media, 'duration', { configurable: true, value: duration });
  await f.flush(() => media.dispatchEvent(new f.win.Event('loadedmetadata')));
  return media;
}

test('QA transport pauses on second click and error/rejected play remain truthful', async t => {
  const f = await fixture(t);
  await f.render();
  const media = f.query('audio');
  assert.equal(f.calls.play, 0);
  await f.flush(() => f.query('.wf-audio__play').click());
  await f.flush(() => f.query('.wf-audio__play').click());
  assert.equal(f.calls.play, 1);
  assert.equal(f.calls.pause, 1);
  assert.equal(f.query('.wf-audio__play').getAttribute('aria-label'), '播放');
  media.play = async () => { throw new Error('NotAllowedError'); };
  await f.flush(() => f.query('.wf-audio__play').click());
  assert.match(f.query('[role=status]').textContent, /无法播放/);
  await f.flush(() => media.dispatchEvent(new f.win.Event('error')));
  assert.match(f.query('[role=status]').textContent, /音频加载失败/);
});

test('QA range changes seek media time and native timeupdate refreshes the display', async t => {
  const f = await fixture(t);
  await f.render();
  const media = await metadata(f);
  const range = f.query('input[type=range]');
  assert.equal(range.disabled, false);
  // Bypass React's value tracker as a real DOM input change would.
  const setter = Object.getOwnPropertyDescriptor(f.win.HTMLInputElement.prototype, 'value').set;
  await f.flush(() => { setter.call(range, '4.2'); range.dispatchEvent(new f.win.Event('input', { bubbles: true })); });
  assert.equal(media.currentTime, 4.2);
  assert.match(f.query('.wf-audio__time').textContent, /0:04/);
  await f.flush(() => { media.currentTime = 7; media.dispatchEvent(new f.win.Event('timeupdate')); });
  assert.equal(range.value, '7');
  assert.equal(range.getAttribute('aria-valuetext'), '0:07 / 0:10');
  assert.match(f.query('[role=status]').textContent, /仍可播放/);
});

test('QA pointer/double-click/keyboard events do not escape to canvas handlers', async t => {
  const f = await fixture(t);
  await f.render();
  const escaped = [];
  for (const type of ['pointerdown', 'dblclick', 'keydown']) f.win.document.addEventListener(type, () => escaped.push(type));
  const range = f.query('input[type=range]');
  for (const type of ['pointerdown', 'dblclick', 'keydown']) {
    range.dispatchEvent(new f.win.Event(type, { bubbles: true, cancelable: true }));
  }
  assert.deepEqual(escaped, []);
});

test('QA workspace replacement aborts pending native-action request and ignores late success', async t => {
  const f = await fixture(t);
  await f.render();
  let signal;
  let resolve;
  f.win.fetch = (_url, options) => { signal = options.signal; return new Promise(done => { resolve = done; }); };
  await f.flush(() => f.query('.wf-audio__files button').click());
  assert.equal(f.query('.wf-audio__files button').disabled, true);
  const oldMedia = f.query('audio');
  await f.render({ workspaceId: 'ws_other', mediaUrl: local });
  assert.equal(signal.aborted, true);
  assert.equal(oldMedia.hasAttribute('src'), false);
  assert.equal(f.calls.load, 1);
  await f.flush(() => resolve({ ok: true, json: async () => ({ ok: true }) }));
  assert.doesNotMatch(f.query('[role=status]').textContent, /已请求/);
  assert.equal(f.query('.wf-audio__files button').disabled, true);
});

test('QA waveform fetch is cancelled when source is removed', async t => {
  const f = await fixture(t);
  await f.render();
  let signal;
  f.win.fetch = (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new f.win.DOMException('Aborted', 'AbortError')), { once: true }));
  };
  await metadata(f);
  assert.equal(signal.aborted, false);
  await f.render({ isMissing: true });
  assert.equal(signal.aborted, true);
  assert.equal(f.query('audio'), null);
});

test('QA2 a failed remote save remains visible after an earlier media load error', async t => {
  const f = await fixture(t);
  await f.render({
    mediaUrl: 'https://audio.example.test/expired.wav',
    onSaveAudio: async () => { throw new f.win.Error('audio-save-network'); },
  });
  await f.flush(() => f.query('audio').dispatchEvent(new f.win.Event('error')));
  await f.flush(() => f.query('.wf-audio__save').click());
  assert.equal(f.query('.wf-audio__save').disabled, false);
  assert.match(f.query('[role=status]').textContent, /网络或跨域访问失败/,
    'The latest explicit save result must not be hidden by the older playback error');
});

test('QA local action errors are visible and unlock the action buttons', async t => {
  const f = await fixture(t);
  await f.render();
  for (const [error, text] of [['not-found', /移动或删除/], ['unsupported-audio', /受支持/], ['audio-action-busy', /稍后重试/], ['audio-action-unsupported', /当前系统/]]) {
    f.win.fetch = async () => ({ ok: false, json: async () => ({ error }) });
    await f.flush(() => f.query('.wf-audio__files button').click());
    assert.match(f.query('[role=status]').textContent, text);
    assert.equal(f.query('.wf-audio__files button').disabled, false);
  }
});
