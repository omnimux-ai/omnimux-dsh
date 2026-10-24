/**
 * ComfyUI 工作流节点用到的地址归一化（纯函数，Issue #3681 M1）。
 *
 * 页面型节点只认 http/https：用户可能只写 `127.0.0.1:8188`，所以缺协议时补
 * `http://`；尾部斜杠去掉，避免同一地址在节点数据里出现两种写法。
 */

/**
 * 节点默认地址：本插件托管后端的固定入口（Issue #3701 M2c）。
 *
 * 主机名用 `localhost` 而不是 `127.0.0.1`：DSH 的 `dsh-auth` cookie 是 host-only 绑在
 * `127.0.0.1` 上的，画布 iframe 请求 `127.0.0.1:18188` 会带上它，撞爆 ComfyUI 的
 * 8190 字节请求头上限（M2a 实测）；`localhost` 属于不同 host，不带该 cookie。
 *
 * 与宿主 `COMFY_BACKEND_BASE_URL`（`workflow/comfyBackend/plan.ts`）必须一致，
 * 由 `comfyPageUrl.test.mjs` 锁住，避免两处默认值漂移。用户自装的 8188 仍可手填。
 */
export const DEFAULT_COMFY_PAGE_URL = 'http://localhost:18188';

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
