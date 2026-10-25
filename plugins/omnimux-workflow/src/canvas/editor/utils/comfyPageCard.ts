/**
 * ComfyUI 工作流卡片：尺寸、整屏几何与 iframe 挂载策略（Issue #3751）。
 *
 * 抽成无 React 依赖的纯函数，供 node:test 直接断言：
 *  - 尺寸下限/默认值（缩放不能把卡片拖成看不清的一小条）；
 *  - 整屏几何：卡片在 React Flow 的缩放容器里，`position: fixed` 会被祖先 transform
 *    困住，因此整屏要在**画布坐标**里反向抵消平移与缩放（不移动 DOM，iframe 不重载）；
 *  - iframe 挂载策略：只在可见或选中、且屏幕上足够大时挂载；同屏挂载数有上限。
 */

/** 卡片尺寸：默认与下限（屏幕点，未乘缩放）。 */
export const COMFY_CARD_DEFAULT_WIDTH = 420;
export const COMFY_CARD_DEFAULT_HEIGHT = 360;
export const COMFY_CARD_MIN_WIDTH = 280;
export const COMFY_CARD_MIN_HEIGHT = 200;

/** iframe 挂载门槛：卡片在屏幕上的实际尺寸低于此值先不挂（缩太小先占位）。 */
export const COMFY_FRAME_MIN_SCREEN_WIDTH = 160;
export const COMFY_FRAME_MIN_SCREEN_HEIGHT = 120;

/** 同屏最多同时挂载的 iframe 数：多个该节点不得各自常驻一个真页面。 */
export const COMFY_FRAME_MAX_MOUNTED = 2;

export interface ComfyCardSize {
  width: number;
  height: number;
}

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** 节点数据/测量值 → 卡片尺寸；非法值回落默认值，并夹到下限。 */
export function resolveComfyCardSize(
  width: unknown,
  height: unknown,
): ComfyCardSize {
  const rawWidth = positive(width) ?? COMFY_CARD_DEFAULT_WIDTH;
  const rawHeight = positive(height) ?? COMFY_CARD_DEFAULT_HEIGHT;
  return clampComfyCardSize(rawWidth, rawHeight);
}

/** 夹到下限：拖到比下限还小就停在下限（避免缩到看不清）。 */
export function clampComfyCardSize(width: number, height: number): ComfyCardSize {
  const safeWidth = positive(width) ?? COMFY_CARD_DEFAULT_WIDTH;
  const safeHeight = positive(height) ?? COMFY_CARD_DEFAULT_HEIGHT;
  return {
    width: Math.max(COMFY_CARD_MIN_WIDTH, Math.round(safeWidth)),
    height: Math.max(COMFY_CARD_MIN_HEIGHT, Math.round(safeHeight)),
  };
}

export interface ComfyViewportRect {
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
}

/**
 * 整屏几何（画布坐标）：
 * React Flow 把画布坐标映射到屏幕 `screen = canvas × zoom + viewport.xy`，所以视口左上角
 * 对应的画布坐标是 `-viewport.xy / zoom`。卡片要铺满屏幕，就得让它的左上角落到那里，
 * 而卡片的 `left/top` 是相对节点原点 `(nodeX, nodeY)` 的，因此偏移再减掉节点原点。
 * 尺寸取 `屏幕尺寸 / zoom`；内容按 `1/zoom` 反向缩放回自然大小。
 *
 * 这里用的是**窗口**尺寸：生产里画布铺满窗口，所以窗口尺寸就是用户看到的整屏尺寸。
 * 验收装置（harness）顶部若有一条自己的调试条，卡片底边会被它裁掉一点——那是装置
 * 自身的偏差，不是实现问题，不要为了迁就装置把尺寸算法改成读某个容器。
 */
export function comfyFullscreenGeometry(options: {
  nodeX: number;
  nodeY: number;
  viewport: ComfyViewportRect;
}): { offsetX: number; offsetY: number; width: number; height: number; inverseScale: number } {
  const zoom = positive(options.viewport.zoom) ?? 1;
  const nodeX = Number.isFinite(options.nodeX) ? options.nodeX : 0;
  const nodeY = Number.isFinite(options.nodeY) ? options.nodeY : 0;
  const originX = -(Number.isFinite(options.viewport.x) ? options.viewport.x : 0) / zoom;
  const originY = -(Number.isFinite(options.viewport.y) ? options.viewport.y : 0) / zoom;
  const width = (positive(options.viewport.width) ?? 1) / zoom;
  const height = (positive(options.viewport.height) ?? 1) / zoom;
  return {
    offsetX: originX - nodeX,
    offsetY: originY - nodeY,
    width,
    height,
    inverseScale: zoom > 0 ? 1 / zoom : 1,
  };
}

/**
 * 节点是否与视口相交（画布坐标，含边界）。
 * 完全在视口外就不挂 iframe；贴边也算可见（闭区间），避免滚动时反复挂载/卸载。
 */
export function isComfyCardVisible(options: {
  nodeX: number;
  nodeY: number;
  width: number;
  height: number;
  viewport: ComfyViewportRect;
  /** 视口外扩容差（画布坐标），默认 0：完全不可见才算不可见。 */
  padding?: number;
}): boolean {
  const zoom = positive(options.viewport.zoom) ?? 1;
  const padding = typeof options.padding === 'number' && Number.isFinite(options.padding) ? options.padding : 0;
  // `viewport.x/y` 是**屏幕像素**的平移量（React Flow: screen = canvas × zoom + viewport.xy），
  // 视口左上角对应的画布坐标是 `-viewport.xy / zoom`。直接拿 viewport.x 当画布坐标会把
  // 「整块在屏幕上」的卡片判成不可见（平移为正/负时都错）。
  const viewportX = Number.isFinite(options.viewport.x) ? options.viewport.x : 0;
  const viewportY = Number.isFinite(options.viewport.y) ? options.viewport.y : 0;
  const screenWidth = positive(options.viewport.width) ?? 0;
  const screenHeight = positive(options.viewport.height) ?? 0;
  const left = -viewportX / zoom - padding;
  const top = -viewportY / zoom - padding;
  const right = (screenWidth - viewportX) / zoom + padding;
  const bottom = (screenHeight - viewportY) / zoom + padding;
  const nodeRight = options.nodeX + (positive(options.width) ?? 0);
  const nodeBottom = options.nodeY + (positive(options.height) ?? 0);
  return nodeRight >= left && options.nodeX <= right && nodeBottom >= top && options.nodeY <= bottom;
}

export interface ComfyFrameMountInput {
  /** 后端就绪（托管态 ready）或手动地址探测连通。 */
  ready: boolean;
  selected: boolean;
  visible: boolean;
  width: number;
  height: number;
  zoom: number;
  /** 是否已拿到同屏挂载名额。 */
  hasSlot: boolean;
  fullscreen: boolean;
}

/**
 * 这个节点「想不想」挂 iframe（不看同屏名额）：
 *  - 必须就绪，否则给加载/失败态；
 *  - 必须可见或选中（用户拍板：只在节点可见或选中时挂载）；
 *  - 屏幕上足够大才挂（缩到很小先占位，别白跑一个页面）；
 *  - 整屏时一定想挂（此时它一定是当前焦点）。
 *
 * 名额是**另一道闸**：卡片用本函数决定要不要申请名额，再用
 * `shouldMountComfyFrame` 决定最终是否真的渲染 iframe。
 */
export function wantsComfyFrame(input: ComfyFrameMountInput): boolean {
  if (!input.ready) return false;
  if (input.fullscreen) return true;
  if (!input.visible && !input.selected) return false;
  const zoom = positive(input.zoom) ?? 1;
  const screenWidth = (positive(input.width) ?? 0) * zoom;
  const screenHeight = (positive(input.height) ?? 0) * zoom;
  return screenWidth >= COMFY_FRAME_MIN_SCREEN_WIDTH && screenHeight >= COMFY_FRAME_MIN_SCREEN_HEIGHT;
}

/** iframe 是否真的挂载：想挂 + 拿到名额（整屏不看名额，它就是当前焦点）。 */
export function shouldMountComfyFrame(input: ComfyFrameMountInput): boolean {
  if (!wantsComfyFrame(input)) return false;
  if (input.fullscreen) return true;
  return input.hasSlot;
}

/**
 * 名额分配（纯函数）：先到先得，已在名额内保持不变；满员时后来者拿不到。
 * 传 `limit` 便于测试与将来调整上限。
 */
export function planComfyFrameSlots(
  slots: readonly string[],
  nodeId: string,
  limit: number = COMFY_FRAME_MAX_MOUNTED,
): { slots: string[]; granted: boolean } {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
  if (slots.includes(nodeId)) return { slots: [...slots], granted: true };
  if (slots.length >= safeLimit) return { slots: [...slots], granted: false };
  return { slots: [...slots, nodeId], granted: true };
}

/** 释放名额：幂等，未持有也安全。 */
export function releaseComfyFrameSlot(slots: readonly string[], nodeId: string): string[] {
  return slots.filter((id) => id !== nodeId);
}

/** 工作流名：节点数据里的名字，缺省「未命名工作流」。 */
export function comfyWorkflowNameFromData(data: Record<string, unknown> | undefined): string {
  const raw = data ? data.workflowName : undefined;
  if (typeof raw !== 'string') return '';
  return raw.trim();
}
