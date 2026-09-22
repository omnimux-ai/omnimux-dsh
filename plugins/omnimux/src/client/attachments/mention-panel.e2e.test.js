import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { COMPOSER_COMPACT_CSS, placeMentionMenu } from '../composer-compact.js';
import { createMaterialMentionSource, serializeMaterialMention } from './materialMentionSource.ts';

test('e2e: 引用菜单根据输入框位置自适应上下翻转', () => {
  const dom = new JSDOM(`<!doctype html>
    <head>
      <style>${COMPOSER_COMPACT_CSS}</style>
    </head>
    <body>
      <div data-phase="hero">
        <div data-composer-card>
          <div data-trigger-menu>
            <button id="dsh-slash-option-material-0" role="option">
              <span class="iRJKyq_itemName">海浪视频</span>
            </button>
          </div>
        </div>
      </div>
    </body>`);

  const card = dom.window.document.querySelector('[data-composer-card]');
  const menu = dom.window.document.querySelector('[data-trigger-menu]');

  const previousWindow = globalThis.window;
  globalThis.window = dom.window;

  // 1. 输入框在顶部（Hero 区域），菜单自适应向下展开
  card.getBoundingClientRect = () => ({ top: 120, bottom: 260, left: 100, right: 700, width: 600, height: 140, x: 100, y: 120 });
  dom.window.__omnimuxAttachments = {
    getActiveSessionId: () => 's-test',
    getSnapshot: () => [{ id: 'm1', title: '海浪视频', kind: 'video', previewUrl: '/covers/wave.jpg' }],
    subscribeRoster: () => () => {},
  };

  try {
    placeMentionMenu(dom.window.document);

    const styleTop = dom.window.getComputedStyle(menu);
    assert.equal(styleTop.top, 'calc(100% + 4px)');
    assert.equal(styleTop.bottom, 'auto');

    // 2. 检查素材行前置缩略图标记
    const opt = dom.window.document.querySelector('#dsh-slash-option-material-0');
    assert.equal(opt.getAttribute('data-omnimux-thumb'), 'true');
    assert.match(opt.style.getPropertyValue('--omnimux-thumb'), /\/covers\/wave\.jpg/);

    // 3. 输入框吸底时，菜单自适应向上翻转
    card.getBoundingClientRect = () => ({ top: 780, bottom: 920, left: 100, right: 700, width: 600, height: 140, x: 100, y: 780 });
    placeMentionMenu(dom.window.document);
    const styleBottom = dom.window.getComputedStyle(menu);
    assert.equal(styleBottom.bottom, 'calc(100% + 4px)');
    assert.equal(styleBottom.top, 'auto');
  } finally {
    if (previousWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
    dom.window.close();
  }
});

test('e2e: 素材引用提交只保留引用 Token，不泄漏代码块到消息正文', () => {
  const root = globalThis;
  const previousWindow = root.window;
  const previousStore = root.__omnimuxAttachments;

  const mockStore = {
    getActiveSessionId: () => 'sess-e2e',
    getSnapshot: () => [{ id: 'm-e2e', title: '测试素材封面', kind: 'image', previewUrl: 'cover.png' }],
    subscribeRoster: () => () => {},
  };
  root.window = { __omnimuxAttachments: mockStore };

  try {
    const src = createMaterialMentionSource();
    const candidate = { value: 'material:m-e2e', name: '测试素材封面' };
    const pick = src.onPick({ candidate, session: { sessionId: 'sess-e2e' } });

    assert.equal(pick.insert.clipboardText, '测试素材封面');
    const serialized = serializeMaterialMention('sess-e2e', pick.insert.ref);
    assert.equal(serialized, '@测试素材封面');
    assert.doesNotMatch(serialized, /-\s*\[/);
    assert.doesNotMatch(serialized, /`FILE`/);

    // 验证带空格的素材名称正确转义为 @"名称"
    mockStore.getSnapshot = () => [
      { id: 'm-space', title: '爆款镜头 01.mp4', kind: 'video', previewUrl: 'shot.mp4' },
    ];
    const candidateSpace = { value: 'material:m-space', name: '爆款镜头 01.mp4' };
    const pickSpace = src.onPick({ candidate: candidateSpace, session: { sessionId: 'sess-e2e' } });
    const serializedSpace = serializeMaterialMention('sess-e2e', pickSpace.insert.ref);
    assert.equal(serializedSpace, '@"爆款镜头 01.mp4"');
  } finally {
    if (previousWindow) root.window = previousWindow;
    else delete root.window;
    if (previousStore) root.__omnimuxAttachments = previousStore;
    else delete root.__omnimuxAttachments;
  }
});

test('e2e: 搜索过滤时候选索引与全量列表错位修复，并且普通菜单不受影响', () => {
  const dom = new JSDOM(`<!doctype html>
    <head>
      <style>${COMPOSER_COMPACT_CSS}</style>
    </head>
    <body>
      <div data-composer-card>
        <!-- 1. 普通斜杠菜单，绝不应受 mention 翻转样式影响 -->
        <div id="slash-menu" data-trigger-menu>
          <button id="dsh-slash-option-cmd-0" role="option">
            <span class="itemName">/help 帮助</span>
          </button>
        </div>

        <!-- 2. @ 引用菜单，模拟经用户输入 "@镜头" 筛选后的结果 -->
        <div id="mention-menu" data-trigger-menu data-source="material">
          <!-- 筛选后只有一项，id 为 dsh-slash-option-material-0，但对应全量列表的第二项 (idx 1) -->
          <button id="dsh-slash-option-material-0" role="option" data-material-id="m-shot">
            <span class="iRJKyq_itemName">特写镜头</span>
          </button>
        </div>
      </div>
    </body>`);

  const card = dom.window.document.querySelector('[data-composer-card]');
  const slashMenu = dom.window.document.querySelector('#slash-menu');
  const mentionMenu = dom.window.document.querySelector('#mention-menu');
  const mentionOpt = dom.window.document.querySelector('#dsh-slash-option-material-0');
  const slashOpt = dom.window.document.querySelector('#dsh-slash-option-cmd-0');

  const previousWindow = globalThis.window;
  globalThis.window = dom.window;

  // 全量列表：0 是全景，1 是特写
  dom.window.__omnimuxAttachments = {
    getActiveSessionId: () => 'sess-filter-e2e',
    getSnapshot: () => [
      { id: 'm-wide', title: '全景镜头', kind: 'video', previewUrl: '/covers/wide.jpg' },
      { id: 'm-shot', title: '特写镜头', kind: 'video', previewUrl: '/covers/shot.jpg' },
    ],
    subscribeRoster: () => () => {},
  };

  card.getBoundingClientRect = () => ({ top: 600, bottom: 740, left: 100, right: 700, width: 600, height: 140, x: 100, y: 600 });

  try {
    placeMentionMenu(dom.window.document);

    // 斜杠菜单不受影响
    assert.equal(slashMenu.hasAttribute('data-omnimux-mention-menu'), false);
    assert.equal(slashOpt.hasAttribute('data-omnimux-thumb'), false);

    // 引用菜单被打上专有标记
    assert.equal(mentionMenu.getAttribute('data-omnimux-mention-menu'), 'true');
    // 缩略图必须精确绑定到特写镜头 (/covers/shot.jpg)，绝不错配为全景镜头的 /covers/wide.jpg
    assert.equal(mentionOpt.getAttribute('data-omnimux-thumb'), 'true');
    assert.match(mentionOpt.style.getPropertyValue('--omnimux-thumb'), /\/covers\/shot\.jpg/);
    assert.doesNotMatch(mentionOpt.style.getPropertyValue('--omnimux-thumb'), /wide\.jpg/);
  } finally {
    if (previousWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
    dom.window.close();
  }
});

test('e2e: 菜单容器复用时能正常清理专有标记，杜绝自引用与弱文本标题假阳性污染', () => {
  const dom = new JSDOM(`<!doctype html>
    <head>
      <style>${COMPOSER_COMPACT_CSS}</style>
    </head>
    <body>
      <div data-composer-card>
        <!-- 初始为素材菜单 -->
        <div id="reused-menu" data-trigger-menu>
          <button id="dsh-slash-option-material-0" role="option" data-material-id="m-1">
            <span class="itemName">素材A</span>
          </button>
        </div>
      </div>
    </body>`);

  const card = dom.window.document.querySelector('[data-composer-card]');
  const menu = dom.window.document.querySelector('#reused-menu');

  const previousWindow = globalThis.window;
  globalThis.window = dom.window;

  dom.window.__omnimuxAttachments = {
    getActiveSessionId: () => 'sess-reuse',
    getSnapshot: () => [
      { id: 'm-1', title: '素材A', kind: 'image', previewUrl: '/covers/a.png' },
      { id: 'm-2', title: '/help', kind: 'document', previewUrl: '/covers/help.png' },
    ],
    subscribeRoster: () => () => {},
  };

  card.getBoundingClientRect = () => ({ top: 700, bottom: 840, left: 100, right: 700, width: 600, height: 140, x: 100, y: 700 });

  try {
    // 第一次调用：是素材菜单，打上标记
    placeMentionMenu(dom.window.document);
    assert.equal(menu.getAttribute('data-omnimux-mention-menu'), 'true');

    // 模拟容器被宿主复用为非素材斜杠菜单（例如 /help），此时虽然素材库里恰好有名为 "/help" 的素材，
    // 但由于移除了弱文本标题匹配且不再有自引用，该容器必须被清理掉 data-omnimux-mention-menu
    menu.innerHTML = `
      <button id="dsh-slash-option-cmd-0" role="option">
        <span class="itemName">/help</span>
      </button>
    `;

    placeMentionMenu(dom.window.document);
    assert.equal(menu.hasAttribute('data-omnimux-mention-menu'), false, '复用为非素材菜单后，data-omnimux-mention-menu 必须被移除');

    // 再次验证同名素材缩略图歧义保护
    dom.window.__omnimuxAttachments.getSnapshot = () => [
      { id: 'm-ambig-1', title: '封面', kind: 'image', extension: 'png', previewUrl: '/covers/thumb-1.png' },
      { id: 'm-ambig-2', title: '封面', kind: 'image', extension: 'jpg', previewUrl: '/covers/thumb-2.jpg' },
    ];
    menu.innerHTML = `
      <button id="dsh-slash-option-material-0" role="option" data-source="material">
        <span class="itemName">封面</span>
      </button>
    `;
    placeMentionMenu(dom.window.document);
    const ambigOpt = menu.querySelector('#dsh-slash-option-material-0');
    // 存在两项名为“封面”的素材且无任何扩展名区分，不应随意挑选第一项错配
    assert.equal(ambigOpt.hasAttribute('data-omnimux-thumb'), false, '同名素材歧义时应降级，不随意挑选第一项');

    // 若带有扩展名区分
    menu.innerHTML = `
      <button id="dsh-slash-option-material-0" role="option" data-source="material">
        <span class="itemName">封面</span>
        <span class="ext">jpg</span>
      </button>
    `;
    placeMentionMenu(dom.window.document);
    const resolvedOpt = menu.querySelector('#dsh-slash-option-material-0');
    assert.equal(resolvedOpt.getAttribute('data-omnimux-thumb'), 'true');
    assert.match(resolvedOpt.style.getPropertyValue('--omnimux-thumb'), /thumb-2\.jpg/);
  } finally {
    if (previousWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
    dom.window.close();
  }
});
