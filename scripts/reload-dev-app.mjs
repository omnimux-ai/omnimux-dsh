#!/usr/bin/env node
/**
 * scripts/reload-dev-app.mjs
 * 
 * 自动探测本地运行的 OmniMux Dev App（默认 CDP 端口 9229，或环境变量 OMNIMUX_CDP_PORT），
 * 通过 CDP WebSocket 发送 Page.reload，实现桌面端应用的静默无刷新热重载。
 * 若应用未运行或无页面目标，静默返回不阻断流程。
 */
import http from 'node:http';

const CDP_PORT = Number(process.env.OMNIMUX_CDP_PORT || process.env.OMNIMUX_DEV_CDP_PORT || 9229);

export async function reloadDevApp(port = CDP_PORT) {
  try {
    const targets = await new Promise((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/json`, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(1500, () => req.destroy(new Error('timeout')));
    });

    if (!Array.isArray(targets)) {
      return { reloaded: false, reason: 'invalid-targets' };
    }

    const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (!page) {
      return { reloaded: false, reason: 'no-page-target' };
    }

    const wsUrl = page.webSocketDebuggerUrl;
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({ id: 1, method: 'Page.reload' }));
        setTimeout(() => {
          ws.close();
          resolve();
        }, 300);
      };
      ws.onerror = (err) => {
        try { ws.close(); } catch {}
        reject(err);
      };
      setTimeout(() => {
        try { ws.close(); } catch {}
        resolve();
      }, 2000);
    });

    return { reloaded: true, title: page.title || page.url };
  } catch (err) {
    return { reloaded: false, reason: err.message };
  }
}

if (process.argv[1] && process.argv[1].endsWith('reload-dev-app.mjs')) {
  try {
    const result = await reloadDevApp();
    if (result.reloaded) {
      console.log(`⚡ [Live Reload] 已通知本地 Dev 桌面应用完成界面刷新 (${result.title})`);
    } else {
      // 未开应用属正常状态，不报错
      console.log(`ℹ️ [Live Reload] Dev 应用未运行或无可用窗口 (${result.reason})，跳过刷新`);
    }
  } catch (err) {
    console.log(`ℹ️ [Live Reload] 跳过自动刷新: ${err.message}`);
  }
}
