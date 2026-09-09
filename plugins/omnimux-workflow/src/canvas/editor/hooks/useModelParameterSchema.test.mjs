/**
 * Catalog cache v3 + schema hook contract.
 * Media SPECS ownership moved to hub `plugins/omnimux/src/media/catalog.test.js`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'useModelParameterSchema.ts'), 'utf8');

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
