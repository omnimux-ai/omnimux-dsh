import http from 'node:http';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('===> 1. 准备启动技能市场试用预填实机演示服务...');
const demoHtmlPath = join(rootDir, 'docs/demos/skill-try-prefill-demo.html');
assert.ok(fs.existsSync(demoHtmlPath), '演示页面必须存在');
const demoHtml = fs.readFileSync(demoHtmlPath, 'utf8');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(demoHtml);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const pageUrl = `http://127.0.0.1:${port}/`;
console.log(`[1/5] 测试服务就绪: ${pageUrl}`);

const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cdpPort = 9500 + Math.floor(Math.random() * 400);
console.log(`[2/5] 启动无头 Chrome 浏览器 (CDP 端口: ${cdpPort})...`);
const chromeProc = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${cdpPort}`,
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=1280,900',
  pageUrl,
]);
chromeProc.on('error', (err) => {
  console.error(`无法启动 Chrome (${chromePath}): ${err.message}`);
  cleanup();
  process.exit(1);
});

let killed = false;
function cleanup() {
  if (killed) return;
  killed = true;
  try { chromeProc.kill('SIGKILL'); } catch {}
  try { server.close(); } catch {}
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

await new Promise((r) => setTimeout(r, 1200));

console.log('[3/5] 连接 CDP 调试通道...');
let targets = null;
for (let attempt = 1; attempt <= 20; attempt++) {
  try {
    const listRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
    targets = await listRes.json();
    if (targets && targets.length > 0) break;
  } catch (err) {
    await new Promise((r) => setTimeout(r, 300));
  }
}
assert.ok(targets, 'Chrome 必须在超时内就绪');
const pageTarget = targets.find((t) => t.type === 'page');
assert.ok(pageTarget, '必须找到页面目标');

const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let msgId = 1;
function sendCdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    const handler = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.id === id) {
          ws.removeEventListener('message', handler);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch (e) {
        reject(e);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function captureScreenshot(filepath) {
  const { data } = await sendCdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(filepath, Buffer.from(data, 'base64'));
  console.log(`📸 截图已留存: ${filepath}`);
}

async function evalInPage(expression) {
  const res = await sendCdp('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return res.result?.value;
}

const evidenceDir = join(rootDir, 'docs/evidence/skill-try-prefill');
fs.mkdirSync(evidenceDir, { recursive: true });

console.log('[4/5] 执行核心交互验证链路...');
await sendCdp('Page.enable');
await sendCdp('Runtime.enable');
await sendCdp('DOM.enable');

// 阶段 1: 初始页面渲染
await captureScreenshot(join(evidenceDir, '01-initial-state.png'));

// 阶段 2: 点击「短视频爆款复刻」去对话中试试
console.log('-> 模拟用户点击第一个技能「短视频爆款复刻」去对话中试试...');
const firstClickResult = await evalInPage(`
  (() => {
    const btns = Array.from(document.querySelectorAll('.btn-primary'));
    const tryBtn = btns.find(b => b.textContent.includes('去对话中试试'));
    if (!tryBtn) return { ok: false, error: '找不到试用按钮' };
    tryBtn.click();
    const textarea = document.getElementById('composer-textarea');
    return {
      ok: true,
      val: textarea.value,
      focused: document.activeElement === textarea,
    };
  })()
`);
assert.equal(firstClickResult.ok, true);
assert.equal(firstClickResult.val, '/viral-video-replication ');
assert.equal(firstClickResult.focused, true);
await captureScreenshot(join(evidenceDir, '02-try-first-skill.png'));

// 阶段 3: 模拟用户在指令后输入提示词
console.log('-> 模拟用户在指令后输入业务需求...');
await evalInPage(`
  (() => {
    const textarea = document.getElementById('composer-textarea');
    textarea.value = '/viral-video-replication 请帮我解构这段美食探店视频';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  })()
`);
await captureScreenshot(join(evidenceDir, '03-user-typed-prompt.png'));

// 阶段 4: 模拟用户换选第二个技能「视频钩子拆解分析」，测试智能平滑替换
console.log('-> 模拟用户切换为第二个技能「视频钩子拆解分析」...');
const secondClickResult = await evalInPage(`
  (() => {
    const cards = Array.from(document.querySelectorAll('.skill-card'));
    const hookCard = cards.find(c => c.textContent.includes('视频钩子拆解分析'));
    if (!hookCard) return { ok: false, error: '找不到第二个技能卡片' };
    const btn = hookCard.querySelector('.btn-primary');
    btn.click();
    const textarea = document.getElementById('composer-textarea');
    return {
      ok: true,
      val: textarea.value,
      focused: document.activeElement === textarea,
    };
  })()
`);
assert.equal(secondClickResult.ok, true);
assert.equal(secondClickResult.val, '/video-hook-analysis 请帮我解构这段美食探店视频');
assert.equal(secondClickResult.focused, true);
await captureScreenshot(join(evidenceDir, '04-smooth-replace-skill.png'));

// 阶段 5: 产出结构化验证报告
const report = {
  timestamp: new Date().toISOString(),
  feature: 'skill-try-prefill-composer',
  environment: 'Worktree Isolated Web QA (Headless Chrome)',
  evidence: [
    '01-initial-state.png',
    '02-try-first-skill.png',
    '03-user-typed-prompt.png',
    '04-smooth-replace-skill.png',
  ],
  verifications: [
    {
      scenario: '点击技能卡片「去对话中试试」自动预填技能指令',
      status: firstClickResult.val === '/viral-video-replication ' ? 'PASSED' : 'FAILED',
      expected: '/viral-video-replication ',
      actual: firstClickResult.val,
    },
    {
      scenario: '输入框自动获得焦点且光标就绪',
      status: firstClickResult.focused === true ? 'PASSED' : 'FAILED',
      expected: true,
      actual: firstClickResult.focused,
    },
    {
      scenario: '切换其他技能时智能平滑替换指令且保留用户既有提示词',
      status: secondClickResult.val === '/video-hook-analysis 请帮我解构这段美食探店视频' ? 'PASSED' : 'FAILED',
      expected: '/video-hook-analysis 请帮我解构这段美食探店视频',
      actual: secondClickResult.val,
    },
  ],
};

fs.writeFileSync(
  join(evidenceDir, 'verification-report.json'),
  JSON.stringify(report, null, 2),
  'utf8',
);

console.log('[5/5] ✅ 全部实机预演验证已 100% 成功通过！');
cleanup();
process.exit(0);
