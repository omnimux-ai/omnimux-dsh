/**
 * 节点顶部胶囊：素材判定、主/次溢出分区、会话 payload。
 * 无 React，供组件与 node:test 共用。
 */

import { resolveNodeLifecycle } from './nodeMaterialLifecycle.ts';
import { localFilePathFromUrl, projectFileMediaUrl } from '../../../shared/localMedia.ts';
import { isSupportedSocialVideoUrl } from './socialMediaVideoUrl.ts';

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

// ============================================================================
// 语音识别胶囊操作（Issue 744 T04）
// ============================================================================

export const SPEECH_TO_TEXT_PILL_ACTION_ID = 'speech-to-text';

export interface SpeechToTextEligibilityInput {
  materialType?: string;
  executionStatus?: string | null;
  isOffline?: boolean;
  realPath?: string;
  relativePath?: string;
  mediaUrl?: string;
  previewUrl?: string;
}

/**
 * 「语音识别」按钮可见性：音频素材节点、有可解析的音频来源、
 * 非离线、非执行中（running/pending）。
 */
export function canRunSpeechToText(input: SpeechToTextEligibilityInput): boolean {
  if (input.materialType !== 'audio') return false;
  if (input.isOffline) return false;
  if (input.executionStatus === 'running' || input.executionStatus === 'pending') return false;
  return Boolean(
    input.realPath || input.relativePath || input.mediaUrl || input.previewUrl,
  );
}

function asTrimmedPath(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * 解析音频节点的转写来源路径（后端契约：绝对路径或无凭据 HTTP(S) URL）：
 * 1. realPath（导入节点的本机绝对路径）；
 * 2. mediaUrl / previewUrl 中可还原的 /api/local-file 绝对路径；
 * 3. mediaUrl 本身是 HTTP(S) URL；
 * 4. relativePath + workspaceId → 项目文件流 URL（需 baseUrl 拼成绝对 URL，
 *    浏览器侧传 window.location.origin；无 baseUrl 时返回 null，不发明路径）。
 */
export function resolveSpeechToTextAudioPath(
  input: {
    realPath?: string;
    relativePath?: string;
    mediaUrl?: string;
    previewUrl?: string;
    workspaceId?: string;
  },
  opts?: { baseUrl?: string },
): string | null {
  const realPath = asTrimmedPath(input.realPath);
  if (realPath) return realPath;

  for (const url of [input.mediaUrl, input.previewUrl]) {
    const local = localFilePathFromUrl(url);
    if (local) return local;
  }

  const mediaUrl = asTrimmedPath(input.mediaUrl);
  if (mediaUrl && /^https?:\/\//.test(mediaUrl)) return mediaUrl;

  const relativePath = asTrimmedPath(input.relativePath);
  const workspaceId = asTrimmedPath(input.workspaceId);
  const baseUrl = asTrimmedPath(opts?.baseUrl);
  if (relativePath && workspaceId && baseUrl) {
    return new URL(projectFileMediaUrl(workspaceId, relativePath), baseUrl).toString();
  }
  return null;
}

// ============================================================================
// 视频节点内容拆解胶囊操作
// ============================================================================

export const DECONSTRUCT_VIDEO_PILL_ACTION_ID = 'deconstruct-video';

export interface VideoDeconstructEligibilityInput {
  materialType?: string;
  executionStatus?: string | null;
  isOffline?: boolean;
  realPath?: string;
  relativePath?: string;
  mediaUrl?: string;
  previewUrl?: string;
}

/**
 * 「内容拆解」按钮可见性：视频素材节点、有可解析的视频来源、
 * 非离线、非执行中（running/pending）。
 */
export function canRunVideoDeconstruct(input: VideoDeconstructEligibilityInput): boolean {
  if (input.materialType !== 'video') return false;
  if (input.isOffline) return false;
  if (input.executionStatus === 'running' || input.executionStatus === 'pending') return false;
  return Boolean(
    input.realPath || input.relativePath || input.mediaUrl || input.previewUrl,
  );
}

export function buildDeconstructVideoPillActionSpec(width: number = 88): ToolbarActionSpec {
  return {
    id: DECONSTRUCT_VIDEO_PILL_ACTION_ID,
    section: 'primary',
    width,
  };
}

/**
 * 解析视频节点的拆解来源路径：
 * 1. realPath（导入节点的本机绝对路径）；
 * 2. mediaUrl / previewUrl 中可还原的 /api/local-file 绝对路径；
 * 3. mediaUrl 本身是 HTTP(S) URL；
 * 4. relativePath（项目相对路径）；
 * 5. relativePath + workspaceId → 项目文件流 URL。
 */
export function resolveVideoDeconstructPath(
  input: {
    realPath?: string;
    relativePath?: string;
    mediaUrl?: string;
    previewUrl?: string;
    workspaceId?: string;
  },
  opts?: { baseUrl?: string },
): string | null {
  const realPath = asTrimmedPath(input.realPath);
  if (realPath) return realPath;

  for (const url of [input.mediaUrl, input.previewUrl]) {
    const local = localFilePathFromUrl(url);
    if (local) return local;
  }

  const mediaUrl = asTrimmedPath(input.mediaUrl);
  if (mediaUrl && /^https?:\/\//.test(mediaUrl)) return mediaUrl;

  const previewUrl = asTrimmedPath(input.previewUrl);
  if (previewUrl && /^https?:\/\//.test(previewUrl)) return previewUrl;

  const relativePath = asTrimmedPath(input.relativePath);
  if (relativePath) return relativePath;

  const workspaceId = asTrimmedPath(input.workspaceId);
  const baseUrl = asTrimmedPath(opts?.baseUrl);
  if (relativePath && workspaceId && baseUrl) {
    return new URL(projectFileMediaUrl(workspaceId, relativePath), baseUrl).toString();
  }
  return null;
}

// ============================================================================
// 文本节点提取视频胶囊操作
// ============================================================================

export const EXTRACT_VIDEO_PILL_ACTION_ID = 'extract-video';

export interface ExtractVideoEligibilityInput {
  materialType?: string;
  content?: string;
  generatedContent?: string;
  isOffline?: boolean;
  executionStatus?: string | null;
}

/**
 * 「提取视频」按钮可见性：
 * 文本节点（或 materialType 为空但在文本环境）、非离线、非执行中、
 * 且内容中识别出支持的社媒视频链接（TikTok、抖音、快手、小红书、B站、YouTube、X、Instagram等）。
 */
export function canExtractVideoFromTextNode(input: ExtractVideoEligibilityInput): boolean {
  if (input.materialType && input.materialType !== 'text') return false;
  if (input.isOffline) return false;
  if (input.executionStatus === 'running' || input.executionStatus === 'pending') return false;
  const text = (input.content || input.generatedContent || '').trim();
  return isSupportedSocialVideoUrl(text);
}

export function buildExtractVideoPillActionSpec(width: number = 88): ToolbarActionSpec {
  return {
    id: EXTRACT_VIDEO_PILL_ACTION_ID,
    section: 'primary',
    width,
  };
}



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
