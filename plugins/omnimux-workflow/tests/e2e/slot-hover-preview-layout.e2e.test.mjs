/**
 * 素材卡槽悬浮预览：媒体区与操作区分离、按钮单行且始终留在卡内。
 *
 * 真机路径：画布 harness（真实 CanvasEditor + mock catalog）→ 竖屏参考视频接入
 * vision_chat 的参考视频槽位 → 悬停卡槽 → 读取弹层盒模型。
 * 证据目录：docs/evidence/slot-preview-layout/。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const plugin = join(root, 'plugins/omnimux-workflow');
const evidenceDir = join(root, 'docs/evidence/slot-preview-layout');
const PORT = 4931;
const ORIGIN = `http://localhost:${PORT}`;

/** 宿主令牌缺失时预览卡不得退化为透明：注入与真实宿主等价的 body 令牌。 */
const HOST_TOKENS = 'body{--dsw-alias-bg-elevated:#1c1c1f;--dsw-alias-border-l2:rgba(255,255,255,0.12);--dsw-alias-label-primary:#f5f5f5;--dsw-alias-label-secondary:#a1a1aa;--dsw-alias-label-tertiary:#71717a;--dsw-alias-bg-layer-2:#2c2c2e;--dsw-alias-interactive-bg-hover:rgba(255,255,255,0.08);--dsw-alias-border-l3:rgba(255,255,255,0.2);--dsw-alias-bg-secondary:#222226;--dsw-alias-label-primary-foreground:#fff}';

function runEgo(code) {
  return new Promise((resolveRun, reject) => {
    const delimiter = `EGO_SLOT_PREVIEW_${randomUUID().replaceAll('-', '')}`;
    const child = spawn('/bin/bash', ['-c', `ego-browser nodejs <<'${delimiter}'\n${code}\n${delimiter}`], {
      cwd: root,
      env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH ?? ''}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (exitCode, signal) => resolveRun({ exitCode, signal, stdout, stderr }));
  });
}

async function browserJourney(config) {
  const fs = await import('node:fs/promises');
  const task = await taskSpace(config.taskName);
  try {
    const page = task.page('p1');
    await page.goto(config.origin, { timeout: 20000 });
    await page.waitForSelector('.wf-canvas-root .react-flow', { state: 'visible', timeout: 20000 });
    await page.evaluate((css) => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
      document.body.setAttribute('data-ds-dark-theme', '');
    }, config.tokens);
    // 真实场景：竖屏参考视频接到 vision_chat 的参考视频槽位。
    await page.evaluate((videoUrl) => {
      const store = window.__canvasStore;
      const nodes = store.getState().nodes.map((n) => (n.id === 'n-text'
        ? { ...n, data: { ...n.data, inputBindingVersion: 1, params: { ...n.data.params, operation: 'vision_chat' } } }
        : n));
      nodes.push({
        id: 'n-vsrc', type: 'material', position: { x: -600, y: 300 },
        data: {
          materialType: 'video', label: '参考视频', nodeWidth: 320, selectedTool: 'video-generation',
          inputBindingVersion: 1, params: { model: 'mock-video-720p' }, executionStatus: 'completed',
          mediaAssets: [{ type: 'video', url: videoUrl }],
        },
      });
      store.getState().hydrateGraph(nodes, [...store.getState().edges, { id: 'e-vsrc-text', source: 'n-vsrc', target: 'n-text', type: 'animated' }]);
    }, config.videoUrl);
    await page.click('.react-flow__node[data-id="n-text"]', { label: '选中目标素材节点', timeout: 8000 });
    await page.waitForSelector('.wf-slot-well--filled', { state: 'visible', timeout: 8000 });
    await page.hover('.wf-slot-well--filled', { label: '悬停已填充卡槽', timeout: 8000 });
    await page.waitForSelector('.wf-slot-hover-preview', { state: 'visible', timeout: 8000 });
    await page.waitForFunction(() => {
      const card = document.querySelector('.wf-slot-hover-preview');
      return Boolean(card && card.querySelector('.wf-slot-hover-preview__actions'));
    }, undefined, { timeout: 8000 });
    const geometry = await page.evaluate(() => {
      const card = document.querySelector('.wf-slot-hover-preview');
      const cardBox = card.getBoundingClientRect();
      const style = getComputedStyle(card);
      const buttons = [...card.querySelectorAll('button')].map((b) => {
        const r = b.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, label: b.textContent.trim() };
      });
      const media = card.querySelector('.wf-slot-hover-preview__media');
      const actions = card.querySelector('.wf-slot-hover-preview__actions');
      return {
        hasMediaRegion: Boolean(media),
        hasActionsRegion: Boolean(actions),
        mediaFlexShrink: media ? getComputedStyle(media).flexShrink : null,
        mediaMinHeight: media ? getComputedStyle(media).minHeight : null,
        actionsFlexShrink: actions ? getComputedStyle(actions).flexShrink : null,
        actionsDisplay: actions ? getComputedStyle(actions).display : null,
        background: style.backgroundColor,
        borderWidth: style.borderTopWidth,
        borderColor: style.borderTopColor,
        card: { top: cardBox.top, bottom: cardBox.bottom, left: cardBox.left, right: cardBox.right, height: cardBox.height },
        buttons,
        buttonsInsideCard: buttons.every((b) => b.top >= cardBox.top - 1 && b.bottom <= cardBox.bottom + 1),
        buttonsInsideHorizontally: buttons.every((b) => b.left >= cardBox.left - 1 && b.right <= cardBox.right + 1),
        buttonsSameRow: buttons.length === 2 && Math.abs(buttons[0].top - buttons[1].top) <= 2,
        labels: buttons.map((b) => b.label),
      };
    });
    await fs.mkdir(config.evidenceDir, { recursive: true });
    await page.screenshot({ path: `${config.evidenceDir}/e2e-preview.png`, scale: 'css' });
    await fs.writeFile(`${config.evidenceDir}/e2e-geometry.json`, `${JSON.stringify(geometry, null, 2)}\n`);
    return geometry;
  } finally {
    if (typeof task.finish === 'function') await task.finish({ keep: [] });
  }
}

async function waitForServer(origin, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(origin);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

test('素材卡槽悬浮预览：媒体与操作分区，按钮单行且始终在卡内', async (t) => {
  await mkdir(evidenceDir, { recursive: true });
  const harness = spawn(process.execPath, [join('scripts', 'canvas-harness.mjs'), '--port', String(PORT)], {
    cwd: plugin,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let harnessLog = '';
  harness.stdout.on('data', (chunk) => { harnessLog += chunk; });
  harness.stderr.on('data', (chunk) => { harnessLog += chunk; });
  t.after(() => { harness.kill('SIGTERM'); });

  const ready = await waitForServer(ORIGIN);
  await writeFile(join(evidenceDir, 'e2e-harness.log'), harnessLog);
  assert.ok(ready, `ENVIRONMENT: canvas harness 未就绪（${ORIGIN}）\n${harnessLog.slice(-2000)}`);

  const config = {
    origin: ORIGIN,
    evidenceDir,
    taskName: `slot-preview-layout-${randomUUID().slice(0, 8)}`,
    tokens: HOST_TOKENS,
    videoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  };
  // 旅程自身落盘几何结果；删除旧文件，只有本次运行写出的才算数。
  const geometryFile = join(evidenceDir, 'e2e-geometry.json');
  await rm(geometryFile, { force: true });
  const ego = await runEgo(`const drive = ${browserJourney.toString()};\nawait drive(${JSON.stringify(config)});`);
  await writeFile(join(evidenceDir, 'e2e-ego.stdout.log'), ego.stdout);
  await writeFile(join(evidenceDir, 'e2e-ego.stderr.log'), ego.stderr);
  // ego 关闭任务空间时以非零码退出；旅程完成与否由几何文件是否产出决定。
  assert.ok([0, 8].includes(ego.exitCode), `ENVIRONMENT: ego-browser 异常退出码 ${ego.exitCode}\n${ego.stderr.slice(-2000)}`);
  const geometry = JSON.parse(await readFile(geometryFile, 'utf8'));
  await writeFile(join(evidenceDir, 'e2e-report.json'), `${JSON.stringify({ origin: ORIGIN, geometry }, null, 2)}\n`);

  // A1 媒体与操作分属两个子节点
  assert.ok(geometry.hasMediaRegion, 'A1: 预览卡缺少 .wf-slot-hover-preview__media 媒体区');
  assert.ok(geometry.hasActionsRegion, 'A1: 预览卡缺少 .wf-slot-hover-preview__actions 操作区');
  // A2 操作区横向单行
  assert.equal(geometry.actionsDisplay, 'flex', `A2: 操作区 display=${geometry.actionsDisplay}`);
  assert.ok(geometry.buttonsSameRow, `A2: 两个按钮不在同一行 ${JSON.stringify(geometry.buttons)}`);
  assert.deepEqual(geometry.labels, ['替换', '停用'], `A2: 操作按钮文案 ${JSON.stringify(geometry.labels)}`);
  // A3 操作区不收缩、媒体区可收缩
  assert.equal(geometry.actionsFlexShrink, '0', `A3: 操作区 flex-shrink=${geometry.actionsFlexShrink}`);
  assert.equal(geometry.mediaFlexShrink, '1', `A3: 媒体区 flex-shrink=${geometry.mediaFlexShrink}`);
  assert.equal(geometry.mediaMinHeight, '0px', `A3: 媒体区 min-height=${geometry.mediaMinHeight}`);
  // A4 卡片有可见背景与边框
  assert.notEqual(geometry.background, 'rgba(0, 0, 0, 0)', 'A4: 预览卡背景透明');
  assert.notEqual(geometry.borderWidth, '0px', 'A4: 预览卡无边框');
  // A5 按钮始终留在卡内
  assert.ok(geometry.buttonsInsideCard, `A5: 按钮超出卡片纵向范围 ${JSON.stringify(geometry.buttons)} card=${JSON.stringify(geometry.card)}`);
  assert.ok(geometry.buttonsInsideHorizontally, `A5: 按钮超出卡片横向范围 ${JSON.stringify(geometry.buttons)} card=${JSON.stringify(geometry.card)}`);
});
