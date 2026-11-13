/**
 * Issue #4103 / AC7 — 不可执行型号的生成门禁与一键切换。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveUnsupportedModelUi } from './modelExecutionUi.ts';

const CATALOG = [
  { id: 'seedance-2-0', label: 'Seedance 2.0', family: 'bytedance', executionStatus: 'ready', executable: true },
  { id: 'seedance-2-5', label: 'Seedance 2.5', family: 'bytedance', executionStatus: 'ready', executable: true },
  { id: 'wan-3.0', label: 'Wan 3.0', family: 'alibaba', executionStatus: 'unsupported', executable: false },
  { id: 'minimax-h3-video', label: 'MiniMax H3', family: 'minimax', executionStatus: 'ready', executable: true },
];

test('#4103 AC7 不可执行型号：生成门禁 + 推荐同族可执行型号', () => {
  const state = resolveUnsupportedModelUi('wan-3.0', CATALOG);
  assert.equal(state.unsupported, true);
  assert.equal(state.switchTarget?.id, 'seedance-2-0', '没有同族可执行型号时取目录第一个可执行行');
});

test('#4103 AC7 同族优先：同 family 的可执行型号排在前面', () => {
  const withSibling = [
    ...CATALOG,
    { id: 'alibaba-wan-4', label: 'Wan 4', family: 'alibaba', executionStatus: 'ready', executable: true },
  ];
  const state = resolveUnsupportedModelUi('wan-3.0', withSibling);
  assert.equal(state.switchTarget?.id, 'alibaba-wan-4');
});

test('#4103 AC7 可执行型号不触发门禁', () => {
  assert.deepEqual(resolveUnsupportedModelUi('seedance-2-0', CATALOG), { unsupported: false });
  // 未验证（unverified）是另一种原因，不冒充 unsupported
  const unverified = [{ id: 'x', executionStatus: 'unverified', executable: false }];
  assert.deepEqual(resolveUnsupportedModelUi('x', unverified), { unsupported: false });
});

test('#4103 AC7 无候选时不推荐、但门禁仍成立', () => {
  const only = [{ id: 'wan-3.0', family: 'alibaba', executionStatus: 'unsupported', executable: false }];
  const state = resolveUnsupportedModelUi('wan-3.0', only);
  assert.equal(state.unsupported, true);
  assert.equal(state.switchTarget, undefined);
});

test('#4103 AC7 目录缺失/空 id 不误判、不抛错', () => {
  assert.deepEqual(resolveUnsupportedModelUi('wan-3.0', []), { unsupported: false });
  assert.deepEqual(resolveUnsupportedModelUi('wan-3.0', null), { unsupported: false });
  assert.deepEqual(resolveUnsupportedModelUi('', CATALOG), { unsupported: false });
  assert.deepEqual(resolveUnsupportedModelUi(undefined, CATALOG), { unsupported: false });
});
