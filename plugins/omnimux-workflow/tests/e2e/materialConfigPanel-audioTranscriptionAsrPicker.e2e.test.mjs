/**
 * E2E · 画布「音频转写」工具（tool = audio-transcription）的型号下拉（Issue #1789）。
 *
 * 覆盖的用户可见行为：
 *   1. `doubao-asr-bigmodel` 与 `seedasr-auc` 两个语音识别契约型号都可选；
 *   2. 空态「暂无可用转写模型」不再出现；
 *   3. 生成类工具（chat）不受影响，无回归。
 *
 * 断言口径沿用本目录既有惯例：`.tsx` 无法被 node 直接 import，故
 *   - 界面接线用「读源码 + 正则断言」核实；
 *   - 行为用可 import 的真实模块做真实调用断言（真实 Hub 目录 → 真实客户端目录接缝
 *     → 真实型号列表构建），而不是造一份夹具目录。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildModelCatalog } from '../../../omnimux/src/catalog/list.js';
import { readCanvasCatalog } from '../../src/workflow/seam/canvasCatalog.ts';
import {
  buildFilteredModelOptions,
  isZeroCandidateEmptyState,
} from '../../src/shared/validation/operationUi.ts';
import { buildUpstreamFingerprint } from '../../src/shared/validation/compatKernel.ts';

const here = dirname(fileURLToPath(import.meta.url));
const panelPath = join(here, '../../src/canvas/editor/components/MaterialNode/ConfigPanel/index.tsx');
const policyPath = join(here, '../../src/shared/generationPolicy.ts');
const dictZhPath = join(here, '../../src/canvas/i18n/dict.zh.ts');

const panelSrc = readFileSync(panelPath, 'utf8');
const policySrc = readFileSync(policyPath, 'utf8');
const dictZhSrc = readFileSync(dictZhPath, 'utf8');

/** 真实 Hub 目录 → 真实客户端目录接缝，与产品运行时读取的是同一条链路。 */
const ASR_MODELS = ['doubao-asr-bigmodel', 'seedasr-auc'];
const CHAT_MODELS = ['gemini-3.8-flash'];

function canvasCatalog() {
  const body = buildModelCatalog({ env: {} });
  return readCanvasCatalog((name) => (name === 'modelCatalog' ? { list: () => body } : undefined));
}

function audioFingerprint() {
  return buildUpstreamFingerprint({
    prompt: '',
    assets: [{ sourceNodeId: 'audio-1', type: 'audio', mimeType: 'audio/mpeg', sizeBytes: 4096 }],
  });
}

test('e2e: audio-transcription tool forwards its own tool id to the picker, so capability contracts can be listed', () => {
  // 1. 工具身份：ASR 工具由 selectedTool 判定，不靠型号名硬编码。
  assert.match(
    panelSrc,
    /const isAsrTool = selectedTool === 'audio-transcription';/,
    'The audio transcription tool must be identified by its tool id',
  );

  // 2. 型号列表构建必须拿到该工具 id；漏传即退回「只按生成白名单过滤」的旧行为。
  assert.match(
    panelSrc,
    /buildFilteredModelOptions\(\{[\s\S]*?tool:\s*selectedTool\s*,/m,
    'ConfigPanel must pass the selected tool into buildFilteredModelOptions',
  );
  assert.match(
    panelSrc,
    /\[activeCatalog,\s*consumedFingerprint,\s*outputTypeForCompat,\s*selectedTool\]/,
    'selectedTool must be part of the memo dependency list, or the picker goes stale',
  );

  // 3. 空态由零候选推导；ASR 空态文案通过 isAsrTool 分支选择。
  assert.match(
    panelSrc,
    /const showEmptyModels = filteredModels\.zeroCandidates \|\| modelOptions\.length === 0;/,
    'Empty state must derive from the picker result',
  );
  assert.match(
    panelSrc,
    /isAsrTool \? 'panel\.noTranscriptionModel' : 'panel\.noCompatibleModel'/,
    'The ASR branch must map to the transcription empty-state message',
  );

  // 4. 空态文案本身：用户在画布上看到的那句中文。
  assert.match(
    dictZhSrc,
    /'panel\.noTranscriptionModel':\s*'暂无可用转写模型'/,
    'The empty state the issue reports must be the one asserted here',
  );

  // 5. 准入必须由契约推导：画布代码不得点名任何 ASR 型号，否则「新增型号自动可选」不成立。
  for (const src of [panelSrc, policySrc]) {
    assert.doesNotMatch(
      src,
      /seedasr-auc|doubao-asr-bigmodel/,
      'Canvas admission must not hardcode model ids; a listed contract must be enough',
    );
  }
});

test('e2e: both speech contracts are selectable in the audio-transcription picker and the empty state stays off', () => {
  const catalog = canvasCatalog();

  // 两个契约都经由真实 Hub 目录到达画布目录。
  assert.deepEqual(
    catalog.models.filter((row) => ASR_MODELS.includes(row.id)).map((row) => row.id).sort(),
    [...ASR_MODELS].sort(),
    'Both ASR contracts must reach the canvas catalog',
  );

  const result = buildFilteredModelOptions({
    catalog,
    fingerprint: audioFingerprint(),
    outputType: 'text',
    tool: 'audio-transcription',
  });

  // 下拉里就是这两个型号（顺序不敏感），且带得出用户看到的标签。
  assert.deepEqual(result.options.map((row) => row.id).sort(), [...ASR_MODELS].sort());
  assert.deepEqual(
    result.options.map((row) => row.label).sort(),
    ['Seed ASR 2.0 语音识别', '豆包语音识别大模型 (Doubao-ASR)'].sort(),
  );

  // 空态「暂无可用转写模型」不再触发 —— 两条判据（picker 结果 + 面板消费的同一个函数）都为假。
  assert.equal(result.zeroCandidates, false);
  assert.equal(isZeroCandidateEmptyState(result), false);
});

test('e2e: chat generation is unaffected — no ASR model leaks into generative pickers', () => {
  const catalog = canvasCatalog();

  // 生成桶保持 chat-only，ASR 绝不进来。
  assert.deepEqual(catalog.text.map((row) => row.id), CHAT_MODELS);
  assert.equal(catalog.text.some((row) => ASR_MODELS.includes(row.id)), false);

  // chat 工具：仍是四个生成型号。
  const chat = buildFilteredModelOptions({
    catalog,
    fingerprint: buildUpstreamFingerprint({ prompt: '请润色这段文字' }),
    outputType: 'text',
    tool: 'text-to-text',
  });
  assert.deepEqual(chat.options.map((row) => row.id).sort(), [...CHAT_MODELS].sort());
  assert.equal(chat.options.some((row) => ASR_MODELS.includes(row.id)), false);

  // 未声明 tool 的调用方保留改动前行为（只走生成白名单）。
  const noTool = buildFilteredModelOptions({
    catalog,
    fingerprint: buildUpstreamFingerprint({ prompt: '请润色这段文字' }),
    outputType: 'text',
  });
  assert.deepEqual(noTool.options.map((row) => row.id).sort(), [...CHAT_MODELS].sort());
});
