import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readNodeInputSource } from './nodeInputSource.ts';
import { buildUiUpstreamFingerprint } from '../validation/operationUi.ts';

test('end-to-end table upstream text projection into downstream text generation prompt', () => {
  // 1. 模拟上游表格节点（含 3 行分镜数据）
  const tableNode = {
    id: 'tbl_tiktok_shots',
    type: 'table',
    data: {
      title: 'TikTok 分镜脚本表 - TinyR',
      document: {
        title: 'TikTok 分镜脚本表 - TinyR',
        columns: [
          { id: 'col_seq', title: '镜号', type: 'text', visible: true },
          { id: 'col_action', title: '画面动作设计', type: 'text', visible: true },
          { id: 'col_note', title: '备注', type: 'text', visible: true },
        ],
        rows: [
          {
            id: 'r1',
            cells: {
              col_seq: '第 01 镜',
              col_action: '客厅法兰绒毛毯被快速掀开，露出棕色迷宫猫窝',
              col_note: '#1',
            },
          },
          {
            id: 'r2',
            cells: {
              col_seq: '第 02 镜',
              col_action: '阳光草坪上1.5岁宝宝套着公牛骑行服狂奔',
              col_note: '#2',
            },
          },
          {
            id: 'r3',
            cells: {
              col_seq: '第 03 镜',
              col_action: '双手展示亲肤短绒面料与流苏双重缝线',
              col_note: '#3',
            },
          },
        ],
      },
    },
  };

  // 2. 获取上游输入源
  const tableSource = readNodeInputSource(tableNode);
  assert.equal(tableSource.availability, 'ready');
  assert.equal(typeof tableSource.output.text, 'string');
  assert.match(tableSource.output.text, /### 表格：TikTok 分镜脚本表 - TinyR/);
  assert.match(tableSource.output.text, /\| 镜号 \| 画面动作设计 \| 备注 \|/);

  // 3. 模拟下游文本节点接入该表格作为上游
  const upstreamSnapshot = {
    nodeId: tableNode.id,
    label: tableNode.data.title,
    availability: tableSource.availability,
    materialType: 'table',
    textContent: tableSource.output.text,
  };

  // 场景 A：下游用户没有输入额外提示词，大模型直接获得上游 Markdown 表格作为唯一上下文
  const fpOnlyTable = buildUiUpstreamFingerprint({
    materialType: 'text',
    prompt: '',
    upstreams: [upstreamSnapshot],
  });
  assert.equal(fpOnlyTable.prompt, tableSource.output.text);

  // 场景 B：下游用户输入了针对分镜的提示词（例如“根据以上分镜生成解说文案”）
  const userInstruction = '根据以上分镜，为每一镜生成对应的中英文旁白解说文案';
  const fpWithInstruction = buildUiUpstreamFingerprint({
    materialType: 'text',
    prompt: userInstruction,
    upstreams: [upstreamSnapshot],
  });

  assert.match(fpWithInstruction.prompt, /来源 1：\n### 表格：TikTok 分镜脚本表 - TinyR/);
  assert.match(fpWithInstruction.prompt, /\| 第 01 镜 \| 客厅法兰绒毛毯被快速掀开，露出棕色迷宫猫窝 \| #1 \|/);
  assert.match(fpWithInstruction.prompt, /补充要求：\n根据以上分镜，为每一镜生成对应的中英文旁白解说文案/);
});
