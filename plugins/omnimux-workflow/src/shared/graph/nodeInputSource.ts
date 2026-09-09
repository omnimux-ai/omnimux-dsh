import { localFileMediaUrl, looksAbsolutePath, projectFileMediaUrl } from '../localMedia.ts';
import { normalizeMediaNumber, normalizeMimeType } from '../mediaMetadata.ts';
import { serializeTableNodeToText } from './tableTextSerializer.ts';

export type InputAvailability = 'ready' | 'waiting' | 'unavailable';

export interface InputMediaAsset {
  type: 'image' | 'video' | 'audio';
  url: string;
  path?: string;
  relativePath?: string;
  assetId?: string;
  mimeType?: string;
  sizeBytes?: number;
  durationSec?: number;
}

/** The current output only; history and the instructions that produced it are excluded. */
export interface NodeInputSource {
  nodeId: string;
  label: string;
  materialType: string;
  outputId?: string;
  metadata?: Pick<InputMediaAsset, 'mimeType' | 'sizeBytes' | 'durationSec'>;
  availability: InputAvailability;
  message?: string;
  output: { text?: string; mediaAssets?: InputMediaAsset[] };
}

function nonempty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readCurrentText(data: Record<string, unknown>): string {
  // An explicitly empty current result must not reveal an older content value.
  const current = typeof data.generatedContent === 'string' ? data.generatedContent : data.content;
  return typeof current === 'string' ? current : '';
}

function usableUrl(value: unknown): string | undefined {
  const url = nonempty(value);
  if (!url || url.startsWith('blob:')) return undefined;
  if (/^https?:\/\//i.test(url) || /^data:(image|video|audio)\/[^,]+,.+/s.test(url)) return url;
  if (url.startsWith('/omnimux-workflow/') || url.startsWith('/media/')) return url;
  return undefined;
}

function mediaAsset(
  data: Record<string, unknown>,
  type: InputMediaAsset['type'],
  workspaceId?: string,
): InputMediaAsset | undefined {
  const assets = Array.isArray(data.mediaAssets) ? data.mediaAssets : undefined;
  const current = assets?.find((asset) => asset && typeof asset === 'object' && asset.type === type);
  // mediaAssets is the current result list, not a history list. The first matching
  // result is the same output displayed by the existing material-node preview.
  const asset = current as Record<string, unknown> | undefined;
  const fields = asset ?? data;
  const relativePath = nonempty(fields.relativePath);
  const path = nonempty(fields.path) ?? nonempty(fields.realPath);
  const assetId = nonempty(fields.assetId);
  let url = usableUrl(asset ? asset.url : data.mediaUrl);
  if (relativePath && workspaceId) url = projectFileMediaUrl(workspaceId, relativePath);
  else if (path && looksAbsolutePath(path)) url = localFileMediaUrl(path);
  if (!url) return undefined;
  const mimeType = normalizeMimeType(fields.mimeType ?? data.mimeType);
  const sizeBytes = normalizeMediaNumber(fields.sizeBytes ?? data.sizeBytes ?? data.fileSize);
  const durationSec = normalizeMediaNumber(fields.durationSec ?? data.durationSec ?? data.duration);
  return {
    type, url,
    ...(path && looksAbsolutePath(path) ? { path } : {}),
    ...(relativePath ? { relativePath } : {}),
    ...(assetId ? { assetId } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(sizeBytes !== null ? { sizeBytes } : {}),
    ...(durationSec !== null ? { durationSec } : {}),
  };
}

/** Pure source projection shared by editor, graph validation and execution entrypoints. */
export function readNodeInputSource(
  node: { id: string; type?: string; data?: Record<string, unknown> },
  workspaceId?: string,
): NodeInputSource {
  const data = node.data ?? {};
  const materialType = nonempty(data.materialType) ?? node.type ?? 'text';
  const label = nonempty(data.label) ?? nonempty(data.title) ?? node.id;
  const selected = Array.isArray(data.mediaAssets)
    ? data.mediaAssets.find((asset) => asset && typeof asset === 'object' && asset.type === materialType) as Record<string, unknown> | undefined
    : undefined;
  const fields = selected ?? data;
  const metadata = {
    mimeType: normalizeMimeType(fields.mimeType ?? data.mimeType) ?? undefined,
    sizeBytes: normalizeMediaNumber(fields.sizeBytes ?? data.sizeBytes ?? data.fileSize) ?? undefined,
    durationSec: normalizeMediaNumber(fields.durationSec ?? data.durationSec ?? data.duration) ?? undefined,
  };
  const base = { nodeId: node.id, label, materialType, metadata };
  const missing = data.isMissing === true || data.fileMissing === true || data.fileCorrupted === true || data.isOffline === true
    || ['missing', 'corrupted', 'offline'].includes(String(data.status))
    || ['missing', 'corrupted', 'error'].includes(String(data.probeStatus));
  if (missing) {
    return { ...base, availability: 'unavailable', message: `“${label}”的素材不可用，请重试、替换或移除引用`, output: {} };
  }

  let text: string | undefined = undefined;
  if (materialType === 'text') {
    text = readCurrentText(data);
  } else if (materialType === 'table') {
    const raw = serializeTableNodeToText(data);
    text = raw.trim() ? raw : undefined;
  }
  const media = materialType === 'image' || materialType === 'video' || materialType === 'audio'
    ? mediaAsset(data, materialType, workspaceId) : undefined;
  const output = {
    ...(text !== undefined ? { text } : {}),
    ...(media ? { mediaAssets: [media] } : {}),
  };
  if (text?.trim() || media) {
    return {
      ...base, availability: 'ready', output,
      outputId: media?.assetId ?? media?.relativePath ?? media?.path ?? media?.url
        ?? (materialType === 'table' ? nonempty(data.tableId) ?? `${node.id}:table` : undefined)
        ?? nonempty(data.taskId) ?? `${node.id}:current`,
    };
  }
  const failed = ['error', 'failed'].includes(String(data.status))
    || ['error', 'failed'].includes(String(data.executionStatus));
  return {
    ...base,
    availability: failed ? 'unavailable' : 'waiting',
    message: failed
      ? `“${label}”尚无可用结果，请重试或移除引用`
      : `等待“${label}”的${materialType === 'text' ? '内容' : materialType === 'table' ? '表格记录' : '素材或结果'}`,
    output,
  };
}
