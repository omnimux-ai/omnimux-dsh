import { request } from './apiClient.ts';
import type { DirectorDocument } from '../../shared/directorSchema.ts';
import type { DirectorScene, DirectorImageResource, DirectorResource } from '../../director/contract';

export function directorScenePath(workspaceId: string, nodeId: string): string {
  return `/omnimux-workflow/api/workspaces/${encodeURIComponent(workspaceId)}/director/${encodeURIComponent(nodeId)}`;
}
export function managedDirectorUrl(workspaceId: string, reference: string): string {
  if (reference.startsWith('director/models/')) return `/omnimux-workflow/director-assets/${encodeURIComponent(reference.split('/').at(-1) ?? '')}`;
  if (reference.startsWith('/omnimux-workflow/director-assets/')) return reference;
  if (!/^(assets\/imported\/|artifacts\/)/.test(reference) || reference.includes('..') || reference.includes('\\')) throw new Error('导演台素材不是当前项目受管文件');
  return `/omnimux-workflow/api/workspaces/${encodeURIComponent(workspaceId)}/file?rel=${encodeURIComponent(reference)}`;
}
function persistentReference(reference: string): string {
  if (reference.startsWith('director/models/')) return `/omnimux-workflow/director-assets/${reference.split('/').at(-1)}`;
  return reference;
}
export function serializeDirectorScene(scene: DirectorScene): DirectorScene {
  const copy = structuredClone(scene);
  for (const object of copy.objects) {
    if (object.url) object.url = persistentReference(object.url);
    if (object.storageKey) object.storageKey = persistentReference(object.storageKey);
  }
  return copy;
}
export async function getDirectorScene(workspaceId: string, nodeId: string, signal?: AbortSignal) {
  return request<{ document: DirectorDocument }>(directorScenePath(workspaceId, nodeId), { signal });
}
export async function saveDirectorScene(workspaceId: string, nodeId: string, scene: DirectorScene, expectedRevision: number, signal?: AbortSignal): Promise<DirectorDocument> {
  const result = await request<{ document: DirectorDocument }>(directorScenePath(workspaceId, nodeId), { method: 'PUT', body: { scene: serializeDirectorScene(scene), expectedRevision }, signal });
  if (!result.ok || !result.body.document) {
    const error = new Error(result.status === 409 ? '导演场景已被其他操作修改，请保留草稿并重新确认保存' : result.body.error || '导演场景保存失败');
    throw Object.assign(error, { code: result.status === 409 ? 'version_conflict' : result.status === 401 || result.status === 403 ? 'forbidden' : result.body.error || 'director-save-failed' });
  }
  return result.body.document;
}
export async function importDirectorMedia(workspaceId: string, nodeId: string, kind: 'image' | 'video', blob: Blob, revision: number, signal: AbortSignal): Promise<DirectorImageResource & { durationSec?: number; confirmed: true }> {
  const response = await fetch(`${directorScenePath(workspaceId, nodeId)}/media/${kind}`, { method: 'POST', credentials: 'same-origin', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/octet-stream', 'X-Director-Revision': String(revision) }, body: blob });
  const body = await response.json() as { resource?: DirectorImageResource & { durationSec?: number; confirmed: true }; error?: string };
  if (!response.ok || body.resource?.confirmed !== true) throw new Error(body.error || '导演台素材未保存');
  return body.resource;
}
export async function importDirectorModelFiles(workspaceId: string, nodeId: string, files: File[], revision: number, signal: AbortSignal): Promise<DirectorResource> {
  if (!files.length || files.length > 32 || files.reduce((sum, file) => sum + file.size, 0) > 64 * 1024 * 1024) throw new Error('模型文件数量或大小超限');
  const manifest = files.map(file => ({ name: file.webkitRelativePath || file.name, bytes: file.size }));
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(manifest))));
  const response = await fetch(`${directorScenePath(workspaceId, nodeId)}/model`, { method: 'POST', credentials: 'same-origin', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/octet-stream', 'X-Director-Revision': String(revision), 'X-Director-Files': encoded }, body: new Blob(files) });
  const body = await response.json() as { resource?: DirectorResource; error?: string };
  if (!response.ok || !body.resource?.storageKey) throw new Error(body.error || '三维模型导入失败');
  return body.resource;
}
export type SavedDirectorResource = DirectorResource & { durationSec?: number; confirmed: true };
