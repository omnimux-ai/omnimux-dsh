import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  enhanceUserBubble,
  scanAndEnhanceAllBubbles,
  createLinkPillElement,
  injectLinkPillStyles,
  installUserMessageLinkEnhancer,
} from './userMessageLinkEnhancer.ts';
import { detectMessageLinks } from './linkPillMetadata.ts';

test('userMessageLinkEnhancer: injectLinkPillStyles injects style tag idempotently', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
  const doc = dom.window.document;

  injectLinkPillStyles(doc);
  assert.equal(doc.querySelectorAll('#omx-chat-link-pill-styles').length, 1);

  // Second injection should not duplicate
  injectLinkPillStyles(doc);
  assert.equal(doc.querySelectorAll('#omx-chat-link-pill-styles').length, 1);
});

test('userMessageLinkEnhancer: createLinkPillElement builds interactive pill DOM', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
  const doc = dom.window.document;

  const links = detectMessageLinks('分析 https://www.tiktok.com/@user/video/123');
  assert.equal(links.length, 1);

  const pill = createLinkPillElement(links[0], doc);
  assert.equal(pill.className, 'omx-chat-link-pill');
  assert.equal(pill.getAttribute('data-omx-link-pill'), 'true');
  assert.equal(pill.getAttribute('data-raw-url'), 'https://www.tiktok.com/@user/video/123');
  assert.equal(pill.getAttribute('title'), 'https://www.tiktok.com/@user/video/123');

  const titleEl = pill.querySelector('.omx-chat-link-pill__title');
  assert.ok(titleEl);
  assert.equal(titleEl.textContent, 'TikTok - @user');

  const iconEl = pill.querySelector('.omx-chat-link-pill__icon');
  assert.ok(iconEl);
  assert.ok(iconEl.innerHTML.includes('<svg'));
});

test('userMessageLinkEnhancer: enhanceUserBubble converts raw URL to pill within user bubble', () => {
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <div class="VnbZpq_userRow">
          <div class="VnbZpq_userStack">
            <div class="VnbZpq_bubble">
              <span class="css-test_plainRun">分析拆解视频 https://www.tiktok.com/@jinglenap.official/video/7675208855269281054?is_from_webapp=1&sender_device=pc</span>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);
  const doc = dom.window.document;
  const bubble = doc.querySelector('.VnbZpq_bubble') as HTMLElement;
  assert.ok(bubble);

  const enhanced = enhanceUserBubble(bubble, doc);
  assert.equal(enhanced, true);
  assert.equal(bubble.getAttribute('data-omx-link-enhanced'), 'true');

  // Pill exists inside bubble
  const pill = bubble.querySelector('.omx-chat-link-pill') as HTMLElement;
  assert.ok(pill);
  assert.equal(pill.getAttribute('data-raw-url'), 'https://www.tiktok.com/@jinglenap.official/video/7675208855269281054?is_from_webapp=1&sender_device=pc');

  // Text before pill remains intact
  const firstText = bubble.querySelector('.css-test_plainRun')?.childNodes[0];
  assert.equal(firstText?.nodeValue, '分析拆解视频 ');

  // Idempotency: re-running does not re-wrap or duplicate
  const reEnhanced = enhanceUserBubble(bubble, doc);
  assert.equal(reEnhanced, false);
  assert.equal(bubble.querySelectorAll('.omx-chat-link-pill').length, 1);
});

test('userMessageLinkEnhancer: scanAndEnhanceAllBubbles scans all matching user bubbles', () => {
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <div class="VnbZpq_userRow">
          <div class="VnbZpq_userStack">
            <div class="VnbZpq_bubble">这是第一个链接 https://youtube.com/watch?v=123</div>
          </div>
        </div>
        <div class="VnbZpq_userRow">
          <div class="VnbZpq_userStack">
            <div class="VnbZpq_bubble">这是第二个链接 https://bilibili.com/video/BV123</div>
          </div>
        </div>
      </body>
    </html>
  `);
  const doc = dom.window.document;

  const count = scanAndEnhanceAllBubbles(doc);
  assert.equal(count, 2);

  const pills = doc.querySelectorAll('.omx-chat-link-pill');
  assert.equal(pills.length, 2);
  assert.equal(pills[0].getAttribute('data-raw-url'), 'https://youtube.com/watch?v=123');
  assert.equal(pills[1].getAttribute('data-raw-url'), 'https://bilibili.com/video/BV123');
});

test('userMessageLinkEnhancer: skips bubbles already marked as enhanced', () => {
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <div class="VnbZpq_userRow">
          <div class="VnbZpq_userStack">
            <div class="VnbZpq_bubble" data-omx-link-enhanced="true">https://youtube.com/watch?v=123</div>
          </div>
        </div>
      </body>
    </html>
  `);
  const doc = dom.window.document;
  const count = scanAndEnhanceAllBubbles(doc);
  assert.equal(count, 0);
  assert.equal(doc.querySelectorAll('.omx-chat-link-pill').length, 0);
});

test('userMessageLinkEnhancer: installUserMessageLinkEnhancer targets conversation scroll container', async () => {
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <div data-conversation-scroll="true">
          <div class="VnbZpq_userRow">
            <div class="VnbZpq_userStack">
              <div class="VnbZpq_bubble">测试链接 https://youtube.com/watch?v=456</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);
  const doc = dom.window.document;
  const cleanup = installUserMessageLinkEnhancer(doc);

  // Initial scan should enhance bubble inside data-conversation-scroll
  assert.equal(doc.querySelectorAll('.omx-chat-link-pill').length, 1);
  const bubble = doc.querySelector('.VnbZpq_bubble');
  assert.equal(bubble?.getAttribute('data-omx-link-enhanced'), 'true');

  // Dynamic bubble insertion in scroll container triggers debounced enhancer
  const scrollContainer = doc.querySelector('[data-conversation-scroll]');
  const newRow = doc.createElement('div');
  newRow.className = 'VnbZpq_userRow';
  newRow.innerHTML = '<div class="VnbZpq_userStack"><div class="VnbZpq_bubble">新链接 https://x.com/user/status/789</div></div>';
  scrollContainer?.appendChild(newRow);

  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(doc.querySelectorAll('.omx-chat-link-pill').length, 2);

  cleanup();
});

