import { createImportNode } from '../../shared/graph/nodeFactory.ts';
import type { CanvasNode } from '../../shared/graph/canvasInputMutationGateway.ts';
import { buildMediaMetadata } from '../../shared/mediaMetadata.ts';
import { projectFileMediaUrl } from '../../shared/localMedia.ts';
import { readNodeInputSource } from '../../shared/graph/nodeInputSource.ts';

export interface DirectorReferenceImage {
  assetId: string;
  storageKey: string;
  url: string;
  mimeType: string;
  bytes: number;
  width: number;
  height: number;
}
export interface DirectorReferenceInput {
  nodes: readonly CanvasNode[];
  sourceNodeId: string;
  sceneId: string;
  sourceRevision: number;
  image: DirectorReferenceImage;
  title: string;
  referenceId?: string;
}
export interface DirectorReferencePlan {
  nodes: CanvasNode[];
  nodeId: string;
  created: boolean;
}

function safeId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value);
}

/** Planning does not establish project ownership, ledger confirmation or a live operation identity. */
export function planDirectorReferenceImage(input: DirectorReferenceInput): DirectorReferencePlan {
  const { sourceNodeId, sceneId, sourceRevision, image, referenceId } = input;
  const sources = input.nodes.filter(node => node.id === sourceNodeId);
  const source = sources[0];
  if (sources.length !== 1 || source?.type !== 'director' || !safeId(sourceNodeId) || !safeId(sceneId)
    || !Number.isSafeInteger(sourceRevision) || sourceRevision < 1
    || source.data.directorRevision !== sourceRevision || source.data.directorSceneId !== sceneId
    || (referenceId !== undefined && !safeId(referenceId))) throw new Error('参考图所属导演场景或修订已变化');
  const workspace = typeof image?.url === 'string'
    ? /^\/omnimux-workflow\/api\/workspaces\/([A-Za-z0-9_-]{1,120})\/file\?rel=/.exec(image.url)?.[1] : undefined;
  if (!image || !safeId(image.assetId) || typeof image.storageKey !== 'string'
    || !/^(artifacts\/|assets\/imported\/)[A-Za-z0-9_./ -]+$/.test(image.storageKey)
    || image.storageKey.split('/').some(part => !part || part === '.' || part === '..')
    || !workspace || image.url !== projectFileMediaUrl(workspace, image.storageKey)
    || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType)
    || ![image.bytes, image.width, image.height].every(value => Number.isSafeInteger(value) && value > 0)
    || typeof input.title !== 'string') throw new Error('参考图素材身份或元信息尚未确认');

  const sameSource = (node: CanvasNode) => node.data.directorReferenceSourceNodeId === sourceNodeId
    && node.data.directorReferenceSourceSceneId === sceneId;
  const candidates = input.nodes.filter(node =>
    (referenceId !== undefined && node.data.directorReferenceId === referenceId)
    || (sameSource(node) && (node.data.assetId === image.assetId || node.data.relativePath === image.storageKey)));
  if (candidates.length > 1) throw new Error('参考图存在多个冲突的画布引用');
  const existing = candidates[0];
  if (existing) {
    const data = existing.data;
    const dimensions = data.dimensions as { width?: unknown; height?: unknown } | undefined;
    const projected = readNodeInputSource(existing);
    const media = projected.output.mediaAssets?.[0];
    if (!sameSource(existing) || !safeId(existing.id) || input.nodes.filter(node => node.id === existing.id).length !== 1
      || existing.type !== 'material' || data.materialType !== 'image' || data.nodeKind !== 'import'
      || data.selectedTool !== 'import' || data.status !== 'completed'
      || data.directorSourceNodeId !== undefined || data.directorSourceSceneId !== undefined || data.directorSourceShotId !== undefined
      || data.directorCaptureSceneId !== undefined || data.directorCaptureShotId !== undefined || data.directorCaptureRevision !== undefined
      || !Number.isSafeInteger(data.directorReferenceSourceRevision)
      || Number(data.directorReferenceSourceRevision) < 1 || Number(data.directorReferenceSourceRevision) > sourceRevision
      || data.assetId !== image.assetId || data.relativePath !== image.storageKey || data.mediaUrl !== image.url
      || data.mimeType !== image.mimeType || data.sizeBytes !== image.bytes
      || dimensions?.width !== image.width || dimensions?.height !== image.height
      || !Array.isArray(data.mediaAssets) || data.mediaAssets.length !== 1
      || projected.availability !== 'ready' || media?.assetId !== image.assetId || media.relativePath !== image.storageKey
      || media.url !== image.url || media.mimeType !== image.mimeType || media.sizeBytes !== image.bytes) {
      throw new Error('参考图画布引用来源或素材已变化');
    }
    return { nodes: [...input.nodes], nodeId: existing.id, created: false };
  }

  const metadata = buildMediaMetadata({ mimeType: image.mimeType, sizeBytes: image.bytes });
  const node = createImportNode('image', { x: source.position.x + 420, y: source.position.y }, {
    label: input.title.trim() || '参考图', status: 'completed',
    mediaUrl: image.url, relativePath: image.storageKey, assetId: image.assetId,
    ...metadata, dimensions: { width: image.width, height: image.height },
    mediaAssets: [{ type: 'image', url: image.url, relativePath: image.storageKey, assetId: image.assetId, ...metadata }],
    directorReferenceSourceNodeId: sourceNodeId, directorReferenceSourceSceneId: sceneId,
    directorReferenceSourceRevision: sourceRevision,
    ...(referenceId !== undefined ? { directorReferenceId: referenceId } : {}),
  });
  if (!safeId(node.id) || input.nodes.some(existingNode => existingNode.id === node.id)) throw new Error('参考图新节点身份已被占用');
  return { nodes: [...input.nodes, node], nodeId: node.id, created: true };
}
