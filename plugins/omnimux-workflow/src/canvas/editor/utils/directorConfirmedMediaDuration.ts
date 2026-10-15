import { normalizeMediaNumber } from '../../../shared/mediaMetadata.ts';

export type PreviewMediaDurationPatch = {
  durationSec: number;
  duration: number;
};

function isManagedDirectorVideo(data: Readonly<Record<string, unknown>>): boolean {
  const path = data.relativePath;
  return typeof data.assetId === 'string' && Boolean(data.assetId.trim())
    && typeof path === 'string' && /^(artifacts|assets\/imported)\//.test(path)
    && !/[\\\\\u0000-\u001f]/.test(path)
    && !path.split('/').some(part => !part || part === '.' || part === '..')
    && (data.mimeType === 'video/webm' || data.mimeType === 'video/mp4')
    && typeof data.directorSourceNodeId === 'string' && Boolean(data.directorSourceNodeId.trim())
    && typeof data.directorSourceRevision === 'number'
    && Number.isSafeInteger(data.directorSourceRevision) && data.directorSourceRevision >= 1;
}

/** Preview measurements cannot replace a known inspector-confirmed duration. */
export function applyPreviewMediaDuration(
  nodeData: Readonly<Record<string, unknown>>,
  previewDuration: number,
  applyNodeUpdate: (patch: PreviewMediaDurationPatch) => void,
): void {
  if (!Number.isFinite(previewDuration) || previewDuration <= 0) return;
  // An explicit unknown canonical field must not inherit an old alias's authority.
  const currentDuration = normalizeMediaNumber(nodeData.durationSec);
  const confirmed = currentDuration !== null && currentDuration > 0
    && (nodeData.metadataProvenance === 'media-inspector' || isManagedDirectorVideo(nodeData));
  const duration = confirmed ? currentDuration : previewDuration;
  if (nodeData.durationSec !== duration || nodeData.duration !== duration) {
    applyNodeUpdate({ durationSec: duration, duration });
  }
}
