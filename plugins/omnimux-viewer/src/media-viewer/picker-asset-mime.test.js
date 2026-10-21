import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assetForSlot, mapArtifactAsset, mapCloudAsset, mapLocalAsset, mapProductAsset, pickerKindOf, pickerMimeOf } from './picker-asset-mime.js';
import { rejectionOf } from './media-slot.js';

describe('picker asset MIME projection', () => {
  it('reads the real cover filename instead of the extension-less preview URL', () => {
    assert.equal(pickerMimeOf({ original_name: 'hero.png' }), 'image/png');
    assert.equal(pickerMimeOf({ original_name: 'clip.MP4' }), 'video/mp4');
    assert.equal(pickerMimeOf({ original_name: 'voice.wav' }), 'audio/wav');
  });

  it('keeps an explicit MIME from the asset API', () => {
    assert.equal(pickerMimeOf({ mime: 'image/webp' }), 'image/webp');
    assert.equal(pickerMimeOf({ mediaType: 'image/avif' }), 'image/avif');
  });

  it('derives from URLs that do carry an extension', () => {
    assert.equal(pickerMimeOf('https://cdn.example.test/a.jpg?x=1'), 'image/jpeg');
    assert.equal(pickerMimeOf({ cover_url: 'https://cdn.example.test/b.webm' }), 'video/webm');
  });

  it('does not guess when no format evidence exists', () => {
    assert.equal(pickerMimeOf({ name: '未命名的角色', type: 'character' }), '');
    assert.equal(pickerMimeOf('/omnimux/assets/library/preview?id=x&file=y'), '');
    assert.equal(pickerMimeOf(null), '');
  });

  it('derives the media kind from MIME and falls back to the category', () => {
    assert.equal(pickerKindOf('image/png', 'character'), 'image');
    assert.equal(pickerKindOf('video/mp4', 'product'), 'video');
    assert.equal(pickerKindOf('audio/wav', 'custom'), 'audio');
    assert.equal(pickerKindOf('', 'video'), 'video');
    assert.equal(pickerKindOf('', 'character'), 'image');
  });
});


describe('asset row mapping keeps media MIME distinct from the cover', () => {
  it('maps a local asset from its cover filename, not the extension-less preview URL', () => {
    const item = mapLocalAsset({ id: 'ast', name: '本地角色', type: 'character', cover: { id: 'f', kind: 'image', original_name: 'hero.png' }, files: [] });
    assert.equal(item.mime, 'image/png');
    assert.equal(item.type, 'image');
    assert.equal(item.url, '/omnimux/assets/library/preview?id=ast&file=f');
  });

  it('uses the cloud media file, not the png cover of a video/audio row', () => {
    const video = mapCloudAsset({ id: 'v', name: '视频', media_type: 'video', media_url: 'https://cdn.example.test/preview.mp4', cover_url: 'https://cdn.example.test/cover.png' });
    assert.equal(video.mime, 'video/mp4');
    assert.equal(video.type, 'video');
    assert.equal(video.url, 'https://cdn.example.test/preview.mp4');
    assert.equal(video.thumbUrl, 'https://cdn.example.test/cover.png');
    const audio = mapCloudAsset({ id: 'a', name: '音频', media_type: 'audio', media_url: 'https://cdn.example.test/voice.wav', cover_url: 'https://cdn.example.test/cover.png' });
    assert.equal(audio.mime, 'audio/wav');
    assert.equal(audio.type, 'audio');
    assert.equal(audio.url, 'https://cdn.example.test/voice.wav');
  });

  it('uses the cover only for image cloud rows', () => {
    const image = mapCloudAsset({ id: 'i', name: '图片', media_type: 'image', cover_url: 'https://cdn.example.test/cover.png' });
    assert.equal(image.mime, 'image/png');
    assert.equal(image.type, 'image');
  });

  it('maps product covers and artifact MIME', () => {
    const product = mapProductAsset({ id: 'p', name: '商品', cover: { original_name: 'product.jpg' } });
    assert.equal(product.mime, 'image/jpeg');
    assert.equal(product.type, 'image');
    const artifact = mapArtifactAsset({ id: 'art', title: '生成图', mime: 'image/webp' });
    assert.equal(artifact.mime, 'image/webp');
    assert.equal(artifact.type, 'image');
  });

  it('keeps unknown cloud media type from being promoted by a cover', () => {
    const unknown = mapCloudAsset({ id: 'x', name: '未知', media_type: 'video', cover_url: 'https://cdn.example.test/cover.png' });
    assert.equal(unknown.mime, undefined);
  });
});


describe('media URL vs thumbnail separation', () => {
  it('submits the cloud media file and keeps the cover for the grid thumbnail', () => {
    const item = mapCloudAsset({ id: 'v', name: '视频', media_type: 'video', media_url: 'https://cdn.example.test/clip.mp4', cover_url: 'https://cdn.example.test/clip.png' });
    assert.equal(item.url, 'https://cdn.example.test/clip.mp4');
    assert.equal(item.thumbUrl, 'https://cdn.example.test/clip.png');
  });

  it('falls back to which=media when the cloud row has no media URL', () => {
    const item = mapCloudAsset({ id: 'x', name: '视频', media_type: 'video', cover_url: 'https://cdn.example.test/cover.png' });
    assert.equal(item.url, '/omnimux/assets/cloud/media?id=x&which=media');
    assert.equal(item.mime, undefined);
  });

  it('resolves the local file variant against the target slot, not the asset category', () => {
    const item = mapLocalAsset({
      id: 'v',
      name: '本地场景',
      type: 'scene',
      cover: { id: 'cover', kind: 'image', original_name: 'cover.png' },
      files: [
        { id: 'cover', kind: 'image', original_name: 'cover.png' },
        { id: 'media', kind: 'video', original_name: 'clip.mp4' },
      ],
    });
    assert.equal(item.thumbUrl, '/omnimux/assets/library/preview?id=v&file=cover');
    const image = assetForSlot(item, 'image');
    assert.equal(image.type, 'image');
    assert.equal(image.mime, 'image/png');
    assert.equal(image.url, '/omnimux/assets/library/preview?id=v&file=cover');
    const video = assetForSlot(item, 'video');
    assert.equal(video.type, 'video');
    assert.equal(video.mime, 'video/mp4');
    assert.equal(video.url, '/omnimux/assets/library/preview?id=v&file=media');
    // No audio variant: fail-closed through the submit layer's slot check.
    const audio = assetForSlot(item, 'audio');
    assert.equal(audio.type, 'image');
    const rejection = rejectionOf({ type: audio.mime }, { type: 'audio' }, null, { existing: [] });
    assert.match(rejection, /请上传音频/);

    const audioOnly = mapLocalAsset({
      id: 'a',
      name: '本地音频',
      type: 'custom',
      cover: { id: 'cover', kind: 'image', original_name: 'cover.png' },
      files: [
        { id: 'cover', kind: 'image', original_name: 'cover.png' },
        { id: 'voice', kind: 'audio', original_name: 'voice.mp3' },
      ],
    });
    assert.equal(audioOnly.mediaByKind.audio, undefined, 'preview route cannot serve audio');
  });

  it('reads mime_type and meta.source_media_url', () => {
    assert.equal(pickerMimeOf({ mime_type: 'image/webp' }), 'image/webp');
    const item = mapCloudAsset({ id: 'v', name: '视频', media_type: 'video', meta: { source_media_url: 'https://cdn.example.test/movie.mp4' } });
    assert.equal(item.mime, 'video/mp4');
    assert.equal(item.url, 'https://cdn.example.test/movie.mp4');
  });
});
