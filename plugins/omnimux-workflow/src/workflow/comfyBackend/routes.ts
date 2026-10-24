/**
 * ComfyUI 托管后端的 HTTP 路由（Issue #3690 M2a）。
 *
 * 挂进既有 workflow dispatcher（同一 `/omnimux-workflow` 前缀，不二次 register），
 * 因此写请求自动继承 dispatcher 的本地来源校验。
 *
 * 端点：
 *   GET  /omnimux-workflow/api/comfy-backend/state   → { status }
 *   POST /omnimux-workflow/api/comfy-backend/install → 202 { status }
 *   POST /omnimux-workflow/api/comfy-backend/start   → { status }
 *   POST /omnimux-workflow/api/comfy-backend/stop    → { status }
 */

import type { ComfyBackendService } from './service.ts';

export const COMFY_BACKEND_ROUTE_PREFIX = '/omnimux-workflow/api/comfy-backend';

export interface ComfyBackendDispatchRequest {
  method?: string;
  url?: string;
}

type RouteResult = { status: number; body: unknown };

export function createComfyBackendRoutes(service: ComfyBackendService): {
  tryHandle: (method: string, path: string, req: ComfyBackendDispatchRequest) => Promise<RouteResult | null>;
} {
  const tryHandle = async (method: string, path: string): Promise<RouteResult | null> => {
    if (path === `${COMFY_BACKEND_ROUTE_PREFIX}/state` && method === 'GET') {
      return { status: 200, body: { status: await service.status() } };
    }
    if (path === `${COMFY_BACKEND_ROUTE_PREFIX}/install` && method === 'POST') {
      return { status: 202, body: { status: await service.install() } };
    }
    if (path === `${COMFY_BACKEND_ROUTE_PREFIX}/start` && method === 'POST') {
      return { status: 200, body: { status: await service.start() } };
    }
    if (path === `${COMFY_BACKEND_ROUTE_PREFIX}/stop` && method === 'POST') {
      return { status: 200, body: { status: await service.stop() } };
    }
    return null;
  };
  return { tryHandle };
}
