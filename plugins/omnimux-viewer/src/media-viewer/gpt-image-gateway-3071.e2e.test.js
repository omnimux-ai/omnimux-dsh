import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
assert.equal(typeof build, 'function');
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// React DOM interaction regression grounded in #3071 ego-browser verification.
// This offline test does not claim real-browser or paid-generation evidence.
test('image channel switch retains ratio and narrows standard resolution/batch without widening', async () => {
  const require = createRequire(import.meta.url);
  const reactPath = dirname(require.resolve('react/package.json'));
  const reactDomPath = dirname(require.resolve('react-dom/package.json'));
  const dir = mkdtempSync(join(tmpdir(), 'gpt-image-ui-3071-'));
  const output = join(dir, 'entry.mjs');
  assert.equal(typeof reactPath, 'string');
  await build({ stdin: { contents: `export { useMediaGenerationConfig, MediaConfigControls } from './MediaConfigControls.jsx';`, resolveDir: dirname(fileURLToPath(import.meta.url)) }, bundle: true, format: 'esm', platform: 'node', outfile: output, plugins: [{ name: 'shared-react', setup(build) { build.onResolve({ filter: /^react$/ }, () => ({ path: require.resolve('react'), external: true })); } }] });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const prior = new Map();
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    prior.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 503 });
  let root;
  try {
    const React = require('react');
    const { act } = require('react-dom/test-utils');
    const { createRoot } = require('react-dom/client');
    const { useMediaGenerationConfig, MediaConfigControls } = await import(pathToFileURL(output).href);
    function Probe() { const config = useMediaGenerationConfig(); return React.createElement(React.Fragment, null, React.createElement(MediaConfigControls, { config, showModeSwitch: false }), React.createElement('output', { id: 'state' }, JSON.stringify({ channel: config.channel?.id, params: config.params }))); }
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(Probe)));
    const click = async (selector) => { const node = document.querySelector(selector); assert.ok(node, selector); await act(async () => node.click()); };
    const option = async (scope, label) => { const node = [...document.querySelectorAll(`${scope} button`)].find((button) => button.textContent.trim() === label); assert.ok(node, label); await act(async () => node.click()); };
    const state = () => JSON.parse(document.getElementById('state').textContent);
    const channel = async (id) => { await click('#modelCascadeTriggerBtn'); const buttons = [...document.querySelectorAll('.omx-version-row')]; const node = buttons.find(button => button.querySelector('.omx-version-name')?.textContent === id); assert.ok(node, id); await act(async () => node.click()); };
    assert.equal(state().channel, 'standard');
    const { DEFAULT_FALLBACK_CATALOG, parseCatalogToCascade, imageParameterOptions } = await import('./MediaViewerComposerData.js');
    for (const model of parseCatalogToCascade(DEFAULT_FALLBACK_CATALOG.image).flatMap(brand => brand.models)) {
      const options = imageParameterOptions(model, model.channels[0]);
      assert.deepEqual(options.resolution.options.map(option => option.value), ['1K', '2K', '4K']);
      assert.doesNotMatch(options.resolution.defaultValue, /x/);
    }
    await channel('经济版');
    await click('#paramSummaryTriggerBtn');
    await option('.omx-ratio-grid', '3:2');
    await option('.omx-subcol-clarity', '4K');
    await option('.omx-subcol-sound', '4');
    assert.deepEqual(state().params, { aspectRatio: '3:2', resolution: '4K', batch: '4', operation: '文生图' });
    await click('#paramSummaryTriggerBtn');
    await channel('标准版');
    await click('#paramSummaryTriggerBtn');
    assert.deepEqual(state().params, { aspectRatio: '3:2', resolution: '1K', batch: '1', operation: '文生图' });
    assert.deepEqual([...document.querySelectorAll('.omx-subcol-clarity button')].map(b => b.textContent.trim()), ['1K']);
    assert.deepEqual([...document.querySelectorAll('.omx-subcol-sound button')].map(b => b.textContent.trim()), ['1']);
    assert.equal(document.querySelectorAll('.omx-ratio-grid button').length, 9);
    await option('.omx-ratio-grid', '自适应');
    assert.equal(state().params.aspectRatio, 'auto');
    await click('#paramSummaryTriggerBtn');
    await channel('旗舰版');
    await click('#paramSummaryTriggerBtn');
    assert.deepEqual([...document.querySelectorAll('.omx-subcol-clarity button')].map(b => b.textContent.trim()), ['1K', '2K', '4K']);
    assert.deepEqual([...document.querySelectorAll('.omx-subcol-sound button')].map(b => b.textContent.trim()), ['1', '2', '4']);
  } finally {
    if (root) { const { act } = require('react-dom/test-utils'); await act(async () => root.unmount()); }
    globalThis.fetch = previousFetch;
    for (const [name, descriptor] of prior) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
    dom.window.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
