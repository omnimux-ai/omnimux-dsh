import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const nodeSrc = readFileSync(join(here, 'index.tsx'), 'utf8');

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

test('MaterialNode 文本节点社媒链接检测与工具栏可见性契约', () => {
  // 引入 canExtractVideoFromTextNode 与 extractSocialVideoUrl
  assert.match(nodeSrc, /canExtractVideoFromTextNode/);
  assert.match(nodeSrc, /extractSocialVideoUrl/);

  // allowEmpty 支持空状态文本节点在输入/包含社媒链接时显示工具栏
  assert.match(nodeSrc, /allowEmpty:\s*isEmptyImageNode\s*\|\|\s*canExtractVideo/);
});

test('MaterialNode 提取视频胶囊契约：主区 primary + Film 图标 + i18n 文案', () => {
  const extractAction = sliceActionBlock(nodeSrc, 'extract-video');
  assert.match(extractAction, /section:\s*'primary'/);
  assert.match(extractAction, /variant:\s*'primary'/);
  assert.match(extractAction, /icon:\s*Film/);
  assert.match(extractAction, /label:\s*t\('pill\.extractVideo'\)/);
  assert.match(extractAction, /title:\s*t\('pill\.extractVideo'\)/);
  assert.match(extractAction, /handleExtractVideo/);
});

test('MaterialNode 提取视频触发逻辑：执行中枢请求 + planVideoExtractionDownstream + 自动选中', () => {
  assert.match(nodeSrc, /extractVideoFromUrl\(workspaceId,\s*\{\s*nodeId:\s*id,\s*url:\s*detected\.url/);
  assert.match(nodeSrc, /planVideoExtractionDownstream\(\{/);
  assert.match(nodeSrc, /applyCanvasInputMutation\(\{/);
  assert.match(nodeSrc, /setSelectedElement\('node',\s*plan\.targetNodeId\)/);
});

test('MaterialNode 空态快捷编辑与直接粘贴 URL 契约', () => {
  // 空态按钮点击直接进入卡片内文本编辑态
  assert.match(nodeSrc, /onStartEdit=\{\(\)\s*=>\s*setTextEditing\(true\)\}/);
  // 卡片 shell 支持直接 paste 文本与 URL
  assert.match(nodeSrc, /onPaste=\{/);
  assert.match(nodeSrc, /e\.clipboardData\?\.getData\('text'\)/);
});
