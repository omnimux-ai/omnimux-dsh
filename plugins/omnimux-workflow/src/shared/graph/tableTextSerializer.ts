/**
 * Table Text Serializer — 将表格节点数据转换为下游大模型友好的结构化文本/Markdown 表格。
 */

import type { HTableDocument, HTableColumn, HTableRow } from '../types/htable.ts';

export interface TableSerializeOptions {
  /** 最大包含行数，默认 100 行，防止超出上下文限制 */
  maxRows?: number;
  /** 可选覆盖标题 */
  title?: string;
  /** 是否只输出表体（不带 Markdown 标题头） */
  tableOnly?: boolean;
}

/**
 * 清理单个单元格文本，避免破坏 Markdown 表格单行结构
 */
function sanitizeCellText(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'string') {
    return val
      .replace(/\r?\n/g, ' ')
      .replace(/\|/g, '\\|')
      .trim();
  }
  if (Array.isArray(val)) {
    return val
      .map((item) => {
        if (item && typeof item === 'object' && 'name' in item) {
          return `[附件: ${item.name || item.kind || '文件'}]`;
        }
        return String(item);
      })
      .join(', ');
  }
  return String(val);
}

/**
 * 将完整的 HTableDocument 序列化为规范 Markdown 表格
 */
export function serializeTableToMarkdown(
  doc: Partial<HTableDocument> | null | undefined,
  options: TableSerializeOptions = {},
): string {
  if (!doc) return '';
  const columns = Array.isArray(doc.columns) ? doc.columns : [];
  const rows = Array.isArray(doc.rows) ? doc.rows : [];

  if (columns.length === 0 || rows.length === 0) {
    return '';
  }

  // 1. 过滤出可见列（缺省 visible 为 true）
  const visibleCols = columns.filter((col) => col.visible !== false);
  if (visibleCols.length === 0) return '';

  const { maxRows = 100, title = doc.title, tableOnly = false } = options;

  // 2. 构造表头与对齐行
  const headers = visibleCols.map((c) => (c.title ? c.title.replace(/\|/g, '\\|').trim() : '未命名列'));
  const headerLine = `| ${headers.join(' | ')} |`;
  const separatorLine = `| ${visibleCols.map(() => '---').join(' | ')} |`;

  // 3. 构造数据行
  const rowsToProcess = rows.slice(0, maxRows);
  const dataLines: string[] = [];

  for (const row of rowsToProcess) {
    if (!row || typeof row !== 'object') continue;
    const cells = row.cells || {};
    const rowValues = visibleCols.map((col) => sanitizeCellText(cells[col.id]));
    dataLines.push(`| ${rowValues.join(' | ')} |`);
  }

  const tableBody = [headerLine, separatorLine, ...dataLines].join('\n');
  const titleHeader = !tableOnly && title?.trim() ? `### 表格：${title.trim()}\n` : '';
  const truncation = rows.length > maxRows ? `\n\n*(已截断，仅展示前 ${maxRows} 行，共 ${rows.length} 行)*` : '';

  return `${titleHeader}${tableBody}${truncation}`.trim();
}

/**
 * 根据轻量预览行生成紧凑清单文本（在未拉取到全量 document 时的降级方案）
 */
export function serializePreviewRowsToText(
  previewRows: unknown[],
  title?: string,
): string {
  if (!Array.isArray(previewRows) || previewRows.length === 0) return '';
  const validRows = previewRows
    .filter((r): r is string => typeof r === 'string' && Boolean(r.trim()))
    .map((r) => r.trim());

  if (validRows.length === 0) return '';

  const titleHeader = title?.trim() ? `### 表格：${title.trim()}\n` : '';
  const listBody = validRows.map((row) => `- ${row}`).join('\n');

  return `${titleHeader}${listBody}`.trim();
}

type TableDocumentResolver = (tableId: string) => Partial<HTableDocument> | null | undefined;
let activeResolver: TableDocumentResolver | undefined;

/**
 * 注册全局文档解析器（由前端 tableDocumentCache 注入），解耦数据层与图分析层
 */
export function registerTableDocumentResolver(resolver: TableDocumentResolver): () => void {
  activeResolver = resolver;
  return () => {
    if (activeResolver === resolver) {
      activeResolver = undefined;
    }
  };
}

export function resolveTableDocument(tableId: string): Partial<HTableDocument> | null | undefined {
  return activeResolver ? activeResolver(tableId) : undefined;
}

/**
 * 统一从节点 data 中提取文本投影
 */
export function serializeTableNodeToText(
  data: Record<string, unknown> | null | undefined,
  doc?: Partial<HTableDocument> | null,
  fallbackTableId?: string,
): string {
  if (!data && !doc) return '';
  const nodeTitle = typeof data?.label === 'string' && data.label.trim()
    ? data.label.trim()
    : typeof data?.title === 'string' && data.title.trim()
      ? data.title.trim()
      : doc?.title;

  const tableId = typeof data?.tableId === 'string' && data.tableId.trim()
    ? data.tableId.trim()
    : typeof data?.id === 'string' && data.id.trim()
      ? data.id.trim()
      : typeof fallbackTableId === 'string' && fallbackTableId.trim()
        ? fallbackTableId.trim()
        : undefined;

  // 1. 优先使用传入的 doc 或 data.document，其次使用已注册的全局 resolver
  const document = doc
    || (data?.document as Partial<HTableDocument> | undefined)
    || (tableId ? resolveTableDocument(tableId) : undefined);

  if (document && Array.isArray(document.rows) && document.rows.length > 0) {
    const md = serializeTableToMarkdown(document, { title: nodeTitle });
    if (md) return md;
  }

  // 2. 降级使用 previewRows
  if (Array.isArray(data?.previewRows) && data.previewRows.length > 0) {
    const previewText = serializePreviewRowsToText(data.previewRows, nodeTitle);
    if (previewText) return previewText;
  }

  return '';
}
