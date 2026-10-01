import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapNodeToGenerationStatus } from '../utils/nodeVisualMath.ts';

test('契约: mapNodeToGenerationStatus 能够正确识别与映射 paused 受阻状态', () => {
  // executionStatus 优先
  assert.equal(mapNodeToGenerationStatus('paused', 'completed', false), 'paused');
  // 回退本地 status
  assert.equal(mapNodeToGenerationStatus(undefined, 'paused', false), 'paused');
  // 正常生成态不受干扰
  assert.equal(mapNodeToGenerationStatus('running', undefined, false), 'generating');
  assert.equal(mapNodeToGenerationStatus('error', undefined, false), 'failed');
});
