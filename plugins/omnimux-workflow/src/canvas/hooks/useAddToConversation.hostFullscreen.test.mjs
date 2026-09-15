/**
 * 全屏态回归：宿主右侧栏全屏时折叠键是 `false`，画布必须走中枢的统一入口
 * （`ensureConversationVisible`），不能因为「折叠键为 false」就跳过露出——
 * 那正是用户看到的「提示已添加、会话栏却不动」。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./useAddToConversation.ts', import.meta.url))],
  bundle: true, write: false, format: 'iife', globalName: 'hook', platform: 'node',
  plugins: [{ name: 'attach-boundaries', setup(build) {
    build.onResolve({ filter: /^react$|\/ui\/toast$/ }, ({ path }) => ({ path, namespace: 'test' }));
    build.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ contents:
      path === 'react'
        ? 'export const useCallback = fn => fn;'
        : `export const toast = {
            success: message => env.toasts.push(['success', message]),
            warning: message => env.toasts.push(['warning', message]),
            error: message => env.toasts.push(['error', message]),
            info: message => env.toasts.push(['info', message]),
          };`,
    }));
  } }],
});
const source = bundle.outputFiles[0].text;

class FakeCustomEvent {
  constructor(type, init) { this.type = type; this.detail = init?.detail; }
}

/**
 * @param {{ensureResult?: object, hasEnsure?: boolean}} [options]
 *   `hasEnsure: false` 模拟老内核（没有统一入口）。
 */
function createHost(options = {}) {
  const { ensureResult = { hostFullscreenExited: true, collapseCleared: false }, hasEnsure = true } = options;
  const calls = [];
  const toasts = [];
  const env = { toasts };

  const workbench = {
    // 全屏态下插件折叠键恰恰是 false —— 旧写法会在这里直接跳过全部布局动作。
    getConversationCollapsed: () => false,
    setConversationCollapsed: (value) => calls.push(['setConversationCollapsed', value]),
    setFocus: (mode) => calls.push(['setFocus', mode]),
    getSnapshot: () => ({ sessionId: 'sess-1' }),
  };
  if (hasEnsure) {
    workbench.ensureConversationVisible = () => { calls.push(['ensureConversationVisible']); return ensureResult; };
  }

  const win = {
    __omnimuxWorkbench: workbench,
    __omnimuxAttachments: { addAttachment: () => ({ ok: true }) },
    __omnimuxComposerActions: { revealAttachments: () => calls.push(['revealAttachments']) },
    dispatchEvent: () => true,
  };

  const ctx = vm.createContext({
    env, window: win, CustomEvent: FakeCustomEvent,
    navigator: { clipboard: { writeText: () => Promise.resolve() } }, console,
  });
  vm.runInContext(source, ctx);
  return { hook: ctx.hook, win, calls, toasts };
}

const payload = Object.freeze({
  kind: 'video', entityId: 'node-video-1', title: 'video.mp4', relativePath: 'assets/videos/video.mp4',
});

test('宿主全屏态（折叠键为 false）：必须走统一入口把会话栏带出来', () => {
  const host = createHost();
  const result = host.hook.deliverToConversation(payload, host.win);

  assert.equal(host.calls[0][0], 'ensureConversationVisible', '第一步就得是统一入口');
  assert.equal(result.revealed, 'revealed');
  assert.deepEqual(JSON.parse(JSON.stringify(host.toasts)), [['success', '已添加到会话：video.mp4']]);
});

test('走统一入口时不再重复写折叠键与焦点（避免二次改动布局）', () => {
  const host = createHost();
  host.hook.deliverToConversation(payload, host.win);

  const names = host.calls.map((entry) => entry[0]);
  assert.equal(names.includes('setConversationCollapsed'), false);
  assert.equal(names.includes('setFocus'), false);
});

test('统一入口判定「本来就可见」时：视为 skipped，且不写布局', () => {
  const host = createHost({ ensureResult: { hostFullscreenExited: false, collapseCleared: false } });
  const result = host.hook.deliverToConversation(payload, host.win);

  assert.equal(result.revealed, 'skipped');
  assert.deepEqual(host.calls.map((entry) => entry[0]), ['ensureConversationVisible', 'revealAttachments']);
});

test('老内核（无统一入口）：回退到既有路径，读不到折叠态时仍尝试展开', () => {
  const host = createHost({ hasEnsure: false, });
  host.win.__omnimuxWorkbench.getConversationCollapsed = () => undefined;
  const result = host.hook.deliverToConversation(payload, host.win);

  const names = host.calls.map((entry) => entry[0]);
  assert.equal(names.includes('setConversationCollapsed'), true);
  assert.equal(names.includes('setFocus'), true);
  assert.equal(result.revealed, 'revealed');
});
