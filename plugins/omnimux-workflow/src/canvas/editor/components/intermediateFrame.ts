/**
 * 中间帧预览纯逻辑（无 React 依赖，供 node:test 直接断言）。
 *
 * 背景（Issue #3625 工作流 3）——先读通道再写代码，不假设字段存在：
 *
 * - 进度通道的真实 payload 只有 `{ executionId, nodeId, progress, message }`
 *   （`workflow/execution/ExecutionContext.ts` 的
 *   `ExecutionEventPayloads.node_progress`；生产端
 *   `workflow/execution/materialGatewayExecutor.ts` 只发 `(10,'已提交生成任务')`
 *   与 `(40,'生成中…')`）。
 * - 网关 `awaitTask` 是**终态一次性轮询**（`workflow/seam/gateway.ts` 的
 *   `AwaitTaskResult` 只有 url/text/sizeBytes 等终态字段；
 *   `workflow/seam/omnimuxGateway.ts` 只在 `mode === 'live'` 时返回最终产物）。
 *
 * 也就是说：**当前不存在任何中间帧字节通道**。因此本模块只做两件事，都不伪造：
 *
 * 1. 把真实进度归一化成节点数据补丁（有则写、无则不写，绝不补 0 或占位）；
 * 2. 对**可选**帧字段做防御式解析：上游将来若开始下发帧，这里就能渲染；
 *    没有帧时保持纯进度态，不得用占位图或假进度掩盖能力缺口。
 */

/** 节点数据上承载实时进度的字段（与 executionStatus/executionError 同层）。 */
export const EXECUTION_PROGRESS_FIELD = 'executionProgress' as const;
export const EXECUTION_PROGRESS_MESSAGE_FIELD = 'executionProgressMessage' as const;
export const EXECUTION_PREVIEW_URL_FIELD = 'executionPreviewUrl' as const;

export interface NodeProgressPayload {
  progress?: unknown;
  message?: unknown;
  /** 可选中间帧地址。当前生产端不下发，保留为前向兼容读取。 */
  previewUrl?: unknown;
  /** 可选中间帧地址的别名（兼容上游可能采用的 frame 命名）。 */
  frameUrl?: unknown;
}

export interface NormalizedNodeProgress {
  progress?: number;
  message?: string;
  previewUrl?: string;
}

const MIN_PROGRESS = 0;
const MAX_PROGRESS = 100;

/**
 * 进度值归一化：只接受有限数字，四舍五入并夹到 [0,100]。
 * 非数字（undefined/null/NaN/字符串/Infinity）一律返回 undefined —— 不猜、不补 0。
 */
export function normalizeProgressValue(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(MAX_PROGRESS, Math.max(MIN_PROGRESS, Math.round(value)));
}

/** 取首个非空字符串帧地址（previewUrl 优先，其次 frameUrl）。 */
export function pickPreviewUrl(payload: NodeProgressPayload | undefined): string | undefined {
  if (!payload) return undefined;
  const candidates = [payload.previewUrl, payload.frameUrl];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

/** 归一化一条 node_progress payload；无有效字段时返回空对象。 */
export function normalizeNodeProgress(
  payload: NodeProgressPayload | undefined,
): NormalizedNodeProgress {
  if (!payload) return {};
  const normalized: NormalizedNodeProgress = {};

  const progress = normalizeProgressValue(payload.progress);
  if (progress !== undefined) normalized.progress = progress;

  if (typeof payload.message === 'string' && payload.message.trim()) {
    normalized.message = payload.message.trim();
  }

  const previewUrl = pickPreviewUrl(payload);
  if (previewUrl !== undefined) normalized.previewUrl = previewUrl;

  return normalized;
}

/**
 * node_progress → canvasStore 节点数据补丁。
 *
 * @returns 需要写入的补丁；该事件没有任何有效字段时返回 `null`
 *   （调用方跳过写入，避免一次空 patch 触发画布脏标记与自动保存）。
 */
export function buildNodeProgressPatch(
  payload: NodeProgressPayload | undefined,
): Record<string, unknown> | null {
  const normalized = normalizeNodeProgress(payload);
  const patch: Record<string, unknown> = {};
  if (normalized.progress !== undefined) patch[EXECUTION_PROGRESS_FIELD] = normalized.progress;
  if (normalized.message !== undefined) patch[EXECUTION_PROGRESS_MESSAGE_FIELD] = normalized.message;
  if (normalized.previewUrl !== undefined) patch[EXECUTION_PREVIEW_URL_FIELD] = normalized.previewUrl;
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * 终态清理补丁：节点完成 / 失败 / 跳过 / 运行级终态收敛时，必须抹掉实时进度与
 * 中间帧地址。
 *
 * 这是「完成后不被中间帧覆盖」的数据层保证：最终产物落 `mediaUrl`/
 * `mediaAssets`，中间帧地址在同一/后续 patch 里被显式清空，而不是靠 CSS 遮挡。
 */
export function progressClearPatch(): Record<string, unknown> {
  return {
    [EXECUTION_PROGRESS_FIELD]: undefined,
    [EXECUTION_PROGRESS_MESSAGE_FIELD]: undefined,
    [EXECUTION_PREVIEW_URL_FIELD]: undefined,
  };
}

export interface IntermediateFrameGate {
  /** 是否处于生成中（GSC 的 loading 态）。 */
  isLoading: boolean;
  /** 是否有可用的中间帧地址。 */
  hasFrame: boolean;
  /** 是否已处于终态（完成/失败）。 */
  isTerminal?: boolean;
}

/**
 * 中间帧渲染闸门：**只**在生成中、且有真实帧地址时渲染。
 *
 * 这是状态建模而非 CSS 遮盖：完成 / 失败 / 暂停 / 取消时该层根本不进入渲染树，
 * 所以不存在「中间帧覆盖最终产物」的窗口，也不需要用 `display:none` 掩盖。
 */
export function shouldRenderIntermediateFrame(gate: IntermediateFrameGate): boolean {
  if (!gate.isLoading || gate.isTerminal) return false;
  return gate.hasFrame;
}

/**
 * 生成中是否显示实时进度行（百分比 + 状态文案）。
 * 有真实进度或真实文案才显示 —— 两者皆无时不渲染一行空进度。
 */
export function hasLiveProgress(progress: unknown, message: unknown): boolean {
  return normalizeProgressValue(progress) !== undefined
    || (typeof message === 'string' && message.trim().length > 0);
}

/** 进度行的主文案：优先真实状态文案，缺省回退调用方给的 loading 文案。 */
export function resolveProgressLabel(
  message: unknown,
  fallback: string,
): string {
  if (typeof message === 'string' && message.trim()) return message.trim();
  return fallback;
}

/** 进度百分比文案（无有效进度时返回 undefined，不显示 0%）。 */
export function resolveProgressPercentText(progress: unknown): string | undefined {
  const normalized = normalizeProgressValue(progress);
  return normalized === undefined ? undefined : `${normalized}%`;
}

export interface NodeExecutionProgressView {
  progress?: number;
  progressMessage?: string;
  previewUrl?: string;
}

/**
 * 从节点数据读取实时进度视图（纯函数）。
 *
 * 字段缺失时对应项为 `undefined` —— 调用方据此跳过渲染，而不是拿 0 / 空串顶上。
 */
export function readNodeExecutionProgress(
  data: Record<string, unknown> | undefined,
): NodeExecutionProgressView {
  if (!data) return {};
  const view: NodeExecutionProgressView = {};

  const progress = normalizeProgressValue(data[EXECUTION_PROGRESS_FIELD]);
  if (progress !== undefined) view.progress = progress;

  const message = data[EXECUTION_PROGRESS_MESSAGE_FIELD];
  if (typeof message === 'string' && message.trim()) view.progressMessage = message.trim();

  const previewUrl = pickPreviewUrl({ previewUrl: data[EXECUTION_PREVIEW_URL_FIELD] });
  if (previewUrl !== undefined) view.previewUrl = previewUrl;

  return view;
}
