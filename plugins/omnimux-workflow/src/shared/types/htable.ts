import { z } from 'zod';

/** 字段类型定义 */
export const HTableFieldTypeSchema = z.enum(['text', 'number', 'attachment']);
export type HTableFieldType = z.infer<typeof HTableFieldTypeSchema>;

/** 字段列定义 */
export const HTableColumnSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: HTableFieldTypeSchema,
  visible: z.boolean().default(true),
  width: z.number().min(40).max(2000).optional(),
});
export type HTableColumn = z.infer<typeof HTableColumnSchema>;

/** 附件多模态单元格结构 */
export const HTableAttachmentSchema = z.object({
  assetId: z.string(),
  name: z.string(),
  kind: z.enum(['image', 'video', 'audio', 'text']),
  thumbnailUrl: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().optional(),
  path: z.string().optional(),
  url: z.string().optional(),
});
export type HTableAttachment = z.infer<typeof HTableAttachmentSchema>;

/** 单元格值类型 */
export const HTableCellValueSchema = z.union([
  z.string(),
  z.number(),
  z.array(HTableAttachmentSchema),
  z.null(),
]);
export type HTableCellValue = z.infer<typeof HTableCellValueSchema>;

/** 单元格物理字典：columnId -> HTableCellValue */
export const HTableCellMapSchema = z.record(z.string(), HTableCellValueSchema);
export type HTableCellMap = z.infer<typeof HTableCellMapSchema>;

/** 行记录定义（物理存储模型） */
export const HTableRowSchema = z.object({
  id: z.string().min(1),
  cells: HTableCellMapSchema,
  height: z.number().int().min(28).max(600).optional(),
});
export type HTableRow = z.infer<typeof HTableRowSchema>;

/** 筛选匹配操作符 */
export const FilterOperatorSchema = z.enum([
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'gt',
  'gte',
  'lt',
  'lte',
  'empty',
  'notEmpty',
]);
export type FilterOperator = z.infer<typeof FilterOperatorSchema>;

/** 单条筛选条件 (物理存储模型，按 columnId) */
export const HTableFilterConditionSchema = z.object({
  id: z.string().optional(),
  columnId: z.string().min(1),
  op: FilterOperatorSchema,
  value: z.union([z.string(), z.number()]).optional(),
});
export type HTableFilterCondition = z.infer<typeof HTableFilterConditionSchema>;

/** 筛选配置 */
export const HTableFilterSchema = z.object({
  match: z.enum(['all', 'any']).default('all'),
  conditions: z.array(HTableFilterConditionSchema),
});
export type HTableFilter = z.infer<typeof HTableFilterSchema>;

/** 行高预设枚举 */
export const HTableRowHeightSchema = z.enum(['low', 'medium', 'tall', 'extraTall']);
export type HTableRowHeight = z.infer<typeof HTableRowHeightSchema>;

/** 表格主文档 Schema (.htable 物理存储模型) */
export const HTableDocumentSchema = z.object({
  version: z.literal(1),
  contentRev: z.number().int().min(0).optional(),
  title: z.string().default('未命名表格'),
  columns: z.array(HTableColumnSchema),
  rows: z.array(HTableRowSchema),
  filter: HTableFilterSchema.optional(),
  rowHeight: HTableRowHeightSchema.default('low').optional(),
});
export type HTableDocument = z.infer<typeof HTableDocumentSchema>;

// ==========================================
// 辅助 ID 生成器
// ==========================================
export function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function newColumnId(): string {
  return `col_${shortId()}`;
}

export function newRowId(): string {
  return `row_${shortId()}`;
}

export function newConditionId(): string {
  return `cond_${shortId()}`;
}

export function defaultColumnWidth(type: HTableFieldType): number {
  if (type === 'attachment') return 200;
  if (type === 'number') return 120;
  return 240;
}

/** 默认首列：新建节点/空文档兜底使用，保证任何表格文档至少有一列 */
export function createDefaultTextColumn(): HTableColumn {
  return {
    id: newColumnId(),
    title: '文本',
    type: 'text',
    visible: true,
    width: defaultColumnWidth('text'),
  };
}

export function createEmptyTableDocument(defaultColumnTitle = '文本'): HTableDocument {
  return {
    version: 1,
    title: '未命名表格',
    columns: [
      {
        id: newColumnId(),
        title: defaultColumnTitle,
        type: 'text',
        visible: true,
        width: defaultColumnWidth('text'),
      },
    ],
    rows: [],
    rowHeight: 'low',
  };
}

// ==========================================
// 历史老格式与容错迁移器
// ==========================================
export function migrateLegacyTableDocument(raw: unknown): HTableDocument {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid table document: not an object');
  }

  const doc = raw as any;
  if (doc.version !== undefined && doc.version !== 1) {
    throw new Error(`Unsupported table document version: ${doc.version}`);
  }

  // 1. 规范化 columns
  const rawColumns: any[] = Array.isArray(doc.columns) ? doc.columns : [];
  const columns: HTableColumn[] = rawColumns.map((c, idx) => ({
    id: c.id ? String(c.id) : `col_${idx}_${shortId()}`,
    title: (c.title && String(c.title).trim()) || `列 ${idx + 1}`,
    type: (c.type === 'number' || c.type === 'attachment' ? c.type : 'text') as HTableFieldType,
    visible: c.visible !== false,
    width: typeof c.width === 'number' && Number.isFinite(c.width) ? c.width : defaultColumnWidth(c.type || 'text'),
  }));

  // 兜底：新建节点/空文档（columns 缺失）或空表（columns 与 rows 均为空）时，
  // 自动补一列默认「文本」列，保证迁移结果永远不会是 0 列
  if (columns.length === 0 && (doc.columns === undefined || (Array.isArray(doc.rows) ? doc.rows.length : 0) === 0)) {
    columns.push(createDefaultTextColumn());
  }

  // 2. 规范化 rows (支持 cells 为对象字典或旧数组格式)
  const rawRows: any[] = Array.isArray(doc.rows) ? doc.rows : [];
  const rows: HTableRow[] = rawRows.map((r, rowIdx) => {
    const rowId = r.id ? String(r.id) : `row_${rowIdx}_${shortId()}`;
    const cells: Record<string, HTableCellValue> = {};

    if (r.cells && typeof r.cells === 'object' && !Array.isArray(r.cells)) {
      // 已经是对象字典格式
      for (const col of columns) {
        const val = r.cells[col.id];
        if (val !== undefined && val !== null) {
          cells[col.id] = val;
        }
      }
    } else if (Array.isArray(r.cells)) {
      // 兼容旧的数组格式
      r.cells.forEach((val: any, colIdx: number) => {
        const col = columns[colIdx];
        if (col && val !== undefined && val !== null) {
          cells[col.id] = val;
        }
      });
    }

    const row: HTableRow = { id: rowId, cells };
    if (typeof r.height === 'number' && Number.isFinite(r.height)) {
      row.height = Math.max(28, Math.min(600, Math.round(r.height)));
    }
    return row;
  });

  // 3. 规范化 filter
  let filter: HTableFilter | undefined = undefined;
  if (doc.filter && typeof doc.filter === 'object') {
    const conditions: HTableFilterCondition[] = [];
    const rawConds = Array.isArray(doc.filter.conditions) ? doc.filter.conditions : [];
    for (const cond of rawConds) {
      let colId = cond.columnId;
      if (!colId && typeof cond.columnIndex === 'number') {
        const targetCol = columns[cond.columnIndex];
        if (targetCol) colId = targetCol.id;
      }
      if (colId && cond.op) {
        conditions.push({
          id: cond.id || newConditionId(),
          columnId: String(colId),
          op: cond.op,
          value: cond.value,
        });
      }
    }
    if (conditions.length > 0) {
      filter = {
        match: doc.filter.match === 'any' ? 'any' : 'all',
        conditions,
      };
    }
  }

  return {
    version: 1,
    contentRev: typeof doc.contentRev === 'number' ? doc.contentRev : 0,
    title: doc.title ? String(doc.title).trim() || '未命名表格' : '未命名表格',
    columns,
    rows,
    ...(filter ? { filter } : {}),
    // 兼容历史老数据：旧版分镜曾误写入 extraTall（120px 巨型行高），统一收敛回标准默认行高 low (36px)
    rowHeight: doc.rowHeight === 'extraTall' ? 'low' : (doc.rowHeight && ['low', 'medium', 'tall'].includes(doc.rowHeight) ? doc.rowHeight : 'low'),
  };
}

// ==========================================
// LLM 通信模型与双向转换器 (Bi-directional Translation)
// ==========================================

export interface LlmTableColumn {
  title: string;
  type?: HTableFieldType;
  visible?: boolean;
  width?: number;
}

export interface LlmTableRow {
  cells: HTableCellValue[];
}

export interface LlmTableFilterCondition {
  columnIndex: number;
  op: FilterOperator;
  value?: string | number;
}

export interface LlmTableFilter {
  match: 'all' | 'any';
  conditions: LlmTableFilterCondition[];
}

export interface LlmTableContent {
  title?: string;
  columns: LlmTableColumn[];
  rows: LlmTableRow[];
  filter?: LlmTableFilter;
  rowHeight?: HTableRowHeight;
}

/**
 * 物理字典模型 -> LLM 纯净二维数组模型 (脱敏/去除随机 ID，大幅节省 Token)
 */
export function tableDocumentToLlmContent(doc: HTableDocument): LlmTableContent {
  const colIndexById = new Map<string, number>();
  doc.columns.forEach((col, idx) => {
    colIndexById.set(col.id, idx);
  });

  const llmColumns: LlmTableColumn[] = doc.columns.map((col) => ({
    title: col.title,
    type: col.type,
    ...(col.visible === false ? { visible: false } : {}),
    ...(col.width != null ? { width: col.width } : {}),
  }));

  const llmRows: LlmTableRow[] = doc.rows.map((row) => ({
    cells: doc.columns.map((col) => {
      const val = row.cells[col.id];
      if (val === undefined || val === null) return null;
      if (Array.isArray(val)) {
        return val.map((att) => ({
          assetId: att.assetId,
          name: att.name,
          kind: att.kind,
        }));
      }
      return val;
    }),
  }));

  const result: LlmTableContent = {
    title: doc.title,
    columns: llmColumns,
    rows: llmRows,
  };

  if (doc.filter && doc.filter.conditions.length > 0) {
    const validConditions: LlmTableFilterCondition[] = [];
    for (const cond of doc.filter.conditions) {
      const idx = colIndexById.get(cond.columnId);
      if (idx != null) {
        validConditions.push({
          columnIndex: idx,
          op: cond.op,
          ...(cond.value !== undefined ? { value: cond.value } : {}),
        });
      }
    }

    if (validConditions.length > 0) {
      result.filter = {
        match: doc.filter.match,
        conditions: validConditions,
      };
    }
  }

  if (doc.rowHeight) {
    result.rowHeight = doc.rowHeight;
  }

  return result;
}

/**
 * LLM 纯净模型/写入请求 -> 物理存储模型 (自动生成 UUID、字典映射与校验)
 */
export function buildTableDocument(
  input: {
    title?: string;
    contentRev?: number;
    columns?: LlmTableColumn[];
    rows?: LlmTableRow[];
    filter?: LlmTableFilter;
    rowHeight?: HTableRowHeight;
  },
  defaultDoc?: HTableDocument
): HTableDocument {
  const llmColumns = input.columns ?? [];
  if (llmColumns.length === 0 && !defaultDoc) {
    return createEmptyTableDocument(input.title);
  }

  const columns: HTableColumn[] = (llmColumns.length > 0 ? llmColumns : defaultDoc?.columns ?? []).map((col: any) => {
    const out: HTableColumn = {
      id: col.id || newColumnId(),
      title: (col.title && String(col.title).trim()) || 'Untitled',
      type: (col.type === 'number' || col.type === 'attachment' ? col.type : 'text') as HTableFieldType,
      visible: col.visible !== false,
      width: col.width ?? defaultColumnWidth(col.type || 'text'),
    };
    return out;
  });

  const rawRows = input.rows ?? [];
  const rows: HTableRow[] = rawRows.map((row: any) => {
    const cells: Record<string, HTableCellValue> = {};
    const inputCells = Array.isArray(row.cells) ? row.cells : [];

    columns.forEach((col, idx) => {
      const val = idx < inputCells.length ? inputCells[idx] : null;
      if (val === undefined || val === null) return;
      if (Array.isArray(val)) {
        if (col.type !== 'attachment') return;
        cells[col.id] = val;
        return;
      }
      cells[col.id] = val;
    });

    return {
      id: row.id || newRowId(),
      cells,
      ...(typeof row.height === 'number' ? { height: row.height } : {}),
    };
  });

  const doc: HTableDocument = {
    version: 1,
    contentRev: typeof input.contentRev === 'number' ? input.contentRev : defaultDoc?.contentRev ?? 0,
    title: input.title?.trim() || defaultDoc?.title || '未命名表格',
    columns,
    rows,
    rowHeight: input.rowHeight || defaultDoc?.rowHeight || 'low',
  };

  if (input.filter && Array.isArray(input.filter.conditions) && input.filter.conditions.length > 0) {
    const conditions: HTableFilterCondition[] = [];
    for (const cond of input.filter.conditions) {
      const col = columns[cond.columnIndex];
      if (col) {
        conditions.push({
          id: newConditionId(),
          columnId: col.id,
          op: cond.op,
          value: cond.value,
        });
      }
    }

    if (conditions.length > 0) {
      doc.filter = {
        match: input.filter.match === 'any' ? 'any' : 'all',
        conditions,
      };
    }
  }

  return doc;
}

/**
 * 智能提取富有信息量的行预览文本：
 * 1. 如果第 1 列是数字序号/镜号且存在第 2/3/4 列：
 *    优先寻找包含「描述/画面/视觉/动作/脚本/台词/旁白/内容/镜头语言/Prompt」的列，拼合如：第 1 镜: [画面描述/动作]
 *    若未匹配到关键字列，则优先拼合第 2 列有效文本
 * 2. 若第 1 列非数字序号，则智能选择包含「描述/画面/动作/脚本/台词/内容」的代表列
 * 3. 兜底退回第 1 列或首个非空列
 */
export function formatRowPreview(row: HTableRow, columns: HTableColumn[]): string {
  if (!columns || columns.length === 0 || !row || !row.cells) {
    return '（空记录）';
  }

  const firstCol = columns[0];
  const firstVal = firstCol ? row.cells[firstCol.id] : undefined;
  const firstStr = typeof firstVal === 'string' ? firstVal.trim() : typeof firstVal === 'number' ? String(firstVal) : '';

  const descKeywordRegex = /描述|画面|视觉|动作|脚本|台词|旁白|内容|镜头语言|Prompt/i;
  const otherCols = columns.slice(1);
  let representativeCol =
    otherCols.find((col) => col.type !== 'attachment' && descKeywordRegex.test(col.title)) ||
    otherCols.find((col) => descKeywordRegex.test(col.title));
  if (!representativeCol && otherCols.length > 0) {
    representativeCol = otherCols.find((col) => col.type !== 'attachment') || otherCols[0];
  }

  const isSeqTitle = firstCol && /^(?:序号|镜号|镜头|镜头号|分镜号|id|no\.?|#)$/i.test(firstCol.title.trim());
  const isSeqValue = /^\d+$/.test(firstStr) || /^第?\s*\d+\s*(?:镜|条|场|个)?$/i.test(firstStr);
  const isFirstSeq = isSeqTitle || (isSeqValue && columns.length > 1);

  if (isFirstSeq && representativeCol) {
    const descVal = row.cells[representativeCol.id];
    let descText = '';
    if (typeof descVal === 'string') {
      descText = descVal.trim();
    } else if (typeof descVal === 'number') {
      descText = String(descVal);
    } else if (Array.isArray(descVal) && descVal.length > 0) {
      descText = `📎 附件 (${descVal.length})`;
    }

    if (descText) {
      const numMatch = firstStr.match(/\d+/);
      const seqNum = numMatch ? numMatch[0] : firstStr;
      if (firstStr.includes('镜')) {
        return `${firstStr}: ${descText}`;
      }
      return `第 ${seqNum} 镜: ${descText}`;
    }
  }

  if (representativeCol && (!firstStr || isSeqValue)) {
    const descVal = row.cells[representativeCol.id];
    if (typeof descVal === 'string' && descVal.trim()) return descVal.trim();
    if (typeof descVal === 'number') return String(descVal);
  }

  const anyDescCol = columns.find((col) => descKeywordRegex.test(col.title));
  if (anyDescCol) {
    const val = row.cells[anyDescCol.id];
    if (typeof val === 'string' && val.trim()) return val.trim();
    if (typeof val === 'number') return String(val);
  }

  if (typeof firstVal === 'string' && firstVal.trim()) return firstVal.trim();
  if (typeof firstVal === 'number') return String(firstVal);
  if (Array.isArray(firstVal) && firstVal.length > 0) return `📎 附件 (${firstVal.length})`;

  for (const col of columns) {
    const val = row.cells[col.id];
    if (typeof val === 'string' && val.trim()) return val.trim();
    if (typeof val === 'number') return String(val);
    if (Array.isArray(val) && val.length > 0) return `📎 附件 (${val.length})`;
  }

  return '（空记录）';
}

/**
 * 智能提取整个表格的富有信息量的卡片预览行
 */
export function formatTablePreviewRows(doc: HTableDocument, maxCount: number = 3): string[] {
  if (!doc || !doc.rows || doc.rows.length === 0) return [];
  const columns = doc.columns || [];
  return doc.rows.slice(0, maxCount).map((r) => formatRowPreview(r, columns));
}
