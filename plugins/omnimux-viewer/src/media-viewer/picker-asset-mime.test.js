import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapArtifactAsset, mapCloudAsset, mapLocalAsset, mapProductAsset, pickerKindOf, pickerMimeOf } from './picker-asset-mime.js';

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
    const audio = mapCloudAsset({ id: 'a', name: '音频', media_type: 'audio', media_url: 'https://cdn.example.test/voice.wav', cover_url: 'https://cdn.example.test/cover.png' });
    assert.equal(audio.mime, 'audio/wav');
    assert.equal(audio.type, 'audio');
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
