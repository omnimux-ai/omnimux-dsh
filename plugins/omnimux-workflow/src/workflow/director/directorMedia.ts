import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertProjectWriteSafe } from '../../projects/paths.ts';
import { DirectorHostError, type DirectorHost } from './directorHost.ts';
import type { ProjectAssetsStore } from '../workspace/ProjectAssetsStore.ts';

export interface DirectorMediaInspector {
  inspect(input: { path: string; type: 'image' | 'video'; maxBytes: number; signal: AbortSignal }): Promise<{ mime: string; sizeBytes: number; width: number; height: number; duration?: number }>;
}
export const DIRECTOR_MEDIA_LIMIT = 100 * 1024 * 1024;

/** Import only bounded bytes, inspect via the public Hub seam, and register after durable materialization. */
export async function persistDirectorMedia(input: {
  host: DirectorHost; assetsStore: ProjectAssetsStore; inspector: DirectorMediaInspector;
  workspaceId: string; nodeId: string; kind: 'image' | 'video'; bytes: Buffer;
  signal: AbortSignal; expectedRevision: number;
}) {
  const { host, workspaceId, nodeId, kind, bytes, signal } = input;
  signal.throwIfAborted();
  if (!bytes.length || bytes.length > (kind === 'image' ? 16 * 1024 * 1024 : DIRECTOR_MEDIA_LIMIT)) throw new DirectorHostError('director-media-budget');
  const document = host.getScene(workspaceId, nodeId);
  if (document.revision !== input.expectedRevision) throw new DirectorHostError('version_conflict');
  const root = host.projectRootFor(workspaceId, nodeId);
  const directory = join(root, 'artifacts', 'director', workspaceId, nodeId);
  assertProjectWriteSafe(directory, root);
  mkdirSync(directory, { recursive: true });
  assertProjectWriteSafe(directory, root);
  const operationId = randomUUID();
  const temporary = join(directory, `.${operationId}.tmp`);
  assertProjectWriteSafe(temporary, root);
  let final: string | undefined;
  let registered = false;
  try {
    writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 });
    const metadata = await input.inspector.inspect({ path: temporary, type: kind, maxBytes: DIRECTOR_MEDIA_LIMIT, signal });
    signal.throwIfAborted();
    if (!Number.isFinite(metadata.width) || !Number.isFinite(metadata.height) || metadata.width <= 0 || metadata.height <= 0) throw new DirectorHostError('director-media-invalid');
    if (kind === 'video' && (!Number.isFinite(metadata.duration) || (metadata.duration ?? 0) <= 0)) throw new DirectorHostError('director-media-invalid');
    const extension = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/webm': 'webm', 'video/mp4': 'mp4' } as Record<string, string>)[metadata.mime];
    if (!extension || !metadata.mime.startsWith(`${kind}/`)) throw new DirectorHostError('director-media-invalid');
    if (host.getScene(workspaceId, nodeId).revision !== document.revision || host.projectRootFor(workspaceId, nodeId) !== root) throw new DirectorHostError('version_conflict');
    const hash = createHash('sha256').update(readFileSync(temporary)).digest('hex');
    const relativePath = `artifacts/director/${workspaceId}/${nodeId}/${hash}.${extension}`;
    final = join(directory, `${hash}.${extension}`);
    assertProjectWriteSafe(final, root);
    if (existsSync(final)) { assertProjectWriteSafe(temporary, root); unlinkSync(temporary); }
    else renameSync(temporary, final);
    const assets = input.assetsStore.get(workspaceId);
    const existing = assets.items.find(item => item.relative_path === relativePath);
    const item = existing ?? { id: `director-${operationId}`, name: `导演台${kind === 'image' ? '截图' : '白膜视频'}.${extension}`, type: kind, parentId: null,
      relative_path: relativePath, size: bytes.length, sizeBytes: bytes.length, mimeType: metadata.mime, durationSec: kind === 'video' ? metadata.duration! : null, updatedAt: Date.now() };
    if (!existing) input.assetsStore.save(workspaceId, { expectedRev: assets.rev, folders: assets.folders, items: [...assets.items, item] });
    registered = true;
    return { assetId: item.id, storageKey: relativePath, url: relativePath, mimeType: metadata.mime, bytes: bytes.length,
      width: metadata.width, height: metadata.height, ...(kind === 'video' ? { durationSec: metadata.duration } : {}), hash, confirmed: true as const };
  } finally {
    if (existsSync(temporary)) { assertProjectWriteSafe(temporary, root); unlinkSync(temporary); }
    // The hashed file may preexist or be referenced elsewhere; only task-owned temporary bytes are removed here.
    if (!registered && final) console.warn('导演台素材保存未确认', { workspaceId, nodeId });
  }
}
