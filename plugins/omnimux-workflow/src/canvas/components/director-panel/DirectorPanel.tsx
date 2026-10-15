import { useEffect, useRef, useState } from 'react';
import type { DirectorOperationRequestDto as DirectorOperationRequest } from '../../../shared/directorOperationTypes';
import type { DirectorAdapters, DirectorMountHandle, DirectorScene, DirectorSceneProps, DirectorImageResource } from '../../../director/contract';
import { DIRECTOR_OPEN_EVENT } from '../../nodes/definitions/director';
import { planDirectorOutput, rollbackDirectorOutput } from '../../bridge/directorOutputPlan';
import { planDirectorReferenceImage } from '../../bridge/directorReferencePlan';
import { registerDirectorCloseGuard } from '../../bridge/directorLifecycle';
import { loadDirectorRuntime } from '../../bridge/directorLoader';
import { getDirectorScene, importDirectorMedia, importDirectorModelFiles, managedDirectorUrl, saveDirectorScene, serializeDirectorScene } from '../../bridge/directorApi';
import { getWorkspaceAssets, request } from '../../bridge/apiClient';
import { directorScenePath } from '../../bridge/directorApi';
import { useCanvasStore } from '../../store/canvasStore';
import { directorFingerprint } from '../../../shared/directorFingerprint';
import { toast } from '../../ui';

function emptyScene(title: string): DirectorScene {
  const now = new Date().toISOString(), cameraId = crypto.randomUUID(), shotId = crypto.randomUUID();
  return { id: crypto.randomUUID(), version: 1, title, background: '#060608', environmentIntensity: 0.7, gridVisible: true,
    objects: [], cameras: [{ id: cameraId, name: '主摄影机', transform: { position: [3, 2, 5], rotation: [0, 0, 0], scale: [1, 1, 1] }, target: [0, 1, 0], focalLength: 35, fov: 50, aperture: 2.8, focusDistance: 5, near: 0.1, far: 1000, keyframes: [] }],
    lights: [{ id: crypto.randomUUID(), name: '主光', type: 'directional', transform: { position: [4, 6, 4], rotation: [0, 0, 0], scale: [1, 1, 1] }, color: '#ffffff', intensity: 2.4, castShadow: true },
      { id: crypto.randomUUID(), name: '环境光', type: 'ambient', transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, color: '#ffffff', intensity: 0.65, castShadow: false }],
    shots: [{ id: shotId, name: '镜头 1', cameraId, duration: 5, fps: 30, shotSize: 'medium', cameraMove: 'static', prompt: '' }], activeShotId: shotId, createdAt: now, updatedAt: now, aspectRatio: 'adaptive' };
}

export function DirectorPanel({ workspaceId, saveGraph }: { workspaceId: string | null; saveGraph: () => Promise<number> }) {
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const saveRef = useRef(saveGraph); saveRef.current = saveGraph;
  const epoch = useRef(0);
  const mount = useRef<DirectorMountHandle | null>(null);
  const pendingOperation = useRef<{ request: DirectorOperationRequest; sceneHash: string } | null>(null);
  const operationBusy = useRef(false);
  const runOperation = useRef<((operation: { request: DirectorOperationRequest; sceneHash: string }) => Promise<void>) | null>(null);
  useEffect(() => {
    const listener = (event: Event) => {
      const id = (event as CustomEvent<{ nodeId?: unknown }>).detail?.nodeId;
      if (typeof id === 'string' && useCanvasStore.getState().nodes.some(node => node.id === id && node.type === 'director')) setNodeId(id);
    };
    window.addEventListener(DIRECTOR_OPEN_EVENT, listener);
    return () => window.removeEventListener(DIRECTOR_OPEN_EVENT, listener);
  }, []);
  useEffect(() => {
    if (!workspaceId) return;
    let stopped = false;
    const poll = async () => {
      if (stopped || operationBusy.current) return;
      const result = await request<{ operations: Array<{ request: DirectorOperationRequest; sceneHash: string; receipt: { status: string } }> }>(`/omnimux-workflow/api/workspaces/${encodeURIComponent(workspaceId)}/director-operations`);
      if (stopped || !result.ok) return;
      const next = result.body.operations.find(item => item.receipt.status === 'pending');
      if (!next) return;
      if (nodeId && nodeId !== next.request.nodeId) {
        if (!mount.current || !await mount.current.prepareClose()) return;
        mount.current.unmount(); mount.current = null;
      }
      pendingOperation.current = next;
      if (nodeId !== next.request.nodeId) setNodeId(next.request.nodeId);
      else if (runOperation.current) await runOperation.current(next);
    };
    const timer = window.setInterval(() => { void poll().catch(error => console.warn('导演操作轮询未完成', error instanceof Error ? error.name : 'error')); }, 1500);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [workspaceId, nodeId]);
  useEffect(() => {
    if (!nodeId || !workspaceId || !container.current) return;
    const operationEpoch = ++epoch.current;
    const controller = new AbortController();
    const element = container.current;
    let initialized = false;
    const unregisterClose = registerDirectorCloseGuard({ prepareClose: async () => mount.current ? mount.current.prepareClose() : initialized });
    let revision = 0;
    let coverGraphConfirmed = true;
    const importedModels = new Set<string>();
    let latest: DirectorScene;
    const check = () => {
      controller.signal.throwIfAborted();
      if (epoch.current !== operationEpoch || !useCanvasStore.getState().nodes.some(node => node.id === nodeId && node.type === 'director')) throw new DOMException('导演台所属节点已变化', 'AbortError');
    };
    const updateNode = (patch: Record<string, unknown>) => { check(); useCanvasStore.getState().setNodes(nodes => nodes.map(node => node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node)); };
    const projectUrl = (ref: string) => managedDirectorUrl(workspaceId, ref);
    const upload = async (blob: Blob, kind: 'image' | 'video') => { check(); const result = await importDirectorMedia(workspaceId, nodeId, kind, blob, revision, controller.signal); check(); return result; };
    const save = async (scene: DirectorScene, expectedRevision: number, signal: AbortSignal) => {
      check(); const document = await saveDirectorScene(workspaceId, nodeId, scene, expectedRevision, signal); check();
      revision = document.revision; latest = document.scene as DirectorScene;
      updateNode({ directorRevision: revision, directorSceneId: latest.id, directorActiveShotId: latest.activeShotId, description: latest.shots.find(shot => shot.id === latest.activeShotId)?.prompt || '', directorDescriptionApplied: useCanvasStore.getState().nodes.find(node => node.id === nodeId)?.data.directorDescriptionEdit });
      return { confirmed: true as const, revision, sceneId: latest.id };
    };
    setStatus('正在打开三维导演台');
    void (async () => {
      await saveRef.current(); check();
      const source = useCanvasStore.getState().nodes.find(node => node.id === nodeId)!;
      const loaded = await getDirectorScene(workspaceId, nodeId, controller.signal); check();
      if (loaded.ok) {
        latest = loaded.body.document.scene as DirectorScene; revision = loaded.body.document.revision;
        if (source.data.directorRevision !== revision || source.data.directorSceneId !== latest.id) updateNode({ directorRevision: revision, directorSceneId: latest.id });
        const description = String(source.data.description || '');
        const active = latest.shots.find(shot => shot.id === latest.activeShotId);
        if (active && source.data.directorDescriptionEdit && source.data.directorDescriptionEdit !== source.data.directorDescriptionApplied) {
          if (source.data.directorDescriptionSourceRevision !== revision || source.data.directorDescriptionSceneId !== latest.id || source.data.directorDescriptionShotId !== active.id) throw new Error('画布描述基于旧镜头，请保留描述并重新确认后再打开导演台');
          if (active.prompt !== description) { latest = { ...latest, shots: latest.shots.map(shot => shot.id === active.id ? { ...shot, prompt: description } : shot) }; await save(latest, revision, controller.signal); }
          else updateNode({ directorDescriptionApplied: source.data.directorDescriptionEdit });
        }
      }
      else if (loaded.body.error === 'director-scene-not-found' || (loaded.body.error === 'project-required' && !source.data.directorSceneId)) {
        latest = emptyScene(String(source.data.title || '3D 导演台')); latest.shots[0]!.prompt = String(source.data.description || '');
        await save(latest, 0, controller.signal);
      } else throw new Error(loaded.body.error || '导演场景无法读取，请保留原节点并重试');
      const apiPath = directorScenePath(workspaceId, nodeId);
      const session = await request<{ operatorScope: string; epoch: number; sessionDigest: string }>(`${apiPath}/session`, { signal: controller.signal }); check();
      if (!session.ok || !session.body.operatorScope) throw new Error('导演会话身份尚未确认');
      const capability = await request<{ analyzeImage: { available: boolean }; panorama: { available: boolean } }>(`${apiPath}/capabilities`, { signal: controller.signal }); check();
      const postAssistant = async <T,>(suffix: string, body: unknown, signal: AbortSignal) => {
        const result = await request<T>(`${apiPath}/${suffix}`, { method: 'POST', body, signal }); check();
        if (!result.ok) throw new Error(result.body.error || '导演智能辅助任务未完成');
        return result.body;
      };
      const adapters: DirectorAdapters = {
        resolveResource: async ref => projectUrl(ref), resolveBuiltInResource: ref => projectUrl(ref),
        resolveModelDependencies: async reference => {
          const result = await postAssistant<{ mainPath: string; dependencies: Array<{ uri: string; storageKey: string }>; embeddedUris: string[] }>('model-manifest', { reference }, controller.signal);
          return { mainUrl: projectUrl(result.mainPath), dependencies: result.dependencies.map(item => ({ uri: item.uri, url: projectUrl(item.storageKey) })), embeddedUris: result.embeddedUris };
        },
        saveScene: (scene, context) => save(scene, context.expectedRevision, context.signal),
        recoverSaveConflict: async (draft, context) => {
          check(); context.signal.throwIfAborted();
          const response = await getDirectorScene(workspaceId, nodeId, context.signal); check();
          if (!response.ok) throw new Error(response.body.error || '已保存场景无法读取');
          const current = response.body.document;
          if (current.workspaceId !== workspaceId || current.nodeId !== nodeId || current.scene.id !== context.identity.sceneId) throw new Error('恢复场景身份已变化');
          const accepted = await context.confirmReplacement({ identity: context.identity, revision: current.revision, scene: current.scene as DirectorScene });
          check(); context.signal.throwIfAborted();
          if (!accepted) return null;
          const confirmed = await saveDirectorScene(workspaceId, nodeId, draft, current.revision, context.signal); check();
          const reread = await getDirectorScene(workspaceId, nodeId, context.signal); check();
          if (!reread.ok || reread.body.document.revision !== confirmed.revision || directorFingerprint(reread.body.document.scene) !== directorFingerprint(serializeDirectorScene(draft))) throw new Error('恢复保存未收到完整回读确认');
          revision = confirmed.revision; latest = confirmed.scene as DirectorScene;
          updateNode({ directorRevision: revision, directorSceneId: latest.id, directorActiveShotId: latest.activeShotId });
          return { confirmed: true, revision, sceneId: latest.id, sceneFingerprint: directorFingerprint(draft) };
        },
        addCanvasImage: async (image, title, context) => {
          check(); context.signal.throwIfAborted();
          const registered = await getWorkspaceAssets(workspaceId, context.signal); check();
          const item = registered.body.assets?.items.find(asset => asset.id === image.assetId && asset.relative_path === image.storageKey);
          if (!registered.ok || !item || (item.sizeBytes ?? item.size) !== image.bytes || item.mimeType !== image.mimeType) throw new Error('参考图尚未收到项目素材确认');
          const previous = useCanvasStore.getState().nodes;
          const plan = planDirectorReferenceImage({ nodes: previous, sourceNodeId: nodeId, sceneId: latest.id, sourceRevision: revision, title,
            image: { assetId: item.id, storageKey: image.storageKey, url: projectUrl(image.storageKey), mimeType: image.mimeType, bytes: image.bytes, width: image.width, height: image.height } });
          if (plan.created) {
            useCanvasStore.getState().setNodes(plan.nodes);
            try { await saveRef.current(); check(); context.signal.throwIfAborted(); }
            catch (error) {
              const added = plan.nodes.find(node => node.id === plan.nodeId)!;
              const rollbackPlan = { nodes: plan.nodes, outputNodeIds: {}, changes: [{ nodeId: plan.nodeId, previousFingerprint: null, fingerprint: directorFingerprint(added) }] };
              useCanvasStore.getState().setNodes(current => rollbackDirectorOutput(current, previous, rollbackPlan).nodes); throw error;
            }
          }
          return { assetId: item.id, persisted: true };
        },
        importImage: async input => {
          const blob = typeof input === 'string' ? await fetch(projectUrl(input), { signal: controller.signal, credentials: 'same-origin', redirect: 'error' }).then(response => { if (!response.ok) throw new Error('参考图无法读取'); return response.blob(); }) : input;
          return upload(blob, 'image');
        },
        importModel: async (file, context) => {
          check(); const main = new File([file], context.fileName);
          const resource = await importDirectorModelFiles(workspaceId, nodeId, [main, ...(context.sidecars ?? [])], revision, context.signal); check(); importedModels.add(resource.storageKey); return resource;
        },
        persistAsset: async asset => {
          const resource = asset.data.storageKey;
          if (!resource) throw new Error('素材缺少受管引用');
          if (asset.kind === 'model') {
            const verified = await postAssistant<{ resource: { assetId: string; confirmed: true } }>('model-manifest', { reference: resource }, controller.signal);
            if (!verified.resource.confirmed) throw new Error('模型尚未收到主机清单确认');
            return { assetId: verified.resource.assetId, created: false, confirmed: true };
          }
          const ledger = await getWorkspaceAssets(workspaceId);
          check(); const item = ledger.body.assets?.items.find(item => item.relative_path === resource);
          if (!ledger.ok || !item) throw new Error('素材尚未收到项目账本确认');
          return { assetId: item.id, created: false, confirmed: true };
        },
        exportOutput: async (output, context) => {
          check();
          const sourceRevision = context.revision;
          const sourceScene = directorFingerprint(serializeDirectorScene(output.scene));
          if (sourceRevision !== revision || output.scene.id !== latest.id || directorFingerprint(serializeDirectorScene(latest)) !== sourceScene) throw new Error('导出来源场景已变化，请重新导出');
          const image = await importDirectorMedia(workspaceId, nodeId, 'image', output.beauty, sourceRevision, context.signal);
          const video = output.clayVideo ? await importDirectorMedia(workspaceId, nodeId, 'video', output.clayVideo, sourceRevision, context.signal) : null;
          check(); if (revision !== sourceRevision || directorFingerprint(serializeDirectorScene(latest)) !== sourceScene) throw new Error('导出期间场景已变化，原成果已保留');
          const previous = useCanvasStore.getState().nodes;
          if (!image.assetId || (video && !video.assetId)) throw new Error('导出未收到素材身份确认');
          if (!latest.shots.some(shot => shot.id === output.shot.id && directorFingerprint(shot) === directorFingerprint(output.shot))) throw new Error('导出镜头来源已变化');
          const plan = planDirectorOutput({ nodes: previous, sourceNodeId: nodeId, sourceRevision, sceneId: output.scene.id, shotId: output.shot.id,
            resources: { image: { ...image, assetId: image.assetId, url: projectUrl(image.storageKey) }, video: video ? { ...video, assetId: video.assetId!, url: projectUrl(video.storageKey) } : null } });
          useCanvasStore.getState().setNodes(plan.nodes);
          try { await saveRef.current(); check(); }
          catch (error) {
            useCanvasStore.getState().setNodes(current => rollbackDirectorOutput(current, previous, plan).nodes);
            throw error;
          }
          const resource = video || image;
          return { confirmed: true, resource: { ...resource, assetId: resource.assetId!, outputNodeId: (video ? plan.outputNodeIds.video : plan.outputNodeIds.image)! } };
        },
        exportScreenshot: async (input, context) => {
          const screenshot = input.scene.shots.find(shot => shot.id === input.shotId)?.screenshots?.find(item => item.id === input.screenshotId);
          if (!screenshot) throw new Error('所选截图不存在');
          const registered = await getWorkspaceAssets(workspaceId); check();
          const item = registered.body.assets?.items.find(asset => asset.relative_path === screenshot.storageKey);
          if (!registered.ok || !item) throw new Error('所选截图尚未收到项目账本确认');
          context.signal.throwIfAborted();
          if (context.revision !== revision || input.scene.id !== latest.id || directorFingerprint(serializeDirectorScene(input.scene)) !== directorFingerprint(serializeDirectorScene(latest))) throw new Error('截图所属场景已变化，请重新选择');
          const previous = useCanvasStore.getState().nodes;
          const plan = planDirectorOutput({ nodes: previous, sourceNodeId: nodeId, sourceRevision: context.revision, sceneId: input.scene.id, shotId: input.shotId,
            resources: { image: { assetId: item.id, storageKey: screenshot.storageKey, url: projectUrl(screenshot.storageKey), mimeType: item.mimeType || 'image/png', bytes: item.sizeBytes || item.size || 0, width: screenshot.width, height: screenshot.height,
              capturedSource: screenshot.sourceRevision !== undefined && screenshot.sourceShotId !== undefined ? { sceneId: input.scene.id, shotId: screenshot.sourceShotId, revision: screenshot.sourceRevision } : undefined } } });
          useCanvasStore.getState().setNodes(plan.nodes);
          try { await saveRef.current(); check(); context.signal.throwIfAborted(); }
          catch (error) { useCanvasStore.getState().setNodes(current => rollbackDirectorOutput(current, previous, plan).nodes); throw error; }
          return { confirmed: true };
        },
        captureCover: async (input, context) => {
          check(); context.signal.throwIfAborted();
          const sourceRevision = revision, snapshot = directorFingerprint(serializeDirectorScene(input.scene));
          if (input.scene.id !== latest.id || snapshot !== directorFingerprint(serializeDirectorScene(latest)) || !latest.shots.some(shot => shot.id === input.shotId)) throw new Error('封面捕获来源已变化，请重试关闭');
          const cover = await importDirectorMedia(workspaceId, nodeId, 'image', input.beauty, sourceRevision, context.signal);
          check(); context.signal.throwIfAborted();
          if (revision !== sourceRevision || snapshot !== directorFingerprint(serializeDirectorScene(latest))) throw new Error('封面保存期间场景已变化，原封面已保留');
          const before = useCanvasStore.getState().nodes.find(node => node.id === nodeId)!.data;
          const patch = { coverUrl: projectUrl(cover.storageKey), coverStorageKey: cover.storageKey, coverRevision: sourceRevision };
          coverGraphConfirmed = false;
          updateNode(patch);
          try { await saveRef.current(); check(); context.signal.throwIfAborted(); coverGraphConfirmed = true; }
          catch (error) {
            useCanvasStore.getState().setNodes(nodes => nodes.map(node => {
              if (node.id !== nodeId || node.data.coverUrl !== patch.coverUrl || node.data.coverStorageKey !== patch.coverStorageKey || node.data.coverRevision !== patch.coverRevision) return node;
              const data = { ...node.data };
              for (const key of ['coverUrl', 'coverStorageKey', 'coverRevision'] as const) {
                if (Object.prototype.hasOwnProperty.call(before, key)) data[key] = before[key];
                else delete data[key];
              }
              return { ...node, data };
            }));
            throw error;
          }
        },
        shouldCaptureCover: () => !coverGraphConfirmed || useCanvasStore.getState().nodes.find(node => node.id === nodeId)?.data.coverRevision !== revision,
        analyzeImage: async (input, context) => {
          const result = await postAssistant<{ elements: Array<{ name: string; type: 'person' | 'object'; x: number; depth: number }>; simulated: boolean }>('analyze', { imageRef: input.imageUrl, expectedRevision: revision }, context.signal);
          if (result.simulated) toast.warning('这是测试模型的站位建议，不是真实识图结果');
          return JSON.stringify({ elements: result.elements });
        },
        generatePanorama: async (input, context) => {
          const image = await upload(input.file, 'image');
          const requestId = crypto.randomUUID();
          await postAssistant('panorama', { requestId, prompt: input.prompt, imageRef: image.storageKey, expectedRevision: revision }, context.signal);
          input.onTaskUpdate?.({ id: requestId, status: 'running' });
          const result = await postAssistant<{ status: string; media?: DirectorImageResource; mode?: string }>('panorama/recover', { requestId }, context.signal);
          if (result.status !== 'ready' || !result.media || result.mode !== 'live') throw new Error(result.status === 'simulated' ? '测试图片任务不能作为真实全景成果' : '全景任务仍可恢复，请从历史记录重新收取');
          input.onTaskUpdate?.({ id: requestId, status: 'succeeded' });
          const created = { ...result.media, id: result.media.assetId || requestId, name: `全景图 · ${input.file.name}` };
          const asset = { id: created.id, kind: 'image' as const, title: created.name, tags: ['全景图'], data: { storageKey: created.storageKey, url: created.url, dataUrl: created.url, width: created.width, height: created.height, bytes: created.bytes, mimeType: created.mimeType } };
          props.assets = [...props.assets.filter(item => item.id !== asset.id), asset];
          mount.current?.update(props);
          return created;
        },
        recoverPanoramaTasks: async context => {
          const history = await request<{ live: Array<{ requestId: string; status: string }> }>(`${apiPath}/panorama/history`, { signal: context.signal }); check();
          if (!history.ok) throw new Error(history.body.error || '全景任务历史无法读取');
          let recovered = 0;
          for (const item of history.body.live) {
            if (item.status === 'ready') { recovered++; continue; }
            try {
              const result = await postAssistant<{ status: string }>('panorama/recover', { requestId: item.requestId }, context.signal);
              if (result.status === 'ready') recovered++;
            } catch (error) {
              context.signal.throwIfAborted();
              toast.warning(error instanceof Error ? error.message : '某条全景任务未能恢复，其他任务仍可继续');
            }
          }
          return recovered;
        },
        preferences: { getItem: async key => { const value = localStorage.getItem(key); return value ? JSON.parse(value) : null; }, setItem: async (key, value) => { localStorage.setItem(key, JSON.stringify(value)); } },
        notify: (kind, message) => { if (kind === 'error') toast.error(message); else if (kind === 'warning') toast.warning(message); else toast.success(message); },
      };
      const ledger = await getWorkspaceAssets(workspaceId); check();
      const imageNodes = useCanvasStore.getState().nodes.filter(node => node.type === 'material' && node.data.materialType === 'image' && typeof node.data.relativePath === 'string').map(node => ({ id: node.id, title: String(node.data.label || '画布图片'), metadata: { content: String(node.data.relativePath), storageKey: String(node.data.relativePath), mimeType: String(node.data.mimeType || 'image/png') } }));
      const assets = ledger.ok ? ledger.body.assets.items.filter(item => item.type === 'image' || item.type === 'video').map(item => ({ id: item.id, kind: item.type as 'image' | 'video', title: item.name, tags: [], data: { storageKey: item.relative_path, url: item.relative_path, dataUrl: item.relative_path, mimeType: item.mimeType ?? undefined, bytes: item.sizeBytes ?? item.size ?? undefined } })) : [];
      const props: DirectorSceneProps = { identity: { userId: session.body.operatorScope, projectId: workspaceId, nodeId, sceneId: latest.id, epoch: session.body.epoch * 1000 + operationEpoch },
        scene: latest, revision, assets, imageNodes, adapters, capabilities: { analyzeImage: capability.ok && capability.body.analyzeImage.available, panoramaGeneration: capability.ok && capability.body.panorama.available },
        onChange: scene => { check(); latest = scene; }, onClose: () => { check(); setNodeId(null); } };
      const runtime = await loadDirectorRuntime(); check();
      mount.current = runtime.mount(element, props);
      initialized = true;
      setStatus('');
      runOperation.current = async queued => {
        if (operationBusy.current || !mount.current) return;
        operationBusy.current = true;
        const operation = queued.request;
        const operationPath = `/omnimux-workflow/api/workspaces/${encodeURIComponent(workspaceId)}/director-operations`;
        let claimToken: string | null = null;
        try {
          const document = await getDirectorScene(workspaceId, nodeId, controller.signal); check();
          if (!document.ok || document.body.document.revision !== operation.sourceRevision || document.body.document.scene.id !== operation.sceneId) throw new Error('导演操作来源已变化');
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(document.body.document)));
          const hash = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
          if (hash !== queued.sceneHash) throw new Error('导演操作与加载场景不一致');
          const claimed = await request<{ claimToken: string }>(`${operationPath}/claim`, { method: 'POST', body: { request: operation }, signal: controller.signal }); check();
          if (!claimed.ok || !claimed.body.claimToken) throw new Error(claimed.body.error || '导演操作未领取');
          claimToken = claimed.body.claimToken;
          let receipt: Record<string, unknown>;
          if (operation.action === 'open') receipt = { ...operation, status: 'completed', confirmed: true, opened: true };
          else {
            const result = await mount.current.execute({ operationId: operation.operationId, kind: operation.kind, shotId: operation.shot.id, sourceRevision: operation.sourceRevision }, { signal: controller.signal }); check();
            const media = result.resource;
            receipt = { ...operation, status: 'completed', resource: { confirmed: true, assetId: media.assetId, outputNodeId: media.outputNodeId, storageKey: media.storageKey, mimeType: media.mimeType, bytes: media.bytes, width: media.width, height: media.height, ...(operation.kind === 'video' ? { durationSec: media.durationSec } : {}) } };
          }
          const complete = await request(`${operationPath}/complete`, { method: 'POST', body: { receipt, claimToken }, signal: controller.signal });
          if (!complete.ok) throw new Error(complete.body.error || '导演操作回执未确认');
        } catch (error) {
          if (claimToken && !controller.signal.aborted) await request(`${operationPath}/fail`, { method: 'POST', body: { request: operation, claimToken, error: error instanceof Error ? error.message.slice(0, 240) : 'director-command-failed' }, signal: controller.signal });
          if (!controller.signal.aborted) toast.error(error instanceof Error ? error.message : '导演自动操作未完成');
        } finally { operationBusy.current = false; pendingOperation.current = null; }
      };
      if (pendingOperation.current) await runOperation.current(pendingOperation.current);
    })().catch(error => { if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : '导演台打开失败'); });
    return () => { unregisterClose(); controller.abort(); epoch.current++; runOperation.current = null; mount.current?.unmount(); mount.current = null; };
  }, [nodeId, workspaceId]);
  if (!nodeId) return null;
  return <section className="wf-director-panel" aria-label="3D 导演台">{status ? <div className="wf-director-panel__loading"><span role="status">{status}</span><button type="button" className="wf-modal-btn-cancel" onClick={() => setNodeId(null)}>返回画布</button></div> : null}<div className="wf-director-panel__mount" ref={container} /></section>;
}
