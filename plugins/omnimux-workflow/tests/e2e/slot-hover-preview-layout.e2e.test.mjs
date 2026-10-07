/**
 * 素材卡槽悬浮预览：卡片尺寸随素材比例（非固定宽度），操作按钮位于卡片外侧下方。
 *
 * 真机路径：画布 harness（真实 CanvasEditor + mock catalog）→ 上游图片接入
 * vision_chat 的参考素材槽位 → 悬停卡槽 → 读取卡片 / 图片 / 按钮的盒模型。
 * 证据目录：docs/evidence/slot-preview-card-fit/。
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
const evidenceDir = join(root, 'docs/evidence/slot-preview-card-fit');
const PORT = 4943;
const ORIGIN = `http://localhost:${PORT}`;

/** 宿主令牌缺失时卡片不得退化为透明：注入与真实宿主等价的 body 令牌。 */
const HOST_TOKENS = 'body{--dsw-alias-bg-elevated:#1c1c1f;--dsw-alias-border-l2:rgba(255,255,255,0.12);--dsw-alias-label-primary:#f5f5f5;--dsw-alias-label-secondary:#a1a1aa;--dsw-alias-label-tertiary:#71717a;--dsw-alias-bg-layer-2:#2c2c2e;--dsw-alias-interactive-bg-hover:rgba(255,255,255,0.08);--dsw-alias-border-l3:rgba(255,255,255,0.2);--dsw-alias-bg-secondary:#222226;--dsw-alias-label-primary-foreground:#fff}';

/** 内联 SVG 自带固有尺寸：无需网络即可验证「卡片随图比例」。 */
function svgDataUrl(width, height, fill) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${fill}"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** 方形小图（96×96）：卡片若仍固定宽度，会明显宽于图片。 */
const SQUARE_IMAGE = svgDataUrl(96, 96, '#3b82f6');
/** 竖图（240×480）：卡片应呈竖长比例。 */
const PORTRAIT_IMAGE = svgDataUrl(240, 480, '#f97316');

function runEgo(code) {
  return new Promise((resolveRun, reject) => {
    const delimiter = `EGO_SLOT_CARDFIT_${randomUUID().replaceAll('-', '')}`;
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

    /** 把上游图片接到 vision_chat 的参考素材槽位，并悬停该槽位。 */
    const mountAndHover = async (imageUrl) => {
      await page.evaluate((url) => {
        const store = window.__canvasStore;
        const base = store.getState().nodes.filter((n) => n.id !== 'n-vsrc');
        const nodes = base.map((n) => (n.id === 'n-text'
          ? { ...n, data: { ...n.data, inputBindingVersion: 1, params: { ...n.data.params, operation: 'vision_chat' } } }
          : n));
        nodes.push({
          id: 'n-vsrc', type: 'material', position: { x: -600, y: 300 },
          data: {
            materialType: 'image', label: '参考图片', nodeWidth: 320, selectedTool: 'image-generation',
            inputBindingVersion: 1, params: { model: 'mock-image-1k' }, executionStatus: 'completed',
            mediaAssets: [{ type: 'image', url }],
          },
        });
        store.getState().hydrateGraph(nodes, [...store.getState().edges.filter((e) => e.id !== 'e-vsrc-text'), { id: 'e-vsrc-text', source: 'n-vsrc', target: 'n-text', type: 'animated' }]);
      }, imageUrl);
      await page.click('.react-flow__node[data-id="n-text"]', { label: '选中目标素材节点', timeout: 8000 });
      await page.waitForSelector('.wf-slot-well--filled', { state: 'visible', timeout: 8000 });
      await page.hover('.wf-slot-well--filled', { label: '悬停已填充卡槽', timeout: 8000 });
      await page.waitForSelector('.wf-slot-hover-preview', { state: 'visible', timeout: 8000 });
      await page.waitForFunction(() => {
        const card = document.querySelector('.wf-slot-hover-preview__card');
        const image = document.querySelector('.wf-slot-hover-preview__media img');
        return Boolean(card && image && image.naturalWidth > 0);
      }, undefined, { timeout: 8000 });
    };

    const readGeometry = () => page.evaluate(() => {
      const popover = document.querySelector('.wf-slot-hover-preview');
      const card = document.querySelector('.wf-slot-hover-preview__card');
      const image = document.querySelector('.wf-slot-hover-preview__media img');
      const actions = document.querySelector('.wf-slot-hover-preview__actions');
      const cardBox = card.getBoundingClientRect();
      const imageBox = image.getBoundingClientRect();
      const actionsBox = actions ? actions.getBoundingClientRect() : null;
      const popoverBox = popover.getBoundingClientRect();
      const cardStyle = getComputedStyle(card);
      const buttons = [...document.querySelectorAll('.wf-slot-hover-preview__actions button')].map((b) => {
        const r = b.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, label: b.textContent.trim() };
      });
      return {
        hasCard: Boolean(card),
        hasActionsOutsideCard: Boolean(actions) && !card.contains(actions),
        natural: { width: image.naturalWidth, height: image.naturalHeight },
        card: { top: cardBox.top, bottom: cardBox.bottom, left: cardBox.left, right: cardBox.right, width: cardBox.width, height: cardBox.height },
        image: { width: imageBox.width, height: imageBox.height },
        popover: { width: popoverBox.width, left: popoverBox.left, right: popoverBox.right },
        actions: actionsBox ? { top: actionsBox.top, bottom: actionsBox.bottom, left: actionsBox.left, right: actionsBox.right } : null,
        cardBackground: cardStyle.backgroundColor,
        cardBorderWidth: cardStyle.borderTopWidth,
        cardRadius: cardStyle.borderTopLeftRadius,
        buttons,
        buttonsSameRow: buttons.length === 2 && Math.abs(buttons[0].top - buttons[1].top) <= 2,
        labels: buttons.map((b) => b.label),
      };
    });

    await fs.mkdir(config.evidenceDir, { recursive: true });
    await mountAndHover(config.squareImage);
    const square = await readGeometry();
    await page.screenshot({ path: `${config.evidenceDir}/e2e-square-card.png`, scale: 'css' });

    await mountAndHover(config.portraitImage);
    const portrait = await readGeometry();
    await page.screenshot({ path: `${config.evidenceDir}/e2e-portrait-card.png`, scale: 'css' });

    // 压力场景：把媒体拉到超高，操作按钮仍须留在视口内。
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = '.wf-slot-hover-preview__media img{height:520px !important;max-height:none !important}';
      document.head.appendChild(style);
    });
    await page.waitForFunction(() => {
      const card = document.querySelector('.wf-slot-hover-preview__card');
      return Boolean(card) && card.getBoundingClientRect().height >= 500;
    }, undefined, { timeout: 8000 });
    const stressed = await readGeometry();
    await page.screenshot({ path: `${config.evidenceDir}/e2e-stressed.png`, scale: 'css' });

    const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    const geometry = { square, portrait, stressed, viewport };
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

test('素材卡槽悬浮预览：卡片随素材比例，操作按钮在卡片外侧下方', async (t) => {
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
    tokens: HOST_TOKENS,
    squareImage: SQUARE_IMAGE,
    portraitImage: PORTRAIT_IMAGE,
    taskName: `slot-preview-card-fit-${randomUUID().slice(0, 8)}`,
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

  const { square, portrait, stressed } = geometry;

  // A1 卡片尺寸跟随素材：小方图不得把卡片撑到定位轨道满宽（240）。
  assert.ok(square.card.width < 240, `A1: 96×96 方图下卡片仍占满轨道宽度 ${square.card.width}`);
  assert.ok(Math.abs(square.card.width - (square.image.width + 12)) <= 2, `A1: 卡片宽度应≈图片宽+内边距，card=${square.card.width} image=${square.image.width}`);
  assert.ok(portrait.card.height > portrait.card.width, 'A1: 竖图卡片未呈竖长');
  // A2 卡片比例跟随素材：方图 → 方卡；竖图 → 竖卡。
  assert.ok(Math.abs(square.card.width / square.card.height - 1) <= 0.05, `A2: 方图卡片比例 ${(square.card.width / square.card.height).toFixed(3)}`);
  assert.ok(Math.abs(portrait.card.width / portrait.card.height - 0.5) <= 0.05, `A2: 竖图卡片比例 ${(portrait.card.width / portrait.card.height).toFixed(3)} 应≈0.5`);
  // A3 按钮组在卡片外侧下方。
  assert.ok(square.hasActionsOutsideCard, 'A3: 按钮组仍在卡片内部');
  assert.ok(square.actions.top >= square.card.bottom, `A3: 按钮组未在卡片下方 actions.top=${square.actions.top} card.bottom=${square.card.bottom}`);
  assert.ok(portrait.actions.top >= portrait.card.bottom, `A3: 竖图下按钮组未在卡片下方 actions.top=${portrait.actions.top} card.bottom=${portrait.card.bottom}`);
  // A4 卡片自身仍是可见的卡片。
  assert.notEqual(square.cardBackground, 'rgba(0, 0, 0, 0)', 'A4: 卡片背景透明');
  assert.notEqual(square.cardBorderWidth, '0px', 'A4: 卡片无边框');
  assert.notEqual(square.cardRadius, '0px', 'A4: 卡片无圆角');
  // A5 两个按钮仍是横向单行且文案不变。
  assert.equal(square.buttonsSameRow, true, `A5: 两个按钮不在同一行 ${JSON.stringify(square.buttons)}`);
  assert.deepEqual(square.labels, ['替换', '停用'], `A5: 按钮文案 ${JSON.stringify(square.labels)}`);
  // A6 压力场景：媒体超高时按钮组仍留在视口内且仍在卡片下方。
  assert.ok(stressed.actions.bottom <= geometry.viewport.height, `A6: 按钮组被挤出视口 actions.bottom=${stressed.actions.bottom} viewport=${geometry.viewport.height}`);
  assert.ok(stressed.actions.top >= stressed.card.bottom, 'A6: 压力场景下按钮组未在卡片下方');
  // A7 卡片与按钮组共用同一定位容器（悬停判定区域未被破坏）。
  assert.ok(square.popover.width >= square.card.width, 'A7: 定位容器窄于卡片');
  assert.ok(square.actions.left >= square.popover.left - 1 && square.actions.right <= square.popover.right + 1, 'A7: 按钮组超出定位容器横向范围');
});
