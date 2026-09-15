/**
 * 端到端（真实 DOM）：宿主右侧栏全屏 + 画布「添加会话」→ 会话栏必须被带出来。
 *
 * 链路全部用真实模块：画布 hook（esbuild 打包真实 `useAddToConversation.ts`）
 * → 中枢全局 API → 中枢统一实现 `ensure-conversation-visible.js` → 真实 DOM 点击官方退出控件。
 *
 * 回归点：全屏态下插件折叠键是 `false`，旧实现「读到 false 就跳过」会让宿主全屏永不被退出。
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { ensureConversationVisible } from '../../omnimux/src/client/workbench/ensure-conversation-visible.js';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/canvas/hooks/useAddToConversation.ts', import.meta.url))],
  bundle: true, write: false, format: 'iife', globalName: 'hook', platform: 'node',
  plugins: [{ name: 'attach-boundaries', setup(build) {
    build.onResolve({ filter: /^react$|\/ui\/toast$/ }, ({ path }) => ({ path, namespace: 'test' }));
    build.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ contents:
      path === 'react'
        ? 'export const useCallback = fn => fn;'
        : `export const toast = { success: (m) => env.toasts.push(['success', m]), warning: (m) => env.toasts.push(['warning', m]), error: () => {}, info: () => {} };`,
    }));
  } }],
});
const source = bundle.outputFiles[0].text;

let dom;
afterEach(() => { dom?.window.close(); dom = undefined; });

class FakeCustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }

/** 造「宿主右侧栏全屏」的真实 DOM：面板属性 + 官方 push 模式控件。 */
function createFullscreenDocument() {
  dom = new JSDOM(`<!doctype html><html><body>
    <div data-sidebar-right-panel="fullscreen" data-sidebar-right-open="true">
      <button data-sidebar-right-mode="push">push</button>
    </div>
  </body></html>`);
  const { document } = dom.window;
  const clicks = [];
  document.querySelector('button[data-sidebar-right-mode="push"]').addEventListener('click', () => {
    clicks.push('push');
    // 宿主行为：点 push 后离开 fullscreen 呈现。
    document.querySelector('[data-sidebar-right-panel]').setAttribute('data-sidebar-right-panel', 'push');
  });
  return { document, clicks };
}

function createScene() {
  const { document, clicks } = createFullscreenDocument();
  const calls = [];
  const toasts = [];
  const env = { toasts };

  const api = {
    getConversationCollapsed: () => false, // 全屏态下折叠键恰恰是 false
    setConversationCollapsed: (v) => calls.push(['setConversationCollapsed', v]),
    setFocus: (mode) => calls.push(['setFocus', mode]),
    getSnapshot: () => ({ sessionId: 'sess-e2e' }),
    // 真实中枢实现，DOM 用上面那份真实文档。
    ensureConversationVisible: () => {
      const result = ensureConversationVisible(document, api);
      calls.push(['ensureConversationVisible', result]);
      return result;
    },
  };

  const win = {
    __omnimuxWorkbench: api,
    __omnimuxAttachments: { addAttachment: () => ({ ok: true }) },
    __omnimuxComposerActions: { revealAttachments: () => calls.push(['revealAttachments']) },
    dispatchEvent: () => true,
    document,
  };

  const ctx = vm.createContext({
    env, window: win, CustomEvent: FakeCustomEvent, document,
    navigator: { clipboard: { writeText: () => Promise.resolve() } }, console,
  });
  vm.runInContext(source, ctx);
  return { hook: ctx.hook, win, calls, toasts, clicks, document };
}

const payload = { kind: 'video', entityId: 'n1', title: 'video.mp4', relativePath: 'assets/videos/video.mp4' };

test('e2e：全屏态点「添加会话」→ 退出宿主全屏 + 成功提示', () => {
  const scene = createScene();
  const result = scene.hook.deliverToConversation(payload, scene.win);

  assert.equal(scene.clicks.length, 1, '真实 DOM 上点了一次官方退出控件');
  assert.equal(scene.document.querySelector('[data-sidebar-right-panel]').getAttribute('data-sidebar-right-panel'), 'push',
    '面板已离开 fullscreen 呈现');
  assert.equal(result.revealed, 'revealed');
  assert.deepEqual(JSON.parse(JSON.stringify(scene.toasts)), [['success', '已添加到会话：video.mp4']]);
});

test('e2e：全屏态不得因为折叠键为 false 而跳过露出', () => {
  const scene = createScene();
  scene.hook.deliverToConversation(payload, scene.win);

  const ensureCall = scene.calls.find((entry) => entry[0] === 'ensureConversationVisible');
  assert.ok(ensureCall, '必须走统一入口');
  assert.equal(ensureCall[1].hostFullscreenExited, true, '宿主全屏确实被退出');
  assert.equal(scene.calls.some((entry) => entry[0] === 'setConversationCollapsed'), false);
});
