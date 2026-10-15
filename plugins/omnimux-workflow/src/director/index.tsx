/// <reference path="./style.d.ts" />
import { createRoot } from 'react-dom/client';
import type { DirectorCommand, DirectorConflictRecoveryContext, DirectorExportResource, DirectorMountHandle, DirectorSceneProps } from './contract';
import { recoverDirectorSaveConflict } from './vendor/lib/director-save-wiring';
import { ControlsProvider } from './controls';
import { bindDirectorServices, clearDirectorServices, directorSceneFingerprint, operationContext, setDirectorCommandController, userScopeMatches } from './services';
import { CanvasDirectorWorkbench, type DirectorWorkbenchRuntime } from './vendor/components/canvas-director-workbench';
import { useDirectorWorkbenchStore } from './vendor/store/use-director-workbench-store';
import css from './director.css';
let mounted = false;
function validate(props: DirectorSceneProps): void {
  const identity = props.identity;
  if (!identity.userId || !identity.projectId || !identity.nodeId || !identity.sceneId || identity.sceneId !== props.scene.id || !Number.isSafeInteger(identity.epoch) || !Number.isSafeInteger(props.revision)) throw new Error('导演台项目、节点或场景身份无效');
}
const abandoned = () => new DOMException('导演台操作已取消或所属场景已变化', 'AbortError');
function requireResource(resource: DirectorExportResource | undefined, command: DirectorCommand, duration: number): DirectorExportResource {
  if (!resource || !resource.assetId || !resource.outputNodeId || !resource.storageKey || !resource.url
    || !Number.isSafeInteger(resource.bytes) || resource.bytes <= 0 || !Number.isSafeInteger(resource.width) || resource.width <= 0
    || !Number.isSafeInteger(resource.height) || resource.height <= 0 || !resource.mimeType.startsWith(`${command.kind}/`)
    || (command.kind === 'image' && resource.durationSec !== undefined)
    || (command.kind === 'video' && (!Number.isFinite(resource.durationSec) || Math.abs(resource.durationSec! - duration) > Math.max(0.3, duration * 0.05)))) throw new Error('媒体未返回完整受管成果回执');
  return resource;
}
/** One active DOM island. No React element, context, ref or Three object escapes. */
export function mount(container: HTMLElement, initial: DirectorSceneProps): DirectorMountHandle {
  validate(initial);
  if (mounted) throw new Error('请先关闭当前导演台');
  if (!container.isConnected) throw new Error('导演台挂载容器不可用');
  mounted = true;
  const shell = document.createElement('div'); shell.className = 'wf-director-root'; shell.tabIndex = -1;
  shell.addEventListener('pointerdown', () => { requestAnimationFrame(() => { if (document.activeElement === document.body && shell.isConnected) shell.focus({ preventScroll: true }); }); });
  const style = document.createElement('style'); style.textContent = css;
  const content = document.createElement('div'); content.className = 'wf-director-content';
  const portal = document.createElement('div'); portal.className = 'wf-director-portals';
  shell.append(style, content, portal); container.append(shell);
  const root = createRoot(content);
  let props = initial;
  let controller = new AbortController();
  let disposed = false;
  let draft = structuredClone(initial.scene);
  let confirmedRevision = initial.revision;
  let confirmedFingerprint = directorSceneFingerprint(initial.scene);
  let key = 0;
  let saveQueue: Promise<void> = Promise.resolve();
  let runtime: DirectorWorkbenchRuntime | null = null;
  const runtimeWaiters = new Set<(value: DirectorWorkbenchRuntime) => void>();
  const bindRuntime = (value: DirectorWorkbenchRuntime | null) => {
    runtime = value;
    if (value) { for (const waiter of runtimeWaiters) waiter(value); runtimeWaiters.clear(); }
  };
  const waitRuntime = (signal: AbortSignal): Promise<DirectorWorkbenchRuntime> => {
    if (signal.aborted || disposed) return Promise.reject(abandoned());
    if (runtime) return Promise.resolve(runtime);
    return new Promise((resolve, reject) => {
      const ready = (value: DirectorWorkbenchRuntime) => { signal.removeEventListener('abort', abort); resolve(value); };
      const abort = () => { runtimeWaiters.delete(ready); reject(abandoned()); };
      runtimeWaiters.add(ready); signal.addEventListener('abort', abort, { once: true });
    });
  };
  let pending: { command: DirectorCommand; controller: AbortController; done: Promise<unknown> } | null = null;
  const usedOperationIds = new Set<string>();
  let closePending: Promise<boolean> | null = null;
  const persist = async () => {
    const scene = structuredClone(draft);
    const fingerprint = directorSceneFingerprint(scene);
    const expected = { ...props.identity };
    const adapters = props.adapters;
    const sessionController = controller;
    const perform = async () => {
      if (sessionController.signal.aborted || disposed || !userScopeMatches(expected)) throw abandoned();
      // The coordinator may flush a clean scene on export/pagehide. No new revision without a real change.
      if (fingerprint === confirmedFingerprint) return;
      if (pending) throw new Error('导出期间不能保存另一个场景版本');
      const receipt = await adapters.saveScene(scene, { identity: expected, signal: sessionController.signal, expectedRevision: confirmedRevision });
      if (sessionController.signal.aborted || disposed || !userScopeMatches(expected)) throw abandoned();
      if (receipt.confirmed !== true || receipt.sceneId !== scene.id || !Number.isSafeInteger(receipt.revision) || receipt.revision <= confirmedRevision) throw new Error('场景未收到主机写盘确认');
      confirmedRevision = receipt.revision;
      confirmedFingerprint = fingerprint;
      props = { ...props, revision: confirmedRevision };
      bindDirectorServices(props, portal, controller);
    };
    saveQueue = saveQueue.catch(() => undefined).then(perform);
    await saveQueue;
  };
  let recoveryPending = false;
  const recoverConflict = async (confirmReplacement: DirectorConflictRecoveryContext['confirmReplacement']): Promise<boolean> => {
    if (disposed || pending || closePending || recoveryPending) throw new Error('导演台已有操作进行中');
    const expected = { ...props.identity };
    const scene = structuredClone(draft);
    const fingerprint = directorSceneFingerprint(scene);
    const adapters = props.adapters;
    const sessionController = controller;
    if (!adapters.recoverSaveConflict) throw new Error('当前项目暂不支持冲突恢复');
    recoveryPending = true;
    let recovered = false;
    const perform = async () => {
      const receipt = await recoverDirectorSaveConflict({
        scene, identity: expected, signal: sessionController.signal, expectedRevision: confirmedRevision,
        recover: (value, context) => adapters.recoverSaveConflict!(value, context), confirmReplacement, fingerprint: directorSceneFingerprint,
        isCurrent: () => !disposed && !pending && !closePending && userScopeMatches(expected) && directorSceneFingerprint(draft) === fingerprint,
      });
      if (!receipt) return;
      confirmedRevision = receipt.revision; confirmedFingerprint = fingerprint;
      props = { ...props, revision: confirmedRevision };
      bindDirectorServices(props, portal, controller);
      recovered = true;
    };
    try {
      saveQueue = saveQueue.catch(() => undefined).then(perform);
      await saveQueue;
      return recovered;
    } finally { recoveryPending = false; }
  };
  const assertCommand = (command: DirectorCommand, expected: DirectorSceneProps['identity'], scene?: DirectorSceneProps['scene']) => {
    if (disposed || !pending || pending.command.operationId !== command.operationId || pending.controller.signal.aborted
      || !userScopeMatches(expected) || confirmedRevision !== command.sourceRevision
      || directorSceneFingerprint(draft) !== confirmedFingerprint || (scene && directorSceneFingerprint(scene) !== confirmedFingerprint)
      || !draft.shots.some(shot => shot.id === command.shotId)) throw abandoned();
  };
  const render = () => {
    bindDirectorServices(props, portal, controller);
    const expected = { ...props.identity };
    root.render(<ControlsProvider><CanvasDirectorWorkbench key={key} open scene={props.scene} projectId={props.identity.projectId} imageNodes={props.imageNodes} onboardingScope={`${props.identity.userId}:${props.identity.projectId}`} onRuntime={bindRuntime} onClose={props.onClose} onRequestClose={() => { void handle.prepareClose().then(success => { if (success && !disposed && userScopeMatches(expected)) props.onClose(); }); }} onChange={scene => {
      if (disposed || !userScopeMatches(expected)) return;
      if (pending) throw new Error('导出期间场景不可修改');
      draft = structuredClone(scene); props.onChange(scene);
    }} onFlush={persist} onRecoverSaveConflict={props.adapters.recoverSaveConflict ? recoverConflict : undefined} onApply={async (output, command) => {
      if (command) assertCommand(command, expected);
      else await persist();
      const receipt = await props.adapters.exportOutput(output, { ...operationContext(expected, command ? pending!.controller.signal : undefined), revision: confirmedRevision, ...(command ? { operationId: command.operationId } : {}) });
      if (command) assertCommand(command, expected);
      else if (disposed || !userScopeMatches(expected)) throw abandoned();
      if (receipt.confirmed !== true) throw new Error('媒体未收到主机持久化确认');
      if (command) requireResource(receipt.resource, command, output.shot.duration);
      return receipt;
    }} onDeleteImageNode={id => props.adapters.deleteImageNode?.(id, operationContext(expected))} onAddCanvasImage={props.adapters.addCanvasImage ? (image, title, signal, identity) => props.adapters.addCanvasImage!(image, title, operationContext(identity, signal)) : undefined} onShouldCaptureCover={props.adapters.shouldCaptureCover} onCaptureCover={props.adapters.captureCover ? input => props.adapters.captureCover!(input, operationContext(expected)) : undefined} /></ControlsProvider>);
  };
  const cancel = (operationId?: string) => { if (pending && (!operationId || pending.command.operationId === operationId)) pending.controller.abort(); };
  render();
  const handle: DirectorMountHandle = {
    update(next) {
      if (disposed) throw new Error('导演台已关闭');
      validate(next);
      const changed = (['userId', 'projectId', 'nodeId', 'sceneId', 'epoch'] as const).some(field => next.identity[field] !== props.identity[field]);
      // Parent mirrors can lag behind an acknowledged local save; never roll back that receipt.
      if (!changed && next.revision < confirmedRevision) next = { ...next, scene: props.scene, revision: confirmedRevision };
      const replaced = changed || next.revision !== confirmedRevision;
      if (replaced) {
        cancel(); controller.abort(); controller = new AbortController();
        setDirectorCommandController(null); runtime = null;
        useDirectorWorkbenchStore.getState().reset(); draft = structuredClone(next.scene);
        confirmedRevision = next.revision; confirmedFingerprint = directorSceneFingerprint(next.scene);
        saveQueue = Promise.resolve(); key++;
      }
      props = { ...next, revision: confirmedRevision }; render();
    },
    execute(command, options = {}) {
      if (!command || typeof command !== 'object') return Promise.reject(new Error('导出命令无效'));
      command = { ...command };
      if (disposed || closePending || recoveryPending) return Promise.reject(new Error('导演台已关闭或正在保存确认'));
      if (pending) return Promise.reject(new Error('导演台已有操作进行中'));
      if (!command || Object.keys(command).some(field => !['operationId', 'kind', 'shotId', 'sourceRevision'].includes(field))
        || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(command.operationId) || !['image', 'video'].includes(command.kind)
        || !/^[A-Za-z0-9_-]{1,120}$/.test(command.shotId) || !Number.isSafeInteger(command.sourceRevision) || command.sourceRevision !== confirmedRevision
        || directorSceneFingerprint(draft) !== confirmedFingerprint || usedOperationIds.has(command.operationId)) return Promise.reject(new Error('导出命令与当前已保存场景不一致'));
      const shot = draft.shots.find(item => item.id === command.shotId);
      if (!shot || !draft.cameras.some(camera => camera.id === shot.cameraId)) return Promise.reject(new Error('当前已保存场景不存在所选镜头或机位'));
      const timeoutMs = options.timeoutMs ?? (command.kind === 'video' ? Math.min(180000, shot.duration * 1000 + 45000) : 45000);
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 180000) return Promise.reject(new Error('导出超时时间无效'));
      const operation = new AbortController();
      const expected = { ...props.identity };
      const sessionSignal = controller.signal;
      const abort = () => operation.abort();
      sessionSignal.addEventListener('abort', abort, { once: true }); options.signal?.addEventListener('abort', abort, { once: true });
      if (sessionSignal.aborted || options.signal?.aborted) operation.abort();
      const timeout = window.setTimeout(abort, timeoutMs);
      usedOperationIds.add(command.operationId);
      const owned = { command: { ...command }, controller: operation, done: Promise.resolve() as Promise<unknown> };
      pending = owned; setDirectorCommandController(operation);
      const task = (async () => {
        const workbench = await waitRuntime(operation.signal); assertCommand(command, expected);
        const result = await workbench.execute(command, operation.signal, scene => assertCommand(command, expected, scene));
        assertCommand(command, expected);
        return { confirmed: true as const, resource: requireResource(result.resource, command, shot.duration) };
      })();
      // Reject immediately on timeout/cancel, but keep the single-flight lock until renderer cleanup settles.
      const cancelled = new Promise<never>((_resolve, reject) => {
        operation.signal.addEventListener('abort', () => reject(abandoned()), { once: true });
        if (operation.signal.aborted) reject(abandoned());
      });
      owned.done = task.finally(() => {
        window.clearTimeout(timeout); sessionSignal.removeEventListener('abort', abort); options.signal?.removeEventListener('abort', abort);
        if (pending === owned) { pending = null; setDirectorCommandController(null); }
      });
      return Promise.race([owned.done as typeof task, cancelled]);
    },
    cancel,
    prepareClose() {
      if (disposed || recoveryPending) return Promise.resolve(false);
      if (closePending) return closePending;
      const sessionSignal = controller.signal;
      const timeoutController = new AbortController();
      const abort = () => timeoutController.abort();
      sessionSignal.addEventListener('abort', abort, { once: true });
      const timeout = window.setTimeout(abort, 45000);
      cancel();
      const work = (async () => {
        if (pending) await pending.done.catch(() => undefined);
        if (disposed || sessionSignal.aborted) return false;
        const workbench = await waitRuntime(timeoutController.signal);
        const success = await workbench.prepareClose();
        return success && !disposed && !sessionSignal.aborted && !timeoutController.signal.aborted;
      })();
      const cancelled = new Promise<boolean>(resolve => timeoutController.signal.addEventListener('abort', () => resolve(false), { once: true }));
      closePending = Promise.race([work, cancelled]).catch(() => false).finally(() => {
        window.clearTimeout(timeout); sessionSignal.removeEventListener('abort', abort); closePending = null;
      });
      return closePending;
    },
    unmount() {
      if (disposed) return;
      cancel(); disposed = true; controller.abort(); root.unmount();
      useDirectorWorkbenchStore.getState().reset(); clearDirectorServices(); shell.remove(); mounted = false;
    },
  };
  return handle;
}
