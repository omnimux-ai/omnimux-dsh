/**
 * 直连媒体生成路由与官方多模态渠道自适应端到端契约测试 (E2E Contract Test)
 * 对应规格：specs/fix-media-generate-pipeline.spec.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

test('E2E: 直连生成路由渠道透传与官方多模态自适应契约验证', async () => {
  // 1. 验证 direct-http.js 必须提取并透传 group / channel
  const httpSource = await readFile(resolve(here, 'direct-http.js'), 'utf8');
  assert.ok(
    httpSource.includes('body.group') && httpSource.includes('body.channel'),
    'direct-http.js 必须提取 body.group 或 body.channel'
  );
  assert.ok(
    httpSource.includes('group: requestedGroup'),
    'direct-http.js 必须向底层执行器注入 group 参数'
  );

  // 2. 验证 execute.js 必须具备官方媒体模型自适应识别能力
  const executeSource = await readFile(resolve(here, 'execute.js'), 'utf8');
  assert.ok(
    executeSource.includes('isOfficialMediaModel') || executeSource.includes('isEffectivelyOfficial'),
    'execute.js 必须声明官方媒体模型自适应识别逻辑'
  );
  assert.ok(
    executeSource.includes('isOfficialChannel || (!isByokChannel && isOfficialMediaModel)'),
    '请求官方模型且未显式指定 byok 渠道时必须视为官方渠道'
  );

  // 3. 验证 MediaViewerTab.jsx 过滤空 url 脏数据防裂图
  const tabSource = await readFile(resolve(here, '../../../omnimux-viewer/src/media-viewer/MediaViewerTab.jsx'), 'utf8');
  assert.ok(
    tabSource.includes('.filter((item) => item && (item.url || item.status === \'generating\'))'),
    'MediaViewerTab.jsx 必须过滤无 url 且非生成中的破损条目'
  );
});
