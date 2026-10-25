/**
 * 驱动判定（Issue #3726 M4，纯函数 + 注入探测）。
 *
 * 原则：**不知道就说不知道**。探测不到（没有 nvidia-smi、没有 DirectML 运行时、不是
 * 目标平台）一律 `unknown`——不阻断安装，但也绝不当成「通过」。mac arm64 用 MPS，结论是
 * `not-required`（明确说出来，而不是沉默）。
 */

import type { ComfyBackendTarget } from './plan.ts';

export type DriverStatus = 'satisfied' | 'unsatisfied' | 'unknown' | 'not-required';

export interface DriverVerdict {
  status: DriverStatus;
  /** 人话说明（给界面直接显示）。 */
  detail: string;
  /** 该方案要求的驱动下限（没有下限时为 null）。 */
  required: string | null;
}

export interface DriverProbe {
  /** NVIDIA 驱动版本（如 "581.15"）；探测不到返回 null。 */
  nvidiaDriverVersion?: () => Promise<string | null>;
  /** DirectML 运行时是否可用；探测不到返回 null。 */
  directmlAvailable?: () => Promise<boolean | null>;
  /** Intel XPU 运行时是否可用；探测不到返回 null。 */
  xpuAvailable?: () => Promise<boolean | null>;
}

/** 版本号比较：只比数字段（"581.15" vs "580.0"），缺失段按 0。 */
export function compareVersions(left: string, right: string): number {
  const a = left.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const b = right.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export async function checkDriver(target: ComfyBackendTarget, probe: DriverProbe = {}): Promise<DriverVerdict> {
  if (target.driver === 'none') {
    return { status: 'not-required', detail: '本机不需要额外驱动', required: null };
  }
  if (target.driver === 'nvidia') {
    const required = target.minDriver;
    const version = probe.nvidiaDriverVersion ? await probe.nvidiaDriverVersion() : null;
    if (version === null || version === '') {
      return { status: 'unknown', detail: '查不到 NVIDIA 驱动版本', required };
    }
    if (required !== null && compareVersions(version, required) < 0) {
      return { status: 'unsatisfied', detail: `NVIDIA 驱动 ${version} 低于该方案要求的 ${required}`, required };
    }
    return { status: 'satisfied', detail: `NVIDIA 驱动 ${version} 满足要求`, required };
  }
  if (target.driver === 'directml') {
    const available = probe.directmlAvailable ? await probe.directmlAvailable() : null;
    if (available === null) return { status: 'unknown', detail: '查不到 DirectML 运行时', required: null };
    return available
      ? { status: 'satisfied', detail: 'DirectML 运行时可用', required: null }
      : { status: 'unsatisfied', detail: '没有检测到 DirectML 运行时', required: null };
  }
  // xpu
  const xpu = probe.xpuAvailable ? await probe.xpuAvailable() : null;
  if (xpu === null) return { status: 'unknown', detail: '查不到 Intel XPU 运行时', required: null };
  return xpu
    ? { status: 'satisfied', detail: 'Intel XPU 运行时可用', required: null }
    : { status: 'unsatisfied', detail: '没有检测到 Intel XPU 运行时', required: null };
}
