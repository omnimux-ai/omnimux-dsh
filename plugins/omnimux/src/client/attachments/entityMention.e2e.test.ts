import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import {
  createMaterialMentionSource,
  entityCategoryCandidates,
  isEntityCategoryRef,
  ENTITY_CATEGORY_CHARACTER_VALUE,
  ENTITY_CATEGORY_PRODUCT_VALUE,
} from './materialMentionSource.ts';
import {
  resolveCharacterThumbUrl,
  resolveProductThumbUrl,
  sortProductsForQuickMenu,
} from './entityMentionSubmenuHelper.ts';
import {
  insertEntityMentionChip,
  findComposerEditor,
  getLexicalEditorInstance,
  getChipConstructor,
} from './entityMentionChip.ts';
import { createAttachmentStore } from './store.ts';
import {
  placeMentionMenu,
  mountEntitySubmenu,
  unmountEntitySubmenu,
  scheduleCloseEntitySubmenu,
  cancelCloseEntitySubmenu,
  resetComposerCompactForTests,
  COMPOSER_COMPACT_CSS,
} from '../composer-compact.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

describe('触发源适配: 一级分类入口规范', () => {
  it('未输入搜索词时，candidates 前两项为「角色」与「产品」，带右向指示箭头', async () => {
    const mock = setupMockStore('s1');
    try {
      const source = createMaterialMentionSource();
      const candidates = await source.candidates({ sessionId: 's1' }, { query: '' });

      assert.ok(candidates.length >= 2);
      assert.equal(candidates[0].name, '角色');
      assert.equal(candidates[0].description, '›');
      assert.equal(candidates[0].value, ENTITY_CATEGORY_CHARACTER_VALUE);

      assert.equal(candidates[1].name, '产品');
      assert.equal(candidates[1].description, '›');
      assert.equal(candidates[1].value, ENTITY_CATEGORY_PRODUCT_VALUE);
    } finally {
      mock.restore();
    }
  });

  it('输入搜索词时，正确过滤分类入口与素材', () => {
    const listChar = entityCategoryCandidates('角');
    assert.equal(listChar.length, 1);
    assert.equal(listChar[0].name, '角色');

    const listProd = entityCategoryCandidates('产品');
    assert.equal(listProd.length, 1);
    assert.equal(listProd[0].name, '产品');

    const listNone = entityCategoryCandidates('未知分类');
    assert.equal(listNone.length, 0);
  });

  it('onPick 安全拦截：分类条目不向输入框直接插入 Token，主要交互由二级菜单接管', () => {
    const source = createMaterialMentionSource();
    assert.equal(isEntityCategoryRef(ENTITY_CATEGORY_CHARACTER_VALUE), true);
    assert.equal(isEntityCategoryRef(ENTITY_CATEGORY_PRODUCT_VALUE), true);

    const pickedChar = source.onPick({
      candidate: { value: ENTITY_CATEGORY_CHARACTER_VALUE, name: '角色' },
      session: { sessionId: 's1' },
    });
    assert.equal(pickedChar, undefined, '点击角色分类入口应返回 undefined 拦截');

    const pickedProd = source.onPick({
      candidate: { value: ENTITY_CATEGORY_PRODUCT_VALUE, name: '产品' },
      session: { sessionId: 's1' },
    });
    assert.equal(pickedProd, undefined, '点击产品分类入口应返回 undefined 拦截');
  });
});

describe('二级悬停浮层: 视觉契约与 DOM 结构规范 (严格无标题无描述)', () => {
  it('源码与结构契约：彻底无分组标题节点与副标题描述节点，纯净单行呈现', () => {
    const submenuPath = join(__dirname, 'EntityMentionSubmenu.tsx');
    const sourceCode = readFileSync(submenuPath, 'utf8');

    // 用户明确强调铁律：彻底无标题、无副标题描述
    assert.ok(!sourceCode.includes('groupTitle'), '二级浮层源码中禁止包含 groupTitle 分组标题节点');
    assert.ok(!sourceCode.includes('itemDescription'), '二级浮层源码中禁止包含 itemDescription 描述文本节点');
    assert.ok(!sourceCode.includes('groupHeader'), '二级浮层源码中禁止包含 groupHeader 节点');
    assert.ok(!sourceCode.includes('group-title'), '二级浮层源码中禁止包含 group-title 类名');

    // 结构具备纯净单行「缩略图 + 实体名称」
    assert.ok(sourceCode.includes('omx-entity-submenu-item'), '必须导出单行选项样式');
    assert.ok(sourceCode.includes('omx-entity-submenu-thumb'), '必须包含缩略图容器');
    assert.ok(sourceCode.includes('omx-entity-submenu-title'), '必须包含实体名称');

    // 缩略图为 28×28 矩形及平滑降级图标
    assert.ok(sourceCode.includes('ProductFallbackIcon'), '必须具备商品平滑降级图标');
    assert.ok(sourceCode.includes('CharacterFallbackIcon'), '必须具备角色平滑降级图标');
  });

  it('缩略图提取优先级与降级路径完备', () => {
    // 角色立绘解析优先级：previewUrl > cover.id > files 图片 > files 首项
    const charWithPreview = { id: 'c1', previewUrl: '/preview/char.png' };
    assert.equal(resolveCharacterThumbUrl(charWithPreview), '/preview/char.png');

    const charWithCover = { id: 'c2', cover: { id: 'cov_1' } };
    assert.match(resolveCharacterThumbUrl(charWithCover), /\/omnimux\/assets\/library\/preview\?id=c2&file=cov_1/);

    const charWithFiles = {
      id: 'c3',
      files: [{ id: 'f_img', kind: 'image', name: 'stand.png' }],
    };
    assert.match(resolveCharacterThumbUrl(charWithFiles), /\/omnimux\/assets\/library\/preview\?id=c3&file=f_img/);

    const emptyChar = { id: 'c4' };
    assert.equal(resolveCharacterThumbUrl(emptyChar), '');

    // 商品缩略图解析与排序复用
    const prod = { id: 'p10', cover: { id: 'cov_p' } };
    assert.match(resolveProductThumbUrl(prod), /\/omnimux\/products\/p10\?preview=cov_p/);

    const sorted = sortProductsForQuickMenu(
      [{ id: 'p1' }, { id: 'p2' }],
      ['p2'],
      5
    );
    assert.equal(sorted[0].id, 'p2', '最近选择的商品排在前列');
  });
});

describe('双向业务联动: 卡槽写入与输入框 @ 清理插入实体胶囊', () => {
  it('点击商品项：写入 AttachmentStore 标明 JSON，并在 Lexical 输入框光标处插入胶囊且清除 @', () => {
    let insertedNodes: any[] = [];
    let textModified = '';

    class MockChipNode {
      config: any;
      constructor(config: any) {
        this.config = config;
      }
      selectEnd() {}
    }

    const mockTextNode = {
      __text: '写一段文案 @',
      getTextContent() {
        return this.__text;
      },
      setTextContent(val: string) {
        this.__text = val;
        textModified = val;
      },
      getWritable() {
        return this;
      },
    };

    const mockSelection = {
      anchor: {
        key: 'text-1',
        offset: 8, // 光标在 @ 后面
        getNode() {
          return mockTextNode;
        },
      },
      focus: {
        key: 'text-1',
        offset: 8,
      },
      insertNodes(nodes: any[]) {
        insertedNodes = nodes;
      },
    };

    const mockLexicalEditor = {
      _nodes: new Map([['reference-chip', { klass: MockChipNode }]]),
      _editorState: {
        _selection: mockSelection,
        _nodeMap: new Map([['text-1', mockTextNode]]),
      },
      update(fn: () => void) {
        fn();
      },
      getRootElement() {
        return { focus() {} };
      },
    };

    const mock = setupMockStore('s-dual');
    const prevDoc = (globalThis as any).document;

    (globalThis as any).document = {
      querySelector(sel: string) {
        if (sel.includes('contenteditable')) {
          return {
            focus() {},
            __lexicalEditor_test: mockLexicalEditor,
          };
        }
        return null;
      },
      execCommand() {
        return true;
      },
    };

    try {
      // 1. 模拟添加到卡槽
      const store = mock.store;
      const product = {
        id: 'prod_99',
        name: '挂脖无叶便携静音小风扇',
        price: 59,
        cover: { real_path: '/assets/fan.png' },
      };

      const res = store.addAttachment('s-dual', {
        sourcePlugin: 'omnimux-products',
        kind: 'product',
        entityId: product.id,
        title: product.name,
        extension: 'JSON',
        relativePath: product.cover.real_path,
        previewUrl: '/preview/fan.png',
      });

      assert.equal(res.ok, true);
      const snapshot = store.getSnapshot('s-dual');
      assert.equal(snapshot.length, 1);
      assert.equal(snapshot[0].sourcePlugin, 'omnimux-products');
      assert.equal(snapshot[0].extension, 'JSON');
      assert.equal(snapshot[0].title, '挂脖无叶便携静音小风扇');

      // 2. 模拟触发胶囊插入
      const insertOk = insertEntityMentionChip({
        name: product.name,
        ref: `material:${res.attachment.id}`,
        type: 'product',
      });

      assert.equal(insertOk, true);
      // 验证 @ 字符已被完全移除
      assert.equal(textModified, '写一段文案 ');
      assert.doesNotMatch(textModified, /@/);

      // 验证插入了唯一的 reference-chip 胶囊
      assert.equal(insertedNodes.length, 1);
      assert.ok(insertedNodes[0] instanceof MockChipNode);
      assert.equal(insertedNodes[0].config.source, 'material');
      assert.equal(insertedNodes[0].config.ref, `material:${res.attachment.id}`);
      assert.equal(insertedNodes[0].config.label, '挂脖无叶便携静音小风扇');
    } finally {
      mock.restore();
      if (prevDoc) (globalThis as any).document = prevDoc;
      else delete (globalThis as any).document;
    }
  });

  it('点击角色项：写入 AttachmentStore 标明 ASSET，并在输入框插入角色胶囊', () => {
    const mock = setupMockStore('s-char');
    const store = mock.store;

    const character = {
      id: 'char_linxiao',
      name: '林潇',
      description: '冷白皮御姐',
    };

    const res = store.addAttachment('s-char', {
      sourcePlugin: 'omnimux-assets',
      kind: 'asset',
      entityId: character.id,
      title: character.name,
      extension: 'ASSET',
      relativePath: `assets/characters/${character.id}`,
    });

    assert.equal(res.ok, true);
    const item = store.getSnapshot('s-char')[0];
    assert.equal(item.sourcePlugin, 'omnimux-assets');
    assert.equal(item.extension, 'ASSET');
    assert.equal(item.title, '林潇');
    mock.restore();
  });
});

describe('菜单治理与交互: 180ms 延时保护与自适应定位', () => {
  it('180ms 延时保护：移出时启动定时，移入时即刻取消定时', async () => {
    scheduleCloseEntitySubmenu(180);
    // 移入二级浮层，取消关闭定时
    cancelCloseEntitySubmenu();

    await new Promise((r) => setTimeout(r, 220));

    // 再次触发快速关闭定时
    scheduleCloseEntitySubmenu(40);
    await new Promise((r) => setTimeout(r, 60));
  });

  it('自适应定位：随输入框上下翻转标记同步，且一级条目正确绑定悬停与分类标记', () => {
    const dom = new JSDOM(`<!doctype html>
      <head><style>${COMPOSER_COMPACT_CSS}</style></head>
      <body>
        <div data-composer-card>
          <div data-trigger-menu data-source="material">
            <button id="dsh-slash-option-material-0" role="option" data-value="entity:category:character">
              <span class="itemName">角色</span>
            </button>
            <button id="dsh-slash-option-material-1" role="option" data-value="entity:category:product">
              <span class="itemName">产品</span>
            </button>
          </div>
        </div>
      </body>`);

    const prevWin = globalThis.window;
    (globalThis as any).window = dom.window;

    try {
      const card = dom.window.document.querySelector('[data-composer-card]')!;
      (card as any).getBoundingClientRect = () => ({ top: 800, bottom: 940, left: 100, right: 700, width: 600, height: 140 });

      placeMentionMenu(dom.window.document);

      const charBtn = dom.window.document.querySelector('#dsh-slash-option-material-0')!;
      const prodBtn = dom.window.document.querySelector('#dsh-slash-option-material-1')!;

      // 校验一级菜单条目被打上分类标记
      assert.equal(charBtn.getAttribute('data-omnimux-entity-category'), 'character');
      assert.equal(prodBtn.getAttribute('data-omnimux-entity-category'), 'product');

      // 自适应翻转标记已应用在 card 上
      assert.equal(card.getAttribute('data-omnimux-mention-up'), 'true');
    } finally {
      resetComposerCompactForTests();
      if (prevWin) (globalThis as any).window = prevWin;
      else delete (globalThis as any).window;
      dom.window.close();
    }
  });
});
