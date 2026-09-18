/**
 * plugins/omnimux-apps/src/host/routes.ts
 *
 * HTTP API Routes for omnimux-apps:
 * - POST /omnimux-apps/api/apps/:appId/executions (launch headless execution)
 * - GET /omnimux-apps/api/apps/:appId/executions/:executionId (poll status & outputs)
 * - POST /omnimux-apps/api/apps/:appId/executions/:executionId/cancel (cancel execution)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OmnimuxAppsService } from './index.ts';
import type { HeadlessExecutionSeam } from './executionBridge.ts';

const PREFIX = '/omnimux-apps/api/apps';
const EXECUTION_POST_RE = new RegExp(`^${PREFIX}/([^/]+)/executions$`);
const EXECUTION_ITEM_RE = new RegExp(`^${PREFIX}/([^/]+)/executions/([^/]+)$`);
const EXECUTION_CANCEL_RE = new RegExp(`^${PREFIX}/([^/]+)/executions/([^/]+)/cancel$`);

function loadBuiltinApps(): any[] {
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidatePaths = [
      path.resolve(currentDir, '../../catalog/builtin-apps.json'),
      path.resolve(currentDir, '../../../catalog/builtin-apps.json'),
      path.resolve(process.cwd(), 'plugins/omnimux-apps/catalog/builtin-apps.json'),
      path.resolve(process.cwd(), 'catalog/builtin-apps.json'),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      }
    }
  } catch {}
  return [];
}

export function createAppsRoutes(deps: {
  service: OmnimuxAppsService;
  getHeadlessSeam: () => HeadlessExecutionSeam | null;
}) {
  const { service, getHeadlessSeam } = deps;

  return {
    async handle(req: any, res: any): Promise<boolean> {
      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname;
      if (!pathname.startsWith(PREFIX)) return false;

      const method = (req.method || 'GET').toUpperCase();

      const sendJson = (status: number, body: unknown) => {
        res.writeHead(status, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(body));
      };

      const readBody = async (): Promise<any> => {
        if (req.body && typeof req.body === 'object') return req.body;
        return new Promise((resolve) => {
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            try {
              const str = Buffer.concat(chunks).toString('utf-8');
              resolve(str ? JSON.parse(str) : {});
            } catch {
              resolve({});
            }
          });
          req.on('error', () => resolve({}));
        });
      };

      // 1. POST /omnimux-apps/api/apps/:appId/executions
      const postMatch = EXECUTION_POST_RE.exec(pathname);
      if (postMatch && method === 'POST') {
        const appId = decodeURIComponent(postMatch[1] || '');
        const body = await readBody();
        const inputs = body.inputs || {};

        let manifest = await service.getManifest(appId, body.version);
        if (!manifest) {
          const builtins = loadBuiltinApps();
          manifest = builtins.find((a) => a.appId === appId) || null;
        }

        if (!manifest) {
          sendJson(404, {
            error: 'app_not_found',
            message: `应用 ${appId} 未找到`,
          });
          return true;
        }

        const headlessSeam = getHeadlessSeam();
        if (!headlessSeam) {
          sendJson(503, {
            error: 'seam_unavailable',
            message: '后台工作流执行通道尚未就绪',
          });
          return true;
        }

        try {
          const result = await service.executeApp(manifest, inputs, headlessSeam);
          sendJson(200, result);
        } catch (err: any) {
          sendJson(500, {
            error: 'execution_failed',
            message: err?.message || '任务启动失败',
          });
        }
        return true;
      }

      // 2. POST /omnimux-apps/api/apps/:appId/executions/:executionId/cancel
      const cancelMatch = EXECUTION_CANCEL_RE.exec(pathname);
      if (cancelMatch && method === 'POST') {
        const executionId = decodeURIComponent(cancelMatch[2] || '');
        const headlessSeam = getHeadlessSeam();
        if (!headlessSeam) {
          sendJson(503, { error: 'seam_unavailable', message: '后台工作流执行通道尚未就绪' });
          return true;
        }
        try {
          const result = await service.cancelJob(executionId, headlessSeam);
          sendJson(200, result);
        } catch (err: any) {
          sendJson(500, { error: 'cancel_failed', message: err?.message || '取消任务失败' });
        }
        return true;
      }

      // 3. GET /omnimux-apps/api/apps/:appId/executions/:executionId
      const itemMatch = EXECUTION_ITEM_RE.exec(pathname);
      if (itemMatch && method === 'GET') {
        const executionId = decodeURIComponent(itemMatch[2] || '');
        const headlessSeam = getHeadlessSeam();
        if (!headlessSeam) {
          sendJson(503, { error: 'seam_unavailable', message: '后台工作流执行通道尚未就绪' });
          return true;
        }
        try {
          const jobStatus = await service.getJobStatus(executionId, headlessSeam);
          if (!jobStatus) {
            sendJson(404, { error: 'execution_not_found', message: `未找到执行记录 ${executionId}` });
            return true;
          }
          sendJson(200, jobStatus);
        } catch (err: any) {
          sendJson(500, { error: 'query_failed', message: err?.message || '查询任务状态失败' });
        }
        return true;
      }

      return false;
    },
  };
}

export function registerAppsApiRoutes(
  webServer: any,
  deps: {
    service: OmnimuxAppsService;
    getHeadlessSeam: () => HeadlessExecutionSeam | null;
  },
): () => void {
  if (!webServer || typeof webServer.register !== 'function') {
    return () => {};
  }
  const router = createAppsRoutes(deps);
  return webServer.register({
    kind: 'prefix',
    path: PREFIX,
    async handler(req: any, res: any) {
      const handled = await router.handle(req, res);
      if (!handled && !res.writableEnded) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not_found', message: 'Not Found' }));
      }
    },
  });
}
