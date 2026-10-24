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

/** 平台矩阵里的方案（一个平台可以有多套互斥的显卡方案）。 */
export type ComfyBackendVariant =
  | 'darwin-arm64'
  | 'win32-x64-cuda12'
  | 'win32-x64-cuda13'
  | 'win32-x64-amd-directml'
  | 'win32-x64-intel-xpu'
  | 'linux-x64-cuda12';

/** `supported` = 我们真机装过；`candidate` = pin 齐全但本机没法验证，需要用户显式选。 */
export type ComfyBackendSupport = 'supported' | 'candidate';

/** 该方案需要的驱动类型（判定在 `driver.ts`）。 */
export type ComfyBackendDriverRequirement = 'none' | 'nvidia' | 'directml' | 'xpu';

/** NVIDIA 驱动下限（官方发布说明的量级近似；cuda13 明显更严）。 */
export const MIN_NVIDIA_DRIVER_CUDA12 = '570.0';
export const MIN_NVIDIA_DRIVER_CUDA13 = '580.0';

export interface ComfyBackendWheel {
  wheel: string;
  url: string;
  sha256: string;
  bytes: number;
}

export interface ComfyBackendTarget {
  /** 目标标识，同时用作安装目录名（`<root>/targets/<id>` 的 key）。 */
  id: string;
  variant: ComfyBackendVariant;
  platform: string;
  arch: string;
  support: ComfyBackendSupport;
  label: string;
  /** 给用户看的实话：为什么是候选、基座差异等。 */
  notes: string;
  driver: ComfyBackendDriverRequirement;
  minDriver: string | null;
  python: { version: string; asset: string; url: string; sha256: string; bytes: number };
  torch: { version: string; wheels: ComfyBackendWheel[] };
  comfyui: { repo: string; tag: string; commit: string; tarball: string };
  port: number;
  /** 预计下载体积（字节）：Python 运行时 + 全部 wheel + ComfyUI 源码（约 12MB）。 */
  estimatedBytes: number;
}

export type ComfyBackendTargetResult =
  | { ok: true; target: ComfyBackendTarget }
  | {
      ok: false;
      reason: 'unsupported-platform' | 'unsupported-variant' | 'variant-required';
      platform: string;
      arch: string;
      variant?: string;
      /** `variant-required` 时给出可选方案。 */
      options?: string[];
    };

/** ComfyUI 源码 tarball 的保守估计体积（codeload 约 12MB 量级）。 */
const COMFYUI_SOURCE_BYTES = 12 * 1024 * 1024;

function pbsRuntime(assetSuffix: string, sha256: string, bytes: number) {
  const asset = `cpython-${PYTHON_VERSION}+${PYTHON_BUILD_TAG}-${assetSuffix}`;
  return {
    version: PYTHON_VERSION,
    asset,
    url: `${PBS_BASE}/${asset.replace('+', '%2B')}`,
    sha256,
    bytes,
  };
}

function comfySource() {
  return {
    repo: COMFYUI_REPO,
    tag: COMFYUI_TAG,
    commit: COMFYUI_COMMIT,
    tarball: `https://codeload.github.com/${COMFYUI_REPO}/tar.gz/${COMFYUI_COMMIT}`,
  };
}

function estimate(pythonBytes: number, wheelBytes: number[]): number {
  let total = pythonBytes + COMFYUI_SOURCE_BYTES;
  for (const bytes of wheelBytes) total += bytes;
  return total;
}

const WIN_RUNTIME: [string, string, number] = [
  'x86_64-pc-windows-msvc-install_only.tar.gz',
  'be7f14464d1d66f84429ad27e01f6d1482963afff64a2fb5256b2a51c7b5d398',
  46388793,
];

const TARGETS: readonly ComfyBackendTarget[] = [
  {
    id: 'darwin-arm64',
    variant: 'darwin-arm64',
    platform: 'darwin',
    arch: 'arm64',
    support: 'supported',
    label: 'macOS（Apple 芯片）',
    notes: '已在本机真机装过并跑通（PyTorch 走 MPS，不需要额外驱动）。',
    driver: 'none',
    minDriver: null,
    python: pbsRuntime('aarch64-apple-darwin-install_only.tar.gz', 'a18cc33862b53bd54a148c710def5375c1b47470cccedf817a19c2d211764584', 25158763),
    torch: {
      version: TORCH_VERSION,
      wheels: [
        {
          wheel: `torch-${TORCH_VERSION}-cp312-none-macosx_11_0_arm64.whl`,
          url: `https://files.pythonhosted.org/packages/6e/ab/07739fd776618e5882661d04c43f5b5586323e2f6a2d7d84aac20d8f20bd/torch-${TORCH_VERSION}-cp312-none-macosx_11_0_arm64.whl`,
          sha256: 'c0d25d1d8e531b8343bea0ed811d5d528958f1dcbd37e7245bc686273177ad7e',
          bytes: 74479191,
        },
      ],
    },
    comfyui: comfySource(),
    port: COMFY_BACKEND_PORT,
    estimatedBytes: 25158763 + 74479191 + COMFYUI_SOURCE_BYTES,
  },
  {
    id: 'win32-x64-cuda12',
    variant: 'win32-x64-cuda12',
    platform: 'win32',
    arch: 'x64',
    support: 'candidate',
    label: 'Windows · NVIDIA（CUDA 12.8）',
    notes: `候选：pin 已按上游元数据核对，但没有 Windows 机器真机验证过。需要 NVIDIA 驱动不低于 ${MIN_NVIDIA_DRIVER_CUDA12}。`,
    driver: 'nvidia',
    minDriver: MIN_NVIDIA_DRIVER_CUDA12,
    python: pbsRuntime(WIN_RUNTIME[0], WIN_RUNTIME[1], WIN_RUNTIME[2]),
    torch: {
      version: TORCH_VERSION,
      wheels: [
        {
          wheel: `torch-${TORCH_VERSION}+cu128-cp312-cp312-win_amd64.whl`,
          url: `https://download.pytorch.org/whl/cu128/torch-${TORCH_VERSION}%2Bcu128-cp312-cp312-win_amd64.whl`,
          sha256: '3a01f0b64c10a82d444d9fd06b3e8c567b1158b76b2764b8f51bfd8f535064b0',
          bytes: 2862033275,
        },
      ],
    },
    comfyui: comfySource(),
    port: COMFY_BACKEND_PORT,
    estimatedBytes: estimate(WIN_RUNTIME[2], [2862033275]),
  },
  {
    id: 'win32-x64-cuda13',
    variant: 'win32-x64-cuda13',
    platform: 'win32',
    arch: 'x64',
    support: 'candidate',
    label: 'Windows · NVIDIA（CUDA 13.0）',
    notes: `候选：新驱动才能用（不低于 ${MIN_NVIDIA_DRIVER_CUDA13}），且本机没验证过。下载体积比 CUDA 12.8 小。`,
    driver: 'nvidia',
    minDriver: MIN_NVIDIA_DRIVER_CUDA13,
    python: pbsRuntime(WIN_RUNTIME[0], WIN_RUNTIME[1], WIN_RUNTIME[2]),
    torch: {
      version: TORCH_VERSION,
      wheels: [
        {
          wheel: `torch-${TORCH_VERSION}+cu130-cp312-cp312-win_amd64.whl`,
          url: `https://download.pytorch.org/whl/cu130/torch-${TORCH_VERSION}%2Bcu130-cp312-cp312-win_amd64.whl`,
          sha256: 'cd3232a562ad2a2699d48130255e1b24c07dfe694a40dcd24fad683c752de121',
          bytes: 1862081240,
        },
      ],
    },
    comfyui: comfySource(),
    port: COMFY_BACKEND_PORT,
    estimatedBytes: estimate(WIN_RUNTIME[2], [1862081240]),
  },
  {
    id: 'win32-x64-amd-directml',
    variant: 'win32-x64-amd-directml',
    platform: 'win32',
    arch: 'x64',
    support: 'candidate',
    label: 'Windows · AMD（DirectML）',
    notes: `候选：这条路必须用 torch-directml，它绑的是 torch 2.4.1 而不是 ${TORCH_VERSION}，较新的模型特性可能用不了；也没有真机验证过。`,
    driver: 'directml',
    minDriver: null,
    python: pbsRuntime(WIN_RUNTIME[0], WIN_RUNTIME[1], WIN_RUNTIME[2]),
    torch: {
      version: '2.4.1',
      wheels: [
        {
          wheel: 'torch-2.4.1-cp312-cp312-win_amd64.whl',
          url: 'https://files.pythonhosted.org/packages/a8/e0/ca8354dfb8d834a76da51b06e8248b70fc182bc163540507919124974bdf/torch-2.4.1-cp312-cp312-win_amd64.whl',
          sha256: 'ebea70ff30544fc021d441ce6b219a88b67524f01170b1c538d7d3ebb5e7f56c',
          bytes: 199387694,
        },
        {
          wheel: 'torchvision-0.19.1-cp312-cp312-win_amd64.whl',
          url: 'https://files.pythonhosted.org/packages/6b/b2/fd577e1622b43cdeb74782a60cea4909f88f471813c215ea7b4e7ea84a74/torchvision-0.19.1-cp312-cp312-win_amd64.whl',
          sha256: 'b4283d283675556bb0eae31d29996f53861b17cbdcdf3509e6bc050414ac9289',
          bytes: 1288328,
        },
        {
          wheel: 'torch_directml-0.2.5.dev240914-cp312-cp312-win_amd64.whl',
          url: 'https://files.pythonhosted.org/packages/71/f2/eb7d3c601310c758f6aef891773e4a00f7388eeb613d536c0d2681fcb105/torch_directml-0.2.5.dev240914-cp312-cp312-win_amd64.whl',
          sha256: 'ea19d11e33e9450b290311c06f7eb10924dd25c555e504d367b7b437d3eb24d0',
          bytes: 8956338,
        },
      ],
    },
    comfyui: comfySource(),
    port: COMFY_BACKEND_PORT,
    estimatedBytes: estimate(WIN_RUNTIME[2], [199387694, 1288328, 8956338]),
  },
  {
    id: 'win32-x64-intel-xpu',
    variant: 'win32-x64-intel-xpu',
    platform: 'win32',
    arch: 'x64',
    support: 'candidate',
    label: 'Windows · Intel（XPU）',
    notes: '候选：上游有 XPU 版 PyTorch，但我们没有 Intel 显卡机器验证过，能不能跑取决于显卡与驱动。',
    driver: 'xpu',
    minDriver: null,
    python: pbsRuntime(WIN_RUNTIME[0], WIN_RUNTIME[1], WIN_RUNTIME[2]),
    torch: {
      version: TORCH_VERSION,
      wheels: [
        {
          wheel: `torch-${TORCH_VERSION}+xpu-cp312-cp312-win_amd64.whl`,
          url: `https://download.pytorch.org/whl/xpu/torch-${TORCH_VERSION}%2Bxpu-cp312-cp312-win_amd64.whl`,
          sha256: 'bee9623254d0f95a1ca115dbd17e9a9d966fdb8ae123e2ada4a9eb2fb8d38db8',
          bytes: 639581369,
        },
      ],
    },
    comfyui: comfySource(),
    port: COMFY_BACKEND_PORT,
    estimatedBytes: estimate(WIN_RUNTIME[2], [639581369]),
  },
  {
    id: 'linux-x64-cuda12',
    variant: 'linux-x64-cuda12',
    platform: 'linux',
    arch: 'x64',
    support: 'candidate',
    label: 'Linux · NVIDIA（CUDA 12.8）',
    notes: `候选：pin 已核对，但没有 Linux 机器真机验证过；需要 NVIDIA 驱动不低于 ${MIN_NVIDIA_DRIVER_CUDA12}。`,
    driver: 'nvidia',
    minDriver: MIN_NVIDIA_DRIVER_CUDA12,
    python: pbsRuntime('x86_64-unknown-linux-gnu-install_only.tar.gz', '5ff9f0602ce964a529ed1e8555d3abab6341926d724402ba9a15e9e877191124', 67908973),
    torch: {
      version: TORCH_VERSION,
      wheels: [
        {
          wheel: `torch-${TORCH_VERSION}+cu128-cp312-cp312-manylinux_2_28_x86_64.whl`,
          url: `https://download.pytorch.org/whl/cu128/torch-${TORCH_VERSION}%2Bcu128-cp312-cp312-manylinux_2_28_x86_64.whl`,
          sha256: '7cb4018f4ce68b61fd3ef87dc1c4ca520731c7b5b200e360ad47b612d7844063',
          bytes: 900881648,
        },
      ],
    },
    comfyui: comfySource(),
    port: COMFY_BACKEND_PORT,
    estimatedBytes: estimate(67908973, [900881648]),
  },
];

/** 矩阵摘要：给界面展示「这台机器能选哪些方案」。 */
export function listComfyBackendTargets(): Array<{
  id: string;
  variant: ComfyBackendVariant;
  platform: string;
  arch: string;
  support: ComfyBackendSupport;
  label: string;
  notes: string;
  driver: ComfyBackendDriverRequirement;
  minDriver: string | null;
  estimatedBytes: number;
  torchVersion: string;
}> {
  return TARGETS.map((target) => ({
    id: target.id,
    variant: target.variant,
    platform: target.platform,
    arch: target.arch,
    support: target.support,
    label: target.label,
    notes: target.notes,
    driver: target.driver,
    minDriver: target.minDriver,
    estimatedBytes: target.estimatedBytes,
    torchVersion: target.torch.version,
  }));
}

/**
 * 平台/架构/方案 → 固定目标。
 *
 * 语义（不猜、不回退）：给了方案就只认那个方案；没给方案时只有「本平台有实测方案」或
 * 「本平台只有一个候选」才自动选，**多个候选必须让用户显式选**（Windows 三种显卡方案
 * 就是这种情况）。
 */
export function resolveComfyBackendTarget(platform: string, arch: string, variant?: string): ComfyBackendTargetResult {
  const samePlatform = TARGETS.filter((target) => target.platform === platform && target.arch === arch);
  if (variant !== undefined && variant !== '') {
    const found = samePlatform.find((target) => target.variant === variant);
    if (found) return { ok: true, target: found };
    return { ok: false, reason: 'unsupported-variant', platform, arch, variant };
  }
  const supported = samePlatform.find((target) => target.support === 'supported');
  if (supported) return { ok: true, target: supported };
  const only = samePlatform[0];
  if (only && samePlatform.length === 1) return { ok: true, target: only };
  if (samePlatform.length > 1) {
    return { ok: false, reason: 'variant-required', platform, arch, options: samePlatform.map((target) => target.variant) };
  }
  return { ok: false, reason: 'unsupported-platform', platform, arch };
}

/** 本机目标（`process.platform` / `process.arch`，可选用户选的方案）。 */
export function resolveLocalComfyBackendTarget(
  platform: string = process.platform,
  arch: string = process.arch,
  variant?: string,
): ComfyBackendTargetResult {
  return resolveComfyBackendTarget(platform, arch, variant);
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
  | 'start-timeout'
  | 'driver-unsatisfied'
  | 'variant-required';

export const COMFY_BACKEND_FAILURES: readonly ComfyBackendFailure[] = [
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
];

/** 已装 pin 与当前目标 pin 是否一致（不一致 = 需要更新）。 */
export function versionMatches(
  ready: { comfyui?: { commit?: string }; python?: string; torch?: string; variant?: string } | null,
  target: ComfyBackendTarget,
): boolean {
  if (!ready) return false;
  // 换方案也算「不一致」：装了 cuda12 又切到 cuda13，必须重装而不是继续用旧的。
  if (ready.variant !== undefined && ready.variant !== target.variant) return false;
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
