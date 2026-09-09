/**
 * Issue #415: alias canonicalize must collapse 1.5 picker ids onto live grok-imagine-video
 * so ConfigPanel does not insert a deprecated orphan next to the live row.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canonicalizeCatalogModelId,
  resolveSavedModelForPicker,
} from './canonicalizeCatalogModelId.ts';

test('canonicalizeCatalogModelId maps unversioned and dotted 1.5 onto live grok-imagine-video-1-5', () => {
  assert.equal(canonicalizeCatalogModelId('grok-imagine-video'), 'grok-imagine-video-1-5');
  assert.equal(canonicalizeCatalogModelId('grok-imagine-video-1.5'), 'grok-imagine-video-1-5');
  assert.equal(canonicalizeCatalogModelId('grok-imagine-video-1-5'), 'grok-imagine-video-1-5');
  assert.equal(canonicalizeCatalogModelId('minimax/h3-max'), 'minimax-h3-max');
  assert.equal(canonicalizeCatalogModelId('h3-max'), 'minimax-h3-max');
  assert.equal(canonicalizeCatalogModelId('minimax-h3-max'), 'minimax-h3-max');
  assert.equal(canonicalizeCatalogModelId('minimax/h3-max-turbo'), 'minimax-h3-max-turbo');
  assert.equal(canonicalizeCatalogModelId('h3-max-turbo'), 'minimax-h3-max-turbo');
  assert.equal(canonicalizeCatalogModelId('minimax-h3-max-turbo'), 'minimax-h3-max-turbo');
  assert.equal(canonicalizeCatalogModelId(' seedance-2-0-fast '), 'seedance-2-0-fast');
  assert.equal(canonicalizeCatalogModelId(''), '');
  assert.equal(canonicalizeCatalogModelId(undefined), '');
});

test('resolveSavedModelForPicker: alias in catalog does not insert orphan', () => {
  const catalogIds = ['seedance-2-0-fast', 'grok-imagine-video-1-5', 'minimax-h3-max', 'minimax-h3-max-turbo'];
  assert.deepEqual(
    resolveSavedModelForPicker('grok-imagine-video-1-5', catalogIds),
    { modelId: 'grok-imagine-video-1-5', insertOrphan: false },
  );
  assert.deepEqual(
    resolveSavedModelForPicker('minimax/h3-max', catalogIds),
    { modelId: 'minimax-h3-max', insertOrphan: false },
  );
  assert.deepEqual(
    resolveSavedModelForPicker('h3-max', catalogIds),
    { modelId: 'minimax-h3-max', insertOrphan: false },
  );
  assert.deepEqual(
    resolveSavedModelForPicker('minimax/h3-max-turbo', catalogIds),
    { modelId: 'minimax-h3-max-turbo', insertOrphan: false },
  );
  assert.deepEqual(
    resolveSavedModelForPicker('h3-max-turbo', catalogIds),
    { modelId: 'minimax-h3-max-turbo', insertOrphan: false },
  );
  assert.deepEqual(
    resolveSavedModelForPicker('grok-imagine-video-1.5', catalogIds),
    { modelId: 'grok-imagine-video-1-5', insertOrphan: false },
  );
  assert.deepEqual(
    resolveSavedModelForPicker('grok-imagine-video', catalogIds),
    { modelId: 'grok-imagine-video-1-5', insertOrphan: false },
  );
});

test('resolveSavedModelForPicker: unknown saved id still inserts orphan', () => {
  const catalogIds = new Set(['grok-imagine-video-1-5']);
  assert.deepEqual(
    resolveSavedModelForPicker('totally-gone-model', catalogIds),
    { modelId: 'totally-gone-model', insertOrphan: true },
  );
  assert.deepEqual(
    resolveSavedModelForPicker('', catalogIds),
    { modelId: '', insertOrphan: false },
  );
});
