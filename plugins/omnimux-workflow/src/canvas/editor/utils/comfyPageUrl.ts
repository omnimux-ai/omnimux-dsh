/**
 * ComfyUI 页面节点用到的地址归一化（纯函数，Issue #3681 M1）。
 *
 * 页面型节点只认 http/https：用户可能只写 `127.0.0.1:8188`，所以缺协议时补
 * `http://`；尾部斜杠去掉，避免同一地址在节点数据里出现两种写法。
 */

/** ComfyUI 官方默认端口，新用户基线用这个值（不是本机 dev 端口）。 */
export const DEFAULT_COMFY_PAGE_URL = 'http://127.0.0.1:8188';

/** 连通探测的超时上限：超时按「不可达」处理，不无限转圈。 */
export const COMFY_PAGE_PROBE_TIMEOUT_MS = 4000;

export type ComfyPageUrlReason = 'empty' | 'scheme' | 'invalid';

export type ComfyPageUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: ComfyPageUrlReason };

/**
 * 归一化用户输入的地址。永不抛出：任何畸形输入都返回 `{ ok: false, reason }`。
 */
export function normalizeComfyPageUrl(input: unknown): ComfyPageUrlResult {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (raw.length === 0) return { ok: false, reason: 'empty' };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'scheme' };
  }
  if (parsed.hostname.length === 0) return { ok: false, reason: 'invalid' };
  const path = parsed.pathname.replace(/\/+$/, '');
  return { ok: true, url: `${parsed.protocol}//${parsed.host}${path}${parsed.search}` };
}

/**
 * 从节点数据里取地址：非法/缺失时回退到默认地址，保证节点卡永远有东西可显示。
 */
export function comfyPageUrlFromData(data: Record<string, unknown> | undefined): string {
  const normalized = normalizeComfyPageUrl(data?.url);
  return normalized.ok ? normalized.url : DEFAULT_COMFY_PAGE_URL;
}
