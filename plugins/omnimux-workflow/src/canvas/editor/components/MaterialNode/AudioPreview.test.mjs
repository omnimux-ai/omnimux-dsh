import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const { JSDOM } = createRequire(new URL('../../../../../../omnimux/package.json', import.meta.url))('jsdom');
const bundle = await build({
  stdin: { contents: `export { default as Preview } from './MediaPreview.tsx'; export { createElement, act, StrictMode } from 'react'; export { createRoot } from 'react-dom/client';`, resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'tsx' },
  bundle: true, write: false, format: 'iife', globalName: 'api', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
});

async function setup(t) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', runScripts: 'outside-only' });
  const win = dom.window;
  win.IS_REACT_ACT_ENVIRONMENT = true;
  win.MessageChannel = class {
    port1 = { onmessage: null };
    port2 = { postMessage: () => setImmediate(() => this.port1.onmessage?.()) };
  };
  let plays = 0;
  let pauses = 0;
  win.HTMLMediaElement.prototype.load = function () {};
  win.HTMLMediaElement.prototype.pause = function () { pauses += 1; this.dispatchEvent(new win.Event('pause')); };
  win.HTMLMediaElement.prototype.play = async function () { plays += 1; this.dispatchEvent(new win.Event('play')); };
  win.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
  win.eval(bundle.outputFiles[0].text);
  const api = win.api;
  const root = api.createRoot(win.document.getElementById('root'));
  const flush = fn => api.act(async () => { await fn?.(); for (let i = 0; i < 8; i++) await Promise.resolve(); });
  const render = props => flush(() => root.render(api.createElement(api.StrictMode, null, api.createElement(api.Preview, { materialType: 'audio', workspaceId: 'ws_audio', ...props }))));
  t.after(async () => { await flush(() => root.unmount()); win.close(); });
  return { win, flush, render, plays: () => plays, pauses: () => pauses };
}
const source = '/omnimux-workflow/api/workspaces/ws_audio/file?rel=assets/a.wav';

test('save retries are explicit, replacement is a separate file-row action, saved source opens without another save', async t => {
  const f = await setup(t);
  let saves = 0;
  let replaces = 0;
  const onSaveAudio = async () => { saves++; if (saves === 1) throw new f.win.Error('audio-save-network'); };
  await f.render({ mediaUrl: 'https://example.com/audio.wav', onSaveAudio, onReplaceAudio: () => { replaces++; } });
  const query = selector => f.win.document.querySelector(selector);
  assert.equal(query('.wf-audio__wave .wf-audio__replace'), null);
  assert.ok(query('.wf-audio__files .wf-audio__replace'));
  await f.flush(() => query('.wf-audio__save').click());
  assert.match(query('[role=status]').textContent, /网络或跨域访问失败/);
  assert.equal(query('.wf-audio__save').disabled, false);
  await f.flush(() => query('.wf-audio__save').click());
  assert.equal(saves, 2);
  await f.render({ mediaUrl: source, onSaveAudio, onReplaceAudio: () => { replaces++; } });
  assert.equal(query('.wf-audio__save'), null);
  f.win.fetch = async () => ({ ok: false, json: async () => ({ error: 'audio-action-failed' }) });
  await f.flush(() => query('.wf-audio__files button').click());
  assert.match(query('[role=status]').textContent, /本地文件操作失败/);
  await f.flush(() => query('.wf-audio__files button').click());
  assert.equal(saves, 2);
  await f.flush(() => query('.wf-audio__replace').click());
  assert.equal(replaces, 1);
});

test('audio-only layout removes overlay and reserves a nonshrinking file-action row', () => {
  const node = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../../theme/components.css', import.meta.url), 'utf8');
  assert.match(node, /showReplaceButton && materialType !== 'audio'/);
  assert.match(css, /\.wf-audio__files \{[^}]*flex-shrink: 0/);
  assert.match(css, /\.wf-audio \{[^}]*justify-content: flex-start/);
  assert.match(css, /\.wf-audio__replace \{ margin-left: auto;/);
});

test('StrictMode preserves source, never autoplays, and native events own play state', async t => {
  const f = await setup(t);
  await f.render({ mediaUrl: source });
  const media = f.win.document.querySelector('audio');
  assert.equal(media.getAttribute('src'), source);
  assert.equal(f.plays(), 0);
  await f.flush(() => f.win.document.querySelector('.wf-audio__play').click());
  assert.equal(f.plays(), 1);
  assert.equal(f.win.document.querySelector('.wf-audio__play').getAttribute('aria-label'), '暂停');
  await f.flush(() => media.dispatchEvent(new f.win.Event('ended')));
  assert.equal(f.win.document.querySelector('.wf-audio__play').getAttribute('aria-label'), '播放');
});

test('source replacement remounts transport and local actions follow the selected asset', async t => {
  const f = await setup(t);
  await f.render({ mediaUrl: source });
  const oldMedia = f.win.document.querySelector('audio');
  const calls = [];
  f.win.fetch = async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ ok: true }) }; };
  await f.flush(() => f.win.document.querySelector('.wf-audio__files button').click());
  assert.deepEqual(calls[0], { url: '/omnimux-workflow/api/workspaces/ws_audio/audio-file-action', body: { action: 'open', relativePath: 'assets/a.wav' } });
  await f.render({ mediaAssets: [{ type: 'audio', url: 'https://example.com/b.mp3' }], mediaUrl: source });
  assert.notEqual(f.win.document.querySelector('audio'), oldMedia);
  assert.equal(oldMedia.getAttribute('src'), null);
  assert.equal(f.win.document.querySelector('.wf-audio__files button').disabled, true);
  assert.match(f.win.document.querySelector('.wf-audio__time').textContent, /0:00/);
});
