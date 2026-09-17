import http from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');

// 1. 读取验收页面
const demoHtml = readFileSync(join(repoRoot, 'tmp/inspiration-generating-shimmer-demo.html'), 'utf8');

// 2. 启动临时 HTTP 服务器
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(demoHtml);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const pageUrl = `http://127.0.0.1:${port}/`;
console.log(`[1/4] 测试页面就绪: ${pageUrl}`);

// 3. 启动无头 Chrome
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cdpPort = 9400 + Math.floor(Math.random() * 500);
console.log(`[2/4] 启动无头 Chrome 实例 (CDP 端口: ${cdpPort})...`);
const chromeProc = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${cdpPort}`,
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=1280,800',
  pageUrl,
]);

let killed = false;
function cleanup() {
  if (killed) return;
  killed = true;
  chromeProc.kill('SIGKILL');
  server.close();
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

await new Promise((r) => setTimeout(r, 1200));

// 4. 连接 CDP 调试协议
const listRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
const targets = await listRes.json();
const pageTarget = targets.find((t) => t.type === 'page');
assert.ok(pageTarget, '必须能找到 Chrome page 调试目标');

const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let msgId = 1;
function sendCdp(method, params = {}) {
  const id = msgId++;
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === id) {
        ws.removeEventListener('message', handler);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

console.log('[3/4] 验证 DOM 挂载与几何特征...');
await sendCdp('Page.enable');
await sendCdp('DOM.enable');

// 校验优化后卡片具有 OrganicShimmer
const evalRes = await sendCdp('Runtime.evaluate', {
  expression: `(() => {
    const afterShimmer = document.querySelector('.after-content .wf-organic-shimmer');
    const afterField = document.querySelector('.after-content .wf-organic-shimmer__field');
    const afterDistort = document.querySelector('.after-content .wf-organic-shimmer__distortion');
    const afterBadge = document.querySelector('.column:nth-child(2) .platform-badge');
    const centerButtons = document.querySelectorAll('.after-content button, .after-content .before-status-pill');
    return {
      hasShimmer: Boolean(afterShimmer),
      hasField: Boolean(afterField),
      hasDistort: Boolean(afterDistort),
      hasBadge: Boolean(afterBadge),
      centerButtonCount: centerButtons.length,
    };
  })()`,
  returnByValue: true,
});

const check = evalRes.result.value;
console.log('DOM 状态校验结果:', check);
assert.equal(check.hasShimmer, true, '优化后卡片必须挂载 OrganicShimmer');
assert.equal(check.hasField, true, '优化后卡片必须包含微光底色场');
assert.equal(check.hasDistort, true, '优化后卡片必须包含流体波浪折射层');
assert.equal(check.hasBadge, true, '右上角必须保留来源平台标签');
assert.equal(check.centerButtonCount, 0, '中间区域必须彻底移除文本按钮');

// 截取全屏验证留证
console.log('[4/4] 捕获页面留证截图...');
const screenshotRes = await sendCdp('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
const evidencePath = join(repoRoot, 'docs/evidence/inspiration-import-generating-shimmer.jpg');
writeFileSync(evidencePath, Buffer.from(screenshotRes.data, 'base64'));
console.log(`✓ 浏览器真实验收截图已保存: ${evidencePath}`);

cleanup();
console.log('✅ Chrome 浏览器端到端实测全部通过！');
process.exit(0);
