import type { WorkflowAgentDeps, AgentToolSpec } from './agentTools.ts';
import { TableStorageService } from '../storage/TableStorageService.ts';
import {
  extractTableIdFromRelPath,
  resolveTableAbsPath,
  resolveTableRelativePath,
  TablePathError,
} from '../storage/tablePath.ts';
import { buildTableDocument, tableDocumentToLlmContent, shortId } from '../../shared/types/htable.ts';
import {
  errorBody, jsonOut, readString, readPosition, defaultNodePosition, withWorkspace,
  resolveTargetWorkspaceId, WORKSPACE_ID_PARAM_DESC,
} from './agentToolShared.ts';
import { mutateWorkspaceGraph } from '../graph/GraphMutator.ts';

function readTableId(nodeId: string | undefined, tablePath: string | undefined): string {
  if (nodeId) resolveTableRelativePath(nodeId);
  const pathId = tablePath ? extractTableIdFromRelPath(tablePath) : undefined;
  if (nodeId && pathId && nodeId !== pathId) {
    throw new TablePathError('invalid-args', 'node_id 与 table_path 指向不同的表格');
  }
  const tableId = nodeId || pathId;
  if (!tableId) throw new TablePathError('invalid-args', 'Either table_path or node_id is required');
  return tableId;
}

export function createCanvasWriteTableNodeTool(deps: WorkflowAgentDeps): AgentToolSpec {
  const { store } = deps;
  return {
    name: 'canvas_write_table_node',
    description:
      '在当前画布工作区中创建或全量覆写结构化数据表节点 (.htable)。\n' +
      '- CREATE 模式 (不传 node_id)：在画布上新建表格节点并落盘，返回创建结果与物理路径；\n' +
      '- REPLACE 模式 (提供 node_id)：全量覆写已有表格节点的 .htable 内容并触发表格热更新。',
    parameters: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: WORKSPACE_ID_PARAM_DESC },
        workspace_name: { type: 'string', description: '无显式 ID 和当前画布时，按唯一工作区名称查找' },
        node_id: { type: 'string', description: '已有节点 ID。提供时执行 REPLACE 全量更新，缺省时执行 CREATE' },
        table_path: { type: 'string', description: '[REPLACE] 可选表格相对路径，必须与 node_id 指向同一表格' },
        title: { type: 'string', description: '表格标题 (如 "短剧分镜表")' },
        columns: {
          type: 'array',
          description: '字段列定义列表',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: '列名' },
              type: { type: 'string', enum: ['text', 'number', 'attachment'], description: '列类型' },
              visible: { type: 'boolean', description: '是否可见' },
              width: { type: 'number', description: '列宽 (px)' },
            },
            required: ['title'],
          },
        },
        rows: {
          type: 'array',
          description: '行数据列表 (每行的 cells 与 columns 下标一一严格对齐)',
          items: {
            type: 'object',
            properties: {
              cells: {
                type: 'array',
                description: '单元格数组。普通列为字符串/数字/null，attachment 列为 [{assetId, name, kind}]',
              },
            },
            required: ['cells'],
          },
        },
        filter: {
          type: 'object',
          description: '可选表格筛选条件',
          properties: {
            match: { type: 'string', enum: ['all', 'any'] },
            conditions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  columnIndex: { type: 'number' },
                  op: { type: 'string' },
                  value: { type: ['string', 'number'] },
                },
                required: ['columnIndex', 'op'],
              },
            },
          },
        },
        row_height: { type: 'string', enum: ['low', 'medium', 'tall', 'extraTall'], description: '行高预设' },
        position: {
          type: 'object',
          description: '[CREATE 专有] 画布坐标位置',
          properties: { x: { type: 'number' }, y: { type: 'number' } },
        },
      },
      required: ['columns', 'rows'],
    },
    output: { schema: { type: 'object' }, render: jsonOut.render },
    async execute(args) {
      const existingNodeId = readString(args, 'node_id');
      const isReplace = Boolean(existingNodeId);
      const nodeId = existingNodeId || `tbl_${shortId()}`;
      const tablePath = readString(args, 'table_path');
      const rawColumns = Array.isArray(args.columns) ? (args.columns as any[]) : [];
      if (isReplace && rawColumns.length === 0) {
        return errorBody('invalid-args', 'Replacing a table requires at least one column in columns');
      }
      try {
        readTableId(nodeId, tablePath);
        if (tablePath && !isReplace) return errorBody('invalid-args', 'table_path requires node_id in REPLACE mode');
      } catch (err) {
        return errorBody('invalid-args', err instanceof Error ? err.message : String(err));
      }
      const target = resolveTargetWorkspaceId(store, args, { getActiveView: deps.getActiveView });
      if ('error' in target) {
        return target.error === 'no-current-workspace'
          ? errorBody('no-current-workspace', '未指定 workspace_id 且未打开任何工作流') : target;
      }
      const { workspaceId } = target;
      return await withWorkspace(store, workspaceId, async (snapshot) => {
        if (isReplace) {
          const node = snapshot.nodes.find((row) => row.id === nodeId);
          if (!node) return errorBody('node-not-found', `node ${nodeId} not found in workspace ${workspaceId}`);
          if (node.type !== 'table') return errorBody('invalid-args', `node ${nodeId} is not a table`);
        }
        try {
          const fullPath = resolveTableAbsPath(store, workspaceId, nodeId);
          const tableRelPath = resolveTableRelativePath(nodeId);
          const saved = await TableStorageService.saveTable(fullPath, buildTableDocument({
            title: readString(args, 'title') || '未命名表格',
            columns: rawColumns,
            rows: Array.isArray(args.rows) ? (args.rows as any[]) : [],
            filter: typeof args.filter === 'object' && args.filter !== null ? (args.filter as any) : undefined,
            rowHeight: (readString(args, 'row_height') as any) || 'low',
          }));
          const doc = saved.document;
          const firstCol = doc.columns[0];
          const previewRows = doc.rows.slice(0, 3).map((row) => {
            const value = firstCol ? row.cells[firstCol.id] : undefined;
            if (typeof value === 'string' && value) return value;
            if (typeof value === 'number') return String(value);
            if (Array.isArray(value) && value.length > 0) return `📎 附件 (${value.length})`;
            return '（空记录）';
          });
          const data = {
            label: doc.title, title: doc.title, tableId: nodeId, tablePath: tableRelPath,
            rowCount: doc.rows.length, columnCount: doc.columns.length,
            contentRev: saved.contentRev, previewRows,
            status: doc.rows.length > 0 ? 'ready' : 'empty',
          };
          const result = mutateWorkspaceGraph(store, workspaceId, isReplace
            ? { nodePatches: [{ nodeId, data }] }
            : { addNodes: [{ id: nodeId, type: 'table', position: readPosition(args) ?? defaultNodePosition(snapshot), data }] });
          if (!result.ok) return errorBody(result.error, result.message);
          return {
            ok: true, nodeId, tablePath: tableRelPath, title: doc.title,
            columnCount: doc.columns.length, rowCount: doc.rows.length,
            contentRev: saved.contentRev, created: !isReplace,
          };
        } catch (err) {
          return errorBody(err instanceof TablePathError ? 'invalid-args' : 'table-save-failed',
            err instanceof Error ? err.message : 'Failed to save table document');
        }
      });
    },
  };
}

export function createCanvasGetTableNodeTool(deps: WorkflowAgentDeps): AgentToolSpec {
  const { store } = deps;
  return {
    name: 'canvas_get_table_node',
    description: '读取画布结构化数据表节点的完整数据内容 (.htable)，返回 LLM 友好的脱敏字段列表与二维行记录数据。',
    parameters: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: WORKSPACE_ID_PARAM_DESC },
        workspace_name: { type: 'string', description: '无显式 ID 和当前画布时，按唯一工作区名称查找' },
        table_path: { type: 'string', description: '表格相对路径 (如 .omnimux/tables/tbl_xxx.htable)' },
        node_id: { type: 'string', description: '表格节点 ID；与 table_path 至少提供一个，同时提供时必须指向同一表格' },
      },
    },
    output: { schema: { type: 'object' }, render: jsonOut.render },
    async execute(args) {
      try {
        const tableId = readTableId(readString(args, 'node_id'), readString(args, 'table_path'));
        const target = resolveTargetWorkspaceId(store, args, { getActiveView: deps.getActiveView });
        if ('error' in target) {
          return target.error === 'no-current-workspace'
            ? errorBody('no-current-workspace', '未指定 workspace_id 且未打开任何工作流') : target;
        }
        const fullPath = resolveTableAbsPath(store, target.workspaceId, tableId, { checkLegacy: true });
        const doc = await TableStorageService.loadTable(fullPath);
        return {
          ok: true,
          tablePath: resolveTableRelativePath(tableId),
          contentRev: doc.contentRev ?? 0,
          tableContent: tableDocumentToLlmContent(doc),
        };
      } catch (err) {
        return errorBody(err instanceof TablePathError ? 'invalid-args' : 'table-read-failed',
          err instanceof Error ? err.message : 'Failed to load table document');
      }
    },
  };
}
