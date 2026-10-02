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
import { planCanvasInputSelection, validateCanvasInputSelection } from '../../../shared/graph/canvasInputMutationGateway.ts';
import { readNodeInputSource } from '../../../shared/graph/nodeInputSource.ts';
import { deriveSlotLayout } from '../../../shared/graph/feedSlot/deriveSlotLayout.ts';
import { resolveSlotOperation } from '../../../shared/graph/feedSlot/resolveSlotOperation.ts';
import { buildCanvasUpstreamFingerprint } from '../../../shared/graph/canvasInputSources.ts';
import { narrowCatalogByRouting } from '../../../shared/validation/lineConstraints.ts';
import type {
  CanvasInputSelectionRequest,
  CanvasInputSelectionVerdict,
  CanvasMutationRuntimeContext,
  CanvasInputMutationState,
  CanvasInputMutation,
  CanvasInputNodePatch,
  CanvasNode,
} from '../../../shared/graph/canvasInputMutationGateway.ts';
import type { SlotBindings, SlotOccupant } from '../../../shared/graph/feedSlot/index.ts';
import { resolveMediaPreviewUrl, type MediaAssetLike } from './mediaUrl.ts';
import { buildImportedMediaData, looksAbsolutePath, projectFileMediaUrl } from '../../../shared/localMedia.ts';
import { buildMediaMetadata } from '../../../shared/mediaMetadata.ts';
import { forbiddenRelativePathCode } from '../../../shared/projectAssets.ts';
import { getDefaultNodeHeight, getDefaultNodeWidth } from './nodeSizeConfig.ts';
import type {
  NodeSlotEngineState,
  SlotBindingItem,
  OverflowAssetItem,
} from '../../../shared/graph/slotContractTypes.ts';
import { promoteOverflowAsset } from '../../../shared/graph/slotEngine.ts';
import { normalizeCanvasEdge } from '../../../shared/graph/canvasConnectionUtils.ts';

export type ResourceTypeFilter = 'all' | 'text' | 'image' | 'video' | 'audio';
export type ResourcePickerTab = 'canvas' | 'local';
export type ResourcePickerView = 'grid' | 'list';
export type ResourcePickerMode = 'add' | 'replace';

const MEDIA_TYPES: readonly MaterialType[] = ['image', 'video', 'audio'];
const UPSTREAM_GAP_X = 80;
const UPSTREAM_STACK_Y = 40;
const IMPORT_STACK_Y = 40;

export interface CanvasResourceItem {
  nodeId: string;
  outputId?: string;
  textContent?: string;
  inUse?: boolean;
  selectable?: boolean;
  reasonCode?: string;
  materialType: MaterialType;
  title: string;
  titleKey?: string;
  previewUrl?: string;
  alreadyConnected: boolean;
  subtitle: string;
  width?: number;
  height?: number;
}

export function pickerCandidateAvailability(item: Pick<CanvasResourceItem, 'inUse' | 'alreadyConnected' | 'selectable'>,
  mode: ResourcePickerMode, allowConnectedSelection: boolean): { isAssigned: boolean; disabled: boolean } {
  const isAssigned = item.inUse === true || (mode === 'add' && item.alreadyConnected && !allowConnectedSelection);
  return { isAssigned, disabled: isAssigned || item.selectable === false };
}

/** Source-selection intent: a cancelled file choice leaves the current selection intact. */
export function updatePickerLocalDrafts(mode: ResourcePickerMode, selectedIds: string[], localFiles: LocalFileDraft[], incoming: LocalFileDraft[]) {
  if (!incoming.length) return { selectedIds, localFiles };
  return mode === 'replace' ? { selectedIds: [], localFiles: [incoming[incoming.length - 1]!] }
    : { selectedIds, localFiles: [...localFiles, ...incoming] };
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
  /** T03：装填目标 slot；选中后 pinned 进该槽位而非仅连线。 */
  targetSlot?: string;
  /** Replace this occupant in the current named slot, never an index from a stale view. */
  replaceEdgeId?: string;
  /** 目标 slot 接受的素材类型；不匹配的选中项按 unsupported 预筛。 */
  acceptedTypes?: readonly string[];
  /** 目标 slot 上限（max 1 → 替换；null → 官方未公布上限，追加）。 */
  slotMax?: number | null;
  mode?: 'add' | 'replace';
  targetSlotIndex?: number;
  slotState?: NodeSlotEngineState;
}

export interface ResourcePickerReplaceCommitInput {
  nodes: CanvasNode[];
  edges: Edge[];
  targetNodeId: string;
  targetSlotIndex: number;
  slotState?: NodeSlotEngineState;
  selectedCanvasNodeId?: string;
  localFile?: LocalFileDraft;
}

/**
 * 防重锁判定纯函数：
 * - 如果 item.nodeId 已经被当前节点的某个活跃卡槽占用：
 *   - 若 mode === 'replace' 且正是当前正在被替换的槽位（slotIndex === targetSlotIndex）：标为 isCurrentSlot: true，显示「当前使用中」，置灰不可重选。
 *   - 若被其他槽位占用：标为 isAssigned: true，显示「✓ 已添加」，覆盖半透明遮罩，置灰禁用不可点击。
 * - 如果在当前节点的溢出候选池中：标为可选，显示标签「候选池中」。
 * - 画布上其他未连线节点与本地上传：正常可选。
 */
export function evaluateResourcePickerAvailability(args: {
  item: { nodeId: string; mediaUrl?: string };
  mode: 'add' | 'replace';
  targetSlotIndex?: number;
  slotState?: NodeSlotEngineState;
}): { isAssigned: boolean; isCurrentSlot: boolean; disabled: boolean; badgeLabel?: string } {
  const { item, mode, targetSlotIndex, slotState } = args;

  if (!slotState) {
    return {
      isAssigned: false,
      isCurrentSlot: false,
      disabled: false,
    };
  }

  const activeSlot = slotState.activeSlots.find((s) => s.sourceNodeId === item.nodeId);
  if (activeSlot) {
    if (mode === 'replace' && typeof targetSlotIndex === 'number' && activeSlot.slotIndex === targetSlotIndex) {
      return {
        isAssigned: false,
        isCurrentSlot: true,
        disabled: true,
        badgeLabel: '当前使用中',
      };
    }
    return {
      isAssigned: true,
      isCurrentSlot: false,
      disabled: true,
      badgeLabel: '✓ 已添加',
    };
  }

  const inOverflow = slotState.overflowPool.some((o) => o.sourceNodeId === item.nodeId);
  if (inOverflow) {
    return {
      isAssigned: false,
      isCurrentSlot: false,
      disabled: false,
      badgeLabel: '候选池中',
    };
  }

  return {
    isAssigned: false,
    isCurrentSlot: false,
    disabled: false,
  };
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

/** PM display projection of this current output; never persisted as source metadata. */
export function canvasResourceDisplayName(node: CanvasNode, source = readNodeInputSource(node)): { title: string; titleKey?: string } {
  const data = nodeData(node);
  const currentAsset = Array.isArray(data.mediaAssets)
    ? data.mediaAssets.find(asset => isRecord(asset) && asset.type === source.materialType) as Record<string, unknown> | undefined : undefined;
  const nodeOwnsCurrent = !currentAsset || Boolean(currentAsset.url && currentAsset.url === data.mediaUrl)
    || Boolean(currentAsset.assetId && currentAsset.assetId === data.assetId)
    || Boolean(currentAsset.relativePath && currentAsset.relativePath === data.relativePath)
    || Boolean(currentAsset.path && currentAsset.path === data.realPath);
  const identities = new Set([node.id, source.outputId, data.assetId, data.taskId, currentAsset?.assetId, currentAsset?.outputId]);
  const candidates = [data.label, currentAsset?.title, nodeOwnsCurrent ? data.title : undefined,
    currentAsset?.originalName, nodeOwnsCurrent ? data.originalName : undefined,
    currentAsset?.name, nodeOwnsCurrent ? data.name : undefined];
  const title = candidates.find(value => typeof value === 'string' && value.trim() && !identities.has(value.trim())
    && !/^(?:[a-z][a-z\d+.-]*:\/\/|data:|blob:|\/|[a-z]:[\\/])/i.test(value.trim())) as string | undefined;
  if (title) return { title: title.trim() };
  if (source.materialType === 'text' && source.output.text?.trim()) return { title: source.output.text.trim() };
  return { title: '', titleKey: source.materialType === 'text' ? 'node.type.text' : `panel.slot.${source.materialType}` };
}

/** Current operation candidates are projections of the same strict selection planner. */
export function listCanvasResources(
  nodes: CanvasNode[],
  edges: Edge[],
  targetNodeId: string,
  context: CanvasMutationRuntimeContext = {},
  selectionTarget?: { targetSlot?: string; role?: string; replaceEdgeId?: string; replaceSlot?: string;
    selections?: NonNullable<CanvasInputSelectionRequest['selections']> },
): CanvasResourceItem[] {
  const target = nodes.find(node => node.id === targetNodeId);
  const params = target?.data.params as Record<string, unknown> | undefined;
  const explicitOperation = typeof params?.operation === 'string' ? params.operation : '';
  const catalog = narrowCatalogByRouting(context.catalog, params?.model, params?.routing);
  const operation = explicitOperation || (target?.data.inputBindingVersion !== 1
    ? resolveSlotOperation(catalog, typeof params?.model === 'string' ? params.model : undefined, undefined,
      String(target?.data.materialType ?? ''), buildCanvasUpstreamFingerprint(targetNodeId, nodes, edges)) ?? '' : '');
  const layout = deriveSlotLayout(catalog, typeof params?.model === 'string' ? params.model : undefined, operation);
  const connected = incomingSourceIds(edges, targetNodeId);
  const items: CanvasResourceItem[] = [];
  for (const node of nodes) {
    if (node.id === targetNodeId) continue;
    if (node.type && node.type !== 'material') continue;
    const data = nodeData(node);
    const materialType = asMaterialType(data.materialType);
    if (!materialType) continue;
    const source = readNodeInputSource(node);
    if (source.availability !== 'ready' || !source.outputId) continue;
    const matchingSlots = layout.slots.filter(slot => slot.type === materialType && (!selectionTarget?.targetSlot || slot.slot === selectionTarget.targetSlot));
    if (!matchingSlots.length) continue;
    const bindings = (target?.data.slotBindings ?? {}) as SlotBindings;
    const inUse = matchingSlots.some(slot => bindings[slot.slot]?.some(item => item.use !== 'inactive'
      && item.sourceNodeId === source.nodeId && (item.role ?? slot.role) === slot.role
      && edges.some(edge => edge.id === item.edgeId && edge.source === source.nodeId && edge.target === targetNodeId)));
    const selected = selectionTarget?.selections ?? [];
    const candidateRequest = { targetNodeId, chosenOperationId: operation,
      selections: [...selected.filter(item => item.sourceNodeId !== source.nodeId), {
        sourceNodeId: source.nodeId, outputId: source.outputId,
        targetSlot: selectionTarget?.targetSlot, role: selectionTarget?.role,
      }], replaceEdgeId: selectionTarget?.replaceEdgeId, replaceSlot: selectionTarget?.replaceSlot };
    const candidate = target?.data.inputBindingVersion === 1
      ? (inUse ? { status: 'allowed', verdict: validateCanvasInputSelection({ nodes, edges }, candidateRequest, context) }
        : planPickerSelectionMutation({ nodes, edges }, candidateRequest, context)) : undefined;
    const selectable = candidate ? candidate.status === 'allowed' && candidate.verdict?.accepts === true : true;
    const displayName = canvasResourceDisplayName(node, source);
    const size = dimensionPair(data);
    items.push({
      nodeId: node.id,
      outputId: source.outputId,
      textContent: source.output.text,
      inUse,
      selectable,
      reasonCode: candidate?.verdict?.reasonCode ?? (candidate && 'reasonCode' in candidate ? candidate.reasonCode : undefined),
      materialType,
      ...displayName,
      previewUrl: resolveMediaPreviewUrl(
        materialType,
        data.mediaAssets as MediaAssetLike[] | undefined,
        typeof data.mediaUrl === 'string' ? data.mediaUrl : undefined,
      ),
      alreadyConnected: connected.has(node.id),
      subtitle: materialType === 'text' ? source.output.text ?? '' : (size.width && size.height ? `${size.width} × ${size.height}` : ''),
      width: size.width,
      height: size.height,
    });
  }
  return items;
}

/** Translate an allowed graph plan into one strict store mutation; never replay selections. */
export function planPickerSelectionMutation(current: CanvasInputMutationState, request: CanvasInputSelectionRequest, context: CanvasMutationRuntimeContext): {
  status: 'allowed' | 'rejected' | 'configuration_error'; reasonCode?: string;
  mutation?: CanvasInputMutation; verdict?: CanvasInputSelectionVerdict;
} {
  const plan = planCanvasInputSelection(current, request, context);
  if (plan.status !== 'allowed') return { status: plan.status, reasonCode: plan.reasonCode };
  const verdict = validateCanvasInputSelection(plan, request, context);
  // The selection endpoint alone verifies the unique saved binding and reduction.
  // Apply only its binding result, without claiming the remaining graph is ready.
  if (request.setUse?.use === 'inactive' && !request.replaceEdgeId && !(request.selections?.length)) {
    const target = plan.nodes.find(node => node.id === request.targetNodeId)!;
    return { status: 'allowed', verdict, mutation: {
      nodePatches: [{ nodeId: target.id, data: { slotBindings: target.data.slotBindings } }],
    } };
  }
  if (!verdict.accepts) return { status: 'rejected', reasonCode: verdict.reasonCode, verdict };
  const nodePatches = plan.nodes.flatMap(node => {
    const previous = current.nodes.find(item => item.id === node.id);
    return previous && previous.data !== node.data ? [{ nodeId: node.id, data: node.data }] : [];
  });
  // Derived edge mirrors are recomputed by the original gateway after these explicit bindings.
  const addEdges = plan.edges.filter(edge => !current.edges.some(item => item.id === edge.id));
  const removeEdgeIds = current.edges.filter(edge => !plan.edges.some(item => item.id === edge.id)).map(edge => edge.id);
  return { status: 'allowed', verdict, mutation: { nodePatches, addEdges,
    removeEdgeIds: removeEdgeIds.length ? removeEdgeIds : undefined,
    strictConsumption: { targetNodeId: request.targetNodeId, chosenOperationId: request.chosenOperationId,
      ...(request.chosenRouteId !== undefined ? { chosenRouteId: request.chosenRouteId } : {}) } } };
}

export function pickerReasonKey(reasonCode?: string): string {
  switch (reasonCode) {
    case 'catalog_unavailable': case 'unknown_model': case 'not_listed': return 'input.reason.catalog';
    case 'input_waiting': return 'input.reason.waiting';
    case 'input_unavailable': case 'missing_node': case 'input_changed': return 'input.reason.unavailable';
    case 'slot_capacity': return 'input.reason.capacity';
    case 'mime_unsupported': return 'input.reason.format';
    case 'size_exceeded': return 'input.reason.size';
    case 'duration_exceeded': return 'input.reason.duration';
    case 'prompt_required': return 'input.reason.body';
    case 'min_unsatisfied': return 'input.reason.required';
    case 'mime_unknown': return 'input.reason.unknownFormat';
    case 'route_plan_required': case 'operation_confirmation_required': return 'input.reason.sameMethod';
    default: return 'input.reason.incompatible';
  }
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

function edgeDraft(source: string, target: string, targetSlot?: string) {
  return {
    source,
    sourceHandle: 'out',
    target,
    targetHandle: 'in',
    ...(targetSlot ? { data: { targetSlot } } : {}),
  };
}

/** 装填 pinned 占用进 slotBindings：max 1 替换；上限内追加；超限替换末位。 */
function pinOccupantInto(
  bindings: SlotBindings | undefined,
  slot: string,
  occupant: SlotOccupant,
  slotMax: number | null | undefined,
): SlotBindings {
  const next: SlotBindings = Object.fromEntries(
    Object.entries(bindings ?? {}).map(([key, values]) => [key, values.map((value) => ({ ...value }))]),
  );
  const list = (next[slot] ?? []).filter((item) => item.edgeId !== occupant.edgeId);
  if (slotMax === 1) {
    next[slot] = [occupant];
  } else if (typeof slotMax === 'number' && list.length >= slotMax && list.length > 0) {
    list[list.length - 1] = occupant;
    next[slot] = list;
  } else {
    next[slot] = [...list, occupant];
  }
  return next;
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
 * 置换 Mutation 计划生成器：
 * - 当在替换模式下确认选择某个素材时：
 *   - 如果该素材已在溢出池中，通过 slotEngine.promoteOverflowAsset 执行置换；
 *   - 如果来自其他节点或上传，生成建立连线并将原槽位退入溢出池的 Mutation Plan。
 */
export function planResourcePickerReplaceCommit(
  input: ResourcePickerReplaceCommitInput,
): ResourcePickerCommitPlan {
  const rejected: ResourcePickerRejection[] = [];
  const target = input.nodes.find((node) => node.id === input.targetNodeId);
  if (!target) {
    return { hasWork: false, rejected: [{ id: input.targetNodeId, reason: 'missing' }] };
  }

  const { targetNodeId, targetSlotIndex, slotState, selectedCanvasNodeId, localFile } = input;

  // 1. 如果选中了画布节点
  if (selectedCanvasNodeId) {
    if (selectedCanvasNodeId === targetNodeId) {
      return { hasWork: false, rejected: [{ id: selectedCanvasNodeId, reason: 'self' }] };
    }

    // 1.1 如果该素材已在溢出池中，通过 promoteOverflowAsset 直接执行置换
    if (slotState && slotState.overflowPool.some((o) => o.sourceNodeId === selectedCanvasNodeId)) {
      const nextSlotState = promoteOverflowAsset(slotState, selectedCanvasNodeId, targetSlotIndex);
      return {
        hasWork: true,
        rejected: [],
        nodePatches: [
          {
            nodeId: targetNodeId,
            data: {
              slotState: nextSlotState,
            },
          },
        ],
      };
    }

    // 1.2 来自其他画布节点（建立连线并将原槽位退入溢出池）
    const source = input.nodes.find((n) => n.id === selectedCanvasNodeId);
    if (!source) {
      return { hasWork: false, rejected: [{ id: selectedCanvasNodeId, reason: 'missing' }] };
    }
    if (!canConnect(source, target)) {
      return { hasWork: false, rejected: [{ id: selectedCanvasNodeId, reason: 'type_contract' }] };
    }

    const addEdges = [edgeDraft(selectedCanvasNodeId, targetNodeId)];
    const nodePatches: NonNullable<CanvasInputMutation['nodePatches']> = [];

    if (slotState) {
      const currentSlotItem = slotState.activeSlots.find((s) => s.slotIndex === targetSlotIndex);
      const nextOverflow = [...slotState.overflowPool];
      if (currentSlotItem) {
        nextOverflow.push({
          sourceNodeId: currentSlotItem.sourceNodeId,
          edgeId: currentSlotItem.edgeId,
          materialType: currentSlotItem.materialType,
          mediaUrl: currentSlotItem.mediaUrl,
          label: currentSlotItem.label,
          mimeType: currentSlotItem.mimeType,
          addedAt: Date.now(),
        });
      }
      const sData = nodeData(source);
      const nextActive = slotState.activeSlots.filter((s) => s.slotIndex !== targetSlotIndex);
      nextActive.push({
        slotId: `slot_${targetSlotIndex}`,
        slotIndex: targetSlotIndex,
        sourceNodeId: selectedCanvasNodeId,
        materialType: asMaterialType(sData.materialType) ?? 'image',
        mediaUrl: typeof sData.mediaUrl === 'string' ? sData.mediaUrl : undefined,
        label: resourceTitle(sData, selectedCanvasNodeId),
      });
      nextActive.sort((a, b) => a.slotIndex - b.slotIndex);
      const nextSlotState: NodeSlotEngineState = {
        ...slotState,
        activeSlots: nextActive,
        overflowPool: nextOverflow,
      };
      nodePatches.push({
        nodeId: targetNodeId,
        data: {
          slotState: nextSlotState,
        },
      });
    }

    return {
      hasWork: true,
      rejected: [],
      addEdges,
      nodePatches: nodePatches.length > 0 ? nodePatches : undefined,
    };
  }

  // 2. 如果是本地上传文件
  if (localFile) {
    const usable = usableMediaFiles([localFile], rejected);
    if (usable.length === 0) {
      return { hasWork: false, rejected };
    }
    const file = usable[0]!;
    const position = placeUpstream(target, 0, file.materialType);
    const node = createImportNode(file.materialType, position, {
      ...mediaPatch(file),
      label: file.name.replace(/\.[^.]+$/, '') || file.name,
    });
    if (!canConnect(node, target)) {
      return { hasWork: false, rejected: [{ id: file.id, reason: 'type_contract' }] };
    }

    const addNodes = [node];
    const addEdges = [edgeDraft(node.id, targetNodeId)];
    const nodePatches: NonNullable<CanvasInputMutation['nodePatches']> = [];

    if (slotState) {
      const currentSlotItem = slotState.activeSlots.find((s) => s.slotIndex === targetSlotIndex);
      const nextOverflow = [...slotState.overflowPool];
      if (currentSlotItem) {
        nextOverflow.push({
          sourceNodeId: currentSlotItem.sourceNodeId,
          edgeId: currentSlotItem.edgeId,
          materialType: currentSlotItem.materialType,
          mediaUrl: currentSlotItem.mediaUrl,
          label: currentSlotItem.label,
          mimeType: currentSlotItem.mimeType,
          addedAt: Date.now(),
        });
      }
      const nextActive = slotState.activeSlots.filter((s) => s.slotIndex !== targetSlotIndex);
      nextActive.push({
        slotId: `slot_${targetSlotIndex}`,
        slotIndex: targetSlotIndex,
        sourceNodeId: node.id,
        materialType: file.materialType,
        mediaUrl: typeof (node.data as Record<string, unknown> | undefined)?.mediaUrl === 'string'
          ? ((node.data as Record<string, unknown>).mediaUrl as string)
          : undefined,
        label: file.name.replace(/\.[^.]+$/, '') || file.name,
      });
      nextActive.sort((a, b) => a.slotIndex - b.slotIndex);
      const nextSlotState: NodeSlotEngineState = {
        ...slotState,
        activeSlots: nextActive,
        overflowPool: nextOverflow,
      };
      nodePatches.push({
        nodeId: targetNodeId,
        data: {
          slotState: nextSlotState,
        },
      });
    }

    return {
      hasWork: true,
      rejected: [],
      addNodes,
      addEdges,
      nodePatches: nodePatches.length > 0 ? nodePatches : undefined,
    };
  }

  return { hasWork: false, rejected };
}

/**
 * 计算一次提交对应的 canvas mutation。
 *
 * 画布资源：为尚未连入的选中节点添加 source→target 边。
 * 本地上传：全部可用文件都在当前节点左侧创建导入型上游节点并连线，
 * 不把任何文件写入当前节点卡片（避免把所选素材 patch 进当前节点替换素材）。
 */
export function planResourcePickerCommit(input: ResourcePickerCommitInput): ResourcePickerCommitPlan {
  if (input.replaceEdgeId) return planNamedOccupantReplacement(input);
  // 如果是替换模式且提供了 targetSlotIndex，派发至置换 Mutation 计划生成器
  if (input.mode === 'replace' && typeof input.targetSlotIndex === 'number') {
    return planResourcePickerReplaceCommit({
      nodes: input.nodes,
      edges: input.edges,
      targetNodeId: input.targetNodeId,
      targetSlotIndex: input.targetSlotIndex,
      slotState: input.slotState,
      selectedCanvasNodeId: input.selectedCanvasNodeIds[0],
      localFile: input.localFiles[0],
    });
  }

  const rejected: ResourcePickerRejection[] = [];
  const addEdges: NonNullable<CanvasInputMutation['addEdges']> = [];
  const addNodes: CanvasNode[] = [];
  const targetSlot = input.targetSlot?.trim() || undefined;
  const acceptedTypes = input.acceptedTypes?.length ? new Set(input.acceptedTypes) : null;

  const target = input.nodes.find((node) => node.id === input.targetNodeId);
  if (!target) {
    return { hasWork: false, rejected: [{ id: input.targetNodeId, reason: 'missing' }] };
  }

  const existing = incomingSourceIds(input.edges, input.targetNodeId);
  const seenSources = new Set<string>(existing);
  // 已连入但未被消费的供给：直接装填（pinned 进目标 slot），不重复连线。
  let pinnedBindings: SlotBindings | undefined;
  let pinned = false;

  for (const nodeId of input.selectedCanvasNodeIds) {
    if (nodeId === input.targetNodeId) {
      rejected.push({ id: nodeId, reason: 'self' });
      continue;
    }
    const source = input.nodes.find((node) => node.id === nodeId);
    if (!source) {
      rejected.push({ id: nodeId, reason: 'missing' });
      continue;
    }
    if (acceptedTypes && !acceptedTypes.has(asMaterialType(nodeData(source).materialType) ?? '')) {
      rejected.push({ id: nodeId, reason: 'unsupported' });
      continue;
    }
    if (existing.has(nodeId) || seenSources.has(nodeId)) {
      if (targetSlot && existing.has(nodeId)) {
        const edge = input.edges.find((item) => item.target === input.targetNodeId && item.source === nodeId);
        if (edge) {
          pinnedBindings = pinOccupantInto(
            pinnedBindings ?? (nodeData(target).slotBindings as SlotBindings | undefined),
            targetSlot,
            { sourceNodeId: nodeId, edgeId: edge.id, pinned: true },
            input.slotMax,
          );
          pinned = true;
          continue;
        }
      }
      rejected.push({ id: nodeId, reason: 'already_connected' });
      continue;
    }
    if (!canConnect(source, target)) {
      rejected.push({ id: nodeId, reason: 'type_contract' });
      continue;
    }
    addEdges.push(edgeDraft(nodeId, input.targetNodeId, targetSlot));
    seenSources.add(nodeId);
  }

  // 本地上传：全部可用文件都在当前节点左侧创建导入型上游并连线。
  // 产品预期是新建上游节点并连到当前节点，而非把所选文件 patch 进当前卡片。
  const usableFiles = usableMediaFiles(input.localFiles, rejected)
    .filter((file) => {
      if (acceptedTypes && !acceptedTypes.has(file.materialType)) {
        rejected.push({ id: file.id, reason: 'unsupported' });
        return false;
      }
      return true;
    });

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
    addEdges.push(edgeDraft(node.id, input.targetNodeId, targetSlot));
    seenSources.add(node.id);
    upstreamIndex += 1;
  }

  const nodePatches: CanvasInputNodePatch[] | undefined = pinned && pinnedBindings
    ? [{ nodeId: input.targetNodeId, data: { slotBindings: pinnedBindings } }]
    : undefined;
  const hasWork = addNodes.length > 0 || addEdges.length > 0 || Boolean(nodePatches);
  return {
    hasWork,
    rejected,
    ...(nodePatches ? { nodePatches } : {}),
    addNodes: addNodes.length > 0 ? addNodes : undefined,
    addEdges: addEdges.length > 0 ? addEdges : undefined,
  };
}

/** Replace one current occupant atomically while retaining every supply edge. */
function planNamedOccupantReplacement(input: ResourcePickerCommitInput): ResourcePickerCommitPlan {
  const target = input.nodes.find((node) => node.id === input.targetNodeId);
  const slot = input.targetSlot;
  const bindings = target ? nodeData(target).slotBindings as SlotBindings | undefined : undefined;
  const occupants = slot ? bindings?.[slot] : undefined;
  const index = occupants?.findIndex((item) => item.edgeId === input.replaceEdgeId) ?? -1;
  if (!target || !slot || !occupants || index < 0) {
    return { hasWork: false, rejected: [{ id: input.replaceEdgeId!, reason: 'missing' }] };
  }
  if (input.selectedCanvasNodeIds.length + input.localFiles.length !== 1) {
    return { hasWork: false, rejected: [{ id: target.id, reason: 'unsupported' }] };
  }
  const selectedId = input.selectedCanvasNodeIds[0];
  if (selectedId && occupants.some((item) => item.sourceNodeId === selectedId)) {
    return { hasWork: false, rejected: [{ id: selectedId, reason: 'already_connected' }] };
  }
  // Reuse source/file validation, but omit slot hints: the explicit patch owns placement.
  const plan = planResourcePickerCommit({ ...input, replaceEdgeId: undefined,
    targetSlot: undefined, targetSlotIndex: undefined, mode: 'add' });
  const existingEdge = selectedId ? input.edges.find((edge) => edge.target === target.id && edge.source === selectedId) : undefined;
  const source = selectedId ? input.nodes.find((node) => node.id === selectedId) : plan.addNodes?.[0];
  if (!source || (input.acceptedTypes?.length && !input.acceptedTypes.includes(String(nodeData(source).materialType)))) {
    return { hasWork: false, rejected: [{ id: selectedId ?? target.id, reason: 'unsupported' }] };
  }
  if (!existingEdge && (!plan.hasWork || plan.rejected.length)) return plan;
  const newEdges = plan.addEdges?.map(normalizeCanvasEdge);
  const edge = existingEdge ?? newEdges?.[0];
  if (!edge) return { hasWork: false, rejected: [{ id: source.id, reason: 'missing' }] };
  const next = occupants.map((item, position) => position === index
    ? { sourceNodeId: source.id, edgeId: edge.id, pinned: true }
    : { ...item, pinned: true });
  return { hasWork: true, rejected: [], addNodes: plan.addNodes, addEdges: newEdges,
    nodePatches: [{ nodeId: target.id, data: { slotBindings: { ...bindings, [slot]: next },
      slotStandbyEdgeIds: [...new Set([
        ...(Array.isArray(target.data.slotStandbyEdgeIds) ? target.data.slotStandbyEdgeIds.filter((id): id is string => typeof id === 'string') : []),
        input.replaceEdgeId!,
      ])].filter((id) => id !== edge.id),
    } }] };
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
 * 已有导入节点的填充 / 替换，或空状态生成节点的就地蜕变：
 * 首个文件写入当前节点（可改 materialType，转为 import 节点），
 * 其余文件在下方落成独立导入节点，不连线、不生成。
 * 导入素材节点不接受上游输入做模型生成，自动断开所有连入该节点的边（edge.target === targetNodeId），
 * 下游输出边（edge.source === targetNodeId）完整保留。
 */
export function planImportNodeFill(input: {
  nodes: CanvasNode[];
  targetNodeId: string;
  files: LocalFileDraft[];
  edges?: Edge[];
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

  const removeEdgeIds = (input.edges ?? [])
    .filter((edge) => edge.target === input.targetNodeId)
    .map((edge) => edge.id);

  return {
    hasWork: true,
    rejected,
    nodePatches,
    addNodes: addNodes.length > 0 ? addNodes : undefined,
    removeEdgeIds: removeEdgeIds.length > 0 ? removeEdgeIds : undefined,
  };
}
