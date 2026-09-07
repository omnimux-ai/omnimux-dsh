import { displayNameOf, isBlobUrl, localFilePathFromUrl, looksAbsolutePath } from '../../../shared/localMedia.ts';

export interface LibraryFileRef {
  real_path: string;
  original_name?: string;
  nodeId: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function pickAbsolutePath(value: unknown): string {
  const text = asTrimmed(value);
  if (!text || isBlobUrl(text)) return '';
  const fromUrl = localFilePathFromUrl(text);
  if (fromUrl) return fromUrl;
  if (looksAbsolutePath(text) && !text.includes('/api/local-file')) return text;
  return '';
}

export function extractLibraryFilesFromNodes(
  nodes: Array<{ id?: unknown; data?: unknown }>,
): LibraryFileRef[] {
  const out: LibraryFileRef[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    const id = asTrimmed(node.id);
    const data = asRecord(node.data);
    const candidates: unknown[] = [
      data.realPath,
      data.real_path,
      data.outputVideoUrl,
    ];
    if (Array.isArray(data.mediaAssets)) {
      for (const asset of data.mediaAssets) {
        const row = asRecord(asset);
        candidates.push(row.path, row.real_path, row.url);
      }
    }
    candidates.push(data.mediaUrl, data.previewUrl);

    let realPath = '';
    for (const candidate of candidates) {
      realPath = pickAbsolutePath(candidate);
      if (realPath) break;
    }
    if (!realPath || seen.has(realPath)) continue;
    seen.add(realPath);
    const name = displayNameOf(realPath, asTrimmed(data.originalName));
    out.push({
      real_path: realPath,
      nodeId: id || realPath,
      ...(name ? { original_name: name } : {}),
    });
  }

  return out;
}
