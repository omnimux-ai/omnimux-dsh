/**
 * Pure flatten: assets.json document → drawer AssetItem[] (folders + files).
 */
import { localFileMediaUrl, looksAbsolutePath, projectFileMediaUrl } from '../../../shared/localMedia.ts';
import type { ProjectAssetsDocument, ProjectAssetsFolder, ProjectAssetsItem } from '../../../shared/projectAssets.ts';
import type { AssetItem } from '../components/assets/types.ts';

function folderToAsset(folder: ProjectAssetsFolder, itemCount: number): AssetItem {
  return {
    id: folder.id,
    name: folder.name,
    type: 'folder',
    parentId: folder.parentId,
    real_path: folder.real_path,
    updatedAt: folder.updatedAt,
    itemCount,
  };
}

function itemPreviewUrl(item: ProjectAssetsItem, workspaceId?: string | null): string | undefined {
  if (item.relative_path) return workspaceId ? projectFileMediaUrl(workspaceId, item.relative_path) : undefined;
  if (item.real_path && looksAbsolutePath(item.real_path)) return localFileMediaUrl(item.real_path);
  return undefined;
}

function itemToAsset(item: ProjectAssetsItem, workspaceId?: string | null): AssetItem {
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    fileExt: item.name.split('.').pop()?.toUpperCase() || 'FILE',
    parentId: item.parentId,
    real_path: item.real_path && looksAbsolutePath(item.real_path) ? item.real_path : undefined,
    relative_path: item.relative_path || undefined,
    workspaceId: workspaceId || undefined,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes ?? item.size,
    durationSec: item.durationSec,
    updatedAt: item.updatedAt,
    previewUrl: itemPreviewUrl(item, workspaceId),
  };
}

export function flattenProjectAssets(
  doc: ProjectAssetsDocument,
  workspaceId?: string | null,
): AssetItem[] {
  const counts = new Map<string, number>();
  for (const folder of doc.folders) {
    if (folder.parentId) counts.set(folder.parentId, (counts.get(folder.parentId) ?? 0) + 1);
  }
  for (const item of doc.items) {
    if (item.parentId) counts.set(item.parentId, (counts.get(item.parentId) ?? 0) + 1);
  }
  const folders = doc.folders.map((folder) => folderToAsset(folder, counts.get(folder.id) ?? 0));
  const items = doc.items.map((item) => itemToAsset(item, workspaceId));
  return [...folders, ...items];
}
