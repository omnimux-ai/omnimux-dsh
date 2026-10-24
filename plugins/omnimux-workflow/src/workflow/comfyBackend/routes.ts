/**
 * ComfyUI 托管后端的 HTTP 路由（Issue #3690 M2a 路由 / #3701 M2c 界面）。
 *
 * 挂进既有 workflow dispatcher（同一 `/omnimux-workflow` 前缀，不二次 register），
 * 因此写请求自动继承 dispatcher 的本地来源校验。路径来自 `src/shared/api.ts` 的
 * 单点真源（前端与宿主同一份）。
 *
 * 端点：
 *   GET  .../comfy-backend/state          → { status }
 *   POST .../comfy-backend/install        → 202 { status }
 *   POST .../comfy-backend/start          → { status }
 *   POST .../comfy-backend/stop           → { status }
 *   GET  .../comfy-backend/log?lines=200  → { lines: string[] }
 */

import { readFileSync } from 'node:fs';

import { WORKFLOW_API_ROUTES } from '../../shared/api.ts';
import { estimateRequiredBytes } from './preflight.ts';
import { listComfyBackendTargets } from './plan.ts';
import type { ComfyBackendService } from './service.ts';

export const COMFY_BACKEND_ROUTE_PREFIX = '/omnimux-workflow/api/comfy-backend';
export const COMFY_BACKEND_LOG_DEFAULT_LINES = 200;
export const COMFY_BACKEND_LOG_MAX_LINES = 2000;

export interface ComfyBackendDispatchRequest {
  method?: string;
  url?: string;
  body?: unknown;
}

type RouteResult = { status: number; body: unknown };

/** `?lines=` 解析：非法/缺省给默认值，超过上限夹到上限（不报错、不放任）。 */
export function parseLogLines(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return COMFY_BACKEND_LOG_DEFAULT_LINES;
  return Math.min(Math.floor(parsed), COMFY_BACKEND_LOG_MAX_LINES);
}

/** 取日志文件尾部 N 行；文件不存在返回空数组（还没装过不是错误）。 */
export function readLogTail(path: string, lines: number): string[] {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const all = text.split('\n');
  if (all.length > 0 && all[all.length - 1] === '') all.pop();
  return all.slice(Math.max(0, all.length - lines));
}

export function createComfyBackendRoutes(service: ComfyBackendService): {
  tryHandle: (method: string, path: string, req: ComfyBackendDispatchRequest) => Promise<RouteResult | null>;
} {
  const tryHandle = async (method: string, path: string, req: ComfyBackendDispatchRequest): Promise<RouteResult | null> => {
    if (path === WORKFLOW_API_ROUTES.comfyBackendState && method === 'GET') {
      // 状态里额外给「装之前要多少空间」和「本机需不需要额外驱动」——都是纯计算，
      // 不在这里做磁盘/端口探测（那是安装/启动动作时的事，避免每次轮询都探一遍）。
      // 只读一次状态（一次 status() 会读状态文件并可能探测后端，别读两遍）。
      const status = await service.status();
      const target = service.currentTarget();
      const driver = await service.driverVerdict();
      const problem = service.targetProblem();
      return {
        status: 200,
        body: {
          status,
          settings: service.settings(),
          requiredBytes: target ? estimateRequiredBytes(target) : 0,
          driver: driver.status,
          driverDetail: driver.detail,
          driverRequired: driver.required,
          variant: target ? target.variant : null,
          support: target ? target.support : null,
          targetProblem: problem ? problem.reason : null,
          targetOptions: problem && problem.options ? problem.options : [],
          variants: listComfyBackendTargets(),
        },
      };
    }
    if (path === WORKFLOW_API_ROUTES.comfyBackendSettings && method === 'GET') {
      return { status: 200, body: { settings: service.settings() } };
    }
    if (path === WORKFLOW_API_ROUTES.comfyBackendSettings && method === 'POST') {
      const body = (req.body ?? {}) as { installRoot?: unknown; modelsPath?: unknown; variant?: unknown };
      const patch: { installRoot?: string; modelsPath?: string; variant?: string } = {};
      if (typeof body.installRoot === 'string') patch.installRoot = body.installRoot;
      if (typeof body.modelsPath === 'string') patch.modelsPath = body.modelsPath;
      if (typeof body.variant === 'string') patch.variant = body.variant;
      const result = service.updateSettings(patch);
      return { status: result.ok ? 200 : 400, body: result };
    }
    if (path === WORKFLOW_API_ROUTES.comfyBackendInstall && method === 'POST') {
      return { status: 202, body: { status: await service.install() } };
    }
    if (path === WORKFLOW_API_ROUTES.comfyBackendStart && method === 'POST') {
      return { status: 200, body: { status: await service.start() } };
    }
    if (path === WORKFLOW_API_ROUTES.comfyBackendStop && method === 'POST') {
      return { status: 200, body: { status: await service.stop() } };
    }
    if (path === `${COMFY_BACKEND_ROUTE_PREFIX}/log` && method === 'GET') {
      const query = typeof req.url === 'string' ? req.url.split('?')[1] ?? '' : '';
      const lines = parseLogLines(new URLSearchParams(query).get('lines'));
      return { status: 200, body: { lines: readLogTail(service.paths.log, lines) } };
    }
    return null;
  };
  return { tryHandle };
}
