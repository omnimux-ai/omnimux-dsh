/**
 * ResourcePicker 纯策略：列出画布资源、过滤、MIME 映射、提交计划。
 * 无 React 依赖，供 node:test 直接断言。
 *
 * 提交计划必须只包含 gateway 能一次放行的 mutation（全有或全无），
 * 因此非法连线 / 已连接节点在此预筛，避免整批被拒。
 */

import type { Edge } from '@xyflow/react';
import type { MaterialType } from '../../types/materialNode.ts';
import { createImportNode } from '../../../shared/graph/nodeFactory.ts';
import { isNodeConnectionValid } from '../../../shared/graph/connectionConfig.ts';
import type {
  CanvasInputMutation,
  CanvasNode,
} from '../../../shared/graph/canvasInputMutationGateway.ts';
import { resolveMediaPreviewUrl, type MediaAssetLike } from './mediaUrl.ts';
import { buildImportedMediaData, looksAbsolutePath, projectFileMediaUrl } from '../../../shared/localMedia.ts';
import { buildMediaMetadata } from '../../../shared/mediaMetadata.ts';
import { forbiddenRelativePathCode } from '../../../shared/projectAssets.ts';
import { getDefaultNodeHeight, getDefaultNodeWidth } from './nodeSizeConfig.ts';

export type ResourceTypeFilter = 'all' | 'image' | 'video' | 'audio';
export type ResourcePickerTab = 'canvas' | 'local';
export type ResourcePickerView = 'grid' | 'list';

const MEDIA_TYPES: readonly MaterialType[] = ['image', 'video', 'audio'];
const UPSTREAM_GAP_X = 80;
const UPSTREAM_STACK_Y = 40;
const IMPORT_STACK_Y = 40;

export interface CanvasResourceItem {
  nodeId: string;
  materialType: MaterialType;
  title: string;
  previewUrl?: string;
  alreadyConnected: boolean;
  subtitle: string;
  width?: number;
  height?: number;
}

export interface LocalFileDraft {
  id: string;
  name: string;
  mime: string;
  size: number;
  realPath: string;
  materialType: MaterialType;
  /** Transient picker-only preview. Must not be persisted. */
  previewUrl?: string;
}

/** Project assets carry their owning workspace; they never become native disk paths. */
export interface ProjectFileDraft extends Omit<LocalFileDraft, 'realPath' | 'size'> {
  relativePath: string;
  workspaceId: string;
  assetId?: string;
  size: number | null;
  durationSec?: number | null;
}

export type ImportFileDraft = LocalFileDraft | ProjectFileDraft;

export interface ResourcePickerCommitInput {
  nodes: CanvasNode[];
  edges: Edge[];
  targetNodeId: string;
  selectedCanvasNodeIds: string[];
  localFiles: LocalFileDraft[];
}

export interface ResourcePickerRejection {
  id: string;
  reason: 'already_connected' | 'self' | 'missing' | 'type_contract' | 'unsupported';
}

export interface ResourcePickerCommitPlan extends CanvasInputMutation {
  hasWork: boolean;
  rejected: ResourcePickerRejection[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function nodeData(node: CanvasNode): Record<string, unknown> {
  return isRecord(node.data) ? node.data : {};
}

function asMaterialType(value: unknown): MaterialType | null {
  if (value === 'text' || value === 'image' || value === 'video' || value === 'audio') {
    return value;
  }
  return null;
}

function extensionOf(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

/** MIME / 扩展名 → 素材类型；无法识别时返回 null。 */
export function mimeToMaterialType(mime: string, filename = ''): MaterialType | null {
  const normalized = (mime || '').toLowerCase().trim();
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('video/')) return 'video';
  if (normalized.startsWith('audio/')) return 'audio';

  const ext = extensionOf(filename);
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic'].includes(ext)) {
    return 'image';
  }
  if (['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus'].includes(ext)) return 'audio';
  return null;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dimensionPair(data: Record<string, unknown>): { width?: number; height?: number } {
  const dims = data.dimensions;
  if (isRecord(dims) && typeof dims.width === 'number' && typeof dims.height === 'number') {
    return { width: dims.width, height: dims.height };
  }
  const width = typeof data.nodeWidth === 'number' ? data.nodeWidth : undefined;
  const height = typeof data.nodeHeight === 'number' ? data.nodeHeight : undefined;
  return { width, height };
}

function resourceTitle(data: Record<string, unknown>, nodeId: string): string {
  const label = typeof data.label === 'string' ? data.label.trim() : '';
  if (label) return label;
  const content = typeof data.content === 'string' ? data.content.trim() : '';
  if (content) return content;
  return nodeId;
}

function resourceSubtitle(
  data: Record<string, unknown>,
  title: string,
  nodeId: string,
  size?: { width?: number; height?: number },
): string {
  const parts: string[] = [];
  if (size?.width && size?.height) {
    parts.push(`${Math.round(size.width)} × ${Math.round(size.height)}`);
  }
  if (title && title !== nodeId) parts.push(nodeId);
  return parts.join(' · ');
}

function incomingSourceIds(edges: Edge[], targetNodeId: string): Set<string> {
  const ids = new Set<string>();
  for (const edge of edges) {
    if (edge.target === targetNodeId && edge.source) ids.add(edge.source);
  }
  return ids;
}

function hasListableMedia(materialType: MaterialType, data: Record<string, unknown>): boolean {
  if (!MEDIA_TYPES.includes(materialType)) return false;
  const preview = resolveMediaPreviewUrl(
    materialType,
    data.mediaAssets as MediaAssetLike[] | undefined,
    typeof data.mediaUrl === 'string' ? data.mediaUrl : undefined,
  );
  if (preview) return true;
  const status = data.status;
  return status === 'ready' || status === 'completed';
}

/** 列出当前画布上可被当前节点引用的媒体资源（不含自身、不含文本/表格）。 */
export function listCanvasResources(
  nodes: CanvasNode[],
  edges: Edge[],
  targetNodeId: string,
): CanvasResourceItem[] {
  const connected = incomingSourceIds(edges, targetNodeId);
  const items: CanvasResourceItem[] = [];
  for (const node of nodes) {
    if (node.id === targetNodeId) continue;
    if (node.type && node.type !== 'material') continue;
    const data = nodeData(node);
    const materialType = asMaterialType(data.materialType);
    if (!materialType || !hasListableMedia(materialType, data)) continue;
    const title = resourceTitle(data, node.id);
    const size = dimensionPair(data);
    items.push({
      nodeId: node.id,
      materialType,
      title,
      previewUrl: resolveMediaPreviewUrl(
        materialType,
        data.mediaAssets as MediaAssetLike[] | undefined,
        typeof data.mediaUrl === 'string' ? data.mediaUrl : undefined,
      ),
      alreadyConnected: connected.has(node.id),
      subtitle: resourceSubtitle(data, title, node.id, size),
      width: size.width,
      height: size.height,
    });
  }
  return items;
}

export function filterCanvasResources(
  items: CanvasResourceItem[],
  query: string,
  typeFilter: ResourceTypeFilter,
): CanvasResourceItem[] {
  const needle = query.trim().toLowerCase();
  return items.filter((item) => {
    if (typeFilter !== 'all' && item.materialType !== typeFilter) return false;
    if (!needle) return true;
    return (
      item.title.toLowerCase().includes(needle)
      || item.nodeId.toLowerCase().includes(needle)
      || item.subtitle.toLowerCase().includes(needle)
    );
  });
}

function edgeDraft(source: string, target: string) {
  return {
    source,
    sourceHandle: 'out',
    target,
    targetHandle: 'in',
  };
}

function canConnect(source: CanvasNode, target: CanvasNode): boolean {
  return isNodeConnectionValid(source, target);
}

function mediaPatch(file: ImportFileDraft): Record<string, unknown> {
  if ('relativePath' in file) {
    const url = projectFileMediaUrl(file.workspaceId, file.relativePath);
    return {
      ...buildMediaMetadata({ mime: file.mime, size: file.size, durationSec: file.durationSec, name: file.name }),
      relativePath: file.relativePath,
      assetId: file.assetId,
      mediaUrl: url,
      status: 'ready',
      content: file.name,
      originalName: file.name,
      isMissing: false,
      mediaAssets: [{ type: file.materialType, url, relativePath: file.relativePath, assetId: file.assetId }],
    };
  }
  return buildImportedMediaData({
    realPath: file.realPath,
    name: file.name,
    materialType: file.materialType,
    mime: file.mime,
    size: file.size,
  });
}

function placeUpstream(
  target: CanvasNode,
  index: number,
  materialType: MaterialType,
): { x: number; y: number } {
  const width = getDefaultNodeWidth(materialType);
  const height = getDefaultNodeHeight(materialType);
  return {
    x: target.position.x - width - UPSTREAM_GAP_X,
    y: target.position.y + index * (height + UPSTREAM_STACK_Y),
  };
}

/**
 * 计算一次提交对应的 canvas mutation。
 *
 * 画布资源：为尚未连入的选中节点添加 source→target 边。
 * 本地上传：全部可用文件都在当前节点左侧创建导入型上游节点并连线，
 * 不把任何文件写入当前节点卡片（避免把所选素材 patch 进当前节点替换素材）。
 */
export function planResourcePickerCommit(input: ResourcePickerCommitInput): ResourcePickerCommitPlan {
  const rejected: ResourcePickerRejection[] = [];
  const addEdges: NonNullable<CanvasInputMutation['addEdges']> = [];
  const addNodes: CanvasNode[] = [];

  const target = input.nodes.find((node) => node.id === input.targetNodeId);
  if (!target) {
    return { hasWork: false, rejected: [{ id: input.targetNodeId, reason: 'missing' }] };
  }

  const existing = incomingSourceIds(input.edges, input.targetNodeId);
  const seenSources = new Set<string>(existing);

  for (const nodeId of input.selectedCanvasNodeIds) {
    if (nodeId === input.targetNodeId) {
      rejected.push({ id: nodeId, reason: 'self' });
      continue;
    }
    if (existing.has(nodeId) || seenSources.has(nodeId)) {
      rejected.push({ id: nodeId, reason: 'already_connected' });
      continue;
    }
    const source = input.nodes.find((node) => node.id === nodeId);
    if (!source) {
      rejected.push({ id: nodeId, reason: 'missing' });
      continue;
    }
    if (!canConnect(source, target)) {
      rejected.push({ id: nodeId, reason: 'type_contract' });
      continue;
    }
    addEdges.push(edgeDraft(nodeId, input.targetNodeId));
    seenSources.add(nodeId);
  }

  // 本地上传：全部可用文件都在当前节点左侧创建导入型上游并连线。
  // 产品预期是新建上游节点并连到当前节点，而非把所选文件 patch 进当前卡片。
  const usableFiles = usableMediaFiles(input.localFiles, rejected);

  let upstreamIndex = 0;
  for (const file of usableFiles) {
    const position = placeUpstream(target, upstreamIndex, file.materialType);
    const node = createImportNode(file.materialType, position, {
      ...mediaPatch(file),
      label: file.name.replace(/\.[^.]+$/, '') || file.name,
    });
    if (!canConnect(node, target)) {
      rejected.push({ id: file.id, reason: 'type_contract' });
      continue;
    }
    addNodes.push(node);
    addEdges.push(edgeDraft(node.id, input.targetNodeId));
    seenSources.add(node.id);
    upstreamIndex += 1;
  }

  const hasWork = addNodes.length > 0 || addEdges.length > 0;
  return {
    hasWork,
    rejected,
    addNodes: addNodes.length > 0 ? addNodes : undefined,
    addEdges: addEdges.length > 0 ? addEdges : undefined,
  };
}

function usableMediaFiles(
  files: ImportFileDraft[],
  rejected: ResourcePickerRejection[],
): ImportFileDraft[] {
  return files.filter((file) => {
    const hasPath = 'relativePath' in file
      ? typeof file.workspaceId === 'string' && file.workspaceId.trim() !== '' && !forbiddenRelativePathCode(file.relativePath)
      : looksAbsolutePath(file.realPath);
    if (!hasPath || !MEDIA_TYPES.includes(file.materialType)) {
      rejected.push({ id: file.id, reason: 'unsupported' });
      return false;
    }
    return true;
  });
}

function importNodeFromFile(
  file: ImportFileDraft,
  position: { x: number; y: number },
  selected = false,
): CanvasNode {
  const node = createImportNode(file.materialType, position, {
    ...mediaPatch(file),
    label: file.name.replace(/\.[^.]+$/, '') || file.name,
  });
  return selected ? ({ ...node, selected: true } as CanvasNode) : node;
}

/**
 * 画布「导入素材」入口：先选文件，再按文件落导入节点。
 * 取消选择 / 无可用文件时 hasWork=false，调用方不得创建空节点。
 */
export function planStandaloneImportNodes(input: {
  files: ImportFileDraft[];
  origin: { x: number; y: number };
}): ResourcePickerCommitPlan {
  const rejected: ResourcePickerRejection[] = [];
  const usable = usableMediaFiles(input.files, rejected);
  const addNodes: CanvasNode[] = [];
  let y = input.origin.y;

  usable.forEach((file, index) => {
    const height = getDefaultNodeHeight(file.materialType);
    addNodes.push(importNodeFromFile(
      file,
      { x: input.origin.x, y },
      index === usable.length - 1,
    ));
    y += height + IMPORT_STACK_Y;
  });

  return {
    hasWork: addNodes.length > 0,
    rejected,
    addNodes: addNodes.length > 0 ? addNodes : undefined,
  };
}

/**
 * 已有导入节点的填充 / 替换：首个文件写入当前节点（可改 materialType），
 * 其余文件在下方落成独立导入节点，不连线、不生成。
 */
export function planImportNodeFill(input: {
  nodes: CanvasNode[];
  targetNodeId: string;
  files: LocalFileDraft[];
}): ResourcePickerCommitPlan {
  const rejected: ResourcePickerRejection[] = [];
  const target = input.nodes.find((node) => node.id === input.targetNodeId);
  if (!target) {
    return { hasWork: false, rejected: [{ id: input.targetNodeId, reason: 'missing' }] };
  }

  const usable = usableMediaFiles(input.files, rejected);
  const first = usable[0];
  if (!first) {
    return { hasWork: false, rejected };
  }

  const nodePatches: NonNullable<CanvasInputMutation['nodePatches']> = [{
    nodeId: input.targetNodeId,
    data: {
      ...mediaPatch(first),
      materialType: first.materialType,
      nodeKind: 'import',
      selectedTool: 'import',
      nodeWidth: getDefaultNodeWidth(first.materialType),
      nodeHeight: getDefaultNodeHeight(first.materialType),
      label: first.name.replace(/\.[^.]+$/, '') || first.name,
    },
  }];

  const addNodes: CanvasNode[] = [];
  let y = target.position.y + getDefaultNodeHeight(first.materialType) + IMPORT_STACK_Y;
  usable.slice(1).forEach((file, index, rest) => {
    const height = getDefaultNodeHeight(file.materialType);
    addNodes.push(importNodeFromFile(
      file,
      { x: target.position.x, y },
      index === rest.length - 1,
    ));
    y += height + IMPORT_STACK_Y;
  });

  return {
    hasWork: true,
    rejected,
    nodePatches,
    addNodes: addNodes.length > 0 ? addNodes : undefined,
  };
}
