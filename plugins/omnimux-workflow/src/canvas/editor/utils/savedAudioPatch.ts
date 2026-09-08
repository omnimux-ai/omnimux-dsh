import type { ProjectAssetsItem } from '../../../shared/projectAssets.ts';
import { WORKFLOW_API_ROUTES } from '../../../shared/api.ts';
import { resolveMediaPreviewUrl } from './mediaUrl.ts';

/** Replace only the actual selected output; preserve other results and node configuration. */
export function savedAudioPatch(data: Record<string, unknown>, source: string, workspaceId: string, item: ProjectAssetsItem): Record<string, unknown> | null {
  const assets = Array.isArray(data.mediaAssets) ? data.mediaAssets as Array<Record<string, unknown>> : [];
  if (data.materialType !== 'audio' || resolveMediaPreviewUrl('audio', assets, data.mediaUrl as string | undefined) !== source) return null;
  const matched = assets.findIndex((asset) => asset.type === 'audio' && asset.url);
  const selected = matched >= 0 ? matched : assets.findIndex((asset) => asset.url);
  const media = {
    type: 'audio', url: WORKFLOW_API_ROUTES.workspaceFile(encodeURIComponent(workspaceId), item.relative_path),
    assetId: item.id, relativePath: item.relative_path, mimeType: item.mimeType ?? null,
    sizeBytes: item.size ?? null, durationSec: item.durationSec ?? null,
    path: undefined, realPath: undefined,
  };
  return {
    mediaAssets: selected >= 0 ? assets.map((asset, index) => index === selected ? { ...asset, ...media } : asset) : [...assets, media],
    mediaUrl: media.url, assetId: media.assetId, relativePath: media.relativePath,
    mimeType: media.mimeType, sizeBytes: media.sizeBytes, durationSec: media.durationSec,
    realPath: undefined, path: undefined, duration: undefined, fileSize: undefined,
  };
}
