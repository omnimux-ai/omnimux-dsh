/**
 * 托管后端的用户设置（Issue #3717 M3）：安装根与「已有模型目录」。
 *
 * 默认值不变（安装根 = 插件数据目录下的 comfyui-backend，模型目录为空）。用户改过之后
 * 写 `<dataRoot>/comfyui-backend/settings.json`。校验是纯函数，落盘与探测在 service 里接。
 */

import { isAbsolute, join, normalize } from 'node:path';

export interface ComfyBackendSettings {
  /** 用户选的安装根；空 = 默认（插件数据目录）。 */
  installRoot: string;
  /** 用户已有的模型目录；空 = 不使用外部模型目录。 */
  modelsPath: string;
  /** 用户选的方案（`plan.ts` 的 variant）；空 = 按本机解析（多候选时必须显式选）。 */
  variant: string;
}

export const EMPTY_SETTINGS: ComfyBackendSettings = { installRoot: '', modelsPath: '', variant: '' };

export type SettingsValidationCode =
  | 'not-absolute'
  | 'not-found'
  | 'not-a-directory'
  | 'not-writable'
  | 'same-as-install-root';

export interface SettingsValidation {
  ok: boolean;
  code: SettingsValidationCode | null;
  /** 规范化后的路径（通过校验时可用）。 */
  path: string;
}

export interface ValidateInput {
  path: string;
  exists: boolean;
  isDirectory: boolean;
  writable: boolean;
  /** 模型目录校验时用于拒绝「模型目录就是安装根」这种无意义配置。 */
  installRoot?: string;
}

/** 校验用户填的目录：必须绝对路径、存在、是目录、可写。 */
export function validateDirectory(input: ValidateInput): SettingsValidation {
  const raw = input.path.trim();
  if (raw === '') return { ok: false, code: 'not-found', path: '' };
  if (!isAbsolute(raw)) return { ok: false, code: 'not-absolute', path: raw };
  const path = normalize(raw);
  if (input.installRoot && normalize(input.installRoot) === path) {
    return { ok: false, code: 'same-as-install-root', path };
  }
  if (!input.exists) return { ok: false, code: 'not-found', path };
  if (!input.isDirectory) return { ok: false, code: 'not-a-directory', path };
  if (!input.writable) return { ok: false, code: 'not-writable', path };
  return { ok: true, code: null, path };
}

/** 读设置：文件缺失/损坏都回落到默认值（默认行为不因坏文件而变）。 */
export function parseSettings(text: string | null): ComfyBackendSettings {
  if (!text) return { ...EMPTY_SETTINGS };
  try {
    const parsed = JSON.parse(text) as Partial<ComfyBackendSettings>;
    return {
      installRoot: typeof parsed.installRoot === 'string' ? parsed.installRoot : '',
      modelsPath: typeof parsed.modelsPath === 'string' ? parsed.modelsPath : '',
      variant: typeof parsed.variant === 'string' ? parsed.variant : '',
    };
  } catch {
    return { ...EMPTY_SETTINGS };
  }
}

/** 实际安装根：用户设置优先，否则默认 `<dataRoot>/comfyui-backend`。 */
export function resolveInstallRoot(dataRoot: string, settings: ComfyBackendSettings): string {
  const custom = settings.installRoot.trim();
  if (custom === '') return join(dataRoot, 'comfyui-backend');
  return normalize(custom);
}

/**
 * ComfyUI 的 `--extra-model-paths-config` 文件内容：只指向用户的模型目录，不复制文件。
 * 结构按 ComfyUI 的 extra_model_paths.yaml 约定（`<name>: base_path: <dir>`）。
 */
export function modelsConfigYaml(modelsPath: string): string {
  const path = modelsPath.trim();
  if (path === '') return '';
  return `# 由 OmniMux 托管后端生成：复用用户已有的模型目录（不复制、不移动）\nlocal_models:\n    base_path: ${path}\n`;
}
