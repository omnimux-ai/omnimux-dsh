/**
 * Catalog cache v3 + schema hook contract.
 * Media SPECS ownership moved to hub `plugins/omnimux/src/media/catalog.test.js`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'useModelParameterSchema.ts'), 'utf8');
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const bundle = buildSync({
  entryPoints: [join(here, 'useModelParameterSchema.ts')],
  bundle: true, platform: 'node', format: 'cjs', write: false, external: ['react'],
});
const hookModule = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, hookModule, hookModule.exports);
const { useModelParameterSchema, setCachedCatalog, invalidateCachedCatalog } = hookModule.exports;
function renderSchema(type, id, catalog) {
  let result;
  function Probe() { result = useModelParameterSchema(type, id, catalog); return null; }
  renderToStaticMarkup(React.createElement(Probe));
  return result;
}
const parameters = {
  aspectRatio: { options: [{ value: '9:16', label: 'Portrait' }], defaultValue: '9:16' },
  duration: { options: [{ value: 8, label: '8s' }], defaultValue: 8, range: { min: 2, max: 10, step: 2 }, allowAuto: true },
  resolution: { options: [{ value: '720P', label: '720P' }], defaultValue: '720P' },
  sound: { supported: true, defaultValue: true },
};
function makeCatalog(type = 'video', schema = parameters) {
  return { source: 'omnimux', text: [], image: [], video: [], audio: [],
    [type]: [{ id: 'selected', label: 'Selected', parameters: schema }],
    models: [{ id: 'selected', label: 'Selected', operations: [{ id: 'generate', listed: true,
      output: { type }, inputs: [{ id: 'reference', type: 'video' }] }] }],
  };
}
function assertNoParameters(result) {
  assert.deepEqual(result.schema, {});
  for (const key of ['aspectRatioOptions', 'durationOptions', 'resolutionOptions', 'qualityOptions', 'voiceOptions']) {
    assert.deepEqual(result[key], [], key);
  }
  assert.equal(result.hasSoundSupport, false);
  assert.equal(result.hasInstrumentalSupport, false);
  assert.equal(result.isAspectRatioValid('16:9'), false);
  assert.equal(result.isDurationValid(5), false);
}

test('unknown or missing selection never borrows the first catalog model', () => {
  for (const id of ['missing', undefined, '']) {
    const result = renderSchema('video', id, makeCatalog());
    assert.equal(result.modelItem, undefined);
    assertNoParameters(result);
  }
});

test('empty catalog and unrecognized material type expose no fabricated parameters', () => {
  invalidateCachedCatalog();
  for (const type of ['text', 'image', 'video', 'audio', 'unknown', 'models']) {
    const result = renderSchema(type, 'selected', { ...makeCatalog(), video: [] });
    assert.equal(result.modelItem, undefined);
    assertNoParameters(result);
  }
  assertNoParameters(renderSchema('video', undefined, null));
});

test('a selected catalog model without parameter definitions exposes no static choices', () => {
  for (const type of ['text', 'image', 'video', 'audio']) {
    const catalog = makeCatalog(type, {});
    const result = renderSchema(type, 'selected', catalog);
    assert.equal(result.modelItem, catalog[type][0]);
    assertNoParameters(result);
  }
});

test('modern catalog requires a listed operation with the same output type', () => {
  for (const operations of [[], [{ listed: true, output: { type: 'text' } }], [{ listed: false, output: { type: 'video' } }]]) {
    const catalog = makeCatalog();
    catalog.models[0].operations = operations;
    const result = renderSchema('video', 'selected', catalog);
    assert.equal(result.modelItem, undefined);
    assertNoParameters(result);
  }
  for (const models of [[], undefined]) {
    const result = renderSchema('video', 'selected', { ...makeCatalog(), models });
    assert.equal(result.modelItem, undefined);
    assertNoParameters(result);
  }
});

test('legal selection consumes only its own parameters and preserves real multimodal input', () => {
  const catalog = makeCatalog();
  const result = renderSchema('video', 'selected', catalog);
  assert.equal(result.schema, parameters);
  assert.equal(result.modelItem, catalog.video[0]);
  assert.equal(result.defaultAspectRatio, '9:16');
  assert.equal(result.isAspectRatioValid('9:16'), true);
  assert.equal(result.isAspectRatioValid('16:9'), false);
  assert.equal(result.defaultDuration, 8);
  assert.equal(result.isDurationValid(6), true);
  assert.equal(result.isDurationValid(7), false);
  assert.equal(result.isDurationValid(-1), true);
  assert.equal(result.defaultResolution, '720P');
  assert.equal(result.hasSoundSupport, true);
  const textCatalog = makeCatalog('text', {});
  assert.equal(renderSchema('text', 'selected', textCatalog).modelItem, textCatalog.text[0]);
});

test('cache remains usable for legal selection but explicit empty catalog wins', () => {
  const catalog = makeCatalog();
  setCachedCatalog(catalog);
  try {
    assert.equal(renderSchema('video', 'selected', null).schema, parameters);
    assertNoParameters(renderSchema('video', 'selected', { ...catalog, video: [], models: [] }));
    assertNoParameters(renderSchema('video', 'missing', null));
  } finally { invalidateCachedCatalog(); }
});

test('catalog cache key is v4 with fingerprint + fetchedAt envelope', () => {
  assert.match(src, /wf_capabilities_catalog_v4/);
  assert.match(src, /fingerprint/);
  assert.match(src, /fetchedAt/);
  assert.match(src, /invalidateCachedCatalog/);
  assert.match(src, /isCatalogCacheStale/);
  assert.match(src, /export function getCachedFingerprint/);
  assert.doesNotMatch(src, /wf_capabilities_catalog_v2/);
  assert.doesNotMatch(src, /wf_capabilities_catalog_v1/);
});

test('workflow package no longer re-exports IMAGE_MODEL_SPECS', () => {
  const indexSrc = readFileSync(join(here, '../../../../src/index.ts'), 'utf8');
  assert.doesNotMatch(indexSrc, /IMAGE_MODEL_SPECS/);
  assert.doesNotMatch(indexSrc, /VIDEO_MODEL_SPECS/);
});
