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
  // 1. 验证 GenerationTasks.jsx 契约：彻底移除旧版破坏性文字横条，接入静默 InPlaceTaskSlot
  const tasksSource = await readFile(resolve(here, 'GenerationTasks.jsx'), 'utf8');

  assert.ok(
    tasksSource.includes('InPlaceTaskSlot'),
    'GenerationTasks 必须接入 InPlaceTaskSlot 原位静默卡片'
  );
  assert.ok(
    !tasksSource.includes('copyPrompt'),
    'GenerationTasks 杜绝包含任何旧版复制提示词等冗余操作'
  );

  // 2. 验证 MediaViewerTab.jsx 视口破坏消除与原位卡槽接入
  const tabSource = await readFile(resolve(here, 'MediaViewerTab.jsx'), 'utf8');
  
  assert.ok(
    tabSource.includes('GenerationTasks'),
    '视口容器必须正确挂载 GenerationTasks 原位任务槽'
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
