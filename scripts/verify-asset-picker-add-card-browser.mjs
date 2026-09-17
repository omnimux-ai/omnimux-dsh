import http from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');

// 1. 读取高保真验收页面
const demoHtml = readFileSync(join(repoRoot, 'tmp/asset-picker-add-card-demo.html'), 'utf8');

// 2. 启动临时 HTTP 服务器
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(demoHtml);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const pageUrl = `http://127.0.0.1:${port}/`;
console.log(`[1/5] 测试页面就绪: ${pageUrl}`);

// 3. 启动无头 Chrome
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cdpPort = 9300 + Math.floor(Math.random() * 500);
console.log(`[2/5] 启动无头 Chrome 实例 (CDP 调试端口: ${cdpPort})...`);
const chromeProc = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${cdpPort}`,
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=1440,900',
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
  return new Promise((resolve, reject) => {
    const id = msgId++;
    const timer = setTimeout(() => reject(new Error(`CDP ${method} 超时`)), 8000);
    const listener = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === id) {
        clearTimeout(timer);
        ws.removeEventListener('message', listener);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', listener);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await sendCdp('Page.enable');
await sendCdp('DOM.enable');
await new Promise((r) => setTimeout(r, 500));

// 5. 验证初始网格首位是否为添加卡片
console.log('[3/5] 验证各分类网格首位呈现「添加资产」卡片...');
const evalGrid = await sendCdp('Runtime.evaluate', {
  expression: `(() => {
    const grid = document.getElementById('assetGrid');
    const firstCard = grid.firstElementChild;
    const isAddCard = firstCard.classList.contains('card-add');
    const title = firstCard.querySelector('.card-title')?.innerText;
    return {
      totalCards: grid.children.length,
      isAddCard,
      title
    };
  })()`,
  returnByValue: true,
});

const gridState = evalGrid.result.value;
console.log('网格首位卡片检查结果:', gridState);
assert.equal(gridState.isAddCard, true, '网格第 1 项必须为添加资产卡片');
assert.equal(gridState.title, '添加资产', '首位卡片标题必须为“添加资产”');

// 6. 点击添加卡片触发连携唤起
console.log('[4/5] 点击首位卡片，触发连携拉起与自动回填...');
await sendCdp('Runtime.evaluate', {
  expression: `(() => {
    const addCard = document.querySelector('.card-add');
    addCard.click();
  })()`,
  returnByValue: true,
});

await new Promise((r) => setTimeout(r, 800));

// 7. 捕获真实截图证据
console.log('[5/5] 捕获真实浏览器高保真实操截图...');
const screenshotRes = await sendCdp('Page.captureScreenshot', { format: 'png' });
const screenshotBuffer = Buffer.from(screenshotRes.data, 'base64');
const screenshotPath = join(repoRoot, 'docs/evidence/asset-picker-add-card-verified.png');
writeFileSync(screenshotPath, screenshotBuffer);
console.log(`✔ 专属实操截图已成功生成并持久化: ${screenshotPath}`);

// 8. 确认添加资产并自动勾选
const submitRes = await sendCdp('Runtime.evaluate', {
  expression: `(() => {
    submitAddAsset();
    const grid = document.getElementById('assetGrid');
    const meta = document.getElementById('footerMeta').innerText;
    const firstAssetCard = grid.children[1]; // 第 0 个是添加卡片，第 1 个是刚添加的新资产
    const isSelected = firstAssetCard.classList.contains('selected');
    return {
      newAssetTitle: firstAssetCard.querySelector('.card-title')?.innerText,
      isSelected,
      meta
    };
  })()`,
  returnByValue: true,
});

const submitState = submitRes.result.value;
console.log('入库后自动勾选与配额联动结果:', submitState);
assert.equal(submitState.isSelected, true, '新增资产必须自动处于勾选状态');
assert.ok(submitState.meta.includes('已选 1 项'), '底部栏必须同步更新为已选 1 项');

console.log('🎉 真实 Chrome 浏览器全流程端到端自动化验收 100% 成功！');
cleanup();
process.exit(0);
