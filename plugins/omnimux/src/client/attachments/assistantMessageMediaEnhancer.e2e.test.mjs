import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createMediaTailElement } from './assistantMessageMediaEnhancer.ts';

test('QA: Chat media gallery AC-1 to AC-9 verification', async (t) => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const doc = dom.window.document;

  await t.test('AC-1: Single item renders single card without gallery modifiers or rail', () => {
    const singleItem = [
      { url: 'http://example.com/solo.png', type: 'image', title: '单图', filename: 'solo.png' }
    ];
    const el = createMediaTailElement(singleItem, doc);
    assert.equal(el.classList.contains('omx-chat-media-tail--gallery'), false);
    assert.equal(el.querySelector('.omx-chat-media-tail__rail'), null);
    assert.equal(el.querySelector('.omx-chat-media-tail__counter'), null);
    assert.ok(el.querySelector('.omx-chat-media-tail__card'));
  });

  await t.test('AC-2 ~ AC-6: Multi-item gallery structure, counter, rail and selection', () => {
    const multiItems = [
      { url: 'http://example.com/item1.png', type: 'image', title: '图1', filename: 'item1.png' },
      { url: 'http://example.com/item2.mp4', type: 'video', title: '视频2', filename: 'item2.mp4' },
      { url: 'http://example.com/item3.png', type: 'image', title: '图3', filename: 'item3.png' },
      { url: 'http://example.com/item4.png', type: 'image', title: '图4', filename: 'item4.png' },
    ];

    const el = createMediaTailElement(multiItems, doc);
    doc.body.appendChild(el);

    // AC-2: Container and main/rail presence
    assert.ok(el.classList.contains('omx-chat-media-tail--gallery'));
    const main = el.querySelector('.omx-chat-media-tail__main');
    const rail = el.querySelector('.omx-chat-media-tail__rail');
    assert.ok(main);
    assert.ok(rail);

    // AC-3: Initial counter
    const counter = main?.querySelector('.omx-chat-media-tail__counter');
    assert.equal(counter?.textContent?.trim(), '1 / 4');

    // AC-4: Thumbnails and active state
    const thumbs = rail?.querySelectorAll('.omx-chat-media-tail__thumb') || [];
    assert.equal(thumbs.length, 4);
    assert.ok(thumbs[0].classList.contains('is-active'));
    assert.equal(thumbs[0].getAttribute('aria-selected'), 'true');

    // AC-7: Video item has duration tag in thumbnail
    const videoThumb = thumbs[1];
    assert.ok(videoThumb.querySelector('.omx-chat-media-tail__dur'));

    // AC-4: Click thumbnail 1 (video)
    videoThumb.click();
    assert.equal(counter?.textContent?.trim(), '2 / 4');
    assert.ok(videoThumb.classList.contains('is-active'));
    assert.equal(thumbs[0].classList.contains('is-active'), false);
    const video = main?.querySelector('video');
    assert.ok(video);
    assert.equal(video?.getAttribute('src'), 'http://example.com/item2.mp4');
    assert.equal(main?.style.aspectRatio, '16 / 9');

    // AC-8: Keyboard navigation ArrowRight
    el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(counter?.textContent?.trim(), '3 / 4');
    assert.ok(thumbs[2].classList.contains('is-active'));
    assert.equal(main?.querySelector('img')?.getAttribute('src'), 'http://example.com/item3.png');

    // ArrowLeft wraps or navigates backwards
    el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    assert.equal(counter?.textContent?.trim(), '2 / 4');
    assert.ok(thumbs[1].classList.contains('is-active'));
  });
});
