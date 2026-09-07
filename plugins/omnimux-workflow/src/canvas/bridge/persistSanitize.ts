/**
 * 持久化消毒：只保留 canvas.json 契约字段。
 *
 * xyflow 运行时会往 Node 上挂 measured / dragging / positionAbsolute /
 * resizing 等瞬时字段。旧 sanitize 用展开运算符原样带回这些键，导致：
 * 1) 首次布局一量尺寸就脏 → 1s 自动 PUT；
 * 2) 点选 / 重排版若触发再 measure，version 狂涨，顶栏「保存中」像刷新；
 * 3) Host zod 读时剥掉 measured，写时却落原始 next → 磁盘脏字段常驻。
 *
 * 白名单与 src/workflow/workspace/snapshotSchema.ts 的 canvasNodeSchema /
 * canvasEdgeSchema 对齐；selected 强制 false（仅选中不得脏文档）。
 * 签名额外忽略 nodeHeight / 顶层 width-height，并剥所有 blob: 预览 URL，
 * 避免打开画布量媒体、残留 blob 把文档判脏后自撞 409。
 */

import type {
  SerializedCanvasEdge,
  SerializedCanvasNode,
} from '../../shared/canvasTypes';
import { isBlobUrl, looksAbsolutePath, projectFileMediaUrl } from '../../shared/localMedia.ts';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function asMediaAsset(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return { ...(value as Record<string, unknown>) };
}

function stripBlobStrings(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) stripBlobStrings(item);
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const next = record[key];
    if (isBlobUrl(next)) delete record[key];
    else if (next && typeof next === 'object') stripBlobStrings(next);
  }
}

function sanitizeImportedMedia(data: Record<string, unknown>, workspaceId?: string): void {
  const relativePath = typeof data.relativePath === 'string' ? data.relativePath.trim() : '';
  if (relativePath) {
    delete data.realPath;
    delete data.real_path;
    if (workspaceId) {
      data.mediaUrl = projectFileMediaUrl(workspaceId, relativePath);
    } else if (isBlobUrl(data.mediaUrl) || (typeof data.mediaUrl === 'string' && data.mediaUrl.includes('/api/local-file'))) {
      delete data.mediaUrl;
    }
    if (Array.isArray(data.mediaAssets)) {
      const cleaned = data.mediaAssets
        .map((asset) => {
          const row = asMediaAsset(asset);
          if (!row) return null;
          row.relativePath = relativePath;
          if (typeof data.assetId === 'string' && data.assetId) row.assetId = data.assetId;
          if (workspaceId) row.url = projectFileMediaUrl(workspaceId, relativePath);
          if (typeof row.path === 'string' && looksAbsolutePath(row.path)) delete row.path;
          if (isBlobUrl(row.url)) delete row.url;
          return row.url || row.relativePath ? row : null;
        })
        .filter((row): row is Record<string, unknown> => row !== null);
      if (cleaned.length === 0) delete data.mediaAssets;
      else data.mediaAssets = cleaned;
    }
  } else {
    delete data.realPath;
    delete data.real_path;
    if (isBlobUrl(data.mediaUrl)) delete data.mediaUrl;

    if (Array.isArray(data.mediaAssets)) {
      const cleaned = data.mediaAssets
        .map((asset) => {
          const row = asMediaAsset(asset);
          if (!row) return null;
          if (isBlobUrl(row.url)) delete row.url;
          if (typeof row.path === 'string' && looksAbsolutePath(row.path)) delete row.path;
          return row.url || row.relativePath ? row : null;
        })
        .filter((row): row is Record<string, unknown> => row !== null);
      if (cleaned.length === 0) delete data.mediaAssets;
      else data.mediaAssets = cleaned;
    }
  }

  // 会话内 blob: 预览（outputVideoUrl / thumbnailUrl 等）不得进签名或落盘。
  stripBlobStrings(data);
}

/** Strip island + xyflow transient fields before signature / PUT. */
export function sanitizeNodes(
  nodes: SerializedCanvasNode[],
  opts: { workspaceId?: string } = {},
): SerializedCanvasNode[] {
  return nodes.map((node) => {
    const raw = node as SerializedCanvasNode & Record<string, unknown>;
    const data = asRecord(raw.data);
    delete data.__catalog;
    delete data.__workspaceId;
    if (raw.type === 'table') {
      delete data.document;
      delete data.rows;
      delete data.columns;
    }
    sanitizeImportedMedia(data, opts.workspaceId);

    const clean: Record<string, unknown> = {
      id: raw.id,
      type: raw.type,
      position: raw.position,
      data,
      selected: false,
    };

    if (typeof raw.draggable === 'boolean') clean.draggable = raw.draggable;
    if (typeof raw.selectable === 'boolean') clean.selectable = raw.selectable;
    if (typeof raw.deletable === 'boolean') clean.deletable = raw.deletable;
    if (typeof raw.width === 'number') clean.width = raw.width;
    if (typeof raw.height === 'number') clean.height = raw.height;
    if (typeof raw.parentId === 'string') clean.parentId = raw.parentId;
    if (raw.extent === 'parent') {
      clean.extent = 'parent';
    }
    if (typeof raw.zIndex === 'number') clean.zIndex = raw.zIndex;
    if (raw.style && typeof raw.style === 'object') clean.style = asRecord(raw.style);

    return clean as SerializedCanvasNode;
  });
}

/** 布局派生字段：打开即量媒体高度 / xyflow 写 width-height，不得单独把文档判脏。 */
function omitLayoutDerivedFields(node: SerializedCanvasNode): SerializedCanvasNode {
  const raw = node as SerializedCanvasNode & Record<string, unknown>;
  const data = asRecord(raw.data);
  delete data.nodeHeight;
  const { width: _width, height: _height, ...rest } = raw;
  return { ...rest, data } as SerializedCanvasNode;
}

export function sanitizeEdges(edges: SerializedCanvasEdge[]): SerializedCanvasEdge[] {
  return edges.map((edge) => {
    const raw = edge as SerializedCanvasEdge & Record<string, unknown>;
    const clean: Record<string, unknown> = {
      id: raw.id,
      source: raw.source,
      target: raw.target,
    };

    if (raw.sourceHandle !== undefined) clean.sourceHandle = raw.sourceHandle;
    if (raw.targetHandle !== undefined) clean.targetHandle = raw.targetHandle;
    if (typeof raw.type === 'string') clean.type = raw.type;
    if (typeof raw.animated === 'boolean') clean.animated = raw.animated;
    if (raw.data && typeof raw.data === 'object') clean.data = asRecord(raw.data);
    if (raw.style && typeof raw.style === 'object') clean.style = asRecord(raw.style);

    return clean as SerializedCanvasEdge;
  });
}

/** Stable content signature (drives dirty detection). */
export function signatureOf(
  nodes: SerializedCanvasNode[],
  edges: SerializedCanvasEdge[],
  opts: { workspaceId?: string } = {},
): string {
  return JSON.stringify({
    nodes: sanitizeNodes(nodes, opts).map(omitLayoutDerivedFields),
    edges: sanitizeEdges(edges),
  });
}
