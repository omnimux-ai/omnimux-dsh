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
  assert.equal(canonicalizeCatalogModelId(' seedance-2-0-fast '), 'seedance-2-0-fast');
  assert.equal(canonicalizeCatalogModelId(''), '');
  assert.equal(canonicalizeCatalogModelId(undefined), '');
});

test('resolveSavedModelForPicker: alias in catalog does not insert orphan', () => {
  const catalogIds = ['seedance-2-0-fast', 'grok-imagine-video-1-5'];
  assert.deepEqual(
    resolveSavedModelForPicker('grok-imagine-video-1-5', catalogIds),
    { modelId: 'grok-imagine-video-1-5', insertOrphan: false },
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

test('canonicalizeCatalogModelId keeps saved minimax h3-max line ids on the live minimax-h3 row (#1751)', () => {
  // 上游 c8d134c4f 把 minimax/h3-max 与 minimax/h3-max-turbo 收敛为 minimax-h3 的 model_mapping
  // 目标，这四个线路名仍被上游接受并路由到 h3 家族。
  for (const saved of ['minimax/h3-max', 'h3-max', 'minimax/h3-max-turbo', 'h3-max-turbo']) {
    assert.equal(
      canonicalizeCatalogModelId(saved),
      'minimax-h3',
      `${saved} must normalize onto the live minimax-h3 row`,
    );
  }
  const catalogIds = ['minimax-h3', 'seedance-2-0'];
  assert.deepEqual(
    resolveSavedModelForPicker('minimax/h3-max', catalogIds),
    { modelId: 'minimax-h3', insertOrphan: false },
  );
  assert.deepEqual(
    resolveSavedModelForPicker('minimax/h3-max-turbo', catalogIds),
    { modelId: 'minimax-h3', insertOrphan: false },
  );
  // 边界：已下架的产品 id 不在归一表内 —— 必须走 orphan 路径，不得被静默接到 h3 上。
  assert.deepEqual(
    resolveSavedModelForPicker('minimax-h3-max', catalogIds),
    { modelId: 'minimax-h3-max', insertOrphan: true },
  );
  assert.deepEqual(
    resolveSavedModelForPicker('minimax-h3-max-turbo', catalogIds),
    { modelId: 'minimax-h3-max-turbo', insertOrphan: true },
  );
});
