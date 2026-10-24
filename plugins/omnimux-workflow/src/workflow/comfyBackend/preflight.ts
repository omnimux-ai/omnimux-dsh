/**
 * 托管后端的安装前预检（Issue #3717 M3，纯函数）。
 *
 * 目的：把「为什么装不上」在**开始下载之前**说清楚——平台不支持、目录不可写、磁盘不够、
 * 端口被别的程序占着。全部输入都是注入的（可用空间、端口状态、可写性），因此可离线单测，
 * 真实文件系统与网络只在 `service.ts` 里接。
 */

import { COMFY_BACKEND_FAILURES, COMFY_BACKEND_PORT, type ComfyBackendFailure, type ComfyBackendTarget } from './plan.ts';

// 失败码的真源在 plan.ts（避免与 preflight 互相 import）；这里转出去方便调用方一处取。
export { COMFY_BACKEND_FAILURES };
export type { ComfyBackendFailure };

/**
 * 安装所需的磁盘空间（保守值）：下载体积 + 解压后的运行时 + venv 依赖 + 余量。
 * 实测 mac arm64：安装根（含下载缓存）≈668MB、venv ≈1.9GB，所以取「下载体积 ×3 + 2.5GB」。
 */
export function estimateRequiredBytes(target: ComfyBackendTarget): number {
  const download = target.estimatedBytes;
  return download * 3 + 2_500_000_000;
}

export type DriverStatus = 'not-required' | 'unknown' | 'unsupported';

/**
 * 驱动判定：mac arm64 用 MPS，**不需要**额外驱动；其它平台在 M4 落地前一律 `unknown`
 * （不阻断，但也不假装检查过）。
 */
export function checkDriver(target: ComfyBackendTarget): DriverStatus {
  if (target.platform === 'darwin' && target.arch === 'arm64') return 'not-required';
  return 'unknown';
}

export interface PreflightInput {
  /** 平台目标（不支持时传 null）。 */
  target: ComfyBackendTarget | null;
  /** 安装根是否可写（不存在时按可创建判断）。 */
  writable: boolean;
  /** 安装根所在卷的可用字节；未知传 null。 */
  freeBytes: number | null;
  /** 端口是否空闲（true = 没人占）。 */
  portFree: boolean;
  /** 端口占用者是不是我们自己的 ComfyUI（true 时不算失败）。 */
  portOwnedByBackend?: boolean;
  /** 覆盖需求体积（测试用）。 */
  requiredBytes?: number;
}

export interface PreflightResult {
  ok: boolean;
  failures: ComfyBackendFailure[];
  requiredBytes: number;
  freeBytes: number | null;
  driver: DriverStatus;
  /** 端口：占用者是我们自己的后端时为 true（不算失败）。 */
  backendAlreadyRunning: boolean;
}

export function runPreflight(input: PreflightInput): PreflightResult {
  const failures: ComfyBackendFailure[] = [];
  const driver: DriverStatus = input.target ? checkDriver(input.target) : 'unsupported';
  const requiredBytes = input.target
    ? input.requiredBytes ?? estimateRequiredBytes(input.target)
    : 0;

  if (!input.target) failures.push('unsupported-platform');
  if (!input.writable) failures.push('install-dir-not-writable');
  if (input.freeBytes !== null && input.target && input.freeBytes < requiredBytes) {
    failures.push('insufficient-disk');
  }
  const backendAlreadyRunning = input.portFree === false && input.portOwnedByBackend === true;
  if (input.portFree === false && !backendAlreadyRunning) failures.push('port-occupied');

  return { ok: failures.length === 0, failures, requiredBytes, freeBytes: input.freeBytes, driver, backendAlreadyRunning };
}

/** 失败码 → 界面文案键（画布侧按此取词，避免前后端各写一套字符串）。 */
export function failureMessageKey(failure: ComfyBackendFailure): string {
  return `comfyPage.failure.${failure}`;
}

/** 失败码 → 建议的下一步动作。 */
export function failureAction(failure: ComfyBackendFailure): 'retry-install' | 'retry-start' | 'choose-dir' | 'update' | 'none' {
  if (failure === 'insufficient-disk' || failure === 'install-dir-not-writable') return 'choose-dir';
  if (failure === 'version-mismatch') return 'update';
  if (failure === 'start-timeout') return 'retry-start';
  if (failure === 'install-failed' || failure === 'port-occupied') return 'retry-install';
  return 'none';
}

export const PREFLIGHT_PORT = COMFY_BACKEND_PORT;

/** ComfyUI 启动参数（纯函数，便于单测「模型目录到底有没有带上」）。 */
export function launchArgs(input: {
  mainPy: string;
  port: number;
  baseDirectory: string;
  modelsConfigFile?: string;
}): string[] {
  const args = [
    input.mainPy,
    '--port', String(input.port),
    '--base-directory', input.baseDirectory,
    '--enable-cors-header', '*',
  ];
  if (input.modelsConfigFile !== undefined && input.modelsConfigFile !== '') {
    args.push('--extra-model-paths-config', input.modelsConfigFile);
  }
  return args;
}
