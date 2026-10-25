import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createComfyBackendService } from './service.ts';
import { resolveComfyBackendTarget } from './plan.ts';

/**
 * ownership 行为测试：宿主退出时关闭后端、孤儿后端回收、stop 清理 owner。
 * 全部用假的 process.kill / spawn / fetch / 端口探测，不碰真实进程与端口。
 *
 * 注意：process.kill 的 monkeypatch 只影响本测试进程；node:test 同文件内串行执行。
 * spawn 后的探活必须成功（service 轮询 READY_TIMEOUT 才会报超时），所以 fetch 在
 * spawn 发生后要答 ok ——「后端起来了」。
 */
const FIXED_TARGET = resolveComfyBackendTarget('darwin', 'arm64').target;
const OWNER_FILE = 'backend-owner.json';

/** 造一个装好状态的临时安装根。 */
function withRoot({ owner = null, state = null } = {}) {
  const dataRoot = mkdtempSync(join(tmpdir(), 'comfy-owner-'));
  const root = join(dataRoot, 'comfyui-backend');
  mkdirSync(join(root, 'logs'), { recursive: true });
  writeFileSync(
    join(root, '.ready'),
    JSON.stringify({
      variant: FIXED_TARGET.variant,
      comfyui: { commit: FIXED_TARGET.comfyui.commit },
      python: FIXED_TARGET.python.version,
      torch: FIXED_TARGET.torch.version,
    }),
  );
  if (owner) writeFileSync(join(root, OWNER_FILE), JSON.stringify(owner));
  if (state) writeFileSync(join(root, 'install-state.json'), JSON.stringify(state));
  return { root, dataRoot };
}

/**
 * 假 fetch：
 * - alreadyReady=true：探活始终成功（端口上已有一个活着的后端）。
 * - alreadyReady=false：spawn 发生前探活失败、spawn 后探活成功（我们拉起来了）。
 */
function makeFetch({ alreadyReady, spawned }) {
  return async () => {
    if (alreadyReady || (spawned && spawned.length > 0)) return { ok: true, status: 200 };
    throw new Error('connect refused');
  };
}

/** 假 spawn：记录调用，返回带 pid 的伪 child。 */
function makeSpawn(pid = 424242) {
  const spawned = [];
  const spawnImpl = (command, args) => {
    spawned.push({ command, args });
    return {
      pid,
      stdout: { on() {} },
      stderr: { on() {} },
      on() {},
      unref() {},
    };
  };
  return { spawnImpl, spawned };
}

/** 假 process.kill：signal 0 按 alive 集合报活；其它信号记录并标记目标死亡。 */
function patchKill(alive, killed) {
  const real = process.kill;
  process.kill = (pid, signal = 0) => {
    if (signal === 0 || signal === '0') {
      if (!alive.has(pid)) {
        const error = new Error(`ESRCH ${pid}`);
        error.code = 'ESRCH';
        throw error;
      }
      return true;
    }
    killed.push({ pid, signal });
    alive.delete(pid);
    return true;
  };
  return () => {
    process.kill = real;
  };
}

/** 触发注册到本进程上的退出清理（与 Node 'exit' 语义一致：同步、立即执行）。 */
function emitExit() {
  process.emit('exit', 0);
}

test('spawn 启动登记 owner，宿主退出时 kill 后端并清掉 owner 文件', async () => {
  const { root, dataRoot } = withRoot();
  const alive = new Set([process.pid]);
  const killed = [];
  const restore = patchKill(alive, killed);
  try {
    const { spawnImpl, spawned } = makeSpawn(424242);
    const service = createComfyBackendService({
      dataRoot,
      target: FIXED_TARGET,
      fetchImpl: makeFetch({ alreadyReady: false, spawned }),
      portIsFreeImpl: async () => true,
      spawnImpl,
    });
    const status = await service.start();
    assert.equal(status.state, 'ready');
    assert.equal(spawned.length, 1);
    alive.add(424242); // 后端已活（真实世界它是真的进程）

    const owner = JSON.parse(readFileSync(join(root, OWNER_FILE), 'utf8'));
    assert.equal(owner.hostPid, process.pid);
    assert.equal(owner.backendPid, 424242);

    emitExit();
    assert.deepEqual(killed, [{ pid: 424242, signal: 'SIGTERM' }]);
    assert.equal(existsSync(join(root, OWNER_FILE)), false);
    service.dispose();
  } finally {
    restore();
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test('退出钩子：owner 是别的宿主时不杀后端、不清文件', async () => {
  const { root, dataRoot } = withRoot({
    owner: { hostPid: 111111, backendPid: 424242, claimedAt: 1 },
  });
  const alive = new Set([process.pid, 111111, 424242]);
  const killed = [];
  const restore = patchKill(alive, killed);
  try {
    const service = createComfyBackendService({
      dataRoot,
      target: FIXED_TARGET,
      fetchImpl: makeFetch({ alreadyReady: true }),
      portIsFreeImpl: async () => true,
      spawnImpl: makeSpawn().spawnImpl,
    });
    // 探活命中 → ready，不 spawn；别的宿主的 owner 保持原样。
    const status = await service.start();
    assert.equal(status.state, 'ready');
    emitExit();
    assert.deepEqual(killed, []);
    assert.equal(existsSync(join(root, OWNER_FILE)), true);
    service.dispose();
  } finally {
    restore();
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test('孤儿回收：旧宿主已死但后端活着时，kill 旧后端、重启并登记新 owner', async () => {
  const { root, dataRoot } = withRoot({
    owner: { hostPid: 111111, backendPid: 424242, claimedAt: 1 },
  });
  const alive = new Set([process.pid, 424242]); // 111111 已死
  const killed = [];
  const restore = patchKill(alive, killed);
  try {
    const { spawnImpl, spawned } = makeSpawn(777777);
    const service = createComfyBackendService({
      dataRoot,
      target: FIXED_TARGET,
      fetchImpl: makeFetch({ alreadyReady: false, spawned }),
      portIsFreeImpl: async () => true,
      spawnImpl,
    });
    const status = await service.start();
    // 先 reap：kill 424242 并等它退出（假 kill 立即移除 alive），再探活失败 → spawn 777777。
    assert.equal(status.state, 'ready');
    assert.deepEqual(killed.filter((k) => k.pid === 424242 && k.signal === 'SIGTERM').length, 1);
    assert.equal(spawned.length, 1);
    const owner = JSON.parse(readFileSync(join(root, OWNER_FILE), 'utf8'));
    assert.equal(owner.hostPid, process.pid);
    assert.equal(owner.backendPid, 777777);
    service.dispose();
  } finally {
    restore();
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test('孤儿回收：owner 宿主还活着时复用后端，不 spawn 不 kill', async () => {
  const { root, dataRoot } = withRoot({
    owner: { hostPid: 111111, backendPid: 424242, claimedAt: 1 },
  });
  const alive = new Set([process.pid, 111111, 424242]); // 旧宿主还活着
  const killed = [];
  const restore = patchKill(alive, killed);
  try {
    const { spawnImpl, spawned } = makeSpawn(777777);
    const service = createComfyBackendService({
      dataRoot,
      target: FIXED_TARGET,
      fetchImpl: makeFetch({ alreadyReady: true }),
      portIsFreeImpl: async () => true,
      spawnImpl,
    });
    const status = await service.start();
    assert.equal(status.state, 'ready');
    assert.equal(spawned.length, 0);
    assert.deepEqual(killed, []);
    const owner = JSON.parse(readFileSync(join(root, OWNER_FILE), 'utf8'));
    assert.equal(owner.hostPid, 111111);
    service.dispose();
  } finally {
    restore();
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test('stop()：杀掉 pid 并清掉 owner 文件', async () => {
  const { root, dataRoot } = withRoot({
    owner: { hostPid: process.pid, backendPid: 424242, claimedAt: 1 },
    state: { state: 'ready', stage: null, percent: 100, message: '', error: null, pid: 424242, updatedAt: 1, failure: null },
  });
  const alive = new Set([process.pid, 424242]);
  const killed = [];
  const restore = patchKill(alive, killed);
  try {
    const service = createComfyBackendService({
      dataRoot,
      target: FIXED_TARGET,
      fetchImpl: makeFetch({ alreadyReady: true }),
      portIsFreeImpl: async () => true,
      spawnImpl: makeSpawn().spawnImpl,
    });
    const status = await service.stop();
    assert.equal(status.state, 'installed');
    assert.deepEqual(killed, [{ pid: 424242, signal: 'SIGTERM' }]);
    assert.equal(existsSync(join(root, OWNER_FILE)), false);
    service.dispose();
  } finally {
    restore();
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test('dispose()：摘除退出钩子后，exit 不再杀后端（复用语义）', async () => {
  const { root, dataRoot } = withRoot();
  const alive = new Set([process.pid]);
  const killed = [];
  const restore = patchKill(alive, killed);
  try {
    const { spawnImpl, spawned } = makeSpawn(424242);
    const service = createComfyBackendService({
      dataRoot,
      target: FIXED_TARGET,
      fetchImpl: makeFetch({ alreadyReady: false, spawned }),
      portIsFreeImpl: async () => true,
      spawnImpl,
    });
    await service.start(); // spawn + 安装钩子
    alive.add(424242);
    service.dispose(); // 摘钩子（热重载/卸载路径）
    emitExit();
    assert.deepEqual(killed, []); // 没杀：复用而非杀
    assert.equal(existsSync(join(root, OWNER_FILE)), true);
  } finally {
    restore();
    rmSync(dataRoot, { recursive: true, force: true });
  }
});
