/**
 * TableNode 顶部操作栏与组件结构契约测试
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tableNodeSrc = readFileSync(join(here, 'TableNode.tsx'), 'utf8');

function sliceActionBlock(src, key) {
  const needle = `key: '${key}'`;
  const keyIdx = src.indexOf(needle);
  assert.ok(keyIdx >= 0, `missing action ${key}`);
  const start = src.lastIndexOf('{', keyIdx);
  assert.ok(start >= 0, `missing object start for ${key}`);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed action ${key}`);
}

test('TableNode 顶部胶囊栏契约：通用 FloatingTopPill + 有行才显示 + chat 次区图标', () => {
  assert.match(tableNodeSrc, /import FloatingTopPill, \{ type FloatingPillAction \} from '\.\.\/\.\.\/editor\/components\/FloatingTopPill/);
  assert.match(tableNodeSrc, /useAddToConversation/);
  assert.match(tableNodeSrc, /hasNodeMaterial/);
  assert.match(tableNodeSrc, /shouldShowNodeToolbar/);
  assert.match(tableNodeSrc, /<FloatingTopPill actions=\{pillActions\}/);

  const chat = sliceActionBlock(tableNodeSrc, 'add-to-conversation');
  assert.match(chat, /icon:\s*MessageSquarePlus/);
  assert.match(chat, /section:\s*'secondary'/);
  assert.match(chat, /title:\s*t\('pill\.addToConversation'\)/);
  assert.doesNotMatch(chat, /label:\s*t\('pill\.addToConversation'\)/);
  assert.doesNotMatch(chat, /variant:\s*'primary'/);
  assert.doesNotMatch(chat, /label:\s*['"]/);

  const fullscreen = sliceActionBlock(tableNodeSrc, 'fullscreen-edit');
  assert.match(fullscreen, /icon:\s*Maximize2/);
  assert.match(fullscreen, /section:\s*'primary'/);
  assert.match(fullscreen, /label:\s*t\('pill\.fullscreen'\)/);
  assert.match(fullscreen, /title:\s*t\('pill\.fullscreen'\)/);

  assert.doesNotMatch(tableNodeSrc, /title="添加数据行"/);
  assert.doesNotMatch(tableNodeSrc, /title:\s*'添加到会话'/);
  assert.doesNotMatch(tableNodeSrc, /title:\s*'全屏编辑'/);
});

test('TableNode 契约：必须提取 effectiveTableId 并传给 useTableSession 和 tableRelPath', () => {
  // 1. 验证源码中声明了 effectiveTableId = (data as any)?.tableId || id
  assert.match(
    tableNodeSrc,
    /const\s+effectiveTableId\s*=\s*\(data as any\)\?\.tableId\s*\|\|\s*id;/,
    '必须提取 effectiveTableId，优先使用 data.tableId',
  );

  // 2. 验证 tableRelPath 使用了 effectiveTableId
  assert.match(
    tableNodeSrc,
    /const\s+tableRelPath\s*=\s*\(data as any\)\?\.tablePath\s*\|\|\s*\(data as any\)\?\.path\s*\|\|\s*`\.omnimux\/tables\/\$\{effectiveTableId\}\.htable`;/,
    'tableRelPath 必须拼接 effectiveTableId',
  );

  // 3. 验证 useTableSession 接收 effectiveTableId 而非硬编码 id
  assert.match(
    tableNodeSrc,
    /useTableSession\(effectiveTableId,\s*\{/,
    'useTableSession 必须传入 effectiveTableId',
  );

  // 4. 验证 openStage 接收 effectiveTableId
  assert.match(
    tableNodeSrc,
    /openStage\(effectiveTableId/,
    'openStage 必须传入 effectiveTableId',
  );
});

test('TableNode 自动拉取与缓存同步契约：挂载 ensure + openStage 确保文档 + 富有信息量的代表列预览', () => {
  // 1. 验证存在 useEffect 自动加载 tableDocumentCache.ensure
  assert.match(
    tableNodeSrc,
    /tableDocumentCache\.ensure\(workspaceId,\s*effectiveTableId,\s*\{\s*forceReload:\s*false\s*\}\)/,
    'TableNode 挂载时必须自动调用 tableDocumentCache.ensure 拉取文档',
  );

  // 2. 验证 handleOpenFullscreen 会在未 ready 时先 ensure 最新文档
  assert.match(
    tableNodeSrc,
    /await\s+tableDocumentCache\.ensure\(workspaceId,\s*effectiveTableId,\s*\{\s*forceReload:\s*false\s*\}\)/,
    '全屏打开前必须确保文档已载入',
  );

  // 3. 验证使用 formatRowPreview 智能预览
  assert.match(
    tableNodeSrc,
    /formatRowPreview\(r,\s*document\.columns\)/,
    '预览行必须调用 formatRowPreview 智能选择信息量最大的代表列',
  );
});
