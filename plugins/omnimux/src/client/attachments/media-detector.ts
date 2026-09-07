import type { ConversationAttachment } from './types.ts';

export const IMAGE_EXTENSIONS = new Set([
  'PNG',
  'JPG',
  'JPEG',
  'WEBP',
  'GIF',
  'SVG',
  'BMP',
  'ICO',
  'AVIF',
  'HEIC',
]);

export const VIDEO_EXTENSIONS = new Set([
  'MP4',
  'MOV',
  'WEBM',
  'MKV',
  'AVI',
  'M4V',
  'FLV',
]);

export const AUDIO_EXTENSIONS = new Set([
  'MP3',
  'WAV',
  'OGG',
  'M4A',
  'FLAC',
  'AAC',
]);

export const TEXT_EXTENSIONS = new Set([
  'TXT',
  'MD',
  'JSON',
  'YAML',
  'YML',
  'CSV',
  'LOG',
  'HTABLE',
]);

/**
 * 判定附件是否以自适应缩略图卡片展示（omx-att-card--media）。
 *
 * 满足以下任一条件即为媒体卡片：
 * 1. 显式 kind 为 image 或 video
 * 2. 具备非空 previewUrl，且属于图像/视频格式（扩展名在集合内，或 kind 为 asset/inspiration/product），
 *    同时排除明确的纯音频与纯文本格式。
 */
export function isMediaAttachment(attachment: ConversationAttachment): boolean {
  if (!attachment) return false;
  const ext = (attachment.extension || '').toUpperCase();
  const hasPreview = Boolean(attachment.previewUrl);
  const isAudioOrText =
    attachment.kind === 'audio' ||
    attachment.kind === 'document' ||
    attachment.kind === 'table' ||
    AUDIO_EXTENSIONS.has(ext) ||
    TEXT_EXTENSIONS.has(ext);

  return (
    attachment.kind === 'image' ||
    attachment.kind === 'video' ||
    (hasPreview &&
      !isAudioOrText &&
      (IMAGE_EXTENSIONS.has(ext) ||
        VIDEO_EXTENSIONS.has(ext) ||
        attachment.kind === 'asset' ||
        attachment.kind === 'inspiration' ||
        attachment.kind === 'product'))
  );
}

/**
 * 判定媒体卡片是否展示视频播放三角图标及播放时长徽标。
 */
export function isVideoAttachment(attachment: ConversationAttachment): boolean {
  if (!attachment) return false;
  return (
    attachment.kind === 'video' ||
    Boolean(attachment.extension && VIDEO_EXTENSIONS.has(attachment.extension.toUpperCase())) ||
    (attachment.kind === 'inspiration' && Boolean(attachment.duration))
  );
}
