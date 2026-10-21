import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickerKindOf, pickerMimeOf } from './picker-asset-mime.js';

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
