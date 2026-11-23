/**
 * scripts/reload-dev-app.test.mjs
 *
 * 受控重启拉起环境的回归测试（#3442）：Agent 常在 Electron 宿主（DeepSeek Harness /
 * 其他 Electron 应用）里运行，shell 环境带有 `ELECTRON_RUN_AS_NODE=1`；`open` 继承
 * 该变量会让 Dev 以 Node 模式启动后立即退出。devLaunchEnv 必须在拉起前剔除它，
 * 且成功重启路径的 `open` 调用必须带上剔除后的环境。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { devLaunchEnv, restartDevApp } from './reload-dev-app.mjs';

const MAIN_COMMAND = '/Applications/OmniMux Dev.app/Contents/MacOS/OmniMux Dev';

/** One verified dev main process (pid 4242) that is also the CDP port listener. */
function stubRun() {
  const calls = [];
  let quitRequested = false;
  const run = (command, args, options = {}) => {
    calls.push({ command, args, env: options.env });
    if (command === 'pgrep') {
      return { status: 0, stdout: quitRequested ? '' : '4242\n' };
    }
    if (command === 'ps') {
      if (args[3] === 'command=') {
        return { status: 0, stdout: quitRequested ? '' : `${MAIN_COMMAND}\n` };
      }
      return { status: 0, stdout: quitRequested ? '' : '4242\n' };
    }
    if (command === 'lsof') {
      return { status: 0, stdout: '4242\n' };
    }
    if (command === 'osascript') {
      quitRequested = true;
      return { status: 0, stdout: '' };
    }
    if (command === 'open') {
      return { status: 0, stdout: '' };
    }
    return { status: 1, stdout: '' };
  };
  return { run, calls };
}

const probeReady = async () => [{ type: 'page', webSocketDebuggerUrl: 'ws://127.0.0.1:9229/devtools/page/1' }];
const noWait = async () => {};

test('devLaunchEnv strips ELECTRON_RUN_AS_NODE and keeps the rest', () => {
  const input = { ELECTRON_RUN_AS_NODE: '1', FOO: 'bar', DSH_MODE: 'dev' };
  const before = { ...input };
  const cleaned = devLaunchEnv(input);

  assert.equal(Object.hasOwn(cleaned, 'ELECTRON_RUN_AS_NODE'), false);
  assert.equal(cleaned.FOO, 'bar');
  assert.equal(cleaned.DSH_MODE, 'dev');
  // The input object itself must not be modified.
  assert.deepEqual(input, before);
  // The result is a copy, not the same object.
  assert.notEqual(cleaned, input);
  cleaned.EXTRA = 'x';
  assert.equal(Object.hasOwn(input, 'EXTRA'), false);
});

test('devLaunchEnv defaults to the current environment', () => {
  const previous = process.env.ELECTRON_RUN_AS_NODE;
  try {
    process.env.ELECTRON_RUN_AS_NODE = '1';
    const cleaned = devLaunchEnv();
    assert.equal(Object.hasOwn(cleaned, 'ELECTRON_RUN_AS_NODE'), false);
    assert.equal(typeof cleaned.PATH, 'string');
  } finally {
    if (previous === undefined) delete process.env.ELECTRON_RUN_AS_NODE;
    else process.env.ELECTRON_RUN_AS_NODE = previous;
  }
});

test('a successful restart launches the Dev app without ELECTRON_RUN_AS_NODE', async () => {
  const { run, calls } = stubRun();
  const previous = process.env.ELECTRON_RUN_AS_NODE;
  process.env.ELECTRON_RUN_AS_NODE = '1';
  process.env.DSH_TEST_SENTINEL = 'kept';
  try {
    const result = await restartDevApp({ run, probePort: probeReady, sleep: noWait });

    assert.deepEqual({ restarted: result.restarted, reason: result.reason }, { restarted: true, reason: undefined });
    const openCalls = calls.filter(call => call.command === 'open');
    assert.equal(openCalls.length, 1, 'exactly one launch, no retries');
    assert.deepEqual(openCalls[0].args, ['-a', 'OmniMux Dev']);
    assert.equal(Object.hasOwn(openCalls[0].env, 'ELECTRON_RUN_AS_NODE'), false,
      'the launch environment must not carry the Agent shell\'s ELECTRON_RUN_AS_NODE');
    assert.equal(openCalls[0].env.DSH_TEST_SENTINEL, 'kept',
      'other variables keep their terminal launch semantics');
  } finally {
    delete process.env.DSH_TEST_SENTINEL;
    if (previous === undefined) delete process.env.ELECTRON_RUN_AS_NODE;
    else process.env.ELECTRON_RUN_AS_NODE = previous;
  }
});

test('a refused graceful quit never reaches the launch step', async () => {
  const calls = [];
  const run = (command, args, options = {}) => {
    calls.push({ command, args, env: options.env });
    if (command === 'pgrep') return { status: 0, stdout: '4242\n' };
    if (command === 'ps') {
      return { status: 0, stdout: args[3] === 'command=' ? `${MAIN_COMMAND}\n` : '4242\n' };
    }
    if (command === 'lsof') return { status: 0, stdout: '4242\n' };
    if (command === 'osascript') return { status: 1, stdout: '' }; // quit not accepted
    return { status: 1, stdout: '' };
  };

  const result = await restartDevApp({ run, probePort: probeReady, sleep: noWait });

  assert.deepEqual(result, { restarted: false, reason: 'quit-request-failed', detail: '优雅退出请求未被接受，已放弃重启' });
  assert.equal(calls.some(call => call.command === 'open'), false);
});
