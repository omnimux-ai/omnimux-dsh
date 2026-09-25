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
  isUserMessageNode,
  isBreakdownOrAnalysisTurn,
  clampRatio,
  DEFAULT_THUMB_MIN_RATIO,
  DEFAULT_THUMB_MAX_RATIO,
  DEFAULT_THUMB_FALLBACK_RATIO,
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

test('assistantMessageMediaEnhancer: skips user message nodes so input attachments never become media tails', () => {
  resetAutoOpenedForTests();
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <div class="flowItem" data-chat-turn="9">
          <div class="userRow">
            <div class="userStack">
              <div class="attachmentRow" data-message-attachments>
                <img src="http://example.com/user-input.jpg" alt="科技Vlogger" />
              </div>
              <div class="bubble">复刻这条爆款视频</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);
  const doc = dom.window.document;
  const userRow = doc.querySelector('.userRow') as HTMLElement;
  assert.equal(isUserMessageNode(userRow), true);
  assert.equal(extractMediaFromElement(userRow).length, 0, '用户行内的图不得被扫成生成媒体');

  const turnNode = doc.querySelector('[data-chat-turn="9"]') as HTMLElement;
  // 整轮只有用户消息：不得挂尾卡
  assert.equal(enhanceTurnMedia('9', [turnNode], doc), false);
  assert.equal(doc.querySelectorAll('.omx-chat-media-tail').length, 0);
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

test('assistantMessageMediaEnhancer: enhanceTurnMedia deduplicates image_generate + display_file in same turn to 1 tail card', async () => {
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
    openWorkbench: async (opts: any) => {
      openedTabId = opts?.tabId;
      return true;
    },
    open: async (opts: any) => {
      openedTabId = opts?.tabId;
      return true;
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
  assert.ok(canvasBtn, 'Pill canvas button must exist on card');
  assert.match(canvasBtn.textContent || '', /画布/, 'Canvas button must display "画布"');

  // 4. Verify clicking the canvas button switches to 2col canvas mode and collapses conversation
  const store = getGlobalMediaViewerStore();
  (canvasBtn as HTMLElement).click();
  await new Promise((r) => setTimeout(r, 10));
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

test('assistantMessageMediaEnhancer: multi-item gallery structure, selection, video and keyboard navigation', async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const doc = dom.window.document;

  const items = [
    { url: 'http://example.com/face1.png', type: 'image' as const, title: '微笑·正面', filename: 'face1.png' },
    { url: 'http://example.com/demo.mp4', type: 'video' as const, title: '讲解·近景', filename: 'demo.mp4' },
    { url: 'http://example.com/face2.png', type: 'image' as const, title: '眨眼·侧身', filename: 'face2.png' },
  ];

  const gallery = createMediaTailElement(items, doc);
  doc.body.appendChild(gallery);

  // 1. Gallery layout & structure
  assert.ok(gallery.classList.contains('omx-chat-media-tail--gallery'), 'Must have gallery layout modifier class');
  const mainStage = gallery.querySelector('.omx-chat-media-tail__main');
  const rail = gallery.querySelector('.omx-chat-media-tail__rail');
  assert.ok(mainStage, 'Main stage must be present');
  assert.ok(rail, 'Thumbnail rail must be present');

  // 2. Counter display removed for minimalist presentation
  const counter = mainStage.querySelector('.omx-chat-media-tail__counter');
  assert.equal(counter, null, 'Counter must be removed');

  // 3. Thumbnails count and active state
  const thumbs = rail.querySelectorAll<HTMLElement>('.omx-chat-media-tail__thumb');
  assert.equal(thumbs.length, 3, 'Must render 3 thumbnails');
  assert.ok(thumbs[0].classList.contains('is-active'), 'First thumbnail must be initially active');

  // 4. Video thumbnail tag
  const videoThumb = thumbs[1];
  const durTag = videoThumb.querySelector('.omx-chat-media-tail__dur');
  assert.ok(durTag, 'Video thumbnail must carry duration tag');
  const thumbVideo = videoThumb.querySelector('video');
  assert.ok(thumbVideo, 'Video thumbnail must render video element');
  assert.match(thumbVideo?.getAttribute('src') || '', /demo\.mp4/);

  // 5. Click thumbnail to switch to item 1 (video)
  videoThumb.click();
  assert.ok(videoThumb.classList.contains('is-active'), 'Second thumb must become active');
  assert.equal(thumbs[0].classList.contains('is-active'), false);
  const mainVideo = mainStage.querySelector('video');
  assert.ok(mainVideo, 'Main stage must now render video element');
  assert.equal(mainVideo?.getAttribute('src'), 'http://example.com/demo.mp4');

  // 6. Keyboard navigation (ArrowRight)
  const keyEvent = new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
  gallery.dispatchEvent(keyEvent);
  assert.ok(thumbs[2].classList.contains('is-active'), 'Third thumb must become active on ArrowRight');
  const mainImg = mainStage.querySelector('img');
  assert.ok(mainImg, 'Main stage must now render third image');
  assert.equal(mainImg?.getAttribute('src'), 'http://example.com/face2.png');
});

test('assistantMessageMediaEnhancer: isBreakdownOrAnalysisTurn detects breakdown indicators accurately', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="t1">普通文本</div><div id="t2"><p>四、爆款短视频复刻与落地建议</p><p>各分镜关键帧截图及详细标签属性</p></div><div id="t3"><a href="/path/to/demo.vbreakdown">查看</a></div><div id="t4"><div class="vbreakdown-viewer">内容</div></div></body></html>');
  const doc = dom.window.document;

  assert.equal(isBreakdownOrAnalysisTurn(doc.getElementById('t1')), false);
  assert.equal(isBreakdownOrAnalysisTurn(doc.getElementById('t2')), true);
  assert.equal(isBreakdownOrAnalysisTurn(doc.getElementById('t3')), true);
  assert.equal(isBreakdownOrAnalysisTurn(doc.getElementById('t4')), true);
});

test('assistantMessageMediaEnhancer: exclusivity gate blocks auto-open on breakdown turns to protect breakdown workbench', () => {
  resetAutoOpenedForTests();
  let workbenchOpenedTabId: string | null = null;
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <div class="flowItem" data-chat-turn="breakdown-1" data-chat-flow-kind="tool">
          <video src="http://example.com/analyzed-video.mp4" title="TikTok样片"></video>
        </div>
        <div class="flowItem" data-chat-turn="breakdown-1" data-chat-flow-kind="assistant-step">
          <div class="bubble">
            <h3>四、爆款短视频复刻与落地建议</h3>
            <p>分镜关键帧已拆解完毕，保存为 video-analysis-123.vbreakdown</p>
          </div>
        </div>
      </body>
    </html>
  `);
  const doc = dom.window.document;
  const win = dom.window as any;
  win.__omnimuxWorkbench = {
    openWorkbench: ({ tabId }: { tabId: string }) => {
      workbenchOpenedTabId = tabId;
      return true;
    },
  };

  const turnNodes = Array.from(doc.querySelectorAll('[data-chat-turn="breakdown-1"]')) as HTMLElement[];
  const enhanced = enhanceTurnMedia('breakdown-1', turnNodes, doc);

  assert.equal(enhanced, true, 'Turn media should still be registered and tail mounted');
  assert.equal(workbenchOpenedTabId, null, 'Workbench auto-open must be suppressed by exclusivity gate to prioritize breakdown workbench');
  // Verify tail is created
  assert.ok(doc.querySelector('.omx-chat-media-tail'), 'Media tail element should still be present');
});

test('assistantMessageMediaEnhancer: clampRatio clamps aspect ratios and guards against invalid inputs', () => {
  // 1. Standard ratios
  assert.equal(clampRatio(1920, 1080), 1.7778, '16:9 landscape should clamp to 1.7778');
  assert.equal(clampRatio(1080, 1920), 0.5625, '9:16 portrait should clamp to 0.5625');
  assert.equal(clampRatio(1000, 1000), 1.0, '1:1 square should be 1.0');
  assert.equal(clampRatio(800, 600), 1.3333, '4:3 should be 1.3333');
  assert.equal(clampRatio(600, 800), 0.75, '3:4 should be 0.75');

  // 2. Extreme aspect ratios clamped to bounds
  assert.equal(clampRatio(100, 1000), DEFAULT_THUMB_MIN_RATIO, 'Extreme tall (0.1) should clamp to 0.5');
  assert.equal(clampRatio(50, 1000), DEFAULT_THUMB_MIN_RATIO, 'Extreme tall (0.05) should clamp to 0.5');
  assert.equal(clampRatio(3000, 300), DEFAULT_THUMB_MAX_RATIO, 'Extreme wide (10.0) should clamp to 2.0');
  assert.equal(clampRatio(10000, 1000), DEFAULT_THUMB_MAX_RATIO, 'Ultra wide panorama should clamp to 2.0');

  // 3. Custom configuration overrides
  assert.equal(clampRatio(100, 200, { minRatio: 0.8 }), 0.8, 'Custom minRatio 0.8 should clamp 0.5 to 0.8');
  assert.equal(clampRatio(200, 100, { maxRatio: 1.5 }), 1.5, 'Custom maxRatio 1.5 should clamp 2.0 to 1.5');
  assert.equal(clampRatio(null, 100, { fallbackRatio: 1.25 }), 1.25, 'Custom fallbackRatio should be used for invalid input');
  // 3.1 Reviewer boundary hardening: minRatio > maxRatio auto swap, and invalid config values
  assert.equal(clampRatio(100, 200, { minRatio: 1.8, maxRatio: 0.8 }), 0.8, 'Inverted min/max should be swapped and clamp properly');
  assert.equal(clampRatio(null, 100, { fallbackRatio: NaN }), DEFAULT_THUMB_FALLBACK_RATIO, 'NaN fallbackRatio should gracefully use default fallback');
  assert.equal(clampRatio(null, 100, { fallbackRatio: Infinity }), DEFAULT_THUMB_FALLBACK_RATIO, 'Infinity fallbackRatio should gracefully use default fallback');
  assert.equal(clampRatio(null, 100, { fallbackRatio: -1 }), DEFAULT_THUMB_FALLBACK_RATIO, 'Negative fallbackRatio should gracefully use default fallback');
  assert.equal(clampRatio(null, null, { fallbackRatio: 5.0, minRatio: 0.5, maxRatio: 2.0 }), 2.0, 'Out-of-range high fallbackRatio should be clamped to maxRatio');
  assert.equal(clampRatio(null, null, { fallbackRatio: 0.1, minRatio: 0.5, maxRatio: 2.0 }), 0.5, 'Out-of-range low fallbackRatio should be clamped to minRatio');

  // 4. Invalid, non-positive, NaN, Infinity inputs return fallback
  assert.equal(clampRatio(null, 100), DEFAULT_THUMB_FALLBACK_RATIO, 'null width should fallback to 1.0');
  assert.equal(clampRatio(100, null), DEFAULT_THUMB_FALLBACK_RATIO, 'null height should fallback to 1.0');
  assert.equal(clampRatio(undefined, 100), DEFAULT_THUMB_FALLBACK_RATIO, 'undefined width should fallback to 1.0');
  assert.equal(clampRatio(100, undefined), DEFAULT_THUMB_FALLBACK_RATIO, 'undefined height should fallback to 1.0');
  assert.equal(clampRatio(0, 100), DEFAULT_THUMB_FALLBACK_RATIO, '0 width should fallback to 1.0');
  assert.equal(clampRatio(100, 0), DEFAULT_THUMB_FALLBACK_RATIO, '0 height should fallback to 1.0');
  assert.equal(clampRatio(-100, 100), DEFAULT_THUMB_FALLBACK_RATIO, 'Negative width should fallback to 1.0');
  assert.equal(clampRatio(100, -100), DEFAULT_THUMB_FALLBACK_RATIO, 'Negative height should fallback to 1.0');
  assert.equal(clampRatio(NaN, 100), DEFAULT_THUMB_FALLBACK_RATIO, 'NaN width should fallback to 1.0');
  assert.equal(clampRatio(100, NaN), DEFAULT_THUMB_FALLBACK_RATIO, 'NaN height should fallback to 1.0');
  assert.equal(clampRatio(Infinity, 100), DEFAULT_THUMB_FALLBACK_RATIO, 'Infinity width should fallback to 1.0');
  assert.equal(clampRatio(100, Infinity), DEFAULT_THUMB_FALLBACK_RATIO, 'Infinity height should fallback to 1.0');
  assert.equal(clampRatio('100' as any, 100), DEFAULT_THUMB_FALLBACK_RATIO, 'String width should fallback to 1.0');
});

test('assistantMessageMediaEnhancer: thumbnails adapt aspect ratio dynamically on load and metadata events', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const doc = dom.window.document;

  const items = [
    { url: 'http://example.com/landscape.jpg', type: 'image' as const, title: '横版大片', filename: 'landscape.jpg' },
    { url: 'http://example.com/portrait.jpg', type: 'image' as const, title: '竖版短剧', filename: 'portrait.jpg' },
    { url: 'http://example.com/demo.mp4', type: 'video' as const, title: '高清视频', filename: 'demo.mp4' },
    { url: 'http://example.com/extreme-tall.mp4', type: 'video' as const, title: '极端超高', filename: 'extreme-tall.mp4' },
  ];

  const gallery = createMediaTailElement(items, doc);
  doc.body.appendChild(gallery);

  const thumbs = gallery.querySelectorAll<HTMLElement>('.omx-chat-media-tail__thumb');
  assert.equal(thumbs.length, 4, 'Should have 4 thumbnails');

  // JSDOM initial state: naturalWidth & naturalHeight default to 0, no inline aspectRatio set yet (falls back to CSS 1/1)
  assert.equal(thumbs[0].style.aspectRatio, '');

  // 1. Simulate image load with landscape natural dimensions (1920 x 1080)
  const imgLandscape = thumbs[0].querySelector('img')!;
  Object.defineProperty(imgLandscape, 'naturalWidth', { value: 1920, configurable: true });
  Object.defineProperty(imgLandscape, 'naturalHeight', { value: 1080, configurable: true });
  imgLandscape.dispatchEvent(new dom.window.Event('load'));
  assert.match(thumbs[0].style.aspectRatio, /^1\.7778(\s*\/\s*1)?$/, 'Landscape thumbnail should adapt to 1.7778');

  // 2. Simulate image load with portrait natural dimensions (1080 x 1920)
  const imgPortrait = thumbs[1].querySelector('img')!;
  Object.defineProperty(imgPortrait, 'naturalWidth', { value: 1080, configurable: true });
  Object.defineProperty(imgPortrait, 'naturalHeight', { value: 1920, configurable: true });
  imgPortrait.dispatchEvent(new dom.window.Event('load'));
  assert.match(thumbs[1].style.aspectRatio, /^0\.5625(\s*\/\s*1)?$/, 'Portrait thumbnail should adapt to 0.5625');

  // 3. Simulate video loadedmetadata with 16:9 dimensions (1280 x 720)
  const vid1 = thumbs[2].querySelector('video')!;
  Object.defineProperty(vid1, 'videoWidth', { value: 1280, configurable: true });
  Object.defineProperty(vid1, 'videoHeight', { value: 720, configurable: true });
  vid1.dispatchEvent(new dom.window.Event('loadedmetadata'));
  assert.match(thumbs[2].style.aspectRatio, /^1\.7778(\s*\/\s*1)?$/, 'Video thumbnail should adapt to 1.7778');

  // 4. Simulate video loadedmetadata with extreme tall dimensions (100 x 1000) clamped to minRatio (0.5)
  const vid2 = thumbs[3].querySelector('video')!;
  Object.defineProperty(vid2, 'videoWidth', { value: 100, configurable: true });
  Object.defineProperty(vid2, 'videoHeight', { value: 1000, configurable: true });
  vid2.dispatchEvent(new dom.window.Event('loadedmetadata'));
  assert.match(thumbs[3].style.aspectRatio, /^0\.5(\s*\/\s*1)?$/, 'Extreme tall video thumbnail should be clamped to 0.5');

  // 5. Test error event fallback on image and video (thumbnails and mainStage)
  imgLandscape.dispatchEvent(new dom.window.Event('error'));
  assert.match(thumbs[0].style.aspectRatio, /^1(\.0+)?(\s*\/\s*1)?$/, 'Broken image thumbnail should fallback to 1.0');

  vid1.dispatchEvent(new dom.window.Event('error'));
  assert.match(thumbs[2].style.aspectRatio, /^1(\.0+)?(\s*\/\s*1)?$/, 'Broken video thumbnail should fallback to 1.0');

  // Main stage active image error fallback
  const mainImg = gallery.querySelector('.omx-chat-media-tail__main-content img');
  if (mainImg) {
    mainImg.dispatchEvent(new dom.window.Event('error'));
    const mainStage = gallery.querySelector('.omx-chat-media-tail__main') as HTMLElement;
    assert.match(mainStage.style.aspectRatio, /^1(\.0+)?(\s*\/\s*1)?$/, 'Broken mainStage image should fallback to 1.0');
  }

  // Switch to video (thumbs[2]) and test main stage video error fallback
  thumbs[2].click();
  const mainVid = gallery.querySelector('.omx-chat-media-tail__main-content video');
  if (mainVid) {
    mainVid.dispatchEvent(new dom.window.Event('error'));
    const mainStage = gallery.querySelector('.omx-chat-media-tail__main') as HTMLElement;
    assert.match(mainStage.style.aspectRatio, /^1\.7778(\s*\/\s*1)?$|^16\s*\/\s*9$/, 'Broken mainStage video should fallback to 16 / 9');
  }
});

