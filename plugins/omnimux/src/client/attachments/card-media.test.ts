import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMediaAttachment,
  isVideoAttachment,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  AUDIO_EXTENSIONS,
} from './media-detector.ts';
import type { ConversationAttachment } from './types.ts';

function createMockAttachment(partial: Partial<ConversationAttachment>): ConversationAttachment {
  return {
    id: 'test-att-1',
    fingerprint: 'fp-1',
    sessionId: 'sess-1',
    sourcePlugin: 'omnimux',
    kind: 'asset',
    entityId: 'ent-1',
    title: '测试素材',
    extension: 'PNG',
    relativePath: 'assets/test.png',
    status: 'ready',
    createdAt: Date.now(),
    ...partial,
  };
}

test('AttachmentCard extension sets define required media formats', () => {
  assert.ok(IMAGE_EXTENSIONS.has('PNG'));
  assert.ok(IMAGE_EXTENSIONS.has('JPG'));
  assert.ok(IMAGE_EXTENSIONS.has('WEBP'));
  assert.ok(VIDEO_EXTENSIONS.has('MP4'));
  assert.ok(VIDEO_EXTENSIONS.has('MOV'));
  assert.ok(AUDIO_EXTENSIONS.has('MP3'));
  assert.ok(AUDIO_EXTENSIONS.has('WAV'));
});

test('isMediaAttachment: 资产中心添加图片素材必须判定为媒体卡片 (Issue #733)', () => {
  const assetImage = createMockAttachment({
    sourcePlugin: 'omnimux-assets',
    kind: 'asset',
    title: '红发蓝眸女性.png',
    extension: 'PNG',
    previewUrl: '/omnimux/assets/library/preview?id=ast_123&file=fil_1',
    relativePath: 'assets/hero.png',
  });
  assert.equal(isMediaAttachment(assetImage), true);
});

test('isMediaAttachment: 原生图片或视频无论是否有 previewUrl 均判定为媒体卡片', () => {
  const imageAtt = createMockAttachment({ kind: 'image', extension: 'PNG' });
  assert.equal(isMediaAttachment(imageAtt), true);

  const videoAtt = createMockAttachment({ kind: 'video', extension: 'MP4' });
  assert.equal(isMediaAttachment(videoAtt), true);
});

test('isMediaAttachment: 视频资产带预览图判定为媒体卡片', () => {
  const videoAsset = createMockAttachment({
    sourcePlugin: 'omnimux-assets',
    kind: 'asset',
    title: '分镜素材.mp4',
    extension: 'MP4',
    previewUrl: 'blob:preview-video',
  });
  assert.equal(isMediaAttachment(videoAsset), true);
});

test('isMediaAttachment: 纯音频与纯文本即使有 previewUrl 也排除在媒体卡片外', () => {
  const audioAtt = createMockAttachment({
    kind: 'audio',
    extension: 'MP3',
    previewUrl: 'https://example.com/audio-waveform.png',
  });
  assert.equal(isMediaAttachment(audioAtt), false);

  const docAtt = createMockAttachment({
    kind: 'document',
    extension: 'MD',
    previewUrl: 'https://example.com/doc-thumb.png',
  });
  assert.equal(isMediaAttachment(docAtt), false);

  const tableAtt = createMockAttachment({
    kind: 'table',
    extension: 'HTABLE',
  });
  assert.equal(isMediaAttachment(tableAtt), false);
});

test('isVideoAttachment: 视频格式或具有时长判定为视频', () => {
  const mp4Att = createMockAttachment({ extension: 'mp4' });
  assert.equal(isVideoAttachment(mp4Att), true);

  const movAtt = createMockAttachment({ extension: 'MOV' });
  assert.equal(isVideoAttachment(movAtt), true);

  const videoKindAtt = createMockAttachment({ kind: 'video', extension: 'CUSTOM' });
  assert.equal(isVideoAttachment(videoKindAtt), true);

  const inspirationWithDuration = createMockAttachment({
    kind: 'inspiration',
    duration: '0:45',
  });
  assert.equal(isVideoAttachment(inspirationWithDuration), true);

  const pngAtt = createMockAttachment({ kind: 'image', extension: 'PNG' });
  assert.equal(isVideoAttachment(pngAtt), false);
});
