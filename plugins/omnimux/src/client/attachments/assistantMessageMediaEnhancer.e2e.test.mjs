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

    // AC-3: Counter element is removed
    const counter = main?.querySelector('.omx-chat-media-tail__counter');
    assert.equal(counter, null, 'Counter element must not be rendered');

    // AC-4: Thumbnails and active state
    const thumbs = rail?.querySelectorAll('.omx-chat-media-tail__thumb') || [];
    assert.equal(thumbs.length, 4);
    assert.ok(thumbs[0].classList.contains('is-active'));
    assert.equal(thumbs[0].getAttribute('aria-selected'), 'true');

    // AC-7: Video item has duration tag and video element in thumbnail
    const videoThumb = thumbs[1];
    assert.ok(videoThumb.querySelector('.omx-chat-media-tail__dur'));
    const thumbVid = videoThumb.querySelector('video');
    assert.ok(thumbVid);
    assert.match(thumbVid?.getAttribute('src') || '', /item2\.mp4/);

    // AC-4: Click thumbnail 1 (video)
    videoThumb.click();
    assert.ok(videoThumb.classList.contains('is-active'));
    assert.equal(thumbs[0].classList.contains('is-active'), false);
    const video = main?.querySelector('video');
    assert.ok(video);
    assert.equal(video?.getAttribute('src'), 'http://example.com/item2.mp4');
    assert.match(main?.style.aspectRatio, /^1\.7778(\s*\/\s*1)?$/);

    // AC-8: Keyboard navigation ArrowRight
    el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.ok(thumbs[2].classList.contains('is-active'));
    assert.equal(main?.querySelector('img')?.getAttribute('src'), 'http://example.com/item3.png');
    assert.match(main?.style.aspectRatio, /^1(\.0+)?(\s*\/\s*1)?$/, '未就绪图片必须初始化为舞台安全兜底比例 1');

    // ArrowLeft wraps or navigates backwards
    el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    assert.ok(thumbs[1].classList.contains('is-active'));
  });

    await t.test('AC-10: 视频切片切换代次守卫彻底拦截过期异步回包竞态', async () => {
      const domSub = new JSDOM('<!DOCTYPE html><html><body></body></html>');
      const subItems = [
        { url: 'http://example.com/1.png', type: 'image' },
        { url: 'http://example.com/2.mp4', type: 'video' },
        { url: 'http://example.com/3.png', type: 'image' },
      ];
      const subEl = createMediaTailElement(subItems, domSub.window.document);
      domSub.window.document.body.appendChild(subEl);
      const subThumbs = subEl.querySelectorAll('.omx-chat-media-tail__thumb');
      const subMain = subEl.querySelector('.omx-chat-media-tail__main');
      assert.ok(subMain, '主舞台 DOM 节点必须存在');
      assert.equal(subThumbs.length, 3, '切片缩略图数量必须为 3');

      // 1. 点选切到视频
      subThumbs[1].click();
      const staleVid = subMain?.querySelector('video');
      assert.ok(staleVid);

      // 2. 紧接着快速点选切到图片 3
      subThumbs[2].click();
      assert.match(subMain?.style.aspectRatio, /^1(\.0+)?(\s*\/\s*1)?$/);

      // 3. 挂载测试探针确保 loadedmetadata 确实分发且执行了代次拦截
      let staleDispatched = false;
      staleVid.addEventListener('loadedmetadata', () => {
        staleDispatched = true;
      });
      Object.defineProperty(staleVid, 'videoWidth', { value: 1920, configurable: true });
      Object.defineProperty(staleVid, 'videoHeight', { value: 1080, configurable: true });
      staleVid.dispatchEvent(new domSub.window.Event('loadedmetadata'));

      // 4. 确凿断言：事件确实被真实分发，但主舞台宽高比未被迟到旧视频覆盖（代次守卫成功阻断，保持当前切片比例 1）
      assert.equal(staleDispatched, true, '旧视频的 loadedmetadata 必须被真实分发');
      assert.match(subMain?.style.aspectRatio, /^1(\.0+)?(\s*\/\s*1)?$/, '过期视频的 loadedmetadata 被代次拦截，不得覆盖当前切片宽高比');
    });
});
