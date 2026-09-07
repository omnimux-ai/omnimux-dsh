/**
 * 节点顶部胶囊：素材判定、主/次溢出分区、会话 payload。
 * 无 React，供组件与 node:test 共用。
 */

import { resolveNodeLifecycle } from './nodeMaterialLifecycle.ts';

export const DEFAULT_PILL_MAX_WIDTH = 280;
export const PILL_NODE_GUTTER = 24;

export type ToolbarSection = 'primary' | 'secondary';

export interface ToolbarActionSpec {
  id: string;
  section: ToolbarSection;
  width: number;
}

export interface HasNodeMaterialInput {
  nodeType: string;
  materialType?: string;
  nodeKind?: 'generate' | 'import';
  content?: string;
  generatedContent?: string;
  previewUrl?: string;
  isOffline?: boolean;
  tableRowCount?: number;
  outputVideoUrl?: string;
  [key: string]: unknown;
}

export interface PartitionToolbarOptions {
  maxWidth: number;
  moreWidth: number;
  dividerWidth: number;
  gap: number;
}

export interface ConversationPayloadInput {
  nodeType: string;
  nodeId: string;
  materialType?: string;
  label?: string;
  previewUrl?: string;
  relativePath?: string;
  outputVideoUrl?: string;
  duration?: string;
  tablePath?: string;
}

export interface NodeConversationPayload {
  sourcePlugin: 'omnimux-workflow';
  kind: 'image' | 'video' | 'audio' | 'table' | 'document';
  entityId: string;
  title: string;
  extension?: string;
  relativePath: string;
  previewUrl?: string;
  duration?: string;
}

const MEDIA_TYPES = new Set(['image', 'video', 'audio']);
const MATERIAL_TYPES = new Set(['text', 'image', 'video', 'audio']);

function sumSectionWidth(items: ToolbarActionSpec[], gap: number): number {
  if (items.length === 0) return 0;
  return items.reduce((sum, item) => sum + item.width, 0) + gap * (items.length - 1);
}

export function hasNodeMaterial(input: HasNodeMaterialInput): boolean {
  return resolveNodeLifecycle({
    type: input.nodeType,
    nodeType: input.nodeType,
    data: {
      materialType: input.materialType,
      nodeKind: input.nodeKind,
      content: input.content,
      generatedContent: input.generatedContent,
      previewUrl: input.previewUrl,
      isOffline: input.isOffline,
      rowCount: input.tableRowCount,
      outputVideoUrl: input.outputVideoUrl,
    },
  }) === 'ready';
}

export const EMPTY_IMAGE_PILL_ACTION_ID = 'import-image';

export interface EmptyImageGenerateNodeInput {
  materialType?: string;
  nodeKind?: string;
  previewUrl?: string;
  generationStatus?: string | null;
}

export function isEmptyImageGenerateNode(input: EmptyImageGenerateNodeInput): boolean {
  return (
    input.materialType === 'image' &&
    input.nodeKind === 'generate' &&
    !input.previewUrl &&
    !input.generationStatus
  );
}

export function buildEmptyImagePillActionSpec(width: number = 88): ToolbarActionSpec {
  return {
    id: EMPTY_IMAGE_PILL_ACTION_ID,
    section: 'primary',
    width,
  };
}

export function shouldShowNodeToolbar(input: {
  hasMaterial: boolean;
  hovered?: boolean;
  selected?: boolean;
  isMultiSelected?: boolean;
  allowEmpty?: boolean;
}): boolean {
  if ((!input.hasMaterial && !input.allowEmpty) || input.isMultiSelected) return false;
  return Boolean(input.hovered || input.selected);
}

export function pillMaxWidthForNode(nodeWidth: number): number {
  if (!Number.isFinite(nodeWidth) || nodeWidth <= 0) return DEFAULT_PILL_MAX_WIDTH;
  return Math.min(Math.max(0, nodeWidth - PILL_NODE_GUTTER), DEFAULT_PILL_MAX_WIDTH);
}

/**
 * 主区全部保留；次区从左到右能放下的留下，其余进 overflow。
 * 主区即使超宽也不折。overflow 非空时次区若只剩 1 项，并入更多。
 */
export function partitionToolbarActions(
  actions: ToolbarActionSpec[],
  opts: PartitionToolbarOptions,
): { visible: ToolbarActionSpec[]; overflow: ToolbarActionSpec[] } {
  const { maxWidth, moreWidth, dividerWidth, gap } = opts;
  const primary = actions.filter((action) => action.section === 'primary');
  const secondary = actions.filter((action) => action.section !== 'primary');

  if (secondary.length === 0) {
    return { visible: primary, overflow: [] };
  }

  const primaryWidth = sumSectionWidth(primary, gap);
  const hasDivider = primary.length > 0;
  const base = primaryWidth + (hasDivider ? dividerWidth : 0);

  for (let k = secondary.length; k >= 0; k -= 1) {
    const overflowCount = secondary.length - k;
    if (k === 1 && overflowCount > 0) continue;

    const visibleSecondary = secondary.slice(0, k);
    const overflow = secondary.slice(k);
    const needMore = overflow.length > 0;
    const secWidth = sumSectionWidth(visibleSecondary, gap);
    const morePart = needMore
      ? moreWidth + (visibleSecondary.length > 0 ? gap : 0)
      : 0;
    const total = base + secWidth + morePart;
    if (total <= maxWidth) {
      return { visible: [...primary, ...visibleSecondary], overflow };
    }
  }

  return { visible: primary, overflow: secondary };
}

function mediaFileMeta(materialType: string | undefined): { ext: string; extension: string } {
  if (materialType === 'video') return { ext: 'mp4', extension: 'VIDEO' };
  if (materialType === 'image') return { ext: 'png', extension: 'IMAGE' };
  if (materialType === 'audio') return { ext: 'bin', extension: 'AUDIO' };
  return { ext: 'bin', extension: (materialType || 'file').toUpperCase() };
}

export function buildConversationPayloadFromNode(
  input: ConversationPayloadInput,
): NodeConversationPayload | null {
  const nodeId = input.nodeId;
  if (!nodeId) return null;

  if (input.nodeType === 'table') {
    const title = `${input.label || '表格'}.htable`;
    return {
      sourcePlugin: 'omnimux-workflow',
      kind: 'table',
      entityId: nodeId,
      title,
      extension: 'HTABLE',
      relativePath: input.tablePath || input.relativePath || `.hilo/tables/${nodeId}.htable`,
    };
  }

  if (input.nodeType === 'video_composition') {
    const titleBase = input.label || '视频合成';
    return {
      sourcePlugin: 'omnimux-workflow',
      kind: 'video',
      entityId: nodeId,
      title: titleBase.endsWith('.mp4') ? titleBase : `${titleBase}.mp4`,
      extension: 'MP4',
      relativePath: input.outputVideoUrl || input.relativePath || `assets/videos/${nodeId}.mp4`,
      previewUrl: input.outputVideoUrl || input.previewUrl,
      duration: input.duration,
    };
  }

  const materialType = input.materialType || 'text';
  const isText = materialType === 'text';
  if (isText) {
    const title = `${input.label || '未命名文本'}.md`;
    return {
      sourcePlugin: 'omnimux-workflow',
      kind: 'document',
      entityId: nodeId,
      title,
      extension: 'MD',
      relativePath: input.relativePath || input.previewUrl || `assets/texts/${nodeId}.md`,
      previewUrl: input.previewUrl,
    };
  }

  const { ext, extension } = mediaFileMeta(materialType);
  const kind = (MEDIA_TYPES.has(materialType) ? materialType : 'image') as 'image' | 'video' | 'audio';
  return {
    sourcePlugin: 'omnimux-workflow',
    kind,
    entityId: nodeId,
    title: `${input.label || materialType}.${ext}`,
    extension,
    relativePath: input.relativePath || input.previewUrl || `assets/${materialType}s/${nodeId}.${ext}`,
    previewUrl: input.previewUrl,
  };
}
