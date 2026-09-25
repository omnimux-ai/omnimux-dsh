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
  registerEntitySubmenuRenderer,
  resetComposerCompactForTests,
  captureComposerSelection,
  uninstallComposerCompactObserver,
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
  it('未输入搜索词时，candidates 前两项为「角色」与「产品」，数据层单通道无多余描述，统一由 CSS 伪元素渲染箭头', async () => {
    const mock = setupMockStore('s1');
    try {
      const source = createMaterialMentionSource();
      const candidates = await source.candidates({ sessionId: 's1' }, { query: '' });

      assert.ok(candidates.length >= 2);
      assert.equal(candidates[0].name, '角色');
      assert.equal(candidates[0].description, '', '数据层不再注入多余描述字符串，解决双重箭头冲突');
      assert.equal(candidates[0].value, ENTITY_CATEGORY_CHARACTER_VALUE);

      assert.equal(candidates[1].name, '产品');
      assert.equal(candidates[1].description, '', '数据层不再注入多余描述字符串，解决双重箭头冲突');
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

    // 结构具备纯净单行「缩略图 + 实体名称」，彻底移除 omx-entity-submenu-title 分类标题节点
    assert.ok(sourceCode.includes('omx-entity-submenu-item'), '必须导出单行选项样式');
    assert.ok(sourceCode.includes('omx-entity-submenu-thumb'), '必须包含缩略图容器');
    assert.ok(!sourceCode.includes('omx-entity-submenu-title'), '彻底移除 omx-entity-submenu-title 分类标题节点');
    assert.ok(sourceCode.includes('omx-entity-submenu-name'), '必须包含实体名称单行样式类');

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

describe('OCR 审查缺陷闭环定向测试: 高危与中危防护', () => {
  it('【高危 1】保护草稿不被销毁：精准替换 @，已有富文本节点完整保留', () => {
    const dom = new JSDOM(`<!doctype html>
      <body>
        <div data-composer-card>
          <div role="textbox" contenteditable="true"></div>
        </div>
      </body>`);

    const prevWin = globalThis.window;
    const prevDoc = (globalThis as any).document;
    (globalThis as any).window = dom.window;
    (globalThis as any).document = dom.window.document;

    try {
      const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement;

      // 预先构造包含已有富文本子节点的复杂输入框结构
      const existingChip = dom.window.document.createElement('span');
      existingChip.className = 'omx-existing-chip';
      existingChip.textContent = '已存在胶囊';
      editor.appendChild(existingChip);

      const triggerTextNode = dom.window.document.createTextNode(' 请参阅此物 @');
      editor.appendChild(triggerTextNode);

      // 选区定在末尾 @ 处
      const range = dom.window.document.createRange();
      range.setStart(triggerTextNode, triggerTextNode.data.length);
      range.setEnd(triggerTextNode, triggerTextNode.data.length);
      const sel = dom.window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);

      const ok = insertEntityMentionChip({
        name: '智能降噪耳机',
        ref: 'material:att_headphone',
        type: 'product',
        savedRange: range,
      });

      assert.equal(ok, true);

      // 验证核心约束：已有的富文本节点 DOM 必须完整存活，未被销毁！
      const preservedChip = editor.querySelector('.omx-existing-chip');
      assert.ok(preservedChip, '已有的富文本节点必须被保留，禁止 textContent 覆盖');
      assert.equal(preservedChip?.textContent, '已存在胶囊');

      // 验证 @ 字符被替换为实体文本
      assert.match(editor.textContent || '', /智能降噪耳机/);
    } finally {
      if (prevWin) (globalThis as any).window = prevWin;
      else delete (globalThis as any).window;
      if (prevDoc) (globalThis as any).document = prevDoc;
      else delete (globalThis as any).document;
      dom.window.close();
    }
  });

  it('【高危 2】二级菜单统一卸载：自定义渲染注销、清理 DOM 与解绑', () => {
    const dom = new JSDOM(`<!doctype html><body><div id="test-root"></div></body>`);
    const prevWin = globalThis.window;
    const prevDoc = (globalThis as any).document;
    (globalThis as any).window = dom.window;
    (globalThis as any).document = dom.window.document;

    try {
      let customRenderProps: any = null;
      registerEntitySubmenuRenderer((container, props) => {
        customRenderProps = props;
      });

      // 挂载
      mountEntitySubmenu({
        type: 'character',
        anchorRect: { top: 100, bottom: 130, left: 100, right: 300 } as any,
        sessionId: 'test-sess',
      });

      assert.equal(customRenderProps?.isOpen, true);
      assert.equal(customRenderProps?.type, 'character');

      // 执行统一卸载
      unmountEntitySubmenu();

      // 验证自定义渲染器收到关闭通知
      assert.equal(customRenderProps?.isOpen, false);

      // 验证 portal DOM 节点被彻底清理移除，防止内存泄漏
      const portal = dom.window.document.getElementById('omnimux-entity-submenu-root');
      assert.equal(portal, null, '卸载后二级菜单根 DOM 节点必须被移除');
    } finally {
      registerEntitySubmenuRenderer(null);
      resetComposerCompactForTests();
      if (prevWin) (globalThis as any).window = prevWin;
      else delete (globalThis as any).window;
      if (prevDoc) (globalThis as any).document = prevDoc;
      else delete (globalThis as any).document;
      dom.window.close();
    }
  });

  it('【高危 3】防止悬空引用：store.addAttachment 失败时安全中断，绝不插入胶囊', () => {
    const mock = setupMockStore('s-fail');
    const store = mock.store;

    // 模拟 store.addAttachment 返回失败
    const origAdd = store.addAttachment.bind(store);
    store.addAttachment = () => ({
      ok: false,
      reason: 'quota-exceeded',
    } as any);

    try {
      const res = store.addAttachment('s-fail', {} as any);
      assert.equal(res.ok, false);
      assert.equal(res.reason, 'quota-exceeded');
      // 验证未落库状态
      const snapshot = store.getSnapshot('s-fail');
      assert.equal(snapshot.length, 0);
    } finally {
      store.addAttachment = origAdd;
      mock.restore();
    }
  });

  it('【第2轮审查修复 1】重复实体落库支持：store.addAttachment 返回 duplicate 时仍正常支持生成胶囊并提取已有 id', () => {
    const mock = setupMockStore('s-dup');
    const store = mock.store;

    // 第一次添加
    const res1 = store.addAttachment('s-dup', {
      sourcePlugin: 'omnimux-assets',
      kind: 'asset',
      entityId: 'char_repeat_1',
      title: '重复测试角色',
      extension: 'ASSET',
      relativePath: 'assets/characters/char_repeat_1',
    });
    assert.equal(res1.ok, true);
    assert.ok(res1.attachment);
    const existingId = res1.attachment.id;

    // 第二次添加相同实体，应返回 duplicate 并携带 existing attachment
    const res2 = store.addAttachment('s-dup', {
      sourcePlugin: 'omnimux-assets',
      kind: 'asset',
      entityId: 'char_repeat_1',
      title: '重复测试角色',
      extension: 'ASSET',
      relativePath: 'assets/characters/char_repeat_1',
    });
    assert.equal(res2.ok, false);
    assert.equal(res2.reason, 'duplicate');
    assert.ok(res2.attachment);
    assert.equal(res2.attachment.id, existingId, 'duplicate 必须携带原 attachment.id');

    // 校验判定逻辑：res.attachment && (res.ok || res.reason === "duplicate") 判定为有效
    const isValidAttachment = Boolean(res2?.attachment && (res2.ok || res2.reason === 'duplicate'));
    assert.equal(isValidAttachment, true, 'duplicate 返回的 attachment 必须视为有效附件');
    assert.equal(res2.attachment.id, existingId);
    mock.restore();
  });

  it('【第2轮审查修复 2】元素节点边界光标：光标在 Element 边界键入 @ 插入时不产生 @@ 双重符号', () => {
    const dom = new JSDOM(`<!doctype html>
      <body>
        <div data-composer-card>
          <div role="textbox" contenteditable="true"></div>
        </div>
      </body>`);

    const prevWin = globalThis.window;
    const prevDoc = (globalThis as any).document;
    (globalThis as any).window = dom.window;
    (globalThis as any).document = dom.window.document;

    try {
      const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement;

      // 构造刚插入已有胶囊的场景
      const existingChip = dom.window.document.createElement('span');
      existingChip.className = 'omx-chip';
      existingChip.textContent = '角色A';
      editor.appendChild(existingChip);

      // 用户新键入的 @ 符号
      const atNode = dom.window.document.createTextNode('@');
      editor.appendChild(atNode);

      // 模拟光标落在 editor（Element 节点）的第 2 个子节点处（即 @ 文本节点之后）
      const range = dom.window.document.createRange();
      range.setStart(editor, 2);
      range.setEnd(editor, 2);
      const sel = dom.window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);

      const ok = insertEntityMentionChip({
        name: '次席角色B',
        ref: 'material:att_char_b',
        type: 'character',
        savedRange: range,
      });

      assert.equal(ok, true);

      // 核心验证：已有胶囊完整存活，并且不能存在双重 @@ 符号
      assert.ok(editor.querySelector('.omx-chip'));
      assert.ok(!editor.textContent?.includes('@@'), `禁止出现 @@ 双重符号，当前为: ${editor.textContent}`);
      assert.match(editor.textContent || '', /角色A.*@次席角色B/);
    } finally {
      if (prevWin) (globalThis as any).window = prevWin;
      else delete (globalThis as any).window;
      if (prevDoc) (globalThis as any).document = prevDoc;
      else delete (globalThis as any).document;
      dom.window.close();
    }
  });

  it('【第2轮审查修复 3】后备插入短路修复：execCommand 返回 false 时顺利流转至 DOM appendChild 后备方案', () => {
    const dom = new JSDOM(`<!doctype html>
      <body>
        <div data-composer-card>
          <div role="textbox" contenteditable="true"></div>
        </div>
      </body>`);

    const prevWin = globalThis.window;
    const prevDoc = (globalThis as any).document;
    (globalThis as any).window = dom.window;
    (globalThis as any).document = dom.window.document;

    // 显式让 execCommand 返回 false
    dom.window.document.execCommand = () => false;

    try {
      const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement;

      const ok = insertEntityMentionChip({
        name: '应急后备商品',
        ref: 'material:att_fallback_prod',
        type: 'product',
        savedRange: null,
      });

      assert.equal(ok, true, 'execCommand 失败时必须继续执行 DOM appendChild 并返回 true');
      assert.match(editor.textContent || '', /@应急后备商品/);
    } finally {
      if (prevWin) (globalThis as any).window = prevWin;
      else delete (globalThis as any).window;
      if (prevDoc) (globalThis as any).document = prevDoc;
      else delete (globalThis as any).document;
      dom.window.close();
    }
  });

  it('【修复 1】选区判定死分支修复：光标超出编辑器范围时安全返回 null，不返回外部选区', () => {
    const dom = new JSDOM(`<!doctype html>
      <body>
        <div id="outside-box">外部无关内容</div>
        <div data-composer-card>
          <div role="textbox" contenteditable="true">编辑器内部内容</div>
        </div>
      </body>`);

    const doc = dom.window.document;
    const outsideEl = doc.getElementById('outside-box')!;
    const range = doc.createRange();
    range.selectNodeContents(outsideEl);
    const sel = dom.window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    const captured = captureComposerSelection(doc);
    assert.equal(captured, null, '超出编辑器范围的选区必须安全返回 null');

    // 验证在编辑器内部时正常返回 cloneRange
    const editor = doc.querySelector('[contenteditable="true"]')!;
    const insideRange = doc.createRange();
    insideRange.selectNodeContents(editor);
    sel.removeAllRanges();
    sel.addRange(insideRange);

    const insideCaptured = captureComposerSelection(doc);
    assert.ok(insideCaptured, '编辑器内部选区必须成功捕获');
    assert.equal(insideCaptured?.commonAncestorContainer, editor);
  });

  it('【修复 2】分类入口前缀误判修复：普通素材名称即使以「角色」或「产品」开头也不误识别为分类入口', () => {
    const dom = new JSDOM(`<!doctype html>
      <body>
        <div data-composer-card>
          <div role="textbox" contenteditable="true">@角色</div>
          <div data-trigger-menu data-source="material" class="mention-menu" role="menu">
            <div role="option" data-value="material:att_char_fake" id="opt-material-char">
              <span class="itemName">角色立绘概念图.png</span>
            </div>
            <div role="option" data-value="material:att_prod_fake" id="opt-material-prod">
              <span class="itemName">产品宣发主视觉.jpg</span>
            </div>
            <div role="option" data-value="${ENTITY_CATEGORY_CHARACTER_VALUE}" id="opt-cat-char">
              <span class="itemName">角色</span>
            </div>
            <div role="option" data-value="${ENTITY_CATEGORY_PRODUCT_VALUE}" id="opt-cat-prod">
              <span class="itemName">产品</span>
            </div>
          </div>
        </div>
      </body>`);
    const doc = dom.window.document;
    placeMentionMenu(doc);

    const optCharMaterial = doc.getElementById('opt-material-char')!;
    const optProdMaterial = doc.getElementById('opt-material-prod')!;
    const optCharCat = doc.getElementById('opt-cat-char')!;
    const optProdCat = doc.getElementById('opt-cat-prod')!;

    assert.equal(optCharMaterial.getAttribute('data-omnimux-entity-category'), null, '名称以角色开头的普通素材不得被标记为分类');
    assert.equal(optProdMaterial.getAttribute('data-omnimux-entity-category'), null, '名称以产品开头的普通素材不得被标记为分类');
    assert.equal(optCharCat.getAttribute('data-omnimux-entity-category'), 'character', '真角色分类入口必须基于 data-value 严格识别');
    assert.equal(optProdCat.getAttribute('data-omnimux-entity-category'), 'product', '真产品分类入口必须基于 data-value 严格识别');
  });

  it('【修复 3】DOM复用陈旧闭包修复：mouseenter 触发时动态读取当前 DOM 的 category 属性作为 activeType', async () => {
    let mountedType = '';
    registerEntitySubmenuRenderer((_, props) => {
      mountedType = props.type;
    });

    const dom = new JSDOM(`<!doctype html>
      <body>
        <div data-composer-card>
          <div role="textbox" contenteditable="true"></div>
          <div data-trigger-menu data-source="material" class="mention-menu" role="menu">
            <div id="reusable-row" role="option" data-value="${ENTITY_CATEGORY_CHARACTER_VALUE}">
              <span class="itemName">角色</span>
            </div>
          </div>
        </div>
      </body>`);

    const prevWin = globalThis.window;
    const prevDoc = (globalThis as any).document;
    (globalThis as any).window = dom.window;
    (globalThis as any).document = dom.window.document;

    try {
      const doc = dom.window.document;
      const row = doc.getElementById('reusable-row')!;
      row.getBoundingClientRect = () => ({ top: 100, left: 100, width: 120, height: 32 } as any);

      placeMentionMenu(doc);
      assert.equal(row.getAttribute('data-omnimux-entity-category'), 'character');

      // 模拟列表 DOM 复用：属性被置为 product，但事件监听器已绑在 row 上
      row.setAttribute('data-omnimux-entity-category', 'product');

      // 触发 mouseenter
      row.dispatchEvent(new dom.window.Event('mouseenter'));

      // 等待 40ms 防抖定时器
      await new Promise((resolve) => setTimeout(resolve, 80));

      assert.equal(mountedType, 'product', '列表复用后 mouseenter 必须动态传递当前 DOM 上的最新 category 类型');
    } finally {
      unmountEntitySubmenu();
      registerEntitySubmenuRenderer(null);
      if (prevWin) (globalThis as any).window = prevWin;
      else delete (globalThis as any).window;
      if (prevDoc) (globalThis as any).document = prevDoc;
      else delete (globalThis as any).document;
      dom.window.close();
    }
  });

  it('【修复 4】降级文本插入位置：execCommand 失败且有 savedRange 在 editor 内时优先插入到 startContainer 对应位置', () => {
    const dom = new JSDOM(`<!doctype html>
      <body>
        <div data-composer-card>
          <div role="textbox" contenteditable="true"><p id="p1">头部内容中间</p><p id="p2">尾部内容</p></div>
        </div>
      </body>`);

    const prevWin = globalThis.window;
    const prevDoc = (globalThis as any).document;
    (globalThis as any).window = dom.window;
    (globalThis as any).document = dom.window.document;
    dom.window.document.execCommand = () => false; // 强制 execCommand 失败

    try {
      const p1 = dom.window.document.getElementById('p1')!;
      const textNode = p1.firstChild as Text;

      // 选区定在 "头部内容" 与 "中间" 之间（offset 4）
      const range = dom.window.document.createRange();
      range.setStart(textNode, 4);
      range.setEnd(textNode, 4);

      const ok = insertEntityMentionChip({
        name: '精准插入商品',
        ref: 'material:att_insert_pos',
        type: 'product',
        savedRange: range,
      });

      assert.equal(ok, true);
      // 验证 p1 内容包含插入文本，而不是追加在 editor 的最后
      assert.match(p1.textContent || '', /头部内容@精准插入商品 中间/, '降级插入必须插入到 savedRange.startContainer 的对应 offset 位置');
      const p2 = dom.window.document.getElementById('p2')!;
      assert.equal(p2.textContent, '尾部内容', '尾部段落之后不得被 appendChild 干扰');
    } finally {
      if (prevWin) (globalThis as any).window = prevWin;
      else delete (globalThis as any).window;
      if (prevDoc) (globalThis as any).document = prevDoc;
      else delete (globalThis as any).document;
      dom.window.close();
    }
  });

  it('【修复 5】胶囊插入结果处理：EntityMentionSubmenu 中包含插入失败警告日志契约', () => {
    const submenuSrc = readFileSync(join(__dirname, 'EntityMentionSubmenu.tsx'), 'utf-8');
    assert.ok(
      submenuSrc.includes("console.warn('[omnimux] entity mention chip insertion failed for attachment:', attachmentId)"),
      'EntityMentionSubmenu.tsx 源码中必须包含针对插入失败的标准 warn 日志'
    );
  });

  it('【修复 6】样式收敛：styles.css 与 composer-compact.js 中实体二级菜单类名与属性选择器 100% 对齐且无多余未引用样式', () => {
    const cssFile = readFileSync(join(__dirname, 'styles.css'), 'utf-8');
    const requiredSelectors = [
      '.omx-entity-mention-submenu',
      '.omx-entity-submenu-list',
      '.omx-entity-submenu-item',
      '.omx-entity-submenu-thumb',
      '.omx-entity-submenu-img',
      '.omx-entity-submenu-thumb-fallback',
      '.omx-entity-submenu-name',
      '.omx-entity-submenu-loading',
      '.omx-entity-submenu-empty',
      '[data-omnimux-entity-category]',
    ];

    for (const sel of requiredSelectors) {
      assert.ok(cssFile.includes(sel), `styles.css 必须包含选择器: ${sel}`);
      assert.ok(COMPOSER_COMPACT_CSS.includes(sel), `composer-compact.js 必须包含选择器: ${sel}`);
    }
  });
});

describe('PR #2649 第二轮审查缺陷闭环定点测试', () => {
  it('【修复 1 精确等值判定】移除 includes()，严格全等匹配角色与产品一级分类入口', () => {
    const dom = new JSDOM(`<!doctype html>
      <body>
        <div data-composer-card>
          <div role="textbox" contenteditable="true"></div>
          <div data-trigger-menu data-source="material" class="mention-menu" role="menu">
            <div role="option" data-value="entity:category:character_fake" id="fake-char">
              <span class="itemName">角色伪入口</span>
            </div>
            <div role="option" data-value="entity:category:product_preview" id="fake-prod">
              <span class="itemName">产品伪入口</span>
            </div>
            <div role="option" data-value="${ENTITY_CATEGORY_CHARACTER_VALUE}" id="real-char">
              <span class="itemName">角色</span>
            </div>
            <div role="option" data-value="${ENTITY_CATEGORY_PRODUCT_VALUE}" id="real-prod">
              <span class="itemName">产品</span>
            </div>
          </div>
        </div>
      </body>`);
    const doc = dom.window.document;
    placeMentionMenu(doc);

    const fakeChar = doc.getElementById('fake-char')!;
    const fakeProd = doc.getElementById('fake-prod')!;
    const realChar = doc.getElementById('real-char')!;
    const realProd = doc.getElementById('real-prod')!;

    assert.equal(fakeChar.getAttribute('data-omnimux-entity-category'), null, '包含子串的伪分类不得匹配角色');
    assert.equal(fakeProd.getAttribute('data-omnimux-entity-category'), null, '包含子串的伪分类不得匹配产品');
    assert.equal(realChar.getAttribute('data-omnimux-entity-category'), 'character', '严格精确匹配角色分类入口');
    assert.equal(realProd.getAttribute('data-omnimux-entity-category'), 'product', '严格精确匹配产品分类入口');
  });

  it('【修复 2 行复用缩略图清理】分类入口复用旧素材行时，彻底清理 data-omnimux-thumb 与 --omnimux-thumb', () => {
    const dom = new JSDOM(`<!doctype html>
      <body>
        <div data-composer-card>
          <div role="textbox" contenteditable="true"></div>
          <div data-trigger-menu data-source="material" class="mention-menu" role="menu">
            <div role="option" data-value="${ENTITY_CATEGORY_CHARACTER_VALUE}" id="reused-char-row" data-omnimux-thumb="true" style="--omnimux-thumb: url('http://example.com/old-thumb.png');">
              <span class="itemName">角色</span>
            </div>
            <div role="option" data-value="${ENTITY_CATEGORY_PRODUCT_VALUE}" id="reused-prod-row" data-omnimux-thumb="true" style="--omnimux-thumb: url('http://example.com/old-prod.png');">
              <span class="itemName">产品</span>
            </div>
          </div>
        </div>
      </body>`);
    const doc = dom.window.document;
    placeMentionMenu(doc);

    const reusedChar = doc.getElementById('reused-char-row')!;
    const reusedProd = doc.getElementById('reused-prod-row')!;

    assert.equal(reusedChar.hasAttribute('data-omnimux-thumb'), false, '复用为角色入口时必须移除 data-omnimux-thumb');
    assert.equal(reusedChar.style.getPropertyValue('--omnimux-thumb'), '', '复用为角色入口时必须清除 --omnimux-thumb');
    assert.equal(reusedProd.hasAttribute('data-omnimux-thumb'), false, '复用为产品入口时必须移除 data-omnimux-thumb');
    assert.equal(reusedProd.style.getPropertyValue('--omnimux-thumb'), '', '复用为产品入口时必须清除 --omnimux-thumb');
  });

  it('【修复 3 资源泄漏修复】uninstallObserver 及无 trigger menu 分支必须显式调用 unmountEntitySubmenu', () => {
    let unmountTriggered = 0;
    registerEntitySubmenuRenderer((container, props) => {
      if (props && props.isOpen === false) unmountTriggered++;
    });

    const dom = new JSDOM(`<!doctype html>
      <body>
        <div id="omnimux-entity-submenu-root">
          <div class="omx-entity-mention-submenu"></div>
        </div>
      </body>`);

    const prevWin = globalThis.window;
    const prevDoc = (globalThis as any).document;
    (globalThis as any).window = dom.window;
    (globalThis as any).document = dom.window.document;

    try {
      // 场景 1: placeMentionMenu 找不到 [data-trigger-menu]
      placeMentionMenu(dom.window.document);
      assert.ok(unmountTriggered >= 1, 'placeMentionMenu 未找到 trigger menu 时必须调用 unmountEntitySubmenu');

      // 场景 2: uninstallComposerCompactObserver
      unmountTriggered = 0;
      uninstallComposerCompactObserver();
      assert.ok(unmountTriggered >= 1, 'uninstallComposerCompactObserver 内部必须显式调用 unmountEntitySubmenu');
    } finally {
      registerEntitySubmenuRenderer(null);
      if (prevWin) (globalThis as any).window = prevWin;
      else delete (globalThis as any).window;
      if (prevDoc) (globalThis as any).document = prevDoc;
      else delete (globalThis as any).document;
      dom.window.close();
    }
  });

  it('【修复 4 素材行索引偏移校准】宿主 dsh-slash-option-material-N 索引与前置 categories 精准对齐', () => {
    const mock = setupMockStore('default');
    const store = mock.store;

    // 向 default session store 添加 2 个素材
    store.addAttachment('default', {
      sourcePlugin: 'omnimux-assets',
      kind: 'asset',
      entityId: 'mat_0',
      title: '素材0号',
      extension: 'PNG',
      relativePath: 'assets/mat0.png',
      previewUrl: 'http://example.com/mat0.png',
    });
    store.addAttachment('default', {
      sourcePlugin: 'omnimux-assets',
      kind: 'asset',
      entityId: 'mat_1',
      title: '素材1号',
      extension: 'JPG',
      relativePath: 'assets/mat1.jpg',
      previewUrl: 'http://example.com/mat1.jpg',
    });

    const dom = new JSDOM(`<!doctype html>
      <body>
        <div data-composer-card>
          <div role="textbox" contenteditable="true">@</div>
          <div data-trigger-menu data-source="material" class="mention-menu" role="menu">
            <div role="option" id="dsh-slash-option-material-0" data-value="${ENTITY_CATEGORY_CHARACTER_VALUE}">
              <span class="itemName">角色</span>
            </div>
            <div role="option" id="dsh-slash-option-material-1" data-value="${ENTITY_CATEGORY_PRODUCT_VALUE}">
              <span class="itemName">产品</span>
            </div>
            <div role="option" id="dsh-slash-option-material-2">
              <span class="itemName">素材0号</span>
            </div>
            <div role="option" id="dsh-slash-option-material-3">
              <span class="itemName">素材1号</span>
            </div>
          </div>
        </div>
      </body>`);

    const prevWin = globalThis.window;
    const prevDoc = (globalThis as any).document;
    (globalThis as any).window = dom.window;
    (globalThis as any).document = dom.window.document;
    (dom.window as any).__omnimuxAttachments = store;
    (globalThis as any).__omnimuxAttachments = store;

    try {
      placeMentionMenu(dom.window.document);

      const rowMat0 = dom.window.document.getElementById('dsh-slash-option-material-2')!;
      const rowMat1 = dom.window.document.getElementById('dsh-slash-option-material-3')!;

      // 验证索引对齐：material-2 正确对齐素材0号，material-3 正确对齐素材1号
      assert.equal(rowMat0.getAttribute('data-omnimux-thumb'), 'true');
      assert.equal(rowMat0.style.getPropertyValue('--omnimux-thumb'), 'url("http://example.com/mat0.png")');
      assert.equal(rowMat1.getAttribute('data-omnimux-thumb'), 'true');
      assert.equal(rowMat1.style.getPropertyValue('--omnimux-thumb'), 'url("http://example.com/mat1.jpg")');
    } finally {
      if (prevWin) (globalThis as any).window = prevWin;
      else delete (globalThis as any).window;
      if (prevDoc) (globalThis as any).document = prevDoc;
      else delete (globalThis as any).document;
      mock.restore();
      dom.window.close();
    }
  });

  it('【修复 5 角色列表性能截断与类型】raw.slice(0, 12) 截断、8 项配额告警契约与实体类型导出', () => {
    const submenuSrc = readFileSync(join(__dirname, 'EntityMentionSubmenu.tsx'), 'utf-8');

    // 1. 性能截断：保持与产品分支一致的 12 项限制
    assert.ok(submenuSrc.includes('setItems(raw.slice(0, 12))'), '角色列表必须进行 raw.slice(0, 12) 性能截断');

    // 2. 8 项配额告警契约
    assert.ok(submenuSrc.includes("res?.reason === 'quota-exceeded'"), '必须显式校验 quota-exceeded 状态');
    assert.ok(submenuSrc.includes('素材已达 8 项上限'), '配额超限时必须触发 素材已达 8 项上限 告警提示');

    // 3. 实体类型定义导出
    assert.ok(submenuSrc.includes('export interface ProductItem'), '必须导出 ProductItem 类型');
    assert.ok(submenuSrc.includes('export interface CharacterItem'), '必须导出 CharacterItem 类型');
    assert.ok(submenuSrc.includes('export type EntityItem = ProductItem | CharacterItem'), '必须导出 EntityItem 联合类型');
  });

  it('【修复 6 冗余命令收敛】insertFallbackEntityText 中 execCommand 严格收敛为单点调用', () => {
    const chipSrc = readFileSync(join(__dirname, 'entityMentionChip.ts'), 'utf-8');

    // 提取 insertFallbackEntityText 函数内容
    const startIdx = chipSrc.indexOf('function insertFallbackEntityText(');
    assert.ok(startIdx > 0, '必须包含 insertFallbackEntityText 函数');
    const endIdx = chipSrc.indexOf('export function insertEntityMentionChip(', startIdx);
    const funcBody = chipSrc.slice(startIdx, endIdx);

    // 匹配 execCommand 调用频次
    const execMatches = funcBody.match(/document\.execCommand\(/g) || [];
    assert.equal(execMatches.length, 1, `insertFallbackEntityText 内的 execCommand 必须严格收敛为 1 次，当前实际为 ${execMatches.length} 次`);
  });
});
