import test from 'node:test';
import assert from 'node:assert/strict';
import { useTableStore } from '../../../store/tableStore.ts';

test('VirtualDataGrid logic: selection state calculations and toggle', () => {
  useTableStore.setState({
    document: {
      version: 1,
      title: '表格',
      rowHeight: 'low',
      columns: [
        { id: 'c1', title: '姓名', type: 'text', visible: true, width: 200 },
        { id: 'c2', title: '职业', type: 'text', visible: true, width: 200 },
      ],
      rows: [
        { id: 'r1', cells: { c1: 'Alice', c2: 'Designer' } },
        { id: 'r2', cells: { c1: 'Bob', c2: 'Developer' } },
        { id: 'r3', cells: { c1: 'Charlie', c2: 'Manager' } },
      ],
    },
    selectedRowIndices: [],
    undoStack: [],
    redoStack: [],
  });

  const state = useTableStore.getState();
  const totalRows = state.document.rows.length;

  // 1. 初始未选中
  assert.equal(state.selectedRowIndices.length, 0);
  let isAllSelected = totalRows > 0 && state.selectedRowIndices.length === totalRows;
  let isIndeterminate = state.selectedRowIndices.length > 0 && state.selectedRowIndices.length < totalRows;
  assert.equal(isAllSelected, false);
  assert.equal(isIndeterminate, false);

  // 2. 选中单行 -> 半选 (indeterminate)
  useTableStore.getState().toggleRowSelection(0);
  let currentSelection = useTableStore.getState().selectedRowIndices;
  assert.deepEqual(currentSelection, [0]);
  isAllSelected = totalRows > 0 && currentSelection.length === totalRows;
  isIndeterminate = currentSelection.length > 0 && currentSelection.length < totalRows;
  assert.equal(isAllSelected, false);
  assert.equal(isIndeterminate, true);

  // 3. 全选
  useTableStore.getState().selectAllRows();
  currentSelection = useTableStore.getState().selectedRowIndices;
  assert.deepEqual(currentSelection, [0, 1, 2]);
  isAllSelected = totalRows > 0 && currentSelection.length === totalRows;
  isIndeterminate = currentSelection.length > 0 && currentSelection.length < totalRows;
  assert.equal(isAllSelected, true);
  assert.equal(isIndeterminate, false);

  // 4. 清空全选
  useTableStore.getState().clearRowSelection();
  currentSelection = useTableStore.getState().selectedRowIndices;
  assert.deepEqual(currentSelection, []);
  isAllSelected = totalRows > 0 && currentSelection.length === totalRows;
  isIndeterminate = currentSelection.length > 0 && currentSelection.length < totalRows;
  assert.equal(isAllSelected, false);
  assert.equal(isIndeterminate, false);
});

test('VirtualDataGrid drag calculation logic', () => {
  useTableStore.setState({
    document: {
      version: 1,
      title: '表格',
      rowHeight: 'low',
      columns: [{ id: 'c1', title: '项', type: 'text', visible: true, width: 200 }],
      rows: [
        { id: 'r0', cells: { c1: 'Item 0' } },
        { id: 'r1', cells: { c1: 'Item 1' } },
        { id: 'r2', cells: { c1: 'Item 2' } },
        { id: 'r3', cells: { c1: 'Item 3' } },
      ],
    },
    selectedRowIndices: [],
    undoStack: [],
    redoStack: [],
  });

  // 模拟从 0 拖到 2，dropPosition 为 'bottom' -> target 插入在 2 之后 (index 2)
  const dragged = 0;
  const target = 2;
  const pos = 'bottom';
  let insertIdx = pos === 'bottom' ? target + 1 : target;
  if (dragged < insertIdx) insertIdx -= 1;

  useTableStore.getState().reorderRows(dragged, insertIdx);
  const rows = useTableStore.getState().document.rows.map((r) => r.cells['c1']);
  assert.deepEqual(rows, ['Item 1', 'Item 2', 'Item 0', 'Item 3']);
});

test('VirtualDataGrid attachment cell logic: append and remove attachments', () => {
  useTableStore.setState({
    document: {
      version: 1,
      title: '分镜表',
      rowHeight: 'low',
      columns: [
        { id: 'c1', title: '镜号', type: 'text', visible: true, width: 80 },
        { id: 'c2', title: '图片', type: 'attachment', visible: true, width: 220 },
      ],
      rows: [
        {
          id: 'r1',
          cells: {
            c1: '1',
            c2: [
              {
                assetId: 'img-dog-1',
                name: 'golden-retriever.jpg',
                kind: 'image',
                thumbnailUrl: 'https://example.com/dog.jpg',
                url: 'https://example.com/dog.jpg',
              },
            ],
          },
        },
      ],
    },
    selectedRowIndices: [],
    undoStack: [],
    redoStack: [],
  });

  const state = useTableStore.getState();
  const initialRow = state.document.rows[0];
  const initialAttachments = initialRow.cells['c2'];
  assert.ok(Array.isArray(initialAttachments));
  assert.equal(initialAttachments.length, 1);
  assert.equal(initialAttachments[0].name, 'golden-retriever.jpg');

  // 1. 模拟扩充：点击加号调出添加资源窗口后提交新资源
  const newAttachment = {
    assetId: 'img-dog-2',
    name: 'golden-retriever-2.jpg',
    kind: 'image',
    thumbnailUrl: 'https://example.com/dog2.jpg',
    url: 'https://example.com/dog2.jpg',
  };
  const expandedList = [...initialAttachments, newAttachment];
  useTableStore.getState().updateCell(0, 'c2', expandedList);

  const updatedDoc = useTableStore.getState().document;
  const updatedAttachments = updatedDoc.rows[0].cells['c2'];
  assert.equal(updatedAttachments.length, 2);
  assert.equal(updatedAttachments[1].name, 'golden-retriever-2.jpg');

  // 2. 模拟删除第一个缩略图
  const afterRemoveList = updatedAttachments.filter((_, idx) => idx !== 0);
  useTableStore.getState().updateCell(0, 'c2', afterRemoveList);

  const finalDoc = useTableStore.getState().document;
  const finalAttachments = finalDoc.rows[0].cells['c2'];
  assert.equal(finalAttachments.length, 1);
  assert.equal(finalAttachments[0].name, 'golden-retriever-2.jpg');
});
