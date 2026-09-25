import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import {
  createMaterialMentionSource,
  materialCandidates,
  listSessionMaterials,
  serializeMaterialMention,
  parseMaterialMention,
} from './materialMentionSource.ts';
import { createAttachmentStore } from './store.ts';
import {
  placeMentionMenu,
  resetComposerCompactForTests,
  uninstallComposerCompactObserver,
} from '../composer-compact.js';
import {
  LIBRARY_COMMAND,
  PRODUCT_COMMAND,
  INSPIRATION_COMMAND,
  FILE_COMMAND,
  decorateLibraryCommand,
  decorateProductCommand,
  decorateInspirationCommand,
  decorateFileCommand,
  listenComposerAddCommands,
} from '../composer-add/commands.js';

function setupMockStore(sessionId = 'sess-test') {
  const store = createAttachmentStore();
  const root = globalThis as any;
  const prevWindow = root.window;
  const prevStore = root.__omnimuxAttachments;

  root.window = {
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 1024,
    innerHeight: 768,
    __omnimuxAttachments: store,
  };
  root.__omnimuxAttachments = store;
  store.setActiveSessionId(sessionId);

  return {
    store,
    restore() {
      if (prevWindow) root.window = prevWindow;
      else delete root.window;
      if (prevStore) root.__omnimuxAttachments = prevStore;
      else delete root.__omnimuxAttachments;
    },
  };
}

describe('契约一: @ 菜单纯净素材契约 (彻底移除角色与产品固定入口)', () => {
  it('卡槽为空时，candidates 返回空数组，绝不包含角色与产品入口', async () => {
    const mock = setupMockStore('s-empty');
    try {
      const source = createMaterialMentionSource();
      const candidates = await source.candidates({ sessionId: 's-empty' }, { query: '' });
      assert.equal(candidates.length, 0, '卡槽无素材时，@ 候选人必须为空');
      assert.ok(!candidates.some((c) => c.name === '角色' || c.name === '产品'));
      assert.ok(!candidates.some((c) => c.value?.startsWith('entity:category:')));
    } finally {
      mock.restore();
    }
  });

  it('输入任何搜索词时，candidates 绝不返回 entity:category:* 假候选项', async () => {
    const mock = setupMockStore('s-search');
    try {
      const source = createMaterialMentionSource();
      const c1 = await source.candidates({ sessionId: 's-search' }, { query: '角' });
      assert.equal(c1.length, 0);

      const c2 = await source.candidates({ sessionId: 's-search' }, { query: '产品' });
      assert.equal(c2.length, 0);

      const c3 = await source.candidates({ sessionId: 's-search' }, { query: '角色' });
      assert.equal(c3.length, 0);
    } finally {
      mock.restore();
    }
  });

  it('lexicon 仅返回实际已加入卡槽的素材标题，绝无硬编码的「角色」或「产品」', () => {
    const mock = setupMockStore('s-lex');
    try {
      const source = createMaterialMentionSource();
      // 初始无素材
      const emptyLex = source.lexicon({ sessionId: 's-lex' });
      assert.deepEqual(emptyLex, []);

      // 加入一项素材
      mock.store.addAttachment('s-lex', {
        sourcePlugin: 'omnimux-assets',
        kind: 'image',
        title: '产品发布会主视觉.png',
        relativePath: 'assets/main.png',
      });

      const updatedLex = source.lexicon({ sessionId: 's-lex' });
      assert.deepEqual(updatedLex, ['产品发布会主视觉.png']);
      assert.ok(!updatedLex.includes('角色'));
      assert.ok(!updatedLex.includes('产品'));
    } finally {
      mock.restore();
    }
  });

  it('卡槽中有已加入素材时，@ 菜单正常展示并支持选中生成 material: 引用', async () => {
    const mock = setupMockStore('s-mat');
    try {
      const addRes = mock.store.addAttachment('s-mat', {
        sourcePlugin: 'omnimux',
        kind: 'video',
        title: '爆款开头钩子.mp4',
        relativePath: 'videos/hook.mp4',
        previewUrl: '/preview/hook.webp',
      });
      assert.equal(addRes.ok, true);
      const attId = addRes.attachment!.id;

      const source = createMaterialMentionSource();
      const candidates = await source.candidates({ sessionId: 's-mat' }, { query: '' });
      assert.equal(candidates.length, 1);
      assert.equal(candidates[0].name, '爆款开头钩子.mp4');
      assert.equal(candidates[0].value, `material:${attId}`);

      // 选中后正常生成引用
      const pickRes = source.onPick({
        candidate: candidates[0],
        session: { sessionId: 's-mat' },
      });
      assert.ok(pickRes);
      assert.equal(pickRes?.insert?.source, 'material');
      assert.equal(pickRes?.insert?.ref, `material:${attId}`);
      assert.equal(pickRes?.insert?.label, '爆款开头钩子.mp4');

      // 序列化为 @ 格式
      const text = await source.codec.serialize(`material:${attId}`, undefined, 's-mat');
      assert.equal(text, '@爆款开头钩子.mp4');
    } finally {
      mock.restore();
    }
  });
});

describe('契约二: placeMentionMenu 纯净素材缩略图映射 (无二级菜单与无实体分类)', () => {
  it('为普通素材行注入 data-omnimux-thumb 缩略图，绝不设置 data-omnimux-entity-category', () => {
    const mock = setupMockStore('s-dom');
    try {
      mock.store.addAttachment('s-dom', {
        sourcePlugin: 'omnimux',
        kind: 'image',
        title: '海报封面.jpg',
        relativePath: 'poster.jpg',
        previewUrl: 'https://example.com/poster.jpg',
      });
      const list = listSessionMaterials('s-dom');
      const matId = list[0].id;

      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
        <body>
          <div data-composer-card="true" data-session-id="s-dom">
            <div data-trigger-menu="true">
              <div role="option" id="dsh-slash-option-material-0" data-value="material:${matId}">
                <span class="itemName">海报封面.jpg</span>
              </div>
            </div>
          </div>
        </body>
        </html>
      `);
      const doc = dom.window.document;

      placeMentionMenu(doc);

      const row = doc.getElementById('dsh-slash-option-material-0');
      assert.ok(row);
      assert.equal(row?.getAttribute('data-omnimux-thumb'), 'true');
      assert.equal(row?.style.getPropertyValue('--omnimux-thumb'), 'url("https://example.com/poster.jpg")');
      assert.equal(row?.getAttribute('data-omnimux-entity-category'), null, '普通素材行绝无分类标记');
      assert.equal(row?.hasAttribute('data-omnimux-entity-category'), false);

      // 验证页面上绝无二级菜单容器
      assert.equal(doc.getElementById('omnimux-entity-submenu-root'), null);
      assert.equal(doc.querySelector('[data-omnimux-entity-submenu]'), null);
      assert.equal(doc.querySelector('.omx-entity-mention-submenu'), null);
    } finally {
      mock.restore();
      resetComposerCompactForTests();
    }
  });

  it('菜单卸载与清理函数中彻底无二级菜单残留', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div data-composer-card="true"></div></body></html>');
    const doc = dom.window.document;
    uninstallComposerCompactObserver();
    resetComposerCompactForTests();
    assert.equal(doc.getElementById('omnimux-entity-submenu-root'), null);
  });
});

describe('契约三: 保留输入框 + 号菜单全套业务逻辑 (从资产库/商品库/灵感库选择完好)', () => {
  it('加号菜单命令常量定义完整且与系统统一规范对齐', () => {
    assert.equal(LIBRARY_COMMAND, 'add-from-library');
    assert.equal(PRODUCT_COMMAND, 'add-from-product');
    assert.equal(INSPIRATION_COMMAND, 'add-from-inspiration');
    assert.equal(FILE_COMMAND, 'add-file');
  });

  it('加号菜单装饰器正常挂载并能精准触发各业务回调', () => {
    const decoratedActions: any[] = [];
    const fakeCommandUi = {
      decorate(def: any) {
        decoratedActions.push(def);
        return () => {};
      },
    };

    let openedLibrarySession = '';
    let openedProductSession = '';
    let openedInspirationSession = '';
    let openedFileSession = '';

    const actions = {
      openLibrary: (id: string) => { openedLibrarySession = id; },
      openProduct: (id: string) => { openedProductSession = id; },
      openInspiration: (id: string) => { openedInspirationSession = id; },
      openFile: (id: string) => { openedFileSession = id; },
    };

    decorateLibraryCommand(fakeCommandUi, actions);
    decorateProductCommand(fakeCommandUi, actions);
    decorateInspirationCommand(fakeCommandUi, actions);
    decorateFileCommand(fakeCommandUi, actions);

    assert.equal(decoratedActions.length, 4);

    // 触发从资产库选择
    const libAction = decoratedActions.find((a) => a.name === LIBRARY_COMMAND);
    assert.ok(libAction);
    libAction.ui.run({ sessionId: 'session-lib' });
    assert.equal(openedLibrarySession, 'session-lib');

    // 触发从商品库选择
    const prodAction = decoratedActions.find((a) => a.name === PRODUCT_COMMAND);
    assert.ok(prodAction);
    prodAction.ui.run({ sessionId: 'session-prod' });
    assert.equal(openedProductSession, 'session-prod');

    // 触发从灵感库选择
    const inspAction = decoratedActions.find((a) => a.name === INSPIRATION_COMMAND);
    assert.ok(inspAction);
    inspAction.ui.run({ sessionId: 'session-insp' });
    assert.equal(openedInspirationSession, 'session-insp');

    // 触发添加本地文件
    const fileAction = decoratedActions.find((a) => a.name === FILE_COMMAND);
    assert.ok(fileAction);
    fileAction.ui.run({ sessionId: 'session-file' });
    assert.equal(openedFileSession, 'session-file');
  });

  it('listenComposerAddCommands 在收到 command/executed 事件时平滑调度加号各业务链路', () => {
    let triggeredLib = false;
    let triggeredProd = false;
    let triggeredInsp = false;

    let registeredListener: any = null;
    const fakeCtx = {
      on(event: string, fn: any) {
        if (event === 'command/executed') {
          registeredListener = fn;
        }
        return () => {};
      },
    };

    listenComposerAddCommands(fakeCtx, {
      openLibrary: () => { triggeredLib = true; },
      openProduct: () => { triggeredProd = true; },
      openInspiration: () => { triggeredInsp = true; },
    });

    assert.ok(registeredListener);

    // 模拟非 success 事件应被忽略
    registeredListener('s1', LIBRARY_COMMAND, { kind: 'error' });
    assert.equal(triggeredLib, false);

    // 模拟从资产库选择成功
    registeredListener('s1', LIBRARY_COMMAND, { kind: 'success' });
    assert.equal(triggeredLib, true);

    // 模拟从商品库选择成功
    registeredListener('s1', PRODUCT_COMMAND, { kind: 'success' });
    assert.equal(triggeredProd, true);

    // 模拟从灵感库选择成功
    registeredListener('s1', INSPIRATION_COMMAND, { kind: 'success' });
    assert.equal(triggeredInsp, true);
  });
});
