import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  extractFilename,
  extractMediaFromElement,
  deduplicateTurnMedia,
  createMediaTailElement,
  enhanceTurnMedia,
  scanAndEnhanceTurns,
  markAutoOpened,
  hasAutoOpened,
  resetAutoOpenedForTests,
} from './assistantMessageMediaEnhancer.ts';
import { getGlobalMediaViewerStore } from '../media-viewer/media-viewer-store.js';

test('assistantMessageMediaEnhancer: extractFilename extracts valid media filenames', () => {
  // Query param path
  assert.equal(
    extractFilename('/plugins/omnimux-viewer/serve?path=%2FUsers%2Fx%2Fimages%2Fimage-2026-09-14T03-25-33-991Z-mtogp3-0.jpg'),
    'image-2026-09-14T03-25-33-991Z-mtogp3-0.jpg'
  );
  // Direct file path
  assert.equal(
    extractFilename('/Users/x/.dsh/plugins/subscriptions/images/photo.png'),
    'photo.png'
  );
  // Basename directly
  assert.equal(extractFilename('test_video.mp4'), 'test_video.mp4');
  // Data URL returns undefined
  assert.equal(extractFilename('data:image/jpeg;base64,/9j/4AAQSkZJRg...'), undefined);
});

test('assistantMessageMediaEnhancer: extractMediaFromElement extracts images and videos with normalization', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="content"><p>已生成图片</p><img src="http://example.com/a.jpg" alt="夜景" /><video src="http://example.com/b.mp4" title="动画"></video></div></body></html>');
  const div = dom.window.document.getElementById('content');
  assert.ok(div);

  const media = extractMediaFromElement(div);
  assert.equal(media.length, 2);
  assert.equal(media[0].url, 'http://example.com/a.jpg');
  assert.equal(media[0].type, 'image');
  assert.equal(media[0].filename, 'a.jpg');
  assert.equal(media[0].canonicalKey, 'file:a.jpg');
  assert.equal(media[1].url, 'http://example.com/b.mp4');
  assert.equal(media[1].type, 'video');
  assert.equal(media[1].filename, 'b.mp4');
  assert.equal(media[1].canonicalKey, 'file:b.mp4');
});

test('assistantMessageMediaEnhancer: deduplicateTurnMedia merges data URL and persistent URL of the same asset', () => {
  const raw = [
    // 1. Data URL preview produced by image_generate
    {
      url: 'data:image/jpeg;base64,xxxxxxx',
      type: 'image' as const,
      title: 'image-2026-09-14T03-25-33-991Z-mtogp3-0.jpg',
      filename: 'image-2026-09-14T03-25-33-991Z-mtogp3-0.jpg',
      canonicalKey: 'file:image-2026-09-14t03-25-33-991z-mtogp3-0.jpg',
      isDataUrl: true,
      score: 5,
    },
    // 2. Persistent file URL viewed by display_file
    {
      url: '/plugins/omnimux-viewer/serve?path=%2FUsers%2Fx%2Fimages%2Fimage-2026-09-14T03-25-33-991Z-mtogp3-0.jpg',
      type: 'image' as const,
      title: 'image-2026-09-14T03-25-33-991Z-mtogp3-0.jpg',
      filename: 'image-2026-09-14T03-25-33-991Z-mtogp3-0.jpg',
      canonicalKey: 'file:image-2026-09-14t03-25-33-991z-mtogp3-0.jpg',
      isDataUrl: false,
      score: 20,
    },
  ];

  const deduped = deduplicateTurnMedia(raw);
  assert.equal(deduped.length, 1, 'Must merge into exactly 1 canonical media item');
  assert.equal(deduped[0].url, '/plugins/omnimux-viewer/serve?path=%2FUsers%2Fx%2Fimages%2Fimage-2026-09-14T03-25-33-991Z-mtogp3-0.jpg');
  assert.equal(deduped[0].score, 20, 'Must promote the persistent URL over data URL');
});

test('assistantMessageMediaEnhancer: deduplicateTurnMedia preserves distinct generated images', () => {
  const raw = [
    {
      url: 'http://example.com/img1.jpg',
      type: 'image' as const,
      title: '第一张',
      filename: 'img1.jpg',
      canonicalKey: 'file:img1.jpg',
      score: 20,
    },
    {
      url: 'http://example.com/img2.jpg',
      type: 'image' as const,
      title: '第二张',
      filename: 'img2.jpg',
      canonicalKey: 'file:img2.jpg',
      score: 20,
    },
  ];

  const deduped = deduplicateTurnMedia(raw);
  assert.equal(deduped.length, 2, 'Distinct files must not be merged');
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
});

test('assistantMessageMediaEnhancer: enhanceTurnMedia deduplicates image_generate + display_file in same turn to 1 tail card', () => {
  resetAutoOpenedForTests();
  const filename = 'image-2026-09-14T03-25-33-991Z-mtogp3-0.jpg';
  const persistentUrl = `/plugins/omnimux-viewer/serve?path=%2FUsers%2Fx%2F.omnimux-dev%2Fplugins%2Fsubscriptions%2Fimages%2F${filename}`;

  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <!-- Turn header / process -->
        <div class="flowItem" data-chat-turn="88" data-chat-flow-kind="turn-process">
          <button class="turnProcessToggle">2 次工具调用 · 2 条消息</button>
        </div>

        <!-- 1. image_generate tool result (rendered as Base64 data URL in ImageGallery) -->
        <div class="flowItem" data-chat-turn="88" data-chat-flow-kind="tool" data-turn-process-member data-turn-process-hidden hidden>
          <div class="toolview_card">
            <span class="title">image_generate: 麦当劳靠窗柜台...</span>
            <img src="data:image/jpeg;base64,/9j/4AAQSkZJRg..." alt="${filename}" />
          </div>
        </div>

        <!-- 2. display_file tool result (rendered via ViewerCard with persistent serve URL) -->
        <div class="flowItem" data-chat-turn="88" data-chat-flow-kind="tool" data-turn-process-member data-turn-process-hidden hidden>
          <div class="dshview-card">
            <span class="dshview-path" title="/Users/x/.omnimux-dev/plugins/subscriptions/images/${filename}">${filename}</span>
            <img class="dshview-image" src="${persistentUrl}" alt="${filename}" />
          </div>
        </div>

        <!-- 3. Visible assistant answer text bubble -->
        <div class="flowItem" data-chat-turn="88" data-chat-flow-kind="assistant-step" data-turn-process-answer>
          <div class="assistantRow">
            <div class="bubble">
              <p>图已生成：两人坐在麦当劳靠窗柜台，短裙、双腿自然分开，从人行道外透过玻璃的抓拍视角。</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);
  const doc = dom.window.document;
  const turnNodes = Array.from(doc.querySelectorAll<HTMLElement>('[data-chat-turn="88"]'));

  let openedTabId = '';
  (dom.window as any).__omnimuxWorkbench = {
    openWorkbench: (opts: any) => {
      openedTabId = opts?.tabId;
    },
  };

  const enhanced = enhanceTurnMedia('88', turnNodes, doc);
  assert.equal(enhanced, true);

  // 1. Verify answer bubble contains EXACTLY ONE preview card (NOT TWO!)
  const answerBubble = doc.querySelector('.bubble')!;
  const tail = answerBubble.querySelector('.omx-chat-media-tail');
  assert.ok(tail, 'Media tail must be mounted inside answer bubble');

  const cards = tail.querySelectorAll('.omx-chat-media-tail__card');
  assert.equal(cards.length, 1, 'Must contain exactly 1 card, NOT two duplicate results!');

  // 2. Verify the card uses the persistent URL, not the data URL
  const mountedImg = cards[0].querySelector('img')!;
  assert.equal(mountedImg.getAttribute('src'), persistentUrl);

  // 3. Verify old action bar removed, and new canvas pill button present
  assert.equal(cards[0].querySelector('.omx-chat-media-tail__actions'), null, 'Old bottom actions bar must be removed');
  const canvasBtn = cards[0].querySelector('.omx-chat-media-tail__canvas-btn');
  assert.ok(canvasBtn, 'Pill canvas button must exist in top-right of card');
  assert.match(canvasBtn.textContent || '', /画布/, 'Canvas button must display "画布"');

  // 4. Verify clicking the canvas button switches to 2col canvas mode and collapses conversation
  const store = getGlobalMediaViewerStore();
  (canvasBtn as HTMLElement).click();
  assert.equal(store.getSnapshot().layoutMode, '2col', 'Must enter 2col canvas layout mode');
  assert.equal(doc.documentElement.getAttribute('data-omnimux-conversation-collapsed'), 'true', 'Must collapse middle conversation column');

  // 5. Verify right sidebar auto-open triggered
  assert.equal(openedTabId, 'omnimux:media-viewer');
  assert.equal(hasAutoOpened(`file:${filename.toLowerCase()}`), true);

  // 6. Idempotent: second call returns false
  const secondCall = enhanceTurnMedia('88', turnNodes, doc);
  assert.equal(secondCall, false);
  assert.equal(answerBubble.querySelectorAll('.omx-chat-media-tail').length, 1);
});

test('assistantMessageMediaEnhancer: scanAndEnhanceTurns scans full conversation and enhances all turns with media', () => {
  resetAutoOpenedForTests();
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <!-- Turn 1 -->
        <div class="flowItem" data-chat-turn="1" data-chat-flow-kind="tool" data-turn-process-hidden hidden>
          <img src="http://example.com/turn1.jpg" />
        </div>
        <div class="flowItem" data-chat-turn="1" data-chat-flow-kind="assistant-step">
          <div class="bubble">Turn 1 Answer</div>
        </div>

        <!-- Turn 2 -->
        <div class="flowItem" data-chat-turn="2" data-chat-flow-kind="tool" data-turn-process-hidden hidden>
          <img src="http://example.com/turn2.jpg" />
        </div>
        <div class="flowItem" data-chat-turn="2" data-chat-flow-kind="assistant-step">
          <div class="bubble">Turn 2 Answer</div>
        </div>
      </body>
    </html>
  `);
  const doc = dom.window.document;

  const count = scanAndEnhanceTurns(doc);
  assert.equal(count, 2);

  const tails = doc.querySelectorAll('.omx-chat-media-tail');
  assert.equal(tails.length, 2);
});
