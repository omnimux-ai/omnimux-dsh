import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { writeFile, unlink } from 'node:fs/promises';
const target = new URL('./.inplace-mounted-bundle.mjs', import.meta.url);
const bundle = await build({ entryPoints: [new URL('./InPlaceTaskSlot.jsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', external: ['react'] });
await writeFile(target, bundle.outputFiles[0].text);
const { InPlaceTaskSlot } = await import(target.href);
await unlink(target);
const dom = new JSDOM('<div id="root"></div>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

test('mounted execution forbids interactive semantics even when a callback exists', async () => {
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(h(InPlaceTaskSlot, { status: 'running', onClick() {} })));
    assert.equal(document.querySelector('[role="button"], [tabindex]'), null);
    assert.equal(document.getElementById('root').textContent.trim(), '');
  } finally { await act(async () => root.unmount()); }
});

test('mounted completion waits for image load and overlaps shimmer for 300ms without replacing slot', async () => {
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(h(InPlaceTaskSlot, { status: 'running', ratio: '9:16' })));
    const slot = document.querySelector('.omx-media-slot');
    await act(async () => root.render(h(InPlaceTaskSlot, { status: 'success', ratio: '9:16', media: { url: '/result.png', type: 'image' } })));
    assert.equal(document.querySelector('.omx-media-slot'), slot);
    assert.ok(slot.querySelector('.wf-organic-shimmer'), 'URL alone must not remove shimmer');
    assert.equal(slot.querySelector('.omx-media-result.active'), null);
    await act(async () => slot.querySelector('img').dispatchEvent(new window.Event('load')));
    assert.ok(slot.querySelector('.omx-media-result.active'));
    assert.ok(slot.querySelector('.omx-media-slot__shimmer-wrap.fade-out'));
    await act(async () => new Promise(resolve => setTimeout(resolve, 320)));
    assert.equal(slot.querySelector('.wf-organic-shimmer'), null);
    assert.equal(document.querySelector('.omx-media-slot'), slot);
  } finally { await act(async () => root.unmount()); }
});

test('video waits for loaded data, exposes only actual metadata, and removes failed media', async () => {
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(h(InPlaceTaskSlot, { status: 'success', controls: true, media: { type: 'video', url: '/a.mp4' } })));
    const video = document.querySelector('video');
    Object.defineProperties(video, { videoHeight: { value: 720 }, duration: { value: 5 } });
    await act(async () => video.dispatchEvent(new window.Event('loadedmetadata')));
    assert.equal(document.querySelector('.result-badge'), null);
    assert.equal(video.controls, false);
    await act(async () => video.dispatchEvent(new window.Event('loadeddata')));
    assert.equal(document.querySelector('.result-badge').textContent, '720P · 5s');
    assert.equal(video.controls, true);
    await act(async () => video.dispatchEvent(new window.Event('error')));
    assert.equal(document.querySelector('.omx-media-slot'), null);
  } finally { await act(async () => root.unmount()); }
});

test('source replacement cancels fade timer and returning to a URL requires fresh readiness', async () => {
  const root = createRoot(document.getElementById('root'));
  const render = url => act(async () => root.render(h(InPlaceTaskSlot, { status: 'success', media: { type: 'image', url } })));
  try {
    await render('/a.png');
    await act(async () => document.querySelector('img').dispatchEvent(new window.Event('load')));
    await render('/b.png');
    await act(async () => new Promise(resolve => setTimeout(resolve, 320)));
    assert.ok(document.querySelector('.wf-organic-shimmer'));
    assert.equal(document.querySelector('.omx-media-result.active'), null);
    await render('/a.png');
    assert.equal(Boolean(document.querySelector('.omx-media-result.active')), false, 'old URL readiness must not survive source replacement');
    await act(async () => document.querySelector('img').dispatchEvent(new window.Event('load')));
    assert.ok(document.querySelector('.omx-media-slot__shimmer-wrap.fade-out'));
  } finally { await act(async () => root.unmount()); }
});

test('mounted abnormal without media leaves no empty slot', async () => {
  const root = createRoot(document.getElementById('root'));
  try {
    for (const status of ['failure', 'cancelled', 'unresolved']) {
      await act(async () => root.render(h(InPlaceTaskSlot, { status })));
      assert.equal(document.querySelector('.omx-media-slot'), null, status);
    }
  } finally { await act(async () => root.unmount()); }
});
