import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  extractMediaFromElement,
  createMediaTailElement,
  enhanceTurnMedia,
  scanAndEnhanceTurns,
  markAutoOpened,
  hasAutoOpened,
  resetAutoOpenedForTests,
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
});

test('assistantMessageMediaEnhancer: enhanceTurnMedia extracts media from collapsed tool and forces display in answer bubble', () => {
  resetAutoOpenedForTests();
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <div class="flowItem" data-chat-turn="42" data-chat-flow-kind="turn-process">
          <button class="turnProcessToggle">3 次工具调用 · 1 条消息</button>
        </div>
        <!-- Collapsed hidden tool node (containing image_generate or dshview card) -->
        <div class="flowItem" data-chat-turn="42" data-chat-flow-kind="tool" data-turn-process-member data-turn-process-hidden hidden>
          <div class="toolview_card">
            <img src="http://example.com/mcdonalds_hidden.jpg" alt="麦当劳场景" />
          </div>
        </div>
        <!-- Visible assistant answer node -->
        <div class="flowItem" data-chat-turn="42" data-chat-flow-kind="assistant-step" data-turn-process-answer>
          <div class="assistantRow">
            <div class="bubble">
              <p>图片已展示：窗外人行道视角与两位成年女性随意的抓拍感。</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);
  const doc = dom.window.document;
  const turnNodes = Array.from(doc.querySelectorAll<HTMLElement>('[data-chat-turn="42"]'));
  assert.equal(turnNodes.length, 3);

  let openedTabId = '';
  (dom.window as any).__omnimuxWorkbench = {
    openWorkbench: (opts: any) => {
      openedTabId = opts?.tabId;
    },
  };

  const enhanced = enhanceTurnMedia('42', turnNodes, doc);
  assert.equal(enhanced, true);

  // 1. Verify media extracted and mounted at the bottom of the visible assistant bubble outside the fold
  const answerBubble = doc.querySelector('.bubble')!;
  const tail = answerBubble.querySelector('.omx-chat-media-tail');
  assert.ok(tail, 'Media tail must be mounted inside the answer bubble');

  const mountedImg = tail.querySelector('img');
  assert.ok(mountedImg);
  assert.equal(mountedImg.getAttribute('src'), 'http://example.com/mcdonalds_hidden.jpg');

  // 2. Verify registered in global media store
  const store = getGlobalMediaViewerStore();
  const found = store.getSnapshot().mediaList.find((m) => m.url === 'http://example.com/mcdonalds_hidden.jpg');
  assert.ok(found);

  // 3. Verify automatic workbench open triggered
  assert.equal(openedTabId, 'omnimux:media-viewer');
  assert.equal(hasAutoOpened('http://example.com/mcdonalds_hidden.jpg'), true);

  // 4. Idempotent: second call returns false and does not double-mount
  const secondCall = enhanceTurnMedia('42', turnNodes, doc);
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
