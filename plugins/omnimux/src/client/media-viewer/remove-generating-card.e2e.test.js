/**
 * 图像生成媒体查看器移除未完成生成状态占位卡片端到端契约验证测试 (E2E Contract Test)
 * Issue #2339, specs/media-viewer-remove-generating-card.spec.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMediaViewerStore } from './media-viewer-store.js';

const here = dirname(fileURLToPath(import.meta.url));

test('E2E: 媒体查看器视口移除未完成生成状态黑色占位卡片契约验证', async () => {
  // 1. 验证 GenerationTasks.jsx 契约
  const tasksSource = await readFile(resolve(here, 'GenerationTasks.jsx'), 'utf8');

  // 必须对任务做可操作/有产物过滤，未就绪的 pending/running 必须被剔除
  assert.ok(
    tasksSource.includes('task.media && task.media.length > 0'),
    'GenerationTasks 必须过滤仅展示含有产物媒体的任务'
  );
  assert.ok(
    tasksSource.includes('if (!actionableTasks.length) return null;'),
    '当没有具有媒体的任务时，必须直接返回 null，杜绝渲染任何黑色大卡片 DOM'
  );

  // 2. 验证 MediaViewerTab.jsx 视口破坏消除
  const tabSource = await readFile(resolve(here, 'MediaViewerTab.jsx'), 'utf8');
  
  // 视口容器 data-has-generation 不得在仅有 pending/running 时激活
  assert.ok(
    tabSource.includes('task.sessionId === sessionId && task.media?.length > 0'),
    '视口容器 data-has-generation 仅在有实际媒体产出时激活，杜绝破坏全屏大图 Flex 布局'
  );

  // 3. 验证媒体查看器 Store 状态流转契约
  const store = createMediaViewerStore();
  store.updateGeneration({
    sessionId: 'session-test',
    requestId: 'req-pending-1',
    status: 'pending',
    message: '提交状态待确认，请查看对话中的发送提示',
  });

  const snap = store.getSnapshot();
  const targetTask = snap.generationTasks.find((t) => t.requestId === 'req-pending-1');
  assert.ok(targetTask, 'Store 正常记录生成任务');
  assert.equal(targetTask.status, 'pending');
  assert.equal(targetTask.message, '提交状态待确认，请查看对话中的发送提示');

  // 任务流转为 running
  store.updateGeneration({
    sessionId: 'session-test',
    requestId: 'req-pending-1',
    status: 'running',
    message: null,
  });
  const runningTask = store.getSnapshot().generationTasks.find((t) => t.requestId === 'req-pending-1');
  assert.equal(runningTask.status, 'running');
});
