/**
 * 跨插件端到端：画布「添加到会话」→ 会话栏露出 → 附件落库 → 回执提示 → 视线引导 → 附件导轨 DOM 效果。
 *
 * 链路两端都是生产源码，中间不做替身：
 *   - 画布 island  `plugins/omnimux-workflow/src/canvas/hooks/useAddToConversation.ts`（`deliverToConversation`）
 *   - 中枢 store   `plugins/omnimux/src/client/attachments/store.ts`（`createAttachmentStore` + `installGlobalEvents`）
 *   - 中枢桥接     `plugins/omnimux/src/client/composer-add/AttachmentSubmitBridge.jsx`（真实 `revealAttachments()`）
 *   - 中枢导轨     `plugins/omnimux/src/client/attachments/AttachmentTray.tsx`（真实 React 组件 + 真实 reveal 监听）
 *   - 提示         `plugins/omnimux-workflow/src/canvas/ui/toast.tsx`（真实 toast，渲染真实 DOM 文本）
 *
 * 替身边界（仅两处，均非本次改动的判定对象）：
 *   1. 宿主 workbench（`window.__omnimuxWorkbench`）—— 宿主壳的对外契约面，按规格 §2.1 A1 把折叠位写成
 *      `html[data-omnimux-conversation-collapsed]`，使「会话栏是否露出」成为可观察的 DOM 事实而非调用记录；
 *   2. `dsh-ui-kit` —— 宿主 UI 套件，本链路只用到 `Button`。
 *
 * 能力边界（不得据此宣称已验收）：
 *   - JSDOM 无布局引擎：本文件不含几何（width/height 恒为 0）与截图证据，不替代真实浏览器验收；
 *   - 规格 §2.5 候选 B（宿主原生 `fixed` 全屏覆盖会话列）需要运行态证据，本文件覆盖不到；
 *   - 真实 Chromium 计算样式与 `omx-att-pulse` 的 0.6s 视觉脉冲未在此断言（仅断言类名与 timer 清理）。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const workflowRoot = join(here, '..');
const hubRoot = join(workflowRoot, '..', 'omnimux');

/** 全部宿主依赖经同一 require 解析，保证 React 单实例（两个 React 副本会让 hooks 直接报错）。 */
const requireFromWorkflow = createRequire(join(workflowRoot, 'package.json'));
const { JSDOM } = requireFromWorkflow('jsdom');
const React = requireFromWorkflow('react');
const { createRoot } = requireFromWorkflow('react-dom/client');
const act = React.act;

const EXTERNALS = ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'dsh-ui-kit', 'lucide-react'];

/** 宿主 UI 套件替身：本链路只用到 `Button`，其余按需返回占位组件。 */
const uiKitStub = new Proxy(
  { Button: (props) => React.createElement('button', props) },
  {
    get(target, key) {
      if (key === '__esModule') return true;
      if (key === 'default') return uiKitStub;
      if (typeof key === 'symbol') return undefined;
      if (key in target) return target[key];
      return (props) => React.createElement('span', props);
    },
  },
);

/**
 * 把生产源码按 CJS 打包到内存后在当前 realm 求值：真实模块，未改写任何逻辑。
 * 外置表里只有宿主/三方依赖，源码之间保持真实引用关系。
 *
 * 打包结果缓存、模块实例每次重新求值：`toast.tsx` 之类的模块级单例（`addToastFn`）
 * 必须随场景重建，否则第二个场景起提示会写进上一个场景已销毁的 document。
 */
const bundleCache = new Map();
async function loadSourceModule(rootDir, entry) {
  const key = `${rootDir}::${entry}`;
  let code = bundleCache.get(key);
  if (!code) {
    const output = await build({
      absWorkingDir: rootDir,
      entryPoints: [join(rootDir, entry)],
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'browser',
      jsx: 'automatic',
      external: EXTERNALS,
      logLevel: 'silent',
    });
    code = output.outputFiles[0].text;
    bundleCache.set(key, code);
  }

  const shim = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (name) => (name === 'dsh-ui-kit' ? uiKitStub : requireFromWorkflow(name)),
    shim,
    shim.exports,
  );
  return shim.exports;
}

const SESSION_ID = 'sess-e2e-attach';
/** 视线引导事件名：桥接侧按跨插件惯例写字符串字面量，这里把两端钉在一起。 */
const REVEAL_EVENT_LITERAL = 'omnimux:attachments:reveal';

/** 画布侧 6 个「添加到会话」入口共用的 payload。 */
const CANVAS_PAYLOAD = Object.freeze({
  sourcePlugin: 'omnimux-workflow',
  kind: 'video',
  entityId: 'node-video-1',
  title: 'video.mp4',
  relativePath: 'assets/videos/node-video-1.mp4',
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SCENE_HTML = `<!doctype html><html><head></head><body>
  <div data-phase="active">
    <div id="conversation-column" data-omnimux-conversation-column="true" data-collapsed="true"></div>
    <div data-composer-card>
      <div id="editor" data-composer-input="true" data-lexical-editor="true" contenteditable="true" tabindex="0"></div>
      <div id="tray-mount"></div>
    </div>
    <div id="bridge-mount"></div>
  </div>
</body></html>`;

/** 场景里被临时替换过的全局，收尾时统一还原。 */
const SCENE_GLOBALS = [
  'window',
  'document',
  'navigator',
  'CustomEvent',
  'Event',
  'HTMLElement',
  'Element',
  'Node',
  'MutationObserver',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'IS_REACT_ACT_ENVIRONMENT',
];

/**
 * 搭一个「宿主页面 + 中枢面板」的真实 DOM 场景。
 *
 * `layout` 只记录 workbench 契约面的调用；折叠状态本身写在真实 DOM 属性上，
 * 因此断言落在 `html[data-omnimux-conversation-collapsed]` 这类可观察事实上。
 */
async function createScene({ collapsed = true, withTray = true, withBridge = true } = {}) {
  const dom = new JSDOM(SCENE_HTML, { pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;

  const previousGlobals = new Map();
  for (const key of SCENE_GLOBALS) {
    previousGlobals.set(key, Object.prototype.hasOwnProperty.call(globalThis, key));
    // `navigator` 在 Node 里是只读访问器，单独处理。
    if (key === 'navigator' || key === 'window' || key === 'document') continue;
    if (key in window) globalThis[key] = window[key];
  }
  globalThis.window = window;
  globalThis.document = document;
  // Node 的 `globalThis.navigator` 是只读访问器，只能覆盖描述符。
  Object.defineProperty(globalThis, 'navigator', {
    value: window.navigator,
    configurable: true,
    writable: true,
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const column = document.getElementById('conversation-column');
  const phase = document.querySelector('[data-phase]');
  const editor = document.getElementById('editor');

  /** 会话列收合状态：与宿主一致地写 `html` 属性（规格 §2.1 A1）。 */
  const setCollapsed = (value) => {
    if (value) document.documentElement.setAttribute('data-omnimux-conversation-collapsed', '');
    else document.documentElement.removeAttribute('data-omnimux-conversation-collapsed');
    column.setAttribute('data-collapsed', String(Boolean(value)));
  };
  setCollapsed(collapsed);

  const layout = { calls: [] };
  window.__omnimuxWorkbench = {
    getConversationCollapsed: () => column.getAttribute('data-collapsed') === 'true',
    setConversationCollapsed: (value) => {
      layout.calls.push(['setConversationCollapsed', value]);
      setCollapsed(Boolean(value));
    },
    setFocus: (mode) => {
      layout.calls.push(['setFocus', mode]);
      phase.setAttribute('data-focus', mode);
    },
    getSnapshot: () => ({ sessionId: SESSION_ID }),
  };

  const scroll = { calls: [] };
  window.Element.prototype.scrollIntoView = function scrollIntoViewSpy() {
    scroll.calls.push(this);
  };

  const addEvents = [];
  window.addEventListener('omnimux:add-to-conversation', (event) => addEvents.push(event));

  const storeModule = await loadSourceModule(hubRoot, 'src/client/attachments/store.ts');
  const store = storeModule.createAttachmentStore();
  window.__omnimuxAttachments = store;
  // 与生产一致：单例创建时安装全局事件监听（回退通道由它接住）
  store.installGlobalEvents();

  const clipboard = [];
  window.navigator.clipboard = {
    writeText: (text) => {
      clipboard.push(text);
      return Promise.resolve();
    },
  };

  const unmounts = [];
  const unmountTray = async () => {
    const index = unmounts.findIndex((entry) => entry.name === 'tray');
    if (index < 0) return false;
    const [entry] = unmounts.splice(index, 1);
    await act(async () => {
      entry.root.unmount();
    });
    return true;
  };

  if (withBridge) {
    const bridgeModule = await loadSourceModule(hubRoot, 'src/client/composer-add/AttachmentSubmitBridge.jsx');
    const root = createRoot(document.getElementById('bridge-mount'));
    unmounts.push({ name: 'bridge', root });
    await act(async () => {
      root.render(
        React.createElement(bridgeModule.AttachmentSubmitBridge, {
          sessionId: SESSION_ID,
          useInput: (selector) => selector({ draft: '', phase: 'plain', occurrences: [] }),
          inputActions: { setDraft: () => {} },
          attachmentStore: store,
          attachmentDrafts: new Map(),
          attachmentAdmission: { arm: () => {} },
          getCurrentSessionId: () => SESSION_ID,
          t: (key) => key,
        }),
      );
    });
  }

  const trayModule = await loadSourceModule(hubRoot, 'src/client/attachments/AttachmentTray.tsx');
  if (withTray) {
    const root = createRoot(document.getElementById('tray-mount'));
    unmounts.push({ name: 'tray', root });
    await act(async () => {
      root.render(React.createElement(trayModule.AttachmentTray, { sessionId: SESSION_ID }));
    });
  }

  const hookModule = await loadSourceModule(workflowRoot, 'src/canvas/hooks/useAddToConversation.ts');

  return {
    window,
    document,
    store,
    layout,
    scroll,
    addEvents,
    clipboard,
    hook: hookModule,
    trayModule,
    /** 附件导轨的可见容器。 */
    dock: () => document.querySelector('[data-omnimux-attachments-dock="true"]'),
    /** 导轨渲染出的卡片（真实 AttachmentCard，带 `data-omnimux-attachment-id`）。 */
    cards: () => [
      ...document.querySelectorAll('[data-omnimux-attachments-dock="true"] .omx-att-card[data-omnimux-attachment-id]'),
    ],
    /** 被高亮的卡片 id。 */
    highlightIds: () =>
      [...document.querySelectorAll('.omx-att-card--highlight')].map((node) =>
        node.getAttribute('data-omnimux-attachment-id'),
      ),
    /** 真实 toast 的 DOM 文本（`toast.tsx` 渲染进 document.body）。 */
    toasts: () =>
      [...document.querySelectorAll('.wf-toast')].map((node) => ({
        variant: [...node.classList].find((name) => name.startsWith('wf-toast--')) || '',
        text: node.querySelector('.wf-toast__text')?.textContent || '',
      })),
    collapsed: () => document.documentElement.hasAttribute('data-omnimux-conversation-collapsed'),
    focusMode: () => phase.getAttribute('data-focus'),
    editor: () => document.getElementById('editor'),
    /**
     * 等真实时间流逝并走满 React 的更新。
     *
     * 分小段 `act` 而不是一整个长 `act`：`toast.tsx` 的容器是异步挂载的（首帧后 50ms 落位），
     * 单个长 act 只会在末尾冲刷一次队列，异步挂载的更新拿不到提交点。
     */
    flush: async (ms = 0) => {
      const step = ms > 0 ? Math.min(30, ms) : 0;
      let remaining = ms;
      do {
        await act(async () => {
          await sleep(step);
        });
        remaining -= step;
      } while (remaining > 0);
    },
    /** 写入一条既有附件（真实 store）。 */
    seedAttachment: (overrides = {}) =>
      store.addAttachment(SESSION_ID, {
        sourcePlugin: 'omnimux-workflow',
        kind: 'image',
        entityId: 'node-image-1',
        title: 'frame.png',
        relativePath: 'assets/images/frame.png',
        ...overrides,
      }),
    unmountTray,
    cleanup: async () => {
      for (const entry of unmounts.reverse()) {
        try {
          await act(async () => {
            entry.root.unmount();
          });
        } catch {
          /* 容器已随 window 一起销毁 */
        }
      }
      dom.window.close();
      for (const [key, existed] of previousGlobals) {
        if (existed || key === 'window' || key === 'document') continue;
        delete globalThis[key];
      }
    },
  };
}

/* ------------------------------------------------- 关键旅程 A：全屏画布点「添加到会话」 */

test('A2/A3/N3/N4：会话栏自动展开 → 附件落库 → 成功提示 → 导轨滚动 + 末张卡片高亮并自行清理', async () => {
  const scene = await createScene({ collapsed: true });
  try {
    assert.equal(scene.trayModule.REVEAL_ATTACHMENTS_EVENT, REVEAL_EVENT_LITERAL, '事件名是跨插件契约');
    scene.seedAttachment({ entityId: 'node-table-1', kind: 'table', title: '分镜表.htable', relativePath: '.hilo/tables/node-table-1.htable' });
    scene.seedAttachment({ entityId: 'node-image-2', kind: 'image', title: 'cover.png', relativePath: 'assets/images/cover.png' });
    await scene.flush();

    // A1 前置：会话列不可见
    assert.equal(scene.collapsed(), true, '前置：会话列处于折叠态');
    assert.equal(scene.cards().length, 2, '前置：附件区渲染既有 2 张卡片');

    const result = scene.hook.deliverToConversation(CANVAS_PAYLOAD, scene.window);

    // 真实 store 的同步回执 + 真落库
    assert.equal(result.receipt?.ok, true, '中枢 store 给出 ok 回执');
    assert.equal(result.attached, true);
    const attachments = scene.store.getSnapshot(SESSION_ID);
    assert.equal(attachments.length, 3, '附件真的落库（含新增这一件）');
    assert.equal(attachments[2].title, 'video.mp4');
    assert.equal(attachments[2].sourcePlugin, 'omnimux-workflow');
    // 落点由中枢按「当前活跃会话」解析：导轨 effect 调 setActiveSessionId(currentSessionId) 写入，
    // 而不是画布 payload 里的 sessionId（后者只在事件回退路径被 handleAdd 读取）。
    assert.equal(attachments[2].sessionId, SESSION_ID, '附件落进导轨当前活跃会话桶');
    const latestId = attachments[2].id;

    // 会话栏自动展开：断言落在真实 DOM 属性上
    assert.equal(scene.collapsed(), false, '会话列自动展开（html 上的折叠位被清除）');
    assert.equal(scene.focusMode(), 'split', '焦点切回分栏');
    assert.deepEqual(scene.layout.calls.map((entry) => entry[0]), ['setConversationCollapsed', 'setFocus']);

    // N3：拿到回执就不再走事件通道，避免二次入桶
    assert.equal(scene.addEvents.length, 0, '有回执时不派发 omnimux:add-to-conversation');

    // 导轨 DOM：新卡片真的渲染出来（回执先到、卡片后渲染，视线引导靠 60ms 补一次）
    await scene.flush(150);
    const cards = scene.cards();
    assert.equal(cards.length, 3, '导轨渲染出第 3 张卡片');
    assert.equal(cards[2].getAttribute('data-omnimux-attachment-id'), latestId, '末位是最新那条附件');

    // 视线引导：滚到可见（首次立即给反馈，60ms 后再确认一次）+ 只有末张高亮
    assert.ok(scene.scroll.calls.length >= 1, '附件区被滚动到可见');
    assert.ok(
      scene.scroll.calls.every((target) => target === scene.dock()),
      '滚动目标始终是附件导轨本身',
    );
    assert.deepEqual(scene.highlightIds(), [latestId], '只有最新那张卡片被高亮（新高亮会顶掉上一张）');

    // 提示文案与真实落库结果一致（真实 toast DOM）
    assert.deepEqual(scene.toasts(), [{ variant: 'wf-toast--success', text: '已添加到会话：video.mp4' }]);

    // 输入框获得焦点（提交桥接的 focusEditorElement）
    assert.equal(scene.document.activeElement, scene.editor(), '焦点回到 composer 输入框');

    // N4：高亮脉冲自行清理
    await scene.flush(1000);
    assert.deepEqual(scene.highlightIds(), [], '高亮类在 timer 到期后被清除');
  } finally {
    await scene.cleanup();
  }
});

/* ------------------------------------------------ 关键旅程 B：已展开时零布局动作 */

test('B1：会话栏已展开时不写任何布局，附件照常落库、提示与视线引导照常', async () => {
  const scene = await createScene({ collapsed: false });
  try {
    scene.seedAttachment({ entityId: 'node-table-1', kind: 'table', title: '分镜表.htable', relativePath: '.hilo/tables/node-table-1.htable' });
    await scene.flush();

    const result = scene.hook.deliverToConversation(CANVAS_PAYLOAD, scene.window);
    assert.equal(result.revealed, 'skipped');
    assert.deepEqual(scene.layout.calls, [], '已展开时不调用 setConversationCollapsed / setFocus');
    assert.equal(scene.collapsed(), false);

    assert.equal(scene.store.getSnapshot(SESSION_ID).length, 2, '附件照常落库');
    await scene.flush(150);
    assert.equal(scene.highlightIds().length, 1, '视线引导照常执行');
    assert.deepEqual(scene.toasts(), [{ variant: 'wf-toast--success', text: '已添加到会话：video.mp4' }]);
    assert.equal(scene.document.activeElement, scene.editor(), '输入框照常获得焦点');
  } finally {
    await scene.cleanup();
  }
});

/* ------------------------------------------------------------ 关键旅程 C：提示如实 */

test('C1：附件已达 8 个上限时给可执行的警告，不报成功也不做视线引导', async () => {
  const scene = await createScene({ collapsed: true });
  try {
    for (let index = 0; index < 8; index += 1) {
      scene.seedAttachment({
        entityId: `node-fill-${index}`,
        title: `fill-${index}.png`,
        relativePath: `assets/images/fill-${index}.png`,
      });
    }
    await scene.flush();
    assert.equal(scene.cards().length, 8, '前置：附件区已满 8 张');

    const result = scene.hook.deliverToConversation(CANVAS_PAYLOAD, scene.window);
    assert.equal(result.receipt?.reason, 'quota-exceeded');
    assert.equal(result.attached, false);
    assert.equal(scene.store.getSnapshot(SESSION_ID).length, 8, '达上限时不写入');
    assert.equal(scene.collapsed(), false, '仍然先展开会话栏，用户才看得到「满 8 个」在哪清理');

    await scene.flush(150);
    assert.deepEqual(scene.toasts(), [{ variant: 'wf-toast--warning', text: '附件最多 8 个，请先移除一个再添加' }]);
    assert.deepEqual(scene.highlightIds(), [], '未挂上时不做视线引导');
    assert.equal(scene.scroll.calls.length, 0);
  } finally {
    await scene.cleanup();
  }
});

test('C2：同一文件重复添加（指纹命中）视为成功，不重复追加', async () => {
  const scene = await createScene({ collapsed: true });
  try {
    const first = scene.store.addAttachment(SESSION_ID, CANVAS_PAYLOAD);
    assert.equal(first.ok, true);
    await scene.flush();

    const result = scene.hook.deliverToConversation(CANVAS_PAYLOAD, scene.window);
    assert.equal(result.receipt?.reason, 'duplicate');
    assert.equal(result.attached, true, '指纹重复按已添加成功处理');
    assert.equal(scene.store.getSnapshot(SESSION_ID).length, 1, '附件区不重复追加');
    assert.equal(scene.cards().length, 1);

    await scene.flush(150);
    assert.deepEqual(scene.toasts(), [{ variant: 'wf-toast--success', text: '已添加到会话：video.mp4' }]);
    assert.deepEqual(scene.highlightIds(), [first.attachment.id], '高亮落到已存在的那张卡片上');
  } finally {
    await scene.cleanup();
  }
});

test('C3：中枢回执为 invalid-payload 时给通用警告，不假装成功', async () => {
  const scene = await createScene({ collapsed: true });
  try {
    const result = scene.hook.deliverToConversation(
      { kind: 'video', entityId: 'node-video-1', title: '', relativePath: '' },
      scene.window,
    );
    assert.equal(result.receipt?.reason, 'invalid-payload');
    assert.equal(result.attached, false);
    assert.equal(scene.store.getSnapshot(SESSION_ID).length, 0);

    await scene.flush(150);
    assert.deepEqual(scene.toasts(), [{ variant: 'wf-toast--warning', text: '添加失败，请重试' }]);
    assert.deepEqual(scene.highlightIds(), []);
  } finally {
    await scene.cleanup();
  }
});

/* ------------------------------------------------------ 回退通道 / 卸载清理 / N1 */

test('C4/N2：中枢 store 全局缺失时回退到事件通道，真实全局监听器接住并落库', async () => {
  const scene = await createScene({ collapsed: true, withTray: false, withBridge: false });
  try {
    const eventStore = scene.store;
    delete scene.window.__omnimuxAttachments;

    const result = scene.hook.deliverToConversation(CANVAS_PAYLOAD, scene.window);
    assert.equal(result.receipt, null, '拿不到 store 时没有同步回执');
    assert.equal(result.attached, true, '回退分支保持既有的成功语义');
    assert.equal(scene.addEvents.length, 1, '派发一次 omnimux:add-to-conversation');
    assert.equal(scene.addEvents[0].detail.title, 'video.mp4');
    assert.equal(eventStore.getSnapshot(SESSION_ID).length, 1, '事件通道真的落库（全局监听器接住）');
    assert.equal(scene.collapsed(), false, '回退分支同样先展开会话栏');

    await scene.flush(150);
    assert.deepEqual(scene.toasts(), [{ variant: 'wf-toast--success', text: '已添加到会话：video.mp4' }]);
    assert.equal(scene.clipboard.length, 1, 'N2：剪贴板兜底保留');
  } finally {
    await scene.cleanup();
  }
});

test('N4：导轨卸载后移除 reveal 监听，不再响应事件', async () => {
  const scene = await createScene({ collapsed: false });
  try {
    scene.seedAttachment({ entityId: 'node-keep-1', title: 'keep.png', relativePath: 'assets/images/keep.png' });
    await scene.flush();
    assert.ok(scene.dock(), '前置：导轨已挂载');
    assert.equal(await scene.unmountTray(), true, '前置：卸载导轨');

    scene.window.dispatchEvent(
      new scene.window.CustomEvent(scene.trayModule.REVEAL_ATTACHMENTS_EVENT, { detail: { sessionId: SESSION_ID } }),
    );
    await scene.flush(150);

    assert.equal(scene.scroll.calls.length, 0, '卸载后事件不再触发滚动');
    assert.deepEqual(scene.highlightIds(), [], '卸载后事件不再触发高亮');
  } finally {
    await scene.cleanup();
  }
});

test('N1：三个全局 API 全部缺失时静默跳过，不抛错也不阻断落库', async () => {
  const scene = await createScene({ collapsed: true, withTray: false, withBridge: false });
  try {
    delete scene.window.__omnimuxAttachments;
    delete scene.window.__omnimuxWorkbench;
    delete scene.window.__omnimuxComposerActions;

    const result = scene.hook.deliverToConversation(CANVAS_PAYLOAD, scene.window);
    assert.equal(result.revealed, 'unavailable');
    assert.equal(result.receipt, null);
    assert.equal(result.attached, true, '缺 API 不阻断添加');
    assert.equal(scene.addEvents.length, 1, '仍走事件通道');
    assert.equal(scene.clipboard.length, 1, '仍写剪贴板兜底');
  } finally {
    await scene.cleanup();
  }
});
