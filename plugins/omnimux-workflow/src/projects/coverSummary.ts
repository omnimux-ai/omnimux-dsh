export type CoverKind = 'empty' | 'document' | 'image' | 'audio' | 'video';
export interface CoverSummary {
  kind: CoverKind;
  nodeId?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  sourceRevision?: string;
  unavailable?: boolean;
}
type RecordData = Record<string, unknown>;
const record = (value: unknown): RecordData => value && typeof value === 'object' ? value as RecordData : {};
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
/** Only browser-addressable durable media. Never expose a local filesystem path. */
export function coverUrl(value: unknown): string | undefined {
  const url = text(value);
  return /^(https?:\/\/|\/omnimux-workflow\/)/i.test(url) ? url : undefined;
}
function firstUrl(...values: unknown[]): string | undefined {
  return values.map(coverUrl).find(Boolean);
}
/** order is first-observed persisted node order, independent of visual stacking. */
export function summarizeCover(nodes: unknown[], order: string[] = []): CoverSummary {
  const items = nodes.map(record);
  const rank = new Map(order.map((id, index) => [id, index]));
  const ordered = items.map((node, index) => ({ node, rank: rank.get(text(node.id)) ?? order.length + index }))
    .sort((a, b) => a.rank - b.rank);
  let document = false;
  for (const { node } of ordered) {
    const data = record(node.data);
    const kind = text(data.materialType || data.mediaType || node.type);
    if (text(data.content) || text(data.generatedContent) || (Array.isArray(data.rows) && data.rows.length)
      || (Array.isArray(record(data.document).rows) && (record(data.document).rows as unknown[]).length)) document = true;
    const mediaKind = kind === 'video_composition' ? 'video' : kind;
    if (!['image', 'audio', 'video'].includes(mediaKind)) continue;
    const assets = Array.isArray(data.mediaAssets) ? data.mediaAssets.map(record) : [];
    const asset = assets.find((item) => text(item.type) === mediaKind && coverUrl(item.url));
    const mediaUrl = firstUrl(asset?.url, data.mediaUrl,
      mediaKind === 'image' ? data.imageUrl : undefined,
      mediaKind === 'video' ? data.outputVideoUrl : undefined, data.outputUrl);
    const thumbnailUrl = firstUrl(data.thumbnailUrl, data.outputThumbnailUrl, data.coverUrl, asset?.thumbnail);
    if (!mediaUrl && !(mediaKind === 'video' && thumbnailUrl)) {
      if (text(data.realPath || data.real_path)) return { kind: mediaKind as CoverKind, nodeId: text(node.id), unavailable: true };
      continue;
    }
    return { kind: mediaKind as CoverKind, nodeId: text(node.id), mediaUrl,
      thumbnailUrl: mediaKind === 'image' ? mediaUrl : thumbnailUrl,
      sourceRevision: JSON.stringify([text(node.id), mediaUrl, thumbnailUrl, data.updatedAt, asset?.updatedAt, asset?.assetId, asset?.sizeBytes]) };
  }
  return { kind: document ? 'document' : 'empty' };
}
export function projectCover(covers: CoverSummary[]): CoverSummary {
  const selected = covers.find((cover) => ['image', 'audio', 'video'].includes(cover.kind))
    ?? covers.find((cover) => cover.kind === 'document') ?? { kind: 'empty' as const };
  const index = covers.indexOf(selected);
  return covers.slice(0, index < 0 ? covers.length : index).some((cover) => cover.unavailable)
    ? { ...selected, unavailable: true } : selected;
}
