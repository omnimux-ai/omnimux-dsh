/**
 * ComfyUI 工作流卡片纯逻辑契约（Issue #3751）：
 * 尺寸下限、整屏几何（画布坐标里抵消视口平移/缩放）、可见性、iframe 挂载策略与名额。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COMFY_CARD_DEFAULT_HEIGHT,
  COMFY_CARD_DEFAULT_WIDTH,
  COMFY_CARD_MIN_HEIGHT,
  COMFY_CARD_MIN_WIDTH,
  COMFY_FRAME_MAX_MOUNTED,
  clampComfyCardSize,
  comfyFullscreenGeometry,
  comfyWorkflowNameFromData,
  isComfyCardVisible,
  planComfyFrameSlots,
  releaseComfyFrameSlot,
  resolveComfyCardSize,
  shouldMountComfyFrame,
  wantsComfyFrame,
} from './comfyPageCard.ts';

const viewport = { x: 0, y: 0, zoom: 1, width: 1728, height: 883 };

/** 挂载策略的默认输入（每次新建，避免共享可变对象）。 */
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

test('尺寸：缺省值、非法值回落、下限夹取', () => {
  assert.deepEqual(resolveComfyCardSize(undefined, undefined), {
    width: COMFY_CARD_DEFAULT_WIDTH,
    height: COMFY_CARD_DEFAULT_HEIGHT,
  });
  assert.deepEqual(resolveComfyCardSize(0, -5), {
    width: COMFY_CARD_DEFAULT_WIDTH,
    height: COMFY_CARD_DEFAULT_HEIGHT,
  });
  assert.deepEqual(clampComfyCardSize(10, 10), {
    width: COMFY_CARD_MIN_WIDTH,
    height: COMFY_CARD_MIN_HEIGHT,
  });
  assert.deepEqual(clampComfyCardSize(500.6, 400.4), { width: 501, height: 400 });
});

test('整屏几何：抵消视口平移与缩放，DOM 不移动', () => {
  // zoom=1、视口在原点：卡片移到画布 (0,0)，尺寸就是视口尺寸。
  assert.deepEqual(comfyFullscreenGeometry({ nodeX: 120, nodeY: 340, viewport }), {
    offsetX: -120,
    offsetY: -340,
    width: 1728,
    height: 883,
    inverseScale: 1,
  });
  // zoom=0.5：画布坐标要 2 倍大才铺满屏幕，内容按 2 倍反向缩放回自然大小。
  const half = comfyFullscreenGeometry({
    nodeX: 0,
    nodeY: 0,
    viewport: { x: 0, y: 0, zoom: 0.5, width: 1728, height: 883 },
  });
  assert.equal(half.width, 3456);
  assert.equal(half.height, 1766);
  assert.equal(half.inverseScale, 2);
});

test('整屏几何：视口已平移/缩放时也要正好铺满屏幕', () => {
  // 视口 transform = translate(713.35, -77.05) scale(0.23)：视口左上角在画布 (-3101, 335)。
  const geometry = comfyFullscreenGeometry({
    nodeX: 160,
    nodeY: 250,
    viewport: { x: 713.35, y: -77.05, zoom: 0.23, width: 1728, height: 883 },
  });
  const expectedOriginX = -713.35 / 0.23;
  const expectedOriginY = 77.05 / 0.23;
  assert.equal(geometry.offsetX, expectedOriginX - 160);
  assert.equal(geometry.offsetY, expectedOriginY - 250);
  assert.equal(geometry.width, 1728 / 0.23);
  assert.equal(geometry.height, 883 / 0.23);
  assert.equal(geometry.inverseScale, 1 / 0.23);
  // 卡片（画布坐标）乘上缩放后必须落在屏幕原点、且正好是屏幕尺寸。
  const screenX = (160 + geometry.offsetX) * 0.23 + 713.35;
  const screenY = (250 + geometry.offsetY) * 0.23 - 77.05;
  assert.equal(Math.round(screenX), 0);
  assert.equal(Math.round(screenY), 0);
  assert.equal(Math.round(geometry.width * 0.23), 1728);
  assert.equal(Math.round(geometry.height * 0.23), 883);
});

test('可见性：与视口相交才算可见，完全在视口外为 false', () => {
  const card = { width: 420, height: 360 };
  assert.equal(isComfyCardVisible({ nodeX: 100, nodeY: 100, width: card.width, height: card.height, viewport }), true);
  // 贴边仍算可见（避免滚动时反复挂载/卸载）。
  assert.equal(isComfyCardVisible({ nodeX: 1728, nodeY: 0, width: card.width, height: card.height, viewport }), true);
  assert.equal(isComfyCardVisible({ nodeX: 1800, nodeY: 0, width: card.width, height: card.height, viewport }), false);
  assert.equal(isComfyCardVisible({ nodeX: 0, nodeY: 2000, width: card.width, height: card.height, viewport }), false);
  // zoom=0.5 时视口在画布坐标里更大，更远的位置也算可见。
  assert.equal(
    isComfyCardVisible({
      nodeX: 1900,
      nodeY: 0,
      width: card.width,
      height: card.height,
      viewport: { x: 0, y: 0, zoom: 0.5, width: 1728, height: 883 },
    }),
    true,
  );
});

test('可见性：viewport.x/y 是屏幕平移量，不能当画布坐标用（验收方四组数据）', () => {
  // zoom 1.29、1728×883；四组都是「卡片整块在屏幕上」。
  const view = { zoom: 1.29, width: 1728, height: 883 };
  const card = { width: 420, height: 360 };
  const cases = [
    { nodeX: 400, nodeY: 300, viewportX: 77, viewportY: -196 },
    { nodeX: 0, nodeY: 0, viewportX: 593, viewportY: 191 },
    { nodeX: 900, nodeY: 400, viewportX: -568, viewportY: -325 },
    { nodeX: 1529, nodeY: 300, viewportX: -1379, viewportY: -196 },
  ];
  for (const item of cases) {
    assert.equal(
      isComfyCardVisible({
        nodeX: item.nodeX,
        nodeY: item.nodeY,
        width: card.width,
        height: card.height,
        viewport: { x: item.viewportX, y: item.viewportY, zoom: view.zoom, width: view.width, height: view.height },
      }),
      true,
      `节点(${item.nodeX},${item.nodeY}) + viewport(${item.viewportX},${item.viewportY}) 应判可见`,
    );
  }
  // 对照：真的不可见（左侧远处 / 右侧远处）。
  assert.equal(
    isComfyCardVisible({
      nodeX: -5000,
      nodeY: 0,
      width: card.width,
      height: card.height,
      viewport: { x: 593, y: 191, zoom: view.zoom, width: view.width, height: view.height },
    }),
    false,
  );
  assert.equal(
    isComfyCardVisible({
      nodeX: 1000,
      nodeY: 0,
      width: card.width,
      height: card.height,
      viewport: { x: 593, y: 191, zoom: view.zoom, width: view.width, height: view.height },
    }),
    false,
  );
});

test('iframe 挂载：未就绪不挂，不可见且未选中不挂，缩太小不挂', () => {
  assert.equal(shouldMountComfyFrame(mountInput()), true);
  assert.equal(shouldMountComfyFrame(mountInput({ ready: false })), false);
  assert.equal(shouldMountComfyFrame(mountInput({ visible: false })), false);
  assert.equal(shouldMountComfyFrame(mountInput({ visible: false, selected: true })), true);
  // 屏幕上太小：先占位，别白跑一个真页面。
  assert.equal(shouldMountComfyFrame(mountInput({ zoom: 0.2 })), false);
  // 整屏时一定挂载（当前焦点），不看名额。
  assert.equal(
    shouldMountComfyFrame(mountInput({ visible: false, fullscreen: true, hasSlot: false })),
    true,
  );
  // 名额没拿到：先占位。
  assert.equal(shouldMountComfyFrame(mountInput({ hasSlot: false })), false);
});

test('「想挂」与「拿到名额」是两道闸：想挂不看名额，避免互相等待', () => {
  // 没有名额也「想挂」——否则卡片永远不会去申请名额（真实组件里的死锁）。
  assert.equal(wantsComfyFrame(mountInput({ hasSlot: false })), true);
  // 最终是否渲染仍受名额约束。
  assert.equal(shouldMountComfyFrame(mountInput({ hasSlot: false })), false);
  // 不想挂时，有没有名额都不挂。
  assert.equal(wantsComfyFrame(mountInput({ ready: false })), false);
  assert.equal(shouldMountComfyFrame(mountInput({ ready: false, hasSlot: true })), false);
  // 整屏：想挂且不看名额。
  assert.equal(wantsComfyFrame(mountInput({ visible: false, fullscreen: true })), true);
  assert.equal(shouldMountComfyFrame(mountInput({ visible: false, fullscreen: true, hasSlot: false })), true);
});

test('同屏名额：先到先得、满员不超、释放幂等', () => {
  let slots = [];
  const claim = (id) => {
    const result = planComfyFrameSlots(slots, id);
    slots = result.slots;
    return result.granted;
  };
  assert.equal(claim('a'), true);
  assert.equal(claim('b'), true);
  assert.equal(slots.length, COMFY_FRAME_MAX_MOUNTED);
  assert.equal(claim('c'), false, '满员后不得再挂载');
  assert.equal(claim('a'), true, '已在名额内保持 granted');
  assert.deepEqual(slots, ['a', 'b']);
  slots = releaseComfyFrameSlot(slots, 'a');
  assert.deepEqual(slots, ['b']);
  assert.deepEqual(releaseComfyFrameSlot(slots, 'zzz'), ['b'], '释放未持有者幂等');
  assert.equal(claim('c'), true, '空出名额后可再挂');
});

test('工作流名：缺省空串（由卡片回落「未命名工作流」），空白名也算空', () => {
  assert.equal(comfyWorkflowNameFromData(undefined), '');
  assert.equal(comfyWorkflowNameFromData({}), '');
  assert.equal(comfyWorkflowNameFromData({ workflowName: '   ' }), '');
  assert.equal(comfyWorkflowNameFromData({ workflowName: 42 }), '');
  assert.equal(comfyWorkflowNameFromData({ workflowName: ' 我的工作流 ' }), '我的工作流');
});
