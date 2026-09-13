import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  extractMediaFromElement,
  createMediaTailElement,
  enhanceAssistantBubble,
  scanAndEnhanceAssistantBubbles,
  installAssistantMessageMediaEnhancer,
} from './assistantMessageMediaEnhancer.ts';
import { getGlobalMediaViewerStore } from '../media-viewer/media-viewer-store.js';

test('assistantMessageMediaEnhancer: extractMediaFromElement extracts images and videos', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="content"><p>已生成图片</p><img src="http://example.com/a.jpg" alt="夜景" /><video src="http://example.com/b.mp4" title="动画"></video></div></body></html>');
  const div = dom.window.document.getElementById('content');
  assert.ok(div);

  const media = extractMediaFromElement(div);
  assert.equal(media.length, 2);
  assert.equal(media[0].url, 'http://example.com/a.jpg');
  assert.equal(media[0].type, 'image');
  assert.equal(media[0].title, '夜景');
  assert.equal(media[1].url, 'http://example.com/b.mp4');
  assert.equal(media[1].type, 'video');
  assert.equal(media[1].title, '动画');
});

test('assistantMessageMediaEnhancer: createMediaTailElement for single media item', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const doc = dom.window.document;

  const tail = createMediaTailElement([{ url: 'http://example.com/1.jpg', type: 'image', title: '单图' }], doc);
  assert.equal(tail.className, 'omx-chat-media-tail');
  assert.equal(tail.getAttribute('data-omx-media-tail'), 'true');

  const card = tail.querySelector('.omx-chat-media-tail__card');
  assert.ok(card);
  const img = card.querySelector('img');
  assert.ok(img);
  assert.equal(img.getAttribute('src'), 'http://example.com/1.jpg');

  const copyBtn = tail.querySelector('button[title="复制图片链接"]');
  assert.ok(copyBtn);
  const openBtn = tail.querySelector('button[title="在右侧侧边栏打开大图"]');
  assert.ok(openBtn);
});

test('assistantMessageMediaEnhancer: createMediaTailElement for multiple media items creates horizontal grid', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const doc = dom.window.document;

  const tail = createMediaTailElement([
    { url: 'http://example.com/a.jpg', type: 'image', title: '侧景' },
    { url: 'http://example.com/b.jpg', type: 'image', title: '正景' },
  ], doc);

  const grid = tail.querySelector('.omx-chat-media-tail__grid');
  assert.ok(grid);
  const cards = grid.querySelectorAll('.omx-chat-media-tail__card');
  assert.equal(cards.length, 2);
  assert.equal(cards[0].querySelector('img')?.getAttribute('src'), 'http://example.com/a.jpg');
  assert.equal(cards[1].querySelector('img')?.getAttribute('src'), 'http://example.com/b.jpg');
});

test('assistantMessageMediaEnhancer: enhanceAssistantBubble mounts card and registers to global store', () => {
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <div class="assistantRow_abc">
          <div class="bubble_def">
            <p>图片已生成。</p>
            <img src="http://example.com/mcdonalds.jpg" alt="麦当劳场景" />
          </div>
        </div>
      </body>
    </html>
  `);
  const doc = dom.window.document;
  const bubble = doc.querySelector('.bubble_def') as HTMLElement;
  assert.ok(bubble);

  const enhanced = enhanceAssistantBubble(bubble, doc);
  assert.equal(enhanced, true);
  assert.equal(bubble.getAttribute('data-omx-media-enhanced'), 'true');

  // Verify tail mounted
  const tail = bubble.querySelector('.omx-chat-media-tail');
  assert.ok(tail);

  // Verify registered in store
  const store = getGlobalMediaViewerStore();
  const found = store.getSnapshot().mediaList.find((m) => m.url === 'http://example.com/mcdonalds.jpg');
  assert.ok(found);
  assert.equal(found.url, 'http://example.com/mcdonalds.jpg');

  // Idempotent: second call returns false
  const enhancedAgain = enhanceAssistantBubble(bubble, doc);
  assert.equal(enhancedAgain, false);
});

test('assistantMessageMediaEnhancer: scanAndEnhanceAssistantBubbles finds and enhances bubbles', () => {
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <div class="assistantRow">
          <div class="bubble">
            <img src="http://example.com/test1.jpg" />
          </div>
        </div>
        <div class="assistantStack">
          <div class="bubble">
            <img src="http://example.com/test2.jpg" />
          </div>
        </div>
      </body>
    </html>
  `);
  const doc = dom.window.document;

  const count = scanAndEnhanceAssistantBubbles(doc);
  assert.equal(count, 2);

  const tails = doc.querySelectorAll('.omx-chat-media-tail');
  assert.equal(tails.length, 2);
});

test('assistantMessageMediaEnhancer: installAssistantMessageMediaEnhancer observes DOM changes', async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>');
  const doc = dom.window.document;

  const cleanup = installAssistantMessageMediaEnhancer(doc);

  const container = doc.getElementById('container')!;
  const newRow = doc.createElement('div');
  newRow.className = 'assistantRow';
  const bubble = doc.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = '<img src="http://example.com/dynamic.jpg" />';
  newRow.appendChild(bubble);
  container.appendChild(newRow);

  // Wait for mutation observer timeout
  await new Promise((resolve) => setTimeout(resolve, 200));

  const tail = bubble.querySelector('.omx-chat-media-tail');
  assert.ok(tail);

  cleanup();
});
