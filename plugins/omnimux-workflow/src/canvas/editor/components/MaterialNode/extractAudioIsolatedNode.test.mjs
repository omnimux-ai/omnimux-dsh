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

test('MaterialNode 提取音频先建节点契约：调用 planAudioExtractProvisioning 且源视频节点绝不写 running/error', () => {
  // 必须引入 planAudioExtractProvisioning 与 planAudioExtractSettlement
  assert.match(nodeSrc, /planAudioExtractProvisioning/);
  assert.match(nodeSrc, /planAudioExtractSettlement/);

  // handleExtractAudio 内部在调用后端前先进行 provision
  const handleExtractAudioIdx = nodeSrc.indexOf('const handleExtractAudio = useCallback');
  assert.ok(handleExtractAudioIdx > 0);
  const handleExtractAudioEnd = nodeSrc.indexOf('}, [applyCanvasInputMutation, id, isExtractingAudio', handleExtractAudioIdx);
  assert.ok(handleExtractAudioEnd > handleExtractAudioIdx);
  const handleExtractAudioCode = nodeSrc.slice(handleExtractAudioIdx, handleExtractAudioEnd);

  // 必须调用 planAudioExtractProvisioning
  assert.match(handleExtractAudioCode, /planAudioExtractProvisioning\(\{/);
  // 必须使用 applyCanvasInputMutation 预先上屏
  assert.match(handleExtractAudioCode, /applyCanvasInputMutation\(\{/);
  // 绝不能对当前视频节点调用 updateNodeData({ executionStatus: ... })
  assert.doesNotMatch(handleExtractAudioCode, /updateNodeData\(\{\s*executionStatus/);

  // 结算必须走 planAudioExtractSettlement 仅针对 targetNodeId 进行 patch
  assert.match(handleExtractAudioCode, /planAudioExtractSettlement\(\{/);
});

test('MaterialNode 工具栏提取音频按钮防抖与禁用契约', () => {
  const extractAudioAction = sliceActionBlock(nodeSrc, 'extract-audio');
  assert.match(extractAudioAction, /section:\s*'primary'/);
  assert.match(extractAudioAction, /icon:\s*Music/);
  assert.match(extractAudioAction, /label:\s*t\('pill\.extractAudio'\)/);
  assert.match(extractAudioAction, /disabled:\s*isExtractingAudio/);
  assert.match(extractAudioAction, /if\s*\(isExtractingAudio\)\s*return/);
});

test('MaterialNode 音频节点独立重试闭环契约：在音频节点内部触发 handleRetryAudioExtract', () => {
  // 音频节点在 GSC onRetry 中支持重试提取
  assert.match(nodeSrc, /materialType === 'audio' && \(nodeData\.origin === 'audio_extract' \|\| nodeData\.audioExtractActive === true\)/);
  assert.match(nodeSrc, /handleRetryAudioExtract\(\)/);

  // handleRetryAudioExtract 自身能找到 sourceVideoNodeId 或 sourceVideoPath
  const retryIdx = nodeSrc.indexOf('const handleRetryAudioExtract = useCallback');
  assert.ok(retryIdx > 0);
  const retryEnd = nodeSrc.indexOf('}, [id, label, nodeData, t, updateNodeData]', retryIdx);
  assert.ok(retryEnd > retryIdx);
  const retryCode = nodeSrc.slice(retryIdx, retryEnd);

  assert.match(retryCode, /extractAudioFromVideo/);
  assert.match(retryCode, /sourceVideoPath/);
});
