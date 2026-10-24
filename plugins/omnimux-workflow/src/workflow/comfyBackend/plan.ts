/**
 * ComfyUI 托管后端的固定目标表与状态机（Issue #3690 M2a，纯函数）。
 *
 * 用户已拍板「从上游固定版本安装」：不自建 bundle、不自建 CDN。本文件只声明
 * **装什么**（每个平台一份固定版本 + sha256）与**怎么表达状态**，不碰网络与文件系统，
 * 因此可离线单测；真正的下载/解压/建 venv/启动在 `service.ts`。
 *
 * 版本与哈希是 2026-10-24 从上游公开元数据核对的（python-build-standalone release
 * 20261021 的资产 digest、PyPI torch 2.9.1 的 wheel digest、ComfyUI v0.42.5 的 tag
 * commit）。升级 = 改这里的常量 + 改单测，不允许在安装时「装最新」。
 */

/**
 * 托管后端端口：固定 18188，避开用户自己装的 ComfyUI 默认 8188。
 *
 * 主机名用 `localhost` 而不是 `127.0.0.1`：DSH 自己的 `dsh-auth` cookie 是 host-only
 * 绑在 127.0.0.1 上的（很长），浏览器从画布 iframe 请求 127.0.0.1:18188 时会带上它，
 * 而 ComfyUI 的 aiohttp 请求头上限是 8190 字节 → 直接报
 * 「Got more than 8190 bytes when reading: b'dsh-auth=…'」，页面打不开。
 * 换成 `localhost` 属于不同 host，cookie 不带 → 真编辑器正常渲染（已实测，见证据）。
 * 后端仍只监听回环地址，不对外暴露。
 */
export const COMFY_BACKEND_PORT = 18188;
export const COMFY_BACKEND_HOST = 'localhost';
export const COMFY_BACKEND_BASE_URL = `http://${COMFY_BACKEND_HOST}:${COMFY_BACKEND_PORT}`;
/** 就绪探测路径（ComfyUI 自带，返回 JSON）。 */
export const COMFY_BACKEND_READY_PATH = '/system_stats';

export const COMFYUI_REPO = 'comfyanonymous/ComfyUI';
export const COMFYUI_TAG = 'v0.42.5';
export const COMFYUI_COMMIT = '483dae4326356b81de05d27aca3f433dd323cc25';
export const PYTHON_BUILD_TAG = '20261021';
export const PYTHON_VERSION = '3.12.15';
export const TORCH_VERSION = '2.9.1';

const PBS_BASE = `https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_BUILD_TAG}`;

export interface ComfyBackendTarget {
  /** 目标标识，同时用作安装目录名（`<root>/targets/<id>` 的 key）。 */
  id: string;
  platform: string;
  arch: string;
  python: { version: string; asset: string; url: string; sha256: string; bytes: number };
  torch: { version: string; wheel: string; url: string; sha256: string; bytes: number };
  comfyui: { repo: string; tag: string; commit: string; tarball: string };
  port: number;
  /** 预计下载体积（字节）：Python 运行时 + torch wheel + ComfyUI 源码（约 12MB）。 */
  estimatedBytes: number;
}

export type ComfyBackendTargetResult =
  | { ok: true; target: ComfyBackendTarget }
  | { ok: false; reason: 'unsupported-platform'; platform: string; arch: string };

/** ComfyUI 源码 tarball 的保守估计体积（codeload 约 12MB 量级）。 */
const COMFYUI_SOURCE_BYTES = 12 * 1024 * 1024;

const TARGETS: readonly ComfyBackendTarget[] = [
  {
    id: 'darwin-arm64',
    platform: 'darwin',
    arch: 'arm64',
    python: {
      version: PYTHON_VERSION,
      asset: `cpython-${PYTHON_VERSION}+${PYTHON_BUILD_TAG}-aarch64-apple-darwin-install_only.tar.gz`,
      url: `${PBS_BASE}/cpython-${PYTHON_VERSION}%2B${PYTHON_BUILD_TAG}-aarch64-apple-darwin-install_only.tar.gz`,
      sha256: 'a18cc33862b53bd54a148c710def5375c1b47470cccedf817a19c2d211764584',
      bytes: 25158763,
    },
    torch: {
      version: TORCH_VERSION,
      wheel: `torch-${TORCH_VERSION}-cp312-none-macosx_11_0_arm64.whl`,
      url: `https://files.pythonhosted.org/packages/6e/ab/07739fd776618e5882661d04c43f5b5586323e2f6a2d7d84aac20d8f20bd/torch-${TORCH_VERSION}-cp312-none-macosx_11_0_arm64.whl`,
      sha256: 'c0d25d1d8e531b8343bea0ed811d5d528958f1dcbd37e7245bc686273177ad7e',
      bytes: 74479191,
    },
    comfyui: {
      repo: COMFYUI_REPO,
      tag: COMFYUI_TAG,
      commit: COMFYUI_COMMIT,
      tarball: `https://codeload.github.com/${COMFYUI_REPO}/tar.gz/${COMFYUI_COMMIT}`,
    },
    port: COMFY_BACKEND_PORT,
    estimatedBytes: 25158763 + 74479191 + COMFYUI_SOURCE_BYTES,
  },
];

/** 平台/架构 → 固定目标；不支持的平台显式拒绝（不猜、不回退到别的平台产物）。 */
export function resolveComfyBackendTarget(platform: string, arch: string): ComfyBackendTargetResult {
  const found = TARGETS.find((target) => target.platform === platform && target.arch === arch);
  if (found) return { ok: true, target: found };
  return { ok: false, reason: 'unsupported-platform', platform, arch };
}

/** 本机目标（`process.platform` / `process.arch`）。 */
export function resolveLocalComfyBackendTarget(
  platform: string = process.platform,
  arch: string = process.arch,
): ComfyBackendTargetResult {
  return resolveComfyBackendTarget(platform, arch);
}

export type ComfyBackendState = 'not-installed' | 'installing' | 'installed' | 'starting' | 'ready' | 'failed';

export const COMFY_BACKEND_STATES: readonly ComfyBackendState[] = [
  'not-installed',
  'installing',
  'installed',
  'starting',
  'ready',
  'failed',
];

/** 安装阶段：顺序固定，`percent` 由阶段权重算出（不靠猜时间）。 */
export const INSTALL_STAGES = [
  { id: 'runtime', label: '下载 Python 运行时', weight: 0.12 },
  { id: 'extract', label: '解压运行时', weight: 0.06 },
  { id: 'venv', label: '创建虚拟环境', weight: 0.06 },
  { id: 'torch', label: '安装 PyTorch', weight: 0.4 },
  { id: 'source', label: '下载 ComfyUI 源码', weight: 0.06 },
  { id: 'requirements', label: '安装 ComfyUI 依赖', weight: 0.3 },
] as const;

export type InstallStageId = (typeof INSTALL_STAGES)[number]['id'];

/** 失败分类（Issue #3717 M3）：状态里带一个码，界面据此给唯一主行动。 */
export type ComfyBackendFailure =
  | 'unsupported-platform'
  | 'install-dir-not-writable'
  | 'insufficient-disk'
  | 'port-occupied'
  | 'driver-unsupported'
  | 'version-mismatch'
  | 'install-failed'
  | 'start-timeout';

export const COMFY_BACKEND_FAILURES: readonly ComfyBackendFailure[] = [
  'unsupported-platform',
  'install-dir-not-writable',
  'insufficient-disk',
  'port-occupied',
  'driver-unsupported',
  'version-mismatch',
  'install-failed',
  'start-timeout',
];

/** 已装 pin 与当前目标 pin 是否一致（不一致 = 需要更新）。 */
export function versionMatches(
  ready: { comfyui?: { commit?: string }; python?: string; torch?: string } | null,
  target: ComfyBackendTarget,
): boolean {
  if (!ready) return false;
  const commit = ready.comfyui?.commit;
  if (typeof commit !== 'string' || commit !== target.comfyui.commit) return false;
  if (ready.python !== undefined && ready.python !== target.python.version) return false;
  if (ready.torch !== undefined && ready.torch !== target.torch.version) return false;
  return true;
}

export interface ComfyBackendStatus {
  state: ComfyBackendState;
  stage: InstallStageId | 'done' | null;
  /** 0–100 整数；`done` 恒为 100。 */
  percent: number;
  message: string;
  error: string | null;
  pid: number | null;
  updatedAt: number;
  /** 未安装时带上目标描述（体积/版本），供 UI 展示「要装什么」。 */
  target: ComfyBackendTarget | null;
  /** 安装根绝对路径：UI 要如实告诉用户装到哪，不给相对片段。 */
  installRoot: string;
  /** 失败分类码（M3）：界面据此给唯一主行动；正常状态为 null。 */
  failure: ComfyBackendFailure | null;
}

/** 阶段 + 阶段内比例 → 总进度（0–100 整数）。 */
export function installPercent(stage: unknown, stageRatio = 0): number {
  if (stage === 'done') return 100;
  const index = INSTALL_STAGES.findIndex((item) => item.id === stage);
  if (index < 0) return 0;
  const before = INSTALL_STAGES.slice(0, index).reduce((sum, item) => sum + item.weight, 0);
  const stageSpec = INSTALL_STAGES[index];
  if (!stageSpec) return 0;
  const current = stageSpec.weight;
  const ratio = Number.isFinite(stageRatio) ? Math.min(Math.max(stageRatio, 0), 1) : 0;
  return Math.min(99, Math.round((before + current * ratio) * 100));
}

export function stageLabel(stage: unknown): string {
  if (stage === 'done') return '安装完成';
  const found = INSTALL_STAGES.find((item) => item.id === stage);
  return found ? found.label : '准备中';
}

/** 人读体积（保留一位小数，GB/MB 二选一）。 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * 状态机的一次合法推进：只允许沿固定边迁移，非法迁移原样返回旧状态。
 *
 * 允许：not-installed → installing；installing → installed|failed；
 * installed → starting|installing（重装）；starting → ready|failed；
 * ready → installed（后端退出）；failed → installing|starting。
 */
export function nextState(current: ComfyBackendState, event: string): ComfyBackendState {
  const allowed: Record<ComfyBackendState, readonly string[]> = {
    'not-installed': ['install'],
    installing: ['installed', 'failed'],
    installed: ['start', 'install', 'not-installed'],
    starting: ['ready', 'failed'],
    ready: ['installed', 'failed', 'install'],
    failed: ['install', 'start', 'not-installed'],
  };
  const events = allowed[current] ?? [];
  if (!events.includes(event)) return current;
  if (event === 'install') return 'installing';
  if (event === 'start') return 'starting';
  if (event === 'ready') return 'ready';
  if (event === 'installed') return 'installed';
  if (event === 'not-installed') return 'not-installed';
  return 'failed';
}
