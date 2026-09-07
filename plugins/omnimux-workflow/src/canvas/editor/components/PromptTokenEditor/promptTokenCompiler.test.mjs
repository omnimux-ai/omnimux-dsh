/**
 * promptTokenCompiler.test.mjs — Prompt Token 编译器与解析器测试 (Issue #714 / T04).
 *
 * 覆盖：
 * 1. Markdown 与 TokenSegments 互转（纯文本、多 Token 胶囊、连续 Token、首尾切片）；
 * 2. 字数统计（视觉计数 vs 底层字符长度，单 Token 计 1 或计 Label 长度）；
 * 3. Token 抽取（提取有效引用对象、携带模态与 slotIndex）；
 * 4. 正则契约与边界防御（空串、非法格式安全兜底）。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PROMPT_REF_REGEX,
  parseMarkdownToTokenSegments,
  serializeSegmentsToMarkdown,
  calculatePromptVisualLength,
  extractPromptTokens,
} from './promptTokenCompiler.ts';

test('1. 正则契约验证：严格匹配 @ref[nodeId:slotIndex:fileName]', () => {
  const text = '参考 @ref[node_1:0:character.png] 与 @ref[node_2:1:background.mp4]';
  const matches = [...text.matchAll(PROMPT_REF_REGEX)];

  assert.equal(matches.length, 2);
  assert.equal(matches[0][1], 'node_1');
  assert.equal(matches[0][2], '0');
  assert.equal(matches[0][3], 'character.png');

  assert.equal(matches[1][1], 'node_2');
  assert.equal(matches[1][2], '1');
  assert.equal(matches[1][3], 'background.mp4');
});

test('2. Markdown 与 TokenSegments 互转：无损双向往返', () => {
  const cases = [
    '纯文本提示词无任何引用',
    '@ref[node_1:0:cat.png]',
    '生成赛博朋克风格特写：@ref[node_a:0:cat.png] 坐在 @ref[node_b:1:cyber_car.png] 上，背景呈现霓虹灯光。',
    '@ref[n1:0:a.png]@ref[n2:1:b.png]连续紧邻Token',
    '前置文字 @ref[n1:0:test.jpg]',
    '',
  ];

  for (const md of cases) {
    const segments = parseMarkdownToTokenSegments(md);
    const serialized = serializeSegmentsToMarkdown(segments);
    assert.equal(serialized, md, `Round-trip failed for: ${md}`);
  }
});

test('3. Token 切片结构正确性与 slotState 上下文注入', () => {
  const mockSlotState = {
    modelId: 'seedance-v1',
    operationId: 'image-to-video',
    capacity: 2,
    activeSlots: [
      {
        slotId: 'slot_0',
        slotIndex: 0,
        sourceNodeId: 'node_hero',
        materialType: 'image',
        mediaUrl: 'https://example.com/hero.png',
        label: 'Hero Avatar',
      },
      {
        slotId: 'slot_1',
        slotIndex: 1,
        sourceNodeId: 'node_bg',
        materialType: 'video',
        mediaUrl: 'https://example.com/bg.mp4',
        label: 'Background Clip',
      },
    ],
    overflowPool: [
      {
        sourceNodeId: 'node_overflow',
        materialType: 'audio',
        mediaUrl: 'https://example.com/bgm.mp3',
        label: 'Theme Song',
        addedAt: Date.now(),
      },
    ],
  };

  const md = '镜头由 @ref[node_hero:0:hero.png] 转向 @ref[node_bg:1:bg.mp4]，伴随 @ref[node_overflow:2:song.mp3] 音效';
  const segments = parseMarkdownToTokenSegments(md, mockSlotState);

  assert.equal(segments.length, 7);
  assert.equal(segments[0].type, 'text');
  assert.equal(segments[0].text, '镜头由 ');

  assert.equal(segments[1].type, 'token');
  if (segments[1].type === 'token') {
    assert.equal(segments[1].token.nodeId, 'node_hero');
    assert.equal(segments[1].token.slotIndex, 0);
    assert.equal(segments[1].token.materialType, 'image');
    assert.equal(segments[1].token.mediaUrl, 'https://example.com/hero.png');
  }

  assert.equal(segments[3].type, 'token');
  if (segments[3].type === 'token') {
    assert.equal(segments[3].token.nodeId, 'node_bg');
    assert.equal(segments[3].token.slotIndex, 1);
    assert.equal(segments[3].token.materialType, 'video');
  }

  assert.equal(segments[5].type, 'token');
  if (segments[5].type === 'token') {
    assert.equal(segments[5].token.nodeId, 'node_overflow');
    assert.equal(segments[5].token.materialType, 'audio');
  }
});

test('4. calculatePromptVisualLength：视觉字数统计与底层长 ID 隔离', () => {
  const md = '镜头前：@ref[node_abc_123456789:0:character_main.png] 微笑。';
  // '镜头前：' = 4 字符
  // '@ref[node_abc_123456789:0:character_main.png]' 底层长度 = 45 字符
  // ' 微笑。' = 4 字符
  // 总底层字符 = 4 + 45 + 4 = 53
  // 视觉字符（Token 计为 1） = 4 + 1 + 4 = 9

  const stats = calculatePromptVisualLength(md);
  assert.equal(stats.rawLength, md.length);
  assert.equal(stats.tokenCount, 1);
  assert.equal(stats.visualLength, 9);
  assert.ok(stats.visualLength < stats.rawLength);

  // 指定按 Label 长度计数
  const labelStats = calculatePromptVisualLength(md, { countTokenAs: 'label' });
  assert.equal(labelStats.visualLength, 4 + 'character_main.png'.length + 4);

  // 空串
  const emptyStats = calculatePromptVisualLength('');
  assert.equal(emptyStats.visualLength, 0);
  assert.equal(emptyStats.rawLength, 0);
  assert.equal(emptyStats.tokenCount, 0);
});

test('5. extractPromptTokens：准确抽取所有引用 Token', () => {
  const md = '特写 @ref[node_1:0:pic1.png] 与 @ref[node_2:1:pic2.jpg]';
  const tokens = extractPromptTokens(md);

  assert.equal(tokens.length, 2);
  assert.equal(tokens[0].nodeId, 'node_1');
  assert.equal(tokens[0].slotIndex, 0);
  assert.equal(tokens[0].label, 'pic1.png');
  assert.equal(tokens[0].materialType, 'image');

  assert.equal(tokens[1].nodeId, 'node_2');
  assert.equal(tokens[1].slotIndex, 1);
  assert.equal(tokens[1].label, 'pic2.jpg');
});
