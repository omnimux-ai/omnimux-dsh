import test from 'node:test';
import assert from 'node:assert/strict';
import { useTableStore } from './tableStore.ts';

test('tableStore: columnId-based cell mutations, row operations and undo/redo', () => {
  // 1. 初始化包含字典 cells 的文档
  useTableStore.setState({
    document: {
      version: 1,
      title: '测试表格',
      rowHeight: 'low',
      columns: [
        { id: 'col_name', title: '姓名', type: 'text', visible: true, width: 200 },
        { id: 'col_age', title: '年龄', type: 'number', visible: true, width: 100 },
      ],
      rows: [
        { id: 'row_1', cells: { col_name: 'Alice', col_age: 20 } },
        { id: 'row_2', cells: { col_name: 'Bob', col_age: 25 } },
        { id: 'row_3', cells: { col_name: 'Charlie', col_age: 30 } },
      ],
    },
    selectedRowIndices: [],
    undoStack: [],
    redoStack: [],
  });

  // 2. updateCell via columnId
  useTableStore.getState().updateCell(0, 'col_name', 'Alice In Wonderland');
  assert.equal(useTableStore.getState().document.rows[0].cells['col_name'], 'Alice In Wonderland');

  // 3. 列重排测试：调换列顺序，行数据字典不受影响
  useTableStore.getState().reorderColumns(0, 1);
  const colsAfterReorder = useTableStore.getState().document.columns;
  assert.equal(colsAfterReorder[0].id, 'col_age');
  assert.equal(colsAfterReorder[1].id, 'col_name');
  assert.equal(useTableStore.getState().document.rows[0].cells['col_name'], 'Alice In Wonderland');
  assert.equal(useTableStore.getState().document.rows[0].cells['col_age'], 20);

  // 4. 新增列测试
  useTableStore.getState().addColumn('角色', 'text');
  const colsAfterAdd = useTableStore.getState().document.columns;
  assert.equal(colsAfterAdd.length, 3);
  const newColId = colsAfterAdd[2].id;
  useTableStore.getState().updateCell(0, newColId, '主角');
  assert.equal(useTableStore.getState().document.rows[0].cells[newColId], '主角');

  // 5. 增行与删行
  useTableStore.getState().addRow({ col_name: 'David', col_age: 28 });
  const rowsAfterAdd = useTableStore.getState().document.rows;
  assert.equal(rowsAfterAdd.length, 4);
  assert.equal(rowsAfterAdd[3].cells['col_name'], 'David');

  // 6. 批量删除选中的行
  useTableStore.getState().setRowSelection([1, 3]);
  useTableStore.getState().deleteSelectedRows();
  const rowsAfterDelete = useTableStore.getState().document.rows;
  assert.equal(rowsAfterDelete.length, 2);
  assert.equal(rowsAfterDelete[0].cells['col_name'], 'Alice In Wonderland');
  assert.equal(rowsAfterDelete[1].cells['col_name'], 'Charlie');

  // 7. Undo / Redo
  assert.equal(useTableStore.getState().canUndo(), true);
  useTableStore.getState().undo();
  assert.equal(useTableStore.getState().document.rows.length, 4);
  useTableStore.getState().redo();
  assert.equal(useTableStore.getState().document.rows.length, 2);
});

test('tableStore: openStage 对 0 列文档自动补全默认「文本」列', () => {
  // 1. 以文档对象形式打开：columns 为空数组
  useTableStore.getState().openStage({
    version: 1,
    title: '空列表格',
    columns: [],
    rows: [],
  });
  let doc = useTableStore.getState().document;
  assert.equal(doc.columns.length, 1, '0 列文档打开舞台时必须补全默认列');
  assert.equal(doc.columns[0].title, '文本');
  assert.equal(doc.columns[0].type, 'text');
  assert.equal(doc.columns[0].visible, true);
  assert.ok(doc.columns[0].width >= 220 && doc.columns[0].width <= 280, '默认列宽度应在 220~280 区间');

  // 2. 以 tableId + initialDoc 形式打开：initialDoc 缺少 columns 字段
  useTableStore.getState().openStage('tbl_no_columns', { title: '缺列文档', rows: [] });
  doc = useTableStore.getState().document;
  assert.equal(doc.columns.length, 1);
  assert.equal(doc.columns[0].title, '文本');
  assert.equal(doc.columns[0].type, 'text');

  // 3. 无任何入参打开：获得默认初始文档（含默认「文本」列与「未命名表格」标题）
  useTableStore.getState().openStage();
  doc = useTableStore.getState().document;
  assert.equal(doc.columns.length, 1);
  assert.equal(doc.columns[0].title, '文本');
  assert.equal(doc.title, '未命名表格');

  // 4. 补全后的默认列可以直接接收「+ 添加行」写入
  useTableStore.getState().addRow();
  useTableStore.getState().updateCell(0, doc.columns[0].id, '首行内容');
  assert.equal(useTableStore.getState().document.rows[0].cells[doc.columns[0].id], '首行内容');

  // 5. 关闭舞台，避免影响其他测试
  useTableStore.getState().closeStage();
});

test('tableStore: closeStage 防空冲刷保护（未发生显式删行时禁止以空数据冲刷画布）', async () => {
  const { registerTableCanvasSyncHandler } = await import('./tableStore.ts');

  // 1. 注册同步监听器
  let syncCallCount = 0;
  let lastSyncPayload = null;
  const unregister = registerTableCanvasSyncHandler((id, doc) => {
    syncCallCount += 1;
    lastSyncPayload = { id, doc };
  });

  // 2. 模拟场景 A：打开前画布/初始文档有 2 行数据，舞台异常以 0 行空文档呈现，且无显式删行
  useTableStore.getState().openStage('tbl_anti_wash', {
    version: 1,
    title: '防冲刷表格',
    columns: [{ id: 'col1', title: '内容', type: 'text', visible: true }],
    rows: [
      { id: 'r1', cells: { col1: '行 1' } },
      { id: 'r2', cells: { col1: '行 2' } },
    ],
  });

  assert.equal(useTableStore.getState().initialRowCount, 2);
  assert.equal(useTableStore.getState().hasExplicitDeleteRow, false);

  // 人为将舞台 document 改为 0 行模拟加载空态
  useTableStore.setState({
    document: {
      version: 1,
      title: '防冲刷表格',
      columns: [{ id: 'col1', title: '内容', type: 'text', visible: true }],
      rows: [],
    },
  });

  const countBeforeClose = syncCallCount;
  // 关闭舞台：触发防空冲刷保护，禁止覆盖画布
  useTableStore.getState().closeStage();
  assert.equal(syncCallCount, countBeforeClose, '防空冲刷保护触发：禁止向画布同步 0 行空文档');

  // 3. 模拟场景 B：用户在舞台中执行了显式的删行操作（deleteRow / deleteSelectedRows）
  useTableStore.getState().openStage('tbl_legit_delete', {
    version: 1,
    title: '合法删除表格',
    columns: [{ id: 'col1', title: '内容', type: 'text', visible: true }],
    rows: [{ id: 'r1', cells: { col1: '行 1' } }],
  });
  assert.equal(useTableStore.getState().initialRowCount, 1);
  assert.equal(useTableStore.getState().hasExplicitDeleteRow, false);

  // 用户点击删行
  useTableStore.getState().deleteRow(0);
  assert.equal(useTableStore.getState().hasExplicitDeleteRow, true);
  assert.equal(useTableStore.getState().document.rows.length, 0);

  const countBeforeLegitClose = syncCallCount;
  useTableStore.getState().closeStage();
  assert.equal(syncCallCount, countBeforeLegitClose + 1, '显式删行后应允许正常同步到画布');
  unregister();
});

test('formatRowPreview & formatTablePreviewRows: 富有信息量的代表列提取与序号拼合', async () => {
  const { formatRowPreview, formatTablePreviewRows } = await import('../../shared/types/htable.ts');

  // 1. 分镜表典型结构：第 1 列是数字序号（如 1、2、3），第 2 列是画面描述
  const storyboardDoc = {
    version: 1,
    title: '分镜表',
    columns: [
      { id: 'c_seq', title: '镜号', type: 'text', visible: true },
      { id: 'c_desc', title: '画面描述', type: 'text', visible: true },
      { id: 'c_action', title: '角色动作', type: 'text', visible: true },
    ],
    rows: [
      { id: 'r1', cells: { c_seq: '1', c_desc: '主角在暴雨中快步奔跑', c_action: '奔跑' } },
      { id: 'r2', cells: { c_seq: 2, c_desc: '特写主角坚毅的眼神', c_action: '特写' } },
      { id: 'r3', cells: { c_seq: '第3镜', c_desc: '远景雷电划破长空', c_action: '远景' } },
    ],
  };

  const previewRows = formatTablePreviewRows(storyboardDoc);
  assert.equal(previewRows.length, 3);
  assert.equal(previewRows[0], '第 1 镜: 主角在暴雨中快步奔跑');
  assert.equal(previewRows[1], '第 2 镜: 特写主角坚毅的眼神');
  assert.equal(previewRows[2], '第3镜: 远景雷电划破长空');

  // 2. 纯单列表格
  const singleColDoc = {
    version: 1,
    title: '单列表格',
    columns: [{ id: 'col1', title: '文本', type: 'text', visible: true }],
    rows: [
      { id: 'r1', cells: { col1: '普通记录内容' } },
      { id: 'r2', cells: { col1: '' } },
    ],
  };
  const singlePreviews = formatTablePreviewRows(singleColDoc);
  assert.equal(singlePreviews[0], '普通记录内容');
  assert.equal(singlePreviews[1], '（空记录）');

  // 3. 维度分析表（分析维度 + 分析内容）
  const analysisDoc = {
    version: 1,
    title: '分析表',
    columns: [
      { id: 'c1', title: '分析维度', type: 'text', visible: true },
      { id: 'c2', title: '分析内容', type: 'text', visible: true },
    ],
    rows: [
      { id: 'r1', cells: { c1: '开篇黄金3秒', c2: '以强烈反差冲突抓住眼球' } },
    ],
  };
  const analysisPreviews = formatTablePreviewRows(analysisDoc);
  assert.equal(analysisPreviews[0], '以强烈反差冲突抓住眼球');
});
