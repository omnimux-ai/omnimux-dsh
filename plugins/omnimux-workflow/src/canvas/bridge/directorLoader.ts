import { request } from './apiClient.ts';
import type { DirectorRuntime } from '../../director/contract';

/** The heavy director has its own React root; only DOM and plain data cross this boundary. */
export type DirectorRuntimeBridge = DirectorRuntime;
const promises = new Map<string, Promise<DirectorRuntimeBridge>>();
const SCRIPT_ID = 'omnimux-workflow-director-script';
export async function loadDirectorRuntime(): Promise<DirectorRuntimeBridge> {
  const manifest = await request<{ directorHash?: string; directorAbi?: number }>('/omnimux-workflow/api/manifest');
  if (!manifest.ok || !manifest.body.directorHash || manifest.body.directorAbi !== 1) throw new Error('三维导演模块尚未就绪');
  const hash = manifest.body.directorHash;
  const pending = promises.get(hash);
  if (pending) return pending;
  const promise = new Promise<DirectorRuntimeBridge>((resolve, reject) => {
    const old = document.getElementById(SCRIPT_ID);
    if (old) old.remove();
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = `/omnimux-workflow/director.js?v=${encodeURIComponent(hash)}`;
    script.async = true;
    let settled = false;
    const timer = window.setTimeout(() => finish(new Error('三维导演模块加载超时')), 20000);
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (error) { script.remove(); reject(error); return; }
      const runtime = (window as unknown as { __omnimuxWorkflowDirector?: DirectorRuntimeBridge }).__omnimuxWorkflowDirector;
      if (!runtime || typeof runtime.mount !== 'function') { script.remove(); reject(new Error('三维导演模块格式无效')); return; }
      resolve(runtime);
    }
    script.onload = () => finish();
    script.onerror = () => finish(new Error('三维导演模块加载失败，请重试'));
    (window as unknown as { __omnimuxWorkflowDirector?: DirectorRuntimeBridge }).__omnimuxWorkflowDirector = undefined;
    document.head.append(script);
  });
  promises.set(hash, promise);
  try { return await promise; }
  catch (error) { promises.delete(hash); throw error; }
}
