import { useSyncExternalStore } from 'react';
import type { DirectorAsset, DirectorIdentity, DirectorImageResource, DirectorNewAsset, DirectorSceneProps } from './contract';
export type CapturedUserScope = DirectorIdentity;
export type UploadedImage = DirectorImageResource & { pendingRemoteUpload?: false };
export type UploadedFile = import('./contract').DirectorResource & { pendingRemoteUpload?: false };
export type ImageAsset = DirectorAsset & { kind: 'image'; data: DirectorAsset['data'] & { dataUrl: string; width: number; height: number } };
export type ModelAsset = DirectorAsset & { kind: 'model'; data: DirectorAsset['data'] & { url: string } };
export type NewAsset = DirectorNewAsset;
export type CanvasNodeData = import('./contract').DirectorImageNode;
export interface ReferenceImage { id: string; name: string; type: string; dataUrl: string; url?: string; storageKey?: string; width?: number; height?: number; bytes?: number }
let active: { props: DirectorSceneProps; portal: HTMLElement; controller: AbortController; sessionController: AbortController } | null = null;
let commandController: AbortController | null = null;
/** Internal cancellation wiring only; no renderer handles cross the DOM contract. */
export function setDirectorCommandController(controller: AbortController | null): void {
  commandController = controller;
  if (active) active.controller = controller ?? active.sessionController;
}
export function directorSceneFingerprint(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right))) : item);
}
const assetListeners = new Set<() => void>();
export function bindDirectorServices(props: DirectorSceneProps, portal: HTMLElement, controller: AbortController): void {
  const changed = active?.props.assets !== props.assets;
  active = { props, portal, sessionController: controller, controller: commandController ?? controller };
  if (changed) for (const listener of assetListeners) listener();
}
export function clearDirectorServices(): void { active = null; commandController = null; }
export function directorServices() { if (!active || active.sessionController.signal.aborted) throw new DOMException('导演台会话已结束', 'AbortError'); return active; }
export function captureUserScope(): DirectorIdentity { return { ...directorServices().props.identity }; }
export function userScopeMatches(expected: DirectorIdentity): boolean {
  if (!active || active.sessionController.signal.aborted) return false;
  const identity = active.props.identity;
  return (['userId', 'projectId', 'nodeId', 'sceneId', 'epoch'] as const).every(key => identity[key] === expected[key]);
}
export function assertUserScope(expected: DirectorIdentity): void { if (!userScopeMatches(expected)) throw new DOMException('导演台所属项目或节点已变化', 'AbortError'); }
export function isUserScopeAbandonedError(error: unknown): boolean { return error instanceof DOMException && error.name === 'AbortError'; }
export function operationContext(expected: DirectorIdentity = captureUserScope(), signal?: AbortSignal) {
  assertUserScope(expected);
  const operationSignal = signal ?? directorServices().controller.signal;
  if (operationSignal.aborted) throw new DOMException('导演台操作已取消', 'AbortError');
  return { identity: expected, signal: operationSignal };
}
export function directorPortal(): HTMLElement { return directorServices().portal; }
export async function resolveImageUrl(storageKey?: string, fallback = '', _options?: { cacheMiss?: boolean }): Promise<string> {
  const { props } = directorServices();
  const reference = storageKey || fallback;
  if (reference.startsWith('director/models/')) {
    if (!props.adapters.resolveBuiltInResource) throw new Error('内置导演模型资源服务不可用');
    return props.adapters.resolveBuiltInResource(reference);
  }
  return props.adapters.resolveResource(reference);
}
export const resolveMediaUrl = resolveImageUrl;
export async function imageToDataUrl(image: ReferenceImage): Promise<string> {
  // Analysis is owned by the Host; preserve the managed reference rather than sending a temporary browser URL.
  return image.storageKey || image.url || image.dataUrl;
}
export async function uploadImage(source: string | Blob, _progress?: (uploaded: number, total: number) => void, expected = captureUserScope()): Promise<UploadedImage> {
  const service = directorServices();
  const result = await service.props.adapters.importImage(source, operationContext(expected));
  assertUserScope(expected);
  if (!result.storageKey || !result.url || !Number.isFinite(result.width) || !Number.isFinite(result.height)) throw new Error('图片未返回受管文件回执');
  return result;
}
export async function importModel(source: Blob, fileName: string, expected: DirectorIdentity, signal?: AbortSignal, sidecars?: File[]) {
  const result = await directorServices().props.adapters.importModel(source, { ...operationContext(expected, signal), fileName, sidecars });
  assertUserScope(expected);
  if (!result.storageKey || !result.url) throw new Error('模型未返回受管文件回执');
  return result;
}
export async function persistAsset(asset: NewAsset, expected: DirectorIdentity, signal?: AbortSignal, existingAssetId?: string, existingPersisted?: boolean) {
  const result = await directorServices().props.adapters.persistAsset(asset, { ...operationContext(expected, signal), existingAssetId, existingPersisted });
  assertUserScope(expected);
  if (!result.confirmed || !result.assetId) throw new Error('素材尚未持久化，请重试');
  return result;
}
/** Read-only snapshots supplied by the host, never a copied vendor asset store. */
export function useDirectorAssets<T>(select: (state: { assets: DirectorAsset[] }) => T): T {
  const assets = useSyncExternalStore(listener => { assetListeners.add(listener); return () => { assetListeners.delete(listener); }; }, () => directorServices().props.assets);
  return select({ assets });
}
useDirectorAssets.getState = () => ({ assets: directorServices().props.assets });
export function preferenceStorage(scope: string) {
  const preferences = directorServices().props.adapters.preferences;
  if (!preferences) throw new Error('导演台偏好存储不可用');
  return { getItem: <T>(key: string) => preferences.getItem<T>(`${scope}:${key}`), setItem: (key: string, value: unknown) => preferences.setItem(`${scope}:${key}`, value) };
}
export function scopedStorageKey(key: string, scope: string): string { return `omnimux-director:${scope}:${key}`; }
export const directorTheme = {
  canvas: { background: 'var(--dsw-alias-bg-base)' },
  toolbar: { panel: 'var(--dsw-alias-bg-elevated)', border: 'var(--dsw-alias-border)', itemHover: 'var(--dsw-alias-interactive-bg-hover)' },
  node: { panel: 'var(--dsw-alias-bg-layer-1)', text: 'var(--dsw-alias-label-primary)', muted: 'var(--dsw-alias-label-secondary)' },
};
export function recordDiagnosticEvent(event: { code: string; level: string; category: string; message: string }): void {
  if (active) active.props.adapters.diagnostic?.(event.code, { level: event.level, category: event.category });
}
