/**
 * planSpeechToTextDownstream 纯函数单测（Issue 744 T02）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STT_DOWNSTREAM_GAP,
  planSpeechToTextDownstream,
} from './planSpeechToTextDownstream.ts';

const AUDIO = {
  id: 'audio_1',
  type: 'material',
  position: { x: 100, y: 200 },
  data: { materialType: 'audio', label: '旁白' },
};

function baseInput(overrides = {}) {
  return {
    audioNodeId: AUDIO.id,
    audioPosition: AUDIO.position,
    audioNodeWidth: 350,
    srtText: '1\n00:00:01,000 --> 00:00:02,000\n你好\n',
    label: '字幕',
    currentNodes: [AUDIO],
    currentEdges: [],
    ...overrides,
  };
}

test('无下游节点：右侧创建 import 文本节点并连线（硬性数据约束全量断言）', () => {
  const plan = planSpeechToTextDownstream(baseInput({ createNodeId: () => 'srt_new' }));
  assert.equal(plan.mode, 'create');
  assert.equal(plan.targetNodeId, 'srt_new');
  assert.equal(plan.addNodes.length, 1);
  const node = plan.addNodes[0];
  assert.equal(node.type, 'material');
  // 右侧偏移 nodeWidth + 120，纵向对齐
  assert.deepEqual(node.position, { x: 100 + 350 + STT_DOWNSTREAM_GAP, y: 200 });
  assert.equal(STT_DOWNSTREAM_GAP, 120);
  assert.equal(node.selected, true);
  assert.deepEqual(node.data, {
    materialType: 'text',
    selectedTool: 'text-editor',
    nodeKind: 'import',
    contentFormat: 'srt',
    origin: 'speech_to_text',
    sourceAudioNodeId: 'audio_1',
    label: '字幕',
    status: 'ready',
    content: plan.addNodes[0].data.content,
    params: {},
  });
  assert.equal(plan.nodePatches.length, 0);
  assert.deepEqual(plan.addEdges, [
    {
      id: 'edge_audio_1_srt_new',
      source: 'audio_1',
      target: 'srt_new',
      sourceHandle: 'out',
      targetHandle: 'in',
    },
  ]);
});

test('已有连线 speech_to_text 节点：仅就地更新 content，不产生新节点', () => {
  const srtNode = {
    id: 'srt_old',
    type: 'material',
    position: { x: 570, y: 200 },
    data: {
      materialType: 'text',
      origin: 'speech_to_text',
      contentFormat: 'srt',
      content: '旧内容',
    },
  };
  const edge = {
    id: 'edge_audio_1_srt_old',
    source: 'audio_1',
    target: 'srt_old',
    sourceHandle: 'out',
    targetHandle: 'in',
  };
  const plan = planSpeechToTextDownstream(baseInput({
    currentNodes: [AUDIO, srtNode],
    currentEdges: [edge],
    srtText: '新 SRT',
  }));
  assert.equal(plan.mode, 'update');
  assert.equal(plan.targetNodeId, 'srt_old');
  assert.equal(plan.addNodes.length, 0);
  assert.equal(plan.addEdges.length, 0);
  assert.deepEqual(plan.nodePatches, [
    {
      nodeId: 'srt_old',
      data: {
        content: '新 SRT',
        status: 'ready',
        contentFormat: 'srt',
        origin: 'speech_to_text',
        sourceAudioNodeId: 'audio_1',
      },
    },
  ]);
});

test('已有关联记录但连线缺失：更新内容并补线', () => {
  const srtNode = {
    id: 'srt_orphan',
    type: 'material',
    position: { x: 570, y: 200 },
    data: {
      materialType: 'text',
      origin: 'speech_to_text',
      sourceAudioNodeId: 'audio_1',
      content: '旧内容',
    },
  };
  const plan = planSpeechToTextDownstream(baseInput({
    currentNodes: [AUDIO, srtNode],
    currentEdges: [],
  }));
  assert.equal(plan.mode, 'update');
  assert.deepEqual(plan.addEdges, [
    {
      id: 'edge_audio_1_srt_orphan',
      source: 'audio_1',
      target: 'srt_orphan',
      sourceHandle: 'out',
      targetHandle: 'in',
    },
  ]);
});

test('其他音频节点的字幕节点不被误更新', () => {
  const otherSrt = {
    id: 'srt_other',
    type: 'material',
    position: { x: 0, y: 0 },
    data: {
      materialType: 'text',
      origin: 'speech_to_text',
      sourceAudioNodeId: 'audio_2',
      content: '别人的',
    },
  };
  const plan = planSpeechToTextDownstream(baseInput({
    currentNodes: [AUDIO, otherSrt],
    currentEdges: [
      { id: 'e1', source: 'audio_2', target: 'srt_other', sourceHandle: 'out', targetHandle: 'in' },
    ],
    createNodeId: () => 'srt_mine',
  }));
  assert.equal(plan.mode, 'create');
  assert.equal(plan.targetNodeId, 'srt_mine');
});

test('普通文本下游节点不被误判为字幕节点', () => {
  const plainText = {
    id: 'text_1',
    type: 'material',
    position: { x: 570, y: 200 },
    data: { materialType: 'text', content: '普通剧本' },
  };
  const plan = planSpeechToTextDownstream(baseInput({
    currentNodes: [AUDIO, plainText],
    currentEdges: [
      { id: 'e1', source: 'audio_1', target: 'text_1', sourceHandle: 'out', targetHandle: 'in' },
    ],
    createNodeId: () => 'srt_new',
  }));
  assert.equal(plan.mode, 'create');
});

test('空输入守卫：空 SRT / 空节点 id 返回 null', () => {
  assert.equal(planSpeechToTextDownstream(baseInput({ srtText: '  ' })), null);
  assert.equal(planSpeechToTextDownstream(baseInput({ audioNodeId: '' })), null);
});

test('异常宽度回退 350，label 缺省为「字幕」', () => {
  const plan = planSpeechToTextDownstream(baseInput({
    audioNodeWidth: NaN,
    label: undefined,
    createNodeId: () => 'srt_new',
  }));
  assert.deepEqual(plan.addNodes[0].position, { x: 100 + 350 + 120, y: 200 });
  assert.equal(plan.addNodes[0].data.label, '字幕');
});
