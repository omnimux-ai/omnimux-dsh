/**
 * Issue #4103 — 画布侧 operation 文案镜像 vs 已审校目录（防漂移）。
 *
 * 画布是浏览器岛、且与 `plugins/omnimux` 是两个独立包，运行期读不到
 * `operation-registry.json`，所以 `src/shared/validation/operationLabels.ts` 持有
 * 一份运行期镜像。这个测试逐条比对 id / 中文 / 英文：任何一边改了另一条没跟上，
 * 立刻变红，镜像因此不可能悄悄漂移。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const registryPath = join(
  repoRoot,
  'plugins/omnimux/src/catalog/contract/operation-registry.json',
);

const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const { OPERATION_LABELS } = await import(
  join(repoRoot, 'plugins/omnimux-workflow/src/shared/validation/operationLabels.ts')
);

test('#4103 镜像与 operation-registry.json 的 id 集合完全一致', () => {
  const registryIds = registry.operations.map((op) => op.id).sort();
  const mirrorIds = Object.keys(OPERATION_LABELS).sort();
  assert.deepEqual(mirrorIds, registryIds);
});

test('#4103 镜像的中文名与 registry label 逐条一致', () => {
  for (const op of registry.operations) {
    assert.equal(
      OPERATION_LABELS[op.id]?.zh,
      op.label,
      `${op.id} 中文名与 operation-registry 不一致`,
    );
  }
});

test('#4103 registry 每个 operation 都补齐 labelEn，且镜像英文与之逐条一致', () => {
  for (const op of registry.operations) {
    assert.equal(
      typeof op.labelEn,
      'string',
      `${op.id} 缺 labelEn（画布英文文案依赖它）`,
    );
    assert.notEqual(op.labelEn.trim(), '', `${op.id} labelEn 为空`);
    assert.equal(op.labelEn, OPERATION_LABELS[op.id]?.en, `${op.id} 英文名不一致`);
  }
});

test('#4103 六个视频 operation 在 registry 里中英齐备（AC5）', () => {
  const videoIds = registry.operations
    .filter((op) => op.group === 'video')
    .map((op) => op.id);
  for (const id of ['text_to_video', 'first_frame', 'first_last_frame', 'video_multi_ref', 'document_to_video', 'webpage_to_video']) {
    assert.ok(videoIds.includes(id), `${id} 不在视频 operation 列表`);
    const op = registry.operations.find((entry) => entry.id === id);
    assert.ok(op?.label && op?.labelEn, `${id} 缺中英之一`);
  }
});
