/**
 * 「添加到会话」全屏行为回归：必须先检查/展开会话栏，再按中枢同步回执如实提示。
 *
 * 缺陷原状：hook 只派发事件 + 无条件 toast，从不检查会话栏；画布全屏（会话列收起）时
 * 用户看到成功提示却看不到文件。
 *
 * 直接 exercisable 的模块级函数（`deliverToConversation` / `revealConversationColumn`），
 * 经 esbuild 打包到内存后注入假宿主 window，不经 dist。
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

/** 记录数组产生在 vm 的 realm 里，deepStrictEqual 会因原型不同误判——先转成本 realm 的普通结构。 */
const plain = (value) => JSON.parse(JSON.stringify(value));

class FakeCustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
}

/**
 * 宿主替身：`window` 上的三个全局是本修复唯一的对外依赖面。
 *
 * @param {{collapsed?: boolean, receipt?: object, hasStore?: boolean, hasWorkbench?: boolean,
 *   hasComposer?: boolean, sticky?: boolean}} [options]
 *   `sticky` 模拟「展开指令压不住外部状态」——用于验证补发一次展开。
 */
function createHost(options = {}) {
  const {
    collapsed = true, receipt = { ok: true }, hasStore = true,
    hasWorkbench = true, hasComposer = true, sticky = false,
  } = options;
  const state = { collapsed };
  const calls = [];
  const events = [];
  const toasts = [];
  const env = { toasts };

  const win = {
    __omnimuxWorkbench: hasWorkbench ? {
      getConversationCollapsed: () => state.collapsed,
      setConversationCollapsed: (value) => {
        calls.push(['setConversationCollapsed', value]);
        if (!sticky) state.collapsed = value;
      },
      setFocus: (mode) => calls.push(['setFocus', mode]),
      getSnapshot: () => ({ sessionId: 'sess-1' }),
    } : undefined,
    __omnimuxAttachments: hasStore ? {
      addAttachment: (sessionId, payload) => {
        calls.push(['addAttachment', sessionId, payload?.sessionId ?? null]);
        return receipt;
      },
    } : undefined,
    __omnimuxComposerActions: hasComposer ? {
      revealAttachments: () => calls.push(['revealAttachments']),
    } : undefined,
    dispatchEvent: (event) => { events.push(event); return true; },
  };

  const ctx = vm.createContext({
    env,
    window: win,
    CustomEvent: FakeCustomEvent,
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    console,
  });
  vm.runInContext(source, ctx);
  return { hook: ctx.hook, win, calls, events, toasts, state };
}

const payload = Object.freeze({
  kind: 'video',
  entityId: 'node-video-1',
  title: 'video.mp4',
  relativePath: 'assets/videos/video.mp4',
});

const stepNames = (host) => plain(host.calls).map((entry) => entry[0]);
const indexOf = (host, name) => stepNames(host).indexOf(name);

test('会话栏收起时：先展开会话栏，再落库，并报成功', () => {
  const host = createHost({ collapsed: true });
  const result = host.hook.deliverToConversation(payload, host.win);
  const calls = plain(host.calls);

  assert.deepEqual(calls[0], ['setConversationCollapsed', false]);
  assert.deepEqual(calls[1], ['setFocus', 'split']);
  assert.equal(calls[2][0], 'addAttachment');
  assert.ok(indexOf(host, 'setConversationCollapsed') < indexOf(host, 'addAttachment'),
    '展开必须发生在落库之前，失败分支也才够得到附件区');
  assert.deepEqual(plain(host.toasts), [['success', '已添加到会话：video.mp4']]);
  assert.equal(result.attached, true);
  assert.equal(result.revealed, 'revealed');
});

test('会话栏已展开时：不写任何布局，直接落库', () => {
  const host = createHost({ collapsed: false });
  const result = host.hook.deliverToConversation(payload, host.win);

  assert.equal(indexOf(host, 'setConversationCollapsed'), -1);
  assert.equal(indexOf(host, 'setFocus'), -1);
  assert.deepEqual(stepNames(host), ['addAttachment', 'revealAttachments']);
  assert.equal(result.revealed, 'skipped');
});

test('配额已满：仍然先展开会话栏，并给可执行的警告文案', () => {
  const host = createHost({ collapsed: true, receipt: { ok: false, reason: 'quota-exceeded' } });
  const result = host.hook.deliverToConversation(payload, host.win);

  assert.ok(indexOf(host, 'setConversationCollapsed') < indexOf(host, 'addAttachment'));
  assert.deepEqual(plain(host.toasts), [['warning', '附件最多 8 个，请先移除一个再添加']]);
  assert.equal(result.attached, false);
  assert.equal(indexOf(host, 'revealAttachments'), -1, '未挂上时不做视线引导');
});

test('指纹重复视为已添加成功，不再误报失败', () => {
  const host = createHost({ collapsed: true, receipt: { ok: false, reason: 'duplicate' } });
  const result = host.hook.deliverToConversation(payload, host.win);

  assert.deepEqual(plain(host.toasts), [['success', '已添加到会话：video.mp4']]);
  assert.equal(result.attached, true);
  assert.ok(indexOf(host, 'revealAttachments') > -1);
});

test('其余失败原因给通用警告，不假装成功', () => {
  const host = createHost({ collapsed: true, receipt: { ok: false, reason: 'invalid-payload' } });
  const result = host.hook.deliverToConversation(payload, host.win);

  assert.deepEqual(plain(host.toasts), [['warning', '添加失败，请重试']]);
  assert.equal(result.attached, false);
});

test('拿不到全局 store 时回退到既有事件通道，保持向后兼容', () => {
  const host = createHost({ hasStore: false });
  const result = host.hook.deliverToConversation(payload, host.win);

  assert.equal(host.events.length, 1);
  assert.equal(host.events[0].type, 'omnimux:add-to-conversation');
  assert.deepEqual(plain(host.toasts), [['success', '已添加到会话：video.mp4']]);
  assert.equal(result.receipt, null);
  assert.equal(result.attached, true);
});

test('拿到同步回执时不再派发事件，避免二次入桶', () => {
  const host = createHost({ collapsed: true });
  host.hook.deliverToConversation(payload, host.win);
  assert.equal(host.events.length, 0);
});

test('会话 id 从工作台快照补进 payload；读不到工作台时也不阻断落库', () => {
  const withWorkbench = createHost({ collapsed: true });
  withWorkbench.hook.deliverToConversation(payload, withWorkbench.win);
  assert.equal(plain(withWorkbench.calls)[2][2], 'sess-1');

  const withoutWorkbench = createHost({ hasWorkbench: false, collapsed: true });
  const result = withoutWorkbench.hook.deliverToConversation(payload, withoutWorkbench.win);
  assert.equal(result.revealed, 'unavailable');
  assert.equal(result.attached, true);
  assert.deepEqual(plain(withoutWorkbench.toasts), [['success', '已添加到会话：video.mp4']]);
});

test('展开指令被外部状态压回时补发一次（退化路径守卫，真实宿主下该分支为 no-op）', () => {
  // 真实 `setConversationCollapsed` 同步写内存态，读回必为 false → 第二次 expand 不会执行；
  // 此用例只钉住「万一设置器没生效也不会卡在折叠态」这一守卫，不代表宿主存在该语义。
  const host = createHost({ collapsed: true, sticky: true });
  host.hook.deliverToConversation(payload, host.win);

  const expandCalls = plain(host.calls).filter((entry) => entry[0] === 'setConversationCollapsed');
  assert.equal(expandCalls.length, 2, '补发一次覆盖折叠位被压回的时序');
  assert.deepEqual(expandCalls.map((entry) => entry[1]), [false, false]);
});

test('缺少视线引导能力时静默跳过，不影响提示', () => {
  const host = createHost({ collapsed: true, hasComposer: false });
  const result = host.hook.deliverToConversation(payload, host.win);

  assert.equal(result.attached, true);
  assert.deepEqual(plain(host.toasts), [['success', '已添加到会话：video.mp4']]);
});
