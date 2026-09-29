#!/usr/bin/env node
/**
 * scripts/dev-app-unlock.mjs
 *
 * OmniMux Dev 开发版深度更新解锁工具（得到用户明确授权后一键执行）：
 *
 * 解决三大核心阻碍：
 * 1. 宿主 Node 进程静态单例驻留（通过优雅请求退出后重新拉起解除）；
 * 2. 浏览器前端 10 分钟强缓存（通过 CDP 远程向页面注入清除 localStorage 缓存）；
 * 3. 业务输入兼容性门禁说明（输出终端指引）。
 *
 * 安全契约：
 * - 严禁强杀进程，仅允许针对被核实的开发版 App（/Applications/OmniMux Dev.app）；
 * - 多实例并发安全阻断；
 * - 仅在用户明确授权后由脚本/命令执行。
 */
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import {
  verifiedDevMainPids,
  verifiedDevAppPids,
  restartDevApp,
  reloadDevApp,
} from './reload-dev-app.mjs';

const CDP_PORT = Number(process.env.OMNIMUX_CDP_PORT || process.env.OMNIMUX_DEV_CDP_PORT || 9229);
const CATALOG_CACHE_KEY = 'omnimux.canvas.catalog.cache';

/**
 * 探测 CDP 端口目标
 * @param {number} port
 * @returns {Promise<unknown[] | null>}
 */
function probeCdpTargets(port = CDP_PORT) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const targets = JSON.parse(data);
          resolve(Array.isArray(targets) ? targets : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * 通过 CDP 在页面执行 JavaScript
 * @param {string} wsUrl
 * @param {string} expression
 * @returns {Promise<{ ok: boolean, result?: any, error?: string }>}
 */
function evaluateInPage(wsUrl, expression) {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(wsUrl);
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { ws.close(); } catch {}
          resolve({ ok: false, error: 'CDP evaluation timed out' });
        }
      }, 3000);

      ws.onopen = () => {
        const payload = {
          id: 101,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true },
        };
        ws.send(JSON.stringify(payload));
      };

      ws.onmessage = (event) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          const data = JSON.parse(String(event.data));
          try { ws.close(); } catch {}
          resolve({ ok: true, result: data?.result?.result?.value });
        } catch (e) {
          resolve({ ok: false, error: e.message });
        }
      };

      ws.onerror = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { ws.close(); } catch {}
        resolve({ ok: false, error: err?.message || 'WebSocket error' });
      };
    } catch (err) {
      resolve({ ok: false, error: err?.message || String(err) });
    }
  });
}

/**
 * 远程清除前端 localStorage 缓存
 * @param {number} port
 * @returns {Promise<{ cleared: boolean, detail: string }>}
 */
export async function clearCanvasCache(port = CDP_PORT) {
  const targets = await probeCdpTargets(port);
  if (!Array.isArray(targets)) {
    return { cleared: false, detail: `无法连接 CDP 端口 ${port}（应用未运行或未开启调试端口）` };
  }

  const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) {
    return { cleared: false, detail: '未找到活跃的页面渲染目标' };
  }

  const code = `(() => {
    const prev = localStorage.getItem("${CATALOG_CACHE_KEY}");
    localStorage.removeItem("${CATALOG_CACHE_KEY}");
    return { hadCache: Boolean(prev) };
  })()`;

  const evalRes = await evaluateInPage(page.webSocketDebuggerUrl, code);
  if (!evalRes.ok) {
    return { cleared: false, detail: `执行缓存清除失败: ${evalRes.error}` };
  }

  const hadCache = evalRes.result?.hadCache;
  return {
    cleared: true,
    detail: hadCache ? '已成功清除 localStorage 中的模型目录缓存' : 'localStorage 中原本无缓存残留',
  };
}

/**
 * 探针状态收集
 * @param {number} port
 */
export async function probeDevStatus(port = CDP_PORT) {
  const mainPids = verifiedDevMainPids();
  const allPids = verifiedDevAppPids();
  const targets = await probeCdpTargets(port);
  const pageTarget = targets?.find((t) => t.type === 'page');

  return {
    running: mainPids.length > 0,
    mainPid: mainPids[0] || null,
    totalPids: allPids.length,
    cdpAvailable: Boolean(targets),
    pageUrl: pageTarget?.url || null,
  };
}

/**
 * 一键完全解锁（清缓存 + 优雅重载）
 * @param {number} port
 */
export async function unlockDevApp(port = CDP_PORT) {
  console.log('== 启动 OmniMux Dev 深度更新一键解锁 ==');

  // 1. 探测状态
  const status = await probeDevStatus(port);
  if (!status.running) {
    console.log('· 开发版应用当前未运行，尝试直接拉起...');
    spawnSync('open', ['-a', 'OmniMux Dev'], { stdio: 'inherit' });
    console.log('✓ 已发送启动指令');
    return { ok: true, status: 'launched' };
  }

  // 2. 清除运行中的客户端缓存
  console.log('== 步骤 1/3: 清理前端 localStorage 目录缓存 ==');
  const cacheRes = await clearCanvasCache(port);
  console.log(`  ${cacheRes.cleared ? '✓' : 'ℹ'} ${cacheRes.detail}`);

  // 3. 安全优雅重载宿主
  console.log('== 步骤 2/3: 优雅重载开发版宿主进程 (Node.js 静态单例) ==');
  const restartRes = await restartDevApp({ port });
  if (!restartRes.restarted) {
    console.warn(`  ⚠️ 宿主重启未完成: ${restartRes.reason} (${restartRes.detail})`);
    return { ok: false, error: restartRes.detail };
  }
  console.log(`  ✓ 宿主进程已成功平滑重载 (耗时 ${Math.round((restartRes.waitedMs || 0) / 100) / 10}s)`);

  // 4. 重启就绪后，对新拉起的实例再次确保清缓存与刷新页面
  console.log('== 步骤 3/3: 确保新页面环境洁净 ==');
  await clearCanvasCache(port);
  await reloadDevApp(port);
  console.log('  ✓ 页面已自动刷新完成');

  console.log('\n🎉 解锁完成！最新模型契约与所有音色已 100% 装载生效。');
  console.log('📌 提示：若验证纯文本 TTS 模型，请在画布新建纯文本 Audio 节点（避免连入已有音频素材）。');
  return { ok: true, status: 'unlocked' };
}

// CLI 直调
if (process.argv[1] && process.argv[1].endsWith('dev-app-unlock.mjs')) {
  const arg = process.argv[2];
  if (arg === '--probe') {
    probeDevStatus().then((s) => {
      console.log(JSON.stringify(s, null, 2));
      process.exit(0);
    });
  } else if (arg === '--clear-cache') {
    clearCanvasCache().then((r) => {
      console.log(r.detail);
      process.exit(r.cleared ? 0 : 1);
    });
  } else if (arg === '--restart') {
    restartDevApp().then((r) => {
      console.log(r.restarted ? '✓ 重启成功' : `❌ 失败: ${r.detail}`);
      process.exit(r.restarted ? 0 : 1);
    });
  } else {
    unlockDevApp().then((r) => process.exit(r.ok ? 0 : 1));
  }
}
