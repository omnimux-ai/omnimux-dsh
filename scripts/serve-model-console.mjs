#!/usr/bin/env node
/**
 * scripts/serve-model-console.mjs
 *
 * 中枢模型检索面板 · 实时服务。
 *
 * 每次 HTTP 请求都重新调用 `collectConsoleData()` 现读磁盘真源并渲染，因此浏览器刷新即最新，
 * 不存在生成快照的陈旧问题。服务只绑定回环地址、只读、不写任何文件、不访问外网。
 *
 * 环境变量：
 *   PORT  监听端口，默认 45130；传 0 时由系统分配空闲端口（启动日志会打印实际地址）。
 *
 * 用法：pnpm models:console:serve
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { collectConsoleData, renderConsoleHtml } from './generate-model-console.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const HOST = '127.0.0.1';
const requestedPort = Number.parseInt(process.env.PORT ?? '45130', 10);
const PORT = Number.isInteger(requestedPort) && requestedPort >= 0 && requestedPort <= 65535 ? requestedPort : 45130;

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}`);

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end('ok');
    return;
  }

  // 在线测试接口：处理 POST /api/test-model
  if (req.method === 'POST' && url.pathname === '/api/test-model') {
    let bodyText = '';
    req.on('data', (chunk) => {
      bodyText += chunk;
    });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(bodyText || '{}');
        const bust = `?fresh=${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const testModuleUrl = `${pathToFileURL(path.join(rootDir, 'scripts/model-test-sample.mjs')).href}${bust}`;
        const { executeModelTest } = await import(testModuleUrl);

        const result = await executeModelTest(payload);
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store, no-cache',
          'access-control-allow-origin': '*',
        });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error(`[${stamp()}] 测试处理异常:`, err);
        res.writeHead(500, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        });
        res.end(JSON.stringify({
          ok: false,
          error: `失败错误原因：服务处理异常（${err instanceof Error ? err.message : String(err)}）`,
        }));
      }
    });
    return;
  }

  // 跨域预检
  if (req.method === 'OPTIONS' && url.pathname === '/api/test-model') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    res.end();
    return;
  }

  if (url.pathname !== '/' && url.pathname !== '/index.html') {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end('not found');
    return;
  }

  try {
    const startedAt = Date.now();
    const data = await collectConsoleData();
    const html = renderConsoleHtml(data, { live: true });
    const elapsed = Date.now() - startedAt;

    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      // 实时面板禁止任何层级的缓存，刷新必须回源。
      'cache-control': 'no-store, no-cache, must-revalidate',
      pragma: 'no-cache',
      expires: '0',
    });
    res.end(html);

    const s = data.stats;
    console.log(
      `[${stamp()}] 渲染完成 ${elapsed}ms　模型 ${s.models}（已就绪 ${s.ready}）`
      + `　线路 ${s.groups}　操作 ${s.operations}`,
    );
  } catch (error) {
    console.error(`[${stamp()}] 渲染失败:`, error);
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end(`渲染失败: ${error instanceof Error ? error.message : String(error)}`);
  }
});

server.listen(PORT, HOST, () => {
  const { port } = server.address();
  console.log(`中枢模型检索面板 · 实时服务已启动: http://${HOST}:${port}/`);
  console.log(`  数据真源: ${path.relative(rootDir, path.join(rootDir, 'plugins/omnimux/src/catalog'))}`);
  console.log('  每次打开或刷新都会重新读取配置，无需手动重新生成。');
  console.log('  按 Ctrl+C 停止服务。');
});
