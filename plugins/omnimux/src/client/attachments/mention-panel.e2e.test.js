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
    assert.equal(opt.getAttribute('data-omx-thumb'), 'true');
    assert.match(opt.style.getPropertyValue('--omx-thumb'), /\/covers\/wave\.jpg/);

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
  } finally {
    if (previousWindow) root.window = previousWindow;
    else delete root.window;
    if (previousStore) root.__omnimuxAttachments = previousStore;
    else delete root.__omnimuxAttachments;
  }
});
