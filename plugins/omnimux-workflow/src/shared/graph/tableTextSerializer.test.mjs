import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  serializeTableToMarkdown,
  serializePreviewRowsToText,
  serializeTableNodeToText,
} from './tableTextSerializer.ts';

test('serializeTableToMarkdown converts HTableDocument to standard Markdown table', () => {
  const doc = {
    title: 'TikTok 分镜脚本表',
    columns: [
      { id: 'col_seq', title: '镜号', type: 'text', visible: true },
      { id: 'col_action', title: '画面动作设计', type: 'text', visible: true },
      { id: 'col_note', title: '备注', type: 'text', visible: true },
      { id: 'col_hidden', title: '隐藏字段', type: 'text', visible: false },
    ],
    rows: [
      {
        id: 'row_1',
        cells: {
          col_seq: '第 01 镜',
          col_action: '客厅法兰绒毛毯被快速掀开，露出棕色迷宫猫窝',
          col_note: '#1',
          col_hidden: 'secret',
        },
      },
      {
        id: 'row_2',
        cells: {
          col_seq: '第 02 镜',
          col_action: '阳光草坪上1.5岁宝宝套着公牛骑行服狂奔\n特写小短腿',
          col_note: '#2 | 特写',
          col_hidden: 'secret',
        },
      },
    ],
  };

  const md = serializeTableToMarkdown(doc);
  assert.match(md, /### 表格：TikTok 分镜脚本表/);
  assert.match(md, /\| 镜号 \| 画面动作设计 \| 备注 \|/);
  assert.match(md, /\| --- \| --- \| --- \|/);
  assert.match(md, /\| 第 01 镜 \| 客厅法兰绒毛毯被快速掀开，露出棕色迷宫猫窝 \| #1 \|/);
  // 验证换行符被转义为空格，管道符被转义为 \|，且隐藏列未被输出
  assert.match(md, /阳光草坪上1\.5岁宝宝套着公牛骑行服狂奔 特写小短腿/);
  assert.match(md, /#2 \\\| 特写/);
  assert.doesNotMatch(md, /隐藏字段/);
  assert.doesNotMatch(md, /secret/);
});

test('serializeTableToMarkdown handles attachments, numbers and null values', () => {
  const doc = {
    title: '多模态表',
    columns: [
      { id: 'c1', title: '名称', type: 'text' },
      { id: 'c2', title: '数量', type: 'number' },
      { id: 'c3', title: '图片素材', type: 'attachment' },
    ],
    rows: [
      {
        id: 'r1',
        cells: {
          c1: '道具 A',
          c2: 42,
          c3: [{ assetId: 'a1', name: 'photo.png', kind: 'image' }],
        },
      },
      {
        id: 'r2',
        cells: {
          c1: '道具 B',
          c2: null,
          c3: [],
        },
      },
    ],
  };

  const md = serializeTableToMarkdown(doc, { tableOnly: true });
  assert.doesNotMatch(md, /### 表格：/);
  assert.match(md, /\| 道具 A \| 42 \| \[附件: photo\.png\] \|/);
  assert.match(md, /\| 道具 B \|  \|  \|/);
});

test('serializeTableToMarkdown truncates rows over maxRows', () => {
  const doc = {
    columns: [{ id: 'col', title: 'ID' }],
    rows: Array.from({ length: 15 }, (_, i) => ({ id: `r${i}`, cells: { col: i + 1 } })),
  };

  const md = serializeTableToMarkdown(doc, { maxRows: 5 });
  assert.match(md, /\*\(已截断，仅展示前 5 行，共 15 行\)\*/);
});

test('serializePreviewRowsToText formats string lists gracefully', () => {
  const preview = [
    '第 01 镜：客厅法兰绒毛毯被快速掀开，露出棕色迷... #1',
    '第 02 镜：阳光草坪上1.5岁宝宝套着公牛骑行服狂... #2',
  ];
  const text = serializePreviewRowsToText(preview, 'TikTok 分镜脚本表');
  assert.equal(
    text,
    `### 表格：TikTok 分镜脚本表\n- 第 01 镜：客厅法兰绒毛毯被快速掀开，露出棕色迷... #1\n- 第 02 镜：阳光草坪上1.5岁宝宝套着公牛骑行服狂... #2`,
  );
});

test('serializeTableNodeToText priority: doc > previewRows > empty', () => {
  const fromDoc = serializeTableNodeToText(
    { label: '节点标题', previewRows: ['降级行'] },
    { columns: [{ id: 'c', title: 'C' }], rows: [{ id: 'r', cells: { c: '高精度值' } }] },
  );
  assert.match(fromDoc, /高精度值/);
  assert.doesNotMatch(fromDoc, /降级行/);

  const fromPreview = serializeTableNodeToText({ label: '节点标题', previewRows: ['仅降级行'] });
  assert.match(fromPreview, /仅降级行/);

  const empty = serializeTableNodeToText({ label: '空节点', rowCount: 0 });
  assert.equal(empty, '');
});
