import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { directorSceneSchema, type DirectorDocument, type StoredDirectorScene } from '../../shared/directorSchema.ts';
import { DirectorHostError, type DirectorHost } from '../director/directorHost.ts';
import { mutateWorkspaceGraph } from '../graph/GraphMutator.ts';
import {
  type AgentToolSpec, type WorkflowAgentDeps, defaultNodePosition, errorBody, extractSessionContext,
  bindCanvasWorkspaceProject, jsonOut, resolveTargetWorkspaceId,
} from './agentToolShared.ts';

export interface DirectorToolsDeps extends Pick<WorkflowAgentDeps,
  'store' | 'getActiveView' | 'projectStore' | 'resolveSessionWorkspaceDir' | 'bindWorkspaceProject' | 'ensureProjectBound'> {
  host: DirectorHost;
  /** Trusted Host/browser boundary. The adapter owns capture, persistence and durable receipts. */
  operations?: {
    request: (request: DirectorOperationRequest) => unknown | Promise<unknown>;
    get: (query: DirectorOperationQuery) => unknown | Promise<unknown>;
  };
}
const operationId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/);
const identityFields = { schemaVersion: z.literal(1), operationId, workspaceId: operationId, nodeId: operationId,
  sceneId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/), projectKey: z.string().regex(/^[a-f0-9]{64}$/),
  sourceRevision: z.number().int().positive(), workspaceVersion: z.number().int().min(0) };
const shotSchema = z.strictObject({ id: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
  cameraId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/), duration: z.number().finite().min(0.5).max(120), fps: z.union([z.literal(24), z.literal(25), z.literal(30)]) });
export const directorOperationRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({ ...identityFields, action: z.literal('open') }),
  z.strictObject({ ...identityFields, action: z.literal('export'), kind: z.enum(['image', 'video']), shot: shotSchema }),
]);
export type DirectorOperationRequest = z.infer<typeof directorOperationRequestSchema>;
const operationQuerySchema = z.strictObject(identityFields);
export type DirectorOperationQuery = z.infer<typeof operationQuerySchema>;
const resourceSchema = z.strictObject({ confirmed: z.literal(true), assetId: operationId, outputNodeId: operationId,
  storageKey: z.string().regex(/^artifacts\/director\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(png|jpg|webp|webm|mp4)$/),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'video/webm', 'video/mp4']),
  bytes: z.number().int().positive().max(100 * 1024 * 1024), width: z.number().int().positive().max(8192),
  height: z.number().int().positive().max(8192), durationSec: z.number().finite().positive().max(120).optional() });
export const directorOperationReceiptSchema = z.strictObject({ ...identityFields, action: z.enum(['open', 'export']),
  kind: z.enum(['image', 'video']).optional(), shot: shotSchema.optional(),
  status: z.enum(['pending', 'running', 'completed', 'error', 'cancelled']), error: z.string().min(1).max(240).optional(),
  confirmed: z.literal(true).optional(), opened: z.literal(true).optional(), resource: resourceSchema.optional() });
export type DirectorOperationReceipt = z.infer<typeof directorOperationReceiptSchema>;
function projectKey(deps: DirectorToolsDeps, workspaceId: string, nodeId: string): string {
  return createHash('sha256').update(deps.host.projectRootFor(workspaceId, nodeId)).digest('hex');
}
/** Graph-side director user intent; scene payload and revision are owned by the Host document. */
export function directorOperationSourceHash(node: { id: string; type?: string; data?: unknown } | undefined, sourceSceneId: string): string {
  if (!node || node.type !== 'director') throw new DirectorHostError('director-node-not-found');
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (data.directorSceneId !== undefined && data.directorSceneId !== sourceSceneId) throw new DirectorHostError('director-operation-identity-mismatch');
  const sourceIdentity = { id: node.id, type: node.type, sourceSceneId,
    title: data.title, label: data.label, description: data.description,
    directorDescriptionEdit: data.directorDescriptionEdit,
    directorDescriptionSourceRevision: data.directorDescriptionSourceRevision,
    directorDescriptionSceneId: data.directorDescriptionSceneId,
    directorDescriptionShotId: data.directorDescriptionShotId };
  return createHash('sha256').update(JSON.stringify(sourceIdentity)).digest('hex');
}
function operationResult(deps: DirectorToolsDeps, input: unknown, expected: DirectorOperationQuery | DirectorOperationRequest, sourceHash: string) {
  const document = deps.host.getScene(expected.workspaceId, expected.nodeId);
  if (document.revision !== expected.sourceRevision || document.scene.id !== expected.sceneId
    || projectKey(deps, expected.workspaceId, expected.nodeId) !== expected.projectKey) {
    return errorBody('version_conflict', '操作期间项目或场景已变化；迟到回执不能作为当前成果');
  }
  const node = deps.store.get(expected.workspaceId).nodes.find(node => node.id === expected.nodeId);
  if (directorOperationSourceHash(node, document.scene.id) !== sourceHash) {
    return errorBody('director-operation-identity-mismatch', '操作期间节点意图已变化；迟到回执不能作为当前成果');
  }
  const parsed = directorOperationReceiptSchema.safeParse(input);
  if (!parsed.success) return errorBody('director-operation-invalid-receipt', '浏览器操作回执不符合公开格式');
  const receipt = parsed.data;
  if ((receipt.action === 'open' && (receipt.kind || receipt.shot || receipt.resource))
    || (receipt.action === 'export' && (receipt.opened || receipt.confirmed))
    || (receipt.status === 'error' && !receipt.error)
    || (receipt.status !== 'error' && receipt.error)
    || (receipt.status !== 'completed' && (receipt.resource || receipt.confirmed || receipt.opened))) {
    return errorBody('director-operation-invalid-receipt', '浏览器操作状态与回执内容不一致');
  }
  for (const key of Object.keys(identityFields) as Array<keyof DirectorOperationQuery>) {
    // Export projection advances the graph; status queries use the latest version, receipts retain the source version.
    if (key === 'workspaceVersion' && !('action' in expected) && receipt.workspaceVersion <= expected.workspaceVersion) continue;
    if (receipt[key] !== expected[key]) return errorBody('director-operation-identity-mismatch', '浏览器回执不属于当前项目、节点或场景版本');
  }
  if (receipt.action === 'export') {
    if (!receipt.kind || !receipt.shot) return errorBody('director-operation-invalid-receipt', '导出回执缺少镜头身份');
    const shot = document.scene.shots.find(item => item.id === receipt.shot!.id);
    if (!shot || shot.cameraId !== receipt.shot.cameraId || shot.duration !== receipt.shot.duration || shot.fps !== receipt.shot.fps) {
      return errorBody('director-operation-identity-mismatch', '导出镜头身份与权威场景不一致');
    }
  }
  if ('action' in expected && (receipt.action !== expected.action || (expected.action === 'export'
    && (receipt.kind !== expected.kind || JSON.stringify(receipt.shot) !== JSON.stringify(expected.shot))))) {
    return errorBody('director-operation-identity-mismatch', '浏览器回执与请求镜头不一致');
  }
  if (receipt.status === 'completed') {
    if (receipt.action === 'open') {
      if (!receipt.confirmed || !receipt.opened || receipt.resource || receipt.kind || receipt.shot) {
        return errorBody('director-operation-unconfirmed', '浏览器尚未确认已打开当前导演场景');
      }
    } else {
      const resource = receipt.resource;
      if (!resource || !receipt.shot || !receipt.kind) return errorBody('director-operation-unconfirmed', '导出缺少已确认受管成果');
      const scene = deps.host.getScene(receipt.workspaceId, receipt.nodeId).scene;
      const shot = scene.shots.find(item => item.id === receipt.shot!.id);
      if (!shot || shot.cameraId !== receipt.shot.cameraId || shot.duration !== receipt.shot.duration || shot.fps !== receipt.shot.fps) {
        return errorBody('director-operation-identity-mismatch', '导出镜头身份与权威场景不一致');
      }
      const suffix = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/webm': 'webm', 'video/mp4': 'mp4' } as const)[resource.mimeType];
      if (!resource.storageKey.startsWith(`artifacts/director/${receipt.workspaceId}/${receipt.nodeId}/`)
        || !resource.storageKey.endsWith(`.${suffix}`) || !resource.mimeType.startsWith(`${receipt.kind}/`)
        || (receipt.kind === 'video' && (resource.durationSec === undefined
          || Math.abs(resource.durationSec - shot.duration) > Math.max(0.3, shot.duration * 0.05)))
        || (receipt.kind === 'image' && resource.durationSec !== undefined)) {
        return errorBody('director-operation-unconfirmed', '导出成果格式、时长或受管身份未确认');
      }
      const node = deps.store.get(receipt.workspaceId).nodes.find(item => item.id === resource.outputNodeId);
      const data = node?.data as Record<string, unknown> | undefined;
      const dimensions = data?.dimensions as { width?: unknown; height?: unknown } | undefined;
      if (node?.type !== 'material' || data?.materialType !== receipt.kind || data.status !== 'completed'
        || data.assetId !== resource.assetId || data.relativePath !== resource.storageKey || data.mimeType !== resource.mimeType
        || data.sizeBytes !== resource.bytes || dimensions?.width !== resource.width || dimensions.height !== resource.height
        || data.directorSourceNodeId !== receipt.nodeId || data.directorSourceRevision !== receipt.sourceRevision
        || (receipt.kind === 'video' && data.durationSec !== resource.durationSec)) {
        return errorBody('director-operation-unconfirmed', '当前画布成果节点与导出确认回执不一致');
      }
    }
    return { ok: true, operationId: receipt.operationId, status: receipt.status, completed: true, receipt,
      ...(receipt.resource ? { resource: receipt.resource } : {}) };
  }
  return { ok: receipt.status === 'pending' || receipt.status === 'running', operationId: receipt.operationId,
    status: receipt.status, completed: false, receipt, next: 'query-director-operation-status' };
}
const targetFields = { workspace_id: z.string().min(1).optional(), workspace_name: z.string().min(1).optional() };
const createArgs = z.strictObject({ action: z.literal('create'), ...targetFields,
  title: z.string().min(1).max(240).optional(), description: z.string().max(20000).optional(),
  position: z.strictObject({ x: z.number().finite(), y: z.number().finite() }).optional(), scene: directorSceneSchema.optional(),
});
const readArgs = z.strictObject({ action: z.literal('read'), ...targetFields, node_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/) });
const saveArgs = z.strictObject({ action: z.literal('save'), ...targetFields, node_id: readArgs.shape.node_id,
  expected_revision: z.number().int().min(0), scene: directorSceneSchema,
});
const openArgs = z.strictObject({ action: z.literal('open'), ...targetFields, node_id: readArgs.shape.node_id,
  expected_revision: z.number().int().positive(),
});
const exportArgs = z.strictObject({ ...openArgs.shape, action: z.literal('export'), kind: z.enum(['image', 'video']),
  shot_id: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/).optional(),
});
const statusArgs = z.strictObject({ action: z.literal('status'), ...targetFields, node_id: readArgs.shape.node_id,
  operation_id: readArgs.shape.node_id.optional(),
});
const argsSchema = z.discriminatedUnion('action', [createArgs, readArgs, saveArgs, openArgs, exportArgs, statusArgs]);
function unavailable() {
  return { ...errorBody('director-operations-unavailable', '浏览器导演操作尚未接通；保存场景不代表已打开或已导出'),
    status: 'unavailable', next: 'connect-director-browser-operations' };
}

function emptyScene(title: string): StoredDirectorScene {
  const timestamp = new Date().toISOString();
  return { id: `scene_${randomUUID()}`, version: 1, title, background: '#060608', environmentIntensity: 0.7,
    gridVisible: true, objects: [], cameras: [{ id: 'camera_1', name: '机位 1',
      transform: { position: [0, 2, 5], rotation: [0, 0, 0], scale: [1, 1, 1] }, target: [0, 1, 0],
      focalLength: 35, fov: 50, aperture: 2.8, focusDistance: 5, near: 0.1, far: 1000, keyframes: [] }],
    lights: [], shots: [{ id: 'shot_1', name: '镜头 1', cameraId: 'camera_1', duration: 5, fps: 30,
      shotSize: 'medium', cameraMove: 'static', prompt: '' }], activeShotId: 'shot_1', createdAt: timestamp, updatedAt: timestamp };
}
/** Host schemas strip unknown object keys; the public tool rejects them instead. */
function hasUnknownFields(input: unknown, parsed: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  if (!parsed || typeof parsed !== 'object') return true;
  const accepted = parsed as Record<string, unknown>;
  return Object.keys(input).some(key => !Object.hasOwn(accepted, key)
    || hasUnknownFields((input as Record<string, unknown>)[key], accepted[key]));
}
function failure(error: unknown) {
  const code = error instanceof DirectorHostError ? error.code
    : error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code : 'director-operation-failed';
  return errorBody(code, '导演操作未完成；请检查当前项目、权限与场景版本后重试');
}

/** Public Agent boundary; scene authority remains the same project document used by the UI. */
export function createDirectorTools(deps: DirectorToolsDeps): AgentToolSpec[] {
  return [{ name: 'workflow_director', description: '在当前项目画布创建、读取、保存导演场景，打开导演台、显式导出构图图或白膜视频并查询操作状态。save提交完整scene与expected_revision；open/export交给浏览器，pending不等于完成，缺浏览器桥明确不可用。只使用项目主机权威场景，不接受任意data、路径或脚本写入。',
    parameters: { ...z.toJSONSchema(argsSchema, { unrepresentable: 'any' }), type: 'object' }, output: jsonOut,
    async execute(input, exec) {
      const parsed = argsSchema.safeParse(input);
      if (!parsed.success || hasUnknownFields(input, parsed.data)) return errorBody('invalid-args', '导演操作参数不符合公开场景格式');
      const args = parsed.data;
      try {
        const operations = typeof deps.operations?.request === 'function' && typeof deps.operations?.get === 'function'
          ? deps.operations : undefined;
        const sessionContext = extractSessionContext(exec);
        const target = resolveTargetWorkspaceId(deps.store, args, { ...deps, sessionContext });
        if ('error' in target) return target;
        const { workspaceId } = target;
        // Recheck the resolved id through the shared explicit-project guard, including name resolution.
        const boundary = resolveTargetWorkspaceId(deps.store, { workspace_id: workspaceId }, { ...deps, sessionContext });
        if ('error' in boundary) return boundary;
        if (args.action === 'read') return { ok: true, workspaceId, nodeId: args.node_id,
          document: deps.host.getScene(workspaceId, args.node_id), workspaceVersion: deps.store.get(workspaceId).version };
        if (args.action === 'status') {
          const document = deps.host.getScene(workspaceId, args.node_id);
          if (args.operation_id) {
            if (!operations) return unavailable();
            const query: DirectorOperationQuery = { schemaVersion: 1, operationId: args.operation_id, workspaceId,
              nodeId: args.node_id, sceneId: document.scene.id, projectKey: projectKey(deps, workspaceId, args.node_id),
              sourceRevision: document.revision, workspaceVersion: deps.store.get(workspaceId).version };
            const sourceHash = directorOperationSourceHash(deps.store.get(workspaceId).nodes.find(node => node.id === args.node_id), document.scene.id);
            const receipt = await operations.get(query);
            if (receipt == null) return errorBody('director-operation-not-found', '没有当前操作的浏览器回执');
            return operationResult(deps, receipt, query, sourceHash);
          }
          return { ok: true, workspaceId, nodeId: args.node_id, revision: document.revision,
            workspaceVersion: deps.store.get(workspaceId).version, sceneStatus: 'saved', operationsStatus: operations ? 'available' : 'unavailable',
            exportStatus: 'unknown', next: operations ? 'request-director-browser-operation' : 'connect-director-browser-operations' };
        }
        if (args.action === 'open' || args.action === 'export') {
          const document = deps.host.getScene(workspaceId, args.node_id);
          if (document.revision !== args.expected_revision) return errorBody('version_conflict', '场景版本已变化；请重新读取后再操作');
          const identity: DirectorOperationQuery = { schemaVersion: 1, operationId: `operation_${randomUUID()}`, workspaceId,
            nodeId: args.node_id, sceneId: document.scene.id, projectKey: projectKey(deps, workspaceId, args.node_id),
            sourceRevision: document.revision, workspaceVersion: deps.store.get(workspaceId).version };
          let request: DirectorOperationRequest;
          if (args.action === 'export') {
            const shot = document.scene.shots.find(item => item.id === (args.shot_id ?? document.scene.activeShotId));
            if (!shot) return errorBody('director-shot-not-found', '当前场景不存在所选镜头');
            request = { ...identity, action: 'export', kind: args.kind,
              shot: { id: shot.id, cameraId: shot.cameraId, duration: shot.duration, fps: shot.fps } };
          } else request = { ...identity, action: 'open' };
          if (!operations) return unavailable();
          const sourceHash = directorOperationSourceHash(deps.store.get(workspaceId).nodes.find(node => node.id === args.node_id), document.scene.id);
          return operationResult(deps, await operations.request(request), request, sourceHash);
        }
        if (args.action === 'save') {
          let current: DirectorDocument | undefined;
          try { current = deps.host.getScene(workspaceId, args.node_id); }
          catch (error) {
            if (!(error instanceof DirectorHostError && error.code === 'director-scene-not-found' && args.expected_revision === 0)) throw error;
          }
          if (current && current.scene.id !== args.scene.id) return errorBody('director-scene-identity-mismatch', '保存必须保持当前导演场景身份');
          const document = deps.host.saveScene(workspaceId, args.node_id, { expectedRevision: args.expected_revision, scene: args.scene });
          const summary = mutateWorkspaceGraph(deps.store, workspaceId, { nodePatches: [{ nodeId: args.node_id,
            data: { directorRevision: document.revision, directorSceneId: document.scene.id, directorActiveShotId: document.scene.activeShotId } }] });
          if (!summary.ok) return { ...errorBody(summary.error, summary.message), workspaceId, nodeId: args.node_id,
            sceneSaved: true, revision: document.revision, document, next: 'read-director-scene-and-sync-summary' };
          return { ok: true, workspaceId, nodeId: args.node_id, revision: document.revision,
            workspaceVersion: summary.snapshot.version, document };
        }
        const scene = args.scene ?? emptyScene(args.title ?? '3D 导演台');
        await bindCanvasWorkspaceProject(deps, workspaceId, scene.title, sessionContext);
        if (!deps.store.resolveProjectRoot(workspaceId) && deps.ensureProjectBound) await deps.ensureProjectBound(workspaceId, scene.title);
        if (!deps.store.resolveProjectRoot(workspaceId)) return errorBody('project-required', '请先将当前画布绑定到项目');
        const nodeId = `director_${randomUUID()}`;
        const snapshot = deps.store.get(workspaceId);
        const result = mutateWorkspaceGraph(deps.store, workspaceId, { addNodes: [{ id: nodeId, type: 'director',
          position: args.position ?? defaultNodePosition(snapshot), data: { title: scene.title, label: scene.title,
            description: args.description ?? '', directorRevision: 0, status: 'idle' } }] });
        if (!result.ok) return errorBody(result.error, result.message);
        try {
          const document = deps.host.saveScene(workspaceId, nodeId, { expectedRevision: 0, scene });
          const summary = mutateWorkspaceGraph(deps.store, workspaceId, { nodePatches: [{ nodeId,
            data: { directorRevision: document.revision, directorSceneId: document.scene.id, directorActiveShotId: document.scene.activeShotId } }] });
          if (!summary.ok) return { ...errorBody(summary.error, summary.message), workspaceId, nodeId, nodeCreated: true,
            sceneSaved: true, revision: document.revision, document, next: 'read-director-scene-and-sync-summary' };
          return { ok: true, workspaceId, nodeId, revision: document.revision, workspaceVersion: summary.snapshot.version, document };
        } catch (error) {
          return { ...failure(error), workspaceId, nodeId, nodeCreated: true, next: 'initialize-director-scene' };
        }
      } catch (error) { return failure(error); }
    } }];
}
