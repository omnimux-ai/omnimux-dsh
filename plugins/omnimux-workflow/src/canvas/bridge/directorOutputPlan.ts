import { createImportNode } from '../../shared/graph/nodeFactory.ts';
import type { CanvasNode } from '../../shared/graph/canvasInputMutationGateway.ts';
import { buildMediaMetadata } from '../../shared/mediaMetadata.ts';
import { directorFingerprint } from '../../shared/directorFingerprint.ts';

export interface DirectorOutputResource {
  assetId: string;
  storageKey: string;
  url: string;
  mimeType: string;
  bytes: number;
  width: number;
  height: number;
  durationSec?: number;
  fileName?: string;
  confirmed?: true;
  capturedSource?: { sceneId: string; shotId: string; revision: number; time?: number };
}
export interface DirectorOutputInput {
  nodes: readonly CanvasNode[];
  sourceNodeId: string;
  sourceRevision: number;
  sceneId: string;
  shotId: string;
  resources: { image?: DirectorOutputResource | null; video?: DirectorOutputResource | null };
  /**
   * 显式截图出口：每次截图都用一个新的节点 id，而不是复用同镜头的投影节点。
   * 只允许用于单张 image；省略时保持历史投影语义（同镜头复用、保留用户布局）。
   */
  freshNodeId?: string;
  /** 新节点的标题（只作用于新建节点；复用节点保留用户标题）。 */
  label?: string;
  /** 新节点的画布位置（省略时沿用历史投影位置）。 */
  position?: { x: number; y: number };
}
export interface DirectorOutputChange {
  nodeId: string;
  previousFingerprint: string | null;
  fingerprint: string;
}
export interface DirectorOutputPlan {
  nodes: CanvasNode[];
  outputNodeIds: Partial<Record<'image' | 'video', string>>;
  changes: DirectorOutputChange[];
}

/** Stable graph key, not an authentication hash; provenance is checked before replacement. */
function outputKey(parts: string[]): string {
  const text = JSON.stringify(parts);
  const lanes = [2166136261, 2246822507, 3266489909, 668265263];
  for (let index = 0; index < text.length; index++) {
    for (let lane = 0; lane < lanes.length; lane++) lanes[lane] = Math.imul(lanes[lane]! ^ (text.charCodeAt(index) + lane), 16777619 + lane * 2) >>> 0;
  }
  return lanes.map(value => value.toString(16).padStart(8, '0')).join('');
}

function managedOutputUrl(value: string): boolean {
  try {
    const decoded = decodeURIComponent(value);
    return value.startsWith('/omnimux-workflow/') && !/[\u0000-\u0020\u007f]/.test(value) && !/[\\\u0000-\u001f\u007f]/.test(decoded)
      && !decoded.split(/[/?#&=]/).some(part => part === '.' || part === '..');
  } catch { return false; }
}

/** Plan only; the caller must verify the capture's identity, scene snapshot and abort signal. */
export function planDirectorOutput(input: DirectorOutputInput): DirectorOutputPlan {
  const { sourceNodeId, sourceRevision, sceneId, shotId } = input;
  const source = input.nodes.find(node => node.id === sourceNodeId);
  if (!source || source.type !== 'director' || source.data.directorRevision !== sourceRevision
    || source.data.directorSceneId !== sceneId || !Number.isSafeInteger(sourceRevision) || sourceRevision < 1
    || ![sourceNodeId, sceneId, shotId].every(value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value))) throw new Error('导演输出来源身份或修订已变化');
  if (!input.resources.image && !input.resources.video) throw new Error('导演输出缺少已确认素材');
  if (input.freshNodeId !== undefined) {
    if (typeof input.freshNodeId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(input.freshNodeId)
      || input.nodes.some(node => node.id === input.freshNodeId)) throw new Error('导演新节点身份无效或已被占用');
    if (!input.resources.image || input.resources.video) throw new Error('导演新节点只支持单张截图');
    if (input.label !== undefined && (typeof input.label !== 'string' || !input.label.trim() || input.label.length > 120)) throw new Error('导演新节点标题无效');
    if (input.position !== undefined && (!Number.isFinite(input.position.x) || !Number.isFinite(input.position.y))) throw new Error('导演新节点位置无效');
  }
  for (const kind of ['image', 'video'] as const) {
    const resource = input.resources[kind];
    if (!resource) continue;
    const capture = resource.capturedSource;
    if (capture !== undefined && (!capture || capture.sceneId !== sceneId || capture.shotId !== shotId
      || !Number.isSafeInteger(capture.revision) || capture.revision < 1 || capture.revision > sourceRevision
      || (capture.time !== undefined && (!Number.isFinite(capture.time) || capture.time < 0)))) {
      throw new Error('导演截图原捕获来源不匹配');
    }
    if (typeof resource.assetId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(resource.assetId)
      || typeof resource.storageKey !== 'string' || !/^(artifacts\/|assets\/imported\/)[A-Za-z0-9_./ -]+$/.test(resource.storageKey)
      || resource.storageKey.split('/').some(part => !part || part === '.' || part === '..')
      || typeof resource.url !== 'string' || !managedOutputUrl(resource.url)
      || !(kind === 'image' ? ['image/png', 'image/jpeg', 'image/webp'] : ['video/webm', 'video/mp4']).includes(resource.mimeType)
      || !Number.isSafeInteger(resource.bytes) || resource.bytes <= 0
      || !Number.isSafeInteger(resource.width) || resource.width <= 0
      || !Number.isSafeInteger(resource.height) || resource.height <= 0
      || (kind === 'video' && (!Number.isFinite(resource.durationSec) || resource.durationSec! <= 0))) {
      throw new Error('导演输出素材身份或元信息尚未确认');
    }
  }
  const nodes = [...input.nodes];
  const changes: DirectorOutputChange[] = [];
  const outputNodeIds: DirectorOutputPlan['outputNodeIds'] = {};
  for (const kind of ['image', 'video'] as const) {
    const resource = input.resources[kind];
    if (!resource) continue;
    const fresh = kind === 'image' && input.freshNodeId !== undefined;
    const id = fresh ? input.freshNodeId! : `director-output-${kind}-${outputKey([sourceNodeId, sceneId, shotId])}`;
    const index = nodes.findIndex(node => node.id === id);
    const existing = nodes[index];
    if (existing && (existing.type !== 'material' || existing.data.materialType !== kind
      || existing.data.nodeKind !== 'import' || existing.data.directorSourceNodeId !== sourceNodeId
      || existing.data.directorSourceSceneId !== sceneId || existing.data.directorSourceShotId !== shotId
      || !Number.isSafeInteger(existing.data.directorSourceRevision)
      || Number(existing.data.directorSourceRevision) > sourceRevision)) {
      throw new Error('导演输出节点身份已被其他内容占用');
    }
    const metadata = buildMediaMetadata({ mimeType: resource.mimeType, sizeBytes: resource.bytes, durationSec: kind === 'video' ? resource.durationSec : null });
    const mediaAsset = { type: kind, url: resource.url, relativePath: resource.storageKey, assetId: resource.assetId, ...metadata };
    const data = {
      ...existing?.data,
      label: typeof existing?.data.label === 'string'
        ? existing.data.label
        : (fresh && input.label !== undefined ? input.label.trim() : (kind === 'image' ? '导演构图' : '白膜参考视频')),
      materialType: kind, nodeKind: 'import' as const, selectedTool: 'import' as const, status: 'completed' as const,
      mediaUrl: resource.url, relativePath: resource.storageKey, assetId: resource.assetId,
      ...metadata, dimensions: { width: resource.width, height: resource.height },
      mediaAssets: [mediaAsset],
      ...(resource.confirmed === true ? { metadataProvenance: 'media-inspector' } : {}),
      directorSourceNodeId: sourceNodeId, directorSourceSceneId: sceneId,
      directorSourceShotId: shotId, directorSourceRevision: sourceRevision,
    };
    for (const key of ['realPath', 'isMissing', 'fileMissing', 'fileCorrupted', 'isOffline', 'probeStatus', 'executionStatus', 'errorMessage']) {
      delete (data as Record<string, unknown>)[key];
    }
    if (resource.confirmed !== true) delete (data as Record<string, unknown>).metadataProvenance;
    for (const key of ['directorCaptureSceneId', 'directorCaptureShotId', 'directorCaptureRevision']) delete (data as Record<string, unknown>)[key];
    if (resource.capturedSource) Object.assign(data, {
      directorCaptureSceneId: resource.capturedSource.sceneId, directorCaptureShotId: resource.capturedSource.shotId,
      directorCaptureRevision: resource.capturedSource.revision,
    });
    const created = existing ? { ...existing, data } : {
      ...createImportNode(kind, fresh && input.position ? input.position : { x: source.position.x + 420, y: source.position.y + (kind === 'video' ? 350 : 0) }, data), id,
    };
    if (existing) nodes[index] = created;
    else nodes.push(created);
    changes.push({ nodeId: id, previousFingerprint: existing ? directorFingerprint(existing) : null, fingerprint: directorFingerprint(created) });
    outputNodeIds[kind] = id;
  }
  return { nodes, changes, outputNodeIds };
}

export interface DirectorOutputRollback {
  nodes: CanvasNode[];
  rolledBackNodeIds: string[];
  conflicts: Array<{ nodeId: string; reason: 'changed' | 'missing' | 'previous-mismatch' }>;
}

/** Local compensation only. A remote version conflict must never trigger a force-save. */
export function rollbackDirectorOutput(
  current: readonly CanvasNode[], previous: readonly CanvasNode[], plan: DirectorOutputPlan,
): DirectorOutputRollback {
  const restored = new Map<string, CanvasNode | null>();
  const conflicts: DirectorOutputRollback['conflicts'] = [];
  const rolledBackNodeIds: string[] = [];
  for (const change of plan.changes) {
    const node = current.find(item => item.id === change.nodeId);
    if (!node) {
      if (change.previousFingerprint !== null) conflicts.push({ nodeId: change.nodeId, reason: 'missing' });
      continue;
    }
    if (directorFingerprint(node) !== change.fingerprint) {
      conflicts.push({ nodeId: change.nodeId, reason: 'changed' });
      continue;
    }
    const before = previous.find(item => item.id === change.nodeId);
    if ((before ? directorFingerprint(before) : null) !== change.previousFingerprint) {
      conflicts.push({ nodeId: change.nodeId, reason: 'previous-mismatch' });
      continue;
    }
    restored.set(change.nodeId, before ?? null);
    rolledBackNodeIds.push(change.nodeId);
  }
  const nodes = current.flatMap(node => !restored.has(node.id) ? [node] : restored.get(node.id) ? [restored.get(node.id)!] : []);
  return { nodes, rolledBackNodeIds, conflicts };
}
