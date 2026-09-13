import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  cleanUserBubbles,
  enhanceUserBubble,
  scanAndEnhanceAllBubbles,
  createLinkPillElement,
  injectLinkPillStyles,
  installUserMessageLinkEnhancer,
} from './userMessageLinkEnhancer.ts';
import { detectMessageLinks } from './linkPillMetadata.ts';
import { CLEANED_ATTR } from './attachedContextCleaner.ts';

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

// ─────────────────────────────────────────────────────────────
// 会话关联上下文清洁接线：复刻附件的结构化数据只喂模型，不上屏
// ─────────────────────────────────────────────────────────────

/** 复刻提交时的真实气泡文本：用户那句话 + 附件关联上下文数据块。 */
const REPLICATE_USER_TEXT = '复刻这条爆款视频';
const REPLICATE_CONTEXT_BLOCK = [
  '',
  '---',
  '### 会话关联上下文 (Attached Context):',
  '- [视频] US beauty hook (`MP4`, 0:31): @inspiration/videos/us-beauty.mp4',
].join('\n');

/** 按宿主真实结构搭一个用户气泡。 */
function buildUserBubbleDom(bubbleHtml: string) {
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <div class="VnbZpq_userRow">
          <div class="VnbZpq_userStack">
            ${bubbleHtml}
          </div>
        </div>
      </body>
    </html>
  `);
  const doc = dom.window.document;
  const bubble = doc.querySelector('.VnbZpq_bubble') as HTMLElement;
  assert.ok(bubble, '夹具必须产出用户气泡');
  return { doc, bubble };
}

test('userMessageLinkEnhancer: 扫描气泡时把会话关联上下文数据块摘掉，只留用户自己写的话', () => {
  const promptRun = `${REPLICATE_USER_TEXT}${REPLICATE_CONTEXT_BLOCK}`;
  const { doc, bubble } = buildUserBubbleDom(
    `<div class="VnbZpq_bubble"><span>${promptRun}</span></div>`,
  );

  scanAndEnhanceAllBubbles(doc);

  const text = (bubble.textContent || '').replace(/\s+/g, ' ').trim();
  assert.equal(text, REPLICATE_USER_TEXT, '气泡只该剩用户那句话');
  assert.ok(!text.includes('会话关联上下文'), '附加数据块标题不得上屏');
  assert.ok(!text.includes('Attached Context'), '附加数据块英文标题不得上屏');
  assert.ok(!bubble.innerHTML.includes('@inspiration/'), '附件引用路径不得渲染成链接胶囊');
  assert.equal(bubble.getAttribute(CLEANED_ATTR), 'true', '清洁过的气泡要留痕，便于排查');
});

test('userMessageLinkEnhancer: 多段渲染（宿主按 Markdown 拆节点）时数据块整块摘除且留一条分隔线都不剩', () => {
  const { doc, bubble } = buildUserBubbleDom(`
    <div class="VnbZpq_bubble">
      <p><span>${REPLICATE_USER_TEXT}</span></p>
      <hr>
      <p><span>### 会话关联上下文 (Attached Context):</span></p>
      <ul>
        <li><span>- [视频] US beauty hook (\`MP4\`, 0:31): @inspiration/videos/us-beauty.mp4</span></li>
      </ul>
    </div>
  `);

  scanAndEnhanceAllBubbles(doc);

  const text = (bubble.textContent || '').replace(/\s+/g, ' ').trim();
  assert.equal(text, REPLICATE_USER_TEXT, '用户正文必须原样保留');
  assert.equal(bubble.querySelectorAll('hr').length, 0, '数据块自带的分隔线不得留成孤线');
});

test('userMessageLinkEnhancer: 每次扫描都对全部气泡重新对账——已增强标记不拦清洁', () => {
  // 宿主重渲染会把提交时的完整文本写回 DOM，而已增强标记会拦住二次增强。
  // 因此清洁必须由**扫描**独立完成，不能搭在增强这条路上。
  // 这里预先打上增强标记，让增强被彻底拦住，只有扫描对账能救回干净气泡。
  const promptRun = `${REPLICATE_USER_TEXT}${REPLICATE_CONTEXT_BLOCK}`;
  const { doc, bubble } = buildUserBubbleDom(
    `<div class="VnbZpq_bubble" data-omx-link-enhanced="true"><span>${promptRun}</span></div>`,
  );

  const enhanced = scanAndEnhanceAllBubbles(doc);
  assert.equal(enhanced, 0, '已增强的气泡不再重复增强（前置条件成立）');

  const text = (bubble.textContent || '').replace(/\s+/g, ' ').trim();
  assert.equal(text, REPLICATE_USER_TEXT, '扫描必须独立把数据块摘掉，不能依赖增强路径');
  assert.ok(!text.includes('会话关联上下文'), '重渲染不得让数据块回到屏幕上');
  assert.equal(bubble.getAttribute(CLEANED_ATTR), 'true', '扫描清洁过的气泡要留痕');
});

test('userMessageLinkEnhancer: 没有数据块的气泡原样保留，清洁是幂等的', () => {
  const { doc, bubble } = buildUserBubbleDom(
    `<div class="VnbZpq_bubble"><span>分析拆解视频 https://www.tiktok.com/@user/video/123</span></div>`,
  );

  const firstPass = cleanUserBubbles(doc);
  assert.equal(firstPass, 0, '没有数据块就不该动用户内容');
  assert.equal(bubble.getAttribute(CLEANED_ATTR), null, '未清洁的气泡不留痕');

  const textBefore = bubble.textContent;
  const secondPass = cleanUserBubbles(doc);
  assert.equal(secondPass, 0);
  assert.equal(bubble.textContent, textBefore, '重复执行不得改变用户内容');
});

test('userMessageLinkEnhancer: 清洁后仍正常收敛正文里的链接胶囊', () => {
  const promptRun = `复刻这条爆款视频 https://www.tiktok.com/@user/video/123${REPLICATE_CONTEXT_BLOCK}`;
  const { doc, bubble } = buildUserBubbleDom(
    `<div class="VnbZpq_bubble"><span>${promptRun}</span></div>`,
  );

  scanAndEnhanceAllBubbles(doc);

  const pills = bubble.querySelectorAll('.omx-chat-link-pill');
  assert.equal(pills.length, 1, '用户自己写的链接仍要变成胶囊');
  assert.equal(pills[0].getAttribute('data-raw-url'), 'https://www.tiktok.com/@user/video/123');
  const text = (bubble.textContent || '').replace(/\s+/g, ' ').trim();
  assert.ok(!text.includes('会话关联上下文'), '数据块不得因为插了胶囊而漏删');
});


test('userMessageLinkEnhancer: 宿主只改写文本节点（不加新节点）也会触发重扫，数据块不得回屏', async () => {
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <div data-conversation-scroll="true">
          <div class="VnbZpq_userRow">
            <div class="VnbZpq_userStack">
              <div class="VnbZpq_bubble"><span>复刻这条爆款视频</span></div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);
  const doc = dom.window.document;
  const cleanup = installUserMessageLinkEnhancer(doc);
  const bubble = doc.querySelector('.VnbZpq_bubble') as HTMLElement;
  const span = bubble.querySelector('span') as HTMLElement;
  const textNode = span.firstChild as Text;

  // 宿主重渲染：就地改写已有文本节点（characterData 变更，不新增任何节点）
  textNode.nodeValue = `${REPLICATE_USER_TEXT}${REPLICATE_CONTEXT_BLOCK}`;
  await new Promise((resolve) => setTimeout(resolve, 80));

  const text = (bubble.textContent || '').replace(/\s+/g, ' ').trim();
  assert.equal(text, REPLICATE_USER_TEXT, '只改文本节点也必须重扫，把数据块摘掉');
  assert.ok(!text.includes('会话关联上下文'), '数据块不得因为宿主只改文本就重新上屏');

  cleanup();
});
