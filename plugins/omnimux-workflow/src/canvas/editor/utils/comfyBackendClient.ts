/**
 * 托管后端客户端 + 状态 → 界面映射（Issue #3701 M2c，纯前端）。
 *
 * 两件事放一起，因为它们共用同一份状态形状：
 *  1. **客户端**：走岛侧统一的 `request`（同源相对路径、`{ ok, status, body }` 风格）。
 *     宿主路由是长任务（安装/启动不在请求里等），所以这里只发动作与读状态。
 *  2. **映射**：把后端状态机翻译成「这一刻界面上唯一该做的事」，纯函数、可离线单测。
 *
 * 为什么不 import `workflow/comfyBackend/plan.ts`：那个文件属于宿主（node 侧）代码，
 * 画布 island 有自己的构建产物；import 值会把宿主代码打进画布 bundle。这里按同一份
 * 契约镜像常量与形状，并由单测断言与宿主逐值一致（`comfyBackendClient.test.mjs`）。
 *
 * 传输失败的处理：`request` 在断网/abort 时会 reject，而调用方（React 组件）需要拿到
 * 一个可判定的结果而不是异常穿透渲染。`transportFailure` 返回的是**显式失败**
 * （`ok: false` + `status: 0` + `body.error` 带原因），界面据此显示可读错误与重试，
 * 绝不把失败渲染成成功态。
 */

import { WORKFLOW_API_ROUTES } from '../../../shared/api.ts';
import { request, type ApiErrorEnvelope } from '../../bridge/apiClient.ts';

/** 状态机取值（镜像宿主 `COMFY_BACKEND_STATES`，由单测锁一致性）。 */
export const COMFY_BACKEND_STATES = [
  'not-installed',
  'installing',
  'installed',
  'starting',
  'ready',
  'failed',
] as const;

export type ComfyBackendState = (typeof COMFY_BACKEND_STATES)[number];

/** 轮询间隔：只有安装中/启动中才轮询（M2c 规格：1.5s）。 */
export const COMFY_BACKEND_POLL_MS = 1500;

/** 日志默认行数（与宿主路由默认值一致）。 */
export const COMFY_BACKEND_LOG_LINES = 200;

/** 未安装时需要展示的目标描述（体积/版本/平台）。 */
export interface ComfyBackendTarget {
  id: string;
  platform: string;
  arch: string;
  pythonVersion: string;
  torchVersion: string;
  comfyuiTag: string;
  comfyuiCommit: string;
  port: number;
  estimatedBytes: number;
}

export interface ComfyBackendStatus {
  state: ComfyBackendState;
  stage: string | null;
  /** 0–100 整数，直接来自后端状态文件，前端不估算。 */
  percent: number;
  message: string;
  error: string | null;
  pid: number | null;
  updatedAt: number;
  target: ComfyBackendTarget | null;
  /** 安装根目录（绝对路径）；宿主未上报时为空串，界面回落到目录名。 */
  installRoot: string;
}

export interface ComfyBackendStatusEnvelope extends ApiErrorEnvelope {
  status?: unknown;
}

export interface ComfyBackendLogEnvelope extends ApiErrorEnvelope {
  lines?: unknown;
}

export interface ComfyBackendResult<T> {
  ok: boolean;
  status: number;
  body: T;
}

/** 无网络/被 abort 时的失败状态码：与任何 HTTP 状态码区分开。 */
export const COMFY_BACKEND_TRANSPORT_STATUS = 0;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null;
  return value as Record<string, unknown>;
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' ? value : null;
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 把任意 JSON 解析成目标描述；缺字段按空值省略（不编造版本号）。 */
export function parseComfyBackendTarget(raw: unknown): ComfyBackendTarget | null {
  const source = asRecord(raw);
  if (!source) return null;
  const id = readString(source, 'id');
  if (!id) return null;
  const python = asRecord(source.python);
  const torch = asRecord(source.torch);
  const comfyui = asRecord(source.comfyui);
  return {
    id,
    platform: readString(source, 'platform') ?? '',
    arch: readString(source, 'arch') ?? '',
    pythonVersion: (python ? readString(python, 'version') : null) ?? '',
    torchVersion: (torch ? readString(torch, 'version') : null) ?? '',
    comfyuiTag: (comfyui ? readString(comfyui, 'tag') : null) ?? '',
    comfyuiCommit: (comfyui ? readString(comfyui, 'commit') : null) ?? '',
    port: readNumber(source, 'port') ?? 0,
    estimatedBytes: readNumber(source, 'estimatedBytes') ?? 0,
  };
}

function isComfyBackendState(value: unknown): value is ComfyBackendState {
  return typeof value === 'string' && (COMFY_BACKEND_STATES as readonly string[]).includes(value);
}

/**
 * 把 `{ status }` 解析成状态；形状不认识时返回 null —— 调用方据此显示可读错误，
 * 不猜状态、不把未知形状当成「未安装」。
 */
export function parseComfyBackendStatus(raw: unknown): ComfyBackendStatus | null {
  const source = asRecord(raw);
  if (!source) return null;
  const state = source.state;
  if (!isComfyBackendState(state)) return null;
  return {
    state,
    stage: readString(source, 'stage'),
    percent: readNumber(source, 'percent') ?? 0,
    message: readString(source, 'message') ?? '',
    error: readString(source, 'error'),
    pid: readNumber(source, 'pid'),
    updatedAt: readNumber(source, 'updatedAt') ?? 0,
    target: parseComfyBackendTarget(source.target),
    installRoot: readString(source, 'installRoot') ?? '',
  };
}

/** `{ lines: string[] }` 解析：非字符串元素丢弃，缺字段给空数组（不是错误）。 */
export function parseComfyBackendLog(raw: unknown): string[] {
  const source = asRecord(raw);
  if (!source) return [];
  const lines = source.lines;
  if (!Array.isArray(lines)) return [];
  const result: string[] = [];
  for (const line of lines) {
    if (typeof line === 'string') result.push(line);
  }
  return result;
}

/** 传输层失败的显式结果：`ok: false` + 原因，调用方必须走错误分支。 */
function transportFailure<T extends ApiErrorEnvelope>(error: unknown): ComfyBackendResult<T> {
  const message = error instanceof Error ? error.message : String(error);
  const body = { error: message } as unknown as T;
  return { ok: false, status: COMFY_BACKEND_TRANSPORT_STATUS, body };
}

/**
 * `request` 在传输层失败（断网、abort）时会 reject；这里把它转成显式失败结果，
 * 因此调用方永远拿到 `{ ok, status, body }`，不需要 try/catch。
 */
async function safeRequest<T extends ApiErrorEnvelope>(
  path: string,
  opts: { method?: string; signal?: AbortSignal } = {},
): Promise<ComfyBackendResult<T>> {
  try {
    return await request<T>(path, opts);
  } catch (error) {
    return transportFailure<T>(error);
  }
}

export function fetchComfyBackendState(signal?: AbortSignal) {
  return safeRequest<ComfyBackendStatusEnvelope>(WORKFLOW_API_ROUTES.comfyBackendState, { signal });
}

export function fetchComfyBackendLog(lines: number = COMFY_BACKEND_LOG_LINES, signal?: AbortSignal) {
  return safeRequest<ComfyBackendLogEnvelope>(WORKFLOW_API_ROUTES.comfyBackendLog(lines), { signal });
}

export function installComfyBackend(signal?: AbortSignal) {
  return safeRequest<ComfyBackendStatusEnvelope>(WORKFLOW_API_ROUTES.comfyBackendInstall, {
    method: 'POST',
    signal,
  });
}

export function startComfyBackend(signal?: AbortSignal) {
  return safeRequest<ComfyBackendStatusEnvelope>(WORKFLOW_API_ROUTES.comfyBackendStart, {
    method: 'POST',
    signal,
  });
}

export function stopComfyBackend(signal?: AbortSignal) {
  return safeRequest<ComfyBackendStatusEnvelope>(WORKFLOW_API_ROUTES.comfyBackendStop, {
    method: 'POST',
    signal,
  });
}

// ============================================================================
// 状态 → 界面（纯函数）
// ============================================================================

/** 该状态下唯一的主行动。 */
export type ComfyBackendPrimaryAction = 'install' | 'start' | 'retry-install' | 'retry-start' | 'none';

export interface ComfyBackendView {
  state: ComfyBackendState;
  /** 状态文案 i18n key。 */
  stateKey: string;
  /** 同一时刻唯一的主行动；'none' 表示该状态只展示。 */
  primaryAction: ComfyBackendPrimaryAction;
  /** 是否显示确定进度条（安装中）。 */
  showProgress: boolean;
  /** 是否显示「正在启动」的不确定进度。 */
  showStarting: boolean;
  /** 是否直接渲染真编辑器 iframe。 */
  showFrame: boolean;
  /** 是否允许展开日志（安装/启动/失败才有诊断价值）。 */
  showLog: boolean;
  /** 0–100 整数，直接透传后端 percent（非安装中为 0）。 */
  percent: number;
  /** 阶段文案 i18n key；无阶段为 null。 */
  stageKey: string | null;
  /** 失败原因文案 i18n key；非失败态为 null。 */
  errorKey: string | null;
}

const STATE_KEYS: Record<ComfyBackendState, string> = {
  'not-installed': 'comfyPage.backend.state.notInstalled',
  installing: 'comfyPage.backend.state.installing',
  installed: 'comfyPage.backend.state.installed',
  starting: 'comfyPage.backend.state.starting',
  ready: 'comfyPage.backend.state.ready',
  failed: 'comfyPage.backend.state.failed',
};

/** 安装阶段 i18n key（阶段 id 与宿主 `INSTALL_STAGES` 一一对应）。 */
const STAGE_KEYS: Record<string, string> = {
  runtime: 'comfyPage.backend.stage.runtime',
  extract: 'comfyPage.backend.stage.extract',
  venv: 'comfyPage.backend.stage.venv',
  torch: 'comfyPage.backend.stage.torch',
  source: 'comfyPage.backend.stage.source',
  requirements: 'comfyPage.backend.stage.requirements',
  done: 'comfyPage.backend.stage.done',
};

/** 失败原因 i18n key（错误码来自宿主 service.ts）。 */
const ERROR_KEYS: Record<string, string> = {
  'unsupported-platform': 'comfyPage.backend.error.unsupportedPlatform',
  'install-failed': 'comfyPage.backend.error.installFailed',
  'start-timeout': 'comfyPage.backend.error.startTimeout',
};

export function comfyBackendStageKey(stage: string | null): string | null {
  if (!stage) return null;
  return STAGE_KEYS[stage] ?? null;
}

export function comfyBackendErrorKey(error: string | null): string | null {
  if (!error) return null;
  return ERROR_KEYS[error] ?? 'comfyPage.backend.error.unknown';
}

/**
 * 失败后「重试」该走哪条路：按宿主写入的错误码判定，不靠猜。
 *
 * - `unsupported-platform`：平台不支持，重试没有意义 → `none`（只给原因）。
 * - `install-failed`：装的过程失败 → 重新安装。
 * - `start-timeout`：装好了起不来 → 重新启动。
 * - 未知错误码：回到安装（最保守的一步，安装会重新校验环境）。
 */
export function resolveFailedRetry(error: string | null): ComfyBackendPrimaryAction {
  if (error === 'unsupported-platform') return 'none';
  if (error === 'start-timeout') return 'retry-start';
  return 'retry-install';
}

/** 状态机 → 界面。纯函数：不读网络、不读 store，可离线断言六个状态。 */
export function resolveComfyBackendView(status: ComfyBackendStatus): ComfyBackendView {
  const base = {
    state: status.state,
    stateKey: STATE_KEYS[status.state],
    percent: 0,
    stageKey: null as string | null,
    errorKey: null as string | null,
    showProgress: false,
    showStarting: false,
    showFrame: false,
    showLog: false,
  };

  switch (status.state) {
    case 'not-installed':
      return { ...base, primaryAction: 'install' };
    case 'installing':
      return {
        ...base,
        primaryAction: 'none',
        showProgress: true,
        showLog: true,
        percent: status.percent,
        stageKey: comfyBackendStageKey(status.stage),
      };
    case 'installed':
      return { ...base, primaryAction: 'start' };
    case 'starting':
      return { ...base, primaryAction: 'none', showStarting: true, showLog: true };
    case 'ready':
      return { ...base, primaryAction: 'none', showFrame: true };
    case 'failed':
      return {
        ...base,
        primaryAction: resolveFailedRetry(status.error),
        showLog: true,
        errorKey: comfyBackendErrorKey(status.error),
      };
    default:
      // 状态机取值在 parse 阶段已校验；保留兜底分支以免未来新增状态时崩。
      return { ...base, primaryAction: 'none' };
  }
}

/** 人读体积，与宿主 `plan.formatBytes` 同规则（单测逐值比对）。 */
export function formatComfyBackendBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * 有状态 → 状态机面板；没拿到状态 → `unavailable`（**不是** `not-installed`）。
 *
 * 「读不到状态」被当成「未安装」是对着用户谎报「没装」，而且点「安装后端」不会有
 * 任何反应（同一路由同样失败）。所以 `unavailable` 只表示「状态未知」，具体怎么
 * 展示由 `shouldProbeComfyPage` 决定：回落 M1 探测，而不是给死胡同面板。
 */
export type ComfyBackendPanel =
  | { kind: 'state'; state: ComfyBackendState; stateKey: string; view: ComfyBackendView }
  | { kind: 'unavailable'; state: 'unavailable'; stateKey: string; view: null };

/** 纯函数：状态缺失 → unavailable；有状态 → 状态机面板。可离线断言。 */
export function resolveComfyBackendPanel(status: ComfyBackendStatus | null): ComfyBackendPanel {
  if (!status) {
    return {
      kind: 'unavailable',
      state: 'unavailable',
      stateKey: 'comfyPage.backend.stateUnavailable',
      view: null,
    };
  }
  const view = resolveComfyBackendView(status);
  return { kind: 'state', state: status.state, stateKey: view.stateKey, view };
}

/**
 * 该不该走 M1 探测/引导（纯函数）：
 *  - 用户手填地址（非托管）→ 一直探测；
 *  - 托管地址但**状态读不到** → 回落探测。后端是独立进程，宿主状态路由不可用
 *    并不代表页面不可用；把能打开的编辑器换成「状态未知」面板是回归。
 *  - 托管地址且拿到了状态 → 走状态机面板，不探测。
 */
export function shouldProbeComfyPage(managed: boolean, status: ComfyBackendStatus | null): boolean {
  return !managed || status === null;
}
