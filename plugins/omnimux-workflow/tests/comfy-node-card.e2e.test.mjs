/**
 * 端到端契约：ComfyUI 工作流卡片内嵌真页面（Issue #3751）
 *
 * 沿用仓库既有两种 e2e 写法，不自创装置：
 *  1. 直接执行真实源文件（TS 类型剥离，同 `src/**` 下的既有测试路径），
 *     让可见性/挂载策略这类纯逻辑跑真代码，而不是只做字符串匹配；
 *  2. 跨文件静态契约断言（同 `canvas-concurrent-execution.e2e.test.mjs`、
 *     `e2e/add-node-flat-palette.e2e.test.mjs`）。
 *
 * 覆盖四条验收行为：
 *  1. 卡片可见即挂 iframe，不需要先点任何按钮；
 *  2. 全屏切换不重建 iframe（单宿主 + 只换几何），全屏卡片铺满视口；
 *  3. 拖动缩放把尺寸写进节点数据，并随工作流文件持久化；
 *  4. 移出视口卸载、回到屏幕重挂（Issue #3751 验收回归：viewport.x/y 是屏幕平移量）。
 *
 * 真实浏览器证据（画布 harness + ego，含截图）见 `specs/comfy-node-card.spec.md` 验证证据表；
 * 本文件是 CI 门禁收集的端到端契约层。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isComfyCardVisible,
  shouldMountComfyFrame,
  wantsComfyFrame,
} from '../src/canvas/editor/utils/comfyPageCard.ts';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, '../src', rel), 'utf8');

const cardSrc = src('canvas/nodes/definitions/comfyPage.tsx');
const panelSrc = src('canvas/editor/components/ComfyPagePanel.tsx');
const editorSrc = src('canvas/editor/CanvasEditor.tsx');
const cssSrc = src('canvas/theme/comfyPage.css');
const workflowFileSrc = src('shared/comfyui/omnimuxWorkflowFile.ts');

/** 可见 + 就绪 + 有名额时的挂载输入。 */
function mountInput(overrides = {}) {
  return Object.assign(
    {
      ready: true,
      selected: false,
      visible: true,
      width: 420,
      height: 360,
      zoom: 1,
      hasSlot: true,
      fullscreen: false,
    },
    overrides,
  );
}

test('E2E: 可见性按屏幕平移量换算，屏幕上可见的卡片必须判可见 (#3751)', () => {
  // 验收方给的复现数据：zoom 1.29、1728×883，四组卡片都在屏幕上。
  // 旧实现把 viewport.x/y 当画布坐标，其中三组被误判「不可见」→ 卡片显示「页面已暂停」。
  const view = { zoom: 1.29, width: 1728, height: 883 };
  const visibleCases = [
    { nodeX: 400, nodeY: 300, vx: 77, vy: -196 },
    { nodeX: 0, nodeY: 0, vx: 593, vy: 191 },
    { nodeX: 900, nodeY: 400, vx: -568, vy: -325 },
    { nodeX: 1529, nodeY: 300, vx: -1379, vy: -196 },
  ];
  for (const item of visibleCases) {
    assert.equal(
      isComfyCardVisible({
        nodeX: item.nodeX,
        nodeY: item.nodeY,
        width: 420,
        height: 360,
        viewport: { x: item.vx, y: item.vy, zoom: view.zoom, width: view.width, height: view.height },
      }),
      true,
      `节点(${item.nodeX},${item.nodeY}) + viewport(${item.vx},${item.vy}) 必须判可见`,
    );
  }
  // 对照：真的在视口外（左侧远处 / 右侧远处）仍必须判不可见。
  const offscreen = { x: 593, y: 191, zoom: view.zoom, width: view.width, height: view.height };
  assert.equal(
    isComfyCardVisible({ nodeX: -5000, nodeY: 0, width: 420, height: 360, viewport: offscreen }),
    false,
  );
  assert.equal(
    isComfyCardVisible({ nodeX: 1000, nodeY: 0, width: 420, height: 360, viewport: offscreen }),
    false,
  );
});

test('E2E: 卡片可见时直接挂上 iframe，不需要先点任何按钮 (#3751)', () => {
  // 单宿主：卡片里就渲染面板本身，没有「先打开」这一跳。
  assert.match(
    cardSrc,
    /import \{ ComfyPagePanel \} from '\.\.\/\.\.\/editor\/components\/ComfyPagePanel'/,
    '卡片必须直接引用面板',
  );
  assert.equal(cardSrc.split('<ComfyPagePanel').length - 1, 1, '面板只能有一处宿主，避免出现第二份 iframe');
  assert.equal(cardSrc.includes('COMFY_PAGE_OPEN_EVENT'), false, '不得再有「打开」事件');
  assert.equal(cardSrc.includes('comfyPage.card.open'), false, '不得再有「打开」按钮文案');
  assert.equal(panelSrc.includes('comfy-page-open'), false, '面板不得再监听「打开」事件（改为 prop 驱动）');
  assert.match(panelSrc, /frameMounted\?: boolean;/, '挂载开关必须是 prop');
  assert.match(panelSrc, /onReadyChange\?:/, '就绪上报必须是 prop');
  // 旧的整屏覆盖层必须删除，否则等于第二个宿主。
  assert.equal(editorSrc.includes('ComfyPageOverlay'), false, '画布不得再挂旧覆盖层');
  assert.equal(editorSrc.includes('COMFY_PAGE_OPEN_EVENT'), false, '画布不得再转发「打开」事件');
  // 就绪即挂：iframe 只受 frameMounted 控制，未挂载时给占位而不是白屏。
  assert.match(panelSrc, /frameMounted \? \(/, 'iframe 必须由 frameMounted 决定');
  assert.match(panelSrc, /wf-comfy-page-panel__frame-paused/, '未挂载时必须给占位而不是白屏');
  // 卡片把真实可见性交给策略函数，且可见 + 就绪 + 有名额时确实挂载。
  assert.match(cardSrc, /isComfyCardVisible\(\{/, '卡片必须用可见性函数判断是否在屏幕上');
  assert.match(cardSrc, /wantsComfyFrame\(/, '卡片必须先判「想挂」再申请名额');
  assert.equal(shouldMountComfyFrame(mountInput()), true, '可见且就绪且有名义额时必须挂载');
});

test('E2E: 全屏只换几何，iframe 元素不被重建 (#3751)', () => {
  // 内容区不得按 fullscreen 条件渲染：包一层条件就会换掉宿主子树（iframe 重建）。
  const bodyStart = cardSrc.indexOf('wf-comfy-page-node__body');
  const panelStart = cardSrc.indexOf('<ComfyPagePanel');
  assert.ok(bodyStart > -1 && panelStart > bodyStart, '面板必须直接挂在卡片内容区里');
  assert.equal(
    /fullscreen/.test(cardSrc.slice(bodyStart, panelStart)),
    false,
    '内容区不得按 fullscreen 条件渲染（会重建 iframe）',
  );
  // 没有 portal / 没有第二处 iframe：整屏是同一棵树的几何变化。
  assert.equal(cardSrc.includes('createPortal'), false, '不得把卡片 portal 到别处（会重新挂载 iframe）');
  assert.equal(cardSrc.includes('<iframe'), false, '卡片里不得有第二处 iframe');
  assert.equal(panelSrc.split('<iframe').length - 1, 2, '面板里的 iframe 只应有两处互斥分支（托管态/探测态）');
  assert.doesNotMatch(panelSrc, /key=\{[^}]*fullscreen/, 'iframe 的 key 不得随全屏变化');
  // 全屏几何：铺满视口 + 反向缩放回自然大小 + 层级抬到画布浮层之上。
  assert.match(cardSrc, /comfyFullscreenGeometry\(/, '整屏几何必须走几何函数');
  assert.match(cardSrc, /--wf-comfy-inverse/, '整屏必须用反向缩放保持内容自然大小');
  assert.match(cardSrc, /wf-comfy-page-node--fullscreen/, '整屏必须有可断言的类名');
  assert.match(cssSrc, /\.wf-canvas-root--comfy-fullscreen \.react-flow \{/, '整屏必须抬起 React Flow 容器层级');
  assert.match(cssSrc, /z-index: 40 !important/, '抬层级必须压过 React Flow 的内联 z-index');
  // 署名不能被藏掉：xyflow 要求保留（hideAttribution 是付费项），只能改定位。
  assert.match(
    cssSrc,
    /\.wf-canvas-root--comfy-fullscreen \.react-flow__attribution \{[^}]*position: fixed/,
    '全屏时署名必须固定到屏幕右下角（移进整屏层）',
  );
  assert.doesNotMatch(cssSrc, /react-flow__attribution[^}]*display:\s*none/, '不得隐藏署名');
});

test('E2E: 拖动缩放写进节点数据并随工作流文件持久化 (#3751)', () => {
  assert.match(cardSrc, /<NodeResizer/, '必须有缩放手柄');
  assert.match(cardSrc, /onResizeEnd=\{\(_event, params\) =>/, '缩放必须在结束时落盘');
  assert.match(cardSrc, /clampComfyCardSize\(params\.width, params\.height\)/, '写入前必须夹到最小尺寸');
  assert.match(cardSrc, /minWidth=\{COMFY_CARD_MIN_WIDTH\}/, '必须有最小宽度');
  assert.match(cardSrc, /minHeight=\{COMFY_CARD_MIN_HEIGHT\}/, '必须有最小高度');
  // 只有这个节点类型可缩放：其他节点定义不得出现 NodeResizer。
  const definitionsDir = join(here, '../src/canvas/nodes/definitions');
  const withResizer = readdirSync(definitionsDir)
    .filter((name) => name.endsWith('.tsx'))
    .filter((name) => readFileSync(join(definitionsDir, name), 'utf8').includes('NodeResizer'));
  assert.deepEqual(withResizer, ['comfyPage.tsx'], '缩放只属于这个节点类型');
  // 尺寸随工作流文件持久化（跨模块契约：节点数据 → 序列化白名单）。
  assert.match(workflowFileSrc, /'width', 'height'/, '序列化白名单必须保留宽高');
  assert.match(workflowFileSrc, /isFiniteNumber\(raw\.width\) \? \{ width: raw\.width \}/, '宽必须写入文件');
  assert.match(workflowFileSrc, /isFiniteNumber\(raw\.height\) \? \{ height: raw\.height \}/, '高必须写入文件');
});

test('E2E: 移出视口卸载、回到屏幕重挂 (#3751)', () => {
  // 双向：可见挂、不可见卸。
  assert.equal(shouldMountComfyFrame(mountInput({ visible: true })), true, '在屏幕上必须挂载');
  assert.equal(shouldMountComfyFrame(mountInput({ visible: false })), false, '移出视口必须卸载');
  // 「想挂」不看名额，避免与名额申请互相等待（真机上的死锁回归）。
  assert.equal(
    wantsComfyFrame(mountInput({ hasSlot: false })),
    true,
    '没名额也要「想挂」，否则永远不会去申请名额',
  );
  // 卡片必须把视口（屏幕平移量）交给可见性判断，并把挂载开关交给面板。
  assert.match(
    cardSrc,
    /isComfyCardVisible\(\{[\s\S]{0,240}?viewport: viewportRect/,
    '可见性判断必须收到真实视口（含屏幕平移量 x/y 与 zoom）',
  );
  assert.match(cardSrc, /x: viewport\.x,[\s\S]{0,80}?y: viewport\.y,[\s\S]{0,80}?zoom: viewport\.zoom/, '视口必须带上 x/y/zoom');
  assert.match(cardSrc, /frameMounted=\{frameMounted\}/, '面板必须收到挂载开关');
});
