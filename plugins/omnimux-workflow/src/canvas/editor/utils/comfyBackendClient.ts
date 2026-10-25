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

/**
 * 失败分类（镜像宿主 `COMFY_BACKEND_FAILURES`，由单测锁一致性）。
 * 界面据此给**唯一**主行动，不再只显示一句「安装失败」。
 */
export const COMFY_BACKEND_FAILURES = [
  'unsupported-platform',
  'install-dir-not-writable',
  'insufficient-disk',
  'port-occupied',
  'driver-unsupported',
  'version-mismatch',
  'install-failed',
  'start-timeout',
  'driver-unsatisfied',
  'variant-required',
  'unsupported-variant',
] as const;

export type ComfyBackendFailure = (typeof COMFY_BACKEND_FAILURES)[number];

/**
 * 驱动结论（镜像宿主 `driver.ts` 的 `DriverStatus`）：不检查也要说出来，
 * 沉默等于假装检查过。`unsupported` 是 M3 老宿主的遗留取值——保留解析与文案，
 * 让画布在旧宿主上仍然说人话，而不是把它当未知。
 */
export const COMFY_BACKEND_DRIVERS = [
  'not-required',
  'satisfied',
  'unsatisfied',
  'unknown',
  'unsupported',
] as const;

export type ComfyBackendDriver = (typeof COMFY_BACKEND_DRIVERS)[number];

/** 方案支持度（宿主 `ComfyBackendSupport`）：supported = 真机装过，candidate = pin 齐全但未验证。 */
export const COMFY_BACKEND_SUPPORTS = ['supported', 'candidate'] as const;

export type ComfyBackendSupport = (typeof COMFY_BACKEND_SUPPORTS)[number];

/** 方案需要的驱动类型（宿主 `ComfyBackendDriverRequirement`）。 */
export const COMFY_BACKEND_DRIVER_REQUIREMENTS = ['none', 'nvidia', 'directml', 'xpu'] as const;

export type ComfyBackendDriverRequirement = (typeof COMFY_BACKEND_DRIVER_REQUIREMENTS)[number];

/** 目标解析不出来的原因（宿主 `ComfyBackendTargetResult`）。 */
export const COMFY_BACKEND_TARGET_PROBLEMS = [
  'variant-required',
  'unsupported-platform',
  'unsupported-variant',
] as const;

export type ComfyBackendTargetProblem = (typeof COMFY_BACKEND_TARGET_PROBLEMS)[number];

/** 矩阵摘要里的一行（宿主 `listComfyBackendTargets()`）：给用户看「能选哪些方案」。 */
export interface ComfyBackendVariantRow {
  id: string;
  variant: string;
  platform: string;
  arch: string;
  support: ComfyBackendSupport;
  /** 宿主给的名称（zh）。画布优先用自己的 i18n 名称，未知 id 才回落这个。 */
  label: string;
  /** 宿主给的实话（基座差异、未真机验证等）：原样展示，不藏。 */
  notes: string;
  driver: ComfyBackendDriverRequirement;
  minDriver: string | null;
  estimatedBytes: number;
  torchVersion: string;
}

/** 所选方案的驱动判定（宿主 `driverVerdict()`）：结论 + 人话 + 下限。 */
export interface ComfyBackendDriverVerdict {
  status: ComfyBackendDriver;
  detail: string;
  required: string | null;
}

/** 用户设置：空串 = 用默认（安装根 = 插件数据目录；模型目录 = 不接外部目录）。 */
export interface ComfyBackendSettings {
  installRoot: string;
  modelsPath: string;
}

/** 设置校验失败码（宿主 `SettingsValidationCode` + 落盘失败）。 */
export const COMFY_BACKEND_SETTINGS_CODES = [
  'not-absolute',
  'not-found',
  'not-a-directory',
  'not-writable',
  'same-as-install-root',
  'settings-write-failed',
] as const;

export type ComfyBackendSettingsCode = (typeof COMFY_BACKEND_SETTINGS_CODES)[number];

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
  /** 失败分类码（M3）；正常状态为 null。界面据此给唯一主行动。 */
  failure: ComfyBackendFailure | null;
}

export interface ComfyBackendStatusEnvelope extends ApiErrorEnvelope {
  status?: unknown;
  /** 当前生效的设置（空串 = 默认）。 */
  settings?: unknown;
  /** 装之前需要的字节数（预检口径）。 */
  requiredBytes?: unknown;
  /** 本机是否需要额外驱动（四态）。 */
  driver?: unknown;
  /** 驱动判定的人话说明（宿主给的原文，作为补充信息）。 */
  driverDetail?: unknown;
  /** 该方案要求的驱动下限。 */
  driverRequired?: unknown;
  /** 当前方案 id（null = 还没定）。 */
  variant?: unknown;
  /** 当前方案的支持度。 */
  support?: unknown;
  /** 目标解析不出来的原因（多候选/不支持）。 */
  targetProblem?: unknown;
  /** `variant-required` 时的候选方案 id。 */
  targetOptions?: unknown;
  /** 平台矩阵摘要（6 行）。 */
  variants?: unknown;
}

export interface ComfyBackendSettingsEnvelope extends ApiErrorEnvelope {
  ok?: unknown;
  code?: unknown;
  settings?: unknown;
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

function isComfyBackendFailure(value: unknown): value is ComfyBackendFailure {
  return typeof value === 'string' && (COMFY_BACKEND_FAILURES as readonly string[]).includes(value);
}

function isSettingsCode(value: unknown): value is ComfyBackendSettingsCode {
  return typeof value === 'string' && (COMFY_BACKEND_SETTINGS_CODES as readonly string[]).includes(value);
}

/** 失败码解析：未知/缺失给 null（界面按「未知失败」处理，不猜类型）。 */
export function parseComfyBackendFailure(raw: unknown): ComfyBackendFailure | null {
  return isComfyBackendFailure(raw) ? raw : null;
}

/** 驱动结论解析：未知/缺失按 `unknown`（不假装检查过）。 */
export function parseComfyBackendDriver(raw: unknown): ComfyBackendDriver {
  return typeof raw === 'string' && (COMFY_BACKEND_DRIVERS as readonly string[]).includes(raw)
    ? (raw as ComfyBackendDriver)
    : 'unknown';
}

/** 设置解析：非字符串/缺字段按空串（空串 = 默认，不编造路径）。 */
export function parseComfyBackendSettings(raw: unknown): ComfyBackendSettings {
  const source = asRecord(raw);
  if (!source) return { installRoot: '', modelsPath: '' };
  return {
    installRoot: readString(source, 'installRoot') ?? '',
    modelsPath: readString(source, 'modelsPath') ?? '',
  };
}

/** 设置响应里的校验码：认识才返回，否则 null（调用方显示通用原因）。 */
export function parseComfyBackendSettingsCode(raw: unknown): ComfyBackendSettingsCode | null {
  return isSettingsCode(raw) ? raw : null;
}

function isSupport(value: unknown): value is ComfyBackendSupport {
  return typeof value === 'string' && (COMFY_BACKEND_SUPPORTS as readonly string[]).includes(value);
}

function isDriverRequirement(value: unknown): value is ComfyBackendDriverRequirement {
  return typeof value === 'string' && (COMFY_BACKEND_DRIVER_REQUIREMENTS as readonly string[]).includes(value);
}

/** 目标解析失败原因：未知/缺失给 null（当作「解析正常」处理，不猜原因）。 */
export function parseComfyBackendTargetProblem(raw: unknown): ComfyBackendTargetProblem | null {
  return typeof raw === 'string' && (COMFY_BACKEND_TARGET_PROBLEMS as readonly string[]).includes(raw)
    ? (raw as ComfyBackendTargetProblem)
    : null;
}

/**
 * 当前所选方案 id：非字符串/缺失给空串（空串 = 还没定，界面据此要求用户选）。
 * 从 `settings.variant` 或 `state` 信封顶层的 `variant` 都能读。
 */
export function parseComfyBackendVariant(raw: unknown): string {
  const source = asRecord(raw);
  if (!source) return '';
  return readString(source, 'variant') ?? '';
}

/** 当前方案的支持度：未知给 null（不声称「支持」）。 */
export function parseComfyBackendSupport(raw: unknown): ComfyBackendSupport | null {
  return isSupport(raw) ? raw : null;
}

/**
 * 驱动判定：从 `state` 信封读 `driver` / `driverDetail` / `driverRequired`。
 * 缺失一律 `unknown`（不假装检查过），不编下限。
 */
export function parseComfyBackendDriverVerdict(raw: unknown): ComfyBackendDriverVerdict {
  const source = asRecord(raw);
  if (!source) return { status: 'unknown', detail: '', required: null };
  return {
    status: parseComfyBackendDriver(source.driver),
    detail: readString(source, 'driverDetail') ?? '',
    required: readString(source, 'driverRequired'),
  };
}

/** 候选方案 id 列表：非字符串元素丢弃（顺序即宿主给的顺序）。 */
export function parseComfyBackendTargetOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item !== '') result.push(item);
  }
  return result;
}

/**
 * 平台矩阵摘要解析：形状不认识的行整行丢弃（宁可少一行，也不显示半行假数据）。
 * 支持度与驱动要求都必须是宿主声明过的取值，否则这一行不可信。
 */
export function parseComfyBackendVariants(raw: unknown): ComfyBackendVariantRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: ComfyBackendVariantRow[] = [];
  for (const item of raw) {
    const source = asRecord(item);
    if (!source) continue;
    const variant = readString(source, 'variant');
    const label = readString(source, 'label');
    const support = source.support;
    const driver = source.driver;
    if (!variant || !label || !isSupport(support) || !isDriverRequirement(driver)) continue;
    rows.push({
      id: readString(source, 'id') ?? variant,
      variant,
      platform: readString(source, 'platform') ?? '',
      arch: readString(source, 'arch') ?? '',
      support,
      label,
      notes: readString(source, 'notes') ?? '',
      driver,
      minDriver: readString(source, 'minDriver'),
      estimatedBytes: readNumber(source, 'estimatedBytes') ?? 0,
      torchVersion: readString(source, 'torchVersion') ?? '',
    });
  }
  return rows;
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
    failure: parseComfyBackendFailure(source.failure),
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
  opts: { method?: string; body?: unknown; signal?: AbortSignal } = {},
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

export function fetchComfyBackendSettings(signal?: AbortSignal) {
  return safeRequest<ComfyBackendSettingsEnvelope>(WORKFLOW_API_ROUTES.comfyBackendSettings, { signal });
}

/**
 * 写设置。只发用户真正改过的字段（`undefined` 不出现），因此「只改模型目录」
 * 不会顺手把安装根或所选方案重置。400 时 body 带 `code`，界面按码给原因。
 */
export function updateComfyBackendSettings(
  patch: { installRoot?: string; modelsPath?: string; variant?: string },
  signal?: AbortSignal,
) {
  return safeRequest<ComfyBackendSettingsEnvelope>(WORKFLOW_API_ROUTES.comfyBackendSettings, {
    method: 'POST',
    body: patch,
    signal,
  });
}

// ============================================================================
// 状态 → 界面（纯函数）
// ============================================================================

/** 该状态下唯一的主行动。 */
export type ComfyBackendPrimaryAction =
  | 'install'
  | 'start'
  | 'retry-install'
  | 'retry-start'
  /** 已装版本与当前固定目标不一致 → 用新版本重装（保留用户数据）。 */
  | 'update'
  /** 磁盘不够/目录不可写 → 打开设置换安装目录（不是「重试」，重试一定再失败）。 */
  | 'change-dir'
  /** 多候选方案没定 / 驱动不满足 → 打开方案列表让用户换一个（不自动挑）。 */
  | 'choose-variant'
  | 'none';

/** 面板之外还要用的信封信息（矩阵、驱动判定、目标问题）：都是可选的纯数据。 */
export interface ComfyBackendEnvelopeContext {
  targetProblem: ComfyBackendTargetProblem | null;
  targetOptions: string[];
  driver: ComfyBackendDriverVerdict;
  variant: string;
  support: ComfyBackendSupport | null;
  variants: ComfyBackendVariantRow[];
  requiredBytes: number;
}

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
  /** 是否展示「需要约 X」的磁盘需求行（仅磁盘不足）。 */
  showDiskRequired: boolean;
  /** 是否展示驱动结论（用户正在决定装不装 / 刚失败时）。 */
  showDriverNote: boolean;
  /** 目标解析问题的说明 i18n key（多候选/平台不支持/方案不可用）；无问题为 null。 */
  problemKey: string | null;
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

/** 失败分类 → 人话原因 i18n key（十一个码，M3/M4 的核心）。 */
const FAILURE_KEYS: Record<ComfyBackendFailure, string> = {
  'unsupported-platform': 'comfyPage.backend.failure.unsupportedPlatform',
  'install-dir-not-writable': 'comfyPage.backend.failure.installDirNotWritable',
  'insufficient-disk': 'comfyPage.backend.failure.insufficientDisk',
  'port-occupied': 'comfyPage.backend.failure.portOccupied',
  'driver-unsupported': 'comfyPage.backend.failure.driverUnsupported',
  'version-mismatch': 'comfyPage.backend.failure.versionMismatch',
  'install-failed': 'comfyPage.backend.failure.installFailed',
  'start-timeout': 'comfyPage.backend.failure.startTimeout',
  'driver-unsatisfied': 'comfyPage.backend.failure.driverUnsatisfied',
  'variant-required': 'comfyPage.backend.failure.variantRequired',
  'unsupported-variant': 'comfyPage.backend.failure.unsupportedVariant',
};

/** 驱动结论 → 文案 i18n key：每态都要说出来，`unknown` 不假装检查过。 */
const DRIVER_KEYS: Record<ComfyBackendDriver, string> = {
  'not-required': 'comfyPage.backend.driver.notRequired',
  satisfied: 'comfyPage.backend.driver.satisfied',
  unsatisfied: 'comfyPage.backend.driver.unsatisfied',
  unknown: 'comfyPage.backend.driver.unknown',
  unsupported: 'comfyPage.backend.driver.unsupported',
};

/** 方案支持度 → 徽标文案 key。 */
const SUPPORT_KEYS: Record<ComfyBackendSupport, string> = {
  supported: 'comfyPage.backend.support.supported',
  candidate: 'comfyPage.backend.support.candidate',
};

/** 方案要求的驱动类型 → 文案 key（矩阵每行的「驱动结论」列）。 */
const DRIVER_REQUIREMENT_KEYS: Record<ComfyBackendDriverRequirement, string> = {
  none: 'comfyPage.backend.driverReq.none',
  nvidia: 'comfyPage.backend.driverReq.nvidia',
  directml: 'comfyPage.backend.driverReq.directml',
  xpu: 'comfyPage.backend.driverReq.xpu',
};

/** 目标解析问题 → 说明文案 key。 */
const PROBLEM_KEYS: Record<ComfyBackendTargetProblem, string> = {
  'variant-required': 'comfyPage.backend.problem.variantRequired',
  'unsupported-platform': 'comfyPage.backend.problem.unsupportedPlatform',
  'unsupported-variant': 'comfyPage.backend.problem.unsupportedVariant',
};

/** 方案 id → 画布自己的名称 key（宿主 label 只有中文，英文界面回落它）。 */
const VARIANT_KEYS: Record<string, string> = {
  'darwin-arm64': 'comfyPage.backend.variant.darwinArm64',
  'win32-x64-cuda12': 'comfyPage.backend.variant.win32X64Cuda12',
  'win32-x64-cuda13': 'comfyPage.backend.variant.win32X64Cuda13',
  'win32-x64-amd-directml': 'comfyPage.backend.variant.win32X64AmdDirectml',
  'win32-x64-intel-xpu': 'comfyPage.backend.variant.win32X64IntelXpu',
  'linux-x64-cuda12': 'comfyPage.backend.variant.linuxX64Cuda12',
};

/** 设置校验失败码 → 原因 i18n key。 */
const SETTINGS_CODE_KEYS: Record<ComfyBackendSettingsCode, string> = {
  'not-absolute': 'comfyPage.backend.settingsCode.notAbsolute',
  'not-found': 'comfyPage.backend.settingsCode.notFound',
  'not-a-directory': 'comfyPage.backend.settingsCode.notADirectory',
  'not-writable': 'comfyPage.backend.settingsCode.notWritable',
  'same-as-install-root': 'comfyPage.backend.settingsCode.sameAsInstallRoot',
  'settings-write-failed': 'comfyPage.backend.settingsCode.writeFailed',
};

export function comfyBackendStageKey(stage: string | null): string | null {
  if (!stage) return null;
  return STAGE_KEYS[stage] ?? null;
}

export function comfyBackendErrorKey(error: string | null): string | null {
  if (!error) return null;
  return ERROR_KEYS[error] ?? 'comfyPage.backend.error.unknown';
}

/** 失败分类 → 人话原因 key；没有分类时返回 null（调用方回落 errorKey）。 */
export function comfyBackendFailureKey(failure: ComfyBackendFailure | null): string | null {
  if (!failure) return null;
  return FAILURE_KEYS[failure];
}

export function comfyBackendDriverKey(driver: ComfyBackendDriver): string {
  return DRIVER_KEYS[driver];
}

/**
 * 驱动结论怎么显示：结论文案 + 精确原因 + 结构化下限兜底。
 *
 * - `unknown` / `unsatisfied` 时把宿主 `driverDetail`（「查不到 NVIDIA 驱动版本」这类
 *   精确原因）**行内**显示，不能只藏在悬停里——否则用户看到「尚未判定」却不知道为什么；
 * - 已经行内显示原因时不再重复「（需要不低于 X）」；宿主没给原因时才用结构化下限兜底
 *   （`driverRequired` 是语言无关的版本号）；
 * - 结论本身是画布自己的双语文案，不受宿主文本语言影响。
 */
export function comfyBackendDriverDisplay(verdict: ComfyBackendDriverVerdict): {
  key: string;
  detail: string;
  requirement: string | null;
} {
  const detail = verdict.detail.trim();
  const needsReason = verdict.status === 'unknown' || verdict.status === 'unsatisfied';
  const inlineDetail = needsReason ? detail : '';
  const requirement = verdict.status === 'unsatisfied' && !inlineDetail ? verdict.required : null;
  return { key: DRIVER_KEYS[verdict.status], detail: inlineDetail, requirement };
}

/** 设置校验失败码 → 原因 key；未知码给通用原因，不编一个具体理由。 */
export function comfyBackendSettingsCodeKey(code: ComfyBackendSettingsCode | null): string {
  if (!code) return 'comfyPage.backend.settingsCode.unknown';
  return SETTINGS_CODE_KEYS[code];
}

export function comfyBackendSupportKey(support: ComfyBackendSupport): string {
  return SUPPORT_KEYS[support];
}

export function comfyBackendDriverRequirementKey(requirement: ComfyBackendDriverRequirement): string {
  return DRIVER_REQUIREMENT_KEYS[requirement];
}

/** 目标解析问题 → 说明 key；没问题返回 null。 */
export function comfyBackendProblemKey(problem: ComfyBackendTargetProblem | null): string | null {
  if (!problem) return null;
  return PROBLEM_KEYS[problem];
}

/** 方案名称 key；未知 id 返回 null（调用方回落宿主 label，不编名称）。 */
export function comfyBackendVariantKey(variant: string): string | null {
  if (!variant) return null;
  return VARIANT_KEYS[variant] ?? null;
}

/**
 * 候选方案在驱动不满足时不能装：返回必须让用户先解决的问题，否则 null。
 * 只判「候选 + 驱动不满足」这一种已知阻塞，`unknown` 不阻断（宿主也不阻断）。
 */
export function comfyBackendVariantBlocker(
  support: ComfyBackendSupport | null,
  driver: ComfyBackendDriver,
): ComfyBackendTargetProblem | null {
  if (support === 'candidate' && driver === 'unsatisfied') return 'unsupported-variant';
  return null;
}

/**
 * 失败分类 → 唯一主行动（M3 规格的映射，不并列多个按钮）：
 *  - `insufficient-disk` / `install-dir-not-writable` → 换目录（重试一定再失败）；
 *  - `version-mismatch` → 更新（宿主用新固定版本重装，保留用户数据）；
 *  - `install-failed` / `port-occupied` → 重试安装；
 *  - `start-timeout` → 重试启动；
 *  - `driver-unsatisfied` / `variant-required` → 换方案（重试只会再失败一次）；
 *  - `unsupported-platform` / `driver-unsupported` → 不给动作，只说明；
 *  - 未知码 → 回到安装（最保守的一步，安装会重新跑预检）。
 */
export function resolveFailureAction(
  failure: ComfyBackendFailure | null,
  error: string | null = null,
): ComfyBackendPrimaryAction {
  const code = failure ?? (isComfyBackendFailure(error) ? error : null);
  switch (code) {
    case 'insufficient-disk':
    case 'install-dir-not-writable':
      return 'change-dir';
    case 'driver-unsatisfied':
    case 'variant-required':
    case 'unsupported-variant':
      return 'choose-variant';
    case 'version-mismatch':
      return 'update';
    case 'start-timeout':
      return 'retry-start';
    case 'unsupported-platform':
    case 'driver-unsupported':
      return 'none';
    case 'install-failed':
    case 'port-occupied':
      return 'retry-install';
    default:
      return 'retry-install';
  }
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
  return resolveFailureAction(null, error);
}

/**
 * 状态机 → 界面。纯函数：不读网络、不读 store，可离线断言六个状态。
 *
 * `context` 是信封里的矩阵/驱动/目标问题（可选，M3 的调用方只传 status）。
 * 目标解析不出来时**不自动挑方案**：多候选（`variant-required`）与选到不可用方案
 * （`unsupported-variant`）都只给「选择方案」，让用户自己定。
 */
export function resolveComfyBackendView(
  status: ComfyBackendStatus,
  context?: ComfyBackendEnvelopeContext,
): ComfyBackendView {
  const problem = context ? context.targetProblem : null;
  /** 候选方案 + 驱动不满足：装下去一定失败，别让用户白等一次下载。 */
  const blocked = comfyBackendVariantBlocker(
    context ? context.support : null,
    context ? context.driver.status : 'unknown',
  );
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
    showDiskRequired: false,
    showDriverNote: false,
    problemKey: comfyBackendProblemKey(problem),
  };
  /** 目标问题压过默认主行动：多候选/方案不可用/驱动不满足时不装，先让用户选。 */
  const problemAction = (fallback: ComfyBackendPrimaryAction): ComfyBackendPrimaryAction => {
    if (problem === 'variant-required' || problem === 'unsupported-variant') return 'choose-variant';
    if (problem === 'unsupported-platform') return 'none';
    if (problem === null && blocked) return 'choose-variant';
    return fallback;
  };

  switch (status.state) {
    case 'not-installed':
      // 装之前正是「本机要不要额外驱动」该被说出来的时刻（沉默 = 假装检查过）。
      // 但方案还没定时驱动结论是针对某个方案的，没有结论可说——只留「请先选一个」。
      return { ...base, primaryAction: problemAction('install'), showDriverNote: problem === null };
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
      return { ...base, primaryAction: problemAction('start') };
    case 'starting':
      return { ...base, primaryAction: 'none', showStarting: true, showLog: true };
    case 'ready':
      return { ...base, primaryAction: 'none', showFrame: true };
    case 'failed':
      return {
        ...base,
        primaryAction: resolveFailureAction(status.failure, status.error),
        showLog: true,
        errorKey: comfyBackendFailureKey(status.failure) ?? comfyBackendErrorKey(status.error),
        showDiskRequired: status.failure === 'insufficient-disk',
        showDriverNote: true,
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
export function resolveComfyBackendPanel(
  status: ComfyBackendStatus | null,
  context?: ComfyBackendEnvelopeContext,
): ComfyBackendPanel {
  if (!status) {
    return {
      kind: 'unavailable',
      state: 'unavailable',
      stateKey: 'comfyPage.backend.stateUnavailable',
      view: null,
    };
  }
  const view = resolveComfyBackendView(status, context);
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
